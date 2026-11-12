// Credit Mapping: buyer debit notes (and credit notes we booked) waiting for the vendor's credit note.
// The vendor (L1) submits credit note details against one or more notes; the buyer (L2) accepts, rejects or reopens.
// An accepted credit note is an agreement only: the vendor's ledger stays the source of truth, and reconciliation matches
// the note once that credit note number appears in it.
import { FAMILY, closedTxnIds, periodIndex, r2, type RelState, type Txn, type MatchRec } from './cycle';

export interface CnDoc { no: string; date: string; kind: 'Taxable' | 'Non-taxable'; taxable: number; cgst: number; sgst: number; igst: number; total: number; irn: string; file?: string; fileSize?: number }
export type CnStatus = 'Submitted' | 'Accepted' | 'Rejected' | 'Reopened';
export interface CnLog { at: string; by: string; what: string }
export interface CnSub {
  id: string; relId: string; tag: string; buyerIds: string[]; cn: CnDoc; status: CnStatus; via: 'Form' | 'Bulk upload' | 'Buyer entry'; bulkId?: string;
  by: string; at: string; reason?: string; decidedBy?: string; decidedAt?: string; alloc?: { id: string; amount: number }[]; log: CnLog[];
}
export interface BulkReq { id: string; relId: string; file: string; rows: number; subs: string[]; by: string; at: string }

export type ItemState = 'Open' | 'Partly mapped' | 'Submitted' | 'Rejected' | 'Mapped';
export interface CItem {
  t: Txn; kind: string; amount: number; agreed: number; diff: number; state: ItemState; source?: 'Vendor ledger' | 'Credit Mapping';
  subs: CnSub[]; match?: MatchRec; vendorCns: Txn[]; cnNos: string[]; mappedOn?: string; mapping: string;
}

/** "Claims", "Quantity", "Price" for a buyer debit note; "Credit note" for one we booked. */
export const kindOf = (t: Txn) => { const m = /^Debit Note - (\w+)/i.exec(t.raw['Type'] ?? ''); return m ? m[1] : 'Credit note'; };
export const kindLabel = (k: string) => k === 'Credit note' ? 'Credit note booked by buyer' : `Debit note · ${k}`;

/** How much of a credit note goes to each note: in order, each up to what is still open on it. */
export function allocate(sub: Pick<CnSub, 'buyerIds' | 'cn'>, remaining: (id: string) => number) {
  let left = sub.cn.total; return sub.buyerIds.map(id => { const a = r2(Math.max(0, Math.min(left, remaining(id)))); left = r2(left - a); return { id, amount: a }; });
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
    const state: ItemState = s.some(x => x.status === 'Submitted') ? 'Submitted' : agreed > 0 ? 'Partly mapped' : s.length && s[s.length - 1].status === 'Rejected' ? 'Rejected' : 'Open';
    return { t, kind, amount, agreed, diff, state, subs: s, vendorCns: [], cnNos, mapping };
  }).sort((a, b) => b.t.date - a.t.date);
}
const shape = (b: number, v: number) => b > 1 && v > 1 ? 'Many-to-many' : b > 1 ? 'Many-to-one' : v > 1 ? 'One-to-many' : 'One-to-one';
export const mappingOf = (sub: CnSub) => sub.buyerIds.length > 1 ? 'Many-to-one' : 'One-to-one';
