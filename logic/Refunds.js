// Mirrors logic/Refunds.kt: refunds deducted from the purchase they paid back instead of being
// counted as income. See the Kotlin file for the reasoning behind each rule.

import { SplitModes } from './Categories.js';
import { isBlank } from './strings.js';
import { gfAmountFor } from './MarkLogic.js';
import { compareStrings, parseRowMinutes } from './dates.js';
import { round2 } from './numbers.js';

const PICK_LIMIT = 20;
const AMOUNT_TOLERANCE = 0.005;
const COUPANG_MARKERS = ['쿠팡', 'coupang'];

export const Refunds = {
  /** How far back the importer looks for the charge. */
  AUTO_WINDOW_DAYS: 60,
  /** How far back a partial refund's order is looked for by item price. */
  ITEM_WINDOW_DAYS: 35,
  /** How far back the purchase picker looks. */
  PICK_WINDOW_DAYS: 180,

  /** No receipts to read: the ItemLookup.NONE of the app. */
  NO_ITEMS: () => [],

  isDeducted: (tx) => !isBlank(tx.refundOf),

  /** Income worth offering "Deduct from a purchase" for in the review queue. */
  looksLikeRefund: (tx) =>
    tx.amount > 0 && !Refunds.isDeducted(tx) && (isCoupang(tx.note) || tx.subcategory === 'Refund'),

  /** True when [refund] paid back exactly what [purchase] now costs. */
  isExactMatch: (purchase, refund) => Math.abs(Math.abs(purchase.amount) - refund.amount) < AMOUNT_TOLERANCE,

  /**
   * Plans an import: [replaced] are the review rows it clears, [kept] every other saved row, and
   * [incoming] its new rows. [items] is an ItemLookup: (refund, charged, chargedAt) => product names.
   */
  planImport(replaced, kept, incoming, items = Refunds.NO_ITEMS) {
    const rows = new Map();
    for (const row of [...kept, ...incoming]) rows.set(row.clientId, row);
    // A cleared refund takes its deduction with it.
    for (const refund of replaced.filter(Refunds.isDeducted)) {
      const purchase = rows.get(refund.refundOf);
      if (purchase) rows.set(purchase.clientId, restore(purchase, refund));
    }
    // A cleared purchase lets go of whatever was deducted from it.
    const replacedIds = new Set(replaced.map((r) => r.clientId));
    for (const row of [...rows.values()].filter((r) => replacedIds.has(r.refundOf))) {
      rows.set(row.clientId, free(row));
    }

    let deducted = 0;
    let toPick = 0;
    let byItem = 0;
    const refunds = incoming.filter(isCoupangRefund).sort((a, b) => compareStrings(a.date, b.date));
    for (const incomingRefund of refunds) {
      const refund = rows.get(incomingRefund.clientId);
      const charge = chargeFor(refund, [...rows.values()]);
      const order = charge === null ? orderByItem(refund, [...rows.values()], items) : null;
      const purchase = charge ?? order?.purchase ?? null;
      if (purchase === null) {
        if (Refunds.candidates(refund, [...rows.values()]).length > 0) toPick++;
        continue;
      }
      let [deductedFrom, folded] = link(purchase, refund);
      if (order !== null) {
        // The product that came back tells the user at a glance whether the match is right.
        const named = `${bankDescription(refund.note)} — ${order.products.join(' or ')}`;
        folded = { ...folded, note: named.slice(0, 160) };
        byItem++;
      }
      rows.set(deductedFrom.clientId, deductedFrom);
      rows.set(folded.clientId, folded);
      deducted++;
    }

    const keptById = new Map(kept.map((k) => [k.clientId, k]));
    return {
      updated: [...rows.values()].filter((row) => {
        const before = keptById.get(row.clientId);
        return before !== undefined && !sameRow(before, row);
      }),
      inserted: incoming.map((row) => rows.get(row.clientId)),
      deducted,
      toPick,
      byItem,
    };
  },

  /** Purchases [refund] could be deducted from, most likely first. */
  candidates(refund, rows) {
    const view = Refunds.isDeducted(refund)
      ? rows.map((r) => (r.clientId === refund.refundOf ? restore(r, refund) : r))
      : rows;
    return view
      .filter((r) => canAbsorb(r, refund, Refunds.PICK_WINDOW_DAYS))
      .sort(
        (a, b) =>
          Number(Refunds.isExactMatch(b, refund)) - Number(Refunds.isExactMatch(a, refund)) ||
          Number(sameMerchant(b, refund)) - Number(sameMerchant(a, refund)) ||
          compareStrings(b.date, a.date),
      )
      .slice(0, PICK_LIMIT);
  },

  /** Every row that changes when [refund] is deducted from [purchase], moving it off any other purchase. */
  deduct(refund, purchase, rows) {
    const changed = new Map();
    let target = purchase;
    let loose = refund;
    if (Refunds.isDeducted(refund)) {
      const previous = rows.find((r) => r.clientId === refund.refundOf);
      if (previous) {
        const restored = restore(previous, refund);
        if (restored.clientId === purchase.clientId) target = restored;
        else changed.set(restored.clientId, restored);
      }
      loose = free(refund);
    }
    const [deductedFrom, folded] = link(target, loose);
    changed.set(deductedFrom.clientId, deductedFrom);
    changed.set(folded.clientId, folded);
    return [...changed.values()];
  },

  /** Every row that changes when a deducted [refund] is counted as income again. */
  undo(refund, rows) {
    if (!Refunds.isDeducted(refund)) return [];
    const purchase = rows.find((r) => r.clientId === refund.refundOf);
    return [purchase ? restore(purchase, refund) : null, free(refund)].filter(Boolean);
  },

  /** Every row that changes when [deleted] is removed, so neither side of a deduction is left dangling. */
  releasedBy(deleted, rows) {
    if (Refunds.isDeducted(deleted)) {
      const purchase = rows.find((r) => r.clientId === deleted.refundOf);
      return purchase ? [restore(purchase, deleted)] : [];
    }
    if (isBlank(deleted.clientId)) return [];
    return rows.filter((r) => r.refundOf === deleted.clientId).map(free);
  },
};

const isCoupangRefund = (tx) => tx.amount > 0 && !Refunds.isDeducted(tx) && isCoupang(tx.note);

/** The Coupang charge [refund] pays back in full: same payment gateway first, then the most recent. */
function chargeFor(refund, rows) {
  let best = null;
  let bestKey = null;
  for (const r of rows) {
    if (!(isCoupang(r.note) && Refunds.isExactMatch(r, refund) && canAbsorb(r, refund, Refunds.AUTO_WINDOW_DAYS))) continue;
    const key = [bankDescription(r.note) === bankDescription(refund.note), r.date];
    // maxWithOrNull keeps the first of equal elements.
    if (best === null || compareKeys(bestKey, key) < 0) {
      best = r;
      bestKey = key;
    }
  }
  return best;
}

function compareKeys([sameA, dateA], [sameB, dateB]) {
  return Number(sameA) - Number(sameB) || compareStrings(dateA, dateB);
}

/** The one recent Coupang order whose receipt lists a product costing exactly [refund]. */
function orderByItem(refund, rows, items) {
  const matches = rows
    .filter((r) => isCoupang(r.note) && canAbsorb(r, refund, Refunds.ITEM_WINDOW_DAYS))
    .map((purchase) => ({ purchase, products: items(refund.amount, charged(purchase, rows), purchase.date) }))
    .filter((m) => m.products.length > 0);
  return matches.length === 1 ? matches[0] : null;
}

/** What [purchase] charged before any refund was deducted from it: its receipt's total. */
function charged(purchase, rows) {
  const refunded = rows.filter((r) => r.refundOf === purchase.clientId).reduce((sum, r) => sum + r.amount, 0);
  return round2(Math.abs(purchase.amount) + refunded);
}

function link(purchase, refund) {
  const net = round2(purchase.amount + refund.amount);
  if (!(purchase.amount < 0 && refund.amount > 0 && net <= 0)) {
    throw new Error('A refund can only be deducted from a purchase at least as large');
  }
  let deductedFrom = withAmount(purchase, net);
  // Nothing is left to split on a fully refunded purchase, so it should not wait for a mark.
  if (net === 0 && !deductedFrom.finished && !deductedFrom.skipped && deductedFrom.splitMode === SplitModes.UNSET) {
    deductedFrom = { ...deductedFrom, splitMode: SplitModes.I_PAY_FULL };
  }
  // She was already told her share, so the part of it this refund takes away is owed back to her.
  const herShare = purchase.notified ? Math.max(purchase.gfAmount - deductedFrom.gfAmount, 0) : 0;
  const folded = {
    ...refund,
    refundOf: purchase.clientId,
    skipped: true,
    splitMode: SplitModes.UNSET,
    gfAmount: round2(herShare),
  };
  return [deductedFrom, folded];
}

/** [purchase] with [refund] taken back out of it. */
function restore(purchase, refund) {
  const restored = withAmount(purchase, round2(purchase.amount - refund.amount));
  // A purchase under review that was refunded to nothing was marked on the user's behalf.
  return !purchase.finished && purchase.amount === 0 && purchase.splitMode === SplitModes.I_PAY_FULL
    ? { ...restored, splitMode: SplitModes.UNSET }
    : restored;
}

/** [refund] as the confirmed income it would have been had it never been deducted. */
const free = (refund) => ({ ...refund, refundOf: '', skipped: false, splitMode: SplitModes.I_PAY_FULL, gfAmount: 0 });

/** [tx] at [amount], with her share re-derived the way an amount edit re-derives it. */
function withAmount(tx, amount) {
  const moved = { ...tx, amount };
  // A custom share is kept, as an amount edit keeps it, but she can never owe more than is left.
  return { ...moved, gfAmount: Math.min(gfAmountFor(moved), Math.abs(amount)) };
}

function canAbsorb(purchase, refund, windowDays) {
  if (purchase.clientId === refund.clientId || purchase.amount >= 0 || purchase.skipped || Refunds.isDeducted(purchase)) {
    return false;
  }
  if (purchase.currency.toLowerCase() !== refund.currency.toLowerCase()) return false;
  if (Math.abs(purchase.amount) + AMOUNT_TOLERANCE < refund.amount) return false;
  const days = daysBefore(purchase.date, refund.date);
  return days !== null && days >= 0 && days <= windowDays;
}

const sameMerchant = (purchase, refund) =>
  (isCoupang(purchase.note) && isCoupang(refund.note)) ||
  bankDescription(purchase.note).toLowerCase() === bankDescription(refund.note).toLowerCase();

const isCoupang = (note) => COUPANG_MARKERS.some((m) => note.toLowerCase().includes(m.toLowerCase()));

/** The bank's own text: a receipt-named note reads `쿠팡(쿠페이)_KICC — 프레샤인 못난이사과`. */
const bankDescription = (note) => {
  const at = note.indexOf(' — ');
  return (at < 0 ? note : note.slice(0, at)).trim();
};

const hasTime = (date) => date.trim().length > 10;

/** Whole days from the purchase to the refund, negative when the purchase came later. */
function daysBefore(purchase, refund) {
  const bought = parseRowMinutes(purchase);
  const refunded = parseRowMinutes(refund);
  if (bought === null || refunded === null) return null;
  if (hasTime(purchase) && hasTime(refund) && bought > refunded) return -1;
  return Math.floor(refunded / 1440) - Math.floor(bought / 1440);
}

/** Data-class equality for rows. */
export function sameRow(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!Object.is(a[key], b[key]) && a[key] !== b[key]) return false;
  return true;
}

/** Which purchase each deducted refund went to, and which refunds each purchase absorbed. */
export class RefundLinks {
  constructor(rows) {
    this.byClientId = new Map(rows.map((r) => [r.clientId, r]));
    this.refundsByPurchase = new Map();
    for (const r of rows.filter(Refunds.isDeducted)) {
      if (!this.refundsByPurchase.has(r.refundOf)) this.refundsByPurchase.set(r.refundOf, []);
      this.refundsByPurchase.get(r.refundOf).push(r);
    }
  }

  purchaseOf(refund) {
    return Refunds.isDeducted(refund) ? this.byClientId.get(refund.refundOf) ?? null : null;
  }

  refundsOf(purchase) {
    return this.refundsByPurchase.get(purchase.clientId) ?? [];
  }
}
