// Number helpers that reproduce the JVM's rounding and formatting, so amounts read exactly as the
// Android app writes them.

/** Kotlin's roundToLong()/roundToInt() (Java Math.round): ties go toward positive infinity. */
export const roundHalfUp = (x) => Math.floor(x + 0.5);

/** `(x * 100).roundToLong() / 100.0`, the app's round2. */
export const round2 = (x) => roundHalfUp(x * 100) / 100;

/** Long.toStringWithCommas() from TelegramNotifier: reversed, chunked by 3, joined, reversed. */
export function withCommas(long) {
  const reversed = [...String(long)].reverse().join('');
  const chunks = reversed.match(/.{1,3}/g) ?? [];
  return [...chunks.join(',')].reverse().join('');
}

/** Plain decimal digits of a non-negative finite number, without exponent notation. */
function plainDigits(x) {
  const s = String(x);
  if (!/e/i.test(s)) return s;
  if (x >= 1e21) return BigInt(x).toString();
  return x.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}

function incrementDigits(digits) {
  const out = [...digits];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] === '9') {
      out[i] = '0';
    } else {
      out[i] = String(+out[i] + 1);
      return out.join('');
    }
  }
  return '1' + out.join('');
}

/**
 * Rounds a plain decimal string to [scale] fraction digits. [mode] is 'HALF_EVEN' (NumberFormat's
 * default) or 'HALF_UP' (BigDecimal.setScale in the de-duplicator). Ties are decided on the shortest
 * decimal form of the double, which matches the JVM for every amount the demo can produce.
 */
function roundPlain(plain, scale, mode) {
  const [intPart, frac = ''] = plain.split('.');
  if (frac.length <= scale) return { intPart, frac: frac.padEnd(scale, '0') };
  const kept = frac.slice(0, scale);
  const first = frac[scale];
  const tail = frac.slice(scale + 1);
  let up;
  if (first > '5') up = true;
  else if (first < '5') up = false;
  else if (/[1-9]/.test(tail)) up = true;
  else if (mode === 'HALF_UP') up = true;
  else {
    const last = scale > 0 ? kept[kept.length - 1] : intPart[intPart.length - 1];
    up = +last % 2 === 1;
  }
  let digits = intPart + kept;
  if (up) digits = incrementDigits(digits);
  const cut = digits.length - scale;
  return { intPart: digits.slice(0, cut) || '0', frac: digits.slice(cut) };
}

const group = (intPart) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * NumberFormat.getNumberInstance(Locale.US) with minimumFractionDigits 0 and the given maximum:
 * grouping commas, HALF_EVEN, and a minus sign even when a small negative rounds to zero.
 */
export function formatGrouped(value, maxFractionDigits) {
  const negative = value < 0 || Object.is(value, -0);
  const { intPart, frac } = roundPlain(plainDigits(Math.abs(value)), maxFractionDigits, 'HALF_EVEN');
  const trimmed = frac.replace(/0+$/, '');
  return `${negative ? '-' : ''}${group(intPart)}${trimmed ? '.' + trimmed : ''}`;
}

/** BigDecimal.valueOf(value).setScale(2, HALF_UP).toPlainString(). */
export function scale2HalfUp(value) {
  const negative = value < 0;
  const { intPart, frac } = roundPlain(plainDigits(Math.abs(value)), 2, 'HALF_UP');
  const zero = /^0+$/.test(intPart) && /^0*$/.test(frac);
  return `${negative && !zero ? '-' : ''}${intPart}.${frac}`;
}
