'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp, order } = require('./helpers');
const { buildDocument } = require('../src/main/documents');
const { nameKey } = require('../src/main/core/normalize');

const KEY = nameKey('أحمد خليل');

test('statement lists every visit with its services and the running balance', () => {
  const app = createTestApp();
  app.orders.create(order({ order_date: '2026-01-05', payment_amount: 80, air_filter_price: 45 }));
  app.orders.create(order({ order_date: '2026-02-05', vehicle_id: '99-000-11' }));
  const { html, fileName } = buildDocument(app, { type: 'statement', key: KEY });

  assert.match(fileName, /^كشف حساب - أحمد خليل - \d{2}-\d{2}-\d{4}\.pdf$/);
  assert.match(html, /كشف حساب/);
  assert.match(html, /فلتر هواء/);
  assert.match(html, /زيت المحرك \(5W-30\)/);
  assert.match(html, /05\/01\/2026/);
  assert.match(html, /99-000-11/);
  assert.match(html, /دفعة — عند الطلب/);
  assert.match(html, /الرصيد المستحق/);
  assert.match(html, />₪ 325</); // 225 + 180 − 80
});

test('settlement certificate states what was paid and written off', () => {
  const app = createTestApp();
  app.orders.create(order());
  const { settlementId } = app.payments.create({ accountKey: KEY, amount: 150, settle: true, note: 'خصم زبون دائم' });
  const { html, fileName } = buildDocument(app, { type: 'settlement', id: settlementId });

  assert.match(fileName, /^تسوية حساب - أحمد خليل/);
  assert.match(html, /S-0001/);
  assert.match(html, />₪ 150</);
  assert.match(html, />₪ 30</);
  assert.match(html, /خصم زبون دائم/);
  assert.match(html, /ذمّة العميل بريئة/);
});

test('customer text cannot inject markup into a document', () => {
  const app = createTestApp();
  app.orders.create(order({ customer_name: '<img src=x onerror=alert(1)>', oil_type: '"><script>' }));
  const { html } = buildDocument(app, { type: 'statement', key: nameKey('<img src=x onerror=alert(1)>') });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;img src=x/);
});
