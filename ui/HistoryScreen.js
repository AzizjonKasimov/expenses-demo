// Mirrors ui/HistoryScreen.kt: the all-time balance, filters, and saved rows that open into an editor.

import { html, useState } from './html.js';
import { DropdownPicker, OutlinedButton } from './material.js';
import { SectionSurface, SelectionPill, SummaryBand } from './UiKit.js';
import { TransactionCard } from './TransactionCard.js';
import { ALL_TIME_FILTER, formatSigned, last30Filter, monthFilter } from './UiFormat.js';
import { Categories } from '../logic/Categories.js';

export function HistoryScreen({ vm }) {
  const history = vm.history;
  const filter = vm.historyFilter;
  const balance = vm.balance;
  const links = vm.refundLinks;
  const [editingId, setEditingId] = useState(null);
  const month = monthFilter(vm.today);
  const rowLabel = `${history.length} ${history.length === 1 ? 'row' : 'rows'}`;
  const filterText = [filter.label, filter.category ?? 'All categories', rowLabel].join(' · ');
  const categoryOptions = [null, ...Categories.NAMES.filter((c) => c !== 'Unknown')];

  return html`<div class="screen scroll"><div class="list">
    <${SummaryBand} title="All-time balance" value=${formatSigned(balance)} supporting=${filterText}
      valueColor=${balance < 0 ? 'var(--md-error)' : 'var(--md-primary)'} />
    <${SectionSurface}>
      <div class="flow-row">
        <${SelectionPill} label="All" selected=${filter.label === 'All time'}
          onClick=${() => vm.setHistoryFilter({ ...ALL_TIME_FILTER, category: filter.category })} />
        <${SelectionPill} label="Month" selected=${filter.label === month.label}
          onClick=${() => vm.setHistoryFilter({ ...month, category: filter.category })} />
        <${SelectionPill} label="30 days" selected=${filter.label === 'Last 30 days'}
          onClick=${() => vm.setHistoryFilter({ ...last30Filter(vm.today), category: filter.category })} />
        <${DropdownPicker} label="Category" options=${categoryOptions} optionLabel=${(c) => c ?? 'All categories'}
          onSelect=${(c) => vm.setHistoryFilter({ ...filter, category: c })}>
          <${OutlinedButton} tabIndex=${-1}>${filter.category ?? 'Category'}<//>
        <//>
      </div>
      <div class="t-bodySmall on-variant">Tap a transaction to edit it.</div>
    <//>
    ${history.length === 0
      ? html`<${SectionSurface}><div class="on-variant">No finished transactions match this filter.</div><//>`
      : history.map((tx) => html`<${TransactionCard}
          key=${tx.id}
          tx=${tx}
          editing=${editingId === tx.id}
          onMark=${(edit) => vm.mark(tx.id, edit)}
          onDelete=${() => { vm.delete(tx.id); setEditingId(null); }}
          onToggleEdit=${() => setEditingId(editingId === tx.id ? null : tx.id)}
          refunds=${links.refundsOf(tx)}
          refundCandidates=${tx.amount > 0 ? () => vm.refundCandidates(tx) : null}
          onDeductFrom=${(purchase) => { vm.deductRefund(tx, purchase); setEditingId(null); }}
          onKeepAsIncome=${(refund) => vm.keepRefundAsIncome(refund)} />`)}
  </div></div>`;
}
