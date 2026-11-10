import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib/preact.js';
import { Icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';

const cx = (...names) => names.filter(Boolean).join(' ');

export function Button({ variant = '', size = '', icon, children, class: extra, ...props }) {
  return html`<button type="button" class=${cx('btn', variant, size, extra)} ...${props}>
    ${icon && html`<${Icon} name=${icon} />`}${children}
  </button>`;
}

export function IconButton({ icon, label, danger, ...props }) {
  return html`<button type="button" class=${cx('icon-btn', danger && 'danger')} title=${label} aria-label=${label} ...${props}>
    <${Icon} name=${icon} />
  </button>`;
}

/** Money that always reads left-to-right, with the shop currency. */
export const Money = ({ value, class: extra }) => html`<span class=${cx('num', extra)}>${fmt.money(value)}</span>`;
export const Num = ({ children, class: extra }) => html`<span class=${cx('num', extra)}>${children}</span>`;
export const Plate = ({ children }) => html`<span class="plate num">${children}</span>`;

/** Paid / owing state of a record: label + colour, never colour alone. */
export function BalanceBadge({ remaining }) {
  if (remaining > 0.004) return html`<span class="badge warn">متبقٍ <${Money} value=${remaining} /></span>`;
  if (remaining < -0.004) return html`<span class="badge accent">رصيد دائن <${Money} value=${-remaining} /></span>`;
  return html`<span class="badge good"><${Icon} name="check" />مسدّد</span>`;
}

export function Field({ label, error, hint, children, class: extra }) {
  return html`<div class=${cx('field', extra)}>
    ${label && html`<label>${label}</label>`}
    ${children}
    ${error ? html`<span class="error" role="alert">${error}</span>` : hint && html`<span class="hint">${hint}</span>`}
  </div>`;
}

/** Text input bound to a form object: `value[name]`, `errors[name]`. */
export function TextInput({ form, name, label, hint, numeric, type = 'text', class: extra, affix, ...props }) {
  const input = html`<input
    class=${cx('input', numeric && 'num')}
    type=${type}
    inputmode=${numeric ? 'decimal' : undefined}
    value=${form.values[name] ?? ''}
    aria-invalid=${form.errors[name] ? 'true' : undefined}
    onInput=${(e) => form.set(name, e.target.value)}
    ...${props}
  />`;
  return html`<${Field} label=${label} error=${form.errors[name]} hint=${hint} class=${extra}>
    ${affix ? html`<div class="input-affix">${input}<span class="affix">${affix}</span></div>` : input}
  <//>`;
}

/**
 * Form state: values, per-field errors from the server, and a submit wrapper
 * that guards against double submission.
 */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors(({ [name]: _removed, ...rest }) => rest);
  };
  const patch = (changes) => setValues((v) => ({ ...v, ...changes }));

  const submit = async (action) => {
    if (busy) return undefined;
    setBusy(true);
    setMessage('');
    try {
      return await action(values);
    } catch (error) {
      setErrors(error.fields || {});
      setMessage(error.message || 'حدث خطأ غير متوقع');
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  return { values, errors, message, busy, set, patch, submit, setErrors };
}

/** Segmented control with a selection pill that slides between options. */
export function Segmented({ value, options, onChange, label }) {
  const root = useRef(null);
  const [thumb, setThumb] = useState(null);

  useLayoutEffect(() => {
    const active = root.current?.querySelector('[aria-pressed="true"]');
    if (active) setThumb({ left: active.offsetLeft, width: active.offsetWidth });
  }, [value, options.length]);

  return html`<div class="segmented" role="group" aria-label=${label} ref=${root}>
    ${thumb && html`<span class="thumb" style=${{ left: `${thumb.left}px`, width: `${thumb.width}px` }} />`}
    ${options.map((option) => html`<button type="button" key=${option.value}
      aria-pressed=${String(option.value === value)}
      onPointerDown=${() => onChange(option.value)}
      onClick=${() => onChange(option.value)}>${option.label}</button>`)}
  </div>`;
}

/** Search box that reports every keystroke — results update as you type. */
export function SearchField({ value, onChange, placeholder, autofocus }) {
  const input = useRef(null);
  useEffect(() => {
    if (autofocus) input.current?.focus();
  }, []);
  return html`<div class="search">
    <${Icon} name="search" />
    <input ref=${input} class="input" type="text" value=${value} placeholder=${placeholder}
      aria-label=${placeholder} onInput=${(e) => onChange(e.target.value)}
      onKeyDown=${(e) => e.key === 'Escape' && value && (e.stopPropagation(), onChange(''))} />
    ${value && html`<button type="button" class="icon-btn clear" aria-label="مسح البحث"
      onClick=${() => { onChange(''); input.current?.focus(); }}><${Icon} name="xCircle" /></button>`}
  </div>`;
}

export function Select({ value, options, onChange, label }) {
  return html`<select class="select" aria-label=${label} value=${value} onChange=${(e) => onChange(e.target.value)}>
    ${options.map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
  </select>`;
}

export function Empty({ icon = 'search', title, children, action }) {
  return html`<div class="empty">
    <${Icon} name=${icon} />
    <h2>${title}</h2>
    ${children && html`<p>${children}</p>`}
    ${action}
  </div>`;
}

export function Banner({ kind = '', icon, children }) {
  const name = icon || (kind === 'error' ? 'alert' : kind === 'good' ? 'checkCircle' : kind === 'warn' ? 'alert' : 'info');
  return html`<div class=${cx('banner', kind)} role=${kind === 'error' ? 'alert' : 'status'}>
    <${Icon} name=${name} /><div>${children}</div>
  </div>`;
}

/** The view's sticky translucent header; gains a hairline once content scrolls under it. */
export function Toolbar({ title, children, scrolled }) {
  return html`<header class="toolbar" data-scrolled=${String(Boolean(scrolled))}>
    ${title && html`<span class="toolbar-title">${title}</span>`}
    ${children}
  </header>`;
}

/** Scroll container + toolbar pair used by every screen. */
export function View({ title, toolbar, children, viewKey }) {
  const [scrolled, setScrolled] = useState(false);
  return html`
    <${Toolbar} title=${title} scrolled=${scrolled}>${toolbar}<//>
    <div class="view" onScroll=${(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
      <div class="view-inner view-enter" key=${viewKey}>${children}</div>
    </div>`;
}

export { cx };
