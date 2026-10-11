// Mirrors logic/BudgetLogic.kt. The constants (BudgetConfig) are exported from the app.

import { SplitModes } from './Categories.js';
import { compareStrings, epochDay, pad2, pad4 } from './dates.js';

export let BudgetConfig = {
  MONTHLY_ALLOCATION: 100_000,
  START_YEAR: 2025,
  START_MONTH: 4,
  CATEGORY: 'Entertainment',
  SUBCATEGORY: 'Dates',
  CURRENCY: 'KRW',
};

export function loadBudgetConfig(config) {
  BudgetConfig = { ...config };
}

const ym = (y, m) => `${pad4(y)}-${pad2(m)}`;

function monthsInRange(today) {
  const [ty, tm] = [+today.slice(0, 4), +today.slice(5, 7)];
  const out = [];
  let y = BudgetConfig.START_YEAR;
  let m = BudgetConfig.START_MONTH;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(ym(y, m));
    m++;
    if (m === 13) {
      m = 1;
      y++;
    }
  }
  return out;
}

function nextRefill(today) {
  const [y, m] = [+today.slice(0, 4), +today.slice(5, 7)];
  return m === 12 ? `${pad4(y + 1)}-01-01` : `${ym(y, m + 1)}-01`;
}

/** Positive number = how much the user actually paid for this date. */
function userShare(t) {
  return t.amount < 0 ? -(t.amount + t.gfAmount) : -t.amount;
}

/**
 * Rolling "Dates" budget. [txs] is the full transaction set; filtering (finished, non-skipped,
 * counted split, Entertainment > Dates, on/after start) is done here. [skippedMonths] is a Set of
 * "YYYY-MM" no-allocation months; [today] is "YYYY-MM-DD".
 */
export function datesBudget(txs, skippedMonths, today) {
  const months = monthsInRange(today);
  const startIso = `${ym(BudgetConfig.START_YEAR, BudgetConfig.START_MONTH)}-01`;

  const dateTxs = txs
    .filter(
      (t) =>
        t.finished &&
        !t.skipped &&
        SplitModes.COUNTED.has(t.splitMode) &&
        t.category === BudgetConfig.CATEGORY &&
        t.subcategory === BudgetConfig.SUBCATEGORY &&
        compareStrings(t.date, startIso) >= 0,
    )
    .sort((a, b) => compareStrings(b.date, a.date) || b.id - a.id);

  const perMonth = new Map(months.map((m) => [m, []]));
  for (const t of dateTxs) perMonth.get(t.date.slice(0, 7))?.push(t);

  const currentYm = today.slice(0, 7);
  const monthRows = [];
  let spentTotal = 0;
  let spentThisMonth = 0;
  let totalBudget = 0;

  for (const month of months) {
    const isSkipped = skippedMonths.has(month);
    const allocation = isSkipped ? 0 : BudgetConfig.MONTHLY_ALLOCATION;
    const monthTxs = perMonth.get(month) ?? [];
    const spent = monthTxs.reduce((sum, t) => sum + userShare(t), 0);
    spentTotal += spent;
    if (month === currentYm) spentThisMonth = spent;
    totalBudget += allocation;
    monthRows.push({
      yearMonth: month,
      allocation,
      spent,
      delta: allocation - spent,
      skipped: isSkipped,
      isCurrent: month === currentYm,
      transactions: monthTxs,
    });
  }

  const refill = nextRefill(today);
  return {
    balance: totalBudget - spentTotal,
    spentThisMonth,
    spentTotal,
    monthlyAllocation: BudgetConfig.MONTHLY_ALLOCATION,
    monthsElapsed: months.length,
    monthsAllocated: monthRows.filter((m) => !m.skipped).length,
    totalBudget,
    nextRefill: refill,
    daysUntilRefill: epochDay(refill) - epochDay(today),
    currency: BudgetConfig.CURRENCY,
    category: BudgetConfig.CATEGORY,
    subcategory: BudgetConfig.SUBCATEGORY,
    months: monthRows.reverse(),
  };
}
