'use strict';
/**
 * Dates are stored as local-time text, `YYYY-MM-DD HH:MM:SS`, exactly what
 * MySQL's `current_timestamp()` produced in the legacy system. Text in this
 * shape sorts chronologically, so range filters stay index-friendly.
 */

const pad = (n) => String(n).padStart(2, '0');

const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const formatDateTime = (d) =>
  `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const now = () => formatDateTime(new Date());
const today = () => formatDate(new Date());

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD. */
function isValidDate(text) {
  const m = DATE_RE.exec(String(text ?? ''));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** Date part of a stored value (`2024-05-01 10:00:00` -> `2024-05-01`). */
const datePart = (text) => String(text ?? '').slice(0, 10);

/**
 * Combine a user-picked day with the current clock time, so records entered
 * on the same day keep their entry order.
 */
function withCurrentTime(day, reference = new Date()) {
  return `${day} ${pad(reference.getHours())}:${pad(reference.getMinutes())}:${pad(reference.getSeconds())}`;
}

function parseDate(text) {
  const [y, m, d] = datePart(text).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(day, count) {
  const d = parseDate(day);
  d.setDate(d.getDate() + count);
  return formatDate(d);
}

/** Calendar-aware month addition (31 Jan + 1 month = 28/29 Feb). */
function addMonths(day, count) {
  const d = parseDate(day);
  const target = new Date(d.getFullYear(), d.getMonth() + count, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return formatDate(target);
}

const monthStart = (day) => `${datePart(day).slice(0, 7)}-01`;

function daysBetween(fromDay, toDay) {
  return Math.round((parseDate(toDay) - parseDate(fromDay)) / 86400000);
}

module.exports = {
  now, today, formatDate, formatDateTime, isValidDate, datePart,
  withCurrentTime, parseDate, addDays, addMonths, monthStart, daysBetween,
};
