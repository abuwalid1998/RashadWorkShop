import { html, useRef, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { Field, Plate, cx } from './ui.js';
import * as fmt from '../lib/format.js';

/**
 * Text field that offers known customers/vehicles while typing.
 * Arrow keys move, Enter picks, and picking fills the related fields too.
 */
export function SuggestInput({ form, name, label, numeric, onPick, ...props }) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const ticket = useRef(0);

  const search = async (query) => {
    ticket.current += 1;
    const mine = ticket.current;
    if (query.trim().length < 2) {
      setItems([]);
      return;
    }
    const results = await call('accounts.suggest', { query, limit: 6 }).catch(() => []);
    if (mine !== ticket.current) return;
    setItems(results);
    setActive(0);
    setOpen(true);
  };

  const pick = (item) => {
    setOpen(false);
    setItems([]);
    onPick(item);
  };

  const onKeyDown = (event) => {
    if (!open || !items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(items[active]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  };

  return html`<${Field} label=${label} error=${form.errors[name]}>
    <div class="suggest">
      <input class=${cx('input', numeric && 'num')} type="text" autocomplete="off"
        value=${form.values[name] ?? ''} aria-invalid=${form.errors[name] ? 'true' : undefined}
        role="combobox" aria-expanded=${String(open && items.length > 0)} aria-autocomplete="list"
        onInput=${(e) => { form.set(name, e.target.value); search(e.target.value); }}
        onKeyDown=${onKeyDown}
        onBlur=${() => setTimeout(() => setOpen(false), 120)}
        ...${props} />
      ${open && items.length > 0 && html`<ul class="suggest-list" role="listbox">
        ${items.map((item, index) => html`<li key=${`${item.account_key}:${item.vehicle_id}`} role="option"
            aria-selected=${String(index === active)}
            onPointerEnter=${() => setActive(index)}
            onPointerDown=${(e) => { e.preventDefault(); pick(item); }}>
          <span class="name">${item.customer_name}</span>
          <${Plate}>${item.vehicle_id}<//>
          <span class="faint num">${fmt.date(item.last_date)}</span>
        </li>`)}
      </ul>`}
    </div>
  <//>`;
}
