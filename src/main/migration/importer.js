'use strict';
const { sqliteType, convertValue } = require('./type-map');
const { repairMojibake } = require('./encoding');
const { LEGACY_TABLES } = require('../db/schema');
const { toCents, fromCents } = require('../core/money');

const RESERVED = new Set(['payments', 'settlements', 'app_settings', 'trash', 'account_items']);
const CHECKED_COLUMNS = ['total_price', 'price', 'payment_amount', 'remaining_amount'];
const BATCH = 400;

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** SQLite DDL mirroring a MySQL table: same column names, same order. */
function createTableSql(table, targetName) {
  const known = LEGACY_TABLES[targetName]?.columns || {};
  const primary = table.columns.filter((c) => c.primary);
  const rowidKey = primary.length === 1 && sqliteType(primary[0].type) === 'INTEGER' ? primary[0].name : null;

  const definitions = table.columns.map((column) => {
    if (column.name === rowidKey) {
      return `${quote(column.name)} INTEGER PRIMARY KEY${column.autoIncrement ? ' AUTOINCREMENT' : ''}`;
    }
    // Columns the app writes get the app's defaults; the rest stay permissive.
    return `${quote(column.name)} ${known[column.name.toLowerCase()] || sqliteType(column.type)}`;
  });
  if (primary.length && !rowidKey) {
    definitions.push(`PRIMARY KEY (${primary.map((c) => quote(c.name)).join(', ')})`);
  }
  return `CREATE TABLE ${quote(targetName)} (\n  ${definitions.join(',\n  ')}\n)`;
}

/**
 * Copy source tables into an empty SQLite database, verbatim.
 *
 * @param {import('../db/database').Database} db
 * @param {{ tables: Array<{ name: string, columns: object[], rows: unknown[][] }> }} source
 * @param {{ fixEncoding?: boolean, swapFilterColumns?: boolean }} [options]
 *   swapFilterColumns: the legacy form saved the oil-filter price in
 *   `air_filter_price` and vice versa; opt in to put them back.
 * @returns {{ tables: Array<object>, repairedText: number }}
 */
function importTables(db, source, { fixEncoding = true, swapFilterColumns = false } = {}) {
  const report = { tables: [], repairedText: 0 };

  db.transaction(() => {
    for (const table of source.tables) {
      const lower = table.name.toLowerCase();
      const targetName = RESERVED.has(lower) ? `legacy_${table.name}` : LEGACY_TABLES[lower] ? lower : table.name;
      const types = table.columns.map((c) => sqliteType(c.type));

      let columnNames = table.columns.map((c) => c.name);
      if (swapFilterColumns && targetName === 'car_service_fixed') {
        const swap = { air_filter_price: 'oil_filter_price', oil_filter_price: 'air_filter_price' };
        columnNames = columnNames.map((name) => swap[name.toLowerCase()] || name);
      }

      db.exec(createTableSql(table, targetName));

      const placeholders = `(${columnNames.map(() => '?').join(', ')})`;
      const insertPrefix = `INSERT INTO ${quote(targetName)} (${columnNames.map(quote).join(', ')}) VALUES `;
      const sourceSums = Object.fromEntries(CHECKED_COLUMNS.map((c) => [c, 0]));
      const checked = CHECKED_COLUMNS
        .map((name) => ({ name, index: table.columns.findIndex((c) => c.name.toLowerCase() === name) }))
        .filter((c) => c.index !== -1);

      for (let start = 0; start < table.rows.length; start += BATCH) {
        const batch = table.rows.slice(start, start + BATCH);
        const params = [];
        for (const row of batch) {
          if (row.length !== types.length) {
            throw new Error(`الجدول ${table.name}: عدد القيم في أحد الصفوف لا يطابق عدد الأعمدة`);
          }
          for (let i = 0; i < types.length; i += 1) {
            let value = convertValue(row[i], types[i]);
            if (fixEncoding && typeof value === 'string') {
              const repaired = repairMojibake(value);
              if (repaired !== value) report.repairedText += 1;
              value = repaired;
            }
            params.push(value);
          }
          for (const column of checked) sourceSums[column.name] += toCents(row[column.index]);
        }
        db.raw.prepare(insertPrefix + batch.map(() => placeholders).join(', ')).run(...params);
      }

      // Verify: same row count and same money totals as the source.
      const copied = db.get(`SELECT COUNT(*) AS n FROM ${quote(targetName)}`).n;
      const sums = {};
      let verified = copied === table.rows.length;
      for (const column of checked) {
        const target = toCents(db.get(`SELECT COALESCE(SUM(${quote(column.name)}), 0) AS s FROM ${quote(targetName)}`).s);
        sums[column.name] = fromCents(target);
        if (target !== sourceSums[column.name]) verified = false;
      }
      report.tables.push({ source: table.name, target: targetName, sourceRows: table.rows.length, copiedRows: copied, sums, verified });
    }
  });

  return report;
}

module.exports = { importTables, createTableSql };
