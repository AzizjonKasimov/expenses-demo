// Mirrors ui/BudgetScreen.kt: the rolling Dates budget and its months.

import { html, useState } from './html.js';
import { AlertDialog, Button, TextButton } from './material.js';
import { BarIndicator, MetricRow, SectionSurface, StatusPill, SummaryBand } from './UiKit.js';
import { formatMoney } from './UiFormat.js';

export function BudgetScreen({ vm }) {
  const b = vm.budget;
  const demoMode = vm.demoMode;
  const [confirmMonth, setConfirmMonth] = useState(null);
  const dayLabel = b.daysUntilRefill === 1 ? 'day' : 'days';

  return html`<div class="screen scroll"><div class="list">
    <${SummaryBand}
      title=${demoMode ? 'Sample dates budget' : 'Available for dates'}
      value=${formatMoney(b.balance, b.currency)}
      valueColor=${b.balance < 0 ? 'var(--md-error)' : 'var(--md-primary)'}
      supporting=${demoMode
        ? `Fake KRW sample · Next refill ${b.nextRefill} · ${b.daysUntilRefill} ${dayLabel}`
        : `Next refill ${b.nextRefill} · ${b.daysUntilRefill} ${dayLabel}`} />
    <${SectionSurface}>
      <${MetricRow} stats=${[
        ['This month', formatMoney(b.spentThisMonth, b.currency)],
        ['Monthly allocation', formatMoney(b.monthlyAllocation, b.currency)],
        ['Allocated months', `${b.monthsAllocated} / ${b.monthsElapsed}`],
      ]} />
    <//>
    ${b.months.map((month) => html`<${BudgetMonthRow} key=${month.yearMonth} month=${month} currency=${b.currency}
      onSkipToggle=${() => setConfirmMonth(month)} />`)}
  </div>
  ${confirmMonth && html`<${AlertDialog}
    title=${confirmMonth.skipped ? `Restore ${confirmMonth.yearMonth}?` : `Skip ${confirmMonth.yearMonth}?`}
    onDismissRequest=${() => setConfirmMonth(null)}
    text=${confirmMonth.skipped
      ? 'This month will receive its normal allocation again.'
      : demoMode
        ? 'This sample month will not receive a Dates budget allocation.'
        : 'This month will not receive a Dates budget allocation.'}
    confirmButton=${html`<${Button} onClick=${() => {
      vm.setMonthSkipped(confirmMonth.yearMonth, !confirmMonth.skipped);
      setConfirmMonth(null);
    }}>${confirmMonth.skipped ? 'Restore' : 'Skip'}<//>`}
    dismissButton=${html`<${TextButton} onClick=${() => setConfirmMonth(null)}>Cancel<//>`} />`}
  </div>`;
}

function BudgetMonthRow({ month, currency, onSkipToggle }) {
  const progress = month.allocation > 0 ? month.spent / month.allocation : 0;
  const overBudget = month.delta < 0;
  let color = 'var(--md-primary)';
  if (month.skipped) color = 'var(--md-outline-variant)';
  else if (overBudget) color = 'var(--md-error)';
  return html`<div class="surface-card budget-month"
    style=${{ borderColor: month.isCurrent ? 'var(--md-primary-container)' : 'var(--md-outline-variant)' }}>
    <div class="row between center">
      <div class="grow column gap3">
        <div class="row gap8 center">
          <span class="w600">${month.yearMonth}</span>
          ${month.isCurrent && html`<${StatusPill} label="Current" container="var(--md-primary-container)" />`}
        </div>
        <div class="t-bodySmall on-variant">
          ${month.skipped ? 'No allocation' : `${formatMoney(month.spent, currency)} of ${formatMoney(month.allocation, currency)}`}
        </div>
      </div>
      <div class="column end gap2">
        <span class="w700" style=${{ color: overBudget ? 'var(--md-error)' : 'var(--md-on-surface)' }}>
          ${month.skipped ? 'Skipped' : formatMoney(month.delta, currency)}
        </span>
        <${TextButton} onClick=${onSkipToggle}>${month.skipped ? 'Restore' : 'Skip'}<//>
      </div>
    </div>
    ${!month.skipped && html`<${BarIndicator} progress=${progress} color=${color} />`}
  </div>`;
}
