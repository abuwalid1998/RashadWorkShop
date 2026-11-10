'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp, order } = require('./helpers');
const { nameKey } = require('../src/main/core/normalize');

const KEY = nameKey('أحمد خليل');

test('creating an order totals the services and stores them in the right columns', () => {
  const app = createTestApp();
  const created = app.orders.create(order({ air_filter_price: 45, payment_amount: 100 }));

  assert.equal(created.total_price, 225);
  assert.equal(created.payment_amount, 100);
  assert.equal(created.remaining_amount, 125);
  // The legacy form swapped these two columns; each price must land in its own.
  assert.equal(created.oil_filter_price, 30);
  assert.equal(created.air_filter_price, 45);
  assert.equal(created.date_of_change, '2026-03-10');
  assert.deepEqual(created.lines.map((l) => l.key), ['oil', 'oil_filter', 'air_filter']);
});

test('order validation reports every bad field', () => {
  const app = createTestApp();
  assert.throws(
    () => app.orders.create({ customer_name: ' ', vehicle_id: '', oil_price: -5 }),
    (error) => {
      assert.equal(error.name, 'AppError');
      assert.deepEqual(Object.keys(error.fields).sort(), ['customer_name', 'oil_price', 'total_price', 'vehicle_id']);
      return true;
    });
  assert.throws(() => app.orders.create(order({ payment_amount: 500 })), /أكبر من السعر الكلي/);
});

test('a payment settles the oldest order first and never over-counts', () => {
  const app = createTestApp();
  const first = app.orders.create(order({ order_date: '2026-01-05' })); // 180
  const second = app.orders.create(order({ order_date: '2026-02-05' })); // 180

  const result = app.payments.create({ accountKey: KEY, amount: 200, date: '2026-02-10' });
  assert.equal(result.cash, 200);
  assert.equal(result.settlementId, null);

  assert.equal(app.orders.get(first.order_id).remaining_amount, 0);
  assert.equal(app.orders.get(second.order_id).payment_amount, 20);
  assert.equal(app.orders.get(second.order_id).remaining_amount, 160);
  // Legacy bug: the same 200 was added to both orders. Total paid must be 200.
  assert.equal(app.accounts.get(KEY).totals.paid, 200);
});

test('paying more than the balance is rejected', () => {
  const app = createTestApp();
  app.orders.create(order());
  assert.throws(() => app.payments.create({ accountKey: KEY, amount: 181 }), /أكبر من المستحق/);
  assert.throws(() => app.payments.create({ accountKey: KEY, amount: 0 }), /أكبر من صفر/);
});

test('paying off the whole balance records a settlement', () => {
  const app = createTestApp();
  app.orders.create(order({ payment_amount: 80 }));
  const result = app.payments.create({ accountKey: KEY, amount: 100, date: '2026-03-20' });

  assert.ok(result.settlementId);
  const settlement = app.payments.getSettlement(result.settlementId);
  assert.equal(settlement.balance_before, 100);
  assert.equal(settlement.amount_paid, 100);
  assert.equal(settlement.discount, 0);
  assert.equal(settlement.items.length, 1);
  assert.equal(app.accounts.get(KEY).totals.balance, 0);
});

test('a settlement writes off the unpaid rest as a discount', () => {
  const app = createTestApp();
  const a = app.orders.create(order({ order_date: '2026-01-05' })); // 180
  const b = app.orders.create(order({ order_date: '2026-02-05' })); // 180
  const result = app.payments.create({ accountKey: KEY, amount: 300, settle: true, note: 'اتفاق' });

  assert.equal(result.cash, 300);
  assert.equal(result.discount, 60);
  const account = app.accounts.get(KEY);
  assert.equal(account.totals.balance, 0);
  assert.equal(account.totals.paid, 300);
  assert.equal(account.totals.discount, 60);
  assert.equal(account.ledger.closing, 0);
  // Paid stays real cash; the discount only closes the remaining amount.
  assert.equal(app.orders.get(a.order_id).payment_amount, 180);
  assert.equal(app.orders.get(b.order_id).payment_amount, 120);
  assert.equal(app.orders.get(b.order_id).remaining_amount, 0);
});

test('deleting a receipt returns the money to the order, and undo restores it', () => {
  const app = createTestApp();
  const created = app.orders.create(order());
  const { receiptNo, settlementId } = app.payments.create({ accountKey: KEY, amount: 180 });
  assert.ok(settlementId);

  const { trashId } = app.payments.removeReceipt(receiptNo);
  assert.equal(app.orders.get(created.order_id).remaining_amount, 180);
  assert.equal(app.accounts.get(KEY).settlements.length, 0);

  app.trash.restore(trashId);
  assert.equal(app.orders.get(created.order_id).remaining_amount, 0);
  assert.equal(app.accounts.get(KEY).settlements.length, 1);
});

test('deleting an order removes its payments, and undo brings both back', () => {
  const app = createTestApp();
  const created = app.orders.create(order({ payment_amount: 50 }));
  const { trashId } = app.orders.remove(created.order_id);
  assert.throws(() => app.orders.get(created.order_id), /غير موجود/);
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM payments').n, 0);

  app.trash.restore(trashId);
  const restored = app.orders.get(created.order_id);
  assert.equal(restored.payment_amount, 50);
  assert.equal(app.db.get('SELECT COUNT(*) AS n FROM payments').n, 1);
});

test('editing an order moves the remaining amount without touching payments', () => {
  const app = createTestApp();
  const created = app.orders.create(order({ payment_amount: 100 })); // 180 total
  const updated = app.orders.update(created.order_id, order({ oil_price: 200 })); // 230 total
  assert.equal(updated.total_price, 230);
  assert.equal(updated.payment_amount, 100);
  assert.equal(updated.remaining_amount, 130);
  assert.throws(
    () => app.orders.update(created.order_id, order({ oil_price: 20, oil_filter_price: 0 })),
    /أقل من المبلغ المدفوع/);
});

test('search ignores Alef/Ta-marbuta spelling and plate separators', () => {
  const app = createTestApp();
  app.orders.create(order({ customer_name: 'أسامة حمزة', vehicle_id: '55-123-90' }));
  app.orders.create(order({ customer_name: 'خالد', vehicle_id: '77-000-11' }));

  assert.equal(app.orders.list({ query: 'اسامه' }).count, 1);
  assert.equal(app.orders.list({ query: '5512390' }).count, 1);
  assert.equal(app.orders.list({ query: '55 123' }).count, 1);
  assert.equal(app.accounts.list({ query: 'حمزه' }).rows[0].name, 'أسامة حمزة');
  assert.equal(app.orders.list({ query: '100%' }).count, 0); // wildcards are literal
});

test('orders under different spellings of a name share one account', () => {
  const app = createTestApp();
  app.orders.create(order({ customer_name: 'أحمد  خليل' }));
  app.orders.create(order({ customer_name: 'احمد خليل', vehicle_id: '99-888-77' }));
  const { rows } = app.accounts.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].visits, 2);
  assert.equal(rows[0].vehicle_count, 2);
  assert.equal(rows[0].balance, 360);
});

test('account statement: ledger runs chronologically and reconciles', () => {
  const app = createTestApp();
  app.orders.create(order({ order_date: '2026-01-05', payment_amount: 80 }));
  app.batteries.create({
    customer_name: 'أحمد خليل', vehicle_id: '12-345-67', battery_type: 'Varta 70Ah',
    warranty_period: 12, purchase_date: '2026-02-01', price: 400, payment_amount: 100,
  });
  app.payments.create({ accountKey: KEY, amount: 150, date: '2026-02-15' });

  const account = app.accounts.get(KEY);
  assert.equal(account.totals.billed, 580);
  assert.equal(account.totals.paid, 330);
  assert.equal(account.totals.balance, 250);
  assert.deepEqual(account.ledger.lines.map((l) => l.balance), [180, 100, 500, 400, 250]);
  assert.equal(account.ledger.closing, account.totals.balance);

  const scoped = app.accounts.get(KEY, { from: '2026-02-01' });
  assert.equal(scoped.ledger.opening, 100);
  assert.equal(scoped.ledger.lines.length, 3);
  assert.equal(scoped.ledger.closing, 250);
});

test('battery warranty expiry is calendar-accurate', () => {
  const app = createTestApp();
  const battery = app.batteries.create({
    customer_name: 'سامي', vehicle_id: '1-2-3', battery_type: 'Bosch',
    warranty_period: 1, purchase_date: '2026-01-31', price: 300,
  });
  assert.equal(battery.expires_on, '2026-02-28');
  assert.equal(battery.remaining_amount, 300);
});

test('dashboard counts today only (the legacy page matched the day of any month)', () => {
  const app = createTestApp();
  app.orders.create(order({ order_date: '2026-03-10', payment_amount: 180 }));
  app.orders.create(order({ order_date: '2026-02-10', customer_name: 'خالد' }));
  app.orders.create(order({ order_date: '2026-03-02', customer_name: 'سامي' }));

  const data = app.dashboard.get(new Date(2026, 2, 10, 12));
  assert.equal(data.today.orders, 1);
  assert.equal(data.month.orders, 2);
  assert.equal(data.lastMonth.orders, 1);
  assert.equal(data.totals.billed, 540);
  assert.equal(data.totals.collected, 180);
  assert.equal(data.totals.outstanding, 360);
  assert.equal(data.monthly.length, 12);
  assert.equal(data.monthly.at(-1).billed, 360);
  assert.equal(data.serviceMix[0].key, 'oil');
});
