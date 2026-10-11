// Mirrors the part of receipts/ReceiptMatcher.kt the review queue needs at import time: reading an
// order's receipt for the product a partial refund paid back. (Naming rows from receipts happens in
// the app's importer, before the statement is exported, so it is not repeated here.)
//
// A receipt is { id, sentAt: "YYYY-MM-DD HH:MM:SS" in Seoul time, total, items, lines: [{ name,
// unitPrice, quantity }] }.

import { parseLocalSeconds, parseRowMinutes } from './dates.js';

const AMOUNT_TOLERANCE = 0.5;
const WINDOW_MINUTES = 120;

/**
 * Products on the order charged [charged] at [chargedAt] that cost exactly [refund], as one unit or
 * several of the same. Empty when that order has no single matching receipt.
 */
export function itemsCosting(receipts, refund, charged, chargedAt) {
  const fitting = receipts.filter((r) => fits(charged, chargedAt, r));
  if (fitting.length !== 1) return [];
  const names = fitting[0].lines
    .filter((line) => {
      for (let k = 1; k <= line.quantity; k++) {
        if (Math.abs(line.unitPrice * k - refund) <= AMOUNT_TOLERANCE) return true;
      }
      return false;
    })
    .map((line) => line.name);
  return [...new Set(names)];
}

/** [receipts] as the ItemLookup Refunds.planImport matches partial refunds with. */
export const itemLookup = (receipts) =>
  receipts.length === 0 ? () => [] : (refund, charged, chargedAt) => itemsCosting(receipts, refund, charged, chargedAt);

/** Whether [receipt] is the mail for a charge of [charged] made at [date]. */
function fits(charged, date, receipt) {
  if (Math.abs(charged - receipt.total) > AMOUNT_TOLERANCE) return false;
  const rowMinutes = parseRowMinutes(date);
  const receiptSeconds = parseLocalSeconds(receipt.sentAt);
  if (rowMinutes === null || receiptSeconds === null) return false;
  if (date.trim().length > 10) {
    // Duration.toMinutes() truncates toward zero.
    return Math.abs(Math.trunc((receiptSeconds - rowMinutes * 60) / 60)) <= WINDOW_MINUTES;
  }
  return Math.floor(rowMinutes / 1440) === Math.floor(receiptSeconds / 86_400);
}
