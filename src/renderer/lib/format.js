import { getState } from './store.js';

const LOCALE = 'ar-PS-u-nu-latn-ca-gregory';

export function number(value, { decimals } = {}) {
  const n = Number(value) || 0;
  const fraction = decimals ?? (Number.isInteger(n) ? 0 : 2);
  return n.toLocaleString('en-US', { minimumFractionDigits: fraction, maximumFractionDigits: Math.max(fraction, 2) });
}

/**
 * `1250` -> `₪ 1,250`. Read right-to-left that is "1,250 shekels": the number
 * first, then the currency on its left. The isolate marks keep that order
 * whether the string lands in Arabic text or in a left-to-right number cell.
 */
export const money = (value) => `\u2066${getState().settings.currency || ''} ${number(value)}\u2069`;

/** Short form for tight spots: 12,900 -> 12.9K */
export function compact(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) < 10000) return number(Math.round(n));
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export const percent = (ratio) => `${Math.round((Number(ratio) || 0) * 100)}%`;

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parse(text) {
  const [y, m, d] = String(text ?? '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** `2026-03-05 10:00:00` -> `05/03/2026` */
export function date(text) {
  const d = parse(text);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
}

/** Today / yesterday in words, otherwise the date. */
export function relativeDate(text) {
  const d = parse(text);
  if (!d) return '—';
  const days = Math.round((parse(isoDate()) - d) / 86400000);
  if (days === 0) return 'اليوم';
  if (days === 1) return 'أمس';
  return date(text);
}

export const time = (text) => String(text ?? '').slice(11, 16);

export const longDate = (d = new Date()) =>
  new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);

/** `2026-11` -> `11/26` (axis label) */
export const monthShort = (month) => `${Number(month.slice(5, 7))}/${month.slice(2, 4)}`;

/** `2026-11` -> `تشرين الثاني 2026` */
export const monthLong = (month) =>
  new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));

export function greeting(d = new Date()) {
  const hour = d.getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'نهارك سعيد';
  return 'مساء الخير';
}

/** Arabic plural for counted nouns: one / two / few (3–10) / many. */
export function plural(count, [one, two, few, many]) {
  const n = Math.abs(Number(count) || 0);
  if (n === 1) return one;
  if (n === 2) return two;
  if (n % 100 >= 3 && n % 100 <= 10) return `${number(n)} ${few}`;
  return `${number(n)} ${many}`;
}

export const visits = (n) => plural(n, ['زيارة واحدة', 'زيارتان', 'زيارات', 'زيارة']);
export const days = (n) => plural(n, ['يوم واحد', 'يومان', 'أيام', 'يوماً']);
export const records = (n) => plural(n, ['سجل واحد', 'سجلان', 'سجلات', 'سجلاً']);
