// Mirrors data/ImportDeduplicator.kt: matches statement rows to finished history by an immutable
// fingerprint of the bank's own values. Fingerprints are the same SHA-256 hex the app stores.

import { scale2HalfUp } from './numbers.js';
import { ifBlank, isBlank } from './strings.js';
import { sha256Hex } from './sha256.js';

/** Returns { duplicateIndexes: Set<number>, legacyRepairs: Map<id, fingerprint> }. */
export function match(incoming, finished) {
  const rows = incoming.map((row, index) => {
    const identity = parsedIdentity(row);
    return { index, identity, fingerprint: fingerprintOf(identity) };
  });
  const history = finished
    .filter((t) => t.finished)
    .sort((a, b) => a.id - b.id)
    .map((tx) => {
      const reliable = tx.sourceFingerprintReliable && !isBlank(tx.sourceFingerprint);
      return {
        tx,
        reliable,
        exactFingerprint: reliable ? tx.sourceFingerprint : fingerprintOf(entityIdentity(tx)),
        matched: false,
      };
    });
  const duplicateIndexes = new Set();
  const legacyRepairs = new Map();

  // Consume exact identities one-for-one, so two identical statement rows are only both suppressed
  // when history also holds two matching rows.
  const exactQueues = new Map();
  for (const h of history) {
    if (!exactQueues.has(h.exactFingerprint)) exactQueues.set(h.exactFingerprint, []);
    exactQueues.get(h.exactFingerprint).push(h);
  }
  for (const row of rows) {
    const queue = exactQueues.get(row.fingerprint);
    const historyRow = queue?.shift();
    if (!historyRow) continue;
    historyRow.matched = true;
    duplicateIndexes.add(row.index);
    if (!historyRow.reliable) legacyRepairs.set(historyRow.tx.id, row.fingerprint);
  }

  // Rows from backups that predate fingerprints match on the bank-stable date/amount/currency,
  // and only in equal-size groups.
  const unmatchedIncoming = groupBy(rows.filter((r) => !duplicateIndexes.has(r.index)), (r) => legacyStableKey(r.identity));
  const unmatchedLegacy = groupBy(history.filter((h) => !h.matched && !h.reliable), (h) => legacyStableKey(entityIdentity(h.tx)));
  for (const [key, incomingGroup] of unmatchedIncoming) {
    const historyGroup = unmatchedLegacy.get(key) ?? [];
    if (historyGroup.length === 0 || incomingGroup.length !== historyGroup.length) continue;
    const sortedIncoming = [...incomingGroup].sort((a, b) => a.index - b.index);
    const sortedHistory = [...historyGroup].sort((a, b) => a.tx.id - b.tx.id);
    sortedIncoming.forEach((incomingRow, i) => {
      const historyRow = sortedHistory[i];
      historyRow.matched = true;
      duplicateIndexes.add(incomingRow.index);
      legacyRepairs.set(historyRow.tx.id, incomingRow.fingerprint);
    });
  }

  return { duplicateIndexes, legacyRepairs };
}

/** The fingerprint of a parsed statement row (ParsedTxn). */
export const parsedFingerprint = (row) => fingerprintOf(parsedIdentity(row));

/** The fingerprint of explicit values, as DemoExpenseDataSource seeds history. */
export const fingerprint = (date, note, amount, currency, account) =>
  fingerprintOf({ date, note, amount, currency, account });

// Receipt-enriched notes are not reproducible when the mailbox is unreachable, so identity uses the
// bank's original description whenever one was preserved.
const parsedIdentity = (row) => ({
  date: row.date,
  note: ifBlank(row.sourceNote, row.note),
  amount: row.amount,
  currency: row.currency,
  account: row.account,
});

const entityIdentity = (tx) => ({
  date: tx.date,
  note: tx.note,
  amount: tx.amount,
  currency: tx.currency,
  account: tx.account,
});

const normalized = (identity) => [
  normalizeDate(identity.date),
  normalizeText(identity.note),
  scale2HalfUp(identity.amount),
  ifBlank(identity.currency.trim().toUpperCase(), 'KRW'),
  normalizeText(identity.account),
];

const fingerprintOf = (identity) => sha256Hex(encode(normalized(identity)));

function legacyStableKey(identity) {
  const [date, , amount, currency] = normalized(identity);
  return encode([date, amount, currency]);
}

function normalizeDate(value) {
  const clean = value.trim().replaceAll('T', ' ');
  return clean.length >= 16 && clean[10] === ' ' ? clean.slice(0, 16) : clean;
}

const normalizeText = (value) => value.trim().toLowerCase().replace(/[ \t\n\x0B\f\r]+/g, ' ');

const encode = (parts) => parts.map((p) => `${p.length}:${p}`).join('|');

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}
