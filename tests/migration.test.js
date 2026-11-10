'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/main/db/database');
const { createServices } = require('../src/main/services');
const { migrateFromDump, buildDatabase, hasData } = require('../src/main/migration/migrate');
const { readDump } = require('../src/main/migration/dump-source');
const { repairMojibake } = require('../src/main/migration/encoding');
const { sqliteType, convertValue } = require('../src/main/migration/type-map');
const { nameKey } = require('../src/main/core/normalize');

// A real `mariadb-dump` of a database filled through the legacy PHP pages.
const DUMP = path.join(__dirname, 'fixtures', 'legacy-dump.sql');
const tempFile = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rashad-')), name);

test('a legacy dump migrates verbatim: same rows, same amounts, same column names', () => {
  const target = tempFile('workshop.db');
  const result = migrateFromDump(DUMP, target);

  assert.ok(result.tables.every((t) => t.verified));
  const orders = result.tables.find((t) => t.target === 'car_service_fixed');
  assert.equal(orders.copiedRows, 3);
  assert.equal(orders.sums.total_price, 1275);

  const db = new Database(target);
  const row = db.get('SELECT * FROM car_service_fixed WHERE order_id = 1');
  assert.equal(row.customer_name, 'أحمد خليل');
  assert.equal(row.total_price, 225);
  assert.equal(row.payment_amount, 150);
  assert.equal(row.remaining_amount, 25); // copied as stored, legacy bug and all
  assert.equal(row.air_filter_price, 30);
  assert.match(row.order_date, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  // The battery table keeps its own primary key name.
  assert.ok(db.columns('battery_warranty').includes('warranty_id'));
  db.close();
});

test('the migrated database works in the app and its statement reconciles', () => {
  const target = tempFile('workshop.db');
  const result = migrateFromDump(DUMP, target);
  assert.equal(result.inconsistentRecords, 2); // rows the old add-payment page corrupted

  const db = new Database(target);
  const app = createServices(db);
  assert.equal(app.schema.reconciled, 0); // already reconciled by the migration

  const account = app.accounts.get(nameKey('أحمد خليل'));
  assert.equal(account.totals.billed, 440);
  assert.equal(account.totals.paid, 200);
  assert.equal(account.totals.balance, 140); // what the legacy system showed
  assert.equal(account.ledger.closing, 140);

  // New records and payments work on top of migrated data.
  const created = app.orders.create({ customer_name: 'احمد خليل', vehicle_id: '12-345-67', oil_price: 100 });
  assert.equal(created.order_id, 4);
  app.payments.create({ accountKey: account.key, amount: 240 });
  assert.equal(app.accounts.get(account.key).totals.balance, 0);

  const battery = app.batteries.list().rows[0];
  assert.equal(battery.id, 1);
  assert.equal(battery.expires_on, '2028-02-01');
  db.close();
});

test('--recalculate-remaining repairs the double-subtracted amounts', () => {
  const target = tempFile('workshop.db');
  const result = migrateFromDump(DUMP, target, { recalculateRemaining: true });
  assert.equal(result.recalculated, 2);
  assert.equal(result.inconsistentRecords, 0);
  const db = new Database(target);
  assert.equal(db.get('SELECT remaining_amount AS r FROM car_service_fixed WHERE order_id = 1').r, 75);
  assert.equal(db.get('SELECT remaining_amount AS r FROM car_service_fixed WHERE order_id = 2').r, 165);
  db.close();
});

test('--swap-filter-columns undoes the legacy oil/air filter mix-up', () => {
  const target = tempFile('workshop.db');
  migrateFromDump(DUMP, target, { swapFilterColumns: true });
  const db = new Database(target);
  const row = db.get('SELECT oil_filter_price, air_filter_price FROM car_service_fixed WHERE order_id = 1');
  assert.deepEqual({ ...row }, { oil_filter_price: 30, air_filter_price: 45 });
  db.close();
});

test('an existing database is backed up, never lost, when replaced', () => {
  const target = tempFile('workshop.db');
  migrateFromDump(DUMP, target);
  assert.equal(hasData(target), true);
  const second = migrateFromDump(DUMP, target);
  assert.ok(second.backup && fs.existsSync(second.backup));
  assert.equal(hasData(second.backup), true);
});

test('a failed import leaves the existing database untouched', () => {
  const target = tempFile('workshop.db');
  migrateFromDump(DUMP, target);
  const broken = { tables: [{ name: 'x', columns: [{ name: 'a', type: 'int' }], rows: [[1, 2, 3]] }] };
  assert.throws(() => buildDatabase(broken, target));
  assert.equal(hasData(target), true);
  assert.equal(fs.existsSync(`${target}.importing`), false);
});

test('dump parser handles quoting, escapes, comments and column-less inserts', () => {
  const { tables } = readDump(`
    -- comment; with semicolon
    /*!40101 SET NAMES utf8mb4 */;
    CREATE TABLE \`t\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`name\` varchar(50) DEFAULT 'a,b;c' COMMENT 'x (y)',
      \`amount\` decimal(10,2) DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`k\` (\`name\`)
    ) ENGINE=InnoDB;
    INSERT INTO \`t\` VALUES (1,'it''s; ok',10.50),(2,'a\\'b (x), y',NULL);
    INSERT INTO \`t\` (\`amount\`, \`id\`) VALUES (-3.5, 3);
  `);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].columns.map((c) => [c.name, c.primary, c.autoIncrement]),
    [['id', true, true], ['name', false, false], ['amount', false, false]]);
  assert.deepEqual(tables[0].rows, [[1, "it's; ok", 10.5], [2, "a'b (x), y", null], [3, null, -3.5]]);
});

test('garbled Arabic from a latin1 connection is repaired, clean text is left alone', () => {
  // "أحمد" as its UTF-8 bytes read back through Windows-1252.
  assert.equal(repairMojibake('Ø£Ø­Ù…Ø¯'), 'أحمد');
  assert.equal(repairMojibake('أحمد'), 'أحمد');
  assert.equal(repairMojibake('Østergård'), 'Østergård');
  assert.equal(repairMojibake('5W-30'), '5W-30');
});

test('MySQL types and values map to SQLite faithfully', () => {
  assert.equal(sqliteType('int(11)'), 'INTEGER');
  assert.equal(sqliteType('decimal(10,2)'), 'REAL');
  assert.equal(sqliteType('varchar(255)'), 'TEXT');
  assert.equal(sqliteType('timestamp'), 'TEXT');
  assert.equal(convertValue('0000-00-00', 'TEXT'), null);
  assert.equal(convertValue('150.50', 'REAL'), 150.5);
  assert.equal(convertValue('2026-01-05 10:00:00', 'TEXT'), '2026-01-05 10:00:00');
});
