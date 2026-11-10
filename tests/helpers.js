'use strict';
const { Database } = require('../src/main/db/database');
const { createServices } = require('../src/main/services');

/** Fresh in-memory database with all services wired. */
function createTestApp() {
  const db = new Database(':memory:');
  const services = createServices(db);
  return { db, ...services };
}

const order = (overrides = {}) => ({
  customer_name: 'أحمد خليل',
  vehicle_id: '12-345-67',
  km_counter: 120000,
  oil_type: '5W-30',
  oil_price: 150,
  oil_filter_price: 30,
  order_date: '2026-03-10',
  payment_amount: 0,
  ...overrides,
});

module.exports = { createTestApp, order };
