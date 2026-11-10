// Which statement annexure an unreconciled item belongs to. Shared by the statement and the Unreconciled screen so the two always agree.
import { FAMILY, type Txn } from './cycle';

export interface Info { fam: string; side: 'B' | 'V'; held: boolean; timing: boolean }
const INVF = ['INV', 'DN'];
export const SECT: { n: number; sub?: string; title: string; fam: string[]; t: (i: Info) => boolean }[] = [
  { n: 1, title: 'Invoices subsequently accounted by buyer', fam: INVF, t: i => i.side === 'V' && i.timing && !i.held },
  { n: 2, title: 'Invoices not accounted by buyer', fam: INVF, t: i => i.side === 'V' && !i.timing && !i.held },
  { n: 3, title: 'Invoices partially matched', fam: INVF, t: i => i.held },
  { n: 4, title: 'Invoices not accounted by vendor', fam: INVF, t: i => i.side === 'B' && !i.held },
  { n: 5, sub: 'a', title: 'Credit notes subsequently or not accounted by buyer', fam: ['CN'], t: i => i.side === 'V' && !i.held },
  { n: 5, sub: 'b', title: 'Credit notes partially matched', fam: ['CN'], t: i => i.held },
  { n: 5, sub: 'c', title: 'Credit notes subsequently or not accounted by vendor', fam: ['CN'], t: i => i.side === 'B' && !i.held },
  { n: 6, title: 'Payments not accounted by buyer', fam: ['PAY'], t: i => i.side === 'V' && !i.held },
  { n: 7, title: 'Payments partially matched', fam: ['PAY'], t: i => i.held },
  { n: 8, title: 'Payments not accounted by vendor', fam: ['PAY'], t: i => i.side === 'B' && !i.held },
  { n: 9, sub: 'a', title: 'TDS not accounted by buyer', fam: ['TDS'], t: i => i.side === 'V' && !i.held },
  { n: 9, sub: 'b', title: 'TDS partially matched', fam: ['TDS'], t: i => i.held },
  { n: 9, sub: 'c', title: 'TDS not accounted by vendor', fam: ['TDS'], t: i => i.side === 'B' && !i.held },
];
export const sectionOf = (i: Info) => SECT.find(d => d.fam.includes(i.fam) && d.t(i));
/** "Annexure 4 · M092026": the annexure number and the annexure (original period) tag. */
export function annexOf(t: Txn, held: Set<string>, timing: boolean): string {
  const d = sectionOf({ fam: FAMILY[t.type], side: t.side, held: held.has(t.id), timing });
  return d ? `Annexure ${d.n}${d.sub ?? ''} · ${t.originTag}` : '—';
}
