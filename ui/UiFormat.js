// Mirrors ui/UiFormat.kt. Plain functions, no UI, so the conformance tests can run them in Node.

import { Refunds } from '../logic/Refunds.js';
import { paidAmount } from '../logic/MarkLogic.js';
import { addDays, addMonths, firstDayOf, lastDayOf, monthLabel } from '../logic/dates.js';
import { formatGrouped } from '../logic/numbers.js';
import { ifBlank } from '../logic/strings.js';

export function formatMoney(value, currency = 'KRW') {
  return `${formatGrouped(value, currency.toUpperCase() === 'KRW' ? 0 : 2)} ${currency}`;
}

export const formatSigned = (value, currency = 'KRW') => (value > 0 ? '+' : '') + formatMoney(value, currency);

export const displayAmount = (tx) => paidAmount(tx);

export function amountBreakdown(tx) {
  const paid = paidAmount(tx);
  if (Math.abs(tx.amount - paid) < 0.005) return null;
  return `Statement ${formatSigned(tx.amount, tx.currency)} · GF share ${formatMoney(tx.gfAmount, tx.currency)}`;
}

/** "Refund +12,000 KRW deducted · was -54,300 KRW · she gets 6,000 KRW back", or null. */
export function refundedText(purchase, refunds) {
  if (refunds.length === 0) return null;
  const refunded = refunds.reduce((sum, r) => sum + r.amount, 0);
  const was = formatSigned(purchase.amount - refunded, purchase.currency);
  let what;
  if (purchase.amount === 0) what = 'Fully refunded';
  else if (refunds.length === 1) what = `Refund ${formatSigned(refunded, purchase.currency)} deducted`;
  else what = `${refunds.length} refunds ${formatSigned(refunded, purchase.currency)} deducted`;
  const herShare = refunds.reduce((sum, r) => sum + r.gfAmount, 0);
  const back = herShare > 0 ? ` · she gets ${formatMoney(herShare, purchase.currency)} back` : '';
  return `${what} · was ${was}${back}`;
}

/** What a deducted refund owes her and whether the group chat has heard, or null. */
export function refundShareText(refund) {
  if (!Refunds.isDeducted(refund) || refund.gfAmount <= 0) return null;
  const back = `You send her back ${formatMoney(refund.gfAmount, refund.currency)}`;
  if (refund.notified) return `${back} · the group chat was told`;
  if (refund.finished) return `${back} · not sent to Telegram`;
  return `${back} · Finish tells the group chat`;
}

/** Where a deducted refund went; [purchase] is null when that purchase is no longer saved. */
export function deductedFromText(purchase) {
  if (purchase === null || purchase === undefined) return 'Deducted from a purchase that is no longer saved';
  return `Deducted from ${ifBlank(purchase.note, '(no note)')} · ${purchase.date} · now ${formatSigned(purchase.amount, purchase.currency)}`;
}

/** The History "Month" filter for [today]'s month ([offset] months back). */
export function monthFilter(today, offset = 0) {
  const ym = addMonths(today.slice(0, 7), -offset);
  return { fromDate: firstDayOf(ym), toDate: lastDayOf(ym), category: null, label: monthLabel(ym) };
}

export const last30Filter = (today) => ({
  fromDate: addDays(today, -30),
  toDate: today,
  category: null,
  label: 'Last 30 days',
});

export const ALL_TIME_FILTER = { fromDate: null, toDate: null, category: null, label: 'All time' };

export function splitLabel(mode, gfAmount) {
  switch (mode) {
    case 'i_pay_full': return 'I paid';
    case 'half': return 'Half';
    case 'she_pays_full': return 'She paid';
    case 'custom': return `Custom ${formatMoney(gfAmount)}`;
    default: return 'Unmarked';
  }
}
