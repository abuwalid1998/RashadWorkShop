'use strict';
const { nameKeySql, vehicleKeySql } = require('../core/normalize');
const { PRICE_COLUMNS } = require('../core/catalog');
const { toCents, fromCents } = require('../core/money');
const { now } = require('../core/dates');

/**
 * The two legacy tables keep the exact column names of the MySQL database, so
 * migrated data drops in unchanged. Everything the new features need
 * (payment history, settlements, settings, undo) lives in *additional*
 * tables; the legacy tables are never restructured.
 */
const LEGACY_TABLES = {
  car_service_fixed: {
    create: `
      CREATE TABLE car_service_fixed (
        order_id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL DEFAULT '',
        phone_number TEXT DEFAULT '',
        vehicle_id TEXT NOT NULL DEFAULT '',
        km_counter INTEGER DEFAULT 0,
        date_of_change TEXT,
        oil_type TEXT DEFAULT '',
        oil_price REAL DEFAULT 0,
        total_price REAL DEFAULT 0,
        payment_amount REAL DEFAULT 0,
        remaining_amount REAL DEFAULT 0,
        order_date TEXT,
        air_filter_price REAL DEFAULT 0,
        oil_filter_price REAL DEFAULT 0,
        diesel_filter_price REAL DEFAULT 0,
        ac_filter_price REAL DEFAULT 0,
        sparks_change_price REAL DEFAULT 0,
        timing_belt_price REAL DEFAULT 0
      )`,
    columns: {
      customer_name: "TEXT DEFAULT ''",
      phone_number: "TEXT DEFAULT ''",
      vehicle_id: "TEXT DEFAULT ''",
      km_counter: 'INTEGER DEFAULT 0',
      date_of_change: 'TEXT',
      oil_type: "TEXT DEFAULT ''",
      total_price: 'REAL DEFAULT 0',
      payment_amount: 'REAL DEFAULT 0',
      remaining_amount: 'REAL DEFAULT 0',
      order_date: 'TEXT',
      ...Object.fromEntries(PRICE_COLUMNS.map((c) => [c, 'REAL DEFAULT 0'])),
    },
    amounts: ['total_price', 'payment_amount', ...PRICE_COLUMNS],
    total: 'total_price',
  },
  battery_warranty: {
    create: `
      CREATE TABLE battery_warranty (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL DEFAULT '',
        phone_number TEXT DEFAULT '',
        vehicle_id TEXT NOT NULL DEFAULT '',
        battery_type TEXT DEFAULT '',
        warranty_period INTEGER DEFAULT 0,
        purchase_date TEXT,
        price REAL DEFAULT 0,
        payment_amount REAL DEFAULT 0,
        remaining_amount REAL DEFAULT 0,
        order_date TEXT
      )`,
    columns: {
      customer_name: "TEXT DEFAULT ''",
      phone_number: "TEXT DEFAULT ''",
      vehicle_id: "TEXT DEFAULT ''",
      battery_type: "TEXT DEFAULT ''",
      warranty_period: 'INTEGER DEFAULT 0',
      purchase_date: 'TEXT',
      price: 'REAL DEFAULT 0',
      payment_amount: 'REAL DEFAULT 0',
      remaining_amount: 'REAL DEFAULT 0',
      order_date: 'TEXT',
    },
    amounts: ['price', 'payment_amount'],
    total: 'price',
  },
};

const APP_TABLES = `
  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_key TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    vehicle_id TEXT,
    settled_at TEXT NOT NULL,
    balance_before REAL NOT NULL,
    amount_paid REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  -- One row per (receipt, item): a receipt paying three orders has three rows
  -- sharing a receipt_no. kind: payment | opening (carried over from the old
  -- system) | discount (settlement write-off) | adjust (carried-over balance fix).
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_no INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('service', 'battery')),
    ref_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment', 'opening', 'discount', 'adjust')),
    amount REAL NOT NULL,
    paid_at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    settlement_id INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments (source, ref_id);
  CREATE INDEX IF NOT EXISTS idx_payments_receipt ON payments (receipt_no);
  CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments (paid_at);
  CREATE INDEX IF NOT EXISTS idx_settlements_account ON settlements (account_key);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Deleted records wait here so a delete can be undone.
  CREATE TABLE IF NOT EXISTS trash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    deleted_at TEXT NOT NULL
  );
`;

/**
 * `account_items` is one uniform row per "thing a customer was charged for"
 * (a service order or a battery), with pre-computed search keys. Account
 * totals, statements, payments and every search read from it.
 *
 * It is a lookup table kept in step with the two legacy tables by triggers,
 * so search never has to normalise names row by row. The triggers use only
 * built-in SQL functions: they keep working if the file is edited with any
 * other SQLite tool.
 */
const ITEM_COLUMNS = 'source, id, account_key, vehicle_key, customer_name, phone_number, vehicle_id, total, paid, remaining, date';

const ITEM_VALUES = {
  service: (row) => `'service', ${row}order_id,
    ${nameKeySql(`${row}customer_name`)}, ${vehicleKeySql(`${row}vehicle_id`)},
    COALESCE(${row}customer_name, ''), COALESCE(${row}phone_number, ''), COALESCE(${row}vehicle_id, ''),
    ${row}total_price, ${row}payment_amount, ${row}remaining_amount,
    COALESCE(${row}order_date, ${row}date_of_change, '')`,
  battery: (row) => `'battery', ${row}rowid,
    ${nameKeySql(`${row}customer_name`)}, ${vehicleKeySql(`${row}vehicle_id`)},
    COALESCE(${row}customer_name, ''), COALESCE(${row}phone_number, ''), COALESCE(${row}vehicle_id, ''),
    ${row}price, ${row}payment_amount, ${row}remaining_amount,
    COALESCE(${row}order_date, ${row}purchase_date, '')`,
};

const ACCOUNT_ITEMS = `
  CREATE TABLE IF NOT EXISTS account_items (
    source TEXT NOT NULL,
    id INTEGER NOT NULL,
    account_key TEXT NOT NULL,
    vehicle_key TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    total REAL NOT NULL,
    paid REAL NOT NULL,
    remaining REAL NOT NULL,
    date TEXT NOT NULL,
    PRIMARY KEY (source, id)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS idx_items_account ON account_items (account_key, date);
  CREATE INDEX IF NOT EXISTS idx_items_vehicle ON account_items (vehicle_key, date);
  CREATE INDEX IF NOT EXISTS idx_items_date ON account_items (date);
  CREATE INDEX IF NOT EXISTS idx_service_order_date ON car_service_fixed (order_date);
`;

function itemTriggers(source, table, idColumn) {
  const insert = `INSERT OR REPLACE INTO account_items (${ITEM_COLUMNS}) VALUES (${ITEM_VALUES[source]('NEW.')});`;
  const remove = `DELETE FROM account_items WHERE source = '${source}' AND id = OLD.${idColumn};`;
  return `
    DROP TRIGGER IF EXISTS items_${source}_insert;
    DROP TRIGGER IF EXISTS items_${source}_update;
    DROP TRIGGER IF EXISTS items_${source}_delete;
    CREATE TRIGGER items_${source}_insert AFTER INSERT ON ${table} BEGIN ${insert} END;
    CREATE TRIGGER items_${source}_update AFTER UPDATE ON ${table} BEGIN ${remove} ${insert} END;
    CREATE TRIGGER items_${source}_delete AFTER DELETE ON ${table} BEGIN ${remove} END;`;
}

const SOURCES = {
  service: { table: 'car_service_fixed', id: 'order_id', total: 'total_price', date: "COALESCE(order_date, date_of_change, '')" },
  battery: { table: 'battery_warranty', id: 'rowid', total: 'price', date: "COALESCE(order_date, purchase_date, '')" },
};

function ensureLegacyTable(db, name) {
  const spec = LEGACY_TABLES[name];
  if (!db.tableExists(name)) {
    db.exec(spec.create);
    return;
  }
  // A migrated table normally has every column. If an older legacy database
  // lacks one the app reads, add just that column; nothing else is altered.
  const present = new Set(db.columns(name).map((c) => c.toLowerCase()));
  for (const [column, definition] of Object.entries(spec.columns)) {
    if (!present.has(column)) db.exec(`ALTER TABLE ${name} ADD COLUMN ${column} ${definition}`);
  }
}

/** NULL amounts would poison every SUM; treat them as the zero they mean. */
function fillMissingAmounts(db, name) {
  const spec = LEGACY_TABLES[name];
  for (const column of spec.amounts) {
    db.exec(`UPDATE ${name} SET ${column} = 0 WHERE ${column} IS NULL`);
  }
  db.exec(`UPDATE ${name} SET remaining_amount = ${spec.total} - payment_amount WHERE remaining_amount IS NULL`);
}

/**
 * Make the payment ledger agree with the amounts stored on each record.
 *
 * Migrated records carry a paid amount but no payment history. For each one
 * we add an "opening" ledger entry (dated at the order) so statements add
 * up. If a record's stored remaining amount disagrees with total − paid, the
 * difference is recorded as an "adjust" entry rather than silently changing
 * the customer's balance. Idempotent: a consistent database produces nothing.
 *
 * @returns {number} ledger entries created
 */
function reconcileLedger(db) {
  let created = 0;
  let receiptNo = db.get('SELECT COALESCE(MAX(receipt_no), 0) AS n FROM payments').n;
  const stamp = now();
  const insert = `INSERT INTO payments (receipt_no, source, ref_id, kind, amount, paid_at, note, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, '', ?)`;

  for (const [source, spec] of Object.entries(SOURCES)) {
    const rows = db.all(`
      SELECT t.${spec.id} AS id, t.${spec.total} AS total, t.payment_amount AS paid,
             t.remaining_amount AS remaining, ${spec.date} AS date,
             COALESCE(l.cash, 0) AS cash, COALESCE(l.other, 0) AS other
        FROM ${spec.table} t
        LEFT JOIN (
          SELECT ref_id,
                 SUM(CASE WHEN kind IN ('payment', 'opening') THEN amount ELSE 0 END) AS cash,
                 SUM(CASE WHEN kind IN ('discount', 'adjust') THEN amount ELSE 0 END) AS other
            FROM payments WHERE source = '${source}' GROUP BY ref_id
        ) l ON l.ref_id = t.${spec.id}
       WHERE ABS(t.payment_amount - COALESCE(l.cash, 0)) > 0.004
          OR ABS(t.${spec.total} - t.payment_amount - COALESCE(l.other, 0) - t.remaining_amount) > 0.004`);

    for (const row of rows) {
      const paidAt = row.date || stamp;
      const missingCash = toCents(row.paid) - toCents(row.cash);
      if (missingCash > 0) {
        receiptNo += 1;
        db.run(insert, receiptNo, source, row.id, 'opening', fromCents(missingCash), paidAt, stamp);
        created += 1;
      }
      const gap = toCents(row.total) - toCents(row.paid) - toCents(row.other) - toCents(row.remaining);
      if (gap !== 0) {
        receiptNo += 1;
        db.run(insert, receiptNo, source, row.id, 'adjust', fromCents(gap), paidAt, stamp);
        created += 1;
      }
    }
  }
  return created;
}

/**
 * Make sure `account_items` mirrors the legacy tables. Triggers keep it in
 * step from here on; a full rebuild only happens when they could not have
 * (first launch after a migration or restore).
 * @returns {boolean} whether a rebuild was needed
 */
function syncAccountItems(db) {
  const fingerprint = (rows) => rows.map((r) => `${r.source}:${r.n}:${toCents(r.total)}:${toCents(r.remaining)}`).sort().join('|');
  const actual = fingerprint(db.all(`
    SELECT 'service' AS source, COUNT(*) AS n, TOTAL(total_price) AS total, TOTAL(remaining_amount) AS remaining FROM car_service_fixed
    UNION ALL
    SELECT 'battery', COUNT(*), TOTAL(price), TOTAL(remaining_amount) FROM battery_warranty`).filter((r) => r.n > 0));
  const indexed = fingerprint(db.all(
    'SELECT source, COUNT(*) AS n, TOTAL(total) AS total, TOTAL(remaining) AS remaining FROM account_items GROUP BY source'));
  if (actual === indexed) return false;
  db.exec(`
    DELETE FROM account_items;
    INSERT INTO account_items (${ITEM_COLUMNS}) SELECT ${ITEM_VALUES.service('')} FROM car_service_fixed;
    INSERT INTO account_items (${ITEM_COLUMNS}) SELECT ${ITEM_VALUES.battery('battery_warranty.')} FROM battery_warranty;`);
  return true;
}

/**
 * Records whose stored remaining amount is not total − paid − discounts.
 * The legacy "add payment" page subtracted each payment twice, so migrated
 * data usually has some. They are carried as "adjust" ledger entries.
 */
function ledgerHealth(db) {
  const row = db.get(
    `SELECT COUNT(DISTINCT source || ':' || ref_id) AS records, COALESCE(SUM(amount), 0) AS amount
       FROM payments WHERE kind = 'adjust'`);
  return { inconsistentRecords: row.records, inconsistentAmount: fromCents(toCents(row.amount)) };
}

/**
 * Opt-in repair for the above: recompute every remaining amount as
 * total − paid − discounts and drop the "adjust" entries.
 * @returns {number} records corrected
 */
function recalculateRemaining(db) {
  return db.transaction(() => {
    const { inconsistentRecords } = ledgerHealth(db);
    for (const [source, spec] of Object.entries(SOURCES)) {
      db.exec(`
        UPDATE ${spec.table}
           SET remaining_amount = ROUND(${spec.total} - payment_amount - COALESCE((
                 SELECT SUM(amount) FROM payments
                  WHERE source = '${source}' AND ref_id = ${spec.table}.${spec.id} AND kind = 'discount'), 0), 2)`);
    }
    db.exec("DELETE FROM payments WHERE kind = 'adjust'");
    return inconsistentRecords;
  });
}

/** Create or upgrade everything the app needs. Safe to run on every launch. */
function ensureSchema(db) {
  return db.transaction(() => {
    for (const name of Object.keys(LEGACY_TABLES)) {
      ensureLegacyTable(db, name);
      fillMissingAmounts(db, name);
    }
    db.exec(APP_TABLES);
    db.exec(ACCOUNT_ITEMS);
    db.exec(itemTriggers('service', 'car_service_fixed', 'order_id'));
    db.exec(itemTriggers('battery', 'battery_warranty', 'rowid'));
    const rebuilt = syncAccountItems(db);
    return { reconciled: reconcileLedger(db), rebuilt };
  });
}

module.exports = { ensureSchema, reconcileLedger, ledgerHealth, recalculateRemaining, SOURCES, LEGACY_TABLES };
