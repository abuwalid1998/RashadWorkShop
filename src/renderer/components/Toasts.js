import { html, useEffect, useRef } from '../lib/preact.js';
import { useStore, dismissToast } from '../lib/store.js';
import { usePresence } from '../lib/hooks.js';
import { Icon } from '../lib/icons.js';

const ICONS = { success: 'checkCircle', error: 'alert', info: 'info' };

function Toast({ toast }) {
  const element = useRef(null);
  const timer = useRef(0);

  const close = usePresence((p, reduced) => {
    if (!element.current) return;
    element.current.style.opacity = String(Math.min(1, p));
    element.current.style.transform = reduced ? 'none' : `translateY(${(1 - p) * 20}px) scale(${0.94 + 0.06 * p})`;
  }, () => dismissToast(toast.id), { response: 0.3, damping: 0.86 });

  const arm = () => {
    timer.current = setTimeout(close, toast.duration);
  };
  useEffect(() => {
    arm();
    return () => clearTimeout(timer.current);
  }, []);

  return html`<div class=${`toast ${toast.kind}`} ref=${element} role="status"
      onPointerEnter=${() => clearTimeout(timer.current)} onPointerLeave=${arm}>
    <${Icon} name=${ICONS[toast.kind] || 'info'} />
    <span>${toast.message}</span>
    ${toast.action && html`<button type="button" class="toast-action"
      onClick=${() => { toast.action.run(); close(); }}>${toast.action.label}</button>`}
  </div>`;
}

/** Brief confirmations at the bottom of the window; the place where Undo lives. */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return html`<div class="toasts" aria-live="polite">
    ${toasts.map((toast) => html`<${Toast} key=${toast.id} toast=${toast} />`)}
  </div>`;
}
