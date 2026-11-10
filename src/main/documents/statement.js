'use strict';
const { page } = require('./layout');
const { esc, money, moneyOrDash, date, formatNumber, formatDate } = require('./format');

function itemRow(item, currency) {
  const lines = item.lines
    .map((line) => `<li><span>${esc(line.label)}</span>${money(line.price)}</li>`)
    .join('');
  const detail = item.source === 'battery'
    ? `<div class="muted">ضمان ${esc(item.warranty_period || 0)} شهر</div>`
    : item.km_counter ? `<div class="muted">العداد <span class="num" dir="ltr">${formatNumber(item.km_counter)}</span> كم</div>` : '';
  const state = item.remaining > 0.004
    ? `<span class="tag due">متبقٍ ${money(item.remaining, currency)}</span>`
    : '<span class="tag paid">مسدّد</span>';
  return `<tr>
    <td>${date(item.date)}<div class="muted">${item.source === 'service' ? 'طلب' : 'بطارية'} <span class="num" dir="ltr">#${item.id}</span></div></td>
    <td><span class="num" dir="ltr">${esc(item.vehicle_id)}</span>${detail}</td>
    <td><ul class="lines">${lines}</ul></td>
    <td class="end strong">${money(item.total)}</td>
    <td class="end">${moneyOrDash(item.paid)}</td>
    <td class="end">${state}</td>
  </tr>`;
}

function ledgerRow(line) {
  return `<tr>
    <td>${date(line.date)}</td>
    <td>${esc(line.description)}${line.vehicle_id ? ` <span class="muted num" dir="ltr">${esc(line.vehicle_id)}</span>` : ''}</td>
    <td class="muted">${esc(line.ref)}</td>
    <td class="end">${moneyOrDash(line.debit)}</td>
    <td class="end">${moneyOrDash(line.credit)}</td>
    <td class="end strong">${money(line.balance)}</td>
  </tr>`;
}

function settlementRow(settlement, currency) {
  return `<tr>
    <td>${date(settlement.settled_at)}</td>
    <td>${settlement.vehicle_id ? `سيارة <span class="num" dir="ltr">${esc(settlement.vehicle_id)}</span>` : 'كامل الحساب'}${settlement.note ? ` — ${esc(settlement.note)}` : ''}</td>
    <td class="end">${money(settlement.balance_before, currency)}</td>
    <td class="end">${money(settlement.amount_paid, currency)}</td>
    <td class="end">${moneyOrDash(settlement.discount, currency)}</td>
  </tr>`;
}

/**
 * Account statement: who the customer is, what was done on every visit, and
 * a running-balance ledger of charges and payments.
 *
 * @param {object} account result of accounts.get()
 * @param {object} settings shop settings
 * @param {string} generatedOn YYYY-MM-DD
 */
function renderStatement(account, settings, generatedOn) {
  const { currency } = settings;
  const { totals, ledger, scope } = account;
  const periodFiltered = Boolean(scope.from || scope.to);
  // Within a period, list only the visits that fall inside it.
  const inPeriod = (item) => {
    const day = String(item.date).slice(0, 10);
    return (!scope.from || day >= scope.from) && (!scope.to || day <= scope.to);
  };
  const items = account.items.filter(inPeriod);
  const period = periodFiltered
    ? `من ${date(scope.from || account.first_date)} إلى ${date(scope.to || generatedOn)}`
    : `من ${date(account.first_date)} إلى ${date(generatedOn)}`;
  const vehicles = scope.vehicle
    ? [scope.vehicle]
    : account.vehicles.map((v) => v.vehicle_id);
  const balance = ledger.closing;

  const body = `
  <section class="party">
    <div class="field wide"><label>العميل</label><div>${esc(account.name)}</div></div>
    <div class="field"><label>الهاتف</label><div>${account.phone ? `<span class="num" dir="ltr">${esc(account.phone)}</span>` : '—'}</div></div>
    <div class="field"><label>الزيارات</label><div><span class="num">${totals.visits}</span>${totals.batteries
    ? ` <span class="muted">+ <span class="num">${totals.batteries}</span> بطارية</span>` : ''}</div></div>
    <div class="field wide"><label>${vehicles.length > 1 ? 'السيارات' : 'السيارة'}</label>
      <div>${vehicles.map((v) => `<span class="num" dir="ltr">${esc(v)}</span>`).join('، ')}</div></div>
    <div class="field wide"><label>الفترة</label><div>${period}</div></div>
  </section>

  <section class="summary">
    ${periodFiltered ? `<div class="cell"><label>رصيد سابق</label><div class="value">${money(ledger.opening, currency)}</div></div>` : ''}
    <div class="cell"><label>إجمالي الخدمات</label><div class="value">${money(ledger.totalDebit, currency)}</div></div>
    <div class="cell"><label>المدفوع${totals.discount || totals.adjust ? ' والخصومات' : ''}</label><div class="value">${money(ledger.totalCredit, currency)}</div></div>
    ${periodFiltered ? '' : `<div class="cell"><label>منها خصومات</label><div class="value">${money(totals.discount, currency)}</div></div>`}
    <div class="cell total${balance <= 0.004 ? ' clear' : ''}"><label>${balance < -0.004 ? 'رصيد دائن للعميل' : 'الرصيد المستحق'}</label>
      <div class="value">${money(Math.abs(balance), currency)}</div></div>
  </section>

  <h2>الخدمات المقدّمة <small>تفصيل كل زيارة</small></h2>
  ${items.length ? `<table>
    <thead><tr>
      <th>التاريخ</th><th>السيارة</th><th>الخدمات</th>
      <th class="end">الإجمالي</th><th class="end">المدفوع</th><th class="end">الحالة</th>
    </tr></thead>
    <tbody>${items.map((item) => itemRow(item, currency)).join('')}</tbody>
  </table>` : '<p class="muted">لا توجد خدمات في هذه الفترة.</p>'}

  <h2>كشف الحركات <small>الرصيد بعد كل حركة</small></h2>
  <table>
    <thead><tr>
      <th>التاريخ</th><th>البيان</th><th>المرجع</th>
      <th class="end">مدين</th><th class="end">دائن</th><th class="end">الرصيد</th>
    </tr></thead>
    <tbody>
      ${periodFiltered ? `<tr class="opening"><td>${date(scope.from)}</td><td colspan="4">رصيد سابق</td><td class="end">${money(ledger.opening)}</td></tr>` : ''}
      ${ledger.lines.map(ledgerRow).join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="3">الإجمالي</td>
      <td class="end">${money(ledger.totalDebit)}</td>
      <td class="end">${money(ledger.totalCredit)}</td>
      <td class="end">${money(balance, currency)}</td>
    </tr></tfoot>
  </table>

  ${account.settlements.length ? `
  <h2>التسويات</h2>
  <table>
    <thead><tr><th>التاريخ</th><th>النطاق</th><th class="end">الرصيد قبل التسوية</th><th class="end">المدفوع</th><th class="end">الخصم</th></tr></thead>
    <tbody>${account.settlements.map((s) => settlementRow(s, currency)).join('')}</tbody>
  </table>` : ''}

  <div class="signatures"><div>توقيع الورشة</div><div>توقيع العميل</div></div>`;

  return page({
    title: 'كشف حساب',
    subtitle: `بتاريخ ${date(generatedOn)}`,
    settings,
    generatedOn,
    body,
  });
}

/** A readable, filesystem-safe file name for the statement PDF. */
const statementFileName = (account, generatedOn) =>
  `كشف حساب - ${account.name} - ${formatDate(generatedOn).replace(/\//g, '-')}.pdf`.replace(/[\\/:*?"<>|]/g, ' ');

module.exports = { renderStatement, statementFileName };
