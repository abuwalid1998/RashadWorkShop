import { html, useState } from '../lib/preact.js';
import { usePagedQuery, useInView } from '../lib/hooks.js';
import * as fmt from '../lib/format.js';
import { View, Money, Plate, BalanceBadge, Empty, SearchField, Segmented, Select, Button } from '../components/ui.js';
import { Icon } from '../lib/icons.js';
import { openOrderForm } from '../components/overlays.js';
import { AccountDetail } from './AccountDetail.js';

const FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'debt', label: 'عليهم ذمم' },
  { value: 'clear', label: 'مسدّدون' },
];
const SORTS = [
  { value: 'recent', label: 'آخر زيارة' },
  { value: 'balance', label: 'الأعلى ذمة' },
  { value: 'billed', label: 'الأعلى تعاملاً' },
  { value: 'name', label: 'الاسم' },
];

function AccountList({ navigate, params }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(params.filter || 'all');
  const [sort, setSort] = useState(params.filter === 'debt' ? 'balance' : 'recent');
  const list = usePagedQuery('accounts.list', { query, filter, sort });
  const sentinel = useInView(list.loadMore);
  const { rows, summary } = list;
  const filtered = Boolean(query || filter !== 'all');

  const toolbar = html`
    <${SearchField} value=${query} onChange=${setQuery} placeholder="ابحث بالاسم، رقم السيارة أو الهاتف" />
    <${Segmented} label="الرصيد" value=${filter} options=${FILTERS} onChange=${setFilter} />
    <${Select} label="الترتيب" value=${sort} options=${SORTS} onChange=${setSort} />
    <span class="toolbar-spacer" />`;

  return html`<${View} title="الحسابات" toolbar=${toolbar}>
    ${summary && summary.count > 0 && html`<div class="summary-strip">
      <span>${filtered ? 'النتائج' : 'كل العملاء'}<strong class="num">${fmt.number(summary.count)}</strong></span>
      <span>إجمالي التعامل<strong class="num">${fmt.money(summary.billed)}</strong></span>
      <span>المدفوع<strong class="num">${fmt.money(summary.paid)}</strong></span>
      <span>الذمم المستحقة<strong class="num">${fmt.money(summary.balance)}</strong></span>
    </div>`}
    <div class="card" style=${{ opacity: list.loading && rows.length ? 0.7 : 1, transition: 'opacity 120ms' }}>
      ${rows.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr>
          <th>العميل</th><th>السيارات</th><th>الزيارات</th><th>آخر زيارة</th>
          <th class="end">إجمالي التعامل</th><th class="end">الرصيد</th><th />
        </tr></thead>
        <tbody>
          ${rows.map((account) => html`<tr key=${account.key} class="clickable" tabindex="0"
              onClick=${() => navigate('accounts', { key: account.key })}
              onKeyDown=${(e) => e.key === 'Enter' && navigate('accounts', { key: account.key })}>
            <td><div class="person">
              <span class="avatar">${account.name.trim().charAt(0)}</span>
              <span><span class="primary">${account.name}</span>
                ${account.phone && html`<div class="sub num">${account.phone}</div>`}</span>
            </div></td>
            <td><div class="chips">
              ${account.vehicles.slice(0, 2).map((v) => html`<${Plate} key=${v}>${v}<//>`)}
              ${account.vehicles.length > 2 && html`<span class="chip num">+${account.vehicles.length - 2}</span>`}
            </div></td>
            <td class="num">${account.visits}</td>
            <td class="num muted">${fmt.relativeDate(account.last_date)}</td>
            <td class="end"><${Money} value=${account.billed} /></td>
            <td class="end"><${BalanceBadge} remaining=${account.balance} /></td>
            <td class="end faint chevron-cell"><${Icon} name="chevron" size="16" /></td>
          </tr>`)}
        </tbody>
      </table></div>` : !list.loading && html`<${Empty} icon=${filtered ? 'search' : 'people'}
          title=${filtered ? 'لا يوجد عملاء مطابقون' : 'لا يوجد عملاء بعد'}
          action=${!filtered && html`<${Button} variant="primary" icon="plus" onClick=${() => openOrderForm()}>طلب جديد<//>`}>
        ${filtered ? 'جرّب اسماً أو رقم سيارة آخر.' : 'يُنشأ حساب العميل تلقائياً مع أول طلب له.'}
      <//>`}
      ${list.hasMore && html`<div class="load-more" ref=${sentinel}>جارٍ تحميل المزيد…</div>`}
    </div>
  <//>`;
}

/** Customers: the list, or one customer's account when a key is given. */
export function Accounts({ navigate, params = {} }) {
  return params.key
    ? html`<${AccountDetail} accountKey=${params.key} navigate=${navigate} key=${params.key} />`
    : html`<${AccountList} navigate=${navigate} params=${params} />`;
}
