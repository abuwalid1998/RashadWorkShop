'use strict';
const { notFound } = require('../core/errors');
const { createValidator } = require('../core/validate');
const { toCents, fromCents } = require('../core/money');
const { today, withCurrentTime, addMonths, daysBetween, datePart, now } = require('../core/dates');
const { nameKey, vehicleKey, likeContains } = require('../core/normalize');
const { SERVICE_KEY, SERVICE_VEHICLE_KEY } = require('../db/schema');

const SELECT = 'SELECT battery_warranty.rowid AS id, * FROM battery_warranty';

/** Add warranty facts the legacy app left to mental arithmetic. */
function present(row, day = today()) {
  const months = Number(row.warranty_period) || 0;
  const purchased = datePart(row.purchase_date || row.order_date);
  const expires = purchased ? addMonths(purchased, months) : '';
  const daysLeft = expires ? daysBetween(day, expires) : 0;
  return {
    ...row,
    expires_on: expires,
    days_left: daysLeft,
    warranty_status: !expires || daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring' : 'active',
  };
}

function readBatteryInput(input) {
  const v = createValidator(input);
  const data = {
    customer_name: v.text('customer_name', { required: true, label: 'اسم العميل' }),
    phone_number: v.text('phone_number', { max: 30, label: 'رقم الهاتف' }),
    vehicle_id: v.text('vehicle_id', { required: true, max: 40, label: 'رقم السيارة' }),
    battery_type: v.text('battery_type', { required: true, max: 120, label: 'نوع البطارية' }),
    warranty_period: v.integer('warranty_period', { required: true, max: 240, label: 'فترة الضمان' }),
    purchase_date: v.date('purchase_date', { fallback: today(), label: 'تاريخ الشراء' }),
    price: v.amount('price', { required: true, label: 'السعر' }),
  };
  if (data.price <= 0) v.fail('price', 'السعر يجب أن يكون أكبر من صفر');
  return { v, data };
}

function createBatteriesService(db, payments) {
  function list({ query = '', status = 'all', limit = 60, offset = 0 } = {}) {
    const where = [];
    const params = [];
    const term = String(query).trim();
    if (term) {
      where.push(`(${SERVICE_KEY} LIKE ? ESCAPE '\\' OR ${SERVICE_VEHICLE_KEY} LIKE ? ESCAPE '\\'
                  OR battery_type LIKE ? ESCAPE '\\' OR phone_number LIKE ? ESCAPE '\\')`);
      params.push(likeContains(nameKey(term)), likeContains(vehicleKey(term) || term),
        likeContains(term), likeContains(term));
    }
    if (status === 'unpaid') where.push('remaining_amount > 0.004');
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    let rows = db.all(
      `${SELECT} ${clause} ORDER BY COALESCE(order_date, purchase_date) DESC, battery_warranty.rowid DESC`,
      ...params).map((row) => present(row));
    // Warranty state depends on today's date, so it is filtered here, not in SQL.
    if (status === 'active') rows = rows.filter((r) => r.warranty_status !== 'expired');
    if (status === 'expiring') rows = rows.filter((r) => r.warranty_status === 'expiring');
    if (status === 'expired') rows = rows.filter((r) => r.warranty_status === 'expired');
    const start = Number(offset) || 0;
    return {
      rows: rows.slice(start, start + Math.min(Number(limit) || 60, 500)),
      count: rows.length,
      billed: fromCents(rows.reduce((acc, r) => acc + toCents(r.price), 0)),
      remaining: fromCents(rows.reduce((acc, r) => acc + toCents(r.remaining_amount), 0)),
    };
  }

  function get(id) {
    const row = db.get(`${SELECT} WHERE battery_warranty.rowid = ?`, Number(id));
    if (!row) throw notFound('سجل البطارية');
    return present(row);
  }

  function create(input) {
    const { v, data } = readBatteryInput(input);
    const paid = v.amount('payment_amount', { label: 'مبلغ الدفع' });
    const paymentDay = v.date('payment_date', { fallback: data.purchase_date, label: 'تاريخ الدفع' });
    if (toCents(paid) > toCents(data.price)) v.fail('payment_amount', 'مبلغ الدفع أكبر من السعر');
    v.done();

    return db.transaction(() => {
      const { lastInsertRowid: id } = db.run(
        `INSERT INTO battery_warranty (customer_name, phone_number, vehicle_id, battery_type,
           warranty_period, purchase_date, price, payment_amount, remaining_amount, order_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        data.customer_name, data.phone_number, data.vehicle_id, data.battery_type,
        data.warranty_period, data.purchase_date, data.price, data.price,
        withCurrentTime(data.purchase_date));
      if (paid > 0) {
        payments.record({
          lines: [{ source: 'battery', id, cash: paid, discount: 0 }],
          paidAt: withCurrentTime(paymentDay),
          note: 'دفعة عند الشراء',
        });
      }
      return get(id);
    });
  }

  function update(id, input) {
    const current = get(id);
    const { v, data } = readBatteryInput(input);
    const remaining = fromCents(toCents(current.remaining_amount) + toCents(data.price) - toCents(current.price));
    if (remaining < Math.min(0, current.remaining_amount)) {
      v.fail('price', 'السعر الجديد أقل من المبلغ المدفوع على هذه البطارية');
    }
    v.done();
    db.run(
      `UPDATE battery_warranty
          SET customer_name = ?, phone_number = ?, vehicle_id = ?, battery_type = ?,
              warranty_period = ?, purchase_date = ?, price = ?, remaining_amount = ?
        WHERE rowid = ?`,
      data.customer_name, data.phone_number, data.vehicle_id, data.battery_type,
      data.warranty_period, data.purchase_date, data.price, remaining, Number(id));
    return get(id);
  }

  function remove(id) {
    const row = db.get(`${SELECT} WHERE battery_warranty.rowid = ?`, Number(id));
    if (!row) throw notFound('سجل البطارية');
    return db.transaction(() => {
      const ledger = db.all("SELECT * FROM payments WHERE source = 'battery' AND ref_id = ?", row.id);
      const { lastInsertRowid: trashId } = db.run(
        'INSERT INTO trash (kind, payload, deleted_at) VALUES (?, ?, ?)',
        'battery', JSON.stringify({ row, payments: ledger }), now());
      db.run("DELETE FROM payments WHERE source = 'battery' AND ref_id = ?", row.id);
      db.run('DELETE FROM battery_warranty WHERE rowid = ?', row.id);
      return { trashId };
    });
  }

  /** All warranties with computed expiry, for the dashboard. */
  function warrantyOverview(day = today()) {
    const rows = db.all(SELECT).map((row) => present(row, day));
    return {
      total: rows.length,
      active: rows.filter((r) => r.warranty_status !== 'expired').length,
      expiring: rows
        .filter((r) => r.warranty_status === 'expiring')
        .sort((a, b) => a.days_left - b.days_left)
        .slice(0, 5),
    };
  }

  return { list, get, create, update, remove, warrantyOverview };
}

module.exports = { createBatteriesService };
