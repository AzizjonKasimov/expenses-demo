// Mirrors ui/TransactionCard.kt: one transaction, with its edit dialogs and split actions.

import { cx, html, useState } from './html.js';
import { AlertDialog, Button, DropdownPicker, HorizontalDivider, OutlinedButton, OutlinedTextField, TextButton } from './material.js';
import { ColorDot, SelectionPill, StatusPill } from './UiKit.js';
import { RefundPickerDialog } from './RefundPicker.js';
import { toDoubleOrNull } from './MarkScreen.js';
import {
  amountBreakdown, deductedFromText, displayAmount, formatMoney, formatSigned, refundShareText, refundedText, splitLabel,
} from './UiFormat.js';
import { Categories, SplitModes } from '../logic/Categories.js';
import { Refunds } from '../logic/Refunds.js';
import { ifBlank } from '../logic/strings.js';

/**
 * [onToggleEdit] set: a collapsed card opens on tap and a "Done" action collapses it (History).
 * [refundCandidates] set: "Deduct from a purchase" is offered. The category dialog's Ask AI section
 * is not ported: it needs a live AI call, which a public page must not make.
 */
export function TransactionCard({
  tx, editing, onMark, onDelete = null, onToggleEdit = null,
  refundTarget = null, refunds = [], refundCandidates = null, onDeductFrom = () => {}, onKeepAsIncome = () => {},
}) {
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);
  const deducted = Refunds.isDeducted(tx);
  // A deducted refund's amount now lives in its purchase, so its own fields stay as the bank wrote them.
  const editable = editing && !deducted;
  const categoryText = ifBlank([tx.category, tx.subcategory].filter((s) => s.trim() !== '').join(' > '), 'Uncategorized');

  let status;
  if (deducted) status = 'Deducted';
  else if (tx.skipped) status = 'Skipped';
  else if (refunds.length > 0 && tx.amount === 0) status = 'Refunded';
  else if (tx.splitMode === SplitModes.UNSET) status = 'Unmarked';
  else status = splitLabel(tx.splitMode, tx.gfAmount);

  let statusColor;
  if (deducted) statusColor = 'var(--md-primary-container)';
  else if (tx.skipped) statusColor = 'var(--md-surface-variant)';
  else if (tx.splitMode === SplitModes.UNSET) statusColor = 'var(--md-tertiary-container)';
  else statusColor = 'var(--md-primary-container)';

  const primaryAmount = displayAmount(tx);
  const amountDetail = amountBreakdown(tx);
  const refundLine = deducted ? deductedFromText(refundTarget) : refundedText(tx, refunds);
  const refundShareLine = refundShareText(tx);
  let amountColor = 'var(--md-on-surface)';
  if (deducted) amountColor = 'var(--md-on-surface-variant)';
  else if (primaryAmount > 0) amountColor = 'var(--md-primary)';
  else if (primaryAmount < 0) amountColor = 'var(--md-error)';
  const borderColor = !tx.skipped && tx.splitMode === SplitModes.UNSET ? 'var(--md-tertiary-container)' : 'var(--md-outline-variant)';

  const tapToOpen = !editing && onToggleEdit !== null;
  const editTarget = (name) => (editable ? { role: 'button', tabIndex: 0, onClick: () => setDialog(name), onKeyDown: activateOnKey(() => setDialog(name)) } : {});

  const actions = [];
  if (editing && !deducted) {
    if (tx.amount > 0) {
      actions.push(['Confirm', tx.splitMode === SplitModes.I_PAY_FULL && !tx.skipped, () => onMark({ splitMode: SplitModes.I_PAY_FULL, skipped: false })]);
    } else {
      actions.push(['I Pay Full', tx.splitMode === SplitModes.I_PAY_FULL && !tx.skipped, () => onMark({ splitMode: SplitModes.I_PAY_FULL, skipped: false })]);
      actions.push(['Half', tx.splitMode === SplitModes.HALF && !tx.skipped, () => onMark({ splitMode: SplitModes.HALF, skipped: false })]);
      actions.push(['She Pays', tx.splitMode === SplitModes.SHE_PAYS_FULL && !tx.skipped, () => onMark({ splitMode: SplitModes.SHE_PAYS_FULL, skipped: false })]);
      actions.push(['Custom', tx.splitMode === SplitModes.CUSTOM && !tx.skipped, () => setDialog('custom')]);
    }
    actions.push(['Skip', tx.skipped, () => onMark({ skipped: true, splitMode: SplitModes.UNSET, gfAmount: 0 })]);
  }
  if (editing && onDelete) actions.push(['Delete', false, onDelete]);
  if (editing && onToggleEdit) actions.push(['Done', false, onToggleEdit]);

  return html`<article class=${cx('tx-card', tx.skipped && 'skipped', tapToOpen && 'tappable')} style=${{ borderColor }}
    onClick=${tapToOpen ? onToggleEdit : undefined} role=${tapToOpen ? 'button' : undefined} tabIndex=${tapToOpen ? 0 : undefined}
    onKeyDown=${tapToOpen ? activateOnKey(onToggleEdit) : undefined}>
    <div class=${cx('t-titleMedium w600 tx-note', editable && 'editable')} ...${editTarget('note')}>${ifBlank(tx.note, '(no note)')}</div>
    <div class="row between center">
      <div class="flow-row grow">
        <${StatusPill} label=${ifBlank(tx.date, 'No date')} container="var(--md-secondary-container)"
          onClick=${editable ? () => setDialog('date') : undefined} class=${editable ? 'editable' : ''} />
        <${StatusPill} label=${status} container=${statusColor} />
      </div>
      <div class=${cx('t-titleMedium w700 tx-amount', editable && 'editable')} style=${{ color: amountColor }} ...${editTarget('amount')}>
        ${formatSigned(primaryAmount, tx.currency)}
      </div>
    </div>
    <div class=${cx('row gap8 center tx-category', editable && 'editable')} ...${editTarget('category')}>
      <${ColorDot} color="var(--md-primary)" />
      <span class="t-bodyMedium w500 primary">${categoryText}</span>
    </div>
    ${amountDetail && html`<div class="t-bodySmall on-variant">${amountDetail}</div>`}
    ${refundLine && html`<div class="t-bodySmall primary">${refundLine}</div>`}
    ${refundShareLine && html`<div class="t-bodySmall w600 primary">${refundShareLine}</div>`}

    ${editing && deducted && html`
      <${HorizontalDivider} />
      <div class="t-bodySmall on-variant">Not counted as income: its amount came off that purchase instead.</div>
      <div class="row gap8">
        ${refundCandidates && html`<${OutlinedButton} class="grow tight" onClick=${() => setDialog('refund')}>Change purchase<//>`}
        <${OutlinedButton} class="grow tight" onClick=${() => onKeepAsIncome(tx)}>Keep as income<//>
      </div>
      ${actions.length > 0 && html`<${ActionGrid} actions=${actions} />`}`}

    ${editing && !deducted && html`
      <${HorizontalDivider} />
      <div class="t-bodySmall on-variant">Tap the note, date, amount, or category above to edit.</div>
      ${refunds.length === 0 && html`<div class="row gap8">
        <${SelectionPill} class="grow" label="Expense" selected=${tx.amount < 0} onClick=${() => tx.amount > 0 && onMark({ income: false })} />
        <${SelectionPill} class="grow" label="Income" selected=${tx.amount > 0} onClick=${() => tx.amount < 0 && onMark({ income: true })} />
      </div>`}
      ${refundCandidates && tx.amount > 0 && html`
        ${Refunds.looksLikeRefund(tx) && html`<div class="t-bodySmall primary">Looks like a refund. Deduct it from the purchase it paid back instead of counting it as income.</div>`}
        <${OutlinedButton} class="full" onClick=${() => setDialog('refund')}>Deduct from a purchase<//>`}
      ${refunds.map((refund) => html`<${OutlinedButton} key=${refund.id} class="full" onClick=${() => onKeepAsIncome(refund)}>Undo refund ${formatSigned(refund.amount, refund.currency)}<//>`)}
      <${ActionGrid} actions=${actions} />`}

    ${dialog === 'note' && html`<${EditTextDialog} title="Edit note" initial=${tx.note} multiline=${true}
      onDismiss=${close} onSave=${(v) => { onMark({ note: v }); close(); }} />`}
    ${dialog === 'amount' && html`<${EditTextDialog} title="Edit amount" initial=${String(kotlinDouble(Math.abs(tx.amount)))} inputMode="decimal"
      validator=${(v) => {
        const parsed = toDoubleOrNull(v);
        if (parsed === null) return 'Enter a number';
        if (parsed <= 0) return 'Amount must be greater than zero';
        return null;
      }}
      onDismiss=${close} onSave=${(v) => { onMark({ amount: toDoubleOrNull(v) }); close(); }} />`}
    ${dialog === 'custom' && html`<${EditTextDialog} title="GF share" initial=${tx.gfAmount > 0 ? kotlinDouble(tx.gfAmount) : ''} inputMode="decimal"
      validator=${(v) => {
        const parsed = toDoubleOrNull(v);
        const max = Math.abs(tx.amount);
        if (parsed === null) return 'Enter a number';
        if (parsed <= 0) return 'Share must be greater than zero';
        if (parsed > max) return `Share cannot exceed ${formatMoney(max, tx.currency)}`;
        return null;
      }}
      onDismiss=${close} onSave=${(v) => { onMark({ splitMode: SplitModes.CUSTOM, gfAmount: toDoubleOrNull(v), skipped: false }); close(); }} />`}
    ${dialog === 'date' && html`<${EditTextDialog} title="Edit date" initial=${tx.date}
      validator=${(v) => (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(v.trim()) ? null : 'Use YYYY-MM-DD or YYYY-MM-DD HH:MM')}
      onDismiss=${close} onSave=${(v) => { onMark({ date: v.trim() }); close(); }} />`}
    ${dialog === 'category' && html`<${CategoryDialog} initialCategory=${tx.category} initialSubcategory=${tx.subcategory}
      onDismiss=${close} onSave=${(category, subcategory) => { onMark({ category, subcategory }); close(); }} />`}
    ${dialog === 'refund' && refundCandidates && html`<${RefundPickerDialog} refund=${tx} loadCandidates=${refundCandidates}
      onPick=${(purchase) => { close(); onDeductFrom(purchase); }} onDismiss=${close} />`}
  </article>`;
}

/** Double.toString() for the amounts a field starts with: "6300.0", "12070.5". */
function kotlinDouble(value) {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

const activateOnKey = (action) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
};

function ActionGrid({ actions }) {
  const rows = [];
  for (let i = 0; i < actions.length; i += 3) rows.push(actions.slice(i, i + 3));
  return html`<div class="action-grid">
    ${rows.map((row) => html`<div class="action-row">
      ${row.map(([label, selected, onClick]) => html`<button type="button" class=${cx('action-btn t-labelLarge w600', selected && 'selected')}
        aria-pressed=${selected} onClick=${(e) => { e.stopPropagation(); onClick(); }}>${label}</button>`)}
      ${Array.from({ length: 3 - row.length }, () => html`<span class="action-spacer"></span>`)}
    </div>`)}
  </div>`;
}

function EditTextDialog({ title, initial, inputMode, multiline = false, validator = () => null, onDismiss, onSave }) {
  const [value, setValue] = useState(initial);
  const error = validator(value);
  return html`<${AlertDialog} title=${title} onDismissRequest=${onDismiss}
    text=${html`<${OutlinedTextField} value=${value} onValueChange=${setValue} singleLine=${!multiline} inputMode=${inputMode}
      isError=${error !== null} supportingText=${error} />`}
    confirmButton=${html`<${Button} disabled=${error !== null} onClick=${() => onSave(value)}>Save<//>`}
    dismissButton=${html`<${TextButton} onClick=${onDismiss}>Cancel<//>`} />`;
}

function CategoryDialog({ initialCategory, initialSubcategory, onDismiss, onSave }) {
  const [category, setCategory] = useState(ifBlank(initialCategory, 'Unknown'));
  const [subcategory, setSubcategory] = useState(initialSubcategory);
  // The exported list already leaves out the personal subcategories demo mode hides.
  const subcategories = Categories.subcategories(category);
  return html`<${AlertDialog} title="Category" onDismissRequest=${onDismiss}
    text=${html`<div class="column gap12">
      <${DropdownField} label="Category" value=${category} options=${Categories.NAMES}
        onSelected=${(c) => { setCategory(c); setSubcategory(''); }} />
      ${subcategories.length > 0 && html`<${DropdownField} label="Subcategory" value=${ifBlank(subcategory, 'None')}
        options=${['', ...subcategories]} optionLabel=${(o) => ifBlank(o, 'None')} onSelected=${setSubcategory} />`}
    </div>`}
    confirmButton=${html`<${Button} onClick=${() => onSave(category, subcategory)}>Save<//>`}
    dismissButton=${html`<${TextButton} onClick=${onDismiss}>Cancel<//>`} />`;
}

function DropdownField({ label, value, options, optionLabel = (o) => o, onSelected }) {
  return html`<div class="column gap4">
    <div class="t-labelMedium on-variant">${label}</div>
    <${DropdownPicker} label=${label} options=${options} optionLabel=${optionLabel} onSelect=${onSelected}>
      <${OutlinedButton} class="full dropdown-btn" tabIndex=${-1}>
        <span class="grow left">${value}</span><span class="primary">Change</span>
      <//>
    <//>
  </div>`;
}
