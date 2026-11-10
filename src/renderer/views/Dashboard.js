import { html, useState } from '../lib/preact.js';
import { useQuery, useAnimatedNumber } from '../lib/hooks.js';
import { useStore } from '../lib/store.js';
import { Icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { View, Button, IconButton, Money, Plate, BalanceBadge, Empty } from '../components/ui.js';
import { MonthlyChart, MonthlyTable, BarList, Ring, Sparkline } from '../components/charts.js';
import { openOrderForm, openPayment, openBatteryForm } from '../components/overlays.js';

/** A figure that counts up to its value when it changes. */
function Figure({ value, format = fmt.number, class: extra = '' }) {
  const ref = useAnimatedNumber(value, (v) => format(Math.round(v)));
  return html`<span class=${`num ${extra}`} ref=${ref}>${format(value)}</span>`;
}

function Delta({ current, previous, label }) {
  if (!previous) return html`<span class="delta faint">${label}: لا توجد بيانات للمقارنة</span>`;
  const change = (current - previous) / previous;
  const up = change >= 0;
  return html`<span class=${`delta ${up ? 'up' : 'down'}`}>
    <span class="badge ${up ? 'good' : 'bad'}"><span class="num">${up ? '▲' : '▼'} ${fmt.percent(Math.abs(change))}</span></span>
    <span class="faint">${label}</span>
  </span>`;
}

function StatTile({ label, value, format, note, children, onClick }) {
  return html`<div class="card stat" onClick=${onClick} role=${onClick ? 'button' : undefined} tabindex=${onClick ? 0 : undefined}
      onKeyDown=${(e) => onClick && e.key === 'Enter' && onClick()}>
    <div class="stat-label">${label}</div>
    <div class="stat-value"><${Figure} value=${value} format=${format} /></div>
    <div class="stat-foot">${note}${children}</div>
  </div>`;
}

function Welcome({ shopName, navigate }) {
  return html`<div class="welcome">
    <img src="assets/logo.svg" alt="" width="64" height="64" />
    <h1>أهلاً بك في ${shopName}</h1>
    <p>سجّل طلبات الصيانة، تابع الذمم والمدفوعات، وأصدر كشوف الحساب — كل شيء محفوظ على هذا الجهاز، بدون خادم أو إنترنت.</p>
    <div class="welcome-actions">
      <${Button} variant="primary" size="large" icon="plus" onClick=${() => openOrderForm()}>أضف أول طلب<//>
      <${Button} size="large" icon="database" onClick=${() => navigate('settings')}>استيراد البيانات من النظام السابق<//>
    </div>
  </div>`;
}

export function Dashboard({ navigate }) {
  const { data } = useQuery('dashboard.get');
  const settings = useStore((s) => s.settings);
  const [chartMode, setChartMode] = useState('chart');

  const toolbar = html`
    <span class="toolbar-spacer" />
    <${Button} icon="card" onClick=${() => openPayment()}>تسديد دفعة<//>
    <${Button} variant="primary" icon="plus" onClick=${() => openOrderForm()}>طلب جديد<//>`;

  if (!data) return html`<${View} title="الرئيسية" toolbar=${toolbar} />`;
  if (data.empty) {
    return html`<${View} title="الرئيسية" toolbar=${toolbar}><${Welcome} shopName=${settings.shop_name} navigate=${navigate} /><//>`;
  }

  const { today, month, lastMonth, lastMonthToDate, totals, insights, warranties } = data;
  const monthProgress = lastMonth.billed > 0 ? month.billed / lastMonth.billed : 0;

  return html`<${View} title="الرئيسية" toolbar=${toolbar}>
    <header class="greeting">
      <div>
        <h1>${fmt.greeting()}</h1>
        <p class="muted">${fmt.longDate()} · ${settings.shop_name}</p>
      </div>
    </header>

    <div class="dash-grid">
      <section class="card hero">
        <div class="stat-label">إيراد هذا الشهر</div>
        <div class="hero-value"><span class="unit">${settings.currency}</span> <${Figure} value=${month.billed} format=${fmt.number} /></div>
        <${Delta} current=${month.billed} previous=${lastMonthToDate.billed} label="مقارنة بنفس الفترة من الشهر الماضي" />
        <div class="hero-progress">
          <div class="meter"><i style=${{ width: `${Math.min(100, monthProgress * 100)}%` }} /></div>
          <div class="hero-progress-text">
            ${lastMonth.billed > 0
    ? html`<span><span class="num">${fmt.percent(monthProgress)}</span> من إيراد الشهر الماضي</span><${Money} value=${lastMonth.billed} class="faint" />`
    : html`<span class="faint">لا يوجد إيراد في الشهر الماضي للمقارنة</span>`}
          </div>
        </div>
        <div class="hero-split">
          <div><span class="faint">محصّل هذا الشهر</span><${Money} value=${month.collected} /></div>
          <div><span class="faint">إيراد اليوم</span><${Money} value=${today.billed} /></div>
          <div><span class="faint">محصّل اليوم</span><${Money} value=${today.collected} /></div>
        </div>
      </section>

      <div class="stat-grid">
        <${StatTile} label="سيارات اليوم" value=${today.orders}
          note=${html`<span class="faint">${today.orders ? 'طلبات صيانة مسجّلة اليوم' : 'لا توجد طلبات اليوم بعد'}</span>`} />
        <${StatTile} label="سيارات هذا الشهر" value=${month.orders}>
          <${Sparkline} values=${data.monthly.map((m) => m.orders)} label="عدد الطلبات في آخر 12 شهراً" />
          <span class="faint">الشهر الماضي <span class="num">${lastMonth.orders}</span></span>
        <//>
        <${StatTile} label="إجمالي المحصّل" value=${totals.collected} format=${fmt.money}
          note=${html`<span class="faint">من أصل <${Money} value=${totals.billed} /></span>`} />
        <${StatTile} label="الذمم المستحقة" value=${totals.outstanding} format=${fmt.money}
          onClick=${() => navigate('accounts', { filter: 'debt' })}
          note=${html`<span class="faint">${totals.debtors ? html`على <span class="num">${totals.debtors}</span> ${totals.debtors === 1 ? 'عميل' : 'عملاء'} · عرض` : 'لا توجد ذمم'}</span>`} />
      </div>

      <section class="card span-8">
        <div class="card-head">
          <h2>الإيراد الشهري <span class="sub">آخر 12 شهراً، حسب تاريخ الطلب</span></h2>
          <div class="legend">
            <span><i style=${{ background: 'var(--series)' }} />محصّل</span>
            <span><i style=${{ background: 'var(--series-light)' }} />متبقٍ</span>
          </div>
          <${IconButton} icon=${chartMode === 'chart' ? 'table' : 'chart'}
            label=${chartMode === 'chart' ? 'عرض كجدول' : 'عرض كرسم'}
            onClick=${() => setChartMode(chartMode === 'chart' ? 'table' : 'chart')} />
        </div>
        <div class="card-pad chart-pad">
          ${chartMode === 'chart' ? html`<${MonthlyChart} data=${data.monthly} />` : html`<${MonthlyTable} data=${data.monthly} />`}
        </div>
      </section>

      <section class="card span-4 collect">
        <div class="card-head"><h2>نسبة التحصيل</h2></div>
        <div class="card-pad">
          <div class="collect-top">
            <${Ring} ratio=${totals.collectionRate} label="نسبة التحصيل" />
            <div class="collect-text">
              <div><span class="faint">محصّل</span><${Money} value=${totals.collected} /></div>
              <div><span class="faint">متبقٍ</span><${Money} value=${totals.outstanding} /></div>
              ${totals.discounts > 0 && html`<div><span class="faint">خصومات</span><${Money} value=${totals.discounts} /></div>`}
            </div>
          </div>
          <ul class="insights">
            <li><${Icon} name="receipt" /><span>متوسط قيمة الطلب</span><${Money} value=${insights.averageTicket} /></li>
            ${insights.busiestDay && html`<li><${Icon} name="calendar" /><span>أكثر الأيام ازدحاماً</span><strong>${insights.busiestDay.name}</strong></li>`}
            <li><${Icon} name="people" /><span>عملاء عائدون</span><strong class="num">${fmt.percent(insights.returningRate)}</strong></li>
            ${insights.bestMonth && html`<li><${Icon} name="trend" /><span>أفضل شهر</span><strong>${fmt.monthLong(insights.bestMonth.month)}</strong></li>`}
            <li><${Icon} name="car" /><span>سيارات مسجّلة</span><strong class="num">${fmt.number(totals.vehicles)}</strong></li>
          </ul>
        </div>
      </section>

      <section class="card span-6">
        <div class="card-head"><h2>الخدمات الأعلى إيراداً <span class="sub">منذ البداية</span></h2></div>
        <div class="card-pad">
          ${data.serviceMix.length
    ? html`<${BarList} items=${data.serviceMix.map((s) => ({
      key: s.key, label: s.label, value: s.revenue, note: `${fmt.number(s.count)} مرة`,
    }))} />`
    : html`<p class="faint">لا توجد خدمات مسجّلة بعد.</p>`}
        </div>
      </section>

      <section class="card span-6">
        <div class="card-head">
          <h2>أعلى الذمم</h2>
          <${Button} variant="plain" size="small" onClick=${() => navigate('accounts', { filter: 'debt' })}>عرض الكل<//>
        </div>
        ${data.topDebtors.length ? html`<ul class="debtors">
          ${data.topDebtors.map((debtor) => html`<li key=${debtor.key}>
            <button type="button" class="debtor-main" onClick=${() => navigate('accounts', { key: debtor.key })}>
              <span class="avatar">${debtor.name.trim().charAt(0)}</span>
              <span class="who"><strong>${debtor.name}</strong>
                <span class="faint">آخر زيارة <span class="num">${fmt.relativeDate(debtor.last_date)}</span></span></span>
              <${Money} value=${debtor.balance} class="amount" />
            </button>
            <${Button} size="small" variant="tinted" onClick=${() => openPayment({ accountKey: debtor.key })}>تسديد<//>
          </li>`)}
        </ul>` : html`<${Empty} icon="checkCircle" title="لا توجد ذمم مستحقة">جميع الحسابات مسدّدة.<//>`}
      </section>

      <section class="card span-8">
        <div class="card-head">
          <h2>آخر الطلبات</h2>
          <${Button} variant="plain" size="small" onClick=${() => navigate('orders')}>عرض الكل<//>
        </div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>الطلب</th><th>العميل</th><th>السيارة</th><th class="end">الإجمالي</th><th class="end">الحالة</th></tr></thead>
          <tbody>
            ${data.recent.map((order) => html`<tr key=${order.order_id} class="clickable" onClick=${() => openOrderForm({ order })}>
              <td><span class="num primary">#${order.order_id}</span><div class="sub num">${fmt.relativeDate(order.order_date)}</div></td>
              <td>${order.customer_name}</td>
              <td><${Plate}>${order.vehicle_id}<//></td>
              <td class="end amount"><${Money} value=${order.total_price} /></td>
              <td class="end"><${BalanceBadge} remaining=${order.remaining_amount} /></td>
            </tr>`)}
          </tbody>
        </table></div>
      </section>

      <section class="card span-4">
        <div class="card-head">
          <h2>ضمان البطاريات</h2>
          <${Button} variant="plain" size="small" onClick=${() => navigate('batteries')}>عرض الكل<//>
        </div>
        <div class="card-pad">
          <div class="warranty-stats">
            <div><strong class="num">${warranties.active}</strong><span class="faint">ضمان سارٍ</span></div>
            <div><strong class="num">${warranties.total}</strong><span class="faint">إجمالي البطاريات</span></div>
          </div>
          ${warranties.expiring.length ? html`
            <h3 class="warranty-title">تنتهي خلال 30 يوماً</h3>
            <ul class="warranty-list">
              ${warranties.expiring.map((b) => html`<li key=${b.id}>
                <span class="who"><strong>${b.customer_name}</strong><span class="faint">${b.battery_type} · <span class="num">${b.vehicle_id}</span></span></span>
                <span class="badge warn">${fmt.days(b.days_left)}</span>
              </li>`)}
            </ul>` : html`<p class="faint warranty-none">${warranties.total
    ? 'لا توجد ضمانات تنتهي خلال الشهر القادم.'
    : html`لم تُسجَّل بطاريات بعد. <a href="#" onClick=${(e) => { e.preventDefault(); openBatteryForm(); }}>إضافة بطارية</a>`}</p>`}
        </div>
      </section>
    </div>
  <//>`;
}
