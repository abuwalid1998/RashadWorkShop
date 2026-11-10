'use strict';
const { notFound } = require('../core/errors');
const { orderLines } = require('../core/catalog');
const { buildLedger } = require('../core/ledger');
const { toCents, fromCents } = require('../core/money');
const { nameKey, vehicleKey, likeContains } = require('../core/normalize');

const SORTS = {
  recent: 'last_date DESC',
  balance: 'balance DESC, last_date DESC',
  name: 'name COLLATE NOCASE ASC',
  billed: 'billed DESC',
};

const money = (value) => fromCents(toCents(value));
const firstOf = (list) => String(list ?? '').split(',').find(Boolean) || '';

/**
 * A customer account is every order and battery recorded under the same
 * (normalised) customer name — the grouping the legacy search page used.
 */
function createAccountsService(db, payments) {
  const MATCH = `account_key IN (
    SELECT account_key FROM account_items
     WHERE account_key LIKE ? ESCAPE '\\' OR vehicle_key LIKE ? ESCAPE '\\' OR phone_number LIKE ? ESCAPE '\\')`;

  const matchParams = (term) =>
    [likeContains(nameKey(term)), likeContains(vehicleKey(term) || term), likeContains(term)];

  function list({ query = '', filter = 'all', sort = 'recent', limit = 60, offset = 0 } = {}) {
    const term = String(query).trim();
    const params = term ? matchParams(term) : [];
    const having = filter === 'debt' ? 'HAVING SUM(remaining) > 0.004'
      : filter === 'clear' ? 'HAVING SUM(remaining) <= 0.004' : '';
    // With a single MAX(), SQLite takes the bare `customer_name` from the row
    // holding that maximum: the most recent spelling of the customer's name.
    const grouped = `
      SELECT account_key AS key, customer_name AS name, MAX(date) AS last_date,
             group_concat(DISTINCT NULLIF(phone_number, '')) AS phones,
             group_concat(DISTINCT vehicle_id) AS vehicles,
             COUNT(*) AS visits, COUNT(DISTINCT vehicle_key) AS vehicle_count,
             SUM(total) AS billed, SUM(paid) AS paid, SUM(remaining) AS balance
        FROM account_items ${term ? `WHERE ${MATCH}` : ''}
       GROUP BY account_key ${having}`;
    const rows = db.all(
      `${grouped} ORDER BY ${SORTS[sort] || SORTS.recent} LIMIT ? OFFSET ?`,
      ...params, Math.min(Number(limit) || 60, 500), Number(offset) || 0);
    const summary = db.get(
      `SELECT COUNT(*) AS count, COALESCE(SUM(billed), 0) AS billed, COALESCE(SUM(paid), 0) AS paid,
              COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS balance
         FROM (${grouped})`, ...params);
    return {
      rows: rows.map((row) => ({
        key: row.key,
        name: row.name,
        phone: firstOf(row.phones),
        vehicles: String(row.vehicles ?? '').split(',').filter(Boolean),
        vehicle_count: row.vehicle_count,
        visits: row.visits,
        last_date: row.last_date,
        billed: money(row.billed),
        paid: money(row.paid),
        balance: money(row.balance),
      })),
      count: summary.count,
      billed: money(summary.billed),
      paid: money(summary.paid),
      balance: money(summary.balance),
    };
  }

  /**
   * Everything about one account: visits with itemised services, batteries,
   * receipts, settlements and the running-balance ledger.
   *
   * @param {string} key account key
   * @param {{ vehicle?: string, from?: string, to?: string }} [options]
   */
  function get(key, { vehicle = '', from = '', to = '' } = {}) {
    const accountKey = String(key ?? '');
    const all = db.all('SELECT * FROM account_items WHERE account_key = ? ORDER BY date ASC, id ASC', accountKey);
    if (!all.length) throw notFound('الحساب');

    const wanted = vehicle ? vehicleKey(vehicle) : '';
    const scoped = wanted ? all.filter((item) => item.vehicle_key === wanted) : all;

    const serviceRows = new Map(
      db.all(`SELECT * FROM car_service_fixed WHERE order_id IN (
                SELECT id FROM account_items WHERE account_key = ? AND source = 'service')`, accountKey)
        .map((row) => [row.order_id, row]));
    const batteryRows = new Map(
      db.all(`SELECT battery_warranty.rowid AS id, * FROM battery_warranty WHERE rowid IN (
                SELECT id FROM account_items WHERE account_key = ? AND source = 'battery')`, accountKey)
        .map((row) => [row.id, row]));

    const items = scoped.map((item) => {
      const base = {
        source: item.source, id: item.id, date: item.date, vehicle_id: item.vehicle_id,
        total: money(item.total), paid: money(item.paid), remaining: money(item.remaining),
      };
      if (item.source === 'service') {
        const row = serviceRows.get(item.id);
        const lines = orderLines(row);
        return {
          ...base, km_counter: row.km_counter, oil_type: row.oil_type, lines,
          description: lines.map((l) => l.label).join('، ') || 'خدمة صيانة',
        };
      }
      const row = batteryRows.get(item.id);
      return {
        ...base, battery_type: row.battery_type, warranty_period: row.warranty_period,
        purchase_date: row.purchase_date,
        lines: [{ key: 'battery', label: `بطارية ${row.battery_type || ''}`.trim(), price: money(row.price) }],
        description: `بطارية ${row.battery_type || ''} — ضمان ${row.warranty_period || 0} شهر`.trim(),
      };
    });

    // Ledger rows of the scoped items, folded into one entry per receipt and kind.
    const ids = { service: new Set(), battery: new Set() };
    for (const item of scoped) ids[item.source].add(item.id);
    const ledgerRows = db.all(
      `SELECT p.* FROM payments p
        WHERE (p.source = 'service' AND p.ref_id IN (SELECT id FROM account_items WHERE account_key = ? AND source = 'service'))
           OR (p.source = 'battery' AND p.ref_id IN (SELECT id FROM account_items WHERE account_key = ? AND source = 'battery'))
        ORDER BY p.paid_at ASC, p.id ASC`, accountKey, accountKey)
      .filter((row) => ids[row.source].has(row.ref_id));

    const creditMap = new Map();
    for (const row of ledgerRows) {
      const { kind } = row;
      const id = `${row.receipt_no}:${kind}`;
      const entry = creditMap.get(id) || {
        receipt_no: row.receipt_no, kind, date: row.paid_at, note: row.note,
        settlement_id: row.settlement_id, amount: 0, refs: [],
      };
      entry.amount = fromCents(toCents(entry.amount) + toCents(row.amount));
      entry.refs.push({ source: row.source, id: row.ref_id, amount: row.amount });
      creditMap.set(id, entry);
    }
    const credits = [...creditMap.values()];

    const ledger = buildLedger(items, credits, { from, to });
    const sumBy = (kinds) => fromCents(credits
      .filter((c) => kinds.includes(c.kind))
      .reduce((acc, c) => acc + toCents(c.amount), 0));

    const latest = all[all.length - 1];
    const vehicles = [...new Map(all.map((item) => [item.vehicle_key, item])).values()].map((item) => {
      const own = all.filter((i) => i.vehicle_key === item.vehicle_key);
      const lastService = [...own].reverse().find((i) => i.source === 'service');
      return {
        vehicle_id: own[own.length - 1].vehicle_id,
        visits: own.length,
        last_date: own[own.length - 1].date,
        last_km: lastService ? serviceRows.get(lastService.id).km_counter : null,
        balance: fromCents(own.reduce((acc, i) => acc + toCents(i.remaining), 0)),
      };
    });

    const billed = fromCents(items.reduce((acc, i) => acc + toCents(i.total), 0));
    const balance = fromCents(items.reduce((acc, i) => acc + toCents(i.remaining), 0));

    return {
      key: accountKey,
      name: latest.customer_name,
      phone: [...all].reverse().find((i) => i.phone_number)?.phone_number || '',
      scope: { vehicle: vehicle || '', from, to },
      vehicles,
      first_date: all[0].date,
      last_date: latest.date,
      totals: {
        visits: items.filter((i) => i.source === 'service').length,
        batteries: items.filter((i) => i.source === 'battery').length,
        billed,
        paid: sumBy(['payment', 'opening']),
        discount: sumBy(['discount']),
        adjust: sumBy(['adjust']),
        balance,
      },
      items,
      credits,
      settlements: payments.listSettlements(accountKey)
        .filter((s) => !wanted || !s.vehicle_id || vehicleKey(s.vehicle_id) === wanted),
      ledger,
    };
  }

  /** Known customers/vehicles matching what is being typed in a form. */
  function suggest({ query = '', limit = 6 } = {}) {
    const term = String(query).trim();
    if (!term) return [];
    return db.all(
      `SELECT customer_name, vehicle_id, MAX(date) AS last_date,
              group_concat(DISTINCT NULLIF(phone_number, '')) AS phones, account_key
         FROM account_items
        WHERE account_key LIKE ? ESCAPE '\\' OR vehicle_key LIKE ? ESCAPE '\\'
        GROUP BY account_key, vehicle_key
        ORDER BY last_date DESC LIMIT ?`,
      likeContains(nameKey(term)), likeContains(vehicleKey(term) || term), Math.min(Number(limit) || 6, 20))
      .map((row) => ({
        customer_name: row.customer_name,
        vehicle_id: row.vehicle_id,
        phone_number: firstOf(row.phones),
        last_date: row.last_date,
        account_key: row.account_key,
      }));
  }

  return { list, get, suggest };
}

module.exports = { createAccountsService };
