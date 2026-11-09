/** RFC 4180 CSV: quoted fields, escaped quotes, commas and line breaks inside quotes. */
export function parseCSV(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const out: string[][] = []; let row: string[] = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  const lines = out.filter(r => r.some(x => x.trim()));
  if (!lines.length) return { columns: [], rows: [] };
  const columns = lines[0].map(c => c.trim());
  return { columns, rows: lines.slice(1).map(r => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? '']))) };
}
