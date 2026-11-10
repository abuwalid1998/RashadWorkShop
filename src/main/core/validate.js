'use strict';
const { AppError } = require('./errors');
const { toCents, fromCents } = require('./money');
const { isValidDate } = require('./dates');

/**
 * Collects field errors while reading an untrusted input object, then throws
 * one AppError carrying all of them, so the form can mark every bad field at
 * once instead of one per submit.
 */
function createValidator(input) {
  const source = input && typeof input === 'object' ? input : {};
  const fields = {};
  const fail = (name, message) => {
    if (!fields[name]) fields[name] = message;
  };

  return {
    fail,

    text(name, { required = false, max = 190, label = 'هذا الحقل' } = {}) {
      const value = String(source[name] ?? '').replace(/\s+/g, ' ').trim();
      if (required && !value) fail(name, `${label} مطلوب`);
      else if (value.length > max) fail(name, `${label} طويل جداً`);
      return value;
    },

    /** A non-negative amount with at most two decimals. */
    amount(name, { required = false, label = 'المبلغ' } = {}) {
      const raw = source[name];
      const empty = raw === undefined || raw === null || String(raw).trim() === '';
      if (empty) {
        if (required) fail(name, `${label} مطلوب`);
        return 0;
      }
      const n = Number(String(raw).trim().replace(',', '.'));
      if (!Number.isFinite(n)) {
        fail(name, `${label} يجب أن يكون رقماً`);
        return 0;
      }
      if (n < 0) {
        fail(name, `${label} لا يمكن أن يكون سالباً`);
        return 0;
      }
      if (n > 99999999) {
        fail(name, `${label} كبير جداً`);
        return 0;
      }
      return fromCents(toCents(n));
    },

    integer(name, { required = false, min = 0, max = 99999999, label = 'القيمة' } = {}) {
      const raw = source[name];
      const empty = raw === undefined || raw === null || String(raw).trim() === '';
      if (empty) {
        if (required) fail(name, `${label} مطلوب`);
        return 0;
      }
      const n = Number(String(raw).trim());
      if (!Number.isInteger(n)) {
        fail(name, `${label} يجب أن يكون رقماً صحيحاً`);
        return 0;
      }
      if (n < min || n > max) fail(name, `${label} خارج النطاق المسموح`);
      return n;
    },

    date(name, { required = false, fallback = '', label = 'التاريخ' } = {}) {
      const value = String(source[name] ?? '').trim();
      if (!value) {
        if (required && !fallback) fail(name, `${label} مطلوب`);
        return fallback;
      }
      if (!isValidDate(value)) {
        fail(name, `${label} غير صحيح`);
        return fallback;
      }
      return value;
    },

    /** Throws if any field failed. */
    done(message = 'يرجى تصحيح الحقول المحددة') {
      const names = Object.keys(fields);
      if (names.length) throw new AppError(names.length === 1 ? fields[names[0]] : message, { fields });
    },
  };
}

module.exports = { createValidator };
