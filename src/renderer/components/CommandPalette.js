import { html, useEffect, useRef, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { usePresence } from '../lib/hooks.js';
import { Icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { openOrderForm, openBatteryForm, openPayment } from './overlays.js';

/**
 * Quick search (Ctrl/Cmd+K): find a customer, vehicle or order from anywhere,
 * or jump straight to a common action.
 */
export function CommandPalette({ onClose, navigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [active, setActive] = useState(0);
  const scrim = useRef(null);
  const panel = useRef(null);
  const input = useRef(null);
  const ticket = useRef(0);

  useEffect(() => {
    const previous = document.activeElement;
    input.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const close = usePresence((p, reduced) => {
    if (scrim.current) scrim.current.style.opacity = String(Math.min(1, p));
    if (!panel.current) return;
    panel.current.style.opacity = String(Math.min(1, p * 1.5));
    panel.current.style.transform = reduced ? 'none' : `translateY(${(p - 1) * 10}px) scale(${0.97 + 0.03 * p})`;
  }, onClose, { response: 0.26 });

  useEffect(() => {
    ticket.current += 1;
    const mine = ticket.current;
    if (!query.trim()) {
      setResults(null);
      setActive(0);
      return;
    }
    call('search.global', { query }).then((data) => {
      if (mine !== ticket.current) return;
      setResults(data);
      setActive(0);
    });
  }, [query]);

  const run = (action) => {
    close();
    action();
  };

  const actions = [
    { key: 'a-order', icon: 'plus', title: 'طلب جديد', hint: 'Ctrl N', run: () => openOrderForm() },
    { key: 'a-pay', icon: 'card', title: 'تسديد دفعة', hint: 'Ctrl P', run: () => openPayment() },
    { key: 'a-battery', icon: 'battery', title: 'بطارية جديدة', run: () => openBatteryForm() },
  ];

  const groups = results
    ? [
      {
        label: 'العملاء',
        items: results.accounts.map((a) => ({
          key: `acc-${a.key}`, icon: 'people', title: a.name,
          meta: html`<span class="faint num">${a.vehicles.slice(0, 2).join(' · ')}</span>
            ${a.balance > 0.004 ? html`<span class="badge warn num">${fmt.money(a.balance)}</span>` : ''}`,
          run: () => navigate('accounts', { key: a.key }),
        })),
      },
      {
        label: 'الطلبات',
        items: results.orders.map((o) => ({
          key: `ord-${o.order_id}`, icon: 'wrench', title: html`طلب <span class="num">#${o.order_id}</span> — ${o.customer_name}`,
          meta: html`<span class="faint num">${o.vehicle_id} · ${fmt.date(o.order_date)}</span>`,
          run: () => openOrderForm({ order: o }),
        })),
      },
      {
        label: 'البطاريات',
        items: results.batteries.map((b) => ({
          key: `bat-${b.id}`, icon: 'battery', title: html`${b.battery_type || 'بطارية'} — ${b.customer_name}`,
          meta: html`<span class="faint num">${b.vehicle_id}</span>`,
          run: () => openBatteryForm({ battery: b }),
        })),
      },
    ].filter((g) => g.items.length)
    : [{ label: 'إجراءات سريعة', items: actions }];

  const flat = groups.flatMap((g) => g.items);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && flat[active]) {
      event.preventDefault();
      run(flat[active].run);
    }
  };

  useEffect(() => {
    panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let index = -1;
  return html`<div class="palette-layer" onKeyDown=${onKeyDown}>
    <div class="sheet-scrim" ref=${scrim} onPointerDown=${close} />
    <div class="palette" ref=${panel} role="dialog" aria-label="بحث سريع">
      <div class="palette-input">
        <${Icon} name="search" />
        <input type="text" placeholder="ابحث عن عميل، رقم سيارة أو رقم طلب…" value=${query} ref=${input}
          onInput=${(e) => setQuery(e.target.value)} />
        <kbd>Esc</kbd>
      </div>
      <div class="palette-results" role="listbox">
        ${groups.map((group) => html`<div key=${group.label}>
          <div class="palette-group">${group.label}</div>
          ${group.items.map((item) => {
    index += 1;
    const mine = index;
    return html`<button type="button" class="palette-item" key=${item.key} role="option"
              aria-selected=${String(mine === active)}
              onPointerMove=${() => setActive(mine)} onClick=${() => run(item.run)}>
              <${Icon} name=${item.icon} />
              <span class="title">${item.title}</span>
              ${item.meta}
              ${item.hint && html`<kbd>${item.hint}</kbd>`}
            </button>`;
  })}
        </div>`)}
        ${results && !flat.length && html`<div class="palette-empty">لا توجد نتائج مطابقة لـ «${query}»</div>`}
      </div>
    </div>
  </div>`;
}
