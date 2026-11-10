import React, { useState } from 'react';
import { TYPE_LABEL, fmtDay, r2, type Txn } from './cycle';
import { tagLabel } from './ledger';
import { signedMoney } from './ui';

export interface PairRow { key: string; tag: string; B: Txn[]; V: Txn[]; type: string; sub?: string; contra?: boolean; actions?: React.ReactNode }
export const sumOf = (x: Txn[]) => r2(x.reduce((s, t) => s + t.amount, 0));
/** How items were grouped: contra, one to one, one to many, many to one, many to many. */
export const kindOf = (B: Txn[], V: Txn[], contra = false) => contra ? 'Contra' : B.length === 1 && V.length === 1 ? 'One to one' : B.length === 1 ? 'One to many' : V.length === 1 ? 'Many to one' : 'Many to many';

/** Buyer items and vendor items side by side, one row per group, with the difference. Same layout as Reconciled transactions. */
export function PairTable({ rows, cur, curTag, status, empty = 'Nothing here.' }: { rows: PairRow[]; cur: string; curTag: string; status: React.ReactNode; empty?: string }) {
  const [limit, setLimit] = useState(40);
  const ref = (t: Txn) => t.ref || (t.against ? `Against ${t.against}` : '—');
  const cells = (items: Txn[]) => {
    const col = (f: (t: Txn) => React.ReactNode, cls = '') => <td className={cls}>{items.length ? items.map(t => <div key={t.id} className="rx-ln">{f(t)}</div>) : <span className="rx-muted">—</span>}</td>;
    return <>{col(t => <b>{t.docNo || t.ref}</b>, 'sep')}{col(t => TYPE_LABEL[t.type])}{col(t => fmtDay(t.date))}{col(t => <b>{signedMoney(t.amount, cur)}</b>, 'ar')}{col(ref)}{col(t => <small>{t.kind === 'period' ? 'Period ledger' : t.kind === 'backdated' ? 'Back-dated' : 'Historical'} · {t.line}</small>)}{col(() => status)}</>;
  };
  return <>
    <div className="rw-table-wrap"><table className="rw-table compact rx-rec">
      <thead><tr><th rowSpan={2}>Open period</th><th rowSpan={2}>Match type</th><th colSpan={7} className="grp sep">Buyer items</th><th colSpan={7} className="grp sep">Vendor items</th><th rowSpan={2} className="ar sep">Difference<br /><small>buyer − vendor</small></th><th rowSpan={2}><span className="sr-only">Actions</span></th></tr>
        <tr>{['Document no.', 'Type', 'Date', 'Amount', 'Reference', 'Source', 'Status', 'Document no.', 'Type', 'Date', 'Amount', 'Reference', 'Source', 'Status'].map((h, i) => <th key={i} className={(i === 0 || i === 7 ? 'sep ' : '') + (h === 'Amount' ? 'ar' : '')}>{h}</th>)}</tr></thead>
      <tbody>{rows.slice(0, limit).map(r => { const diff = r2(sumOf(r.B) - sumOf(r.V)); return <tr key={r.key}>
        <td><span className={'rx-tag' + (r.tag !== curTag ? ' old' : '')}>{tagLabel(r.tag)}</span></td>
        <td><b>{r.type}</b>{r.sub && <small className="rx-sub">{r.sub}</small>}</td>
        {cells(r.B)}{cells(r.V)}
        <td className="ar sep">{Math.abs(diff) < 0.005 ? <span className="rw-ok">0.00</span> : <b className="rw-neg">{signedMoney(diff, cur)}</b>}</td>
        <td className="rx-act">{r.actions}</td></tr>; })}
        {!rows.length && <tr><td colSpan={18} className="rx-muted">{empty}</td></tr>}</tbody></table></div>
    {rows.length > limit && <div className="rd-btns"><button className="rw-btn small" onClick={() => setLimit(limit + 60)}>Show more ({rows.length - limit} left)</button></div>}
  </>;
}
