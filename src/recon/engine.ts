// Normalisation and export utilities shared by the reconciliation engine (cycle.ts).
// Original source values are never changed: these functions only derive normalised copies.

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseDate(raw: string): number | null {
  const s = (raw ?? '').trim(); if (!s) return null;
  let d: number, m: number, y: number, x: RegExpExecArray | null;
  if ((x = /^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/.exec(s))) { d = +x[1]; m = MON.indexOf(x[2].toUpperCase()); y = +x[3]; }
  else if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +x[1]; m = +x[2] - 1; d = +x[3]; }
  else if ((x = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s))) { d = +x[1]; m = +x[2] - 1; y = +x[3]; }
  else return NaN;
  if (m < 0 || m > 11) return NaN;
  const ms = Date.UTC(y, m, d); const c = new Date(ms);
  return c.getUTCDate() === d && c.getUTCMonth() === m ? ms : NaN;
}
export function parseAmount(raw: string): number | null {
  let s = (raw ?? '').trim(); if (!s) return null;
  const neg = /^\(.*\)$/.test(s); s = s.replace(/[()]/g, '').replace(/₹|rs\.?|inr|,|\s/gi, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return r2((neg ? -1 : 1) * parseFloat(s));
}
/** Matching key for document numbers: case, separators and leading zeros are ignored. "KPL/26-27/0045" → "KPL262745". */
export function normRef(raw: string): string {
  return ((raw ?? '').toUpperCase().match(/[A-Z]+|\d+/g) || []).map(t => (/^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t)).join('');
}
export function normName(raw: string): string {
  return (raw ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\bprivate\b/g, 'pvt').replace(/\blimited\b/g, 'ltd').replace(/\s+/g, ' ').trim();
}

// ---------- CSV export ----------
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}
