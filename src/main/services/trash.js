'use strict';
const { AppError } = require('../core/errors');
const { toCents, fromCents } = require('../core/money');
const { SOURCES } = require('../db/schema');

const KEEP = 200;

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** Undo for deletes: deleted records are parked as JSON and can be put back. */
function createTrashService(db) {
  function insertRow(table, row) {
    const columns = Object.keys(row);
    db.run(
      `INSERT INTO ${table} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      ...columns.map((c) => row[c]));
  }

  function restoreItem(source, { row, payments }) {
    const spec = SOURCES[source];
    const info = db.all(`PRAGMA table_info(${spec.table})`);
    const data = Object.fromEntries(info.filter((c) => c.name in row).map((c) => [c.name, row[c.name]]));
    // Batteries are addressed by rowid; keep it when no column aliases it.
    const key = source === 'battery' ? row.id : row.order_id;
    if (!info.some((c) => c.pk > 0)) data.rowid = key;
    if (db.get(`SELECT 1 AS ok FROM ${spec.table} WHERE ${spec.id} = ?`, key)) {
      throw new AppError('تعذّر التراجع: يوجد سجل آخر بنفس الرقم', { code: 'conflict' });
    }
    insertRow(spec.table, data);
    for (const payment of payments) insertRow('payments', payment);
  }

  function restoreReceipt({ payments, settlements }) {
    for (const settlement of settlements) insertRow('settlements', settlement);
    for (const payment of payments) {
      const spec = SOURCES[payment.source];
      const exists = db.get(`SELECT 1 AS ok FROM ${spec.table} WHERE ${spec.id} = ?`, payment.ref_id);
      if (!exists) throw new AppError('تعذّر التراجع: السجل المرتبط بالدفعة لم يعد موجوداً', { code: 'conflict' });
      insertRow('payments', payment);
      const isCash = payment.kind === 'payment' || payment.kind === 'opening';
      db.run(
        `UPDATE ${spec.table}
            SET payment_amount = ROUND(payment_amount + ?, 2), remaining_amount = ROUND(remaining_amount - ?, 2)
          WHERE ${spec.id} = ?`,
        isCash ? payment.amount : 0, fromCents(toCents(payment.amount)), payment.ref_id);
    }
  }

  function restore(trashId) {
    const entry = db.get('SELECT * FROM trash WHERE id = ?', Number(trashId));
    if (!entry) throw new AppError('انتهت مهلة التراجع عن هذا الحذف', { code: 'not_found' });
    const payload = JSON.parse(entry.payload);
    return db.transaction(() => {
      if (entry.kind === 'order') restoreItem('service', payload);
      else if (entry.kind === 'battery') restoreItem('battery', payload);
      else restoreReceipt(payload);
      db.run('DELETE FROM trash WHERE id = ?', entry.id);
      return { restored: entry.kind };
    });
  }

  /** Keep the trash bounded; older entries can no longer be undone. */
  function prune() {
    db.run('DELETE FROM trash WHERE id <= (SELECT COALESCE(MAX(id), 0) FROM trash) - ?', KEEP);
  }

  return { restore, prune };
}

module.exports = { createTrashService };
