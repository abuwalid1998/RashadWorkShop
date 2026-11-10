'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { nameKey, vehicleKey, nameKeySql, vehicleKeySql } = require('../src/main/core/normalize');
const { allocatePayment, openBalance } = require('../src/main/core/allocation');
const { buildLedger } = require('../src/main/core/ledger');
const { sum, round2 } = require('../src/main/core/money');
const { addMonths, isValidDate, daysBetween } = require('../src/main/core/dates');

test('JavaScript and SQL normalisation agree, so search terms match stored text', () => {
  const db = new DatabaseSync(':memory:');
  const name = db.prepare(`SELECT ${nameKeySql('?')} AS k`);
  const vehicle = db.prepare(`SELECT ${vehicleKeySql('?')} AS k`);
  const samples = [
    'أحمد خليل', '  إبراهيم   آدم ', 'حمزة', 'مصطفى', 'عبـــدالله', 'Ali HASAN', '', "O'Brien",
    'أسامة    أبو   سالم', '12-345-67', '12 345.67', 'AB/12_x', 'ة ى أ إ آ',
  ];
  for (const sample of samples) {
    assert.equal(name.get(sample).k, nameKey(sample), `name: ${sample}`);
    assert.equal(vehicle.get(sample).k, vehicleKey(sample), `vehicle: ${sample}`);
  }
  assert.equal(nameKey('أحمد  خليل'), nameKey('احمد خليل'));
  assert.equal(vehicleKey('12-345-67'), vehicleKey('12 34567'));
});

test('money sums are exact', () => {
  assert.equal(sum([0.1, 0.2]), 0.3);
  assert.equal(sum([19.99, 0.01, '5']), 25);
  assert.equal(round2('12,5'), 12.5);
  assert.equal(round2('abc'), 0);
});

test('allocation pays oldest first and stops when the cash runs out', () => {
  const items = [
    { source: 'service', id: 1, remaining: 100 },
    { source: 'service', id: 2, remaining: 0 },
    { source: 'battery', id: 7, remaining: 50.5 },
    { source: 'service', id: 3, remaining: 80 },
  ];
  assert.equal(openBalance(items), 230.5);
  const result = allocatePayment(items, 120.25);
  assert.deepEqual(result.lines, [
    { source: 'service', id: 1, cash: 100, discount: 0 },
    { source: 'battery', id: 7, cash: 20.25, discount: 0 },
  ]);
  assert.equal(result.unallocated, 0);
});

test('settling discounts exactly what the cash did not cover', () => {
  const items = [{ source: 'service', id: 1, remaining: 100 }, { source: 'service', id: 2, remaining: 60 }];
  const result = allocatePayment(items, 130, { settle: true });
  assert.equal(result.cash, 130);
  assert.equal(result.discount, 30);
  assert.deepEqual(result.lines[1], { source: 'service', id: 2, cash: 30, discount: 30 });
});

test('ledger folds earlier activity into an opening balance', () => {
  const items = [
    { source: 'service', id: 1, date: '2026-01-10 09:00:00', total: 200, description: 'a' },
    { source: 'service', id: 2, date: '2026-03-01 09:00:00', total: 100, description: 'b' },
  ];
  const credits = [
    { receipt_no: 1, date: '2026-01-10 09:00:00', kind: 'payment', amount: 50 },
    { receipt_no: 2, date: '2026-03-05 12:00:00', kind: 'discount', amount: 25 },
  ];
  const full = buildLedger(items, credits);
  assert.deepEqual(full.lines.map((l) => l.balance), [200, 150, 250, 225]);
  const march = buildLedger(items, credits, { from: '2026-03-01', to: '2026-03-31' });
  assert.equal(march.opening, 150);
  assert.equal(march.totalDebit, 100);
  assert.equal(march.totalCredit, 25);
  assert.equal(march.closing, 225);
});

test('dates: month arithmetic clamps to month end', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-03-15', -3), '2025-12-15');
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(daysBetween('2026-01-01', '2026-03-01'), 59);
});
