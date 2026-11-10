import { html, useEffect, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { getState, invalidate, toast } from '../lib/store.js';
import * as fmt from '../lib/format.js';
import { Sheet, useSheet } from './Sheet.js';
import { SuggestInput } from './Suggest.js';
import { Button, TextInput, Field, Banner, Money, useForm, cx } from './ui.js';

const cents = fmt.toCents;

function initialValues(order) {
  const catalog = getState().catalog;
  if (order) {
    return {
      ...Object.fromEntries(catalog.map((item) => [item.column, order[item.column] || ''])),
      customer_name: order.customer_name,
      phone_number: order.phone_number || '',
      vehicle_id: order.vehicle_id,
      km_counter: order.km_counter || '',
      oil_type: order.oil_type || '',
      order_date: String(order.order_date || '').slice(0, 10) || getState().today,
    };
  }
  return {
    ...Object.fromEntries(catalog.map((item) => [item.column, ''])),
    customer_name: '', phone_number: '', vehicle_id: '', km_counter: '', oil_type: '',
    order_date: fmt.isoDate(), payment_amount: '', payment_date: '',
  };
}

function OrderFormBody({ order, prefill }) {
  const { close } = useSheet();
  const catalog = getState().catalog;
  const form = useForm({ ...initialValues(order), ...prefill });
  const [lastVisit, setLastVisit] = useState(null);
  const editing = Boolean(order);

  const total = catalog.reduce((acc, item) => acc + cents(form.values[item.column]), 0);
  const paid = editing ? cents(order.payment_amount) : cents(form.values.payment_amount);
  const remaining = editing
    ? cents(order.remaining_amount) + total - cents(order.total_price)
    : total - paid;

  // Knowing the vehicle is enough to recall the customer and the last service.
  const lookupVehicle = async (vehicle) => {
    if (editing || !vehicle.trim()) return;
    const last = await call('orders.lastForVehicle', { vehicle }).catch(() => null);
    setLastVisit(last);
    if (last) {
      form.patch({
        customer_name: form.values.customer_name || last.customer_name,
        phone_number: form.values.phone_number || last.phone_number || '',
        oil_type: form.values.oil_type || last.oil_type || '',
      });
    }
  };

  useEffect(() => {
    if (prefill?.vehicle_id) lookupVehicle(prefill.vehicle_id);
  }, []);

  const pickSuggestion = (item) => {
    form.patch({
      customer_name: item.customer_name,
      vehicle_id: item.vehicle_id,
      phone_number: item.phone_number || form.values.phone_number,
    });
    lookupVehicle(item.vehicle_id);
  };

  const save = () => form.submit(async (values) => {
    if (editing) {
      await call('orders.update', { id: order.order_id, ...values });
      toast('تم حفظ التعديلات');
    } else {
      const created = await call('orders.create', values);
      toast(`تم حفظ الطلب رقم ${created.order_id}`);
    }
    invalidate();
    close();
  });

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save();
  };

  return html`
    <div class="sheet-body" onKeyDown=${onKeyDown}>
      ${form.message && Object.keys(form.errors).length !== 1 && html`<${Banner} kind="error">${form.message}<//>`}
      <div class="order-form">
        <section>
          <h3>العميل والسيارة</h3>
          <div class="form-grid">
            <${SuggestInput} form=${form} name="vehicle_id" label="رقم السيارة" numeric data-autofocus=${editing ? undefined : true}
              placeholder="12-345-67" onPick=${pickSuggestion} onChange=${(e) => lookupVehicle(e.target.value)} />
            <${TextInput} form=${form} name="km_counter" label="عداد السيارة" numeric affix="كم" placeholder="0" />
            <${SuggestInput} form=${form} name="customer_name" label="اسم الزبون" onPick=${pickSuggestion} />
            <${TextInput} form=${form} name="phone_number" label="رقم الهاتف" numeric placeholder="اختياري" />
            <${TextInput} form=${form} name="order_date" label="تاريخ الطلب" type="date" class="span-2" />
          </div>
          ${lastVisit && html`<div class="last-visit">
            <${Banner} icon="clock">
              آخر زيارة لهذه السيارة <span class="num">${fmt.date(lastVisit.order_date)}</span>
              ${lastVisit.km_counter ? html` · العداد <span class="num">${fmt.number(lastVisit.km_counter)}</span> كم` : ''}
              ${lastVisit.oil_type ? html` · زيت <span class="num">${lastVisit.oil_type}</span>` : ''}
            <//>
          </div>`}

          ${!editing && html`<div class="form-section">
            <h3>الدفع</h3>
            <div class="form-grid">
              <${Field} label="المبلغ المدفوع" error=${form.errors.payment_amount}>
                <div class="pay-row">
                  <div class="input-affix">
                    <input class="input num" inputmode="decimal" placeholder="0" value=${form.values.payment_amount}
                      aria-invalid=${form.errors.payment_amount ? 'true' : undefined}
                      onInput=${(e) => form.set('payment_amount', e.target.value)} />
                    <span class="affix">${getState().settings.currency}</span>
                  </div>
                  <${Button} size="small" variant="tinted" disabled=${total === 0}
                    onClick=${() => form.set('payment_amount', String(total / 100))}>كامل المبلغ<//>
                </div>
              <//>
              <${TextInput} form=${form} name="payment_date" label="تاريخ الدفعة" type="date"
                placeholder=${form.values.order_date} hint="فارغ = تاريخ الطلب" />
            </div>
          </div>`}
          ${editing && html`<div class="form-section">
            <${Banner}>المدفوع على هذا الطلب <${Money} value=${order.payment_amount} />. الدفعات تُدار من صفحة الحساب.<//>
          </div>`}
        </section>

        <section>
          <h3>الخدمات</h3>
          <${TextInput} form=${form} name="oil_type" label="نوع الزيت" placeholder="مثال: 5W-30" />
          <div class="service-prices">
            ${catalog.map((item) => html`<label class="service-row" key=${item.column}>
              <span>${item.label}</span>
              <div class="input-affix">
                <input class=${cx('input num')} inputmode="decimal" placeholder="0"
                  value=${form.values[item.column]}
                  aria-invalid=${form.errors[item.column] ? 'true' : undefined}
                  onInput=${(e) => form.set(item.column, e.target.value)} />
                <span class="affix">${getState().settings.currency}</span>
              </div>
            </label>`)}
          </div>
          ${form.errors.total_price && html`<span class="field"><span class="error" role="alert">${form.errors.total_price}</span></span>`}
        </section>
      </div>
    </div>
    <div class="sheet-foot">
      <div class="totals">
        <div><span class="faint">الإجمالي</span><strong class="num">${fmt.money(total / 100)}</strong></div>
        <div><span class="faint">المدفوع</span><strong class="num">${fmt.money(paid / 100)}</strong></div>
        <div class=${remaining > 0 ? 'due' : ''}><span class="faint">المتبقي</span><strong class="num">${fmt.money(remaining / 100)}</strong></div>
      </div>
      <span class="spacer" />
      <${Button} onClick=${close}>إلغاء<//>
      <${Button} variant="primary" disabled=${form.busy} onClick=${save}>${editing ? 'حفظ التعديلات' : 'حفظ الطلب'}<//>
    </div>`;
}

/** Create or edit a service order. */
export function OrderForm({ order, prefill, onClose }) {
  const title = order ? `تعديل الطلب رقم ${order.order_id}` : 'طلب جديد';
  return html`<${Sheet} title=${title} size="wide" onClose=${onClose}>
    <${OrderFormBody} order=${order} prefill=${prefill} />
  <//>`;
}
