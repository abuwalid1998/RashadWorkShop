'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('../db/database');
const { ledgerHealth, recalculateRemaining } = require('../db/schema');
const { AppError } = require('../core/errors');
const { timestamp } = require('../migration/migrate');
const { formatDate, formatDateTime } = require('../core/dates');

const AUTO_BACKUPS_KEPT = 14;
const BACKUP_HOUR = 20; // 8 PM

/** Backups, restore and data checks for the open database. */
function createMaintenanceService(db, { backupsDir, settings }) {
  /** Write a consistent single-file copy of the live database. */
  function backupTo(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.rmSync(file, { force: true });
    db.run('VACUUM INTO ?', file);
    return file;
  }

  /** Where scheduled backups go: the folder chosen in Settings, else the app's own. */
  const backupFolder = () => settings.getValue('backup_folder') || backupsDir;
  const backupEnabled = () => settings.getValue('backup_enabled') !== '0';

  /**
   * The daily backup, due at 20:00.
   *
   * Called every minute while the app is open and once at launch. If the app
   * was closed at 20:00, the missed backup is taken the next time it opens,
   * so a day is never skipped just because the computer was off.
   *
   * @returns {string|null} the file written, or null when nothing was due
   */
  function scheduledBackup(now = new Date()) {
    if (!backupEnabled()) return null;
    const lastSlot = new Date(now);
    if (now.getHours() < BACKUP_HOUR) lastSlot.setDate(lastSlot.getDate() - 1);
    const due = formatDate(lastSlot);
    if ((settings.getValue('last_auto_backup') || '') >= due) return null;
    if (!db.get('SELECT EXISTS (SELECT 1 FROM account_items) AS ok').ok) return null;

    const folder = backupFolder();
    try {
      const file = backupTo(path.join(folder, `workshop-backup-${timestamp(now)}.db`));
      settings.setValue('last_auto_backup', due);
      settings.setValue('last_backup_at', formatDateTime(now));
      settings.setValue('last_backup_error', '');
      const old = fs.readdirSync(folder)
        .filter((name) => /^workshop-backup-\d{8}-\d{6}\.db$/.test(name))
        .sort()
        .slice(0, -AUTO_BACKUPS_KEPT);
      for (const name of old) fs.rmSync(path.join(folder, name), { force: true });
      return file;
    } catch (error) {
      // E.g. the chosen USB drive is unplugged. Remember why, and try again
      // on the next tick instead of losing the day's backup.
      settings.setValue('last_backup_error', error.message);
      return null;
    }
  }

  function setBackupFolder(folder) {
    const target = path.resolve(String(folder));
    fs.mkdirSync(target, { recursive: true });
    fs.accessSync(target, fs.constants.W_OK);
    settings.setValue('backup_folder', target);
    settings.setValue('last_backup_error', '');
    return info();
  }

  function setBackupEnabled(enabled) {
    settings.setValue('backup_enabled', enabled ? '1' : '0');
    return info();
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
      backupFolder: backupFolder(),
      backupEnabled: backupEnabled(),
      backupHour: BACKUP_HOUR,
      lastBackupAt: settings.getValue('last_backup_at'),
      lastBackupError: settings.getValue('last_backup_error') || '',
      ...counts,
      ...ledgerHealth(db),
    };
  }

  function fixRemaining() {
    return { corrected: recalculateRemaining(db) };
  }

  return { backupTo, scheduledBackup, setBackupFolder, setBackupEnabled, backupFolder, info, fixRemaining };
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
