'use strict';
const { DatabaseSync } = require('node:sqlite');

/**
 * Thin wrapper over Node's built-in SQLite driver: cached prepared
 * statements and nestable transactions. No native add-on to compile, so the
 * packaged app has no external dependencies.
 */
class Database {
  constructor(file) {
    this.file = file;
    this.raw = new DatabaseSync(file);
    this.statements = new Map();
    this.depth = 0;
    this.raw.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 4000;
    `);
  }

  prepare(sql) {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.raw.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  all(sql, ...params) {
    return this.prepare(sql).all(...params);
  }

  get(sql, ...params) {
    return this.prepare(sql).get(...params);
  }

  /** @returns {{ changes: number, lastInsertRowid: number }} */
  run(sql, ...params) {
    const result = this.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  exec(sql) {
    this.raw.exec(sql);
  }

  /** Run `fn` atomically. Nested calls become savepoints. */
  transaction(fn) {
    const name = `sp_${this.depth}`;
    this.raw.exec(this.depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
    this.depth += 1;
    try {
      const result = fn();
      this.depth -= 1;
      this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
      return result;
    } catch (error) {
      this.depth -= 1;
      this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
      throw error;
    }
  }

  /**
   * Changes whenever any row is written on this connection (triggers
   * included). Services use it to know when a cached result is stale.
   */
  get revision() {
    return this.get('SELECT total_changes() AS n').n;
  }

  tableExists(name) {
    return Boolean(this.get("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?", name));
  }

  columns(table) {
    return this.all(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).map((c) => c.name);
  }

  close() {
    if (!this.raw) return;
    this.statements.clear();
    try {
      this.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // A failed checkpoint only leaves the -wal file behind; data is safe.
    }
    this.raw.close();
    this.raw = null;
  }
}

module.exports = { Database };
