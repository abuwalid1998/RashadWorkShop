import { html, createContext, useContext, useEffect, useRef } from '../lib/preact.js';
import { usePresence } from '../lib/hooks.js';
import { IconButton, Button, cx } from './ui.js';

const SheetContext = createContext({ close: () => {} });

/** Inside a sheet: `useSheet().close()` animates it away. */
export const useSheet = () => useContext(SheetContext);

/**
 * Modal sheet. It materialises with a spring (scale + fade over a dimmed,
 * slightly blurred backdrop) and leaves along the same path. Because the
 * spring is re-targetable, pressing Escape mid-entrance reverses smoothly.
 *
 * @param {{ title?: string, size?: ''|'wide'|'narrow'|'full', onClose: () => void, dismissable?: boolean }} props
 */
export function Sheet({ title, size = '', onClose, dismissable = true, children, headExtra }) {
  const scrim = useRef(null);
  const panel = useRef(null);

  const close = usePresence((p, reduced) => {
    if (scrim.current) scrim.current.style.opacity = String(Math.min(1, p));
    if (!panel.current) return;
    panel.current.style.opacity = String(Math.min(1, p * 1.4));
    panel.current.style.transform = reduced ? 'none' : `translateY(${(1 - p) * 14}px) scale(${0.96 + 0.04 * p})`;
  }, onClose);

  useEffect(() => {
    const previous = document.activeElement;
    const target = panel.current?.querySelector('[data-autofocus], input:not([type="hidden"]), select, textarea, button.primary');
    target?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape' && dismissable) {
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        // Keep focus inside the sheet.
        const focusable = [...panel.current.querySelectorAll('button, input, select, textarea, [tabindex]')]
          .filter((el) => !el.disabled && el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, []);

  return html`<${SheetContext.Provider} value=${{ close }}>
    <div class="sheet-layer">
      <div class="sheet-scrim" ref=${scrim} onPointerDown=${() => dismissable && close()} />
      <div class=${cx('sheet', size)} ref=${panel} role="dialog" aria-modal="true" aria-label=${title}>
        ${title && html`<div class="sheet-head">
          <h2>${title}</h2>
          ${headExtra}
          <${IconButton} icon="x" label="إغلاق" onClick=${close} />
        </div>`}
        ${children}
      </div>
    </div>
  <//>`;
}

/**
 * Confirmation for destructive actions. The destructive button is never the
 * default, so a stray Enter cannot delete anything.
 */
export function Confirm({ title, message, confirmLabel = 'حذف', onConfirm, onClose }) {
  return html`<${Sheet} size="narrow" onClose=${onClose}>
    <${ConfirmBody} title=${title} message=${message} confirmLabel=${confirmLabel} onConfirm=${onConfirm} />
  <//>`;
}

function ConfirmBody({ title, message, confirmLabel, onConfirm }) {
  const { close } = useSheet();
  return html`<div class="alert">
    <h2>${title}</h2>
    <p>${message}</p>
    <div class="actions">
      <${Button} data-autofocus onClick=${close}>إلغاء<//>
      <${Button} variant="danger" onClick=${() => { onConfirm(); close(); }}>${confirmLabel}<//>
    </div>
  </div>`;
}
