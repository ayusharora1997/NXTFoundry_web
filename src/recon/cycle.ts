// NXT Vendor Payable Reconciliation — period cycle engine.
// Extends the existing normalisation utilities (engine.ts) into a continuous, period-based, bilateral reconciliation:
// opening-balance gate → contra within each ledger → sequential cross-ledger matching → open items → statement with
// annexures by originating period → sign-off → close → carry-forward. Deterministic: no AI is used for any amount.
//
// Sign convention (default, both ledgers expressed from the buyer's payable point of view):
//   invoices +, debit notes +, credit notes −, payments −, payment reversals +, TDS −, TDS reversals +.
//   Buyer signed = credit − debit (payable ledger). Vendor signed = debit − credit (receivable ledger).
// Bridge: buyer closing − vendor closing = Σ open buyer items − Σ open vendor items + Σ approved adjustment effects + unexplained.

import { normRef, parseAmount, parseDate } from './engine';

export type Side = 'B' | 'V';
export type TxnType = 'INV' | 'INVREV' | 'DN' | 'DNREV' | 'CN' | 'CNREV' | 'PAY' | 'PAYREV' | 'TDS' | 'TDSREV';
export const TYPE_LABEL: Record<TxnType, string> = { INV: 'Invoice', INVREV: 'Invoice reversal', DN: 'Debit note', DNREV: 'Debit note reversal', CN: 'Credit note', CNREV: 'Credit note reversal', PAY: 'Payment', PAYREV: 'Payment reversal', TDS: 'TDS', TDSREV: 'TDS reversal' };
export const SIGN: Record<TxnType, 1 | -1> = { INV: 1, INVREV: -1, DN: 1, DNREV: -1, CN: -1, CNREV: 1, PAY: -1, PAYREV: 1, TDS: -1, TDSREV: 1 };
export const FAMILY: Record<TxnType, TxnType> = { INV: 'INV', INVREV: 'INV', DN: 'DN', DNREV: 'DN', CN: 'CN', CNREV: 'CN', PAY: 'PAY', PAYREV: 'PAY', TDS: 'TDS', TDSREV: 'TDS' };
const isRev = (t: TxnType) => t.endsWith('REV');
// Labels as they arrive in ERP extracts and vendor ledgers → engine types.
const TYPE_IN: Record<string, TxnType> = {
  'invoice': 'INV', 'tax invoice': 'INV', 'invoice reversal': 'INVREV', 'debit note': 'DN', 'debit note reversal': 'DNREV', 'credit note': 'CN', 'credit note reversal': 'CNREV',
  // A debit note the buyer raises on the vendor reduces the payable: it is matched against the vendor's credit note.
  'debit note - claims': 'CN', 'debit note - quantity': 'CN', 'debit note - price': 'CN',
  'payment': 'PAY', 'receipt': 'PAY', 'payment reversal': 'PAYREV', 'receipt reversal': 'PAYREV', 'tds': 'TDS', 'tds receivable': 'TDS', 'tds reversal': 'TDSREV',
};
export const r2 = (n: number) => Math.round(n * 100) / 100;
/** The type as people read it: a buyer debit note keeps its own name (Debit Note - Claims) though it is matched as a credit note. */
export const typeName = (t: { type: TxnType; raw?: Row }) => /^debit note - /i.test(t.raw?.['Type'] ?? '') ? t.raw!['Type'] : TYPE_LABEL[t.type];
const DAY = 86400000;
export const ENGINE_VERSION = 'nxt-recon 2.0';

// ---------- Master data ----------
export interface Buyer { id: string; name: string; erp: string; currency: string }
export interface Entity { id: string; name: string; gstin: string; bus: string[] }
export interface Vendor { id: string; code: string; legalName: string; displayName: string; gstin: string; status: 'Active' | 'Onboarding'; currency: string; contact: { name: string; email: string }; frequency: Frequency; owner: string; created: string; category: string }
export type Frequency = 'Monthly' | 'Quarterly' | 'Half-yearly' | 'Annual';
export interface PeriodDef { tag: string; type: Frequency; start: number; end: number; label: string }
/** One buyer entity + business unit + vendor + currency. Everything is scoped to a relationship, so nothing can match across them. */
export interface Relationship { id: string; buyerId: string; entityId: string; bu: string; vendorId: string; vendorCode: string; currency: string; frequency: Frequency; owner: string; status: 'Active' | 'Onboarding' }

// ---------- Source files and transactions ----------
export type Row = Record<string, string>;
export const LEDGER_COLUMNS = ['Line ID', 'Document No', 'Document Date', 'Posting Date', 'Type', 'Debit', 'Credit', 'Reference', 'Against Doc', 'Narration', 'Period Tag'];
export interface LedgerFile {
  id: string; relId: string; side: Side; periodTag: string; kind: 'period' | 'backdated' | 'historical';
  fileName: string; source: string; availableAt: string; opening: number | null; closing: number | null; rows: Row[];
}
export interface Txn {
  id: string; relId: string; side: Side; type: TxnType; docNo: string; docNorm: string; date: number; ref: string; refNorm: string; against: string; againstNorm: string;
  amount: number; narration: string; originTag: string; importedIn: string; kind: LedgerFile['kind']; fileId: string; line: string; raw: Row; issues: string[];
}

// ---------- Reconciliation records ----------
export type StageId = 'contraB' | 'contraV' | 'invdn' | 'cn' | 'pay' | 'tds' | 'paytds' | 'other';
export const STAGES: { id: StageId; label: string; desc: string; optional?: 'tds' | 'paytds' }[] = [
  { id: 'contraB', label: 'Contra · buyer ledger', desc: 'Reversal pairs inside the buyer’s own books' },
  { id: 'contraV', label: 'Contra · vendor ledger', desc: 'Reversal pairs inside the vendor’s own books' },
  { id: 'invdn', label: 'Invoices and debit notes', desc: 'Document number, type and amount, strongest identifier first' },
  { id: 'cn', label: 'Credit notes', desc: 'Credit note number, then original invoice and amount' },
  { id: 'pay', label: 'Payments', desc: 'UTR / bank reference; one-to-many and many-to-one allowed when sums agree' },
  { id: 'tds', label: 'TDS', desc: 'TDS against the same invoice, same amount', optional: 'tds' },
  { id: 'paytds', label: 'Payment + TDS', desc: 'Payment and TDS together against one receipt, with UTR and invoice reference', optional: 'paytds' },
  { id: 'other', label: 'Other candidates', desc: 'Reference similarity, amount, date and learned patterns. Never closed without a reviewer', },
];
export type Confidence = 'Exact' | 'Rule-based' | 'Probable' | 'Manual';
export interface MatchRec {
  id: string; relId: string; kind: 'contra' | 'match' | 'adjustment'; stage: StageId | 'manual' | 'adjustment'; rule: string; confidence: Confidence;
  buyerIds: string[]; vendorIds: string[]; explanation: string; amountDiff: number; dateDiff: number; by: string; at: string; periodTag: string; engine: string;
  reversed?: { by: string; at: string; reason: string; periodTag: string };
  /** Forced match with a difference left over. The items stay open in the statement; the pairing is only a link until the difference is resolved or the match is reversed. */
  partial?: boolean;
}
export interface Candidate { id: string; stage: StageId; kind: 'contra' | 'probable'; buyerIds: string[]; vendorIds: string[]; score: number; reasons: string[]; status: 'pending' | 'confirmed' | 'rejected' | 'superseded'; periodTag: string; by?: string; at?: string }
export type AdjKind = 'opening-continuity' | 'opening-position' | 'rounding' | 'accounting';
export interface Adjustment { id: string; relId: string; periodTag: string; kind: AdjKind; side: Side; amount: number; txnIds: string[]; reason: string; evidence: string; requestedBy: string; approvedBy?: string; at: string; status: 'pending' | 'approved' | 'rejected' }
export const EX_STATUSES = ['Open', 'Under Investigation', 'Awaiting Buyer', 'Awaiting Vendor', 'Awaiting Supporting Documents', 'Awaiting Internal Approval', 'Proposed Adjustment', 'Resolved', 'Closed', 'Closed - No Adjustment'] as const;
export type ExStatus = typeof EX_STATUSES[number];
export const MANUAL_STATUSES: ExStatus[] = ['Open', 'Under Investigation', 'Awaiting Buyer', 'Awaiting Vendor', 'Awaiting Supporting Documents'];
export interface ExRec { key: string; status: ExStatus; owner: string; priority: 'High' | 'Medium' | 'Low'; action: string; resolutionRef: string; closedAt?: string; notes: { by: string; at: string; text: string; periodTag: string }[]; evidence: { name: string; by: string; at: string }[] }
export interface CreditMap { invoiceDoc: string; method: 'Reference on note' | 'Suggested' | 'Manual'; by: string; at: string }
export type Phase = 'working' | 'prepared' | 'shared' | 'accepted' | 'disputed' | 'signed' | 'closed';
export interface SignEvent { version: number; event: 'prepared' | 'shared' | 'accepted' | 'disputed' | 'signed' | 'reopened' | 'closed'; by: string; rep?: string; at: string; comments: string }
export interface StageStat { considered: number; matched: number; matchAmount: number; candidates: number; at: string; by: string }
export interface Period {
  tag: string; type: Frequency; label: string; start: number; end: number;
  imports: { B?: string; V?: string }; extraFiles: string[]; opening: { B: number | null; V: number | null }; closing: { B: number | null; V: number | null };
  prevClosing: { B: number; V: number } | null; phase: Phase; version: number; stages: Partial<Record<StageId, StageStat>>; signoffs: SignEvent[];
  snapshot?: Statement; carriedIn: string[]; carriedOut: string[];
  /** Set when the vendor confirmed our closing balance: the period closed without a reconciliation. */
  confirmed?: { certNo: string; balance: number; rep: string; at: string };
  dates: { prepared?: string; shared?: string; vendorSignoff?: string; closed?: string };
}
export interface Audit { id: number; at: string; by: string; periodTag: string; action: string; detail: string; before?: string; after?: string; reason?: string }
export interface RelState {
  rel: Relationship; periods: Period[]; txns: Txn[]; matches: MatchRec[]; candidates: Candidate[]; adjustments: Adjustment[];
  exceptions: Record<string, ExRec>; credit: Record<string, CreditMap>;
  /** Credit notes the buyer accepted in Credit Mapping, per buyer note: number and the amount allocated to that note. */
  cnAgreed?: Record<string, { cn: string; cnNorm: string; amount: number; ref: string }[]>; carry: { txnId: string; from: string; to: string; at: string }[]; audit: Audit[]; seq: number;
}
export interface Settings { tolerance: Record<string, number>; probableThreshold: number; dateWindow: number; timingDays: number; stages: { tds: boolean; paytds: boolean } }
export const DEFAULT_SETTINGS: Settings = { tolerance: { INR: 500, USD: 10 }, probableThreshold: 60, dateWindow: 10, timingDays: 5, stages: { tds: true, paytds: true } };
export type Result<T> = { ok: true; state: T; note?: string } | { ok: false; error: string };
const fail = <T,>(error: string): Result<T> => ({ ok: false, error });

// ---------- Helpers ----------
export const fmtDay = (ms: number) => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}-${d.getUTCFullYear()}`; };
export const periodIndex = (st: RelState, tag: string) => st.periods.findIndex(p => p.tag === tag);
export const getPeriod = (st: RelState, tag: string) => st.periods.find(p => p.tag === tag);
export const currentPeriod = (st: RelState) => st.periods[st.periods.length - 1];
/** Tags sort by year then month: M062026 < M072026 < Q092026. */
export const tagKey = (tag: string) => Number(tag.slice(3)) * 100 + Number(tag.slice(1, 3));
function clone(st: RelState): RelState { return { ...st, periods: st.periods.map(p => ({ ...p, stages: { ...p.stages }, signoffs: [...p.signoffs], imports: { ...p.imports }, extraFiles: [...p.extraFiles], opening: { ...p.opening }, closing: { ...p.closing }, dates: { ...p.dates } })), txns: [...st.txns], matches: [...st.matches], candidates: [...st.candidates], adjustments: [...st.adjustments], exceptions: { ...st.exceptions }, credit: { ...st.credit }, cnAgreed: Object.fromEntries(Object.entries(st.cnAgreed ?? {}).map(([k, v]) => [k, [...v]])), carry: [...st.carry], audit: [...st.audit] }; }
function log(st: RelState, by: string, at: string, periodTag: string, action: string, detail: string, extra: Partial<Audit> = {}) { st.audit.push({ id: ++st.seq, at, by, periodTag, action, detail, ...extra }); }
const nid = (st: RelState, p: string) => `${p}-${String(++st.seq).padStart(5, '0')}`;
export const locked = (p: Period) => p.phase !== 'working';

export function newRelState(rel: Relationship, first: PeriodDef): RelState {
  return { rel, txns: [], matches: [], candidates: [], adjustments: [], exceptions: {}, credit: {}, carry: [], audit: [], seq: 0, periods: [blankPeriod(first, null, [])] };
}
function blankPeriod(d: PeriodDef, prev: { B: number; V: number } | null, carriedIn: string[]): Period {
  return { tag: d.tag, type: d.type, label: d.label, start: d.start, end: d.end, imports: {}, extraFiles: [], opening: { B: null, V: null }, closing: { B: null, V: null }, prevClosing: prev, phase: 'working', version: 1, stages: {}, signoffs: [], carriedIn, carriedOut: [], dates: {} };
}

// ---------- Stage 3: import and normalise ----------
export interface ImportPreview { file: LedgerFile; txns: Txn[]; rejected: { line: string; reason: string }[]; duplicates: { line: string; reason: string }[]; warnings: string[]; integrity: number | null; byType: Record<string, number> }
/** Normalises a ledger file without touching the source rows. Nothing is written until importFile is called. */
export function previewFile(st: RelState, file: LedgerFile, tag: string): ImportPreview {
  const rejected: ImportPreview['rejected'] = [], duplicates: ImportPreview['duplicates'] = [], warnings: string[] = [], txns: Txn[] = [], byType: Record<string, number> = {};
  if (file.relId !== st.rel.id) warnings.push('This file belongs to a different buyer–vendor relationship and cannot be imported here.');
  const identity = (t: { side: Side; type: TxnType; docNorm: string; date: number; amount: number; refNorm: string }) => `${t.side}|${t.type}|${t.docNorm}|${t.date}|${t.amount.toFixed(2)}|${t.refNorm}`;
  const existing = new Map(st.txns.map(t => [identity(t), t]));
  const closedIds = closedTxnIds(st);
  file.rows.forEach(r => {
    const line = (r['Line ID'] ?? '').trim();
    const type = TYPE_IN[(r['Type'] ?? '').trim().toLowerCase()];
    if (!type) { rejected.push({ line, reason: `Unknown transaction type “${r['Type']}”` }); return; }
    const date = parseDate(r['Document Date']);
    if (date === null || isNaN(date)) { rejected.push({ line, reason: `Document date “${r['Document Date'] ?? ''}” is not valid` }); return; }
    const dr = parseAmount(r['Debit'] || '0'), cr = parseAmount(r['Credit'] || '0');
    if (dr === null || cr === null || isNaN(dr) || isNaN(cr)) { rejected.push({ line, reason: 'Debit or credit is not a number' }); return; }
    const amount = r2(file.side === 'B' ? cr - dr : dr - cr);
    if (Math.abs(amount) < 0.005) { rejected.push({ line, reason: 'Zero amount' }); return; }
    const docNo = (r['Document No'] ?? '').trim(); const ref = (r['Reference'] ?? '').trim(); const against = (r['Against Doc'] ?? '').trim();
    const issues: string[] = [];
    if (Math.sign(amount) !== SIGN[type]) issues.push(`Sign does not follow the convention for ${TYPE_LABEL[type].toLowerCase()}`);
    const originTag = (r['Period Tag'] ?? '').trim() || tag;
    const t: Txn = { id: `${st.rel.id}:${file.side}:${line}`, relId: st.rel.id, side: file.side, type, docNo, docNorm: normRef(docNo), date, ref, refNorm: normRef(ref), against, againstNorm: normRef(against), amount, narration: r['Narration'] ?? '', originTag, importedIn: tag, kind: file.kind, fileId: file.id, line, raw: r, issues };
    const dup = existing.get(identity(t));
    if (dup) { duplicates.push({ line, reason: `Already in the reconciliation as ${dup.docNo || dup.ref} (${dup.originTag}${closedIds.has(dup.id) ? ', matched and closed' : ', open'}); not imported again` }); return; }
    if (st.txns.some(x => x.id === t.id)) { duplicates.push({ line, reason: 'Source line already imported' }); return; }
    existing.set(identity(t), t); txns.push(t); byType[TYPE_LABEL[type]] = (byType[TYPE_LABEL[type]] ?? 0) + 1;
  });
  const sum = r2(txns.filter(t => t.kind === 'period').reduce((s, t) => s + t.amount, 0));
  const integrity = file.kind === 'period' && file.opening !== null && file.closing !== null ? r2(file.closing - (file.opening + sum)) : null;
  if (integrity && Math.abs(integrity) >= 0.005) warnings.push(`Reported closing differs from opening + imported lines by ${integrity.toFixed(2)}. This will show as an unexplained difference until explained.`);
  if (txns.some(t => t.issues.length)) warnings.push(`${txns.filter(t => t.issues.length).length} line(s) have a sign that does not follow the configured convention.`);
  return { file, txns, rejected, duplicates, warnings, integrity, byType };
}

export function importFile(st0: RelState, file: LedgerFile, tag: string, by: string, at: string): Result<RelState> {
  const p0 = getPeriod(st0, tag); if (!p0) return fail('Unknown period');
  if (locked(p0)) return fail('This period is locked. Reopen it to import more data.');
  if (file.relId !== st0.rel.id) return fail('This file belongs to a different relationship. Cross-relationship imports are blocked.');
  if (file.kind === 'period' && p0.imports[file.side]) return fail(`A ${file.side === 'B' ? 'buyer' : 'vendor'} ledger is already imported for ${tag}.`);
  const pv = previewFile(st0, file, tag);
  const st = clone(st0); const p = getPeriod(st, tag)!;
  st.txns.push(...pv.txns);
  if (file.kind === 'period') { p.imports[file.side] = file.id; p.opening[file.side] = file.opening; p.closing[file.side] = file.closing; }
  else p.extraFiles.push(file.id);
  // Notes on credit/debit notes that name their invoice are mapped automatically.
  pv.txns.filter(t => (FAMILY[t.type] === 'CN' || FAMILY[t.type] === 'DN') && !isRev(t.type) && t.against).forEach(t => { st.credit[t.id] = { invoiceDoc: t.against, method: 'Reference on note', by: 'Import', at }; });
  log(st, by, at, tag, 'Import', `${file.side === 'B' ? 'Buyer' : 'Vendor'} ${file.kind} file ${file.fileName}: ${pv.txns.length} lines imported, ${pv.rejected.length} rejected, ${pv.duplicates.length} duplicates skipped`);
  return { ok: true, state: st };
}

// ---------- Stage 4: opening balance gate ----------
export interface SideCheck { side: Side; prevClosing: number | null; backdated: number; opening: number | null; expected: number | null; variance: number | null; status: 'PASSED' | 'FAILED' | 'APPROVED' | 'PENDING' | 'FIRST PERIOD'; adjustment?: Adjustment }
export interface Gate { B: SideCheck; V: SideCheck; position: { buyerBase: number; vendorBase: number; diff: number; status: 'AGREED' | 'UNVERIFIED' | 'APPROVED'; adjustment?: Adjustment } | null; prevDifference: number | null; passed: boolean; first: boolean }
export function gate(st: RelState, tag: string): Gate {
  const p = getPeriod(st, tag)!; const first = periodIndex(st, tag) === 0;
  const adj = (kind: AdjKind, side: Side) => st.adjustments.find(a => a.periodTag === tag && a.kind === kind && a.side === side && a.status === 'approved');
  const side = (s: Side): SideCheck => {
    const opening = p.opening[s];
    const backdated = r2(st.txns.filter(t => t.side === s && t.importedIn === tag && t.kind === 'backdated').reduce((a, t) => a + t.amount, 0));
    if (!p.imports[s]) return { side: s, prevClosing: p.prevClosing?.[s] ?? null, backdated, opening: null, expected: null, variance: null, status: 'PENDING' };
    if (first) return { side: s, prevClosing: null, backdated, opening, expected: null, variance: null, status: 'FIRST PERIOD' };
    const expected = r2(p.prevClosing![s] + backdated); const variance = r2((opening ?? 0) - expected); const a = adj('opening-continuity', s);
    return { side: s, prevClosing: p.prevClosing![s], backdated, opening, expected, variance, status: Math.abs(variance) < 0.005 ? 'PASSED' : a && Math.abs(a.amount - variance) < 0.005 ? 'APPROVED' : 'FAILED', adjustment: a };
  };
  const B = side('B'), V = side('V');
  let position: Gate['position'] = null;
  if (first && p.imports.B && p.imports.V) {
    const hist = (s: Side) => r2(st.txns.filter(t => t.side === s && t.kind === 'historical' && t.importedIn === tag).reduce((a, t) => a + t.amount, 0));
    const buyerBase = r2((p.opening.B ?? 0) - hist('B')), vendorBase = r2((p.opening.V ?? 0) - hist('V')); const diff = r2(buyerBase - vendorBase); const a = adj('opening-position', 'B');
    position = { buyerBase, vendorBase, diff, status: Math.abs(diff) < 0.005 ? 'AGREED' : a && Math.abs(a.amount - diff) < 0.005 ? 'APPROVED' : 'UNVERIFIED', adjustment: a };
  }
  const ok = (c: SideCheck) => c.status === 'PASSED' || c.status === 'APPROVED' || c.status === 'FIRST PERIOD';
  const passed = ok(B) && ok(V) && (!first || (position !== null && position.status !== 'UNVERIFIED'));
  return { B, V, position, prevDifference: p.prevClosing ? r2(p.prevClosing.B - p.prevClosing.V) : null, passed, first };
}
/** An authorised user formally approves an explained opening difference. Recorded as an adjustment; never silent. */
export function approveOpening(st0: RelState, tag: string, side: Side, kind: 'opening-continuity' | 'opening-position', reason: string, evidence: string, by: string, at: string, canApprove: boolean): Result<RelState> {
  if (!canApprove) return fail('Only an approver can accept an opening balance difference.');
  if (!reason.trim() || !evidence.trim()) return fail('A reason and a supporting document reference are both required.');
  const p = getPeriod(st0, tag); if (!p || locked(p)) return fail('This period is locked.');
  const g = gate(st0, tag);
  const amount = kind === 'opening-position' ? g.position?.diff ?? 0 : g[side].variance ?? 0;
  if (Math.abs(amount) < 0.005) return fail('There is no difference to approve.');
  const st = clone(st0);
  st.adjustments.push({ id: nid(st, 'ADJ'), relId: st.rel.id, periodTag: tag, kind, side, amount, txnIds: [], reason, evidence, requestedBy: by, approvedBy: by, at, status: 'approved' });
  log(st, by, at, tag, 'Opening difference approved', `${kind === 'opening-position' ? 'Opening position' : `${side === 'B' ? 'Buyer' : 'Vendor'} opening continuity`} difference of ${amount.toFixed(2)} approved`, { reason, after: evidence });
  return { ok: true, state: st };
}

// ---------- Pools ----------
export function closedTxnIds(st: RelState): Set<string> { const s = new Set<string>(); st.matches.forEach(m => { if (!m.reversed && !m.partial) { m.buyerIds.forEach(i => s.add(i)); m.vendorIds.forEach(i => s.add(i)); } }); return s; }
/** Items held in a partial match: still open for the statement, but not offered to automatic stages or new matches. */
export function heldTxnIds(st: RelState): Set<string> { const s = new Set<string>(); st.matches.forEach(m => { if (!m.reversed && m.partial) { m.buyerIds.forEach(i => s.add(i)); m.vendorIds.forEach(i => s.add(i)); } }); return s; }
/** Open transactions available in a period: everything imported up to it, not in an active match, contra or settlement. */
export function openPool(st: RelState, tag: string): Txn[] {
  const idx = periodIndex(st, tag); const closed = closedTxnIds(st); const order = new Map(st.periods.map((p, i) => [p.tag, i]));
  // A balance confirmation settles everything up to that period: later periods start from the agreed balance.
  let floor = -1; st.periods.forEach((p, i) => { if (p.confirmed && i < idx) floor = i; });
  return st.txns.filter(t => { const o = order.get(t.importedIn) ?? 99; return o <= idx && o > floor && !closed.has(t.id); });
}
const pendingIds = (st: RelState) => new Set(st.candidates.filter(c => c.status === 'pending').flatMap(c => [...c.buyerIds, ...c.vendorIds]));
const sum = (xs: Txn[]) => r2(xs.reduce((s, t) => s + t.amount, 0));

// ---------- Stages 6–7: contra and sequential matching ----------
export function stageAvailable(st: RelState, tag: string, id: StageId, settings: Settings): { ok: boolean; why?: string } {
  const p = getPeriod(st, tag)!;
  if (!p.imports.B || !p.imports.V) return { ok: false, why: 'Import both ledgers first.' };
  if (!gate(st, tag).passed) return { ok: false, why: 'Opening balance validation must pass (or be formally approved) before matching.' };
  if (locked(p)) return { ok: false, why: 'Period is locked. Reopen to change matching.' };
  const order = STAGES.filter(s => !s.optional || settings.stages[s.optional]);
  const i = order.findIndex(s => s.id === id); if (i < 0) return { ok: false, why: 'Stage is switched off in Settings.' };
  const prev = order[i - 1]; if (prev && !p.stages[prev.id]) return { ok: false, why: `Run “${prev.label}” first.` };
  return { ok: true };
}

export function runStage(st0: RelState, tag: string, id: StageId, settings: Settings, by: string, at: string): Result<RelState> {
  const av = stageAvailable(st0, tag, id, settings); if (!av.ok) return fail(av.why!);
  const st = clone(st0); const pend = pendingIds(st);
  // A possible contra waits for a reviewer before either item is matched across ledgers. A pending "other" suggestion may be
  // overtaken by a deterministic stage (e.g. after credit mapping), and is then marked superseded.
  const pendContra = new Set(st.candidates.filter(c => c.status === 'pending' && c.kind === 'contra').flatMap(c => [...c.buyerIds, ...c.vendorIds]));
  const held = heldTxnIds(st); const pool = openPool(st, tag).filter(t => !held.has(t.id) && !pendContra.has(t.id) && (id !== 'other' || !pend.has(t.id)));
  const B = pool.filter(t => t.side === 'B'), V = pool.filter(t => t.side === 'V');
  let considered = 0; const before = st.matches.length, candBefore = st.candidates.length;
  const add = (stage: StageId, kind: MatchRec['kind'], conf: Confidence, rule: string, bs: Txn[], vs: Txn[], explanation: string) => {
    const all = [...bs, ...vs]; const dates = all.map(t => t.date);
    st.matches.push({ id: nid(st, kind === 'contra' ? 'CT' : 'MT'), relId: st.rel.id, kind, stage, rule, confidence: conf, buyerIds: bs.map(t => t.id), vendorIds: vs.map(t => t.id), explanation, amountDiff: r2(sum(bs) - sum(vs)), dateDiff: Math.round((Math.max(...dates) - Math.min(...dates)) / DAY), by: 'Engine', at, periodTag: tag, engine: ENGINE_VERSION });
    all.forEach(t => used.add(t.id));
  };
  const used = new Set<string>(); const free = (xs: Txn[]) => xs.filter(t => !used.has(t.id));
  const candidate = (stage: StageId, kind: Candidate['kind'], bs: Txn[], vs: Txn[], score: number, reasons: string[]) => {
    const key = [...bs, ...vs].map(t => t.id).sort().join('+');
    if (st.candidates.some(c => [...c.buyerIds, ...c.vendorIds].sort().join('+') === key)) return; // decided or pending already
    st.candidates.push({ id: nid(st, 'CD'), stage, kind, buyerIds: bs.map(t => t.id), vendorIds: vs.map(t => t.id), score, reasons, status: 'pending', periodTag: tag });
    [...bs, ...vs].forEach(t => used.add(t.id));
  };

  if (id === 'contraB' || id === 'contraV') {
    const side: Side = id === 'contraB' ? 'B' : 'V'; const xs = side === 'B' ? B : V; considered = xs.length;
    xs.filter(r => isRev(r.type)).sort((a, b) => a.date - b.date).forEach(r => {
      if (used.has(r.id)) return;
      const base = FAMILY[r.type];
      const originals = free(xs).filter(o => o.type === base && Math.abs(o.amount + r.amount) < 0.005 && o.date <= r.date);
      const byRef = originals.find(o => base === 'PAY' ? o.refNorm && o.refNorm === r.refNorm : r.againstNorm && o.docNorm === r.againstNorm);
      if (byRef) return add(id, 'contra', 'Exact', 'Reversal references the original', side === 'B' ? [byRef, r] : [], side === 'V' ? [byRef, r] : [], `${typeName(r)} ${r.docNo || r.ref} reverses ${byRef.docNo || byRef.ref} (${base === 'PAY' ? 'same UTR' : 'named on the reversal'}); net zero.`);
      const bySuffix = originals.find(o => o.docNorm && r.docNorm.startsWith(o.docNorm) && /^(R|REV)\d*$/.test(r.docNorm.slice(o.docNorm.length)));
      if (bySuffix) return add(id, 'contra', 'Rule-based', 'Reversal number = original + R/REV', side === 'B' ? [bySuffix, r] : [], side === 'V' ? [bySuffix, r] : [], `${r.docNo} carries the original number ${bySuffix.docNo} with a reversal suffix; amounts net to zero.`);
      // Equal and opposite, but nothing ties them together: propose only, never close automatically.
      const near = originals.filter(o => r.date - o.date <= 60 * DAY).sort((a, b) => (r.date - a.date) - (r.date - b.date))[0];
      if (near) candidate(id, 'contra', side === 'B' ? [near, r] : [], side === 'V' ? [near, r] : [], 55, [`Equal and opposite ${TYPE_LABEL[base].toLowerCase()} amounts`, `${Math.round((r.date - near.date) / DAY)} days apart`, 'No reference links the reversal to the original: confirm before treating as contra']);
    });
  }

  // Cross-ledger: group by a key on both sides; a group closes only when the signed sums agree exactly.
  const byKey = (bs: Txn[], vs: Txn[], key: (t: Txn) => string | null, conf: (b: Txn[], v: Txn[]) => Confidence, rule: string, explain: (b: Txn[], v: Txn[], k: string) => string) => {
    const g = new Map<string, { b: Txn[]; v: Txn[] }>();
    free(bs).forEach(t => { const k = key(t); if (k) { const e = g.get(k) ?? { b: [], v: [] }; e.b.push(t); g.set(k, e); } });
    free(vs).forEach(t => { const k = key(t); if (k) { const e = g.get(k) ?? { b: [], v: [] }; e.v.push(t); g.set(k, e); } });
    [...g.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([k, e]) => { if (e.b.length && e.v.length && Math.abs(sum(e.b) - sum(e.v)) < 0.005) add(id, 'match', conf(e.b, e.v), rule, e.b, e.v, explain(e.b, e.v, k)); });
  };
  const sameRaw = (b: Txn[], v: Txn[]) => b.every(x => v.every(y => x.docNo.toUpperCase() === y.docNo.toUpperCase()));
  const shape = (b: Txn[], v: Txn[]) => `${b.length}:${v.length}`;

  if (id === 'invdn') {
    const bs = B.filter(t => t.type === 'INV' || t.type === 'DN'), vs = V.filter(t => t.type === 'INV' || t.type === 'DN'); considered = bs.length + vs.length;
    byKey(bs, vs, t => t.docNorm ? `${t.type}|${t.docNorm}` : null, (b, v) => sameRaw(b, v) ? 'Exact' : 'Rule-based', 'Document number, type and amount', (b, v) => sameRaw(b, v) ? `${TYPE_LABEL[b[0].type]} ${b[0].docNo} is identical on both sides, same amount.` : `${b[0].docNo} and ${v[0].docNo} differ only in formatting (key ${b[0].docNorm}); amounts agree.`);
  }
  if (id === 'cn') {
    const bs = B.filter(t => t.type === 'CN'), vs = V.filter(t => t.type === 'CN'); considered = bs.length + vs.length;
    // First, credit notes agreed in Credit Mapping: once the vendor's ledger carries that credit note number, match them.
    // Notes and credit numbers linked through agreements form one group; it closes only when the amounts agree.
    const ag = st.cnAgreed ?? {}; const root = new Map<string, string>(); const find = (x: string): string => { const r = root.get(x) ?? x; if (r === x) return x; const f = find(r); root.set(x, f); return f; };
    Object.entries(ag).forEach(([b, list]) => list.forEach(l => root.set(find(`B:${b}`), find(`C:${l.cnNorm}`))));
    byKey(bs, vs, t => t.side === 'B' ? (ag[t.id]?.length ? `CNAG|${find(`B:${t.id}`)}` : null) : (root.has(`C:${t.docNorm}`) || [...root.values()].includes(`C:${t.docNorm}`) ? `CNAG|${find(`C:${t.docNorm}`)}` : null),
      () => 'Rule-based', 'Credit note agreed in Credit Mapping', (b, v) => `${v.map(x => x.docNo).join(', ')} in the vendor's ledger was agreed in Credit Mapping against ${b.map(x => x.docNo).join(', ')}; amounts agree.`);
    byKey(bs, vs, t => t.docNorm ? `CN|${t.docNorm}` : null, (b, v) => sameRaw(b, v) ? 'Exact' : 'Rule-based', 'Credit note number and amount', (b, v) => `Credit note ${b[0].docNo}${sameRaw(b, v) ? '' : ` / ${v[0].docNo}`} on both sides, same amount.`);
    const inv = (t: Txn) => normRef(st.credit[t.id]?.invoiceDoc ?? t.against);
    byKey(bs, vs, t => inv(t) ? `CNINV|${inv(t)}|${Math.abs(t.amount).toFixed(2)}` : null, () => 'Rule-based', 'Original invoice and amount', (b, v) => `Different note numbers (${b[0].docNo} / ${v[0].docNo}) but both credit invoice ${st.credit[b[0].id]?.invoiceDoc ?? b[0].against} for the same amount.`);
  }
  if (id === 'pay') {
    const bs = B.filter(t => FAMILY[t.type] === 'PAY'), vs = V.filter(t => FAMILY[t.type] === 'PAY'); considered = bs.length + vs.length;
    byKey(bs, vs, t => t.refNorm ? `PAY|${t.refNorm}` : null, (b, v) => b.length === 1 && v.length === 1 ? 'Exact' : 'Rule-based', 'UTR / bank reference, sums agree', (b, v) => `UTR ${b[0].ref}: ${b.length} buyer ${b.length > 1 ? 'entries' : 'entry'} and ${v.length} vendor ${v.length > 1 ? 'entries' : 'entry'} (${shape(b, v)}) net to the same amount.`);
  }
  if (id === 'tds') {
    const bs = B.filter(t => FAMILY[t.type] === 'TDS'), vs = V.filter(t => FAMILY[t.type] === 'TDS'); considered = bs.length + vs.length;
    byKey(bs, vs, t => t.againstNorm ? `TDS|${t.againstNorm}` : null, () => 'Rule-based', 'TDS against the same invoice', (b) => `TDS on invoice ${b[0].against} booked by both sides for the same amount.`);
  }
  if (id === 'paytds') {
    // Buyer payment + TDS ↔ vendor single receipt (or the reverse), tied by invoice reference AND UTR, sums exact.
    const mk = (pay: Txn[], tds: Txn[], other: Txn[], sideIsBuyer: boolean) => {
      const invs = new Set(free(pay).map(t => t.againstNorm).filter(Boolean));
      invs.forEach(inv => {
        const ps = free(pay).filter(t => t.againstNorm === inv && t.type === 'PAY'); const ts = free(tds).filter(t => t.againstNorm === inv && t.type === 'TDS');
        const os = free(other).filter(t => t.againstNorm === inv && t.type === 'PAY');
        if (!ps.length || !ts.length || os.length !== 1) return;
        if (!ps.some(p => p.refNorm && p.refNorm === os[0].refNorm)) return; // supporting reference required
        const grp = [...ps, ...ts]; if (Math.abs(sum(grp) - os[0].amount) >= 0.005) return;
        add('paytds', 'match', 'Rule-based', 'Payment + TDS = receipt', sideIsBuyer ? grp : os, sideIsBuyer ? os : grp, `${sideIsBuyer ? 'Buyer' : 'Vendor'} paid ${Math.abs(sum(ps)).toFixed(2)} and booked TDS ${Math.abs(sum(ts)).toFixed(2)} on invoice ${ps[0].against}; the ${sideIsBuyer ? 'vendor' : 'buyer'} shows one entry of ${Math.abs(os[0].amount).toFixed(2)} with the same UTR.`);
      });
    };
    considered = B.filter(t => FAMILY[t.type] === 'PAY' || FAMILY[t.type] === 'TDS').length + V.filter(t => FAMILY[t.type] === 'PAY' || FAMILY[t.type] === 'TDS').length;
    mk(B.filter(t => t.type === 'PAY'), B.filter(t => t.type === 'TDS'), V, true);
    mk(V.filter(t => t.type === 'PAY'), V.filter(t => t.type === 'TDS'), B, false);
  }
  if (id === 'other') {
    considered = B.length + V.length;
    const patterns = learnedPatterns(st);
    const scored: { b: Txn; v: Txn; score: number; reasons: string[] }[] = [];
    free(B).filter(t => !isRev(t.type)).forEach(b => free(V).filter(v => FAMILY[v.type] === FAMILY[b.type] && !isRev(v.type)).forEach(v => {
      const reasons: string[] = []; let score = 0;
      const diff = Math.abs(b.amount - v.amount), rel = diff / Math.max(1, Math.abs(v.amount));
      if (diff < 0.005) { score += 40; reasons.push('Same amount'); } else if (rel <= 0.01) { score += 20; reasons.push(`Amounts within 1% (${diff.toFixed(2)} apart)`); } else return;
      const dd = Math.abs(b.date - v.date) / DAY;
      if (dd <= 3) { score += 20; reasons.push(`Dates ${Math.round(dd)} day(s) apart`); } else if (dd <= settings.dateWindow) { score += 10; reasons.push(`Dates ${Math.round(dd)} days apart`); }
      const bd = b.docNorm.replace(/\D/g, ''), vd = v.docNorm.replace(/\D/g, '');
      if (bd.length >= 3 && vd.length >= 3 && bd.slice(-3) === vd.slice(-3)) { score += 25; reasons.push(`Numbers end in the same digits (${bd.slice(-3)})`); }
      else if (similarity(b.docNorm, v.docNorm) >= 0.6) { score += 15; reasons.push('References look similar'); }
      const pk = `${prefix(b.docNorm)}>${prefix(v.docNorm)}`; const seen = patterns.get(pk);
      if (seen) { score += 15; reasons.push(`Pattern-assisted: buyer “${prefix(b.docNorm)}…” ↔ vendor “${prefix(v.docNorm)}…” confirmed ${seen} time(s) before`); }
      if (score >= settings.probableThreshold) scored.push({ b, v, score, reasons });
    }));
    scored.sort((a, b) => b.score - a.score || a.b.id.localeCompare(b.b.id)).forEach(c => { if (!used.has(c.b.id) && !used.has(c.v.id)) candidate('other', 'probable', [c.b], [c.v], Math.min(99, c.score), c.reasons); });
  }

  const made = st.matches.slice(before);
  const nowClosed = new Set(made.flatMap(m => [...m.buyerIds, ...m.vendorIds]));
  st.candidates = st.candidates.map(c => c.status === 'pending' && [...c.buyerIds, ...c.vendorIds].some(i => nowClosed.has(i)) ? { ...c, status: 'superseded', by: 'Engine', at } : c);
  // Value matched: the buyer side of a cross-ledger group, or the gross original amount of a contra pair.
  const value = (m: MatchRec) => { const tx = st.txns.filter(t => m.buyerIds.includes(t.id) || m.vendorIds.includes(t.id)); return m.kind === 'contra' ? tx.reduce((s, t) => s + Math.max(0, Math.abs(t.amount)), 0) / 2 : Math.abs(sum(tx.filter(t => t.side === 'B'))); };
  getPeriod(st, tag)!.stages[id] = { considered, matched: made.reduce((n, m) => n + m.buyerIds.length + m.vendorIds.length, 0), matchAmount: r2(made.reduce((s, m) => s + value(m), 0)), candidates: st.candidates.length - candBefore, at, by };
  log(st, by, at, tag, 'Run stage', `${STAGES.find(s => s.id === id)!.label}: ${made.length} match group(s), ${st.candidates.length - candBefore} candidate(s) for review`);
  return { ok: true, state: st };
}
const prefix = (s: string) => (s.match(/^[A-Z]+/) ?? [''])[0];
function similarity(a: string, b: string): number { if (!a || !b) return 0; let best = 0; for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) { let k = 0; while (a[i + k] && a[i + k] === b[j + k]) k++; best = Math.max(best, k); } return best / Math.max(a.length, b.length); }
/** Patterns from reviewer-confirmed "other" matches, e.g. buyer keys delivery challan numbers where the vendor uses invoice numbers. */
export function learnedPatterns(st: RelState): Map<string, number> {
  const m = new Map<string, number>(); const byId = new Map(st.txns.map(t => [t.id, t]));
  st.matches.filter(x => !x.reversed && x.stage === 'other').forEach(x => { const b = byId.get(x.buyerIds[0]), v = byId.get(x.vendorIds[0]); if (b && v) { const k = `${prefix(b.docNorm)}>${prefix(v.docNorm)}`; m.set(k, (m.get(k) ?? 0) + 1); } });
  return m;
}

// ---------- Review decisions ----------
export function decideCandidate(st0: RelState, id: string, accept: boolean, by: string, at: string): Result<RelState> {
  const c0 = st0.candidates.find(c => c.id === id); if (!c0 || c0.status !== 'pending') return fail('Candidate not found or already decided.');
  const p = getPeriod(st0, c0.periodTag); if (!p || locked(p)) return fail('Period is locked. Reopen it to change matches.');
  const st = clone(st0); const c = { ...c0, status: (accept ? 'confirmed' : 'rejected') as Candidate['status'], by, at }; st.candidates = st.candidates.map(x => x.id === id ? c : x);
  if (accept) {
    const tx = st.txns.filter(t => [...c.buyerIds, ...c.vendorIds].includes(t.id)); const b = tx.filter(t => t.side === 'B'), v = tx.filter(t => t.side === 'V');
    const closed = closedTxnIds(st0); if (tx.some(t => closed.has(t.id))) return fail('One of these transactions is already in a confirmed match.');
    // A pair that does not net to zero cannot close: the gap would vanish from the statement. Leave it open and deal with the difference.
    if (c.kind !== 'contra' && Math.abs(sum(b) - sum(v)) >= 0.005) return fail(`Amounts differ by ${r2(sum(b) - sum(v)).toFixed(2)}. Reject the suggestion and treat it as an amount difference, or record an adjustment for the gap.`);
    const dates = tx.map(t => t.date);
    st.matches.push({ id: nid(st, c.kind === 'contra' ? 'CT' : 'MT'), relId: st.rel.id, kind: c.kind === 'contra' ? 'contra' : 'match', stage: c.stage, rule: c.kind === 'contra' ? 'Contra confirmed by reviewer' : 'Probable match confirmed by reviewer', confidence: 'Probable', buyerIds: c.buyerIds, vendorIds: c.vendorIds, explanation: c.reasons.join('; '), amountDiff: r2(sum(b) - sum(v)), dateDiff: Math.round((Math.max(...dates) - Math.min(...dates)) / DAY), by, at, periodTag: c.periodTag, engine: ENGINE_VERSION });
  }
  log(st, by, at, c.periodTag, accept ? 'Confirm candidate' : 'Reject candidate', `${c.kind === 'contra' ? 'Contra' : 'Probable'} ${c.id} (${[...c.buyerIds, ...c.vendorIds].map(x => x.split(':').pop()).join(', ')})`);
  return { ok: true, state: st };
}
/** Reviewer-built match. Closes only if the group nets to zero; otherwise the difference must be dealt with explicitly. */
/** Matches open items by hand. With force, buyer and vendor items that do not net to zero are linked as a partial match instead of being refused. */
export function manualMatch(st0: RelState, tag: string, ids: string[], reason: string, by: string, at: string, force = false): Result<RelState> {
  const p = getPeriod(st0, tag); if (!p || locked(p)) return fail('Period is locked. Reopen it to change matches.');
  const tx = ids.map(i => st0.txns.find(t => t.id === i));
  if (tx.some(t => !t)) return fail('Transactions from another buyer–vendor relationship cannot be matched here (cross-vendor, cross-entity, cross-unit and cross-currency matches are blocked).');
  const closed = closedTxnIds(st0); if ((tx as Txn[]).some(t => closed.has(t.id))) return fail('A transaction is already in a confirmed match. Reverse that match first.');
  const open = new Set(openPool(st0, tag).map(t => t.id)); if ((tx as Txn[]).some(t => !open.has(t.id))) return fail('Only open items in this period can be matched.');
  const b = (tx as Txn[]).filter(t => t.side === 'B'), v = (tx as Txn[]).filter(t => t.side === 'V');
  if (!reason.trim()) return fail('Give a reason for the manual match.');
  const same = b.length && !v.length ? 'B' : v.length && !b.length ? 'V' : '';
  const net = same ? sum(tx as Txn[]) : r2(sum(b) - sum(v));
  const partial = Math.abs(net) >= 0.005;
  if (partial && (!force || same)) return fail(same ? `A contra must net to zero (difference ${net.toFixed(2)}).` : `These items do not net to zero (difference ${net.toFixed(2)}). Use force match to link them as a partial match, or record an adjustment for the difference.`);
  if ((tx as Txn[]).some(t => heldTxnIds(st0).has(t.id))) return fail('An item is already in a partial match. Reverse that match first.');
  const st = clone(st0); const dates = (tx as Txn[]).map(t => t.date);
  st.matches.push({ id: nid(st, same ? 'CT' : 'MT'), relId: st.rel.id, kind: same ? 'contra' : 'match', stage: 'manual', rule: same ? 'Manual contra' : partial ? `Forced partial match ${b.length}:${v.length}` : `Manual grouped match ${b.length}:${v.length}`, confidence: 'Manual', partial: partial || undefined, buyerIds: b.map(t => t.id), vendorIds: v.map(t => t.id), explanation: reason, amountDiff: partial ? net : 0, dateDiff: Math.round((Math.max(...dates) - Math.min(...dates)) / DAY), by, at, periodTag: tag, engine: ENGINE_VERSION });
  log(st, by, at, tag, 'Manual match', `${b.length} buyer + ${v.length} vendor item(s)`, { reason });
  return { ok: true, state: st };
}
/** Authorised reversal: the items reopen with their original period tags, and the reason is kept. */
export function reverseMatch(st0: RelState, matchId: string, tag: string, reason: string, by: string, at: string, canApprove: boolean): Result<RelState> {
  const m = st0.matches.find(x => x.id === matchId); if (!m || m.reversed) return fail('Match not found or already reversed.');
  const p = getPeriod(st0, tag); if (!p || locked(p)) return fail('Period is locked. Reopen it to reverse matches.');
  if (m.periodTag !== tag && !canApprove) return fail(`This match was confirmed in closed period ${m.periodTag}; only an approver can reverse it.`);
  if (!reason.trim()) return fail('A reason is required to reverse a match.');
  const st = clone(st0); st.matches = st.matches.map(x => x.id === matchId ? { ...x, reversed: { by, at, reason, periodTag: tag } } : x);
  log(st, by, at, tag, 'Reverse match', `${m.id} (${m.rule}) reversed; ${m.buyerIds.length + m.vendorIds.length} item(s) reopened with their original period tags`, { reason });
  return { ok: true, state: st };
}

// ---------- Stage 8: open items and exceptions ----------
export const CATEGORY_ACTION: Record<string, string> = {
  'Amount mismatch': 'Compare both copies of the document and correct whichever side keyed the wrong value.',
  'Payment amount mismatch': 'Agree the bank advice with the vendor and correct the receipt or payment posting.',
  'Suggested match pending': 'Review the suggested pair on the Reconciliation workbench and confirm or reject it.',
  'Possible contra pending': 'Confirm whether the reversal relates to this original before treating them as a contra pair.',
  'Not booked by vendor': 'Ask the vendor to confirm the document and book it, or confirm the buyer posting is wrong.',
  'Not booked by buyer': 'Obtain the document and proof of delivery; post it or ask the vendor to cancel it.',
  'Payment not credited by vendor': 'Share UTR and bank advice; ask the vendor to trace and credit the receipt.',
  'Receipt not recorded by buyer': 'Identify the remitter and post the payment, or ask the vendor to reallocate it.',
  'TDS not recognised by vendor': 'Share the TDS certificate (Form 16A) so the vendor books the TDS receivable.',
  'TDS not recorded by buyer': 'Check whether TDS was deducted; correct the buyer ledger or ask the vendor to reverse it.',
  'Credit/debit note not booked by vendor': 'Send the note with support and get the vendor to book it.',
  'Credit/debit note not booked by buyer': 'Obtain the note, map it to its invoice on Credit mapping, and post it.',
  'Reversal without original': 'Find the original entry the reversal belongs to.',
};
export interface OpenItem { txn: Txn; category: string; timing: boolean; ageDays: number; linked: string[]; candidateId?: string; carriedPeriods: string[]; ex: ExRec }
export function openItems(st: RelState, tag: string, settings: Settings): OpenItem[] {
  const p = getPeriod(st, tag)!; const pool = openPool(st, tag);
  const cand = new Map<string, Candidate>(); st.candidates.filter(c => c.status === 'pending').forEach(c => [...c.buyerIds, ...c.vendorIds].forEach(i => cand.set(i, c)));
  const B = pool.filter(t => t.side === 'B'), V = pool.filter(t => t.side === 'V');
  const pairDoc = (t: Txn) => (t.side === 'B' ? V : B).filter(o => o.type === t.type && o.docNorm && o.docNorm === t.docNorm).map(o => o.id);
  const pairUtr = (t: Txn) => (t.side === 'B' ? V : B).filter(o => FAMILY[o.type] === 'PAY' && o.refNorm && o.refNorm === t.refNorm).map(o => o.id);
  return pool.map(t => {
    const c = cand.get(t.id); const fam = FAMILY[t.type]; let linked: string[] = []; let category: string;
    if (c) { category = c.kind === 'contra' ? 'Possible contra pending' : 'Suggested match pending'; linked = [...c.buyerIds, ...c.vendorIds].filter(i => i !== t.id); }
    else if ((fam === 'INV' || fam === 'DN' || fam === 'CN') && !isRev(t.type) && (linked = pairDoc(t)).length) category = 'Amount mismatch';
    else if (fam === 'PAY' && (linked = pairUtr(t)).length) category = 'Payment amount mismatch';
    else if (isRev(t.type) && fam !== 'PAY') category = 'Reversal without original';
    else if (fam === 'INV') category = t.side === 'B' ? 'Not booked by vendor' : 'Not booked by buyer';
    else if (fam === 'PAY') category = t.side === 'B' ? 'Payment not credited by vendor' : 'Receipt not recorded by buyer';
    else if (fam === 'TDS') category = t.side === 'B' ? 'TDS not recognised by vendor' : 'TDS not recorded by buyer';
    else category = t.side === 'B' ? 'Credit/debit note not booked by vendor' : 'Credit/debit note not booked by buyer';
    const carriedPeriods = st.carry.filter(x => x.txnId === t.id).map(x => x.from);
    const ex = st.exceptions[t.id] ?? defaultEx(st, t, category);
    return { txn: t, category, timing: p.end - t.date <= settings.timingDays * DAY && t.importedIn === tag, ageDays: Math.max(0, Math.round((p.end - t.date) / DAY)), linked, candidateId: c?.id, carriedPeriods, ex: { ...ex, action: ex.action || CATEGORY_ACTION[category] } };
  }).sort((a, b) => tagKey(a.txn.originTag) - tagKey(b.txn.originTag) || a.txn.date - b.txn.date || a.txn.id.localeCompare(b.txn.id));
}
function defaultEx(st: RelState, t: Txn, category: string): ExRec {
  const a = Math.abs(t.amount); const big = st.rel.currency === 'INR' ? [100000, 25000] : [1500, 400];
  return { key: t.id, status: 'Open', owner: st.rel.owner, priority: a >= big[0] ? 'High' : a >= big[1] ? 'Medium' : 'Low', action: CATEGORY_ACTION[category] ?? '', resolutionRef: '', notes: [], evidence: [] };
}
export function updateException(st0: RelState, tag: string, txnId: string, patch: Partial<Pick<ExRec, 'status' | 'owner' | 'priority' | 'action'>>, by: string, at: string, settings: Settings, note?: string, evidence?: string): Result<RelState> {
  const p = getPeriod(st0, tag); if (!p || p.phase === 'closed') return fail('Closed periods are read-only.');
  if (patch.status && !MANUAL_STATUSES.includes(patch.status)) return fail('Resolved and closed statuses are set by a match or an approved adjustment, never by hand, so the ledger and the statement cannot drift apart.');
  const item = openItems(st0, tag, settings).find(o => o.txn.id === txnId); if (!item) return fail('Item is not open in this period.');
  const st = clone(st0); const cur = st.exceptions[txnId] ?? item.ex;
  const next: ExRec = { ...cur, ...patch, notes: note?.trim() ? [...cur.notes, { by, at, text: note.trim(), periodTag: tag }] : cur.notes, evidence: evidence?.trim() ? [...cur.evidence, { name: evidence.trim(), by, at }] : cur.evidence };
  st.exceptions[txnId] = next;
  const changes = (Object.keys(patch) as (keyof typeof patch)[]).filter(k => patch[k] !== cur[k]).map(k => `${k}: ${cur[k]} → ${patch[k]}`);
  log(st, by, at, tag, 'Exception updated', `${item.txn.docNo || item.txn.ref}: ${[...changes, note ? 'note added' : '', evidence ? `evidence “${evidence}” attached` : ''].filter(Boolean).join('; ')}`, changes.length ? { before: changes.map(c => c.split(' → ')[0]).join(', '), after: changes.map(c => c.split(' → ')[1]).join(', ') } : {});
  return { ok: true, state: st };
}
/** Accounting adjustment that settles open items: requested by a preparer, approved by an approver. */
export function proposeAdjustment(st0: RelState, tag: string, txnIds: string[], reason: string, evidence: string, by: string, at: string): Result<RelState> {
  const p = getPeriod(st0, tag); if (!p || locked(p)) return fail('Period is locked.');
  if (!reason.trim()) return fail('A reason is required.');
  const open = new Set(openPool(st0, tag).map(t => t.id)); if (!txnIds.length || txnIds.some(i => !open.has(i))) return fail('Only open items can be adjusted.');
  const st = clone(st0); const tx = st.txns.filter(t => txnIds.includes(t.id));
  const amount = r2(tx.filter(t => t.side === 'B').reduce((s, t) => s + t.amount, 0) - tx.filter(t => t.side === 'V').reduce((s, t) => s + t.amount, 0));
  st.adjustments.push({ id: nid(st, 'ADJ'), relId: st.rel.id, periodTag: tag, kind: 'accounting', side: 'B', amount, txnIds, reason, evidence, requestedBy: by, at, status: 'pending' });
  txnIds.forEach(i => { const cur = st.exceptions[i] ?? defaultEx(st, tx.find(t => t.id === i)!, ''); st.exceptions[i] = { ...cur, status: 'Awaiting Internal Approval', notes: [...cur.notes, { by, at, text: `Adjustment proposed: ${reason}`, periodTag: tag }] }; });
  log(st, by, at, tag, 'Adjustment proposed', `${amount.toFixed(2)} for ${txnIds.length} item(s)`, { reason, after: evidence });
  return { ok: true, state: st };
}
export function decideAdjustment(st0: RelState, adjId: string, approve: boolean, by: string, at: string, canApprove: boolean): Result<RelState> {
  if (!canApprove) return fail('Only an approver can approve or reject adjustments.');
  const a = st0.adjustments.find(x => x.id === adjId); if (!a || a.status !== 'pending') return fail('Adjustment not pending.');
  if (a.requestedBy === by) return fail('The person who proposed an adjustment cannot approve it (segregation of duties).');
  const p = getPeriod(st0, a.periodTag); if (!p || locked(p)) return fail('Period is locked.');
  const st = clone(st0); st.adjustments = st.adjustments.map(x => x.id === adjId ? { ...x, status: approve ? 'approved' : 'rejected', approvedBy: by } : x);
  if (approve) {
    st.matches.push({ id: nid(st, 'AJ'), relId: st.rel.id, kind: 'adjustment', stage: 'adjustment', rule: `Settled by adjustment ${a.id}`, confidence: 'Manual', buyerIds: a.txnIds.filter(i => i.includes(':B:')), vendorIds: a.txnIds.filter(i => i.includes(':V:')), explanation: a.reason, amountDiff: a.amount, dateDiff: 0, by, at, periodTag: a.periodTag, engine: ENGINE_VERSION });
    a.txnIds.forEach(i => { const cur = st.exceptions[i]; if (cur) st.exceptions[i] = { ...cur, status: 'Closed', resolutionRef: a.id, closedAt: at }; });
  } else a.txnIds.forEach(i => { const cur = st.exceptions[i]; if (cur) st.exceptions[i] = { ...cur, status: 'Under Investigation' }; });
  log(st, by, at, a.periodTag, approve ? 'Adjustment approved' : 'Adjustment rejected', `${a.id} ${a.amount.toFixed(2)}`, { reason: a.reason });
  return { ok: true, state: st };
}

// ---------- Statement, bridge and annexures ----------
export interface AnnexRow { txnId: string; docNo: string; date: number; type: string; originTag: string; buyerAmount: number | null; vendorAmount: number | null; outstanding: number; reference: string; category: string; remarks: string; status: string; carried: number }
export interface Statement {
  relId: string; tag: string; version: number; generatedAt: string; currency: string;
  buyerOpening: number | null; vendorOpening: number | null; buyerClosing: number | null; vendorClosing: number | null; difference: number | null;
  openB: number; openV: number; openNet: number; countB: number; countV: number;
  adjustments: { id: string; kind: AdjKind; side: Side; amount: number; effect: number; reason: string; approvedBy?: string; periodTag: string }[]; adjEffect: number;
  unexplained: number | null; tolerance: number; withinTolerance: boolean; balanced: boolean;
  annexures: { n: number; tag: string; rows: AnnexRow[]; totalB: number; totalV: number; net: number }[];
  matched: number; contras: number; pendingCandidates: number;
}
export function statement(st: RelState, tag: string, settings: Settings, at = ''): Statement {
  const p = getPeriod(st, tag)!; const idx = periodIndex(st, tag);
  const items = openItems(st, tag, settings);
  const openB = r2(items.filter(i => i.txn.side === 'B').reduce((s, i) => s + i.txn.amount, 0)), openV = r2(items.filter(i => i.txn.side === 'V').reduce((s, i) => s + i.txn.amount, 0));
  const order = new Map(st.periods.map((q, i) => [q.tag, i]));
  const adjs = st.adjustments.filter(a => a.status === 'approved' && (order.get(a.periodTag) ?? 99) <= idx).map(a => {
    // Settlement adjustments carry the settled items' contribution; others carry their own amount on the side they belong to.
    const settled = a.txnIds.length ? r2(st.txns.filter(t => a.txnIds.includes(t.id)).reduce((s, t) => s + (t.side === 'B' ? t.amount : -t.amount), 0)) : null;
    const effect = settled ?? (a.kind === 'accounting' ? -a.amount : a.side === 'B' ? a.amount : -a.amount);
    return { id: a.id, kind: a.kind, side: a.side, amount: a.amount, effect: r2(effect), reason: a.reason, approvedBy: a.approvedBy, periodTag: a.periodTag };
  });
  const adjEffect = r2(adjs.reduce((s, a) => s + a.effect, 0));
  const difference = p.closing.B !== null && p.closing.V !== null ? r2(p.closing.B - p.closing.V) : null;
  const unexplained = difference === null ? null : r2(difference - (openB - openV) - adjEffect);
  const tol = settings.tolerance[st.rel.currency] ?? 0;
  const tags = [...new Set(items.map(i => i.txn.originTag))].sort((a, b) => tagKey(a) - tagKey(b));
  const annexures = tags.map((t, n) => {
    const rows: AnnexRow[] = items.filter(i => i.txn.originTag === t).map(i => ({ txnId: i.txn.id, docNo: i.txn.docNo || i.txn.ref, date: i.txn.date, type: typeName(i.txn), originTag: i.txn.originTag, buyerAmount: i.txn.side === 'B' ? i.txn.amount : null, vendorAmount: i.txn.side === 'V' ? i.txn.amount : null, outstanding: i.txn.side === 'B' ? i.txn.amount : -i.txn.amount, reference: [i.txn.ref, i.txn.against].filter(Boolean).join(' · '), category: i.category + (i.timing ? ' (timing)' : ''), remarks: i.ex.notes[i.ex.notes.length - 1]?.text ?? '', status: i.ex.status, carried: i.carriedPeriods.length }));
    const totalB = r2(rows.reduce((s, x) => s + (x.buyerAmount ?? 0), 0)), totalV = r2(rows.reduce((s, x) => s + (x.vendorAmount ?? 0), 0));
    return { n: n + 1, tag: t, rows, totalB, totalV, net: r2(totalB - totalV) };
  });
  const active = st.matches.filter(m => !m.reversed);
  return { relId: st.rel.id, tag, version: p.version, generatedAt: at, currency: st.rel.currency, buyerOpening: p.opening.B, vendorOpening: p.opening.V, buyerClosing: p.closing.B, vendorClosing: p.closing.V, difference, openB, openV, openNet: r2(openB - openV), countB: items.filter(i => i.txn.side === 'B').length, countV: items.filter(i => i.txn.side === 'V').length, adjustments: adjs, adjEffect, unexplained, tolerance: tol, withinTolerance: unexplained !== null && Math.abs(unexplained) <= tol, balanced: unexplained !== null && Math.abs(unexplained) < 0.005, annexures, matched: active.filter(m => m.kind === 'match').length, contras: active.filter(m => m.kind === 'contra').length, pendingCandidates: st.candidates.filter(c => c.status === 'pending').length };
}
/** Rounding: only within tolerance, only by an approver, always with a reason. */
export function approveRounding(st0: RelState, tag: string, reason: string, by: string, at: string, settings: Settings, canApprove: boolean): Result<RelState> {
  if (!canApprove) return fail('Only an approver can record a rounding adjustment.');
  const p = getPeriod(st0, tag); if (!p || locked(p)) return fail('Period is locked.');
  const s = statement(st0, tag, settings); if (s.unexplained === null || s.balanced) return fail('There is no unexplained difference.');
  if (!s.withinTolerance) return fail(`Unexplained difference ${s.unexplained.toFixed(2)} is above the ${s.tolerance} tolerance; it must be investigated, not rounded.`);
  if (!reason.trim()) return fail('A reason is required.');
  const st = clone(st0); st.adjustments.push({ id: nid(st, 'ADJ'), relId: st.rel.id, periodTag: tag, kind: 'rounding', side: 'B', amount: s.unexplained, txnIds: [], reason, evidence: '', requestedBy: by, approvedBy: by, at, status: 'approved' });
  log(st, by, at, tag, 'Rounding adjustment', `${s.unexplained.toFixed(2)} recorded (tolerance ${s.tolerance})`, { reason });
  return { ok: true, state: st };
}

// ---------- Workflow: review, sign-off, close, carry-forward ----------
export type WfStatus = 'Awaiting ledgers' | 'Opening check' | 'Matching' | 'In review' | 'Statement prepared' | 'With vendor' | 'Vendor accepted' | 'Vendor disputed' | 'Signed off' | 'Closed';
export function status(st: RelState, tag: string, settings: Settings): WfStatus {
  const p = getPeriod(st, tag)!;
  const map: Partial<Record<Phase, WfStatus>> = { prepared: 'Statement prepared', shared: 'With vendor', accepted: 'Vendor accepted', disputed: 'Vendor disputed', signed: 'Signed off', closed: 'Closed' };
  if (map[p.phase]) return map[p.phase]!;
  if (!p.imports.B || !p.imports.V) return 'Awaiting ledgers';
  if (!gate(st, tag).passed) return 'Opening check';
  const need = STAGES.filter(s => !s.optional || settings.stages[s.optional]);
  return need.every(s => p.stages[s.id]) ? 'In review' : 'Matching';
}
function phaseTo(st0: RelState, tag: string, from: Phase[], to: Phase, ev: SignEvent['event'], by: string, at: string, comments: string, rep?: string): Result<RelState> {
  const p0 = getPeriod(st0, tag); if (!p0) return fail('Unknown period');
  if (!from.includes(p0.phase)) return fail(`Not allowed from the current status.`);
  const st = clone(st0); const p = getPeriod(st, tag)!; p.phase = to; p.signoffs.push({ version: p.version, event: ev, by, rep, at, comments });
  return { ok: true, state: st };
}
export function prepare(st0: RelState, tag: string, settings: Settings, by: string, at: string): Result<RelState> {
  if (status(st0, tag, settings) !== 'In review') return fail('Run every matching stage before preparing the statement.');
  const s = statement(st0, tag, settings, at);
  if (!s.balanced) return fail(s.withinTolerance ? `Unexplained difference of ${s.unexplained?.toFixed(2)} is within tolerance but must be approved as rounding first.` : `Unexplained difference of ${s.unexplained?.toFixed(2)} must be investigated before the statement can be prepared.`);
  const r = phaseTo(st0, tag, ['working'], 'prepared', 'prepared', by, at, `Statement v${getPeriod(st0, tag)!.version} prepared and reviewed by buyer`); if (!r.ok) return r;
  const p = getPeriod(r.state, tag)!; p.snapshot = s; p.dates.prepared = at; log(r.state, by, at, tag, 'Statement prepared', `Version ${p.version}: ${s.countB + s.countV} open items in ${s.annexures.length} annexure(s)`);
  return r;
}
export function share(st0: RelState, tag: string, by: string, at: string): Result<RelState> {
  const r = phaseTo(st0, tag, ['prepared'], 'shared', 'shared', by, at, 'Statement and annexures shared with vendor'); if (!r.ok) return r;
  getPeriod(r.state, tag)!.dates.shared = at; log(r.state, by, at, tag, 'Shared with vendor', `Version ${getPeriod(r.state, tag)!.version}`); return r;
}
export function vendorResponse(st0: RelState, tag: string, accept: boolean, rep: string, comments: string, by: string, at: string): Result<RelState> {
  if (!rep.trim()) return fail('Record the vendor representative.');
  if (!accept && !comments.trim()) return fail('Record what the vendor disputes.');
  const r = phaseTo(st0, tag, ['shared'], accept ? 'accepted' : 'disputed', accept ? 'accepted' : 'disputed', by, at, comments, rep); if (!r.ok) return r;
  if (accept) getPeriod(r.state, tag)!.dates.vendorSignoff = at;
  log(r.state, by, at, tag, accept ? 'Vendor accepted' : 'Vendor disputed', `${rep}: ${comments || 'accepted without comment'}`); return r;
}
export function finalSignoff(st0: RelState, tag: string, by: string, at: string, canApprove: boolean): Result<RelState> {
  if (!canApprove) return fail('Final sign-off needs an approver.');
  const r = phaseTo(st0, tag, ['accepted'], 'signed', 'signed', by, at, 'Final sign-off captured'); if (!r.ok) return r;
  log(r.state, by, at, tag, 'Signed off', `Version ${getPeriod(r.state, tag)!.version} signed`); return r;
}
/** Any change after preparation or sign-off goes through reopening, which creates a new version. */
export function reopen(st0: RelState, tag: string, reason: string, by: string, at: string, canApprove: boolean): Result<RelState> {
  if (!canApprove) return fail('Only an approver can reopen a prepared or signed reconciliation.');
  if (!reason.trim()) return fail('A reason is required to reopen.');
  const p0 = getPeriod(st0, tag); if (!p0 || p0.phase === 'working' || p0.phase === 'closed') return fail('Only prepared, shared, disputed, accepted or signed periods can be reopened.');
  const st = clone(st0); const p = getPeriod(st, tag)!; p.version += 1; p.phase = 'working'; p.signoffs.push({ version: p.version, event: 'reopened', by, at, comments: reason });
  log(st, by, at, tag, 'Reopened', `Now version ${p.version}`, { reason }); return { ok: true, state: st };
}
export function closePeriod(st0: RelState, tag: string, next: PeriodDef | undefined, settings: Settings, by: string, at: string, canApprove: boolean): Result<RelState> {
  if (!canApprove) return fail('Closing a period needs an approver.');
  const p0 = getPeriod(st0, tag); if (!p0 || p0.phase !== 'signed') return fail('Only a signed-off period can be closed.');
  if (periodIndex(st0, tag) !== st0.periods.length - 1) return fail('Only the latest period can be closed.');
  // Compute everything first, then apply in one step so closure and carry-forward cannot half-happen.
  const snap = statement(st0, tag, settings, at); const items = openItems(st0, tag, settings);
  const st = clone(st0); const p = getPeriod(st, tag)!;
  p.phase = 'closed'; p.snapshot = snap; p.dates.closed = at; p.carriedOut = items.map(i => i.txn.id); p.signoffs.push({ version: p.version, event: 'closed', by, at, comments: `${items.length} open item(s) carried forward` });
  if (next) {
    items.forEach(i => st.carry.push({ txnId: i.txn.id, from: tag, to: next.tag, at }));
    st.periods.push(blankPeriod(next, { B: p.closing.B ?? 0, V: p.closing.V ?? 0 }, items.map(i => i.txn.id)));
  }
  log(st, by, at, tag, 'Period closed', `${items.length} open item(s) carried to ${next?.tag ?? '(next period not yet defined)'}; ${snap.matched} matches and ${snap.contras} contras preserved`);
  return { ok: true, state: st };
}

/**
 * Balance confirmation: the vendor agreed our closing balance, so this period needs no reconciliation. It closes as
 * confirmed; its open items stay recorded where they are and are not carried forward. The next period opens from the
 * confirmed balance on both sides, so only its own movements are reconciled.
 */
export function confirmBalance(st0: RelState, tag: string, balance: number, next: PeriodDef | undefined, certNo: string, rep: string, by: string, at: string): Result<RelState> {
  const p0 = getPeriod(st0, tag); if (!p0) return fail('Unknown period');
  if (periodIndex(st0, tag) !== st0.periods.length - 1) return fail('Only the latest period can be confirmed.');
  if (p0.phase === 'closed') return fail('This period is already closed.');
  const st = clone(st0); const p = getPeriod(st, tag)!;
  p.phase = 'closed'; p.confirmed = { certNo, balance, rep, at }; p.dates.closed = at; p.dates.vendorSignoff = at;
  p.signoffs.push({ version: p.version, event: 'closed', by, rep, at, comments: `Closed by balance confirmation ${certNo}. No reconciliation required` });
  if (next) st.periods.push(blankPeriod(next, { B: p.closing.B ?? balance, V: balance }, []));
  log(st, by, at, tag, 'Balance confirmed', `${rep} confirmed the closing balance of ${balance.toFixed(2)} (${certNo}); period closed without reconciliation${next ? `, ${next.tag} opens from the confirmed balance` : ''}`);
  return { ok: true, state: st };
}

/** Buyer notes whose agreed credit notes (Credit Mapping) cover the full amount. */
export function agreedNotes(st: RelState): Set<string> {
  const s = new Set<string>(); const byId = new Map(st.txns.map(t => [t.id, t]));
  Object.entries(st.cnAgreed ?? {}).forEach(([id, l]) => { const t = byId.get(id); if (t && Math.abs(l.reduce((a, x) => a + x.amount, 0) - Math.abs(t.amount)) < 0.005) s.add(id); });
  return s;
}
/**
 * Records (add) or withdraws (remove) a credit note the buyer accepted in Credit Mapping. The vendor's ledger stays the
 * source of truth: nothing is matched here. The credit-note stage matches it once that number appears in the vendor's ledger.
 */
export function setAgreedCn(st0: RelState, tag: string, alloc: { id: string; amount: number }[], cn: string, ref: string, add: boolean, by: string, at: string, reason = ''): Result<RelState> {
  if (!cn.trim()) return fail('A credit note number is required.');
  const known = new Set(st0.txns.filter(t => t.side === 'B' && FAMILY[t.type] === 'CN').map(t => t.id));
  if (!alloc.length || alloc.some(a => !known.has(a.id))) return fail('Only buyer debit and credit notes can be mapped.');
  const st = clone(st0); const ag = st.cnAgreed ?? (st.cnAgreed = {}); const cnNorm = normRef(cn);
  alloc.forEach(a => { const l = (ag[a.id] ?? []).filter(x => x.ref !== ref); if (add) l.push({ cn, cnNorm, amount: r2(a.amount), ref }); if (l.length) ag[a.id] = l; else delete ag[a.id]; });
  const docs = alloc.map(a => st.txns.find(t => t.id === a.id)?.docNo).join(', ');
  log(st, by, at, tag, add ? 'Credit note agreed' : 'Credit note reopened', `${cn} ${add ? 'agreed against' : 'withdrawn from'} ${docs} in Credit Mapping (${ref})`, reason ? { reason } : {});
  return { ok: true, state: st };
}

// ---------- Credit / debit note mapping ----------
// Every credit or debit note is tied to the invoice it adjusts. The credit-note stage uses this mapping when note numbers differ.
export interface NoteRow { note: Txn; map?: CreditMap; invoice?: Txn; suggestion?: { invoice: Txn; reason: string }; status: 'Mapped' | 'Suggested' | 'Unmapped'; open: boolean }
export function noteMappings(st: RelState, tag: string): NoteRow[] {
  const idx = periodIndex(st, tag); const order = new Map(st.periods.map((p, i) => [p.tag, i]));
  const tx = st.txns.filter(t => (order.get(t.importedIn) ?? 99) <= idx);
  const open = new Set(openPool(st, tag).map(t => t.id));
  const invs = tx.filter(t => t.type === 'INV');
  return tx.filter(t => t.type === 'CN' || t.type === 'DN').map(note => {
    const map = st.credit[note.id]; const sameSide = invs.filter(i => i.side === note.side);
    const invoice = map ? sameSide.find(i => normRef(i.docNo) === normRef(map.invoiceDoc)) : undefined;
    if (map) return { note, map, invoice, status: 'Mapped' as const, open: open.has(note.id) };
    // Strongest clue: the other side holds a note for the same amount that names its invoice, and that invoice exists here.
    const twin = tx.find(o => o.side !== note.side && o.type === note.type && Math.abs(o.amount - (note.side === 'B' ? note.amount : note.amount)) < 0.005 && o.against);
    const viaTwin = twin && sameSide.find(i => i.docNorm === twin.againstNorm);
    if (viaTwin) return { note, suggestion: { invoice: viaTwin, reason: `The ${note.side === 'B' ? 'vendor' : 'buyer'}’s ${typeName(note).toLowerCase()} ${twin!.docNo} for the same amount names this invoice` }, status: 'Suggested' as const, open: open.has(note.id) };
    const near = sameSide.filter(i => i.date <= note.date && i.amount >= Math.abs(note.amount)).sort((a, b) => b.date - a.date)[0];
    return near ? { note, suggestion: { invoice: near, reason: 'Most recent earlier invoice large enough to carry the note' }, status: 'Suggested' as const, open: open.has(note.id) } : { note, status: 'Unmapped' as const, open: open.has(note.id) };
  });
}
export function mapNote(st0: RelState, tag: string, noteId: string, invoiceDoc: string, method: CreditMap['method'], by: string, at: string): Result<RelState> {
  const p = getPeriod(st0, tag); if (!p || locked(p)) return fail('Period is locked.');
  const note = st0.txns.find(t => t.id === noteId); if (!note) return fail('Note not found.');
  if (!st0.txns.some(t => t.side === note.side && t.type === 'INV' && normRef(t.docNo) === normRef(invoiceDoc))) return fail('That invoice is not in this relationship’s ledger on the same side.');
  const st = clone(st0); const before = st.credit[noteId]?.invoiceDoc;
  st.credit[noteId] = { invoiceDoc, method, by, at };
  log(st, by, at, tag, 'Credit mapping', `${typeName(note)} ${note.docNo} → invoice ${invoiceDoc} (${method})`, { before: before ?? '(none)', after: invoiceDoc });
  return { ok: true, state: st };
}
