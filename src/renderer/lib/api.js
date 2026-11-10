/** A failure reported by the main process, with per-field messages for forms. */
export class ApiError extends Error {
  constructor({ message, code, fields }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields || {};
  }
}

/**
 * Ask the main process to run an operation (see src/main/ipc.js).
 * @param {string} method e.g. `orders.list`
 * @param {object} [payload]
 */
export async function call(method, payload) {
  const response = await window.workshop.call(method, payload);
  if (!response.ok) throw new ApiError(response.error);
  return response.data;
}
