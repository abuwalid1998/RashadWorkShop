import { setState, getState } from '../lib/store.js';

/**
 * Overlays (sheets) are opened from anywhere — a row, the dashboard, a menu
 * shortcut, a toast — so they live in global state and are rendered once by
 * the app shell.
 *
 * @param {{ type: string, [key: string]: unknown }} overlay
 */
export function openOverlay(overlay) {
  setState({ overlays: [...(getState().overlays || []), { id: Date.now() + Math.random(), ...overlay }] });
}

export function closeOverlay(id) {
  setState({ overlays: (getState().overlays || []).filter((o) => o.id !== id) });
}

export const openOrderForm = (props = {}) => openOverlay({ type: 'order', ...props });
export const openBatteryForm = (props = {}) => openOverlay({ type: 'battery', ...props });
export const openPayment = (props = {}) => openOverlay({ type: 'payment', ...props });
export const openDocument = (request) => openOverlay({ type: 'document', request });
export const openConfirm = (props) => openOverlay({ type: 'confirm', ...props });
export const openPalette = () => {
  if (!(getState().overlays || []).some((o) => o.type === 'palette')) openOverlay({ type: 'palette' });
};
