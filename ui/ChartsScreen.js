// Mirrors ui/ChartsScreen.kt: month navigation, totals, and the donut whose slices drill down into
// subcategories and then transactions.

import { cx, html, useEffect, useRef, useState } from './html.js';
import { Icon } from './Icons.js';
import { HorizontalDivider, OutlinedButton } from './material.js';
import { BarIndicator, ColorDot, SectionSurface, SelectionPill, StatusPill, SummaryBand } from './UiKit.js';
import { displayAmount, formatMoney, formatSigned } from './UiFormat.js';
import {
  categoryChartBreakdown, chartRows, chartSlices, collapsedChartBreakdown, percentLabel, sliceAt, subcategoryChartBreakdown,
} from '../logic/ChartLogic.js';
import { paidAmount } from '../logic/MarkLogic.js';
import { addMonths, monthLabel as formatMonth } from '../logic/dates.js';
import { ifBlank } from '../logic/strings.js';

const DONUT_SIZE = 240;
const RING_WIDTH = 44;
const SLICE_POP = 6;
const SLICE_GAP_DEGREES = 1.6;
/** A share label needs this much arc to sit inside the ring; smaller slices keep their percent in the list. */
const MIN_LABEL_SWEEP_DEGREES = 20;

export function ChartsScreen({ vm }) {
  const finished = vm.finished;
  const [income, setIncome] = useState(false);
  const [allTime, setAllTime] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);

  const visibleMonth = addMonths(vm.today.slice(0, 7), -monthOffset);
  const selectedMonth = allTime ? null : visibleMonth;
  const expenseRows = chartRows(finished, false, selectedMonth);
  const incomeRows = chartRows(finished, true, selectedMonth);
  const rows = income ? incomeRows : expenseRows;
  const grouped = collapsedChartBreakdown(categoryChartBreakdown(rows));
  const selectedGroup = grouped.find((g) => g.label === selectedCategory) ?? null;
  const subgroups = selectedGroup ? subcategoryChartBreakdown(selectedGroup.transactions, selectedGroup.label === 'Other') : [];
  const selectedSubgroup = subgroups.find((g) => g.label === selectedSubcategory) ?? null;
  const expenseTotal = expenseRows.reduce((sum, t) => sum + Math.abs(paidAmount(t)), 0);
  const incomeTotal = incomeRows.reduce((sum, t) => sum + Math.abs(paidAmount(t)), 0);
  const netTotal = incomeTotal - expenseTotal;
  const activeTotal = grouped.reduce((sum, g) => sum + g.amount, 0);
  const currency = rows[0]?.currency ?? finished[0]?.currency ?? 'KRW';
  const palette = chartPalette();
  const monthLabel = formatMonth(visibleMonth);
  const periodLabel = allTime ? 'All time' : monthLabel;
  const modeLabel = income ? 'Incoming' : 'Outgoing';
  const progress = useSweepIn(`${periodLabel}|${income}`);

  const resetDrillDown = () => {
    setSelectedCategory(null);
    setSelectedSubcategory(null);
  };
  const toggleCategory = (group) => {
    if (selectedCategory === group.label) resetDrillDown();
    else {
      setSelectedCategory(group.label);
      setSelectedSubcategory(null);
    }
  };
  useEffect(() => {
    if (selectedCategory !== null && selectedGroup === null) resetDrillDown();
  }, [grouped.map((g) => g.label).join('|'), selectedCategory]);
  useEffect(() => {
    if (selectedSubcategory !== null && selectedSubgroup === null) setSelectedSubcategory(null);
  }, [subgroups.map((g) => g.label).join('|'), selectedSubcategory]);

  return html`<div class="screen scroll"><div class="list">
    <${SectionSurface}>
      <div class="row gap8 center">
        <${OutlinedButton} label="Previous month" onClick=${() => { setAllTime(false); setMonthOffset(monthOffset + 1); resetDrillDown(); }}>‹<//>
        <div class="grow t-titleMedium w600 center-text">${allTime ? 'All time' : monthLabel}</div>
        <${OutlinedButton} label="Next month" disabled=${allTime || monthOffset === 0}
          onClick=${() => { if (monthOffset > 0) setMonthOffset(monthOffset - 1); resetDrillDown(); }}>›<//>
      </div>
      <div class="row gap8">
        <${SelectionPill} class="grow" label="Monthly" selected=${!allTime} onClick=${() => { setAllTime(false); resetDrillDown(); }} />
        <${SelectionPill} class="grow" label="All time" selected=${allTime} onClick=${() => { setAllTime(true); resetDrillDown(); }} />
      </div>
      <div class="row gap8">
        <${SelectionPill} class="grow" label="Outgoing" selected=${!income} onClick=${() => { setIncome(false); resetDrillDown(); }} />
        <${SelectionPill} class="grow" label="Incoming" selected=${income} onClick=${() => { setIncome(true); resetDrillDown(); }} />
      </div>
    <//>
    <${SummaryBand} title="Net total" value=${formatSigned(netTotal, currency)}
      supporting=${`${periodLabel} · ${transactionCountLabel(expenseRows.length + incomeRows.length)}`}
      valueColor=${netTotal < 0 ? 'var(--md-error)' : 'var(--md-primary)'} />
    <${SectionSurface}>
      <${SpendingMetricRow} label="Expense" count=${expenseRows.length} value=${expenseTotal} currency=${currency}
        color="var(--md-error)" progress=${expenseTotal / Math.max(expenseTotal, incomeTotal, 1)} />
      <${HorizontalDivider} />
      <${SpendingMetricRow} label="Income" count=${incomeRows.length} value=${incomeTotal} currency=${currency}
        color="var(--md-primary)" progress=${incomeTotal / Math.max(expenseTotal, incomeTotal, 1)} />
    <//>
    ${grouped.length === 0
      ? html`<${SectionSurface} title=${`${modeLabel} by category`}>
          <div class="on-variant">${allTime ? `No ${modeLabel.toLowerCase()} transactions yet.` : `No ${modeLabel.toLowerCase()} transactions in ${periodLabel}.`}</div>
        <//>`
      : html`<${CategoryBreakdownCard} title=${`${modeLabel} by category`} modeLabel=${modeLabel} groups=${grouped}
          total=${activeTotal} transactionCount=${rows.length} colors=${palette} currency=${currency}
          amountColor=${income ? 'var(--md-primary)' : 'var(--md-error)'} progress=${progress}
          selectedGroup=${selectedGroup} selectedSubgroup=${selectedSubgroup}
          onGroupToggled=${toggleCategory} onSelectionCleared=${resetDrillDown}
          onSubgroupSelected=${(sub) => setSelectedSubcategory(selectedSubcategory === sub.label ? null : sub.label)} />`}
  </div></div>`;
}

function SpendingMetricRow({ label, count, value, currency, color, progress }) {
  return html`<div class="column gap7">
    <div class="row between center">
      <span class="t-titleMedium w600">${label}  (x${count})</span>
      <span class="t-titleMedium w700" style=${{ color }}>${formatMoney(value, currency)}</span>
    </div>
    <${BarIndicator} progress=${progress} color=${color} />
  </div>`;
}

/** Donut on top, category rows below it acting as its legend; rows expand to subcategories, then to transactions. */
function CategoryBreakdownCard({
  title, modeLabel, groups, total, transactionCount, colors, currency, amountColor, progress,
  selectedGroup, selectedSubgroup, onGroupToggled, onSelectionCleared, onSubgroupSelected,
}) {
  const slices = chartSlices(groups);
  return html`<${SectionSurface} title=${title}>
    <${DonutChart} slices=${slices} colors=${colors} selectedLabel=${selectedGroup?.label ?? null} progress=${progress}
      onSliceTapped=${(group) => (group === null ? onSelectionCleared() : onGroupToggled(group))}>
      <${DonutCenter} modeLabel=${modeLabel} total=${total} transactionCount=${transactionCount} currency=${currency}
        selectedGroup=${selectedGroup} selectedShare=${selectedGroup ? (total > 0 ? selectedGroup.amount / total : 0) : null} />
    <//>
    <${HorizontalDivider} />
    <div class="column gap4">
      ${slices.map((slice, index) => {
        const group = slice.group;
        const selected = selectedGroup?.label === group.label;
        const color = colors[index % colors.length];
        return html`
          <${CategoryRow} key=${group.label} group=${group} color=${color} share=${slice.share} currency=${currency}
            amountColor=${amountColor} selected=${selected} onClick=${() => onGroupToggled(group)} />
          ${selected && html`<${ExpandedCategoryDetails} group=${group} color=${color} currency=${currency}
            selectedSubgroup=${selectedSubgroup} onSubgroupSelected=${onSubgroupSelected} />`}`;
      })}
    </div>
  <//>`;
}

function DonutCenter({ modeLabel, total, transactionCount, currency, selectedGroup, selectedShare }) {
  if (selectedGroup === null || selectedShare === null) {
    const value = formatMoney(total, currency);
    return html`<div class="donut-center">
      <div class="t-labelMedium on-variant">Total ${modeLabel.toLowerCase()}</div>
      <div class=${cx(value.length <= 10 ? 't-titleLarge' : 't-titleMedium', 'w700 nowrap')}>${value}</div>
      <div class="t-labelSmall on-variant">${transactionCountLabel(transactionCount)}</div>
    </div>`;
  }
  return html`<div class="donut-center">
    <div class="t-labelMedium on-variant ellipsis">${selectedGroup.label}</div>
    <div class="t-headlineSmall w700">${percentLabel(selectedShare)}</div>
    <div class="t-labelMedium w600 nowrap">${formatMoney(selectedGroup.amount, currency)}</div>
  </div>`;
}

function CategoryRow({ group, color, share, currency, amountColor, selected, onClick }) {
  return html`<div class="chart-row" role="button" tabIndex="0" aria-expanded=${selected} onClick=${onClick}
    onKeyDown=${(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
    style=${{ background: selected ? alpha(color, 0.1) : 'transparent' }}>
    <div class="row gap10 center">
      <${ColorDot} color=${color} />
      <div class="grow column gap3 min0">
        <div class="row gap8 center min0">
          <span class="t-titleSmall w600 ellipsis">${group.label}</span>
          <${StatusPill} label=${percentLabel(share)} container=${alpha(color, 0.16)} />
        </div>
        <div class="t-bodySmall on-variant">${transactionCountLabel(group.transactions.length)}</div>
      </div>
      <span class="t-bodyMedium w700 nowrap" style=${{ color: amountColor }}>${formatMoney(group.amount, currency)}</span>
      <${ExpandChevron} expanded=${selected} />
    </div>
    <div class="bar-indent"><${BarIndicator} progress=${share} color=${color} /></div>
  </div>`;
}

function ExpandedCategoryDetails({ group, color, currency, selectedSubgroup, onSubgroupSelected }) {
  const subgroups = subcategoryChartBreakdown(group.transactions, group.label === 'Other');
  return html`<div class="chart-details column gap4">
    ${subgroups.map((sub) => {
      const selected = selectedSubgroup?.label === sub.label;
      return html`
        <${SubcategoryRow} key=${sub.label} subgroup=${sub} color=${color} share=${group.amount > 0 ? sub.amount / group.amount : 0}
          currency=${currency} selected=${selected} onClick=${() => onSubgroupSelected(sub)} />
        ${selected && html`<${TransactionPanel} transactions=${sub.transactions} />`}`;
    })}
  </div>`;
}

function SubcategoryRow({ subgroup, color, share, currency, selected, onClick }) {
  return html`<div class="chart-subrow row gap10 center" role="button" tabIndex="0" aria-expanded=${selected} onClick=${onClick}
    onKeyDown=${(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
    style=${{ background: selected ? alpha(color, 0.08) : 'transparent' }}>
    <!-- A paler dot marks the child level under the parent's solid one. -->
    <${ColorDot} color=${alpha(color, 0.55)} />
    <div class="grow column gap2 min0">
      <span class=${cx('t-bodyMedium ellipsis', selected ? 'w700' : 'w500')}>${subgroup.label}</span>
      <span class="t-bodySmall on-variant">${transactionCountLabel(subgroup.transactions.length)} · ${percentLabel(share)}</span>
    </div>
    <span class="t-bodyMedium w600 nowrap">${formatMoney(subgroup.amount, currency)}</span>
    <${ExpandChevron} expanded=${selected} />
  </div>`;
}

const ExpandChevron = ({ expanded }) =>
  html`<span class=${cx('chevron', expanded && 'up')}><${Icon} name="KeyboardArrowDown" size=${18} label=${expanded ? 'Collapse' : 'Expand'} /></span>`;

/** The tapped subcategory's transactions, boxed so they read as its contents rather than as loose rows. */
function TransactionPanel({ transactions }) {
  return html`<div class="tx-panel column gap8">
    ${transactions.map((tx, index) => {
      const amount = displayAmount(tx);
      const color = amount > 0 ? 'var(--md-primary)' : amount < 0 ? 'var(--md-error)' : 'var(--md-on-surface)';
      return html`
        <div class="row gap10 center" key=${tx.id}>
          <div class="grow column gap2 min0">
            <span class="t-bodyMedium w600 ellipsis">${ifBlank(tx.note, '(no note)')}</span>
            <span class="t-bodySmall on-variant ellipsis">${ifBlank(tx.date, 'No date')}</span>
          </div>
          <span class="t-bodyMedium w700 nowrap" style=${{ color }}>${formatSigned(amount, tx.currency)}</span>
        </div>
        ${index !== transactions.length - 1 && html`<${HorizontalDivider} />`}`;
    })}
  </div>`;
}

/**
 * Ring chart with every slice's share written on it. Tapping a slice reports its group, tapping the
 * hole reports null; the selected slice pops outward while the rest fade back.
 */
function DonutChart({ slices, colors, selectedLabel, progress, onSliceTapped, children }) {
  const svg = useRef(null);
  const c = DONUT_SIZE / 2;
  const ringRadius = c - SLICE_POP - RING_WIDTH / 2;

  const onClick = (e) => {
    const box = svg.current.getBoundingClientRect();
    const scale = DONUT_SIZE / box.width;
    const dx = (e.clientX - box.left) * scale - c;
    const dy = (e.clientY - box.top) * scale - c;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const outer = c;
    const inner = outer - SLICE_POP - RING_WIDTH;
    if (distance < inner) onSliceTapped(null);
    else if (distance <= outer) {
      const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
      const slice = sliceAt(slices, angle);
      if (slice) onSliceTapped(slice.group);
    }
  };

  return html`<div class="donut">
    <svg ref=${svg} width=${DONUT_SIZE} height=${DONUT_SIZE} viewBox=${`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} onClick=${onClick}
      role="img" aria-label="Spending by category">
      ${slices.map((slice, index) => {
        const selected = slice.group.label === selectedLabel;
        const dimmed = selectedLabel !== null && !selected;
        const base = colors[index % colors.length];
        // The popped slice keeps its inner edge and grows outward.
        const radius = selected ? ringRadius + SLICE_POP / 2 : ringRadius;
        const width = selected ? RING_WIDTH + SLICE_POP : RING_WIDTH;
        const gap = slices.length > 1 && slice.sweepAngle > SLICE_GAP_DEGREES * 3 ? SLICE_GAP_DEGREES : 0;
        const sweep = slice.sweepAngle * progress - gap;
        if (sweep <= 0) return null;
        const start = -90 + slice.startAngle * progress + gap / 2;
        const showLabel = slice.sweepAngle >= MIN_LABEL_SWEEP_DEGREES && progress >= 0.99;
        const mid = ((-90 + slice.startAngle + slice.sweepAngle / 2) * Math.PI) / 180;
        // A faded slice is too pale for white ink, so its label switches to the slice's own colour.
        const ink = dimmed ? base : luminance(base) > 0.4 ? '#111827' : '#ffffff';
        return html`<g key=${slice.group.label}>
          ${arc(c, c, radius, start, sweep, { stroke: base, strokeWidth: width, strokeOpacity: dimmed ? 0.3 : 1 })}
          ${showLabel && html`<text x=${c + radius * Math.cos(mid)} y=${c + radius * Math.sin(mid)} class="donut-label"
            fill=${ink} text-anchor="middle" dominant-baseline="central">${percentLabel(slice.share)}</text>`}
        </g>`;
      })}
    </svg>
    ${children}
  </div>`;
}

/** An arc stroke from [startDeg] clockwise through [sweepDeg] (0° = 3 o'clock, like Canvas.drawArc). */
function arc(cx, cy, r, startDeg, sweepDeg, style) {
  const css = { fill: 'none', stroke: style.stroke, strokeWidth: style.strokeWidth, strokeOpacity: style.strokeOpacity };
  if (sweepDeg >= 359.999) return html`<circle cx=${cx} cy=${cy} r=${r} style=${css} />`;
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = ((startDeg + sweepDeg) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = sweepDeg > 180 ? 1 : 0;
  return html`<path d=${`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`} style=${css} />`;
}

/** Re-runs the 700 ms FastOutSlowIn sweep whenever [key] changes, like the app's Animatable. */
function useSweepIn(key) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      return undefined;
    }
    let frame;
    const started = performance.now();
    const step = (now) => {
      const t = Math.min((now - started) / 700, 1);
      setProgress(fastOutSlowIn(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    setProgress(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key]);
  return progress;
}

/** cubic-bezier(0.4, 0, 0.2, 1), solved for x by bisection. */
function fastOutSlowIn(x) {
  if (x <= 0 || x >= 1) return Math.min(Math.max(x, 0), 1);
  const bez = (t, p1, p2) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, 0.4, 0.2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, 0, 1);
}

const transactionCountLabel = (count) => `${count} ${count === 1 ? 'transaction' : 'transactions'}`;

/** Brand teal and orange first, then hues spaced far enough apart to tell neighbours in the ring apart. */
function chartPalette() {
  const css = getComputedStyle(document.documentElement);
  return [
    css.getPropertyValue('--md-primary').trim(),
    css.getPropertyValue('--md-tertiary').trim(),
    '#3b82f6', '#8b5cf6', '#ec4899', '#16a34a', '#eab308', '#64748b',
  ];
}

/** [hex] at [a] alpha, as Color.copy(alpha = a). */
const alpha = (hex, a) => `color-mix(in srgb, ${hex} ${Math.round(a * 100)}%, transparent)`;

/** Color.luminance(): relative luminance of an sRGB colour. */
function luminance(hex) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
