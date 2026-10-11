// Stand-ins for the java.time calls the Kotlin code makes. Dates stay strings in the app's own
// formats ("YYYY-MM-DD" or "YYYY-MM-DD HH:MM"), and arithmetic goes through epoch days, so no time
// zone or daylight-saving rule can move a date.

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const pad2 = (n) => String(n).padStart(2, '0');
export const pad4 = (n) => String(n).padStart(4, '0');

/** Days since 1970-01-01 for a strict "YYYY-MM-DD" (what LocalDate.parse accepts), else null. */
export function epochDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(t / DAY_MS);
}

export function isoFromEpochDay(day) {
  const d = new Date(day * DAY_MS);
  return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export const addDays = (iso, days) => isoFromEpochDay(epochDay(iso) + days);

/** The visitor's own calendar date, as LocalDate.now() is the phone's. */
export function localToday() {
  const d = new Date();
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM-DD HH:MM" for a statement row [daysAgo] days before [today] at [time] ("" = no time). */
export function dateDaysAgo(today, daysAgo, time = '') {
  const day = addDays(today, -daysAgo);
  return time ? `${day} ${time}` : day;
}

/** "2026-09" for any app date string. */
export const yearMonthOf = (date) => date.slice(0, 7);

export function addMonths(ym, months) {
  const total = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + months;
  return `${pad4(Math.floor(total / 12))}-${pad2((total % 12) + 1)}`;
}

/** YearMonth.format("MMM yyyy", Locale.US): "Oct 2026". */
export const monthLabel = (ym) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

export const firstDayOf = (ym) => `${ym}-01`;

export function lastDayOf(ym) {
  const next = addMonths(ym, 1);
  return addDays(`${next}-01`, -1);
}

/**
 * Minutes since the epoch for "YYYY-MM-DD" (start of day) or "YYYY-MM-DD HH:MM[...]", the way the
 * Kotlin code parses row times: trim, 'T' becomes ' ', at most 16 characters, strict fields.
 */
export function parseRowMinutes(date) {
  const clean = date.trim().replaceAll('T', ' ');
  if (clean.length <= 10) {
    const day = epochDay(clean);
    return day === null ? null : day * 1440;
  }
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(clean.slice(0, 16));
  if (!m) return null;
  const day = epochDay(m[1]);
  const [h, min] = [+m[2], +m[3]];
  if (day === null || h > 23 || min > 59) return null;
  return day * 1440 + h * 60 + min;
}

/** Seconds since the epoch for a local "YYYY-MM-DD HH:MM:SS" (receipt mail times). */
export function parseLocalSeconds(dateTime) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(dateTime);
  if (!m) return null;
  return epochDay(m[1]) * 86_400 + +m[2] * 3600 + +m[3] * 60 + +m[4];
}

/** Moves the date part of an app date string by [days], keeping any clock time. */
export function shiftDate(value, days) {
  if (days === 0 || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  return addDays(value.slice(0, 10), days) + value.slice(10);
}

/** String comparison by UTF-16 code units, as Kotlin's String.compareTo. */
export const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
