/** Formatting helpers shared by UI, AI and reports (pure; no DOM). */

/** PKR in rupees → 'PKR 12.40 bn' / 'PKR 350 m' / 'PKR 12,500'. */
export function fmtPKR(v, digits = 2) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}PKR ${(a / 1e9).toFixed(digits)} bn`;
  if (a >= 1e6) return `${s}PKR ${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)} m`;
  return `${s}PKR ${Math.round(a).toLocaleString('en-US')}`;
}

/** PKR billions as a bare number string: 12.4 */
export function bn(v, digits = 2) {
  return Number.isFinite(v) ? (v / 1e9).toFixed(digits) : '—';
}

export function fmtIndex(v, digits = 2) {
  return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

export function fmtPercent(v, digits = 0) {
  return Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : '—';
}

export function fmtDayCount(v) {
  if (!Number.isFinite(v)) return '—';
  const n = Math.round(v);
  return Math.abs(n) >= 730 ? `${(n / 365).toFixed(1)} yr` : `${n} d`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Mon 04 Jan 2027' from a UTC Date. */
export function fmtDate(d) {
  return `${DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}
