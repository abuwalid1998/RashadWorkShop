'use strict';
const { page } = require('./layout');
const { esc, money, moneyOrDash, date, formatDate } = require('./format');

/**
 * Settlement certificate ("مخالصة"): the items closed, what was paid, what
 * was written off, and both parties' signatures.
 *
 * @param {object} settlement result of payments.getSettlement()
 */
function renderSettlement(settlement, settings, generatedOn) {
  const { currency } = settings;
  const scope = settlement.vehicle_id
    ? `عن السيارة رقم <span class="num" dir="ltr">${esc(settlement.vehicle_id)}</span>`
    : 'عن كامل الحساب';
  const rows = settlement.items.map((item) => `<tr>
      <td>${date(item.date)}</td>
      <td>${item.source === 'service' ? 'طلب صيانة' : 'بطارية'} <span class="num" dir="ltr">#${item.id}</span></td>
      <td><span class="num" dir="ltr">${esc(item.vehicle_id)}</span></td>
      <td class="end">${money(item.total)}</td>
      <td class="end strong">${money(item.due)}</td>
      <td class="end">${moneyOrDash(item.cash)}</td>
      <td class="end">${moneyOrDash(item.discount)}</td>
    </tr>`).join('');

  const body = `
  <section class="party">
    <div class="field wide"><label>العميل</label><div>${esc(settlement.customer_name)}</div></div>
    <div class="field"><label>تاريخ التسوية</label><div>${date(settlement.settled_at)}</div></div>
    <div class="field"><label>رقم التسوية</label><div class="num" dir="ltr">S-${String(settlement.id).padStart(4, '0')}</div></div>
  </section>

  <section class="summary">
    <div class="cell"><label>الرصيد قبل التسوية</label><div class="value">${money(settlement.balance_before, currency)}</div></div>
    <div class="cell"><label>المبلغ المدفوع</label><div class="value">${money(settlement.amount_paid, currency)}</div></div>
    <div class="cell"><label>خصم التسوية</label><div class="value">${money(settlement.discount, currency)}</div></div>
    <div class="cell total clear"><label>الرصيد بعد التسوية</label><div class="value">${money(0, currency)}</div></div>
  </section>

  <p class="statement-text">
    تقرّ <strong>${esc(settings.shop_name)}</strong> بأنها استلمت من السيد/ة
    <strong>${esc(settlement.customer_name)}</strong> مبلغاً وقدره
    <strong>${money(settlement.amount_paid, currency)}</strong>
    بتاريخ ${date(settlement.settled_at)}، وذلك تسويةً نهائية ${scope}${settlement.discount > 0
    ? `، بعد خصم مبلغ <strong>${money(settlement.discount, currency)}</strong>` : ''}.
    وبهذا تكون ذمّة العميل بريئة من المبالغ المبيّنة أدناه حتى تاريخه.
  </p>

  <h2>البنود المشمولة بالتسوية</h2>
  <table>
    <thead><tr>
      <th>التاريخ</th><th>البند</th><th>السيارة</th>
      <th class="end">قيمة البند</th><th class="end">المستحق</th><th class="end">المدفوع</th><th class="end">الخصم</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="4">الإجمالي</td>
      <td class="end">${money(settlement.balance_before)}</td>
      <td class="end">${money(settlement.amount_paid)}</td>
      <td class="end">${moneyOrDash(settlement.discount)}</td>
    </tr></tfoot>
  </table>

  ${settlement.note ? `<div class="note"><strong>ملاحظات:</strong> ${esc(settlement.note)}</div>` : ''}

  <div class="signatures"><div>توقيع وختم الورشة</div><div>توقيع العميل</div></div>`;

  return page({
    title: 'تسوية حساب',
    subtitle: `مخالصة رقم <span class="num" dir="ltr">S-${String(settlement.id).padStart(4, '0')}</span>`,
    settings,
    generatedOn,
    body,
  });
}

const settlementFileName = (settlement) =>
  `تسوية حساب - ${settlement.customer_name} - ${formatDate(settlement.settled_at).replace(/\//g, '-')}.pdf`
    .replace(/[\\/:*?"<>|]/g, ' ');

module.exports = { renderSettlement, settlementFileName };
