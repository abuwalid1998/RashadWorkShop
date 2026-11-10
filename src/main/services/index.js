'use strict';
const { ensureSchema } = require('../db/schema');
const { createPaymentsService } = require('./payments');
const { createOrdersService } = require('./orders');
const { createBatteriesService } = require('./batteries');
const { createAccountsService } = require('./accounts');
const { createDashboardService } = require('./dashboard');
const { createSettingsService } = require('./settings');
const { createTrashService } = require('./trash');

/** Wire every service to one open database. */
function createServices(db) {
  const schema = ensureSchema(db);
  const payments = createPaymentsService(db);
  const orders = createOrdersService(db, payments);
  const batteries = createBatteriesService(db, payments);
  const accounts = createAccountsService(db, payments);
  const dashboard = createDashboardService(db, batteries);
  const settings = createSettingsService(db);
  const trash = createTrashService(db);
  trash.prune();
  return { schema, payments, orders, batteries, accounts, dashboard, settings, trash };
}

module.exports = { createServices };
