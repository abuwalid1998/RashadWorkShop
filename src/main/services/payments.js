'use strict';
const { AppError, notFound } = require('../core/errors');
const { createValidator } = require('../core/validate');
const { allocatePayment, openBalance } = require('../core/allocation');
const { toCents, fromCents } = require('../core/money');
const { today, withCurrentTime, now } = require('../core/dates');
const { vehicleKey, nameKey, likeContains } = require('../core/normalize');
const { SOURCES } = require('../db/schema');

const CASH_KINDS = "('payment', 'opening')";

function createPaymentsService(db) {
  const nextReceiptNo = () => db.get('SELECT COALESCE(MAX(receipt_no), 0) + 1 AS n FROM payments').n;

  /** Move an item's stored amounts; `cash` and `discount` may be negative to reverse. */
  function applyToItem(source, id, cash, discount) {
    const spec = SOURCES[source];
    db.run(
      `UPDATE ${spec.table}
          SET payment_amount = ROUND(payment_amount + ?, 2),
              remaining_amount = ROUND(remaining_amount - ?, 2)
        WHERE ${spec.id} = ?`,
      cash, fromCents(toCents(cash) + toCents(discount)), id);
  }

  /**
   * Write one receipt: ledger rows plus the matching change on each item.
   * Callers run inside a transaction.
   */
  function record({ lines, paidAt, note = '', settlementId = null }) {
    const receiptNo = nextReceiptNo();
    const stamp = now();
    const insert = `INSERT INTO payments (receipt_no, source, ref_id, kind, amount, paid_at, note, settlement_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    for (const line of lines) {
      if (line.cash > 0) db.run(insert, receiptNo, line.source, line.id, 'payment', line.cash, paidAt, note, settlementId, stamp);
      if (line.discount > 0) db.run(insert, receiptNo, line.source, line.id, 'discount', line.discount, paidAt, note, settlementId, stamp);
      applyToItem(line.source, line.id, line.cash, line.discount);
    }
    return receiptNo;
  }

  /** Unpaid items of an account, oldest first, optionally narrowed. */
  function openItems(accountKey, { vehicle = '', target = null } = {}) {
    const where = ['account_key = ?', 'remaining > 0.004'];
    const params = [accountKey];
    if (vehicle) {
      where.push('vehicle_key = ?');
      params.push(vehicleKey(vehicle));
    }
    if (target) {
      where.push('source = ? AND id = ?');
      params.push(target.source, Number(target.id));
    }
    return db.all(
      `SELECT source, id, customer_name, vehicle_id, total, paid, remaining, date
         FROM account_items WHERE ${where.join(' AND ')} ORDER BY date ASC, id ASC`, ...params);
  }

  /**
   * Take a payment on an account.
   *
   * @param {object} input
   * @param {string} input.accountKey
   * @param {string} [input.vehicle]  limit to one vehicle of the account
   * @param {{source: string, id: number}} [input.target]  pay one specific item
   * @param {number|string} input.amount
   * @param {boolean} [input.settle]  close the account: the unpaid rest becomes a discount
   * @returns {{ receiptNo: number, settlementId: number|null, cash: number, discount: number }}
   */
  function create(input) {
    const v = createValidator(input);
    const accountKey = String(input?.accountKey ?? '');
    const vehicle = String(input?.vehicle ?? '');
    const target = input?.target && SOURCES[input.target.source] ? input.target : null;
    const settle = Boolean(input?.settle);
    const amount = v.amount('amount', { required: !settle, label: 'المبلغ' });
    const day = v.date('date', { fallback: today(), label: 'تاريخ الدفع' });
    const note = v.text('note', { max: 300, label: 'الملاحظة' });

    return db.transaction(() => {
      const items = openItems(accountKey, { vehicle, target });
      const due = openBalance(items);
      if (!items.length) throw new AppError('لا يوجد مبلغ مستحق على هذا الحساب', { code: 'nothing_due' });
      if (!settle && amount <= 0) v.fail('amount', 'أدخل مبلغاً أكبر من صفر');
      if (toCents(amount) > toCents(due)) {
        v.fail('amount', `المبلغ أكبر من المستحق (${due})`);
      }
      v.done();

      const result = allocatePayment(items, amount, { settle });
      const paidAt = withCurrentTime(day);

      // The account (or the chosen vehicle) is settled when nothing stays open.
      const scope = openItems(accountKey, { vehicle });
      const scopeDue = openBalance(scope);
      const clears = toCents(result.cash) + toCents(result.discount) === toCents(scopeDue);

      let settlementId = null;
      if (settle || clears) {
        const touched = new Map(result.lines.map((l) => [`${l.source}:${l.id}`, l]));
        const snapshot = items
          .filter((item) => touched.has(`${item.source}:${item.id}`))
          .map((item) => {
            const line = touched.get(`${item.source}:${item.id}`);
            return {
              source: item.source, id: item.id, date: item.date, vehicle_id: item.vehicle_id,
              total: item.total, due: item.remaining, cash: line.cash, discount: line.discount,
            };
          });
        settlementId = db.run(
          `INSERT INTO settlements (account_key, customer_name, vehicle_id, settled_at, balance_before,
             amount_paid, discount, note, items_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          accountKey, items[items.length - 1].customer_name, vehicle || null, paidAt, due,
          result.cash, result.discount, note, JSON.stringify(snapshot), now()).lastInsertRowid;
      }

      const receiptNo = record({ lines: result.lines, paidAt, note, settlementId });
      return { receiptNo, settlementId, cash: result.cash, discount: result.discount };
    });
  }

  /** Delete a whole receipt, giving the money back to the items it paid. */
  function removeReceipt(receiptNo) {
    const rows = db.all('SELECT * FROM payments WHERE receipt_no = ?', Number(receiptNo));
    if (!rows.length) throw notFound('سند الدفع');
    if (rows.some((r) => r.kind === 'adjust')) {
      throw new AppError('لا يمكن حذف قيد تسوية الرصيد المرحّل من النظام السابق', { code: 'locked' });
    }
    return db.transaction(() => {
      const settlementIds = [...new Set(rows.map((r) => r.settlement_id).filter(Boolean))];
      const settlements = settlementIds
        .map((id) => db.get('SELECT * FROM settlements WHERE id = ?', id))
        .filter(Boolean);
      const { lastInsertRowid: trashId } = db.run(
        'INSERT INTO trash (kind, payload, deleted_at) VALUES (?, ?, ?)',
        'receipt', JSON.stringify({ payments: rows, settlements }), now());
      for (const row of rows) {
        const isCash = row.kind === 'payment' || row.kind === 'opening';
        applyToItem(row.source, row.ref_id, isCash ? -row.amount : 0, isCash ? 0 : -row.amount);
      }
      db.run('DELETE FROM payments WHERE receipt_no = ?', Number(receiptNo));
      for (const id of settlementIds) db.run('DELETE FROM settlements WHERE id = ?', id);
      return { trashId };
    });
  }

  /** Receipts, newest first: one entry per receipt with its totals. */
  function list({ query = '', kind = 'all', limit = 60, offset = 0 } = {}) {
    const where = ["p.kind <> 'adjust'"];
    const params = [];
    const term = String(query).trim();
    if (term) {
      where.push(`(i.account_key LIKE ? ESCAPE '\\' OR i.vehicle_key LIKE ? ESCAPE '\\' OR p.receipt_no = ?)`);
      params.push(likeContains(nameKey(term)), likeContains(vehicleKey(term) || term),
        /^#?\d+$/.test(term) ? Number(term.replace('#', '')) : -1);
    }
    const having = kind === 'settlement' ? 'HAVING MAX(p.settlement_id) IS NOT NULL'
      : kind === 'opening' ? "HAVING SUM(p.kind = 'opening') > 0"
        : kind === 'payment' ? "HAVING SUM(p.kind = 'opening') = 0" : '';
    const grouped = `
      SELECT p.receipt_no, MAX(p.paid_at) AS paid_at, MAX(p.note) AS note,
             MAX(p.settlement_id) AS settlement_id,
             SUM(CASE WHEN p.kind IN ${CASH_KINDS} THEN p.amount ELSE 0 END) AS cash,
             SUM(CASE WHEN p.kind = 'discount' THEN p.amount ELSE 0 END) AS discount,
             MAX(p.kind = 'opening') AS is_opening,
             COUNT(DISTINCT p.source || ':' || p.ref_id) AS item_count,
             MAX(i.customer_name) AS customer_name, MAX(i.account_key) AS account_key,
             group_concat(DISTINCT i.vehicle_id) AS vehicles
        FROM payments p
        LEFT JOIN account_items i ON i.source = p.source AND i.id = p.ref_id
       WHERE ${where.join(' AND ')}
       GROUP BY p.receipt_no ${having}`;
    const rows = db.all(
      `${grouped} ORDER BY paid_at DESC, receipt_no DESC LIMIT ? OFFSET ?`,
      ...params, Math.min(Number(limit) || 60, 500), Number(offset) || 0);
    const summary = db.get(
      `SELECT COUNT(*) AS count, COALESCE(SUM(cash), 0) AS cash, COALESCE(SUM(discount), 0) AS discount
         FROM (${grouped})`, ...params);
    return {
      rows,
      count: summary.count,
      cash: fromCents(toCents(summary.cash)),
      discount: fromCents(toCents(summary.discount)),
    };
  }

  function getSettlement(id) {
    const row = db.get('SELECT * FROM settlements WHERE id = ?', Number(id));
    if (!row) throw notFound('التسوية');
    const receipt = db.get('SELECT MIN(receipt_no) AS n FROM payments WHERE settlement_id = ?', row.id);
    return { ...row, items: JSON.parse(row.items_json || '[]'), receipt_no: receipt?.n ?? null };
  }

  function listSettlements(accountKey) {
    return db.all('SELECT * FROM settlements WHERE account_key = ? ORDER BY settled_at DESC, id DESC', accountKey)
      .map((row) => ({ ...row, items: JSON.parse(row.items_json || '[]') }));
  }

  return { record, create, removeReceipt, list, openItems, getSettlement, listSettlements };
}

module.exports = { createPaymentsService };
