'use strict';
const { SERVICE_ITEMS, orderLines } = require('../core/catalog');
const { toCents, fromCents } = require('../core/money');
const { formatDate, addMonths, addDays, monthStart } = require('../core/dates');

const money = (value) => fromCents(toCents(value));
const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS_SHOWN = 12;

/** Numbers and insights for the welcome screen, computed in one pass. */
function createDashboardService(db, batteries) {
  /** Billed/collected for items dated in [from, to). */
  function period(from, to) {
    const row = db.get(
      `SELECT COUNT(*) AS items, COALESCE(SUM(source = 'service'), 0) AS orders,
              COALESCE(SUM(total), 0) AS billed
         FROM account_items WHERE date >= ? AND date < ?`, from, to);
    const cash = db.get(
      `SELECT COALESCE(SUM(amount), 0) AS collected FROM payments
        WHERE kind IN ('payment', 'opening') AND paid_at >= ? AND paid_at < ?`, from, to);
    return { orders: row.orders, items: row.items, billed: money(row.billed), collected: money(cash.collected) };
  }

  function get(reference = new Date()) {
    const today = formatDate(reference);
    const tomorrow = addDays(today, 1);
    const thisMonth = monthStart(today);
    const nextMonth = addMonths(thisMonth, 1);
    const lastMonth = addMonths(thisMonth, -1);
    // Same point in last month, for a like-for-like comparison.
    const lastMonthSameDay = addDays(addMonths(today, -1), 1);

    const totals = db.get(
      `SELECT COUNT(*) AS items, COALESCE(SUM(source = 'service'), 0) AS orders,
              COALESCE(SUM(source = 'battery'), 0) AS batteries,
              COALESCE(SUM(total), 0) AS billed, COALESCE(SUM(paid), 0) AS paid,
              COUNT(DISTINCT account_key) AS customers, COUNT(DISTINCT vehicle_key) AS vehicles
         FROM account_items`);
    // What customers owe: a credit on one account never offsets another's debt.
    const balances = db.get(
      `SELECT COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS outstanding,
              COALESCE(SUM(balance > 0.004), 0) AS debtors,
              COALESCE(SUM(visits > 1), 0) AS repeat_customers
         FROM (SELECT SUM(remaining) AS balance, COUNT(*) AS visits FROM account_items GROUP BY account_key)`);
    const discounts = db.get("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE kind = 'discount'");

    const firstMonth = addMonths(thisMonth, -(MONTHS_SHOWN - 1));
    const byMonth = new Map(db.all(
      `SELECT substr(date, 1, 7) AS month, COALESCE(SUM(source = 'service'), 0) AS orders,
              SUM(total) AS billed, SUM(paid) AS paid, SUM(remaining) AS remaining
         FROM account_items WHERE date >= ? AND date < ? GROUP BY month`, firstMonth, nextMonth)
      .map((row) => [row.month, row]));
    const monthly = Array.from({ length: MONTHS_SHOWN }, (_, i) => {
      const month = addMonths(firstMonth, i).slice(0, 7);
      const row = byMonth.get(month);
      return {
        month,
        orders: row?.orders ?? 0,
        billed: money(row?.billed ?? 0),
        paid: money(row?.paid ?? 0),
        remaining: Math.max(0, money(row?.remaining ?? 0)),
      };
    });

    const mixRow = db.get(
      `SELECT ${SERVICE_ITEMS.map((s) =>
        `COALESCE(SUM(${s.column} > 0), 0) AS ${s.key}_count, COALESCE(SUM(${s.column}), 0) AS ${s.key}_revenue`).join(', ')}
         FROM car_service_fixed`);
    const serviceMix = SERVICE_ITEMS
      .map((s) => ({ key: s.key, label: s.label, count: mixRow[`${s.key}_count`], revenue: money(mixRow[`${s.key}_revenue`]) }))
      .concat(totals.batteries
        ? [{
          key: 'battery', label: 'بطاريات', count: totals.batteries,
          revenue: money(db.get('SELECT COALESCE(SUM(price), 0) AS r FROM battery_warranty').r),
        }]
        : [])
      .filter((s) => s.count > 0)
      .sort((a, b) => b.revenue - a.revenue);

    const topDebtors = db.all(
      `SELECT account_key AS key, customer_name AS name, MAX(date) AS last_date,
              SUM(remaining) AS balance, COUNT(*) AS visits
         FROM account_items GROUP BY account_key HAVING SUM(remaining) > 0.004
        ORDER BY balance DESC LIMIT 5`).map((row) => ({ ...row, balance: money(row.balance) }));

    const recent = db.all('SELECT * FROM car_service_fixed ORDER BY order_date DESC, order_id DESC LIMIT 10')
      .map((row) => ({ ...row, lines: orderLines(row) }));

    const weekday = db.get(
      `SELECT CAST(strftime('%w', order_date) AS INTEGER) AS day, COUNT(*) AS orders
         FROM car_service_fixed WHERE order_date IS NOT NULL AND strftime('%w', order_date) IS NOT NULL
        GROUP BY day ORDER BY orders DESC LIMIT 1`);
    const bestMonth = db.get(
      `SELECT substr(date, 1, 7) AS month, SUM(total) AS billed FROM account_items
        WHERE date <> '' GROUP BY month ORDER BY billed DESC LIMIT 1`);

    const billed = money(totals.billed);
    const collected = money(totals.paid);
    return {
      generated_on: today,
      empty: totals.items === 0,
      today: period(today, tomorrow),
      month: period(thisMonth, nextMonth),
      lastMonth: period(lastMonth, thisMonth),
      lastMonthToDate: period(lastMonth, lastMonthSameDay < thisMonth ? lastMonthSameDay : thisMonth),
      totals: {
        orders: totals.orders,
        batteries: totals.batteries,
        customers: totals.customers,
        vehicles: totals.vehicles,
        billed,
        collected,
        outstanding: money(balances.outstanding),
        discounts: money(discounts.total),
        debtors: balances.debtors,
        collectionRate: billed > 0 ? Math.min(1, collected / billed) : 0,
      },
      monthly,
      serviceMix,
      topDebtors,
      recent,
      warranties: batteries.warrantyOverview(today),
      insights: {
        averageTicket: totals.orders
          ? money(db.get('SELECT AVG(total_price) AS a FROM car_service_fixed').a) : 0,
        busiestDay: weekday ? { name: WEEKDAYS[weekday.day], orders: weekday.orders } : null,
        returningRate: totals.customers ? balances.repeat_customers / totals.customers : 0,
        returningCustomers: balances.repeat_customers,
        bestMonth: bestMonth ? { month: bestMonth.month, billed: money(bestMonth.billed) } : null,
      },
    };
  }

  return { get };
}

module.exports = { createDashboardService };
