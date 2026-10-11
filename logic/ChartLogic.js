// Mirrors logic/ChartLogic.kt.

import { paidAmount } from './MarkLogic.js';
import { ifBlank } from './strings.js';
import { compareStrings } from './dates.js';
import { roundHalfUp } from './numbers.js';

/** Angles are degrees clockwise from 12 o'clock, kept as 32-bit floats like the app's. */
const f32 = Math.fround;

/** Lays [groups] around a full circle in list order. Empty when there is nothing to draw. */
export function chartSlices(groups) {
  const total = groups.reduce((sum, g) => sum + g.amount, 0);
  if (total <= 0) return [];
  let start = f32(0);
  return groups.map((group) => {
    const share = group.amount / total;
    const sweep = f32(share * 360);
    const slice = { group, startAngle: start, sweepAngle: sweep, share };
    start = f32(start + sweep);
    return slice;
  });
}

/** The slice under [angleDegrees]. Float rounding can leave the last slice a hair short of 360°. */
export function sliceAt(slices, angleDegrees) {
  const angle = f32(f32(f32(angleDegrees % 360) + 360) % 360);
  return (
    slices.find((s) => angle >= s.startAngle && angle < f32(s.startAngle + s.sweepAngle)) ??
    slices[slices.length - 1] ??
    null
  );
}

/** "33%", or "<1%" for a share that is real but rounds to nothing. */
export function percentLabel(share) {
  const percent = roundHalfUp(share * 100);
  return percent === 0 && share > 0 ? '<1%' : `${percent}%`;
}

const byDateThenIdDesc = (a, b) => compareStrings(b.date, a.date) || b.id - a.id;

/** Finished rows for one chart view. [month] null = all time; otherwise only that "YYYY-MM". */
export function chartRows(finishedRows, income, month) {
  return finishedRows
    .filter((t) => t.finished && !t.skipped)
    .filter((t) => month === null || t.date.slice(0, 7) === month)
    .filter((t) => (income ? t.amount > 0 : paidAmount(t) < 0))
    .sort(byDateThenIdDesc);
}

export const categoryChartBreakdown = (rows) =>
  chartBreakdown(rows, (t) => ifBlank(t.category, 'Unknown'));

export function subcategoryChartBreakdown(rows, includeCategory = false) {
  return chartBreakdown(rows, (t) => {
    const subcategory = ifBlank(t.subcategory, 'Uncategorized');
    return includeCategory ? `${ifBlank(t.category, 'Unknown')} > ${subcategory}` : subcategory;
  });
}

export function collapsedChartBreakdown(groups, maxGroups = 8) {
  if (groups.length <= maxGroups) return groups;
  const visible = groups.slice(0, maxGroups - 1);
  const otherRows = groups.slice(maxGroups - 1).flatMap((g) => g.transactions);
  const other = {
    label: 'Other',
    amount: otherRows.reduce((sum, t) => sum + Math.abs(paidAmount(t)), 0),
    transactions: otherRows,
  };
  return [...visible, other];
}

function chartBreakdown(rows, labelFor) {
  const groups = new Map();
  for (const t of rows) {
    const label = labelFor(t);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(t);
  }
  return [...groups]
    .map(([label, txs]) => ({
      label,
      amount: txs.reduce((sum, t) => sum + Math.abs(paidAmount(t)), 0),
      transactions: txs,
    }))
    .sort((a, b) => b.amount - a.amount);
}
