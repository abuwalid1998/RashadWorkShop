'use strict';
const { AppError, notFound } = require('../core/errors');
const { createValidator } = require('../core/validate');
const { SERVICE_ITEMS, PRICE_COLUMNS, orderLines } = require('../core/catalog');
const { toCents, fromCents, sum } = require('../core/money');
const { today, withCurrentTime, datePart, now } = require('../core/dates');
const { nameKey, vehicleKey, likeContains } = require('../core/normalize');
const { SERVICE_KEY, SERVICE_VEHICLE_KEY } = require('../db/schema');

const SORTS = {
  recent: 'order_date DESC, order_id DESC',
  oldest: 'order_date ASC, order_id ASC',
  total: 'total_price DESC, order_id DESC',
  remaining: 'remaining_amount DESC, order_id DESC',
};

const present = (row) => ({ ...row, lines: orderLines(row) });

/** Read and validate the fields shared by create and update. */
function readOrderInput(input) {
  const v = createValidator(input);
  const data = {
    customer_name: v.text('customer_name', { required: true, label: 'اسم الزبون' }),
    phone_number: v.text('phone_number', { max: 30, label: 'رقم الهاتف' }),
    vehicle_id: v.text('vehicle_id', { required: true, max: 40, label: 'رقم السيارة' }),
    km_counter: v.integer('km_counter', { label: 'عداد السيارة' }),
    oil_type: v.text('oil_type', { max: 120, label: 'نوع الزيت' }),
    order_day: v.date('order_date', { fallback: today(), label: 'تاريخ الطلب' }),
  };
  for (const item of SERVICE_ITEMS) data[item.column] = v.amount(item.column, { label: item.label });
  data.total_price = sum(PRICE_COLUMNS.map((c) => data[c]));
  if (data.total_price <= 0) v.fail('total_price', 'أضف سعر خدمة واحدة على الأقل');
  return { v, data };
}

function createOrdersService(db, payments) {
  function list({ query = '', status = 'all', from = '', to = '', sort = 'recent', limit = 60, offset = 0 } = {}) {
    const where = [];
    const params = [];
    const term = String(query).trim();
    if (term) {
      const idMatch = /^#?\d+$/.test(term) ? Number(term.replace('#', '')) : -1;
      where.push(`(${SERVICE_KEY} LIKE ? ESCAPE '\\' OR ${SERVICE_VEHICLE_KEY} LIKE ? ESCAPE '\\'
                  OR phone_number LIKE ? ESCAPE '\\' OR order_id = ?)`);
      params.push(likeContains(nameKey(term)), likeContains(vehicleKey(term) || term), likeContains(term), idMatch);
    }
    if (status === 'unpaid') where.push('remaining_amount > 0.004');
    if (status === 'paid') where.push('remaining_amount <= 0.004');
    if (from) {
      where.push('order_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('order_date < ?');
      params.push(`${to} 99`); // sorts after every time on that day
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.all(
      `SELECT * FROM car_service_fixed ${clause}
        ORDER BY ${SORTS[sort] || SORTS.recent} LIMIT ? OFFSET ?`,
      ...params, Math.min(Number(limit) || 60, 500), Number(offset) || 0);
    const summary = db.get(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_price), 0) AS billed,
              COALESCE(SUM(payment_amount), 0) AS paid, COALESCE(SUM(remaining_amount), 0) AS remaining
         FROM car_service_fixed ${clause}`, ...params);
    return {
      rows: rows.map(present),
      count: summary.count,
      billed: fromCents(toCents(summary.billed)),
      paid: fromCents(toCents(summary.paid)),
      remaining: fromCents(toCents(summary.remaining)),
    };
  }

  function get(id) {
    const row = db.get('SELECT * FROM car_service_fixed WHERE order_id = ?', Number(id));
    if (!row) throw notFound('الطلب');
    return present(row);
  }

  function create(input) {
    const { v, data } = readOrderInput(input);
    const paid = v.amount('payment_amount', { label: 'المبلغ المدفوع' });
    const paymentDay = v.date('payment_date', { fallback: data.order_day, label: 'تاريخ الدفعة' });
    if (toCents(paid) > toCents(data.total_price)) {
      v.fail('payment_amount', 'المبلغ المدفوع أكبر من السعر الكلي');
    }
    v.done();

    return db.transaction(() => {
      const orderDate = withCurrentTime(data.order_day);
      const { lastInsertRowid: id } = db.run(
        `INSERT INTO car_service_fixed (
           customer_name, phone_number, vehicle_id, km_counter, date_of_change, oil_type,
           ${PRICE_COLUMNS.join(', ')}, total_price, payment_amount, remaining_amount, order_date)
         VALUES (?, ?, ?, ?, ?, ?, ${PRICE_COLUMNS.map(() => '?').join(', ')}, ?, 0, ?, ?)`,
        data.customer_name, data.phone_number, data.vehicle_id, data.km_counter, data.order_day,
        data.oil_type, ...PRICE_COLUMNS.map((c) => data[c]),
        data.total_price, data.total_price, orderDate);
      if (paid > 0) {
        payments.record({
          lines: [{ source: 'service', id, cash: paid, discount: 0 }],
          paidAt: withCurrentTime(paymentDay),
          note: 'دفعة عند الطلب',
        });
      }
      return get(id);
    });
  }

  function update(id, input) {
    const current = get(id);
    const { v, data } = readOrderInput({ ...input, order_date: input.order_date || datePart(current.order_date) });
    // Editing prices moves the remaining amount by the same difference, so
    // payments already made are untouched.
    const remaining = fromCents(
      toCents(current.remaining_amount) + toCents(data.total_price) - toCents(current.total_price));
    if (remaining < Math.min(0, current.remaining_amount)) {
      v.fail('total_price', 'السعر الكلي الجديد أقل من المبلغ المدفوع على هذا الطلب');
    }
    v.done();

    const orderDate = data.order_day === datePart(current.order_date)
      ? current.order_date
      : withCurrentTime(data.order_day);
    db.run(
      `UPDATE car_service_fixed
          SET customer_name = ?, phone_number = ?, vehicle_id = ?, km_counter = ?, date_of_change = ?,
              oil_type = ?, ${PRICE_COLUMNS.map((c) => `${c} = ?`).join(', ')},
              total_price = ?, remaining_amount = ?, order_date = ?
        WHERE order_id = ?`,
      data.customer_name, data.phone_number, data.vehicle_id, data.km_counter, data.order_day,
      data.oil_type, ...PRICE_COLUMNS.map((c) => data[c]),
      data.total_price, remaining, orderDate, Number(id));
    return get(id);
  }

  /** Delete an order with its payments. Returns a trash id for undo. */
  function remove(id) {
    const row = db.get('SELECT * FROM car_service_fixed WHERE order_id = ?', Number(id));
    if (!row) throw notFound('الطلب');
    return db.transaction(() => {
      const ledger = db.all("SELECT * FROM payments WHERE source = 'service' AND ref_id = ?", row.order_id);
      const { lastInsertRowid: trashId } = db.run(
        'INSERT INTO trash (kind, payload, deleted_at) VALUES (?, ?, ?)',
        'order', JSON.stringify({ row, payments: ledger }), now());
      db.run("DELETE FROM payments WHERE source = 'service' AND ref_id = ?", row.order_id);
      db.run('DELETE FROM car_service_fixed WHERE order_id = ?', row.order_id);
      return { trashId };
    });
  }

  /** Last visit of a vehicle — pre-fills the new-order form. */
  function lastForVehicle(vehicleId) {
    const key = vehicleKey(vehicleId);
    if (!key) return null;
    const row = db.get(
      `SELECT * FROM car_service_fixed WHERE ${SERVICE_VEHICLE_KEY} = ?
        ORDER BY order_date DESC, order_id DESC LIMIT 1`, key);
    return row ? present(row) : null;
  }

  return { list, get, create, update, remove, lastForVehicle };
}

module.exports = { createOrdersService };
