'use strict';

/** An expected, user-facing failure (validation, not-found, conflict). */
class AppError extends Error {
  /**
   * @param {string} message Arabic message shown to the user.
   * @param {{ code?: string, fields?: Record<string, string> }} [details]
   */
  constructor(message, { code = 'invalid', fields = {} } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
  }
}

const notFound = (what) => new AppError(`${what} غير موجود. ربما تم حذفه.`, { code: 'not_found' });

module.exports = { AppError, notFound };
