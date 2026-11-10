'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('../db/database');
const { ensureSchema, ledgerHealth, recalculateRemaining } = require('../db/schema');
const { importTables } = require('./importer');
const { readMysql } = require('./mysql-source');
const { readDump } = require('./dump-source');

const pad = (n) => String(n).padStart(2, '0');
function timestamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function removeDatabaseFiles(file) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
}

/** True when a database file already holds workshop records. */
function hasData(file) {
  if (!fs.existsSync(file)) return false;
  const db = new Database(file);
  try {
    return ['car_service_fixed', 'battery_warranty'].some(
      (table) => db.tableExists(table) && db.get(`SELECT COUNT(*) AS n FROM ${table}`).n > 0);
  } finally {
    db.close();
  }
}

/**
 * Build a SQLite database from already-read source tables.
 *
 * The new file is written beside the target and only swapped in after every
 * table verified, so a failed migration never damages existing data. An
 * existing target is kept as a timestamped backup.
 *
 * @returns {{ file: string, backup: string|null, tables: object[], repairedText: number,
 *   ledgerEntries: number, recalculated: number, inconsistentRecords: number, inconsistentAmount: number }}
 */
function buildDatabase(source, targetFile, options = {}) {
  const target = path.resolve(targetFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = `${target}.importing`;
  removeDatabaseFiles(staging);

  let report;
  let ledgerEntries;
  let health;
  let recalculated = 0;
  const db = new Database(staging);
  try {
    report = importTables(db, source, options);
    const failed = report.tables.filter((t) => !t.verified);
    if (failed.length) {
      throw new Error(`فشل التحقق من الجداول: ${failed.map((t) => t.source).join(', ')}`);
    }
    ledgerEntries = ensureSchema(db).reconciled;
    health = ledgerHealth(db);
    if (options.recalculateRemaining && health.inconsistentRecords) {
      recalculated = recalculateRemaining(db);
      health = ledgerHealth(db);
    }
  } catch (error) {
    db.close();
    removeDatabaseFiles(staging);
    throw error;
  }
  db.close();

  let backup = null;
  if (fs.existsSync(target)) {
    const dir = options.backupDir || path.dirname(target);
    fs.mkdirSync(dir, { recursive: true });
    backup = path.join(dir, `${path.basename(target, '.db')}-before-import-${timestamp()}.db`);
    fs.copyFileSync(target, backup);
    removeDatabaseFiles(target);
  }
  fs.renameSync(staging, target);
  return { file: target, backup, ...report, ledgerEntries, recalculated, ...health };
}

async function migrateFromMysql(connection, targetFile, options = {}) {
  return buildDatabase(await readMysql(connection), targetFile, options);
}

function migrateFromDump(dumpFile, targetFile, options = {}) {
  return buildDatabase(readDump(fs.readFileSync(dumpFile, 'utf8')), targetFile, options);
}

module.exports = { migrateFromMysql, migrateFromDump, buildDatabase, hasData, timestamp };
