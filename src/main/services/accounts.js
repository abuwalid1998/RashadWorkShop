'use strict';
const { notFound } = require('../core/errors');
const { orderLines } = require('../core/catalog');
const { buildLedger } = require('../core/ledger');
const { toCents, fromCents } = require('../core/money');
const { nameKey, vehicleKey } = require('../core/normalize');

const money = (value) => fromCents(toCents(value));
const firstOf = (list) => String(list ?? '').split(',').find(Boolean) || '';
const split = (list) => String(list ?? '').split(',').filter(Boolean);

const SORTS = {
  recent: (a, b) => (a.last_date < b.last_date ? 1 : a.last_date > b.last_date ? -1 : 0),
  balance: (a, b) => b.balance - a.balance || SORTS.recent(a, b),
  billed: (a, b) => b.billed - a.billed,
  name: (a, b) => a.name.localeCompare(b.name, 'ar'),
};

/**
 * A customer account is every order and battery recorded under the same
 * (normalised) customer name — the grouping the legacy search page used.
 */
function createAccountsService(db, payments) {
  let cache = { revision: -1, rows: [] };

  /**
   * Every account with its totals. Computed once per data change and then
   * searched, sorted and paged in memory, so typing in the search box never
   * waits on the database.
   */
  function all() {
    const revision = db.revision;
    if (cache.revision === revision) return cache.rows;
    // With a single MAX(), SQLite takes the bare `customer_name` from the row
    // holding that maximum: the most recent spelling of the customer's name.
    const rows = db.all(`
      SELECT account_key AS key, customer_name AS name, MAX(date) AS last_date,
             group_concat(DISTINCT NULLIF(phone_number, '')) AS phones,
             group_concat(DISTINCT vehicle_id) AS vehicles,
             group_concat(DISTINCT vehicle_key) AS vehicle_keys,
             COUNT(*) AS visits, SUM(total) AS billed, SUM(paid) AS paid, SUM(remaining) AS balance
        FROM account_items GROUP BY account_key`)
      .map((row) => {
        const vehicles = split(row.vehicles);
        return {
          key: row.key,
          name: row.name,
          phone: firstOf(row.phones),
          phones: row.phones || '',
          vehicles,
          vehicle_keys: split(row.vehicle_keys),
          vehicle_count: vehicles.length,
          visits: row.visits,
          last_date: row.last_date,
          billed: money(row.billed),
          paid: money(row.paid),
          balance: money(row.balance),
        };
      });
    cache = { revision, rows };
    return rows;
  }

  function list({ query = '', filter = 'all', sort = 'recent', limit = 60, offset = 0 } = {}) {
    const term = String(query).trim();
    let rows = all();
    if (term) {
      const name = nameKey(term);
      const vehicle = vehicleKey(term);
      rows = rows.filter((row) => row.key.includes(name)
        || (vehicle && row.vehicle_keys.some((key) => key.includes(vehicle)))
        || row.phones.includes(term));
    }
    if (filter === 'debt') rows = rows.filter((row) => row.balance > 0.004);
    if (filter === 'clear') rows = rows.filter((row) => row.balance <= 0.004);
    rows = [...rows].sort(SORTS[sort] || SORTS.recent);

    const start = Number(offset) || 0;
    const sum = (pick) => fromCents(rows.reduce((acc, row) => acc + toCents(pick(row)), 0));
    return {
      rows: rows.slice(start, start + Math.min(Number(limit) || 60, 500)),
      count: rows.length,
      billed: sum((row) => row.billed),
      paid: sum((row) => row.paid),
      balance: sum((row) => Math.max(0, row.balance)),
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
    const records = db.all('SELECT * FROM account_items WHERE account_key = ? ORDER BY date ASC, id ASC', accountKey);
    if (!records.length) throw notFound('الحساب');

    const wanted = vehicle ? vehicleKey(vehicle) : '';
    const scoped = wanted ? records.filter((item) => item.vehicle_key === wanted) : records;

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

    const latest = records[records.length - 1];
    const vehicles = [...new Map(records.map((item) => [item.vehicle_key, item])).values()].map((item) => {
      const own = records.filter((i) => i.vehicle_key === item.vehicle_key);
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
      phone: [...records].reverse().find((i) => i.phone_number)?.phone_number || '',
      scope: { vehicle: vehicle || '', from, to },
      vehicles,
      first_date: records[0].date,
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

  /** Known customer + vehicle pairs matching what is being typed in a form. */
  function suggest({ query = '', limit = 6 } = {}) {
    const term = String(query).trim();
    if (!term) return [];
    const name = nameKey(term);
    const vehicle = vehicleKey(term);
    const matches = [];
    for (const account of [...all()].sort(SORTS.recent)) {
      const byName = account.key.includes(name);
      for (const vehicleId of account.vehicles) {
        if (!byName && !(vehicle && vehicleKey(vehicleId).includes(vehicle))) continue;
        matches.push({
          customer_name: account.name,
          vehicle_id: vehicleId,
          phone_number: account.phone,
          last_date: account.last_date,
          account_key: account.key,
        });
        if (matches.length >= Math.min(Number(limit) || 6, 20)) return matches;
      }
    }
    return matches;
  }

  return { all, list, get, suggest };
}

module.exports = { createAccountsService };
