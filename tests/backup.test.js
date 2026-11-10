'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTestApp, order } = require('./helpers');
const { createMaintenanceService } = require('../src/main/services/maintenance');
const { Database } = require('../src/main/db/database');

function setup() {
  const app = createTestApp();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rashad-backup-'));
  const maintenance = createMaintenanceService(app.db, { backupsDir: path.join(dir, 'default'), settings: app.settings });
  return { app, dir, maintenance };
}
const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute);

test('the daily backup runs at 8 PM, once, into the chosen folder', () => {
  const { app, dir, maintenance } = setup();
  app.orders.create(order());
  const chosen = path.join(dir, 'usb');
  maintenance.setBackupFolder(chosen);
  // Opening the app earlier in the day catches up on yesterday's slot.
  assert.ok(maintenance.scheduledBackup(at(10, 9)));

  assert.equal(maintenance.scheduledBackup(at(10, 19, 59)), null);
  const file = maintenance.scheduledBackup(at(10, 20, 0));
  assert.equal(path.dirname(file), chosen);
  assert.equal(maintenance.scheduledBackup(at(10, 20, 1)), null);
  assert.equal(maintenance.scheduledBackup(at(11, 10)), null);
  assert.ok(maintenance.scheduledBackup(at(11, 20, 5)));

  const copy = new Database(file);
  assert.equal(copy.get('SELECT COUNT(*) AS n FROM car_service_fixed').n, 1);
  copy.close();
});

test('a backup missed while the app was closed is taken at next launch', () => {
  const { app, maintenance } = setup();
  app.orders.create(order());
  assert.ok(maintenance.scheduledBackup(at(10, 20)));
  // Closed on the 11th at 8 PM; opened on the 12th in the morning.
  assert.ok(maintenance.scheduledBackup(at(12, 8)));
  assert.equal(maintenance.scheduledBackup(at(12, 9)), null);
});

test('disabled, empty, or unwritable: no backup, and the failure is reported', () => {
  const { app, dir, maintenance } = setup();
  assert.equal(maintenance.scheduledBackup(at(10, 21)), null); // nothing to back up yet
  app.orders.create(order());

  maintenance.setBackupEnabled(false);
  assert.equal(maintenance.scheduledBackup(at(10, 21)), null);
  maintenance.setBackupEnabled(true);

  const blocker = path.join(dir, 'file');
  fs.writeFileSync(blocker, 'x');
  app.settings.setValue('backup_folder', path.join(blocker, 'sub')); // cannot be created
  assert.equal(maintenance.scheduledBackup(at(10, 21)), null);
  assert.ok(maintenance.info().lastBackupError);

  maintenance.setBackupFolder(path.join(dir, 'ok'));
  assert.ok(maintenance.scheduledBackup(at(10, 21, 1))); // retried, not skipped
  assert.equal(maintenance.info().lastBackupError, '');
});

test('only the latest 14 daily backups are kept', () => {
  const { app, dir, maintenance } = setup();
  app.orders.create(order());
  const folder = path.join(dir, 'b');
  maintenance.setBackupFolder(folder);
  fs.writeFileSync(path.join(folder, 'my-notes.db'), 'keep me');
  for (let day = 1; day <= 20; day += 1) maintenance.scheduledBackup(at(day, 20));
  const files = fs.readdirSync(folder);
  assert.equal(files.filter((f) => f.startsWith('workshop-backup-')).length, 14);
  assert.ok(files.includes('my-notes.db'));
});
