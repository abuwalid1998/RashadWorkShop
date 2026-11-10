'use strict';

const INTEGER = /^(tinyint|smallint|mediumint|int|integer|bigint|bit|bool|boolean|year)\b/;
const REAL = /^(decimal|numeric|dec|fixed|float|double|real)\b/;
const BLOB = /^(tinyblob|blob|mediumblob|longblob|binary|varbinary|geometry)\b/;

/** SQLite column affinity for a MySQL column type such as `decimal(10,2)`. */
function sqliteType(mysqlType) {
  const type = String(mysqlType ?? '').trim().toLowerCase();
  if (INTEGER.test(type)) return 'INTEGER';
  if (REAL.test(type)) return 'REAL';
  if (BLOB.test(type)) return 'BLOB';
  return 'TEXT'; // char/varchar/text/enum/set/json and all date & time types
}

const ZERO_DATE = /^0000-00-00( 00:00:00(\.0+)?)?$/;

/** Convert one MySQL value to what SQLite should store. */
function convertValue(value, type) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  if (Buffer.isBuffer(value)) return type === 'BLOB' ? value : value.toString('utf8');
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (ZERO_DATE.test(value)) return null; // MySQL's "no date" placeholder
    if (type === 'INTEGER' || type === 'REAL') {
      const n = Number(value);
      return value.trim() !== '' && Number.isFinite(n) ? n : value;
    }
  }
  return value;
}

module.exports = { sqliteType, convertValue };
