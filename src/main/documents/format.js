'use strict';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for HTML. Every value from the database goes through this. */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

function formatNumber(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Amount with currency. Inside the left-to-right span the currency comes
 * first, so in the right-to-left page it reads "1,250 ₪": number, then unit.
 */
const money = (value, currency) =>
  `<span class="num" dir="ltr">${currency ? `${esc(currency)} ` : ''}${formatNumber(value)}</span>`;

/** Blank for zero: keeps debit/credit columns easy to scan. */
const moneyOrDash = (value, currency) => (Number(value) ? money(value, currency) : '<span class="muted">—</span>');

/** `2026-03-05 10:00:00` -> `05/03/2026` */
function formatDate(text) {
  const [y, m, d] = String(text ?? '').slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

const date = (text) => `<span class="num" dir="ltr">${formatDate(text) || '—'}</span>`;

module.exports = { esc, formatNumber, money, moneyOrDash, formatDate, date };
