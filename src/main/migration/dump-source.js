'use strict';
/**
 * Read tables out of a MySQL dump file (phpMyAdmin "Export" or `mysqldump`),
 * for when the old server is no longer running. Understands CREATE TABLE,
 * INSERT INTO ... VALUES and the ALTER TABLE statements phpMyAdmin uses to
 * declare primary keys and AUTO_INCREMENT.
 */

const ESCAPES = { 0: '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };

/** `i` points at an opening quote; returns the index just past its closing quote. */
function skipQuoted(text, i) {
  const quote = text[i];
  i += 1;
  while (i < text.length) {
    if (text[i] === '\\' && quote !== '`') i += 2;
    else if (text[i] !== quote) i += 1;
    else if (text[i + 1] === quote) i += 2;
    else return i + 1;
  }
  return i;
}

const isQuote = (ch) => ch === "'" || ch === '"' || ch === '`';

/** Split a dump into statements, ignoring comments and `;` inside strings. */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let start = 0;
  let i = 0;
  const n = sql.length;
  const flushTo = (end) => {
    current += sql.slice(start, end);
  };
  while (i < n) {
    const ch = sql[i];
    if (isQuote(ch)) {
      i = skipQuoted(sql, i);
    } else if ((ch === '-' && sql[i + 1] === '-') || ch === '#' || (ch === '/' && sql[i + 1] === '*')) {
      // Drop the comment from the statement text.
      flushTo(i);
      if (ch === '/') {
        const end = sql.indexOf('*/', i + 2);
        i = end === -1 ? n : end + 2;
      } else {
        const end = sql.indexOf('\n', i);
        i = end === -1 ? n : end;
      }
      current += ' ';
      start = i;
    } else if (ch === ';') {
      flushTo(i);
      if (current.trim()) statements.push(current.trim());
      current = '';
      i += 1;
      start = i;
    } else i += 1;
  }
  flushTo(n);
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const unquote = (name) => name.trim().replace(/^[`"]|[`"]$/g, '').replace(/``/g, '`');

/** Split on top-level commas (not inside parentheses or strings). */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isQuote(ch)) {
      i = skipQuoted(text, i);
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseCreateTable(statement, tables) {
  const head = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:`[^`]+`|"[^"]+"|[\w$]+)(?:\.(?:`[^`]+`|[\w$]+))?)\s*\(/i.exec(statement);
  if (!head) return;
  const name = unquote(head[1].split('.').pop());
  const body = statement.slice(head[0].length, statement.lastIndexOf(')'));
  const table = { name, columns: [], rows: [] };
  for (const part of splitTopLevel(body)) {
    const key = /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(part);
    if (key) {
      const names = key[1].split(',').map((c) => unquote(c.replace(/\(\d+\)/, '')));
      for (const column of table.columns) if (names.includes(column.name)) column.primary = true;
      continue;
    }
    if (/^(UNIQUE|KEY|INDEX|FULLTEXT|SPATIAL|CONSTRAINT|FOREIGN|CHECK)\b/i.test(part)) continue;
    const column = /^(`[^`]+`|"[^"]+"|[\w$]+)\s+(.+)$/s.exec(part);
    if (!column) continue;
    table.columns.push({
      name: unquote(column[1]),
      type: column[2].trim().split(/\s+/)[0].toLowerCase(),
      primary: /\bPRIMARY\s+KEY\b/i.test(column[2]),
      autoIncrement: /\bAUTO_INCREMENT\b/i.test(column[2]),
    });
  }
  tables.set(name, table);
}

function parseAlterTable(statement, tables) {
  const head = /^ALTER\s+TABLE\s+(`[^`]+`|[\w$]+)\s+/i.exec(statement);
  const table = head && tables.get(unquote(head[1]));
  if (!table) return;
  for (const part of splitTopLevel(statement.slice(head[0].length))) {
    const key = /^ADD\s+PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(part);
    if (key) {
      const names = key[1].split(',').map((c) => unquote(c));
      for (const column of table.columns) if (names.includes(column.name)) column.primary = true;
    }
    const modify = /^MODIFY\s+(`[^`]+`|[\w$]+)\s+(.+)$/is.exec(part);
    if (modify && /\bAUTO_INCREMENT\b/i.test(modify[2])) {
      const column = table.columns.find((c) => c.name === unquote(modify[1]));
      if (column) column.autoIncrement = true;
    }
  }
}

/** Parse `(1,'a',NULL),(2,'b',0x41)` into arrays of values. */
function parseValues(text) {
  const rows = [];
  let i = 0;
  const n = text.length;
  const skipSpace = () => {
    while (i < n && /\s/.test(text[i])) i += 1;
  };

  function readString() {
    const quote = text[i];
    let out = '';
    i += 1;
    while (i < n) {
      const ch = text[i];
      if (ch === '\\') {
        const next = text[i + 1];
        out += next in ESCAPES ? ESCAPES[next] : next;
        i += 2;
      } else if (ch === quote) {
        if (text[i + 1] === quote) {
          out += quote;
          i += 2;
        } else {
          i += 1;
          return out;
        }
      } else {
        out += ch;
        i += 1;
      }
    }
    throw new Error('نص غير مغلق داخل ملف التصدير');
  }

  function readValue() {
    skipSpace();
    const ch = text[i];
    if (ch === "'" || ch === '"') return readString();
    const start = i;
    while (i < n && text[i] !== ',' && text[i] !== ')') i += 1;
    const token = text.slice(start, i).trim();
    if (/^null$/i.test(token)) return null;
    if (/^0x[0-9a-f]*$/i.test(token)) return Buffer.from(token.slice(2), 'hex');
    if (/^_binary\b/i.test(token)) return token;
    const number = Number(token);
    return token !== '' && Number.isFinite(number) ? number : token;
  }

  while (i < n) {
    skipSpace();
    if (text[i] !== '(') break;
    i += 1;
    const row = [];
    for (;;) {
      row.push(readValue());
      skipSpace();
      if (text[i] === ',') {
        i += 1;
        continue;
      }
      if (text[i] === ')') {
        i += 1;
        break;
      }
      throw new Error('صيغة INSERT غير متوقعة في ملف التصدير');
    }
    rows.push(row);
    skipSpace();
    if (text[i] === ',') i += 1;
  }
  return rows;
}

function parseInsert(statement, tables) {
  const head = /^(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+(`[^`]+`|"[^"]+"|[\w$]+)\s*(\(([^)]*)\))?\s*VALUES\s*/i.exec(statement);
  if (!head) return;
  const name = unquote(head[1]);
  let table = tables.get(name);
  const listed = head[3] ? head[3].split(',').map(unquote) : null;
  if (!table) {
    if (!listed) throw new Error(`الجدول ${name} بلا تعريف أعمدة في ملف التصدير`);
    table = { name, columns: listed.map((c) => ({ name: c, type: 'text', primary: false, autoIncrement: false })), rows: [] };
    tables.set(name, table);
  }
  const rows = parseValues(statement.slice(head[0].length));
  if (!listed) {
    table.rows.push(...rows);
    return;
  }
  // Re-order to the table's declared column order.
  const positions = table.columns.map((c) => listed.indexOf(c.name));
  for (const row of rows) table.rows.push(positions.map((p) => (p === -1 ? null : row[p])));
}

/** @returns {{ database: string, tables: Array<object> }} same shape as readMysql() */
function readDump(sqlText) {
  const tables = new Map();
  for (const statement of splitStatements(String(sqlText).replace(/^﻿/, ''))) {
    if (/^CREATE\s+TABLE/i.test(statement)) parseCreateTable(statement, tables);
    else if (/^ALTER\s+TABLE/i.test(statement)) parseAlterTable(statement, tables);
    else if (/^(INSERT|REPLACE)\s/i.test(statement)) parseInsert(statement, tables);
  }
  if (!tables.size) throw new Error('لم يُعثر على جداول في الملف. تأكد أنه ملف تصدير SQL من MySQL.');
  return { database: 'dump', tables: [...tables.values()] };
}

module.exports = { readDump, splitStatements, parseValues };
