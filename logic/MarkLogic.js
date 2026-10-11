// Mirrors logic/MarkLogic.kt (and paidAmount from logic/CsvExport.kt, computeBalance from
// logic/BalanceLogic.kt). Rows are plain objects with TransactionEntity's field names.

import { Categories, SplitModes } from './Categories.js';
import { round2 } from './numbers.js';

/** Raised when a transaction edit fails validation. */
export class MarkValidationError extends Error {}

/** Accepted transaction date formats: "YYYY-MM-DD" and "YYYY-MM-DD HH:MM". */
export const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;

const given = (value) => value !== undefined && value !== null;

/** How much the GF owes for this transaction, based on split_mode. */
export function gfAmountFor(tx) {
  const amount = Math.abs(tx.amount);
  switch (tx.splitMode) {
    case SplitModes.HALF: return round2(amount / 2);
    case SplitModes.SHE_PAYS_FULL: return amount;
    case SplitModes.CUSTOM: return tx.gfAmount;
    default: return 0;
  }
}

/**
 * Apply a MarkEdit to [tx], returning the updated transaction. [edit] holds only the fields that
 * change: splitMode, gfAmount, amount, note, category, subcategory, skipped, date, income.
 *
 * Rules: an edited amount keeps the original sign unless `income` flips the type; the GF share is
 * re-derived for half/she_pays_full when split mode or amount changes, but a custom share is kept;
 * changing the category blanks the subcategory unless one is also supplied. Flipping a row to income
 * normalizes it to the Confirm convention.
 */
export function applyMark(tx, edit) {
  let { amount, splitMode, gfAmount, note, category, subcategory, skipped, date } = tx;

  let eff = round2(Math.abs(tx.amount));
  if (given(edit.amount) || given(edit.income)) {
    const mag = given(edit.amount) ? round2(Math.abs(edit.amount)) : eff;
    if (mag === 0) throw new MarkValidationError('amount must be non-zero');
    const income = given(edit.income) ? edit.income : tx.amount > 0;
    amount = income ? mag : -mag;
    eff = mag;
  }

  if (given(edit.splitMode)) {
    if (!SplitModes.ALL.has(edit.splitMode)) throw new MarkValidationError('bad split_mode');
    splitMode = edit.splitMode;
    switch (edit.splitMode) {
      case SplitModes.HALF: gfAmount = round2(eff / 2); break;
      case SplitModes.SHE_PAYS_FULL: gfAmount = eff; break;
      case SplitModes.I_PAY_FULL:
      case SplitModes.UNSET: gfAmount = 0; break;
      // CUSTOM: left to the gfAmount assignment below
    }
  } else if (given(edit.amount) && !given(edit.gfAmount)) {
    // Amount edited on its own: re-derive the GF share for split rows.
    if (tx.splitMode === SplitModes.HALF) gfAmount = round2(eff / 2);
    else if (tx.splitMode === SplitModes.SHE_PAYS_FULL) gfAmount = eff;
  }

  if (given(edit.gfAmount)) gfAmount = edit.gfAmount;
  if (given(edit.note)) note = edit.note.trim();
  if (given(edit.category)) {
    if (!Categories.has(edit.category)) throw new MarkValidationError('bad category');
    category = edit.category;
    if (!given(edit.subcategory)) subcategory = '';
  }
  if (given(edit.subcategory)) {
    const cat = given(edit.category) ? edit.category : tx.category;
    if (edit.subcategory !== '' && !Categories.subcategories(cat).includes(edit.subcategory)) {
      throw new MarkValidationError('bad subcategory');
    }
    subcategory = edit.subcategory;
  }
  if (given(edit.skipped)) skipped = edit.skipped;
  if (given(edit.date)) {
    const trimmed = edit.date.trim();
    if (!DATE_FORMAT.test(trimmed)) throw new MarkValidationError('date must be YYYY-MM-DD or YYYY-MM-DD HH:MM');
    date = trimmed;
  }

  // Income rows follow the Confirm convention: the user keeps it all, no GF share to split.
  if (amount > 0 && edit.income === true) {
    splitMode = SplitModes.I_PAY_FULL;
    gfAmount = 0;
  }

  return { ...tx, amount, splitMode, gfAmount, note, category, subcategory, skipped, date };
}

/** What the user actually paid: on a split expense, the statement amount less her share. */
export const paidAmount = (tx) => (tx.amount < 0 ? tx.amount + tx.gfAmount : tx.amount);

/** All-time net across the user's counted spend: finished, not skipped, a counted split mode. */
export function computeBalance(txs) {
  let sum = 0;
  for (const t of txs) {
    if (t.finished && !t.skipped && SplitModes.COUNTED.has(t.splitMode)) {
      sum += t.amount < 0 ? t.amount + t.gfAmount : t.amount;
    }
  }
  return sum;
}
