import { html, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { usePagedQuery, useInView } from '../lib/hooks.js';
import { invalidate, toast, toastError } from '../lib/store.js';
import * as fmt from '../lib/format.js';
import { View, Button, IconButton, Money, Plate, BalanceBadge, Empty, SearchField, Segmented } from '../components/ui.js';
import { openBatteryForm, openPayment, openConfirm } from '../components/overlays.js';
import { undoDelete } from './Orders.js';

const FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'active', label: 'سارية' },
  { value: 'expiring', label: 'تنتهي قريباً' },
  { value: 'expired', label: 'منتهية' },
  { value: 'unpaid', label: 'غير مسدّدة' },
];

/** How much warranty is left, at a glance: the bar empties as time passes. */
function Warranty({ battery }) {
  const totalDays = Math.max(1, battery.warranty_period * 30.44);
  const left = Math.min(1, Math.max(0, battery.days_left / totalDays));
  const { warranty_status: status } = battery;
  const tone = status === 'expired' ? 'bad' : status === 'expiring' ? 'warn' : 'good';
  return html`<div class="warranty">
    <div class="warranty-top">
      <span class=${`badge ${tone}`}>${status === 'expired' ? 'منتهٍ' : `باقٍ ${fmt.days(battery.days_left)}`}</span>
      <span class="faint">حتى <span class="num">${fmt.date(battery.expires_on)}</span></span>
    </div>
    <div class=${`meter thin ${tone}`}><i style=${{ width: `${left * 100}%` }} /></div>
  </div>`;
}

export function Batteries({ navigate }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [leaving, setLeaving] = useState(null);
  const list = usePagedQuery('batteries.list', { query, status });
  const sentinel = useInView(list.loadMore);
  const { rows, summary } = list;
  const filtered = Boolean(query || status !== 'all');

  const remove = (battery) => openConfirm({
    title: 'حذف ضمان البطارية؟',
    message: `سيُحذف سجل بطارية ${battery.customer_name} مع دفعاته. يمكنك التراجع مباشرة بعد الحذف.`,
    onConfirm: async () => {
      setLeaving(battery.id);
      try {
        const { trashId } = await call('batteries.remove', { id: battery.id });
        setTimeout(() => {
          invalidate();
          setLeaving(null);
        }, 220);
        toast('تم حذف ضمان البطارية', { action: { label: 'تراجع', run: () => undoDelete(trashId) } });
      } catch (error) {
        setLeaving(null);
        toastError(error);
      }
    },
  });

  const toolbar = html`
    <${SearchField} value=${query} onChange=${setQuery} placeholder="ابحث بالاسم، رقم السيارة أو نوع البطارية" />
    <${Segmented} label="حالة الضمان" value=${status} options=${FILTERS} onChange=${setStatus} />
    <span class="toolbar-spacer" />
    <${Button} variant="primary" icon="plus" onClick=${() => openBatteryForm()}>بطارية جديدة<//>`;

  return html`<${View} title="البطاريات" toolbar=${toolbar}>
    ${summary && summary.count > 0 && html`<div class="summary-strip">
      <span>${filtered ? 'النتائج' : 'كل البطاريات'}<strong class="num">${fmt.number(summary.count)}</strong></span>
      <span>إجمالي المبيعات<strong class="num">${fmt.money(summary.billed)}</strong></span>
      <span>المتبقي<strong class="num">${fmt.money(summary.remaining)}</strong></span>
    </div>`}
    <div class="card" style=${{ opacity: list.loading && rows.length ? 0.7 : 1, transition: 'opacity 120ms' }}>
      ${rows.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr>
          <th>العميل</th><th>السيارة</th><th>البطارية</th><th>تاريخ الشراء</th><th>الضمان</th>
          <th class="end">السعر</th><th class="end">الحالة</th><th />
        </tr></thead>
        <tbody>
          ${rows.map((battery) => html`<tr key=${battery.id}
              class=${`clickable ${leaving === battery.id ? 'row-exit' : ''}`} onClick=${() => openBatteryForm({ battery })}>
            <td>
              <a href="#" class="name-link" onClick=${(e) => { e.preventDefault(); e.stopPropagation(); navigate('accounts', { key: battery.account_key }); }}>${battery.customer_name}</a>
              ${battery.phone_number && html`<div class="sub num">${battery.phone_number}</div>`}
            </td>
            <td><${Plate}>${battery.vehicle_id}<//></td>
            <td><span class="primary">${battery.battery_type}</span><div class="sub"><span class="num">${battery.warranty_period}</span> شهر</div></td>
            <td class="num muted">${fmt.date(battery.purchase_date)}</td>
            <td><${Warranty} battery=${battery} /></td>
            <td class="end amount"><${Money} value=${battery.price} /></td>
            <td class="end"><${BalanceBadge} remaining=${battery.remaining_amount} /></td>
            <td class="end" onClick=${(e) => e.stopPropagation()}>
              <span class="row-actions">
                ${battery.remaining_amount > 0.004 && html`<${IconButton} icon="card" label="تسديد"
                  onClick=${() => openPayment({ accountKey: battery.account_key, target: { source: 'battery', id: battery.id } })} />`}
                <${IconButton} icon="pencil" label="تعديل" onClick=${() => openBatteryForm({ battery })} />
                <${IconButton} icon="trash" label="حذف" danger onClick=${() => remove(battery)} />
              </span>
            </td>
          </tr>`)}
        </tbody>
      </table></div>` : !list.loading && html`<${Empty} icon=${filtered ? 'search' : 'battery'}
          title=${filtered ? 'لا توجد بطاريات مطابقة' : 'لا توجد بطاريات بعد'}
          action=${!filtered && html`<${Button} variant="primary" icon="plus" onClick=${() => openBatteryForm()}>بطارية جديدة<//>`}>
        ${filtered ? 'جرّب كلمة بحث أخرى أو غيّر حالة الضمان.' : 'سجّل بيع بطارية لمتابعة فترة ضمانها.'}
      <//>`}
      ${list.hasMore && html`<div class="load-more" ref=${sentinel}>جارٍ تحميل المزيد…</div>`}
    </div>
  <//>`;
}
