'use strict';
/**
 * Text normalisation used for searching and for grouping orders into customer
 * accounts. The same rules exist twice — once in JavaScript (for search terms)
 * and once as a SQL expression built from SQLite built-ins (for stored
 * columns) — and `tests/normalize.test.js` proves they agree.
 *
 * Rules: unify Alef forms (أ إ آ -> ا), final Ya (ى -> ي), Ta marbuta (ة -> ه),
 * drop tatweel (ـ), collapse repeated spaces, trim, lowercase ASCII.
 * So "أحمد  خليل" and "احمد خليل" are the same customer.
 */

const REPLACEMENTS = [
  ['ـ', ''],
  ['أ', 'ا'],
  ['إ', 'ا'],
  ['آ', 'ا'],
  ['ى', 'ي'],
  ['ة', 'ه'],
  ['  ', ' '],
  ['  ', ' '],
];

const VEHICLE_SEPARATORS = [' ', '-', '.', '/', '_'];

const asciiLower = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
const trimSpaces = (s) => s.replace(/^ +| +$/g, '');

function nameKey(text) {
  let s = String(text ?? '');
  for (const [from, to] of REPLACEMENTS) s = s.split(from).join(to);
  return asciiLower(trimSpaces(s));
}

/** Plate numbers ignore separators: "12-345-67" == "1234567". */
function vehicleKey(text) {
  let s = String(text ?? '');
  for (const sep of VEHICLE_SEPARATORS) s = s.split(sep).join('');
  return asciiLower(s);
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

function nameKeySql(column) {
  let expr = `COALESCE(${column}, '')`;
  for (const [from, to] of REPLACEMENTS) expr = `replace(${expr}, ${sqlText(from)}, ${sqlText(to)})`;
  return `lower(trim(${expr}))`;
}

function vehicleKeySql(column) {
  let expr = `COALESCE(${column}, '')`;
  for (const sep of VEHICLE_SEPARATORS) expr = `replace(${expr}, ${sqlText(sep)}, '')`;
  return `lower(${expr})`;
}

/** Escape a term for `LIKE ... ESCAPE '\'` and wrap it for a contains match. */
const likeContains = (term) => `%${String(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

module.exports = { nameKey, vehicleKey, nameKeySql, vehicleKeySql, likeContains };
