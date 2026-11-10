'use strict';
/**
 * Money helpers. Amounts are stored as REAL (same as the legacy MySQL schema)
 * but every calculation goes through integer cents so results never drift
 * (0.1 + 0.2 style errors).
 */

const toCents = (value) => {
  const n = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const fromCents = (cents) => Math.round(cents) / 100;

const round2 = (value) => fromCents(toCents(value));

const sum = (values) => fromCents(values.reduce((acc, v) => acc + toCents(v), 0));

module.exports = { toCents, fromCents, round2, sum };
