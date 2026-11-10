import { html, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { usePagedQuery, useInView } from '../lib/hooks.js';
import { invalidate, toast, toastError } from '../lib/store.js';
import * as fmt from '../lib/format.js';
import {
  View, Button, IconButton, Money, Plate, BalanceBadge, Empty, SearchField, Segmented, Select,
} from '../components/ui.js';
import { openOrderForm, openPayment, openConfirm } from '../components/overlays.js';

const STATUS = [
  { value: 'all', label: 'الكل' },
  { value: 'unpaid', label: 'غير مسدّدة' },
  { value: 'paid', label: 'مسدّدة' },
];
const SORTS = [
  { value: 'recent', label: 'الأحدث أولاً' },
  { value: 'oldest', label: 'الأقدم أولاً' },
  { value: 'total', label: 'الأعلى قيمة' },
  { value: 'remaining', label: 'الأعلى متبقياً' },
];

/** Undo a delete from the toast that announced it. */
export async function undoDelete(trashId) {
  try {
    await call('trash.restore', { trashId });
    invalidate();
    toast('تم التراجع عن الحذف');
  } catch (error) {
    toastError(error);
  }
}

export function Orders({ navigate, params = {} }) {
  const [query, setQuery] = useState(params.query || '');
  const [status, setStatus] = useState(params.status || 'all');
  const [sort, setSort] = useState('recent');
  const [leaving, setLeaving] = useState(null);
  const list = usePagedQuery('orders.list', { query, status, sort });
  const sentinel = useInView(list.loadMore);

  const remove = (order) => openConfirm({
    title: `حذف الطلب رقم ${order.order_id}؟`,
    message: `سيُحذف طلب ${order.customer_name} مع دفعاته. يمكنك التراجع مباشرة بعد الحذف.`,
    onConfirm: async () => {
      setLeaving(order.order_id);
      try {
        const { trashId } = await call('orders.remove', { id: order.order_id });
        setTimeout(() => {
          invalidate();
          setLeaving(null);
        }, 220);
        toast(`تم حذف الطلب رقم ${order.order_id}`, { action: { label: 'تراجع', run: () => undoDelete(trashId) } });
      } catch (error) {
        setLeaving(null);
        toastError(error);
      }
    },
  });

  const toolbar = html`
    <${SearchField} value=${query} onChange=${setQuery} placeholder="ابحث بالاسم، رقم السيارة، الهاتف أو رقم الطلب" />
    <${Segmented} label="حالة الدفع" value=${status} options=${STATUS} onChange=${setStatus} />
    <${Select} label="الترتيب" value=${sort} options=${SORTS} onChange=${setSort} />
    <span class="toolbar-spacer" />
    <${Button} variant="primary" icon="plus" onClick=${() => openOrderForm()}>طلب جديد<//>`;

  const { rows, summary } = list;
  const filtered = Boolean(query || status !== 'all');

  return html`<${View} title="الطلبات" toolbar=${toolbar}>
    ${summary && summary.count > 0 && html`<div class="summary-strip">
      <span>${filtered ? 'النتائج' : 'كل الطلبات'}<strong class="num">${fmt.number(summary.count)}</strong></span>
      <span>الإجمالي<strong class="num">${fmt.money(summary.billed)}</strong></span>
      <span>المدفوع<strong class="num">${fmt.money(summary.paid)}</strong></span>
      <span>المتبقي<strong class="num">${fmt.money(summary.remaining)}</strong></span>
    </div>`}

    <div class="card" style=${{ opacity: list.loading && rows.length ? 0.7 : 1, transition: 'opacity 120ms' }}>
      ${rows.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr>
          <th>الطلب</th><th>العميل</th><th>السيارة</th><th>الخدمات</th>
          <th class="end">الإجمالي</th><th class="end">المدفوع</th><th class="end">الحالة</th><th />
        </tr></thead>
        <tbody>
          ${rows.map((order) => html`<tr key=${order.order_id}
              class=${`clickable ${leaving === order.order_id ? 'row-exit' : ''}`}
              onClick=${() => openOrderForm({ order })}>
            <td><span class="num primary">#${order.order_id}</span><div class="sub num">${fmt.date(order.order_date)}</div></td>
            <td>
              <a href="#" class="name-link" onClick=${(e) => { e.preventDefault(); e.stopPropagation(); navigate('accounts', { key: order.account_key }); }}>${order.customer_name}</a>
              ${order.phone_number && html`<div class="sub num">${order.phone_number}</div>`}
            </td>
            <td><${Plate}>${order.vehicle_id}<//>${order.km_counter ? html`<div class="sub"><span class="num">${fmt.number(order.km_counter)}</span> كم</div>` : ''}</td>
            <td><div class="chips">${order.lines.map((line) => html`<span class="chip" key=${line.key}>${line.label}</span>`)}</div></td>
            <td class="end amount"><${Money} value=${order.total_price} /></td>
            <td class="end"><${Money} value=${order.payment_amount} class="muted" /></td>
            <td class="end"><${BalanceBadge} remaining=${order.remaining_amount} /></td>
            <td class="end" onClick=${(e) => e.stopPropagation()}>
              <span class="row-actions">
                ${order.remaining_amount > 0.004 && html`<${IconButton} icon="card" label="تسديد"
                  onClick=${() => openPayment({ accountKey: order.account_key, target: { source: 'service', id: order.order_id } })} />`}
                <${IconButton} icon="pencil" label="تعديل" onClick=${() => openOrderForm({ order })} />
                <${IconButton} icon="trash" label="حذف" danger onClick=${() => remove(order)} />
              </span>
            </td>
          </tr>`)}
        </tbody>
      </table></div>` : !list.loading && html`<${Empty} icon=${filtered ? 'search' : 'wrench'}
          title=${filtered ? 'لا توجد طلبات مطابقة' : 'لا توجد طلبات بعد'}
          action=${!filtered && html`<${Button} variant="primary" icon="plus" onClick=${() => openOrderForm()}>طلب جديد<//>`}>
        ${filtered ? 'جرّب كلمة بحث أخرى أو غيّر حالة الدفع.' : 'أضف أول طلب صيانة ليظهر هنا.'}
      <//>`}
      ${list.hasMore && html`<div class="load-more" ref=${sentinel}>جارٍ تحميل المزيد…</div>`}
    </div>
  <//>`;
}
