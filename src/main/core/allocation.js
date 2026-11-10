'use strict';
const { toCents, fromCents } = require('./money');

/**
 * Spread a payment across open items, oldest first (FIFO).
 *
 * The legacy system added the full amount to *every* order of a vehicle,
 * which over-counted payments. Here each shekel settles exactly one item.
 *
 * @param {Array<{source: string, id: number, remaining: number}>} openItems oldest first
 * @param {number} amount cash received
 * @param {{ settle?: boolean }} [options] when settling, whatever the cash does
 *   not cover is written off as a discount so every item closes at zero.
 * @returns {{ lines: Array<{source: string, id: number, cash: number, discount: number}>,
 *             cash: number, discount: number, unallocated: number }}
 */
function allocatePayment(openItems, amount, { settle = false } = {}) {
  let left = toCents(amount);
  let cashTotal = 0;
  let discountTotal = 0;
  const lines = [];

  for (const item of openItems) {
    const due = toCents(item.remaining);
    if (due <= 0) continue;
    const cash = Math.min(due, left);
    const discount = settle ? due - cash : 0;
    if (cash === 0 && discount === 0) continue;
    left -= cash;
    cashTotal += cash;
    discountTotal += discount;
    lines.push({ source: item.source, id: item.id, cash: fromCents(cash), discount: fromCents(discount) });
    if (left === 0 && !settle) break;
  }

  return {
    lines,
    cash: fromCents(cashTotal),
    discount: fromCents(discountTotal),
    unallocated: fromCents(left),
  };
}

/** Sum of what is still owed across items (credits/overpayments are ignored). */
const openBalance = (items) =>
  fromCents(items.reduce((acc, item) => acc + Math.max(0, toCents(item.remaining)), 0));

module.exports = { allocatePayment, openBalance };
