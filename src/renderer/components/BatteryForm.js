import { html } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { getState, invalidate, toast } from '../lib/store.js';
import * as fmt from '../lib/format.js';
import { Sheet, useSheet } from './Sheet.js';
import { SuggestInput } from './Suggest.js';
import { Button, TextInput, Field, Banner, Money, useForm } from './ui.js';

const cents = fmt.toCents;

/** Same calendar rule as the main process: clamp to the end of the month. */
function expiryDate(purchase, months) {
  const [y, m, d] = String(purchase).split('-').map(Number);
  const count = Number(months);
  if (!y || !m || !d || !Number.isInteger(count) || count <= 0) return '';
  const target = new Date(y, m - 1 + count, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, last));
  return fmt.isoDate(target);
}

function BatteryFormBody({ battery, prefill }) {
  const { close } = useSheet();
  const editing = Boolean(battery);
  const form = useForm(battery
    ? {
      customer_name: battery.customer_name, phone_number: battery.phone_number || '',
      vehicle_id: battery.vehicle_id, battery_type: battery.battery_type || '',
      warranty_period: battery.warranty_period || '', purchase_date: String(battery.purchase_date || '').slice(0, 10),
      price: battery.price || '',
    }
    : {
      customer_name: '', phone_number: '', vehicle_id: '', battery_type: '', warranty_period: '12',
      purchase_date: fmt.isoDate(), price: '', payment_amount: '', payment_date: '', ...prefill,
    });

  const price = cents(form.values.price);
  const expires = expiryDate(form.values.purchase_date, form.values.warranty_period);

  const pick = (item) => form.patch({
    customer_name: item.customer_name,
    vehicle_id: item.vehicle_id,
    phone_number: item.phone_number || form.values.phone_number,
  });

  const save = () => form.submit(async (values) => {
    if (editing) await call('batteries.update', { id: battery.id, ...values });
    else await call('batteries.create', values);
    toast(editing ? 'تم حفظ التعديلات' : 'تم حفظ ضمان البطارية');
    invalidate();
    close();
  });

  return html`
    <div class="sheet-body" onKeyDown=${(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()}>
      ${form.message && Object.keys(form.errors).length !== 1 && html`<${Banner} kind="error">${form.message}<//>`}
      <div class="form-grid">
        <${SuggestInput} form=${form} name="vehicle_id" label="رقم السيارة" numeric data-autofocus=${editing ? undefined : true}
          placeholder="12-345-67" onPick=${pick} />
        <${SuggestInput} form=${form} name="customer_name" label="اسم العميل" onPick=${pick} />
        <${TextInput} form=${form} name="phone_number" label="رقم الهاتف" numeric placeholder="اختياري" />
        <${TextInput} form=${form} name="battery_type" label="نوع البطارية" placeholder="مثال: Varta 70Ah" />
        <${TextInput} form=${form} name="purchase_date" label="تاريخ الشراء" type="date" />
        <${Field} label="فترة الضمان" error=${form.errors.warranty_period}
            hint=${expires ? html`ينتهي الضمان في <span class="num">${fmt.date(expires)}</span>` : ''}>
          <div class="pay-row">
            <div class="input-affix">
              <input class="input num" inputmode="numeric" value=${form.values.warranty_period}
                aria-invalid=${form.errors.warranty_period ? 'true' : undefined}
                onInput=${(e) => form.set('warranty_period', e.target.value)} />
              <span class="affix">شهر</span>
            </div>
            ${[12, 18, 24].map((months) => html`<${Button} key=${months} size="small"
              variant=${String(form.values.warranty_period) === String(months) ? 'tinted' : ''}
              onClick=${() => form.set('warranty_period', String(months))}><span class="num">${months}</span><//>`)}
          </div>
        <//>
        <${TextInput} form=${form} name="price" label="السعر" numeric affix=${getState().settings.currency} placeholder="0" />
        ${!editing && html`<${Field} label="مبلغ الدفع" error=${form.errors.payment_amount}>
          <div class="pay-row">
            <div class="input-affix">
              <input class="input num" inputmode="decimal" placeholder="0" value=${form.values.payment_amount}
                aria-invalid=${form.errors.payment_amount ? 'true' : undefined}
                onInput=${(e) => form.set('payment_amount', e.target.value)} />
              <span class="affix">${getState().settings.currency}</span>
            </div>
            <${Button} size="small" variant="tinted" disabled=${price === 0}
              onClick=${() => form.set('payment_amount', String(price / 100))}>كامل المبلغ<//>
          </div>
        <//>`}
        ${editing && html`<div class="span-2"><${Banner}>المدفوع على هذه البطارية <${Money} value=${battery.payment_amount} />. الدفعات تُدار من صفحة الحساب.<//></div>`}
      </div>
    </div>
    <div class="sheet-foot">
      <span class="spacer" />
      <${Button} onClick=${close}>إلغاء<//>
      <${Button} variant="primary" disabled=${form.busy} onClick=${save}>${editing ? 'حفظ التعديلات' : 'حفظ الضمان'}<//>
    </div>`;
}

/** Create or edit a battery sale with its warranty. */
export function BatteryForm({ battery, prefill, onClose }) {
  return html`<${Sheet} title=${battery ? 'تعديل ضمان البطارية' : 'بطارية جديدة'} onClose=${onClose}>
    <${BatteryFormBody} battery=${battery} prefill=${prefill} />
  <//>`;
}
