import React, { useState } from 'react';
import { noteMappings, mapNote, runStage, TYPE_LABEL, fmtDay, r2, type NoteRow, type Txn } from './cycle';
import { normRef } from './engine';
import { Card, DataTable, Pill, money, signedMoney, type Col } from './ui';
import { PageHead, type Ctx } from './App';

export default function CreditMapping({ ctx }: { ctx: Ctx }) {
  const { st, tag, run, user, at, settings } = ctx; const cur = st.rel.currency;
  const p = st.periods.find(x => x.tag === tag)!; const lockedP = p.phase !== 'working';
  const rows = noteMappings(st, tag);
  const [f, setF] = useState<'' | NoteRow['status']>('');
  const [manual, setManual] = useState<Record<string, string>>({});
  const shown = f ? rows.filter(r => r.status === f) : rows;
  const invoices = (side: 'B' | 'V') => st.txns.filter(t => t.side === side && t.type === 'INV');
  const accept = (r: NoteRow) => run(s => mapNote(s, tag, r.note.id, r.suggestion!.invoice.docNo, 'Suggested', user.name, at()), `${r.note.docNo} mapped to ${r.suggestion!.invoice.docNo}`);
  const acceptAll = () => { let s0 = st; let n = 0; rows.filter(r => r.status === 'Suggested').forEach(r => { const x = mapNote(s0, tag, r.note.id, r.suggestion!.invoice.docNo, 'Suggested', user.name, at()); if (x.ok) { s0 = x.state; n++; } }); if (n) run(() => ({ ok: true, state: s0 }), `${n} suggestion(s) accepted`); };
  const cols: Col<NoteRow>[] = [
    { key: 'note', label: 'Note', text: r => r.note.docNo, render: r => <span className="rw-stack"><b>{r.note.docNo}</b><small>{r.note.side === 'B' ? 'Buyer books' : 'Vendor books'} · {TYPE_LABEL[r.note.type]}</small></span> },
    { key: 'date', label: 'Date', text: r => fmtDay(r.note.date), sort: r => r.note.date },
    { key: 'amt', label: 'Amount', align: 'right', text: r => money(r.note.amount, cur), sort: r => r.note.amount, render: r => signedMoney(r.note.amount, cur) },
    { key: 'tag', label: 'Period', text: r => r.note.originTag, render: r => <span className={'rx-tag' + (r.note.originTag !== tag ? ' old' : '')}>{r.note.originTag}</span> },
    { key: 'inv', label: 'Invoice', width: 230, text: r => r.map?.invoiceDoc ?? r.suggestion?.invoice.docNo ?? '', render: r => r.map ? <span className="rw-stack"><b>{r.map.invoiceDoc}</b><small>{r.map.method}{r.map.by !== 'Import' ? ` · ${r.map.by}` : ''}</small></span>
      : r.suggestion ? <span className="rw-stack"><b className="rx-sugg">{r.suggestion.invoice.docNo}?</b><small>{r.suggestion.reason}</small></span> : <span className="rx-muted">—</span> },
    { key: 'st', label: 'Mapping', text: r => r.status, render: r => <Pill tone={r.status === 'Mapped' ? 'green' : r.status === 'Suggested' ? 'amber' : 'red'}>{r.status}</Pill> },
    { key: 'open', label: 'Reconciliation', text: r => r.open ? 'Open' : 'Matched', render: r => r.open ? <Pill tone="amber">Open</Pill> : <Pill tone="green">Matched</Pill> },
    { key: 'act', label: '', noToggle: true, text: () => '', render: r => r.map ? null : <span className="rx-inline" onClick={e => e.stopPropagation()}>
      {r.suggestion && <button className="rw-btn small lime" disabled={lockedP} onClick={() => accept(r)}>Accept</button>}
      <select value={manual[r.note.id] ?? ''} onChange={e => setManual({ ...manual, [r.note.id]: e.target.value })} aria-label="Map to invoice" disabled={lockedP}><option value="">Map to…</option>{invoices(r.note.side).filter(i => i.date <= r.note.date).map(i => <option key={i.id} value={i.docNo}>{i.docNo} · {money(i.amount, cur, 0)}</option>)}</select>
      <button className="rw-btn small" disabled={!manual[r.note.id] || lockedP} onClick={() => run(s => mapNote(s, tag, r.note.id, manual[r.note.id], 'Manual', user.name, at()), `${r.note.docNo} mapped`)}>Map</button></span> },
  ];
  // Net position per invoice on each side: invoice less the notes mapped to it.
  const mapped = (side: 'B' | 'V', inv: Txn) => rows.filter(r => r.note.side === side && normRef(r.map?.invoiceDoc ?? '') === inv.docNorm);
  const invRows = [...new Set(rows.filter(r => r.map).map(r => normRef(r.map!.invoiceDoc)))].map(k => {
    const b = st.txns.find(t => t.side === 'B' && t.type === 'INV' && t.docNorm === k), v = st.txns.find(t => t.side === 'V' && t.type === 'INV' && t.docNorm === k);
    const bn = b ? r2(b.amount + mapped('B', b).reduce((s, x) => s + x.note.amount, 0)) : null, vn = v ? r2(v.amount + mapped('V', v).reduce((s, x) => s + x.note.amount, 0)) : null;
    return { k, doc: (b ?? v)!.docNo, b, v, bn, vn, bNotes: b ? mapped('B', b).length : 0, vNotes: v ? mapped('V', v).length : 0, diff: bn !== null && vn !== null ? r2(bn - vn) : null };
  });
  const cnRan = !!p.stages.cn;
  return <>
    <PageHead title="Credit mapping" actions={<>
      <button className="rw-btn" disabled={!rows.some(r => r.status === 'Suggested') || lockedP} onClick={acceptAll}>Accept all suggestions</button>
      {cnRan && <button className="rw-btn lime" disabled={lockedP} onClick={() => run(s => runStage(s, tag, 'cn', settings, user.name, at()), 'Credit-note stage re-run with the latest mapping')}>Re-run credit-note matching</button>}</>}>
      Every credit and debit note is tied to the invoice it adjusts. When the buyer and vendor number a note differently, the credit-note stage matches them through this mapping.
    </PageHead>
    <div className="rx-chips">{(['', 'Mapped', 'Suggested', 'Unmapped'] as const).map(s => <button key={s || 'all'} className={f === s ? 'on' : ''} onClick={() => setF(s)}>{s || 'All notes'} <b>{s ? rows.filter(r => r.status === s).length : rows.length}</b></button>)}</div>
    {lockedP && <p className="rw-note warn">This period is {p.phase}. Mapping changes need the period reopened.</p>}
    <Card title="Credit and debit notes" tip="Notes that name their invoice are mapped automatically on import. The rest get a suggestion: first from the other side’s matching note, otherwise the latest earlier invoice that can carry the amount. Every manual mapping is audited.">
      <DataTable rows={shown} cols={cols} rowKey={r => r.note.id} fileName={`${st.rel.id}_${tag}_credit-mapping.csv`} empty="No notes in this relationship yet." />
    </Card>
    <Card title="Invoice net position" tip="Invoice amount less mapped credit notes plus mapped debit notes, per side. A difference here usually means a note is missing on one side.">
      <div className="rw-table-wrap"><table className="rw-table"><thead><tr><th>Invoice</th><th className="ar">Buyer invoice</th><th className="ar">Buyer notes</th><th className="ar">Buyer net</th><th className="ar">Vendor invoice</th><th className="ar">Vendor notes</th><th className="ar">Vendor net</th><th className="ar">Difference</th></tr></thead>
        <tbody>{invRows.map(x => <tr key={x.k}><td><b>{x.doc}</b></td><td className="ar">{money(x.b?.amount, cur)}</td><td className="ar">{x.bNotes}</td><td className="ar">{money(x.bn, cur)}</td><td className="ar">{money(x.v?.amount, cur)}</td><td className="ar">{x.vNotes}</td><td className="ar">{money(x.vn, cur)}</td><td className="ar">{x.diff === null ? '—' : Math.abs(x.diff) < 0.005 ? <span className="rw-ok">✓</span> : <span className="rw-neg">{signedMoney(x.diff, cur)}</span>}</td></tr>)}
          {!invRows.length && <tr><td colSpan={8} className="rw-empty">No mapped notes yet.</td></tr>}</tbody></table></div>
    </Card>
  </>;
}
