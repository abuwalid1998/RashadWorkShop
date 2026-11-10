import { useEffect, useState } from './preact.js';

/**
 * Minimal global state: app settings, a data version that tells views to
 * refetch after any change, and the toast queue.
 */
const state = {
  settings: { shop_name: 'ورشة رشاد', currency: '₪' },
  catalog: [],
  platform: '',
  version: '',
  today: '',
  dataVersion: 0,
  toasts: [],
};
const listeners = new Set();

export const getState = () => state;

export function setState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener();
}

/** Re-render when the selected slice of state changes. */
export function useStore(select) {
  const [value, setValue] = useState(() => select(state));
  useEffect(() => {
    const update = () => setValue(select(state));
    listeners.add(update);
    update();
    return () => listeners.delete(update);
  }, []);
  return value;
}

/** Call after a write so every visible list and number refreshes. */
export const invalidate = () => setState({ dataVersion: state.dataVersion + 1 });

let toastId = 0;

/**
 * @param {string} message
 * @param {{ kind?: 'success'|'error'|'info', action?: { label: string, run: () => void }, duration?: number }} [options]
 */
export function toast(message, { kind = 'success', action = null, duration } = {}) {
  toastId += 1;
  const entry = { id: toastId, message, kind, action, duration: duration ?? (action ? 7000 : 3800) };
  setState({ toasts: [...state.toasts.slice(-2), entry] });
  return entry.id;
}

export const dismissToast = (id) => setState({ toasts: state.toasts.filter((t) => t.id !== id) });

export const toastError = (error) => toast(error?.message || 'حدث خطأ غير متوقع', { kind: 'error', duration: 6000 });
