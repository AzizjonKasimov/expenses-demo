// Mirrors ui/MarkScreen.kt: import, add manually, and the pending review batches.

import { html, useState } from './html.js';
import { AlertDialog, Button, LinearProgressIndicator, OutlinedButton, OutlinedTextField, TextButton } from './material.js';
import { ScreenEmptyState, SectionSurface, SelectionPill, StatusPill, SummaryBand } from './UiKit.js';
import { TransactionCard } from './TransactionCard.js';
import { Refunds } from '../logic/Refunds.js';
import { SplitModes } from '../logic/Categories.js';

export function MarkScreen({ vm }) {
  const pending = vm.pending;
  const busy = vm.busy;
  const links = vm.refundLinks;
  const [showAddDialog, setShowAddDialog] = useState(false);

  const batches = new Map();
  for (const tx of pending) {
    if (!batches.has(tx.batchId)) batches.set(tx.batchId, []);
    batches.get(tx.batchId).push(tx);
  }

  return html`<div class="screen column">
    ${busy && html`<${LinearProgressIndicator} />`}
    <${SectionSurface} class="mark-actions">
      <div class="row gap12">
        <!-- The file picker could show real statement files, so demo mode imports the sample statement. -->
        <${Button} class="grow" disabled=${busy} onClick=${() => vm.importDemoStatement()}>Import Excel<//>
        <${OutlinedButton} class="grow" disabled=${busy} onClick=${() => setShowAddDialog(true)}>Add manually<//>
      </div>
      <div class="row end">
        <${StatusPill} label=${vm.aiLabeling ? 'AI gateway' : 'Local rules'}
          container=${vm.aiLabeling ? 'var(--md-primary-container)' : 'var(--md-tertiary-container)'} />
      </div>
    <//>

    ${pending.length === 0
      ? html`<${ScreenEmptyState} title="No transactions waiting for review."
          detail=${vm.demoMode ? 'Tap Import Excel to load the sample bank statement.' : 'Import an Excel statement when you are ready.'} />`
      : html`<div class="scroll"><div class="list">
          ${[...batches].map(([batchId, txs]) => {
            const marked = txs.filter((t) => t.skipped || t.splitMode !== SplitModes.UNSET).length;
            return html`
              <${SummaryBand} key=${`summary-${batchId}`} title="Pending review" value=${`${marked} / ${txs.length}`}
                supporting=${`marked · ${txs.length - marked} left`} valueColor="var(--md-primary)"
                trailing=${html`<${Button} disabled=${busy || marked !== txs.length} onClick=${() => vm.finishBatch(batchId)}>Finish<//>`} />
              ${txs.map((tx) => html`<${TransactionCard}
                key=${tx.id}
                tx=${tx}
                editing=${true}
                onMark=${(edit) => vm.mark(tx.id, edit)}
                onDelete=${() => vm.delete(tx.id)}
                refundTarget=${links.purchaseOf(tx)}
                refunds=${links.refundsOf(tx)}
                refundCandidates=${Refunds.isDeducted(tx) || Refunds.looksLikeRefund(tx) ? () => vm.refundCandidates(tx) : null}
                onDeductFrom=${(purchase) => vm.deductRefund(tx, purchase)}
                onKeepAsIncome=${(refund) => vm.keepRefundAsIncome(refund)} />`)}`;
          })}
        </div></div>`}

    ${showAddDialog && html`<${AddTransactionDialog} today=${vm.today}
      onDismiss=${() => setShowAddDialog(false)}
      onAdd=${(amount, income, note, date) => {
        vm.addManualTransaction(amount, income, note, date);
        setShowAddDialog(false);
      }} />`}
  </div>`;
}

/** Date formats the app accepts on a transaction row: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM". */
const ManualDatePattern = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;

/** Kotlin's String.toDoubleOrNull(), close enough for typed amounts. */
export function toDoubleOrNull(text) {
  const t = text.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Captures the raw fields of a hand-entered transaction; category and split are set later on the card. */
function AddTransactionDialog({ today, onDismiss, onAdd }) {
  const [amount, setAmount] = useState('');
  const [income, setIncome] = useState(false);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);

  const amountValue = toDoubleOrNull(amount);
  let amountError = null;
  if (amount.trim() === '') amountError = 'Enter an amount';
  else if (amountValue === null) amountError = 'Enter a number';
  else if (amountValue <= 0) amountError = 'Amount must be greater than zero';
  const dateError = ManualDatePattern.test(date.trim()) ? null : 'Use YYYY-MM-DD or YYYY-MM-DD HH:MM';
  const valid = amountError === null && dateError === null;

  return html`<${AlertDialog}
    title="Add transaction"
    onDismissRequest=${onDismiss}
    text=${html`<div class="column gap12">
      <div class="row gap8">
        <${SelectionPill} class="grow" label="Expense" selected=${!income} onClick=${() => setIncome(false)} />
        <${SelectionPill} class="grow" label="Income" selected=${income} onClick=${() => setIncome(true)} />
      </div>
      <${OutlinedTextField} value=${amount} onValueChange=${setAmount} label="Amount" inputMode="decimal"
        isError=${amount.trim() !== '' && amountError !== null}
        supportingText=${amount.trim() !== '' && amountError !== null ? amountError : null} />
      <${OutlinedTextField} value=${note} onValueChange=${setNote} label="Note (optional)" />
      <${OutlinedTextField} value=${date} onValueChange=${setDate} label="Date" isError=${dateError !== null} supportingText=${dateError} />
    </div>`}
    confirmButton=${html`<${Button} disabled=${!valid} onClick=${() => onAdd(amountValue, income, note.trim(), date.trim())}>Add<//>`}
    dismissButton=${html`<${TextButton} onClick=${onDismiss}>Cancel<//>`} />`;
}
