// Credit Mapping: buyer debit notes (and credit notes we booked) waiting for the vendor's credit note.
// The vendor (L1) submits credit note details against one or more notes; the buyer (L2) accepts, rejects or reopens.
// An accepted credit note is an agreement only: the vendor's ledger stays the source of truth, and reconciliation matches
// the note once that credit note number appears in it.
import { FAMILY, closedTxnIds, periodIndex, r2, type RelState, type Txn, type MatchRec } from './cycle';

export type DocType = 'Credit note' | 'Vendor debit' | 'Refund';
/** Sign as it sits in the vendor's books: credit notes reduce what is owed, vendor debits and refunds add. */
export const docSign = (d: DocType) => d === 'Credit note' ? -1 : 1;
/** How much a document clears on the buyer's notes: credit notes and refunds clear, a vendor debit adds back. */
export const clears = (c: Pick<CnDoc, 'docType' | 'total'>) => (c.docType === 'Vendor debit' ? -1 : 1) * c.total;
export const docKind = (d?: DocType) => d === 'Vendor debit' ? 'vd' as const : d === 'Refund' ? 'refund' as const : 'cn' as const;
export interface CnDoc { docType?: DocType; no: string; date: string; kind: 'Taxable' | 'Non-taxable'; taxable: number; cgst: number; sgst: number; igst: number; total: number; irn: string; file?: string; fileSize?: number }
export type CnStatus = 'Submitted' | 'Accepted' | 'Rejected' | 'Reopened';
export interface CnLog { at: string; by: string; what: string }
export interface CnSub {
  id: string; relId: string; tag: string; buyerIds: string[]; cn: CnDoc; status: CnStatus; via: 'Form' | 'Bulk upload' | 'Buyer entry'; bulkId?: string;
  by: string; at: string; reason?: string; decidedBy?: string; decidedAt?: string; alloc?: { id: string; amount: number }[]; log: CnLog[];
}
export interface BulkReq { id: string; relId: string; file: string; rows: number; subs: string[]; by: string; at: string }

export type ItemState = 'Open' | 'Partly mapped' | 'Over-credited' | 'Submitted' | 'Rejected' | 'Mapped';
export interface CItem {
  t: Txn; kind: string; amount: number; agreed: number; diff: number; state: ItemState; source?: 'Vendor ledger' | 'Credit Mapping';
  subs: CnSub[]; match?: MatchRec; vendorCns: Txn[]; cnNos: string[]; mappedOn?: string; mapping: string;
}

/** "Claims", "Quantity", "Price" for a buyer debit note; "Credit note" for one we booked. */
export const kindOf = (t: Txn) => { const m = /^Debit Note - (\w+)/i.exec(t.raw['Type'] ?? ''); return m ? m[1] : 'Credit note'; };
export const kindLabel = (k: string) => k === 'Credit note' ? 'Credit note booked by buyer' : `Debit note · ${k}`;

/**
 * How much of a document goes to each note. A credit note or refund fills notes in order up to what is open; anything
 * beyond lands on the last note as an over-credit. A vendor debit first takes back over-credits, then sits on the first note.
 */
export function allocate(sub: Pick<CnSub, 'buyerIds' | 'cn'>, remaining: (id: string) => number) {
  const ids = sub.buyerIds; const out = ids.map(id => ({ id, amount: 0 }));
  if (sub.cn.docType === 'Vendor debit') {
    let left = sub.cn.total; out.forEach(o => { const over = Math.max(0, -remaining(o.id)); const a = r2(Math.min(left, over)); o.amount = -a; left = r2(left - a); });
    if (left > 0 && out.length) out[0].amount = r2(out[0].amount - left); return out;
  }
  let left = sub.cn.total; out.forEach(o => { const a = r2(Math.max(0, Math.min(left, remaining(o.id)))); o.amount = a; left = r2(left - a); });
  if (left > 0 && out.length) out[out.length - 1].amount = r2(out[out.length - 1].amount + left); return out;
}

/** Every buyer note up to the selected period, with where it stands in Credit Mapping. */
export function creditItems(st: RelState, tag: string, subs: CnSub[]): CItem[] {
  const idx = periodIndex(st, tag); const order = new Map(st.periods.map((p, i) => [p.tag, i])); const closed = closedTxnIds(st); const byId = new Map(st.txns.map(t => [t.id, t]));
  const notes = st.txns.filter(t => t.side === 'B' && FAMILY[t.type] === 'CN' && t.type === 'CN' && (order.get(t.importedIn) ?? 99) <= idx);
  const mine = subs.filter(s => s.relId === st.rel.id);
  return notes.map((t): CItem => {
    const s = mine.filter(x => x.buyerIds.includes(t.id)); const amount = Math.abs(t.amount); const kind = kindOf(t);
    const agreedList = (st.cnAgreed ?? {})[t.id] ?? []; const agreed = r2(agreedList.reduce((a, x) => a + x.amount, 0));
    const m = st.matches.find(x => !x.reversed && !x.partial && x.buyerIds.includes(t.id));
    if (closed.has(t.id) && m) {
      const vendorCns = m.vendorIds.map(i => byId.get(i)!).filter(Boolean);
      return { t, kind, amount, agreed, diff: 0, state: 'Mapped', source: 'Vendor ledger', subs: s, match: m, vendorCns, cnNos: vendorCns.map(v => v.docNo), mappedOn: m.at, mapping: shape(m.buyerIds.length, m.vendorIds.length) };
    }
    const acc = s.filter(x => x.status === 'Accepted'); const cnNos = agreedList.map(x => x.cn);
    const many = acc.some(x => x.buyerIds.length > 1);
    const mapping = shape(many ? 2 : 1, Math.max(1, agreedList.length));
    if (agreed > 0 && Math.abs(agreed - amount) < 0.005) return { t, kind, amount, agreed, diff: 0, state: 'Mapped', source: 'Credit Mapping', subs: s, vendorCns: [], cnNos, mappedOn: acc[acc.length - 1]?.decidedAt, mapping };
    const diff = r2(amount - agreed);
    const state: ItemState = s.some(x => x.status === 'Submitted') ? 'Submitted' : diff < -0.005 ? 'Over-credited' : agreed > 0 ? 'Partly mapped' : s.length && s[s.length - 1].status === 'Rejected' ? 'Rejected' : 'Open';
    return { t, kind, amount, agreed, diff, state, subs: s, vendorCns: [], cnNos, mapping };
  }).sort((a, b) => b.t.date - a.t.date);
}
const shape = (b: number, v: number) => b > 1 && v > 1 ? 'Many-to-many' : b > 1 ? 'Many-to-one' : v > 1 ? 'One-to-many' : 'One-to-one';
export const mappingOf = (sub: CnSub) => sub.buyerIds.length > 1 ? 'Many-to-one' : 'One-to-one';
