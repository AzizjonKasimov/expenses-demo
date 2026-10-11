// Mirrors the demo-mode half of ui/ExpensesViewModel.kt: what each button does, the snackbar
// messages, the blocking alerts, the Telegram preview and the refund notice. The web copy is always
// in demo mode, so the real-data branches of the view model have no counterpart here.

import { DemoExpenseDataSource, parsedTxn } from './DemoExpenseDataSource.js';
import { Refunds, RefundLinks } from '../logic/Refunds.js';
import { isNotifiable, previewMessages, refundNotificationText } from '../logic/TelegramText.js';
import { addDays, dateDaysAgo } from '../logic/dates.js';
import { SplitModes } from '../logic/Categories.js';
import { formatMoney, ALL_TIME_FILTER } from '../ui/UiFormat.js';
import { isBlank, ifBlank } from '../logic/strings.js';

const DEMO_SETTINGS_MESSAGE = 'Demo settings updated (nothing saved)';
/** How long the sample import "talks to the AI". The app's real call takes a few seconds. */
const IMPORT_DELAY_MS = 1800;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class DemoStore {
  /** [data] is site/data/demo-data.json; [today] the visitor's "YYYY-MM-DD". */
  constructor(data, today) {
    this.data = data;
    this.today = today;
    this.demoData = new DemoExpenseDataSource({ today: () => this.today, seed: data.historySeed, batches: data.batches });
    this.listeners = new Set();
    this.busy = false;
    this.message = null;
    this.alerts = [];
    this.telegramPreview = [];
    this.refundNotice = null;
    this.historyFilter = ALL_TIME_FILTER;
    this.resetDemoState();
  }

  // ---- observing ---------------------------------------------------------------------------------

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed() {
    for (const listener of this.listeners) listener();
  }

  get demoMode() {
    return true;
  }

  get pending() {
    return this.demoData.pending();
  }

  get finished() {
    return this.demoData.finished();
  }

  get balance() {
    return this.demoData.balance();
  }

  get budget() {
    return this.demoData.budget();
  }

  get history() {
    const f = this.historyFilter;
    return this.demoData.history(f.fromDate, f.toDate, f.category);
  }

  get refundLinks() {
    return new RefundLinks([...this.pending, ...this.finished]);
  }

  /**
   * The app shows "AI gateway" when a token is saved. The sample statement's labels are the real
   * AI's answers, recorded from the app, so the pill says so too.
   */
  get aiLabeling() {
    return true;
  }

  // ---- the view model's actions ------------------------------------------------------------------

  setHistoryFilter(filter) {
    this.historyFilter = filter;
    this.changed();
  }

  resetDemoData() {
    this.resetDemoState();
    this.showMessage('Demo sample data reset');
  }

  /** Sample rows, sample settings and a recent sample backup, so every demo starts the same. */
  resetDemoState() {
    this.demoData.reset();
    this.importSettings = structuredClone(this.data.settings);
    const lastBackupAt = Date.now() - this.data.settings.lastBackupAgeMinutes * 60_000;
    this.githubBackupState = {
      config: structuredClone(this.data.settings.github),
      lastBackupAt,
      lastAttemptAt: lastBackupAt,
      lastError: '',
      backupNeeded: false,
    };
    this.telegramPreview = [];
    this.refundNotice = null;
    this.changed();
  }

  saveImportSettings(settings) {
    this.importSettings = settings;
    this.showMessage(DEMO_SETTINGS_MESSAGE);
  }

  saveGitHubBackupSettings(config) {
    this.githubBackupState = { ...this.githubBackupState, config };
    this.showMessage(DEMO_SETTINGS_MESSAGE);
  }

  /** The built-in sample statement through the same import steps the app runs. */
  importDemoStatement() {
    this.runBusy(async () => {
      await delay(IMPORT_DELAY_MS);
      const s = this.data.statement;
      const rows = s.rows.map((r) => parsedTxn({ ...r, date: dateDaysAgo(this.today, r.daysAgo, r.time) }));
      const receipts = s.receipts.map((r) => ({ ...r, sentAt: `${addDays(this.today, -r.daysAgo)} ${r.time}` }));
      this.reportImport(s, this.demoData.replacePendingImport(rows, receipts));
    });
  }

  /** The import summary plus a blocking alert for every part that did not work. */
  reportImport(result, outcome) {
    const fallback = result.usedFallback ? ', local fallback' : '';
    const receipts = result.receiptsMatched > 0 ? `, ${result.receiptsMatched} named from receipts` : '';
    const byItem = outcome.refundsByItem > 0 ? ` (${outcome.refundsByItem} by item price)` : '';
    const deducted = outcome.refundsDeducted > 0 ? `, ${outcome.refundsDeducted} refund(s) deducted${byItem}` : '';
    const toPick = outcome.refundsToPick > 0 ? `, ${outcome.refundsToPick} refund(s) to match` : '';
    this.message = this.newMessage(
      `Imported ${outcome.imported} for review (${outcome.duplicates} duplicate, ` +
        `${result.chunks} ${result.source} batch${fallback}${receipts}${deducted}${toPick})`,
    );
    if (result.aiError) {
      this.enqueueAlert('AI labeling did not work', `${result.aiError} The statement was imported with local rules, so review every category before finishing.`);
    }
    if (result.receiptError) {
      this.enqueueAlert('Receipt lookup did not work', `${result.receiptError} Those transactions kept their bank description, so check their names and categories before finishing.`);
    }
  }

  /** Settings check against the demo mailbox: the receipts of the last 14 days. */
  testReceiptLookup(gmailAddress, gmailAppPassword) {
    this.runBusy(async () => {
      if (isBlank(gmailAddress) || isBlank(gmailAppPassword)) {
        this.showMessage('Add your Gmail address and app password first');
        return;
      }
      await delay(600);
      const found = this.data.statement.receipts.filter((r) => r.daysAgo <= 14);
      const named = found.filter((r) => r.items.length > 0).length;
      this.showMessage(`Demo mailbox: ${found.length} receipt(s) in the last 14 days, ${named} with item names`);
    });
  }

  mark(txId, edit) {
    try {
      this.demoData.mark(txId, edit);
      this.changed();
    } catch (e) {
      this.showMessage(e.message);
    }
  }

  /** Purchases [refund] could be deducted from, most likely first. */
  refundCandidates(refund) {
    return Refunds.candidates(refund, this.demoData.currentTransactions());
  }

  deductRefund(refund, purchase) {
    try {
      const changed = this.demoData.deductRefund(refund.id, purchase.id);
      this.message = this.newMessage(`Refund deducted from ${ifBlank(purchase.note, 'the purchase').slice(0, 40)}`);
      // A refund under review reaches Telegram on Finish. A saved one has no Finish, so the user
      // decides whether she hears about it.
      const folded = changed.find((t) => t.id === refund.id);
      if (folded && folded.finished && !folded.notified && isNotifiable(folded)) {
        const deductedFrom = changed.find((t) => t.clientId === folded.refundOf) ?? null;
        this.refundNotice = { refund: folded, message: refundNotificationText(folded, deductedFrom) };
      }
    } catch (e) {
      this.message = this.newMessage(e.message || 'The refund could not be deducted');
    }
    this.changed();
  }

  keepRefundAsIncome(refund) {
    this.demoData.keepRefundAsIncome(refund.id);
    this.showMessage(
      refund.notified && refund.gfAmount > 0
        ? `Refund counted as income again. The group chat was told she gets ${formatMoney(refund.gfAmount, refund.currency)} back, so let her know.`
        : 'Refund counted as income again',
    );
  }

  /** Demo mode previews the refund message instead of sending it. */
  sendRefundNotice() {
    const notice = this.refundNotice;
    if (!notice) return;
    this.refundNotice = null;
    this.demoData.markNotified(notice.refund.id);
    this.telegramPreview = [notice.message];
    this.changed();
  }

  dismissRefundNotice() {
    this.refundNotice = null;
    this.changed();
  }

  /** [amount] is a positive magnitude. */
  addManualTransaction(amount, income, note, date) {
    this.runBusy(async () => {
      const signed = income ? Math.abs(amount) : -Math.abs(amount);
      this.demoData.addManualTransaction(date.trim(), note.trim(), signed);
      this.showMessage('Added for review — mark the split, then Finish');
    });
  }

  delete(txId) {
    this.demoData.delete(txId);
    this.changed();
  }

  finishBatch(batchId) {
    this.runBusy(async () => {
      const txs = this.demoData.batchRows(batchId);
      const unmarked = txs.filter((t) => !t.skipped && t.splitMode === SplitModes.UNSET).length;
      if (unmarked > 0) {
        this.showMessage(`Mark all demo rows before finishing (${unmarked} left)`);
        return;
      }
      // Demo mode never contacts Telegram; it shows what the group chat would have received.
      const purchases = txs.some(Refunds.isDeducted)
        ? new Map(this.demoData.currentTransactions().map((t) => [t.clientId, t]))
        : new Map();
      const preview = previewMessages(txs, purchases);
      const saved = this.demoData.finishBatch(batchId);
      this.telegramPreview = preview;
      this.showMessage(`Saved ${saved} demo transaction(s)`);
    });
  }

  setMonthSkipped(yearMonth, skipped) {
    this.demoData.setMonthSkipped(yearMonth, skipped);
    this.changed();
  }

  backupGitHubNow() {
    const now = Date.now();
    this.githubBackupState = { ...this.githubBackupState, lastBackupAt: now, lastAttemptAt: now, lastError: '', backupNeeded: false };
    this.showMessage(`Demo backup: ${this.demoData.currentTransactions().length} transaction(s), nothing uploaded`);
  }

  restoreFromGitHub() {
    this.demoData.reset();
    this.showMessage('Demo restore: sample data reloaded, nothing downloaded');
  }

  consumeAlert() {
    this.alerts = this.alerts.slice(1);
    this.changed();
  }

  consumeTelegramPreview() {
    this.telegramPreview = [];
    this.changed();
  }

  showMessage(text) {
    this.message = this.newMessage(text);
    this.changed();
  }

  // ---- helpers -----------------------------------------------------------------------------------

  /** A new object each time, so the same text twice still shows the snackbar again. */
  newMessage(text) {
    return { text };
  }

  enqueueAlert(title, message) {
    this.alerts = [...this.alerts, { title, message }];
  }

  runBusy(block) {
    if (this.busy) return;
    this.busy = true;
    this.changed();
    Promise.resolve()
      .then(block)
      .catch((e) => {
        this.message = this.newMessage(e?.message || String(e));
      })
      .finally(() => {
        this.busy = false;
        this.changed();
      });
  }
}
