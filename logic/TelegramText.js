// Mirrors the message-building half of importer/TelegramNotifier.kt (its companion object). The web
// copy never sends anything: Finish shows these messages, as demo mode does.

import { Refunds } from './Refunds.js';
import { ifBlank, isBlank } from './strings.js';
import { compareStrings } from './dates.js';
import { roundHalfUp, withCommas } from './numbers.js';

export const DEFAULT_MAX_MESSAGE_CHARS = 3_500;

/** A row the group chat hears about: a split she owes on, or a deducted refund owed back to her. */
export const isNotifiable = (tx) => tx.gfAmount > 0 && (!tx.skipped || Refunds.isDeducted(tx));

/** The messages Finish would send for a fresh batch of [txs], in order. */
export function previewMessages(txs, purchases = new Map(), maxMessageChars = DEFAULT_MAX_MESSAGE_CHARS) {
  const rows = splitNotificationOrder(txs.filter(isNotifiable));
  if (rows.length === 0) return [];
  const messages = splitNotificationChunks(rows, maxMessageChars, purchases).map((c) => c.text);
  return rows.length >= 2 ? [...messages, splitTotalText(rows)] : messages;
}

/** Oldest first, except that refunds owed back to her follow every split she owes on. */
export function splitNotificationOrder(txs) {
  return [...txs].sort(
    (a, b) =>
      Number(Refunds.isDeducted(a)) - Number(Refunds.isDeducted(b)) ||
      compareStrings(notificationSortKey(a.date), notificationSortKey(b.date)) ||
      a.idx - b.idx ||
      a.id - b.id,
  );
}

export function splitNotificationText(tx) {
  const label = escapeHtml(ifBlank(tx.subcategory, tx.category));
  const suffix = isBlank(label) ? '' : ` [${label}]`;
  const whenText = escapeHtml(formatTxDate(tx.date));
  const prefix = isBlank(whenText) ? '' : `${whenText} - `;
  const herAmount = withCommas(roundHalfUp(tx.gfAmount));
  const transactionAmount = withCommas(roundHalfUp(Math.abs(tx.amount)));
  const currency = escapeHtml(ifBlank(tx.currency, 'KRW'));
  const note = escapeHtml(tx.note);
  return `${prefix}${note}${suffix} - <b>${herAmount} ${currency}</b> (total: ${transactionAmount} ${currency})`;
}

/** Her part of a refund on a split she was already told about, naming the purchase it paid back. */
export function refundNotificationText(refund, purchase) {
  const about = purchase ?? refund;
  const label = escapeHtml(ifBlank(about.subcategory, about.category));
  const suffix = isBlank(label) ? '' : ` [${label}]`;
  const whenText = escapeHtml(formatTxDate(refund.date));
  const prefix = isBlank(whenText) ? '' : `${whenText} - `;
  const back = withCommas(roundHalfUp(refund.gfAmount));
  const refunded = withCommas(roundHalfUp(Math.abs(refund.amount)));
  const currency = escapeHtml(ifBlank(refund.currency, 'KRW'));
  const note = escapeHtml(refund.note.includes(' — ') ? refund.note : about.note);
  return `${prefix}Refund: ${note}${suffix} - I'll send you back <b>${back} ${currency}</b> (refund: ${refunded} ${currency})`;
}

/** The batch settled in one transfer, per currency: what she owes less what refunds owe back to her. */
export function splitTotalText(txs) {
  const sums = new Map();
  for (const t of txs) {
    const currency = ifBlank(t.currency, 'KRW');
    const signed = Refunds.isDeducted(t) ? -t.gfAmount : t.gfAmount;
    sums.set(currency, (sums.get(currency) ?? 0) + signed);
  }
  const nets = [...sums];
  const owed = nets.filter(([, sum]) => sum >= 0.5).sort((a, b) => b[1] - a[1]);
  const back = nets.filter(([, sum]) => sum <= -0.5).sort((a, b) => a[1] - b[1]);
  const amounts = (list) =>
    list.map(([currency, sum]) => `${withCommas(roundHalfUp(Math.abs(sum)))} ${escapeHtml(currency)}`).join(' + ');
  if (owed.length === 0 && back.length === 0) return 'Nothing to send: the refunds cover it';
  if (back.length === 0) return `Total to send: <b>${amounts(owed)}</b>`;
  if (owed.length === 0) return `Total I'll send you: <b>${amounts(back)}</b>`;
  return `Total to send: <b>${amounts(owed)}</b> · I'll send you: <b>${amounts(back)}</b>`;
}

export function formatTxDate(date) {
  const clean = date.trim();
  if (clean === '') return '';
  if (!clean.includes(' ')) return clean;
  const datePart = clean.slice(0, clean.indexOf(' '));
  const time = clean.slice(clean.indexOf(' ') + 1).trim().slice(0, 5);
  return `${datePart} ${time}`.trim();
}

const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const notificationLine = (tx, purchases) =>
  Refunds.isDeducted(tx) ? refundNotificationText(tx, purchases.get(tx.refundOf) ?? null) : splitNotificationText(tx);

function splitNotificationChunks(rows, maxChars, purchases) {
  const rowSeparator = '\n\n';
  const chunks = [];
  let chunkRows = [];
  let chunkText = '';
  const flush = () => {
    if (chunkRows.length === 0) return;
    chunks.push({ rows: chunkRows, text: chunkText });
    chunkRows = [];
    chunkText = '';
  };
  for (const tx of rows) {
    const line = notificationLine(tx, purchases);
    const extraChars = line.length + (chunkText === '' ? 0 : rowSeparator.length);
    const last = chunkRows[chunkRows.length - 1];
    // A refund owed back to her never shares a message with a split she owes on.
    const otherKind = last !== undefined && Refunds.isDeducted(last) !== Refunds.isDeducted(tx);
    if (otherKind || (chunkRows.length > 0 && chunkText.length + extraChars > maxChars)) flush();
    if (chunkText !== '') chunkText += rowSeparator;
    chunkText += line;
    chunkRows.push(tx);
  }
  flush();
  return chunks;
}

const notificationSortKey = (date) => ifBlank(date.trim().replaceAll('T', ' '), '9999-99-99 99:99:99');
