'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('./db/database');
const { createServices } = require('./services');
const { createMaintenanceService, assertWorkshopDatabase } = require('./services/maintenance');
const { timestamp } = require('./migration/migrate');

/**
 * Owns the open database and the services bound to it. Restore and import
 * swap the database file underneath, so everything else asks the context
 * for `services` at call time instead of holding a reference.
 */
class AppContext {
  constructor({ file, backupsDir }) {
    this.file = file;
    this.backupsDir = backupsDir;
    this.db = null;
    this.services = null;
  }

  open() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = new Database(this.file);
    const services = createServices(this.db);
    services.maintenance = createMaintenanceService(this.db, {
      backupsDir: this.backupsDir,
      settings: services.settings,
    });
    this.services = services;
    return this;
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
    this.services = null;
  }

  /**
   * Run `replace()` — which rewrites the database file — with the database
   * closed, then reopen. If it throws, the original file is reopened as-is.
   */
  async swapDatabase(replace) {
    this.close();
    try {
      return await replace(this.file);
    } finally {
      this.open();
    }
  }

  /** Replace the live database with a backup file; the current one is kept. */
  async restoreFrom(sourceFile) {
    assertWorkshopDatabase(sourceFile);
    return this.swapDatabase((target) => {
      fs.mkdirSync(this.backupsDir, { recursive: true });
      const safety = path.join(this.backupsDir, `workshop-before-restore-${timestamp()}.db`);
      if (fs.existsSync(target)) fs.copyFileSync(target, safety);
      for (const suffix of ['-wal', '-shm']) fs.rmSync(target + suffix, { force: true });
      fs.copyFileSync(sourceFile, target);
      return { safety };
    });
  }
}

module.exports = { AppContext };
