import { html, useEffect, useRef, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { getState, invalidate, toast } from '../lib/store.js';
import { useQuery } from '../lib/hooks.js';
import * as fmt from '../lib/format.js';
import { Sheet, useSheet } from './Sheet.js';
import { Button, Field, Banner, Money, Plate, Segmented, SearchField, Empty, useForm } from './ui.js';
import { openDocument } from './overlays.js';

/** Step 1 when no account was given: choose who is paying. */
function AccountPicker({ onPick }) {
  const [query, setQuery] = useState('');
  const { data } = useQuery('accounts.list', { query, filter: 'debt', sort: 'balance', limit: 30 });
  const rows = data?.rows || [];
  return html`<div class="sheet-body">
    <${SearchField} value=${query} onChange=${setQuery} placeholder="ابحث باسم العميل أو رقم السيارة" autofocus=${true} />
    <div class="pick-list">
      ${rows.map((row) => html`<button type="button" class="pick-row" key=${row.key} onClick=${() => onPick(row)}>
        <span class="avatar">${row.name.trim().charAt(0)}</span>
        <span class="who"><strong>${row.name}</strong>
          <span class="faint num">${row.vehicles.slice(0, 3).join(' · ')}</span></span>
        <span class="badge warn"><${Money} value=${row.balance} /></span>
      </button>`)}
      ${data && !rows.length && html`<${Empty} icon="checkCircle" title=${query ? 'لا يوجد عميل مطابق عليه ذمة' : 'لا توجد ذمم مستحقة'}>
        ${query ? 'جرّب اسماً أو رقم سيارة آخر.' : 'جميع الحسابات مسدّدة.'}
      <//>`}
    </div>
  </div>`;
}

function PaymentBody({ accountKey, initialVehicle, target, initialMode }) {
  const { close } = useSheet();
  const currency = getState().settings.currency;
  const [mode, setMode] = useState(initialMode || 'payment');
  const [vehicle, setVehicle] = useState(initialVehicle || '');
  const form = useForm({ amount: '', date: fmt.isoDate(), note: '' });
  const [preview, setPreview] = useState(null);
  const ticket = useRef(0);
  const amountInput = useRef(null);
  const settle = mode === 'settle';

  // The form appears once the balance has loaded; start in the amount field.
  useEffect(() => {
    if (preview) amountInput.current?.focus();
  }, [Boolean(preview)]);

  // Live breakdown: which items this amount pays, oldest first.
  useEffect(() => {
    ticket.current += 1;
    const mine = ticket.current;
    call('payments.preview', { accountKey, vehicle, target, amount: form.values.amount, settle })
      .then((data) => mine === ticket.current && setPreview(data));
  }, [accountKey, vehicle, form.values.amount, settle]);

  // Settling starts from "paid in full"; the owner lowers it to give a discount.
  useEffect(() => {
    if (settle && preview && form.values.amount === '') form.set('amount', String(preview.due));
  }, [settle, preview?.due]);

  const save = () => form.submit(async (values) => {
    const result = await call('payments.create', { accountKey, vehicle, target, settle, ...values });
    invalidate();
    close();
    const settlementId = result.settlementId;
    toast(
      settlementId
        ? `تمت تسوية الحساب — استُلم ${fmt.money(result.cash)}`
        : `تم تسجيل دفعة ${fmt.money(result.cash)}`,
      settlementId
        ? { action: { label: 'مخالصة PDF', run: () => openDocument({ type: 'settlement', id: settlementId }) } }
        : {});
  });

  if (!preview) return html`<div class="sheet-body" style=${{ minHeight: '280px' }} />`;
  if (!preview.items.length) {
    return html`<div class="sheet-body"><${Empty} icon="checkCircle" title="لا يوجد مبلغ مستحق">هذا الحساب مسدّد بالكامل.<//></div>`;
  }

  const lineFor = (item) => preview.lines.find((l) => l.source === item.source && l.id === item.id);
  const clears = !settle && preview.cash > 0 && preview.after === 0 && !preview.exceeds;

  return html`
    <div class="sheet-body" onKeyDown=${(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()}>
      <div class="pay-head">
        <div>
          <div class="faint">العميل</div>
          <strong>${preview.name}</strong>
        </div>
        <div class="pay-due">
          <div class="faint">المستحق${vehicle ? ' على السيارة' : target ? ' على البند' : ''}</div>
          <strong class="num">${fmt.money(preview.due)}</strong>
        </div>
      </div>

      <div class="pay-controls">
        <${Segmented} label="نوع العملية" value=${mode} onChange=${setMode}
          options=${[{ value: 'payment', label: 'دفعة' }, { value: 'settle', label: 'تسوية نهائية' }]} />
        ${!target && preview.vehicles.length > 1 && html`<select class="select" aria-label="السيارة" value=${vehicle}
            onChange=${(e) => setVehicle(e.target.value)}>
          <option value="">كل السيارات</option>
          ${preview.vehicles.map((v) => html`<option key=${v.vehicle_id} value=${v.vehicle_id}>${v.vehicle_id}</option>`)}
        </select>`}
      </div>

      <div class="form-grid" style=${{ marginTop: '14px' }}>
        <${Field} label=${settle ? 'المبلغ المستلم' : 'مبلغ الدفعة'} error=${form.errors.amount || (preview.exceeds ? `المبلغ أكبر من المستحق (${fmt.money(preview.due)})` : '')}>
          <div class="pay-row">
            <div class="input-affix">
              <input class="input num amount-input" inputmode="decimal" placeholder="0" ref=${amountInput}
                value=${form.values.amount} aria-invalid=${form.errors.amount || preview.exceeds ? 'true' : undefined}
                onInput=${(e) => form.set('amount', e.target.value)} />
              <span class="affix">${currency}</span>
            </div>
            <${Button} size="small" variant="tinted" onClick=${() => form.set('amount', String(preview.due))}>كامل المبلغ<//>
          </div>
        <//>
        <${Field} label="تاريخ الدفع" error=${form.errors.date}>
          <input class="input" type="date" value=${form.values.date} onInput=${(e) => form.set('date', e.target.value)} />
        <//>
        <${Field} label="ملاحظة" class="span-2">
          <input class="input" type="text" placeholder="اختياري" value=${form.values.note}
            onInput=${(e) => form.set('note', e.target.value)} />
        <//>
      </div>

      ${settle && preview.discount > 0 && html`<div style=${{ marginTop: '12px' }}>
        <${Banner} kind="warn">سيُسجَّل خصم تسوية بقيمة <strong><${Money} value=${preview.discount} /></strong> ويُغلق الرصيد على صفر.<//>
      </div>`}

      ${clears && html`<div style=${{ marginTop: '12px' }}>
        <${Banner} kind="good">هذه الدفعة تسدّد كامل المستحق، وستُحفظ معها مخالصة يمكن طباعتها.<//>
      </div>`}

      <h3 class="alloc-title">توزيع المبلغ <span class="faint">الأقدم أولاً</span></h3>
      <div class="alloc">
        ${preview.items.map((item) => {
    const line = lineFor(item);
    const covered = line ? line.cash + line.discount : 0;
    return html`<div class="alloc-row" key=${`${item.source}:${item.id}`} data-covered=${covered > 0}>
            <span class="num faint">${fmt.date(item.date)}</span>
            <span class="what">${item.source === 'service' ? 'طلب' : 'بطارية'} <span class="num">#${item.id}</span> <${Plate}>${item.vehicle_id}<//></span>
            <span class="num faint">${fmt.money(item.remaining)}</span>
            <span class="applied num">${covered > 0 ? `− ${fmt.number(covered)}` : '—'}</span>
          </div>`;
  })}
      </div>
      ${form.message && !form.errors.amount && html`<div style=${{ marginTop: '10px' }}><${Banner} kind="error">${form.message}<//></div>`}
    </div>
    <div class="sheet-foot">
      <div class="totals">
        <div><span class="faint">المتبقي بعد العملية</span><strong class="num">${fmt.money(preview.after)}</strong></div>
      </div>
      <span class="spacer" />
      <${Button} onClick=${close}>إلغاء<//>
      <${Button} variant="primary" disabled=${form.busy || preview.exceeds || (!settle && !(Number(form.values.amount) > 0))}
        onClick=${save}>${settle ? 'تسوية الحساب' : 'تسجيل الدفعة'}<//>
    </div>`;
}

/**
 * Take a payment or settle an account.
 * Without `accountKey` it first asks which customer is paying.
 */
export function PaymentSheet({ accountKey, vehicle, target, mode, onClose }) {
  const [picked, setPicked] = useState(accountKey || '');
  return html`<${Sheet} title=${mode === 'settle' ? 'تسوية حساب' : 'تسديد دفعة'} onClose=${onClose}>
    ${picked
    ? html`<${PaymentBody} accountKey=${picked} initialVehicle=${vehicle} target=${target} initialMode=${mode} />`
    : html`<${AccountPicker} onPick=${(row) => setPicked(row.key)} />`}
  <//>`;
}
