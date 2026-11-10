'use strict';
const { toCents, fromCents } = require('./money');
const { datePart } = require('./dates');

const CREDIT_LABELS = {
  payment: 'دفعة',
  opening: 'دفعة مسجّلة (النظام السابق)',
  discount: 'خصم تسوية',
  adjust: 'تسوية رصيد مرحّل',
};

/**
 * Build a chronological account ledger with a running balance.
 *
 * Debits are the services/batteries the customer was charged for; credits are
 * payments and discounts. With a `from` date, everything earlier is folded
 * into an opening balance line so the statement still reconciles.
 *
 * @param {Array<{source: string, id: number, date: string, total: number, description: string, vehicle_id?: string}>} items
 * @param {Array<{receipt_no: number, date: string, kind: string, amount: number, note?: string}>} credits
 * @param {{ from?: string, to?: string }} [period] inclusive YYYY-MM-DD bounds
 */
function buildLedger(items, credits, { from = '', to = '' } = {}) {
  const events = [];

  for (const item of items) {
    events.push({
      date: item.date || '',
      order: 0,
      seq: item.id,
      type: item.source,
      ref: item.source === 'service' ? `طلب ${item.id}` : `بطارية ${item.id}`,
      description: item.description,
      vehicle_id: item.vehicle_id || '',
      debit: toCents(item.total),
      credit: 0,
    });
  }

  for (const credit of credits) {
    const label = CREDIT_LABELS[credit.kind] || CREDIT_LABELS.payment;
    events.push({
      date: credit.date || '',
      order: 1,
      seq: credit.receipt_no,
      type: credit.kind,
      ref: `سند ${credit.receipt_no}`,
      description: credit.note ? `${label} — ${credit.note}` : label,
      vehicle_id: '',
      // An adjustment may be negative (it then raises the balance).
      debit: 0,
      credit: toCents(credit.amount),
    });
  }

  // Same-day events: by exact timestamp, charges before the payments for them.
  events.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order || a.seq - b.seq);

  let balance = 0;
  let opening = 0;
  const lines = [];
  const totals = { debit: 0, credit: 0 };

  for (const event of events) {
    const day = datePart(event.date);
    if (to && day > to) break;
    balance += event.debit - event.credit;
    if (from && day < from) {
      opening = balance;
      continue;
    }
    totals.debit += event.debit;
    totals.credit += event.credit;
    lines.push({
      date: event.date,
      type: event.type,
      ref: event.ref,
      description: event.description,
      vehicle_id: event.vehicle_id,
      debit: fromCents(event.debit),
      credit: fromCents(event.credit),
      balance: fromCents(balance),
    });
  }

  return {
    opening: fromCents(opening),
    lines,
    totalDebit: fromCents(totals.debit),
    totalCredit: fromCents(totals.credit),
    closing: fromCents(balance),
  };
}

module.exports = { buildLedger, CREDIT_LABELS };
