'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('../db/database');
const { ledgerHealth, recalculateRemaining } = require('../db/schema');
const { AppError } = require('../core/errors');
const { timestamp } = require('../migration/migrate');
const { today } = require('../core/dates');

const AUTO_BACKUPS_KEPT = 14;

/** Backups, restore and data checks for the open database. */
function createMaintenanceService(db, { backupsDir, settings }) {
  /** Write a consistent single-file copy of the live database. */
  function backupTo(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.rmSync(file, { force: true });
    db.run('VACUUM INTO ?', file);
    return file;
  }

  /** One automatic backup per day, pruned to the most recent few. */
  function autoBackup() {
    if (settings.getValue('last_auto_backup') === today()) return null;
    const hasRecords = db.get('SELECT EXISTS (SELECT 1 FROM account_items) AS ok').ok;
    if (!hasRecords) return null;
    const file = backupTo(path.join(backupsDir, `workshop-auto-${timestamp()}.db`));
    settings.setValue('last_auto_backup', today());
    const old = fs.readdirSync(backupsDir)
      .filter((name) => /^workshop-auto-.*\.db$/.test(name))
      .sort()
      .slice(0, -AUTO_BACKUPS_KEPT);
    for (const name of old) fs.rmSync(path.join(backupsDir, name), { force: true });
    return file;
  }

  function info() {
    const counts = db.get(
      `SELECT (SELECT COUNT(*) FROM car_service_fixed) AS orders,
              (SELECT COUNT(*) FROM battery_warranty) AS batteries,
              (SELECT COUNT(DISTINCT receipt_no) FROM payments WHERE kind <> 'adjust') AS receipts,
              (SELECT COUNT(*) FROM settlements) AS settlements`);
    let size = 0;
    try {
      size = fs.statSync(db.file).size;
    } catch {
      // In-memory database (tests) has no file.
    }
    return {
      file: db.file,
      size,
      backupsDir,
      lastAutoBackup: settings.getValue('last_auto_backup'),
      ...counts,
      ...ledgerHealth(db),
    };
  }

  function fixRemaining() {
    return { corrected: recalculateRemaining(db) };
  }

  return { backupTo, autoBackup, info, fixRemaining };
}

/** Reject files that are not a workshop database before restoring them. */
function assertWorkshopDatabase(file) {
  let candidate;
  try {
    candidate = new Database(file);
    const ok = candidate.tableExists('car_service_fixed') && candidate.tableExists('battery_warranty');
    if (!ok) throw new Error('missing tables');
  } catch {
    throw new AppError('الملف المحدد ليس نسخة احتياطية صالحة لقاعدة بيانات الورشة', { code: 'bad_file' });
  } finally {
    try {
      candidate?.close();
    } catch {
      // Not a database: nothing to close.
    }
  }
}

module.exports = { createMaintenanceService, assertWorkshopDatabase };
