// Workspace model for the Recon Desk: which vendor ledgers have been received, the upload jobs,
// sign-offs, and how bridge lines roll up into annexures. The matching itself lives in engine.ts.

import { generate, type LabData, type Row } from './data';
import { normName, parseAmount, parseDate, type BridgeItem, type Category, type Result } from './engine';

// ---------- Annexures ----------
// Every bridge line lands in exactly one annexure, so the annexures of a vendor always add up to its difference.
export const ANNEXURES = [
  { id: 'I', group: 'Invoice', title: 'Invoice in transit', sub: 'Booked by vendor at period end, buyer accounts next period' },
  { id: 'II', group: 'Invoice', title: 'Invoice not accounted by buyer', sub: 'On vendor statement, missing from buyer ledger' },
  { id: 'III', group: 'Invoice', title: 'Invoice amount difference', sub: 'Same invoice, different value or tax' },
  { id: 'IV', group: 'Invoice', title: 'Invoice not accounted by vendor', sub: 'In buyer ledger, missing from vendor statement' },
  { id: 'V', group: 'Credit / debit notes', title: 'CN–DN differences', sub: 'Credit and debit notes on one side only, or valued differently' },
  { id: 'VI', group: 'Payments', title: 'Payment not accounted by vendor', sub: 'Paid by buyer, not credited by vendor' },
  { id: 'VII', group: 'Payments', title: 'Payment amount mismatch', sub: 'Same payment, different value' },
  { id: 'VIII', group: 'Payments', title: 'Receipt not accounted by buyer', sub: 'Credited by vendor, incl. on-account receipts' },
  { id: 'IX', group: 'Pending', title: 'Suggested matches', sub: 'Probable matches awaiting reviewer confirmation' },
  { id: 'X', group: 'Others', title: 'Others', sub: 'Duplicates, wrong-vendor postings, opening balance' },
] as const;
export type AnnexId = typeof ANNEXURES[number]['id'];
const OTHER_CATS = new Set<Category>(['Duplicate invoice', 'Incorrect vendor allocation', 'Unclassified exception']);

export function annexureOf(b: BridgeItem, cat: Category | undefined): AnnexId {
  if (b.bucket === 'Probable matches pending confirmation') return 'IX';
  if (cat && OTHER_CATS.has(cat)) return 'X';
  if (b.docClass === 'OB') return 'X';
  if (b.docClass === 'CN' || b.docClass === 'DN') return 'V';
  if (b.docClass === 'INV') return b.origin === 'matched' ? 'III' : b.origin === 'buyer' ? 'IV' : b.bucket === 'Timing differences' ? 'I' : 'II';
  return b.origin === 'matched' ? 'VII' : b.origin === 'buyer' ? 'VI' : 'VIII';
}

export type Annex = Record<AnnexId, number>;
export const emptyAnnex = (): Annex => Object.fromEntries(ANNEXURES.map(a => [a.id, 0])) as Annex;
export function annexByVendor(r: Result): Map<string, { annex: Annex; lines: Record<AnnexId, BridgeItem[]> }> {
  const cat = new Map(r.exceptions.map(e => [e.key, e.category]));
  const out = new Map<string, { annex: Annex; lines: Record<AnnexId, BridgeItem[]> }>();
  r.bridge.forEach(b => {
    let v = out.get(b.vendorId);
    if (!v) { v = { annex: emptyAnnex(), lines: Object.fromEntries(ANNEXURES.map(a => [a.id, []])) as unknown as Record<AnnexId, BridgeItem[]> }; out.set(b.vendorId, v); }
    const a = annexureOf(b, cat.get(b.exceptionKey));
    v.annex[a] = Math.round((v.annex[a] + b.amount) * 100) / 100; v.lines[a].push(b);
  });
  return out;
}

// ---------- Upload jobs, sign-offs ----------
export type VendorStatus = 'Ledger not received' | 'Open items in discussion' | 'Signed off';
export interface SignOff { by: string; at: string }
export interface Job {
  id: string; vendorId: string; fileName: string; uploadedBy: string; uploadedAt: string; from: string; to: string; comments: string;
  rows: Row[]; priorClosing: number; currentOpening: number | null; actionedBy: string; source: 'vendor portal' | 'reviewer upload';
}
export interface Workspace {
  data: LabData;                       // statement rows hold only ledgers that have been received
  held: Record<string, Row[]>;         // vendor statements not yet received (used as the sample file)
  received: string[];
  jobs: Job[];
  vendorSign: Record<string, SignOff>; buyerSign: Record<string, SignOff>;
  requested: Record<string, string>;   // statement reminders sent, by vendor
  activity: Act[];                     // audit trail, newest first
}
export type ActKind = 'upload' | 'match' | 'exception' | 'signoff' | 'comment' | 'reminder';
export interface Act { id: number; at: string; who: string; kind: ActKind; what: string; vendorId?: string; exceptionKey?: string; text?: string }
let actSeq = 1000;
export const act = (a: Omit<Act, 'id' | 'at' | 'who'> & { who?: string; at?: string }): Act => ({ id: actSeq++, at: a.at ?? stamp(), who: a.who ?? ME, ...a });
export const actTime = (at: string) => Date.parse(at.replace(/-/g, ' ')) || 0;
export const ME = 'You · AP reviewer';
/** Current time as DD-Mon-YYYY HH:MM, the format used for uploads and sign-offs. */
export const stamp = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-GB', { month: 'short' })}-${d.getFullYear()} ${d.toTimeString().slice(0, 5)}`; };
export const PERIOD = { label: "Apr'26 – Jun'26", quarter: 'Q1 FY27', months: ['Apr-26', 'May-26', 'Jun-26'] };
export const ENTITY = 'Meridian Consumer Products';

const statementDs = (d: LabData) => d.datasets.find(x => x.key === 'statement')!;
const ledgerDs = (d: LabData) => d.datasets.find(x => x.key === 'ledger')!;

/** Statement rows that belong to a vendor: by vendor ID, or by a known name alias when the ID is blank. */
export function statementRowsOf(d: LabData, vendorId: string, rows = statementDs(d).rows): Row[] {
  const alias = new Map(d.aliases.map(a => [normName(a.alias), a.vendorId]));
  return rows.filter(r => { const id = (r['Vendor ID'] ?? '').trim(); return id ? id === vendorId : alias.get(normName(r['Supplier Name'] ?? '')) === vendorId; });
}
/** Opening balance agreed at the start of the period, from the buyer's own ledger. */
export function agreedOpening(d: LabData, vendorId: string): number {
  const ob = ledgerDs(d).rows.find(r => r['Vendor ID'] === vendorId && r['Transaction Type'] === 'Opening Balance');
  return ob ? parseAmount(ob['Gross Invoice Amount']) ?? 0 : 0;
}
export function statementOpening(rows: Row[]): number | null {
  const ob = rows.find(r => (r['Document Type'] ?? '').trim() === 'Opening Balance');
  const v = ob ? parseAmount(ob['Invoice Amount']) : null; return v === null || isNaN(v) ? null : v;
}
/** Buyer-side closing balance straight from the ledger (used for vendors that are not reconciled yet). */
export function ledgerBalance(d: LabData, vendorId: string): number {
  return Math.round(ledgerDs(d).rows.filter(r => r['Vendor ID'] === vendorId).reduce((s, r) => { const a = parseAmount(r['Gross Invoice Amount']) ?? 0; return s + ((r['Debit/Credit'] ?? '').trim().toLowerCase().startsWith('d') ? -a : a); }, 0) * 100) / 100;
}

const SEEDED_UPLOADS: Record<string, [string, string]> = {
  V001: ['03-Jul-2026 10:12', 'Vendor portal · Kaveri AR desk'], V002: ['03-Jul-2026 16:40', 'Vendor portal · Deccan accounts'], V003: ['04-Jul-2026 09:05', 'Vendor portal · Sahyadri finance'],
  V004: ['04-Jul-2026 11:48', 'Vendor portal · Nandi billing'], V005: ['05-Jul-2026 14:22', 'Vendor portal · Coromandel AR'], V006: ['06-Jul-2026 12:30', 'Emailed statement · Malnad Print Works'],
  V007: ['06-Jul-2026 17:55', 'Vendor portal · Arabian Sea Glass'], V008: ['07-Jul-2026 10:03', 'Vendor portal · Hampi accounts'], V009: ['07-Jul-2026 15:16', 'Vendor portal · Vindhya AR'],
};
const NOT_RECEIVED = ['V010'];

export function initialWorkspace(): Workspace {
  const full = generate();
  const st = statementDs(full);
  const held: Record<string, Row[]> = {};
  NOT_RECEIVED.forEach(v => { held[v] = statementRowsOf(full, v); });
  const heldSet = new Set(Object.values(held).flat());
  const data: LabData = { ...full, datasets: full.datasets.map(ds => ds === st ? { ...ds, rows: ds.rows.filter(r => !heldSet.has(r)) } : ds) };
  const received = full.suppliers.map(s => s.id).filter(id => !NOT_RECEIVED.includes(id));
  const jobs: Job[] = received.map((v, i) => {
    const rows = statementRowsOf(data, v); const [at, by] = SEEDED_UPLOADS[v];
    return { id: `JB-${2711 + i * 3}`, vendorId: v, fileName: `${v}_statement_Q1FY27.csv`, uploadedBy: by, uploadedAt: at, from: 'Apr-26', to: 'Jun-26', comments: '', rows, priorClosing: agreedOpening(data, v), currentOpening: statementOpening(rows), actionedBy: 'AP team', source: 'vendor portal' };
  });
  const vendorSign = { V003: { by: 'Sahyadri finance (vendor)', at: '18-Jul-2026 11:20' }, V008: { by: 'Hampi accounts (vendor)', at: '16-Jul-2026 15:42' } };
  const buyerSign = { V008: { by: 'AP team (buyer)', at: '17-Jul-2026 10:05' } };
  const requested = { V010: '08-Jul-2026 09:30' };
  const activity: Act[] = [
    ...jobs.map(j => act({ at: j.uploadedAt, who: j.uploadedBy, kind: 'upload', vendorId: j.vendorId, what: `Statement received (${j.rows.length} rows) and reconciled automatically` })),
    ...Object.entries(vendorSign).map(([v, x]) => act({ at: x.at, who: x.by, kind: 'signoff', vendorId: v, what: 'Vendor signed off the reconciliation' })),
    ...Object.entries(buyerSign).map(([v, x]) => act({ at: x.at, who: x.by, kind: 'signoff', vendorId: v, what: 'Buyer signed off the reconciliation' })),
    act({ at: requested.V010, who: 'AP team', kind: 'reminder', vendorId: 'V010', what: 'Statement of account requested from vendor' }),
  ].sort((a, b) => actTime(b.at) - actTime(a.at));
  return { data, held, received, jobs, vendorSign, buyerSign, requested, activity };
}

/** The data the engine reconciles: only vendors whose ledger has been received. */
export function activeData(ws: Workspace): LabData {
  const keep = new Set(ws.received);
  return { ...ws.data, suppliers: ws.data.suppliers.filter(s => keep.has(s.id)), datasets: ws.data.datasets.map(ds => ds.key === 'statement' ? ds : { ...ds, rows: ds.rows.filter(r => keep.has((r['Vendor ID'] ?? '').trim())) }) };
}

export function vendorStatus(ws: Workspace, vendorId: string): VendorStatus {
  if (!ws.received.includes(vendorId)) return 'Ledger not received';
  return ws.vendorSign[vendorId] && ws.buyerSign[vendorId] ? 'Signed off' : 'Open items in discussion';
}

// ---------- CSV upload with column mapping ----------
export const STATEMENT_COLUMNS = ['Supplier Transaction ID', 'Vendor ID', 'Supplier Name', 'Document Type', 'Supplier Invoice Number', 'Invoice Date', 'Statement Date', 'Purchase Order Reference', 'Invoice Amount', 'Taxable Amount', 'Tax Amount', 'Credit Note Reference', 'Debit Note Reference', 'Payment Received', 'Outstanding Balance', 'Currency', 'Description'];

/** RFC 4180 CSV: quoted fields, escaped quotes, commas and line breaks inside quotes. */
export function parseCSV(text: string): { columns: string[]; rows: Row[] } {
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

// Fields the engine reads from a vendor statement, with the header names vendors commonly use for them.
export const FIELDS: { key: string; label: string; required?: boolean; hints: string[] }[] = [
  { key: 'Document Type', label: 'Document type', required: true, hints: ['document type', 'doc type', 'voucher type', 'vch type', 'transaction type', 'type'] },
  { key: 'Invoice Date', label: 'Document date', required: true, hints: ['invoice date', 'document date', 'doc date', 'voucher date', 'posting date', 'date'] },
  { key: 'Supplier Invoice Number', label: 'Invoice number', hints: ['supplier invoice number', 'invoice number', 'invoice no', 'inv no', 'bill no', 'document number', 'doc no', 'voucher no'] },
  { key: 'Invoice Amount', label: 'Debit · invoice amount', hints: ['invoice amount', 'debit', 'dr amount', 'dr', 'bill amount', 'gross amount'] },
  { key: 'Payment Received', label: 'Credit · receipts and notes', hints: ['payment received', 'credit', 'cr amount', 'cr', 'receipt amount', 'received'] },
  { key: 'Credit Note Reference', label: 'Credit note number', hints: ['credit note reference', 'credit note no', 'credit note number', 'cn no', 'cn number'] },
  { key: 'Debit Note Reference', label: 'Debit note number', hints: ['debit note reference', 'debit note no', 'debit note number', 'dn no', 'dn number'] },
  { key: 'Supplier Transaction ID', label: 'Line ID', hints: ['supplier transaction id', 'transaction id', 'txn id', 'line id', 'entry id'] },
  { key: 'Taxable Amount', label: 'Taxable value', hints: ['taxable amount', 'taxable value', 'assessable value'] },
  { key: 'Tax Amount', label: 'Tax (GST)', hints: ['tax amount', 'gst amount', 'gst', 'tax'] },
  { key: 'Purchase Order Reference', label: 'PO number', hints: ['purchase order reference', 'po number', 'po no', 'purchase order', 'po'] },
  { key: 'Supplier Name', label: 'Vendor name', hints: ['supplier name', 'vendor name', 'party name', 'name'] },
  { key: 'Currency', label: 'Currency', hints: ['currency', 'ccy'] },
  { key: 'Description', label: 'Narration', hints: ['description', 'narration', 'particulars', 'remarks'] },
];
export type Mapping = Record<string, string>; // field key → file column ('' = not in file)
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Exact header first, then known synonyms, never using one column twice. */
export function autoMap(columns: string[]): Mapping {
  const used = new Set<string>(); const m: Mapping = {};
  const take = (f: string, c: string | undefined) => { if (c && !used.has(c) && !m[f]) { m[f] = c; used.add(c); } };
  FIELDS.forEach(f => take(f.key, columns.find(c => norm(c) === norm(f.key))));
  FIELDS.forEach(f => f.hints.forEach(h => take(f.key, columns.find(c => !used.has(c) && norm(c) === h))));
  FIELDS.forEach(f => f.hints.filter(h => h.length > 3).forEach(h => take(f.key, columns.find(c => !used.has(c) && norm(c).includes(h)))));
  FIELDS.forEach(f => { if (!m[f.key]) m[f.key] = ''; });
  return m;
}
// Document type values as vendors write them → the engine's names.
const DOC_SYNONYMS: Record<string, string> = {
  'invoice': 'Invoice', 'tax invoice': 'Invoice', 'inv': 'Invoice', 'bill': 'Invoice', 'sales invoice': 'Invoice', 'sales': 'Invoice',
  'credit note': 'Credit Note', 'cn': 'Credit Note', 'credit memo': 'Credit Note',
  'debit note': 'Debit Note', 'dn': 'Debit Note', 'debit memo': 'Debit Note',
  'receipt': 'Receipt', 'payment': 'Receipt', 'payment received': 'Receipt', 'rcpt': 'Receipt', 'bank receipt': 'Receipt',
  'on account receipt': 'On-account Receipt', 'advance': 'On-account Receipt', 'advance receipt': 'On-account Receipt',
  'opening balance': 'Opening Balance', 'ob': 'Opening Balance', 'opening': 'Opening Balance', 'balance b f': 'Opening Balance', 'balance brought forward': 'Opening Balance',
};

export interface Prepared { rows: Row[]; errors: string[]; warnings: string[]; opening: number | null; setAside: { row: number; reason: string }[]; typeFixes: number; generatedIds: number; byType: Record<string, number> }
export function prepareUpload(vendorId: string, columns: string[], raw: Row[], m: Mapping): Prepared {
  const errors: string[] = [], warnings: string[] = [], setAside: Prepared['setAside'] = [];
  const missing = FIELDS.filter(f => f.required && !m[f.key]).map(f => f.label);
  if (!columns.length) errors.push('The file is empty.');
  else if (missing.length) errors.push(`Map a column for: ${missing.join(', ')}.`);
  if (columns.length && !raw.length) errors.push('The file has a header row but no transactions.');
  if (!m['Invoice Amount'] && !m['Payment Received']) errors.push('Map at least one amount column (debit or credit).');
  const vCol = columns.find(c => norm(c) === 'vendor id');
  const others = vCol ? [...new Set(raw.map(r => (r[vCol] ?? '').trim()).filter(x => x && x !== vendorId))] : [];
  if (others.length) errors.push(`Rows belong to another vendor (${others.join(', ')}). Upload one vendor's statement at a time.`);
  let typeFixes = 0, generatedIds = 0; const byType: Record<string, number> = {};
  const rows = raw.map((r, i) => {
    const o: Row = Object.fromEntries(STATEMENT_COLUMNS.map(c => [c, ''])) as Row;
    FIELDS.forEach(f => { if (m[f.key]) o[f.key] = r[m[f.key]] ?? ''; });
    const t = o['Document Type'].trim(); const canon = DOC_SYNONYMS[norm(t)] ?? t;
    if (canon !== t) typeFixes++;
    o['Document Type'] = canon; byType[canon || '(blank)'] = (byType[canon || '(blank)'] ?? 0) + 1;
    if (!o['Supplier Transaction ID'].trim()) { o['Supplier Transaction ID'] = `${vendorId}-UP-${String(i + 1).padStart(4, '0')}`; generatedIds++; }
    o['Vendor ID'] = vendorId;
    // Pre-check the rows the engine will set aside, so the reviewer sees it before uploading.
    const known = ['Invoice', 'Credit Note', 'Debit Note', 'Receipt', 'On-account Receipt', 'Opening Balance'].includes(canon);
    const d = parseDate(o['Invoice Date']); const isDebit = canon === 'Invoice' || canon === 'Opening Balance';
    const a = parseAmount(isDebit ? o['Invoice Amount'] : o['Payment Received']);
    const reason = !known ? `Unknown document type "${t || 'blank'}"` : d === null ? 'Date missing' : isNaN(d) ? `Date "${o['Invoice Date']}" is not valid` : a === null ? 'Amount missing' : isNaN(a) ? 'Amount is not a number' : '';
    if (reason) setAside.push({ row: i + 2, reason });
    return o;
  });
  if (!byType['Opening Balance']) warnings.push('No opening balance row, so the balance check cannot compare it with the agreed closing.');
  if (setAside.length) warnings.push(`${setAside.length} row${setAside.length > 1 ? 's' : ''} will be set aside with a reason; the rest are reconciled.`);
  return { rows, errors, warnings, opening: statementOpening(rows), setAside, typeFixes, generatedIds, byType };
}

export function applyUpload(ws: Workspace, vendorId: string, rows: Row[], meta: { fileName: string; from: string; to: string; comments: string }): Workspace {
  const st = statementDs(ws.data);
  const old = new Set(statementRowsOf(ws.data, vendorId));
  const data: LabData = { ...ws.data, datasets: ws.data.datasets.map(ds => ds === st ? { ...ds, rows: [...ds.rows.filter(r => !old.has(r)), ...rows] } : ds) };
  const n = ws.jobs.reduce((m, j) => Math.max(m, Number(j.id.slice(3))), 2700) + 1;
  const job: Job = { id: `JB-${n}`, vendorId, ...meta, uploadedBy: ME, uploadedAt: stamp(), rows, priorClosing: agreedOpening(ws.data, vendorId), currentOpening: statementOpening(rows), actionedBy: ME, source: 'reviewer upload' };
  const { [vendorId]: _v, ...vendorSign } = ws.vendorSign; const { [vendorId]: _b, ...buyerSign } = ws.buyerSign; // a new ledger reopens the sign-off
  const note = act({ kind: 'upload', vendorId, what: `Statement uploaded (${rows.length} rows, ${meta.fileName}) and reconciled${ws.vendorSign[vendorId] || ws.buyerSign[vendorId] ? '; earlier sign-off withdrawn' : ''}` });
  return { ...ws, data, jobs: [job, ...ws.jobs], received: ws.received.includes(vendorId) ? ws.received : [...ws.received, vendorId], vendorSign, buyerSign, activity: [note, ...ws.activity] };
}

/** The file offered as "sample": the held-back statement for a vendor not yet received, else its current statement. */
export function sampleRows(ws: Workspace, vendorId: string): Row[] {
  return ws.held[vendorId] ?? statementRowsOf(ws.data, vendorId);
}
