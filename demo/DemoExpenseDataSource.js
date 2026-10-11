// Mirrors demo/DemoExpenseDataSource.kt: the sample transactions demo mode keeps in memory, and every
// change the screens make to them. Rows are plain objects with TransactionEntity's field names.

import { SplitModes } from '../logic/Categories.js';
import { applyMark, computeBalance } from '../logic/MarkLogic.js';
import { Refunds } from '../logic/Refunds.js';
import { BudgetConfig, datesBudget } from '../logic/BudgetLogic.js';
import { fingerprint, match, parsedFingerprint } from '../logic/ImportDeduplicator.js';
import { itemLookup } from '../logic/ReceiptMatcher.js';
import { isNotifiable } from '../logic/TelegramText.js';
import { addDays, addMonths, compareStrings, pad2, pad4 } from '../logic/dates.js';

const MANUAL_BATCH_PREFIX = 'manual:';

/** ExpensesRepository.isPendingImport: a review row the next import replaces. */
const isPendingImport = (tx) => !tx.finished && !tx.batchId.startsWith(MANUAL_BATCH_PREFIX);

/** A TransactionEntity with the Kotlin defaults for every field not given. */
export function transaction(fields) {
  return {
    id: 0,
    clientId: '',
    notificationKey: '',
    batchId: '',
    idx: 0,
    date: '',
    note: '',
    amount: 0,
    currency: 'KRW',
    account: '',
    category: 'Unknown',
    subcategory: '',
    splitMode: SplitModes.UNSET,
    gfAmount: 0,
    skipped: false,
    notified: false,
    finished: false,
    sourceFingerprint: '',
    sourceFingerprintReliable: false,
    refundOf: '',
    ...fields,
  };
}

/** A ParsedTxn with the Kotlin defaults for every field not given. */
export const parsedTxn = (fields) => ({
  date: '',
  note: '',
  amount: 0,
  currency: 'KRW',
  account: '',
  category: 'Unknown',
  subcategory: '',
  sourceNote: '',
  ...fields,
});

export class DemoExpenseDataSource {
  /**
   * [today] is a "YYYY-MM-DD" provider, [seed] the exported history seed (daysAgo-based), and
   * [batches] the exported batch ids ({ history, inbox, manual }).
   */
  constructor({ today, seed, batches }) {
    this.todayProvider = today;
    this.seed = seed;
    this.HISTORY_BATCH = batches.history;
    this.INBOX_BATCH = batches.inbox;
    this.MANUAL_BATCH = batches.manual;
    this.transactions = this.seedTransactions();
    this.skippedMonths = this.seedSkippedMonths();
  }

  pending() {
    return this.transactions
      .filter((t) => !t.finished)
      .sort((a, b) => compareStrings(a.batchId, b.batchId) || a.idx - b.idx);
  }

  finished() {
    return this.transactions.filter((t) => t.finished);
  }

  balance() {
    return computeBalance(this.finished());
  }

  budget() {
    return datesBudget(this.transactions, this.skippedMonths, this.todayProvider());
  }

  history(fromDate, toDate, category) {
    return this.transactions
      .filter((t) => t.finished && !t.skipped && SplitModes.COUNTED.has(t.splitMode))
      .filter((t) => fromDate == null || compareStrings(t.date, fromDate) >= 0)
      .filter((t) => toDate == null || compareStrings(t.date, toDate) <= 0)
      .filter((t) => category == null || t.category === category)
      .sort((a, b) => compareStrings(b.date, a.date) || b.id - a.id);
  }

  /**
   * Replaces the unfinished imported rows (hand-entered ones stay), skips rows already saved to
   * history, and deducts refunds. Returns the PendingImport outcome.
   */
  replacePendingImport(rows, receipts = []) {
    const txs = this.transactions;
    const dedup = match(rows, txs);
    let id = this.nextId(txs);
    const incoming = [];
    rows.forEach((row, index) => {
      if (!dedup.duplicateIndexes.has(index)) incoming.push(this.toPending(row, id++, this.INBOX_BATCH, index));
    });
    const replaced = txs.filter(isPendingImport);
    const kept = txs.filter((t) => !isPendingImport(t));
    const plan = Refunds.planImport(replaced, kept, incoming, itemLookup(receipts));
    this.transactions = [...replacing(kept, plan.updated), ...plan.inserted];
    return {
      batchId: incoming.length === 0 ? null : this.INBOX_BATCH,
      imported: incoming.length,
      duplicates: dedup.duplicateIndexes.size,
      refundsDeducted: plan.deducted,
      refundsToPick: plan.toPick,
      refundsByItem: plan.byItem,
    };
  }

  /** Deducts a refund from a purchase; returns the changed rows. */
  deductRefund(refundId, purchaseId) {
    const txs = this.transactions;
    const refund = txs.find((t) => t.id === refundId);
    const purchase = txs.find((t) => t.id === purchaseId);
    if (!refund || !purchase) return [];
    const changed = Refunds.deduct(refund, purchase, txs);
    this.transactions = replacing(txs, changed);
    return changed;
  }

  /** For a message shown instead of sent. */
  markNotified(txId) {
    this.transactions = this.transactions.map((t) => (t.id === txId ? { ...t, notified: true } : t));
  }

  keepRefundAsIncome(refundId) {
    const txs = this.transactions;
    const refund = txs.find((t) => t.id === refundId);
    if (!refund) return;
    this.transactions = replacing(txs, Refunds.undo(refund, txs));
  }

  /** [amount] is signed. */
  addManualTransaction(date, note, amount) {
    const txs = this.transactions;
    const manual = txs.filter((t) => !t.finished && t.batchId === this.MANUAL_BATCH);
    const idx = manual.length === 0 ? 0 : Math.max(...manual.map((t) => t.idx + 1));
    const row = parsedTxn({ date, note, amount, category: amount > 0 ? 'Income' : 'Unknown' });
    this.transactions = [...txs, this.toPending(row, this.nextId(txs), this.MANUAL_BATCH, idx)];
  }

  mark(txId, edit) {
    this.transactions = this.transactions.map((t) => (t.id === txId ? applyMark(t, edit) : t));
  }

  delete(txId) {
    const txs = this.transactions;
    const tx = txs.find((t) => t.id === txId);
    if (!tx) return;
    this.transactions = replacing(txs, Refunds.releasedBy(tx, txs)).filter((t) => t.id !== txId);
  }

  batchRows(batchId) {
    return this.transactions.filter((t) => t.batchId === batchId).sort((a, b) => a.idx - b.idx);
  }

  /** Returns how many rows were saved. */
  finishBatch(batchId) {
    let saved = 0;
    this.transactions = this.transactions.map((tx) => {
      if (tx.batchId !== batchId) return tx;
      if (!tx.skipped) saved++;
      return {
        ...tx,
        finished: true,
        batchId: this.HISTORY_BATCH,
        splitMode: !tx.skipped && tx.splitMode === SplitModes.UNSET ? SplitModes.I_PAY_FULL : tx.splitMode,
        // Finish previewed its message, which stands in for sending it.
        notified: tx.notified || isNotifiable(tx),
      };
    });
    return saved;
  }

  setMonthSkipped(yearMonth, skipped) {
    const months = new Set(this.skippedMonths);
    if (skipped) months.add(yearMonth);
    else months.delete(yearMonth);
    this.skippedMonths = months;
  }

  reset() {
    this.transactions = this.seedTransactions();
    this.skippedMonths = this.seedSkippedMonths();
  }

  currentTransactions() {
    return this.transactions;
  }

  currentSkippedMonths() {
    return this.skippedMonths;
  }

  /** Finished history only: the Mark tab starts empty so a demo begins with an import. */
  seedTransactions() {
    return this.seed.map((seed, index) => this.toTransaction(seed, index + 1, index));
  }

  seedSkippedMonths() {
    const sampleSkippedMonth = addMonths(this.todayProvider().slice(0, 7), -1);
    const budgetStart = `${pad4(BudgetConfig.START_YEAR)}-${pad2(BudgetConfig.START_MONTH)}`;
    return compareStrings(sampleSkippedMonth, budgetStart) < 0 ? new Set() : new Set([sampleSkippedMonth]);
  }

  nextId(txs) {
    return txs.length === 0 ? 1 : Math.max(...txs.map((t) => t.id)) + 1;
  }

  toPending(row, id, batchId, idx) {
    return transaction({
      id,
      clientId: `demo:${id}`,
      notificationKey: `demo:${id}`,
      batchId,
      idx,
      date: row.date,
      note: row.note,
      amount: row.amount,
      currency: row.currency,
      account: row.account,
      category: row.category,
      subcategory: row.subcategory,
      splitMode: SplitModes.UNSET,
      finished: false,
      sourceFingerprint: parsedFingerprint(row),
      sourceFingerprintReliable: true,
    });
  }

  toTransaction(seed, id, idx) {
    const date = addDays(this.todayProvider(), -seed.daysAgo);
    return transaction({
      id,
      clientId: `demo:${id}`,
      notificationKey: `demo:${id}`,
      batchId: this.HISTORY_BATCH,
      idx,
      date,
      note: seed.note,
      amount: seed.amount,
      currency: 'KRW',
      account: 'Demo card',
      category: seed.category,
      subcategory: seed.subcategory,
      splitMode: seed.splitMode,
      gfAmount: seed.gfAmount,
      skipped: false,
      // A saved split was sent to Telegram when it was finished.
      notified: seed.gfAmount > 0,
      finished: true,
      sourceFingerprint: fingerprint(date, seed.note, seed.amount, 'KRW', 'Demo card'),
      sourceFingerprintReliable: true,
    });
  }
}

function replacing(rows, changed) {
  const byId = new Map(changed.map((t) => [t.id, t]));
  return rows.map((t) => byId.get(t.id) ?? t);
}
