// Mirrors ui/RefundPicker.kt: picks the purchase a refund paid back; tapping one deducts it.

import { html, useMemo } from './html.js';
import { AlertDialog, TextButton } from './material.js';
import { formatMoney, formatSigned } from './UiFormat.js';
import { Refunds } from '../logic/Refunds.js';
import { ifBlank } from '../logic/strings.js';

export function RefundPickerDialog({ refund, loadCandidates, onPick, onDismiss }) {
  const candidates = useMemo(loadCandidates, [refund.id]);
  return html`<${AlertDialog} title=${`Deduct ${formatSigned(refund.amount, refund.currency)} from`} onDismissRequest=${onDismiss}
    text=${html`<div class="column gap8">
      <div class="t-bodySmall on-variant">
        Pick the purchase this refund paid back. Its amount goes down by the refund, and the refund stops counting as income.
      </div>
      ${candidates.length === 0
        ? html`<div class="t-bodyMedium on-surface">No earlier purchase of at least ${formatMoney(refund.amount, refund.currency)} in the last ${Refunds.PICK_WINDOW_DAYS} days.</div>`
        : candidates.map((purchase) => html`<${PurchaseOption} key=${purchase.id} purchase=${purchase}
            sameAmount=${Refunds.isExactMatch(purchase, refund)} current=${purchase.clientId === refund.refundOf}
            onClick=${() => onPick(purchase)} />`)}
    </div>`}
    confirmButton=${html`<${TextButton} onClick=${onDismiss}>Cancel<//>`} />`;
}

function PurchaseOption({ purchase, sameAmount, current, onClick }) {
  const label = [purchase.category, purchase.subcategory].filter((s) => s.trim() !== '').join(' > ');
  const tags = [current && 'Deducted from now', sameAmount && 'Same amount', label || null].filter(Boolean);
  return html`<button type="button" class=${`option-card${current ? ' current' : ''}`} onClick=${onClick}>
    <span class="t-bodyMedium w600 clamp2">${ifBlank(purchase.note, '(no note)')}</span>
    <span class="row between center">
      <span class="t-bodySmall on-variant">${purchase.date}</span>
      <span class="t-bodyMedium w600">${formatSigned(purchase.amount, purchase.currency)}</span>
    </span>
    ${tags.length > 0 && html`<span class="t-labelSmall primary">${tags.join(' · ')}</span>`}
  </button>`;
}
