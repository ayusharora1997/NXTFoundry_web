// Reconciliation engine for the Reconciliation Lab.
// Deterministic and UI-independent: the same inputs, settings and user decisions always give the same output.
// Sign convention: variance = buyer payable balance − supplier reported receivable balance.
// Positive → the buyer records a higher payable than the supplier reports.

import type { LabData, Row } from './data';
import { fmtDate } from './data';

const DAY = 86400000;
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Settings ----------
export interface Settings {
  dateTolerance: number;   // days, for Level 2 and Level 3 matching
  amountTolerance: number; // INR, for Level 3 and duplicate checks
  transitDays: number;     // documents this close to period end are treated as timing differences
  critical: number; high: number; medium: number; // severity thresholds on potential impact (INR)
  nonPoVendors: string[];  // vendors whose invoices are allowed without a PO
}
export const DEFAULT_SETTINGS: Settings = { dateTolerance: 7, amountTolerance: 1, transitDays: 5, critical: 500000, high: 100000, medium: 25000, nonPoVendors: ['V004', 'V008'] };

// ---------- Normalization ----------
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

export type DocClass = 'OB' | 'INV' | 'CN' | 'DN' | 'PAY';
export const DOC_LABEL: Record<DocClass, string> = { OB: 'Opening balance', INV: 'Invoice', CN: 'Credit note', DN: 'Debit note', PAY: 'Payment' };

export interface Rec {
  side: 'buyer' | 'supplier'; id: string; vendorId: string; vendorVia: 'id' | 'alias';
  docClass: DocClass; docType: string; rawRef: string; ref: string; date: number;
  amount: number;          // signed effect on that side's balance (+ increases payable/receivable)
  taxable: number | null; tax: number | null; currency: string;
  po: string; grn: string; qty: number | null; rate: number | null;
  payRef: string; invRef: string; onAccount: boolean; description: string; raw: Row;
}
export interface QualityRow { dataset: string; received: number; accepted: number; rejected: number; duplicates: number; missing: number; invalidDates: number; invalidAmounts: number; changes: number }
export interface Change { dataset: string; recordId: string; field: string; raw: string; normalized: string }
export interface Rejection { dataset: string; recordId: string; reasons: string[] }
export interface PO { no: string; vendorId: string; rate: number; approved: number; status: string }
export interface GRN { no: string; po: string; vendorId: string; accepted: number; value: number }
export interface Payment { ref: string; vendorId: string; date: number; invRef: string; amount: number; utr: string }

interface Normalized { buyer: Rec[]; supplier: Rec[]; pos: Map<string, PO>; grns: Map<string, GRN>; grnByPo: Map<string, GRN>; payments: Payment[]; quality: QualityRow[]; changes: Change[]; rejections: Rejection[] }

function normalize(data: LabData): Normalized {
  const quality: QualityRow[] = [], changes: Change[] = [], rejections: Rejection[] = [];
  const ds = (k: string) => data.datasets.find(d => d.key === k)!;
  const alias = new Map(data.aliases.map(a => [normName(a.alias), a.vendorId]));
  const known = new Set(data.suppliers.map(s => s.id));

  function run<T>(key: string, idField: string, fn: (r: Row, q: QualityRow, log: (f: string, raw: string, n: string) => void, reasons: string[]) => T | null): T[] {
    const d = ds(key); const q: QualityRow = { dataset: d.title, received: d.rows.length, accepted: 0, rejected: 0, duplicates: 0, missing: 0, invalidDates: 0, invalidAmounts: 0, changes: 0 };
    const seen = new Set<string>(); const out: T[] = [];
    d.rows.forEach(r => {
      const id = (r[idField] ?? '').trim();
      if (seen.has(id)) { q.duplicates++; rejections.push({ dataset: d.title, recordId: id, reasons: ['Duplicate source row (same transaction ID already imported)'] }); return; }
      seen.add(id);
      const reasons: string[] = [];
      const log = (f: string, raw: string, n: string) => { if (raw !== n) { changes.push({ dataset: d.title, recordId: id, field: f, raw, normalized: n }); q.changes++; } };
      const res = fn(r, q, log, reasons);
      if (res && !reasons.length) { out.push(res); q.accepted++; } else { q.rejected++; rejections.push({ dataset: d.title, recordId: id, reasons }); }
    });
    quality.push(q); return out;
  }
  const date = (raw: string, field: string, q: QualityRow, log: (f: string, r: string, n: string) => void, reasons: string[], required = true) => {
    const v = parseDate(raw);
    if (v === null) { if (required) { q.missing++; reasons.push(`${field} missing`); } return 0; }
    if (isNaN(v)) { q.invalidDates++; reasons.push(`${field} "${raw}" is not a valid date`); return 0; }
    log(field, raw, fmtDate(v)); return v;
  };
  const amt = (raw: string, field: string, q: QualityRow, log: (f: string, r: string, n: string) => void, reasons: string[], required = true) => {
    const v = parseAmount(raw);
    if (v === null) { if (required) { q.missing++; reasons.push(`${field} missing`); } return 0; }
    if (isNaN(v)) { q.invalidAmounts++; reasons.push(`${field} "${raw}" is not a number`); return 0; }
    if (!/^-?\d+(\.\d+)?$/.test(raw.trim())) log(field, raw, v.toFixed(2)); // only log real reformatting (symbols, commas, brackets)
    return v;
  };
  const CLASS: Record<string, DocClass> = { 'Opening Balance': 'OB', Invoice: 'INV', 'Credit Note': 'CN', 'Debit Note': 'DN', Payment: 'PAY', Receipt: 'PAY', 'On-account Receipt': 'PAY' };

  const payments = run<Payment>('payments', 'Payment Reference', (r, q, log, reasons) => {
    const p: Payment = { ref: r['Payment Reference'].trim(), vendorId: r['Vendor ID'].trim(), date: date(r['Payment Date'], 'Payment Date', q, log, reasons), invRef: (r['Invoice Reference'] ?? '').trim(), amount: amt(r['Payment Amount'], 'Payment Amount', q, log, reasons), utr: (r['Bank Reference'] ?? '').trim() };
    return p;
  });
  const utrByPayRef = new Map(payments.map(p => [p.ref, p.utr]));

  const buyer = run<Rec>('ledger', 'Transaction ID', (r, q, log, reasons) => {
    const cls = CLASS[(r['Transaction Type'] ?? '').trim()];
    if (!cls) { reasons.push(`Unknown transaction type "${r['Transaction Type']}"`); return null; }
    const vendorId = (r['Vendor ID'] ?? '').trim();
    if (!known.has(vendorId)) { q.missing++; reasons.push('Vendor ID missing or not in vendor master'); }
    const gross = amt(r['Gross Invoice Amount'], 'Gross Invoice Amount', q, log, reasons);
    const dr = (r['Debit/Credit'] ?? '').trim().toLowerCase().startsWith('d');
    const d = date(cls === 'PAY' ? r['Payment Date'] : r['Invoice Date'], cls === 'PAY' ? 'Payment Date' : 'Invoice Date', q, log, reasons);
    const payRef = (r['Payment Reference'] ?? '').trim();
    let rawRef = (r['Invoice Number'] ?? '').trim();
    if (cls === 'PAY') { rawRef = utrByPayRef.get(payRef) || (/UTR\s*([A-Z0-9]+)/i.exec(r['Description'] ?? '')?.[1] ?? ''); }
    if (!rawRef && cls !== 'PAY') { q.missing++; reasons.push('Invoice / document number missing'); }
    const taxable = parseAmount(r['Taxable Amount']); const tax = ['CGST', 'SGST', 'IGST'].reduce((s, f) => s + (parseAmount(r[f]) || 0), 0);
    return { side: 'buyer', id: r['Transaction ID'].trim(), vendorId, vendorVia: 'id', docClass: cls, docType: r['Transaction Type'], rawRef, ref: normRef(rawRef), date: d, amount: r2(dr ? -gross : gross), taxable: taxable !== null && !isNaN(taxable) ? taxable : null, tax: cls === 'INV' ? r2(tax) : null, currency: (r['Currency'] || 'INR').trim().toUpperCase(), po: (r['Purchase Order Number'] ?? '').trim(), grn: (r['Goods Receipt Number'] ?? '').trim(), qty: parseAmount(r['Quantity']), rate: parseAmount(r['Unit Rate']), payRef, invRef: cls === 'PAY' ? (r['Invoice Number'] ?? '').trim() : '', onAccount: cls === 'PAY' && !(r['Invoice Number'] ?? '').trim(), description: r['Description'] ?? '', raw: r };
  });

  const supplier = run<Rec>('statement', 'Supplier Transaction ID', (r, q, log, reasons) => {
    const docType = (r['Document Type'] ?? '').trim(); const cls = CLASS[docType];
    if (!cls) { reasons.push(`Unknown document type "${docType}"`); return null; }
    const rawName = r['Supplier Name'] ?? ''; const trimmed = rawName.trim(); log('Supplier Name', rawName, trimmed);
    let vendorId = (r['Vendor ID'] ?? '').trim(); let via: 'id' | 'alias' = 'id';
    if (!vendorId) { vendorId = alias.get(normName(trimmed)) ?? ''; via = 'alias'; if (vendorId) log('Vendor ID', '(blank)', `${vendorId} — resolved from alias "${trimmed}"`); }
    if (!known.has(vendorId)) { q.missing++; reasons.push('Supplier could not be matched to the vendor master'); }
    const d = date(r['Invoice Date'], 'Invoice Date', q, log, reasons);
    const debit = cls === 'INV' || cls === 'OB' ? amt(r['Invoice Amount'], 'Invoice Amount', q, log, reasons) : 0;
    const credit = cls === 'INV' || cls === 'OB' ? 0 : amt(r['Payment Received'], 'Payment Received', q, log, reasons);
    const desc = r['Description'] ?? '';
    let rawRef = cls === 'CN' ? r['Credit Note Reference'] : cls === 'DN' ? r['Debit Note Reference'] : cls === 'PAY' ? (/UTR\s*([A-Z0-9]+)/i.exec(desc)?.[1] ?? '') : r['Supplier Invoice Number'];
    rawRef = (rawRef ?? '').trim();
    if (!rawRef) { q.missing++; reasons.push(cls === 'PAY' ? 'Receipt has no bank / UTR reference' : 'Document number missing'); }
    const taxable = parseAmount(r['Taxable Amount']); const tax = parseAmount(r['Tax Amount']);
    return { side: 'supplier', id: r['Supplier Transaction ID'].trim(), vendorId, vendorVia: via, docClass: cls, docType, rawRef, ref: normRef(rawRef), date: d, amount: r2(debit - credit), taxable: taxable !== null && !isNaN(taxable) ? taxable : null, tax: tax !== null && !isNaN(tax) ? tax : null, currency: (r['Currency'] || 'INR').trim().toUpperCase(), po: (r['Purchase Order Reference'] ?? '').trim(), grn: '', qty: null, rate: null, payRef: '', invRef: /against\s+(\S+)/i.exec(desc)?.[1] ?? '', onAccount: docType === 'On-account Receipt', description: desc, raw: r };
  });

  const pos = new Map<string, PO>(); const grns = new Map<string, GRN>(); const grnByPo = new Map<string, GRN>();
  run<PO>('po', 'PO Number', (r, q, log, reasons) => { const p: PO = { no: r['PO Number'].trim(), vendorId: r['Vendor ID'].trim(), rate: amt(r['Unit Price'], 'Unit Price', q, log, reasons), approved: amt(r['Approved Amount'], 'Approved Amount', q, log, reasons), status: r['PO Status'] }; date(r['PO Date'], 'PO Date', q, log, reasons); return p; }).forEach(p => pos.set(p.no, p));
  run<GRN>('grn', 'GRN Number', (r, q, log, reasons) => { const g: GRN = { no: r['GRN Number'].trim(), po: r['PO Number'].trim(), vendorId: r['Vendor ID'].trim(), accepted: amt(r['Accepted Quantity'], 'Accepted Quantity', q, log, reasons), value: amt(r['Receipt Value'], 'Receipt Value', q, log, reasons) }; date(r['Receipt Date'], 'Receipt Date', q, log, reasons); return g; }).forEach(g => { grns.set(g.no, g); grnByPo.set(g.po, g); });
  // Keep a stable dataset order in the report.
  const order = data.datasets.map(d => d.title); quality.sort((a, b) => order.indexOf(a.dataset) - order.indexOf(b.dataset));
  return { buyer, supplier, pos, grns, grnByPo, payments, quality, changes, rejections };
}

// ---------- Matching ----------
export type Confidence = 'Exact match' | 'Strong match' | 'Probable match' | 'Manual match';
export interface Match { key: string; level: 1 | 2 | 3 | 0; confidence: Confidence; rule: string; buyer: Rec; supplier: Rec; diff: number; status: 'auto' | 'pending' | 'confirmed'; timestamp: string }
// reopened: automatic match keys a reviewer has sent back to the unreconciled list.
export interface Decisions { probable: Record<string, 'confirmed' | 'rejected'>; manual: { buyerId: string; supplierId: string }[]; edits: Record<string, ExceptionEdit>; reopened: string[] }
export const EMPTY_DECISIONS: Decisions = { probable: {}, manual: [], edits: {}, reopened: [] };

// ---------- Exceptions ----------
export const CATEGORIES = [
  'Invoice in buyer ledger, missing from supplier statement', 'Invoice in supplier statement, missing from buyer ledger', 'Invoice amount mismatch', 'Tax amount mismatch', 'Duplicate invoice', 'Duplicate payment',
  'Payment recorded by buyer but not supplier', 'Payment recorded by supplier but not buyer', 'Partial payment', 'Credit note missing in buyer ledger', 'Credit note missing in supplier statement', 'Debit note discrepancy',
  'Purchase order amount variance', 'Goods receipt discrepancy', 'Quantity mismatch', 'Price mismatch', 'Incorrect vendor allocation', 'Date or period mismatch', 'Unallocated payment', 'Probable match awaiting confirmation', 'Unclassified exception',
] as const;
export type Category = typeof CATEGORIES[number];
export type Nature = 'Confirmed discrepancy' | 'Potential financial exposure' | 'Timing difference' | 'Data quality issue' | 'Information gap';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type Status = 'Open' | 'Under investigation' | 'Awaiting supplier' | 'Resolved';
export type Resolution = '' | 'Buyer ledger adjustment' | 'Supplier statement correction' | 'Timing difference — clears next period' | 'Explained — no adjustment needed';
export interface ExceptionEdit { status?: Status; owner?: string; notes?: string; resolution?: Resolution }
export interface Exception {
  id: string; key: string; vendorId: string; vendorName: string; category: Category; nature: Nature; subtype: string;
  refs: string[]; buyerAmount: number | null; supplierAmount: number | null; variance: number; ageDays: number; impact: number;
  severity: Severity; status: Status; owner: string; recommendation: string; notes: string; resolution: Resolution; evidence: string[]; records: Rec[];
  balanceEffect: number; // contribution to (buyer − supplier); 0 when both sides agree
}

const OWNER: Partial<Record<Category, string>> = {
  'Purchase order amount variance': 'Procurement', 'Price mismatch': 'Procurement', 'Goods receipt discrepancy': 'Stores', 'Quantity mismatch': 'Stores',
  'Duplicate payment': 'Treasury', 'Payment recorded by buyer but not supplier': 'Treasury', 'Payment recorded by supplier but not buyer': 'Treasury', 'Unallocated payment': 'Treasury', 'Partial payment': 'Treasury',
};
export const OWNERS = ['AP team', 'Procurement', 'Stores', 'Treasury', 'Finance controller'];
const ADVICE: Record<Category, string> = {
  'Invoice in buyer ledger, missing from supplier statement': 'Ask the supplier to confirm whether this invoice was raised. Check the posting for a keying error or a wrong vendor before treating it as a liability.',
  'Invoice in supplier statement, missing from buyer ledger': 'Request a copy of the invoice and proof of delivery. Check the GRN register: if goods were received, post the invoice; if not, ask the supplier to cancel it.',
  'Invoice amount mismatch': 'Compare the posted value with the supplier\'s invoice copy line by line. Correct whichever side keyed the wrong value.',
  'Tax amount mismatch': 'Check the GST rate applied in the posting against the invoice and the item\'s tax setup. Correct the posting; do not adjust tax without the invoice copy.',
  'Duplicate invoice': 'Confirm both postings refer to the same supplier document, then reverse the duplicate. Check whether either copy has already been paid.',
  'Duplicate payment': 'Confirm the supplier received both remittances. Ask for a refund or for the excess to be adjusted against the next invoice, in writing.',
  'Payment recorded by buyer but not supplier': 'Share the UTR and bank advice with the supplier. If the bank shows the payment as successful, ask the supplier to trace and credit it.',
  'Payment recorded by supplier but not buyer': 'Identify the remitter: another group company, a third party, or an unposted payment. Post it or ask the supplier to reallocate it.',
  'Partial payment': 'Confirm the short payment was intentional (dispute, retention or TDS). If not, schedule the balance.',
  'Credit note missing in buyer ledger': 'Obtain the credit note copy and post it. This reduces Meridian\'s payable.',
  'Credit note missing in supplier statement': 'Confirm the supplier agreed to issue this credit. Get it issued, or reverse the expected credit in the buyer ledger.',
  'Debit note discrepancy': 'Send the debit note with supporting evidence (rejection note, short-receipt record) and get the supplier\'s written acceptance.',
  'Purchase order amount variance': 'Check whether the purchase was approved. Raise or amend the PO, or hold payment until approval is in place.',
  'Goods receipt discrepancy': 'Confirm with stores whether goods were received. Do not pay until a GRN supports the invoice value.',
  'Quantity mismatch': 'Compare invoiced quantity with accepted quantity on the GRN. Raise a debit note for the excess or obtain a revised invoice.',
  'Price mismatch': 'Compare the billed rate with the PO rate. Raise a debit note for the difference unless a rate revision was approved.',
  'Incorrect vendor allocation': 'Reclassify the posting to the correct vendor account. Check whether any payment was released against the wrong vendor.',
  'Date or period mismatch': 'Confirm the invoice date from the document and correct the posting date if it falls in the wrong period.',
  'Unallocated payment': 'Agree with the supplier which invoices the receipt should be applied to, and update both ledgers.',
  'Probable match awaiting confirmation': 'Compare both documents. Confirm the match if they are the same transaction; otherwise reject it and investigate each side separately.',
  'Unclassified exception': 'Review the records manually.',
};

export interface BridgeItem { id: string; vendorId: string; bucket: Bucket; description: string; effect: string; amount: number; refs: string[]; exceptionKey: string; nature: string; origin: 'matched' | 'buyer' | 'supplier'; docClass: DocClass }
export const BUCKETS = ['Buyer-only transactions', 'Supplier-only transactions', 'Amount variances', 'Unallocated payments', 'Credit note differences', 'Debit note differences', 'Probable matches pending confirmation', 'Timing differences', 'Confirmed adjustments'] as const;
export type Bucket = typeof BUCKETS[number];

export interface VendorSummary { vendorId: string; name: string; buyerBalance: number; supplierBalance: number; variance: number; buyerRecs: number; supplierRecs: number; matched: number; openExceptions: number; exposure: number }

export interface Result {
  settings: Settings; normalized: Normalized; matches: Match[]; pending: Match[];
  unmatchedBuyer: Rec[]; unmatchedSupplier: Rec[]; exceptions: Exception[]; bridge: BridgeItem[];
  vendors: VendorSummary[]; buyerBalance: number; supplierBalance: number; variance: number; bridgeTotal: number; bridgeCheck: boolean;
  periodEnd: number; runAt: string;
}

export function reconcile(data: LabData, settings: Settings = DEFAULT_SETTINGS, decisions: Decisions = EMPTY_DECISIONS): Result {
  const runAt = new Date().toISOString();
  const N = normalize(data);
  const periodEnd = parseDate(data.periodEnd) as number;
  const vName = new Map(data.suppliers.map(s => [s.id, s.name]));
  const usedB = new Set<string>(), usedS = new Set<string>();
  const matches: Match[] = [], pending: Match[] = [];
  const add = (b: Rec, s: Rec, level: Match['level'], confidence: Confidence, rule: string, status: Match['status'] = 'auto') => {
    if (status === 'auto' && level > 0 && decisions.reopened.includes(`${b.id}~${s.id}`)) return;
    const m: Match = { key: `${b.id}~${s.id}`, level, confidence, rule, buyer: b, supplier: s, diff: r2(b.amount - s.amount), status, timestamp: runAt };
    if (status === 'pending') pending.push(m); else { matches.push(m); usedB.add(b.id); usedS.add(s.id); }
  };
  const freeB = () => N.buyer.filter(b => !usedB.has(b.id));
  const freeS = () => N.supplier.filter(s => !usedS.has(s.id));
  const compatible = (b: Rec, s: Rec) => b.vendorId === s.vendorId && b.currency === s.currency; // never match across vendors or currencies

  // Manual matches confirmed by the user (one-to-one, validated).
  decisions.manual.forEach(({ buyerId, supplierId }) => {
    const b = N.buyer.find(x => x.id === buyerId), s = N.supplier.find(x => x.id === supplierId);
    if (b && s && !usedB.has(b.id) && !usedS.has(s.id) && compatible(b, s)) add(b, s, 0, 'Manual match', 'Matched manually by reviewer');
  });

  // Pair records that share a key, one-to-one, nearest date first.
  function level(keyFn: (r: Rec) => string | null, ok: (b: Rec, s: Rec) => boolean, emit: (b: Rec, s: Rec) => void) {
    const groups = new Map<string, Rec[]>();
    freeS().forEach(s => { const k = keyFn(s); if (k) { const g = groups.get(k) ?? []; g.push(s); groups.set(k, g); } });
    freeB().sort((a, b) => a.date - b.date || a.id.localeCompare(b.id)).forEach(b => {
      const k = keyFn(b); if (!k) return; const g = groups.get(k); if (!g?.length) return;
      const cands = g.filter(s => ok(b, s)).sort((x, y) => Math.abs(x.date - b.date) - Math.abs(y.date - b.date));
      if (!cands.length) return; const s = cands[0]; g.splice(g.indexOf(s), 1); emit(b, s);
    });
  }
  // Level 1: vendor ID + exact document reference + currency (supplier vendor ID present on the statement).
  level(r => (r.side === 'supplier' && r.vendorVia !== 'id') || !r.rawRef ? null : `${r.vendorId}|${r.docClass}|${r.rawRef.toUpperCase()}|${r.currency}`, () => true,
    (b, s) => add(b, s, 1, 'Exact match', 'L1 · Vendor ID + exact reference + currency'));
  // Level 2: vendor (incl. alias) + normalized reference + currency, within date tolerance.
  level(r => (r.ref ? `${r.vendorId}|${r.docClass}|${r.ref}|${r.currency}` : null), (b, s) => Math.abs(b.date - s.date) <= settings.dateTolerance * DAY,
    (b, s) => add(b, s, 2, 'Strong match', s.vendorVia === 'alias' ? 'L2 · Vendor alias + normalized reference + date tolerance' : 'L2 · Normalized reference + date tolerance'));
  // Level 3: same vendor and amount within tolerance, dates close, references differ → probable, needs confirmation.
  const claimedB = new Set<string>(), claimedS = new Set<string>();
  freeB().filter(b => b.docClass === 'INV').sort((a, b) => a.date - b.date).forEach(b => {
    const c = freeS().filter(s => s.docClass === 'INV' && !claimedS.has(s.id) && compatible(b, s) && Math.abs(b.amount - s.amount) <= settings.amountTolerance && Math.abs(b.date - s.date) <= settings.dateTolerance * DAY)
      .sort((x, y) => Math.abs(x.date - b.date) - Math.abs(y.date - b.date));
    if (!c.length) return; const s = c[0]; const key = `${b.id}~${s.id}`; const d = decisions.probable[key];
    if (d === 'rejected') return;
    claimedB.add(b.id); claimedS.add(s.id);
    add(b, s, 3, 'Probable match', 'L3 · Same vendor, amount within tolerance, dates within tolerance', d === 'confirmed' ? 'confirmed' : 'pending');
  });

  // ---------- Exceptions ----------
  const ex: Omit<Exception, 'id' | 'severity' | 'status' | 'owner' | 'notes' | 'resolution'>[] = [];
  const age = (r: Rec) => Math.max(0, Math.round((periodEnd - r.date) / DAY));
  const push = (category: Category, nature: Nature, subtype: string, records: Rec[], o: { buyer?: number | null; supplier?: number | null; impact: number; balanceEffect: number; evidence?: string[] }) => {
    const v = records[0].vendorId;
    ex.push({ key: `${category}|${records.map(r => r.id).join('+')}`, vendorId: v, vendorName: vName.get(v) ?? v, category, nature, subtype, refs: records.map(r => r.rawRef || r.id), buyerAmount: o.buyer ?? null, supplierAmount: o.supplier ?? null, variance: r2((o.buyer ?? 0) - (o.supplier ?? 0)), ageDays: Math.max(...records.map(age)), impact: r2(Math.abs(o.impact)), recommendation: ADVICE[category], evidence: [...records.map(r => `${r.side === 'buyer' ? 'Ledger' : 'Statement'} ${r.id}`), ...(o.evidence ?? [])], records, balanceEffect: r2(o.balanceEffect) });
  };
  const nearEnd = (r: Rec) => periodEnd - r.date <= settings.transitDays * DAY;

  // Differences inside matched pairs.
  matches.forEach(m => {
    const { buyer: b, supplier: s } = m;
    if (Math.abs(m.diff) > 0.005) {
      if (b.docClass === 'DN') push('Debit note discrepancy', 'Confirmed discrepancy', 'Debit note value differs', [b, s], { buyer: -b.amount, supplier: -s.amount, impact: m.diff, balanceEffect: m.diff });
      else if (b.docClass === 'INV' && b.taxable !== null && s.taxable !== null && Math.abs(b.taxable - s.taxable) <= settings.amountTolerance) push('Tax amount mismatch', 'Confirmed discrepancy', `Tax ${b.tax?.toFixed(2)} vs ${s.tax?.toFixed(2)}`, [b, s], { buyer: b.amount, supplier: s.amount, impact: m.diff, balanceEffect: m.diff });
      else push('Invoice amount mismatch', 'Confirmed discrepancy', `${DOC_LABEL[b.docClass]} value differs`, [b, s], { buyer: b.amount, supplier: s.amount, impact: m.diff, balanceEffect: m.diff });
    }
    if (b.docClass === 'INV' && Math.abs(b.date - s.date) > settings.dateTolerance * DAY) push('Date or period mismatch', 'Data quality issue', `Dates ${Math.round(Math.abs(b.date - s.date) / DAY)} days apart`, [b, s], { buyer: b.amount, supplier: s.amount, impact: 0, balanceEffect: 0 });
    if (b.docClass === 'PAY' && s.onAccount && !b.invRef) push('Unallocated payment', 'Information gap', 'Advance held on account by supplier', [b, s], { buyer: -b.amount, supplier: -s.amount, impact: b.amount, balanceEffect: 0 });
  });
  pending.forEach(m => push('Probable match awaiting confirmation', 'Information gap', m.rule, [m.buyer, m.supplier], { buyer: m.buyer.amount, supplier: m.supplier.amount, impact: m.diff, balanceEffect: m.diff }));

  // Unmatched records.
  const ub = N.buyer.filter(b => !usedB.has(b.id) && !claimedB.has(b.id));
  const us = N.supplier.filter(s => !usedS.has(s.id) && !claimedS.has(s.id));
  const handled = new Set<string>();
  // Same document posted against a different vendor (never auto-matched across vendors).
  ub.filter(b => b.docClass === 'INV').forEach(b => {
    const s = us.find(s => s.docClass === 'INV' && !handled.has(s.id) && s.vendorId !== b.vendorId && s.ref === b.ref && Math.abs(s.amount - b.amount) <= settings.amountTolerance);
    if (!s) return; handled.add(b.id); handled.add(s.id);
    push('Incorrect vendor allocation', 'Confirmed discrepancy', `Posted to ${b.vendorId}, billed by ${s.vendorId}`, [b, s], { buyer: b.amount, supplier: s.amount, impact: b.amount, balanceEffect: b.amount - s.amount });
  });
  ub.filter(b => !handled.has(b.id)).forEach(b => {
    handled.add(b.id);
    if (b.docClass === 'INV') {
      const twin = N.buyer.find(o => o.id !== b.id && o.docClass === 'INV' && o.vendorId === b.vendorId && o.ref === b.ref && Math.abs(o.amount - b.amount) <= settings.amountTolerance);
      if (twin) return push('Duplicate invoice', 'Confirmed discrepancy', `Duplicate of ${twin.id}`, [b, twin], { buyer: b.amount, impact: b.amount, balanceEffect: b.amount });
      return push('Invoice in buyer ledger, missing from supplier statement', 'Information gap', 'Not on supplier statement', [b], { buyer: b.amount, impact: b.amount, balanceEffect: b.amount });
    }
    if (b.docClass === 'CN') return push('Credit note missing in supplier statement', 'Potential financial exposure', 'Expected credit not issued', [b], { buyer: -b.amount, impact: b.amount, balanceEffect: b.amount });
    if (b.docClass === 'DN') return push('Debit note discrepancy', 'Potential financial exposure', 'Debit note not accepted by supplier', [b], { buyer: -b.amount, impact: b.amount, balanceEffect: b.amount });
    if (b.docClass === 'PAY') return nearEnd(b)
      ? push('Payment recorded by buyer but not supplier', 'Timing difference', 'Payment in transit at period end', [b], { buyer: -b.amount, impact: b.amount, balanceEffect: b.amount })
      : push('Payment recorded by buyer but not supplier', 'Potential financial exposure', 'Not credited by supplier', [b], { buyer: -b.amount, impact: b.amount, balanceEffect: b.amount });
    push('Unclassified exception', 'Information gap', DOC_LABEL[b.docClass], [b], { buyer: b.amount, impact: b.amount, balanceEffect: b.amount });
  });
  us.filter(s => !handled.has(s.id)).forEach(s => {
    handled.add(s.id);
    if (s.docClass === 'INV') return nearEnd(s)
      ? push('Invoice in supplier statement, missing from buyer ledger', 'Timing difference', 'Invoiced at period end; goods likely in transit', [s], { supplier: s.amount, impact: s.amount, balanceEffect: -s.amount })
      : push('Invoice in supplier statement, missing from buyer ledger', 'Potential financial exposure', 'Possible unrecorded liability', [s], { supplier: s.amount, impact: s.amount, balanceEffect: -s.amount });
    if (s.docClass === 'CN') return push('Credit note missing in buyer ledger', 'Potential financial exposure', 'Credit issued, not recorded', [s], { supplier: -s.amount, impact: s.amount, balanceEffect: -s.amount });
    if (s.docClass === 'DN') return push('Debit note discrepancy', 'Information gap', 'Supplier shows a debit note the buyer has not posted', [s], { supplier: -s.amount, impact: s.amount, balanceEffect: -s.amount });
    if (s.docClass === 'PAY') return s.onAccount
      ? push('Unallocated payment', 'Information gap', 'On-account receipt with no buyer posting', [s], { supplier: -s.amount, impact: s.amount, balanceEffect: -s.amount })
      : push('Payment recorded by supplier but not buyer', 'Potential financial exposure', 'Remitter not identified in buyer books', [s], { supplier: -s.amount, impact: s.amount, balanceEffect: -s.amount });
    push('Unclassified exception', 'Information gap', DOC_LABEL[s.docClass], [s], { supplier: s.amount, impact: s.amount, balanceEffect: -s.amount });
  });

  // Level 4: PO and GRN validation on buyer invoices (first posting only; duplicates are already flagged).
  const dupIds = new Set(ex.filter(e => e.category === 'Duplicate invoice').map(e => e.records[0].id));
  N.buyer.filter(b => b.docClass === 'INV' && !dupIds.has(b.id)).forEach(b => {
    const t = b.taxable ?? 0;
    if (!b.po) { if (!settings.nonPoVendors.includes(b.vendorId)) push('Purchase order amount variance', 'Potential financial exposure', 'Invoice without a purchase order', [b], { buyer: b.amount, impact: t, balanceEffect: 0 }); return; }
    const po = N.pos.get(b.po); if (!po) return push('Purchase order amount variance', 'Data quality issue', `PO ${b.po} not found in register`, [b], { buyer: b.amount, impact: t, balanceEffect: 0 });
    const grn = (b.grn && N.grns.get(b.grn)) || N.grnByPo.get(b.po);
    const ev = [`PO ${po.no}`, ...(grn ? [`GRN ${grn.no}`] : [])];
    if (b.rate !== null && Math.abs(b.rate - po.rate) > 0.5) return push('Price mismatch', 'Potential financial exposure', `Billed ₹${b.rate} vs PO ₹${po.rate}`, [b], { buyer: b.amount, impact: (b.rate - po.rate) * (b.qty ?? 0), balanceEffect: 0, evidence: ev });
    if (!grn) return push('Goods receipt discrepancy', 'Potential financial exposure', 'Invoice without a goods receipt', [b], { buyer: b.amount, impact: t, balanceEffect: 0, evidence: ev });
    if (b.qty !== null && b.qty > grn.accepted) return push('Quantity mismatch', 'Potential financial exposure', `Invoiced ${b.qty} vs accepted ${grn.accepted}`, [b], { buyer: b.amount, impact: (b.qty - grn.accepted) * (b.rate ?? 0), balanceEffect: 0, evidence: ev });
    if (t > grn.value + settings.amountTolerance) return push('Goods receipt discrepancy', 'Potential financial exposure', 'Invoice exceeds accepted receipt value', [b], { buyer: b.amount, impact: t - grn.value, balanceEffect: 0, evidence: ev });
    if (t > po.approved + settings.amountTolerance) push('Purchase order amount variance', 'Potential financial exposure', 'Invoice exceeds approved PO amount', [b], { buyer: b.amount, impact: t - po.approved, balanceEffect: 0, evidence: ev });
  });

  // Level 5: payment register checks (duplicates and partial payments).
  const byInv = new Map<string, Payment[]>();
  N.payments.filter(p => p.invRef).forEach(p => { const k = `${p.vendorId}|${normRef(p.invRef)}`; byInv.set(k, [...(byInv.get(k) ?? []), p]); });
  byInv.forEach((ps, k) => {
    const inv = N.buyer.find(b => b.docClass === 'INV' && `${b.vendorId}|${b.ref}` === k); if (!inv) return;
    const paid = ps.reduce((s, p) => s + p.amount, 0);
    const recs = ps.map(p => N.buyer.find(b => b.payRef === p.ref)).filter((x): x is Rec => !!x);
    const ev = ps.map(p => `Payment ${p.ref} · UTR ${p.utr}`);
    if (ps.length > 1 && paid > inv.amount + settings.amountTolerance) push('Duplicate payment', 'Confirmed discrepancy', `${ps.length} payments against ${inv.rawRef}`, [inv, ...recs], { buyer: inv.amount, impact: paid - inv.amount, balanceEffect: 0, evidence: ev });
    else if (paid < inv.amount - settings.amountTolerance) push('Partial payment', 'Information gap', `Paid ${Math.round((paid / inv.amount) * 100)}% of invoice`, [inv, ...recs], { buyer: inv.amount, impact: inv.amount - paid, balanceEffect: 0, evidence: ev });
  });

  // Severity: configurable thresholds on impact, then category rules. No AI judgement.
  const sev = (e: typeof ex[number]): Severity => {
    let s: Severity = e.impact >= settings.critical ? 'Critical' : e.impact >= settings.high ? 'High' : e.impact >= settings.medium ? 'Medium' : 'Low';
    if ((e.category === 'Duplicate payment' || e.category === 'Duplicate invoice') && (s === 'Low' || s === 'Medium')) s = 'High';
    if (e.nature === 'Timing difference' && (s === 'Critical' || s === 'High')) s = 'Medium';
    if (e.nature === 'Data quality issue' || e.category === 'Partial payment' || e.category === 'Probable match awaiting confirmation') s = 'Low';
    return s;
  };
  const RANK: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const exceptions: Exception[] = ex.map(e => ({ ...e, severity: sev(e) })).sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.impact - a.impact || a.key.localeCompare(b.key))
    .map((e, i) => { const ed = decisions.edits[e.key] ?? {}; return { ...e, id: `EX-${String(i + 1).padStart(3, '0')}`, status: ed.status ?? 'Open', owner: ed.owner ?? OWNER[e.category] ?? 'AP team', notes: ed.notes ?? '', resolution: ed.resolution ?? '' }; });
  // Link bridge lines to the exception that explains the ledger difference (not to PO/GRN/payment-register checks).
  const LEDGER_CATS = new Set<Category>(['Invoice in buyer ledger, missing from supplier statement', 'Invoice in supplier statement, missing from buyer ledger', 'Invoice amount mismatch', 'Tax amount mismatch', 'Duplicate invoice', 'Payment recorded by buyer but not supplier', 'Payment recorded by supplier but not buyer', 'Credit note missing in buyer ledger', 'Credit note missing in supplier statement', 'Debit note discrepancy', 'Incorrect vendor allocation', 'Unallocated payment', 'Probable match awaiting confirmation', 'Unclassified exception']);
  const exByRec = new Map<string, Exception>();
  exceptions.filter(e => LEDGER_CATS.has(e.category)).forEach(e => e.records.forEach(r => { if (!exByRec.has(r.id)) exByRec.set(r.id, e); }));
  const pendingIds = new Set(pending.flatMap(m => [m.buyer.id, m.supplier.id]));

  // ---------- Reconciliation bridge ----------
  // Every accepted record is either in a match or unmatched, so the items below sum exactly to buyer − supplier.
  const bridge: BridgeItem[] = [];
  let bi = 1;
  const bucketFor = (e: Exception | undefined, base: Bucket): Bucket => {
    if (e?.resolution === 'Buyer ledger adjustment' || e?.resolution === 'Supplier statement correction') return 'Confirmed adjustments';
    if (e?.nature === 'Timing difference' || e?.resolution === 'Timing difference — clears next period') return 'Timing differences';
    return base;
  };
  const item = (vendorId: string, base: Bucket, description: string, effect: string, amount: number, refs: string[], origin: BridgeItem['origin'], docClass: DocClass, e?: Exception) => {
    if (Math.abs(amount) < 0.005) return;
    bridge.push({ id: `BR-${String(bi++).padStart(3, '0')}`, vendorId, bucket: bucketFor(e, base), description, effect, amount: r2(amount), refs, exceptionKey: e?.key ?? '', nature: e ? (e.resolution ? `Resolved — ${e.resolution}` : e.nature === 'Timing difference' ? 'Timing difference' : 'Requires investigation') : 'Requires investigation', origin, docClass });
  };
  matches.forEach(m => {
    const e = exceptions.find(x => LEDGER_CATS.has(x.category) && x.records.some(r => r.id === m.buyer.id) && x.records.some(r => r.id === m.supplier.id));
    const base: Bucket = m.buyer.docClass === 'CN' ? 'Credit note differences' : m.buyer.docClass === 'DN' ? 'Debit note differences' : 'Amount variances';
    item(m.buyer.vendorId, base, `${DOC_LABEL[m.buyer.docClass]} ${m.buyer.rawRef}: buyer ${m.buyer.amount.toFixed(2)} vs supplier ${m.supplier.amount.toFixed(2)}`, m.diff > 0 ? 'Buyer side records more than supplier' : 'Buyer side records less than supplier', m.diff, [m.buyer.id, m.supplier.id], 'matched', m.buyer.docClass, e);
  });
  const baseOf = (r: Rec): Bucket => pendingIds.has(r.id) ? 'Probable matches pending confirmation' : r.docClass === 'CN' ? 'Credit note differences' : r.docClass === 'DN' ? 'Debit note differences' : r.docClass === 'PAY' && r.onAccount ? 'Unallocated payments' : r.side === 'buyer' ? 'Buyer-only transactions' : 'Supplier-only transactions';
  const unmatchedBuyer = N.buyer.filter(b => !usedB.has(b.id)), unmatchedSupplier = N.supplier.filter(s => !usedS.has(s.id));
  unmatchedBuyer.forEach(b => item(b.vendorId, baseOf(b), `${DOC_LABEL[b.docClass]} ${b.rawRef || b.id} in buyer ledger only`, b.amount > 0 ? 'Increases buyer-side balance' : 'Decreases buyer-side balance', b.amount, [b.id], 'buyer', b.docClass, exByRec.get(b.id)));
  unmatchedSupplier.forEach(s => item(s.vendorId, baseOf(s), `${DOC_LABEL[s.docClass]} ${s.rawRef || s.id} on supplier statement only`, s.amount > 0 ? 'Increases supplier-side balance' : 'Decreases supplier-side balance', -s.amount, [s.id], 'supplier', s.docClass, exByRec.get(s.id)));

  const buyerBalance = r2(N.buyer.reduce((s, r) => s + r.amount, 0));
  const supplierBalance = r2(N.supplier.reduce((s, r) => s + r.amount, 0));
  const variance = r2(buyerBalance - supplierBalance);
  const bridgeTotal = r2(bridge.reduce((s, b) => s + b.amount, 0));

  const vendors: VendorSummary[] = data.suppliers.map(v => {
    const bb = N.buyer.filter(r => r.vendorId === v.id), ss = N.supplier.filter(r => r.vendorId === v.id);
    const bBal = r2(bb.reduce((s, r) => s + r.amount, 0)), sBal = r2(ss.reduce((s, r) => s + r.amount, 0));
    const vex = exceptions.filter(e => e.vendorId === v.id && e.status !== 'Resolved');
    return { vendorId: v.id, name: v.name, buyerBalance: bBal, supplierBalance: sBal, variance: r2(bBal - sBal), buyerRecs: bb.length, supplierRecs: ss.length, matched: matches.filter(m => m.buyer.vendorId === v.id).length, openExceptions: vex.length, exposure: r2(vex.filter(e => e.nature !== 'Timing difference' && e.nature !== 'Data quality issue').reduce((s, e) => s + e.impact, 0)) };
  });

  return { settings, normalized: N, matches, pending, unmatchedBuyer, unmatchedSupplier, exceptions, bridge, vendors, buyerBalance, supplierBalance, variance, bridgeTotal, bridgeCheck: Math.abs(bridgeTotal - variance) < 0.01, periodEnd, runAt };
}

// ---------- CSV export ----------
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}
