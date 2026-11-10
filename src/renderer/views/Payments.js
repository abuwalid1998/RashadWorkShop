import { html, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { usePagedQuery, useInView } from '../lib/hooks.js';
import { invalidate, toast, toastError } from '../lib/store.js';
import * as fmt from '../lib/format.js';
import { View, Button, IconButton, Money, Empty, SearchField, Segmented } from '../components/ui.js';
import { openPayment, openDocument, openConfirm } from '../components/overlays.js';
import { undoDelete } from './Orders.js';

const KINDS = [
  { value: 'all', label: 'الكل' },
  { value: 'payment', label: 'دفعات' },
  { value: 'settlement', label: 'تسويات' },
  { value: 'opening', label: 'مرحّلة' },
];

function KindBadge({ receipt }) {
  if (receipt.settlement_id) return html`<span class="badge accent">تسوية</span>`;
  if (receipt.is_opening) return html`<span class="badge" title="دفعة مسجّلة في النظام السابق بدون تاريخ دفع">مرحّلة</span>`;
  return html`<span class="badge good">دفعة</span>`;
}

export function Payments({ navigate }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const list = usePagedQuery('payments.list', { query, kind });
  const sentinel = useInView(list.loadMore);
  const { rows, summary } = list;
  const filtered = Boolean(query || kind !== 'all');

  const remove = (receipt) => openConfirm({
    title: `حذف سند الدفع رقم ${receipt.receipt_no}؟`,
    message: `سيعود مبلغ ${fmt.money(receipt.cash + receipt.discount)} إلى رصيد ${receipt.customer_name || 'العميل'} المستحق. يمكنك التراجع مباشرة بعد الحذف.`,
    onConfirm: async () => {
      try {
        const { trashId } = await call('payments.removeReceipt', { receiptNo: receipt.receipt_no });
        invalidate();
        toast('تم حذف سند الدفع', { action: { label: 'تراجع', run: () => undoDelete(trashId) } });
      } catch (error) {
        toastError(error);
      }
    },
  });

  const toolbar = html`
    <${SearchField} value=${query} onChange=${setQuery} placeholder="ابحث بالاسم، رقم السيارة أو رقم السند" />
    <${Segmented} label="النوع" value=${kind} options=${KINDS} onChange=${setKind} />
    <span class="toolbar-spacer" />
    <${Button} variant="primary" icon="card" onClick=${() => openPayment()}>تسديد دفعة<//>`;

  return html`<${View} title="المدفوعات" toolbar=${toolbar}>
    ${summary && summary.count > 0 && html`<div class="summary-strip">
      <span>${filtered ? 'النتائج' : 'كل السندات'}<strong class="num">${fmt.number(summary.count)}</strong></span>
      <span>المبالغ المستلمة<strong class="num">${fmt.money(summary.cash)}</strong></span>
      ${summary.discount > 0 && html`<span>الخصومات<strong class="num">${fmt.money(summary.discount)}</strong></span>`}
    </div>`}
    <div class="card" style=${{ opacity: list.loading && rows.length ? 0.7 : 1, transition: 'opacity 120ms' }}>
      ${rows.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr>
          <th>السند</th><th>التاريخ</th><th>العميل</th><th>النوع</th><th>ملاحظة</th>
          <th class="end">المبلغ</th><th class="end">الخصم</th><th />
        </tr></thead>
        <tbody>
          ${rows.map((receipt) => html`<tr key=${receipt.receipt_no}>
            <td class="num primary">#${receipt.receipt_no}</td>
            <td class="num">${fmt.date(receipt.paid_at)}</td>
            <td>
              ${receipt.account_key
    ? html`<a href="#" class="name-link" onClick=${(e) => { e.preventDefault(); navigate('accounts', { key: receipt.account_key }); }}>${receipt.customer_name}</a>`
    : html`<span class="faint">—</span>`}
              ${receipt.vehicles && html`<div class="sub num">${receipt.vehicles.split(',').join(' · ')}</div>`}
            </td>
            <td><${KindBadge} receipt=${receipt} /></td>
            <td class="muted note-cell">${receipt.note}</td>
            <td class="end amount"><${Money} value=${receipt.cash} /></td>
            <td class="end">${receipt.discount ? html`<${Money} value=${receipt.discount} class="muted" />` : html`<span class="faint">—</span>`}</td>
            <td class="end"><span class="row-actions">
              ${receipt.settlement_id && html`<${IconButton} icon="doc" label="مخالصة PDF"
                onClick=${() => openDocument({ type: 'settlement', id: receipt.settlement_id })} />`}
              <${IconButton} icon="trash" label="حذف السند" danger onClick=${() => remove(receipt)} />
            </span></td>
          </tr>`)}
        </tbody>
      </table></div>` : !list.loading && html`<${Empty} icon=${filtered ? 'search' : 'card'}
          title=${filtered ? 'لا توجد سندات مطابقة' : 'لا توجد مدفوعات بعد'}>
        ${filtered ? 'جرّب كلمة بحث أخرى أو غيّر النوع.' : 'تظهر هنا كل دفعة تُسجَّل، مع إمكانية حذفها أو طباعة مخالصتها.'}
      <//>`}
      ${list.hasMore && html`<div class="load-more" ref=${sentinel}>جارٍ تحميل المزيد…</div>`}
    </div>
  <//>`;
}
