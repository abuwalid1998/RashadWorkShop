#!/usr/bin/env node
'use strict';
/**
 * Fill a database with realistic demo data for trying the app out.
 *
 *   npm run seed:demo -- --out ./demo.db
 *   RASHAD_DATA_DIR=./demo-data npm start     (run the app against a separate folder)
 *
 * Refuses to touch a database that already has records.
 */
const path = require('node:path');
const fs = require('node:fs');
const { quietSqliteWarning } = require('./run-with-electron');

quietSqliteWarning();
const { Database } = require('../src/main/db/database');
const { createServices } = require('../src/main/services');
const { databaseFile } = require('../src/main/paths');
const { formatDate } = require('../src/main/core/dates');

const NAMES = [
  'أحمد خليل', 'محمود أبو سالم', 'خالد العلي', 'يوسف حمدان', 'سامي النجار', 'إبراهيم عودة', 'عمر الشريف',
  'حسن زيدان', 'ماهر قاسم', 'طارق سليمان', 'وليد جبر', 'نادر حداد', 'رامي عيسى', 'فادي منصور', 'باسل درويش',
  'زياد الخطيب', 'هاني صالح', 'معتز بركات', 'كريم ناصر', 'أنس الطويل', 'جهاد مرعي', 'عماد الحلو',
];
const OILS = ['5W-30', '5W-40', '10W-40', '0W-20', '15W-40'];
const BATTERIES = ['Varta 70Ah', 'Bosch S4 60Ah', 'Exide 74Ah', 'Tudor 62Ah'];

// Deterministic pseudo-random numbers: the same demo data on every run.
let seed = 20261110;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (p) => random() < p;
const between = (min, max) => Math.round(min + random() * (max - min));
const plate = () => `${between(10, 99)}-${between(100, 999)}-${between(10, 99)}`;

function main() {
  const index = process.argv.indexOf('--out');
  const file = path.resolve(index !== -1 ? process.argv[index + 1] : databaseFile());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  const app = createServices(db);
  if (db.get('SELECT EXISTS (SELECT 1 FROM account_items) AS ok').ok) {
    console.error(`${file} already has records; demo data was not added.`);
    process.exit(1);
  }

  const today = new Date();
  const customers = NAMES.map((name) => ({
    name,
    phone: chance(0.7) ? `059${between(1000000, 9999999)}` : '',
    vehicles: chance(0.25) ? [plate(), plate()] : [plate()],
    km: between(40000, 180000),
  }));

  db.transaction(() => {
    for (let daysAgo = 400; daysAgo >= 0; daysAgo -= 1) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
      if (day.getDay() === 5) continue; // closed on Fridays
      const visits = daysAgo === 0 ? 3 : between(0, 3);
      for (let i = 0; i < visits; i += 1) {
        const customer = pick(customers);
        customer.km += between(800, 6000);
        const date = formatDate(day);
        const input = {
          customer_name: customer.name,
          phone_number: customer.phone,
          vehicle_id: pick(customer.vehicles),
          km_counter: customer.km,
          oil_type: pick(OILS),
          oil_price: between(12, 22) * 10,
          oil_filter_price: chance(0.8) ? between(3, 6) * 10 : 0,
          air_filter_price: chance(0.45) ? between(4, 8) * 10 : 0,
          diesel_filter_price: chance(0.15) ? between(6, 12) * 10 : 0,
          ac_filter_price: chance(0.3) ? between(4, 7) * 10 : 0,
          sparks_change_price: chance(0.12) ? between(12, 24) * 10 : 0,
          timing_belt_price: chance(0.04) ? between(35, 60) * 10 : 0,
          order_date: date,
        };
        const total = ['oil_price', 'oil_filter_price', 'air_filter_price', 'diesel_filter_price',
          'ac_filter_price', 'sparks_change_price', 'timing_belt_price'].reduce((acc, k) => acc + input[k], 0);
        const roll = random();
        input.payment_amount = roll < 0.68 ? total : roll < 0.86 ? Math.round(total / 20) * 10 : 0;
        app.orders.create(input);

        if (chance(0.035)) {
          const price = between(38, 60) * 10;
          app.batteries.create({
            customer_name: customer.name, phone_number: customer.phone, vehicle_id: input.vehicle_id,
            battery_type: pick(BATTERIES), warranty_period: pick([12, 12, 18, 24]), purchase_date: date,
            price, payment_amount: chance(0.6) ? price : Math.round(price / 20) * 10,
          });
        }
      }
      // Some customers come back later to pay what they owe.
      if (daysAgo % 9 === 0 && daysAgo > 0) {
        const debtors = app.accounts.list({ filter: 'debt', sort: 'balance', limit: 4 }).rows;
        for (const debtor of debtors) {
          if (!chance(0.6)) continue;
          const settle = chance(0.15);
          const amount = settle || chance(0.4) ? debtor.balance : Math.max(10, Math.round(debtor.balance / 20) * 10);
          app.payments.create({
            accountKey: debtor.key,
            amount: settle ? Math.floor(debtor.balance / 50) * 50 : Math.min(amount, debtor.balance),
            date: formatDate(day),
            settle,
            note: settle ? 'تسوية نهائية' : '',
          });
        }
      }
    }
  });

  const totals = app.dashboard.get().totals;
  db.close();
  console.log(`Demo data written to ${file}`);
  console.log(`${totals.orders} orders, ${totals.batteries} batteries, ${totals.customers} customers.`);
}

main();
