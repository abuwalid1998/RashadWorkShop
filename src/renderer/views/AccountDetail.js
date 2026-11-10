import { html, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { useQuery } from '../lib/hooks.js';
import { invalidate, toast, toastError } from '../lib/store.js';
import * as fmt from '../lib/format.js';
import { Icon } from '../lib/icons.js';
import { View, Button, IconButton, Money, Plate, BalanceBadge, Empty, Segmented } from '../components/ui.js';
import {
  openOrderForm, openBatteryForm, openPayment, openDocument, openConfirm, openOverlay,
} from '../components/overlays.js';
import { undoDelete } from './Orders.js';

const TABS = [
  { value: 'visits', label: 'الزيارات' },
  { value: 'ledger', label: 'كشف الحركات' },
  { value: 'settlements', label: 'التسويات' },
];

function Visit({ item, accountKey }) {
  const isService = item.source === 'service';
  const edit = async () => {
    try {
      if (isService) openOrderForm({ order: await call('orders.get', { id: item.id }) });
      else openBatteryForm({ battery: await call('batteries.get', { id: item.id }) });
    } catch (error) {
      toastError(error);
    }
  };
  return html`<article class="visit">
    <div class="visit-date">
      <strong class="num">${fmt.date(item.date)}</strong>
      <span class="faint">${isService ? 'طلب' : 'بطارية'} <span class="num">#${item.id}</span></span>
    </div>
    <div class="visit-body">
      <div class="visit-meta">
        <${Plate}>${item.vehicle_id}<//>
        ${isService && item.km_counter ? html`<span class="muted"><span class="num">${fmt.number(item.km_counter)}</span> كم</span>` : ''}
        ${!isService && html`<span class="muted">ضمان <span class="num">${item.warranty_period}</span> شهر</span>`}
      </div>
      <ul class="visit-lines">
        ${item.lines.map((line) => html`<li key=${line.key}><span>${line.label}</span><${Money} value=${line.price} class="muted" /></li>`)}
      </ul>
    </div>
    <div class="visit-totals">
      <${Money} value=${item.total} class="amount" />
      <${BalanceBadge} remaining=${item.remaining} />
    </div>
    <div class="visit-actions">
      ${item.remaining > 0.004 && html`<${Button} size="small" variant="tinted"
        onClick=${() => openPayment({ accountKey, target: { source: item.source, id: item.id } })}>تسديد<//>`}
      <${IconButton} icon="pencil" label="تعديل" onClick=${edit} />
    </div>
  </article>`;
}

function Ledger({ account }) {
  const receipts = new Map(account.credits.map((c) => [`سند ${c.receipt_no}`, c]));
  const remove = (credit) => openConfirm({
    title: `حذف سند الدفع رقم ${credit.receipt_no}؟`,
    message: 'سيعود المبلغ إلى رصيد العميل المستحق. يمكنك التراجع مباشرة بعد الحذف.',
    onConfirm: async () => {
      try {
        const { trashId } = await call('payments.removeReceipt', { receiptNo: credit.receipt_no });
        invalidate();
        toast('تم حذف سند الدفع', { action: { label: 'تراجع', run: () => undoDelete(trashId) } });
      } catch (error) {
        toastError(error);
      }
    },
  });

  return html`<div class="table-wrap"><table class="data">
    <thead><tr><th>التاريخ</th><th>البيان</th><th>المرجع</th><th class="end">مدين</th><th class="end">دائن</th><th class="end">الرصيد</th><th /></tr></thead>
    <tbody>
      ${account.ledger.lines.map((line, index) => {
    const credit = line.debit === 0 ? receipts.get(line.ref) : null;
    return html`<tr key=${index}>
          <td class="num">${fmt.date(line.date)}</td>
          <td>${line.description} ${line.vehicle_id && html`<span class="faint num">${line.vehicle_id}</span>`}</td>
          <td class="faint">${line.ref}</td>
          <td class="end num">${line.debit ? fmt.money(line.debit) : html`<span class="faint">—</span>`}</td>
          <td class="end num">${line.credit ? fmt.money(line.credit) : html`<span class="faint">—</span>`}</td>
          <td class="end num amount">${fmt.money(line.balance)}</td>
          <td class="end">${credit && credit.kind !== 'adjust' && html`<span class="row-actions">
            <${IconButton} icon="trash" label="حذف السند" danger onClick=${() => remove(credit)} /></span>`}</td>
        </tr>`;
  })}
    </tbody>
  </table></div>`;
}

function Settlements({ account }) {
  if (!account.settlements.length) {
    return html`<${Empty} icon="handshake" title="لا توجد تسويات">
      عند تسديد كامل الرصيد أو إجراء تسوية نهائية تُحفظ هنا مخالصة يمكن طباعتها.
    <//>`;
  }
  return html`<div class="table-wrap"><table class="data">
    <thead><tr><th>التاريخ</th><th>النطاق</th><th class="end">الرصيد قبل التسوية</th><th class="end">المدفوع</th><th class="end">الخصم</th><th /></tr></thead>
    <tbody>
      ${account.settlements.map((s) => html`<tr key=${s.id}>
        <td class="num">${fmt.date(s.settled_at)}</td>
        <td>${s.vehicle_id ? html`سيارة <${Plate}>${s.vehicle_id}<//>` : 'كامل الحساب'}${s.note && html`<div class="sub">${s.note}</div>`}</td>
        <td class="end num">${fmt.money(s.balance_before)}</td>
        <td class="end num">${fmt.money(s.amount_paid)}</td>
        <td class="end num">${s.discount ? fmt.money(s.discount) : html`<span class="faint">—</span>`}</td>
        <td class="end"><${Button} size="small" icon="doc" onClick=${() => openDocument({ type: 'settlement', id: s.id })}>مخالصة PDF<//></td>
      </tr>`)}
    </tbody>
  </table></div>`;
}

/** One customer's account: balance, visits, ledger, settlements, statement. */
export function AccountDetail({ accountKey, navigate }) {
  const [vehicle, setVehicle] = useState('');
  const [tab, setTab] = useState('visits');
  const { data: account, error } = useQuery('accounts.get', { key: accountKey, vehicle });

  const back = html`<${Button} variant="plain" icon="back" onClick=${() => navigate('accounts')}>الحسابات<//>`;

  if (error && !account) {
    return html`<${View} toolbar=${back}><${Empty} icon="people" title="الحساب غير موجود">ربما حُذفت جميع سجلات هذا العميل.<//><//>`;
  }
  if (!account) return html`<${View} toolbar=${back} />`;

  const { totals } = account;
  const vehicles = account.vehicles.map((v) => v.vehicle_id);
  const statement = () => openOverlay({
    type: 'document', request: { type: 'statement', key: accountKey, vehicle }, vehicles,
  });
  const lastVehicle = account.vehicles[account.vehicles.length - 1]?.vehicle_id || '';

  const toolbar = html`
    ${back}
    <span class="toolbar-spacer" />
    <${Button} icon="plus" onClick=${() => openOrderForm({
    prefill: { customer_name: account.name, phone_number: account.phone, vehicle_id: vehicle || lastVehicle },
  })}>طلب جديد<//>
    <${Button} icon="doc" onClick=${statement}>كشف حساب<//>
    ${totals.balance > 0.004 && html`
      <${Button} icon="handshake" onClick=${() => openPayment({ accountKey, vehicle, mode: 'settle' })}>تسوية<//>
      <${Button} variant="primary" icon="card" onClick=${() => openPayment({ accountKey, vehicle })}>تسديد دفعة<//>`}`;

  return html`<${View} toolbar=${toolbar} viewKey=${accountKey}>
    <header class="account-head">
      <span class="avatar large">${account.name.trim().charAt(0)}</span>
      <div class="account-id">
        <h1 class="selectable">${account.name}</h1>
        <p class="muted">
          ${account.phone && html`<span class="with-icon"><${Icon} name="phone" size="14" /><span class="num selectable">${account.phone}</span></span>`}
          <span>عميل منذ <span class="num">${fmt.date(account.first_date)}</span></span>
          <span>آخر زيارة <span class="num">${fmt.relativeDate(account.last_date)}</span></span>
        </p>
      </div>
    </header>

    ${vehicles.length > 1 && html`<div class="vehicle-filter">
      <${Segmented} label="السيارة" value=${vehicle} onChange=${setVehicle}
        options=${[{ value: '', label: 'كل السيارات' }, ...vehicles.map((v) => ({ value: v, label: html`<span class="num">${v}</span>` }))]} />
    </div>`}

    <div class="account-stats">
      <div class="card stat"><div class="stat-label">إجمالي الخدمات</div><div class="stat-value"><${Money} value=${totals.billed} /></div>
        <div class="stat-foot faint"><span>${fmt.visits(totals.visits)}${totals.batteries ? html` · <span class="num">${totals.batteries}</span> بطارية` : ''}</span></div></div>
      <div class="card stat"><div class="stat-label">المدفوع</div><div class="stat-value"><${Money} value=${totals.paid} /></div>
        <div class="stat-foot"><div class="meter good thin"><i style=${{ width: `${totals.billed > 0 ? Math.min(100, (totals.paid / totals.billed) * 100) : 0}%` }} /></div></div></div>
      <div class="card stat"><div class="stat-label">الخصومات</div><div class="stat-value"><${Money} value=${totals.discount + totals.adjust} /></div>
        <div class="stat-foot faint">${totals.adjust ? 'تشمل رصيداً مرحّلاً من النظام السابق' : 'خصومات التسويات'}</div></div>
      <div class=${`card stat ${totals.balance > 0.004 ? 'owing' : 'settled'}`}>
        <div class="stat-label">${totals.balance < -0.004 ? 'رصيد دائن للعميل' : 'الرصيد المستحق'}</div>
        <div class="stat-value"><${Money} value=${Math.abs(totals.balance)} /></div>
        <div class="stat-foot">${totals.balance > 0.004 ? html`<span class="badge warn">غير مسدّد</span>` : html`<span class="badge good"><${Icon} name="check" />مسدّد بالكامل</span>`}</div>
      </div>
    </div>

    <div class="tabs-row">
      <${Segmented} label="القسم" value=${tab} onChange=${setTab}
        options=${TABS.map((t) => (t.value === 'settlements' && account.settlements.length
    ? { ...t, label: html`${t.label} <span class="num faint">${account.settlements.length}</span>` } : t))} />
    </div>

    <div class="card">
      ${tab === 'visits' && html`<div class="visits">
        ${[...account.items].reverse().map((item) => html`<${Visit} key=${`${item.source}:${item.id}`} item=${item} accountKey=${accountKey} />`)}
      </div>`}
      ${tab === 'ledger' && html`<${Ledger} account=${account} />`}
      ${tab === 'settlements' && html`<${Settlements} account=${account} />`}
    </div>
  <//>`;
}
