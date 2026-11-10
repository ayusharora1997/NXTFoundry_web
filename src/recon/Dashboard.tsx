import React, { useState } from 'react';
import { gate, openItems, statement, currentPeriod, type RelState, type WfStatus, type Statement } from './cycle';
import { VENDORS, ENTITIES, tagLabel } from './ledger';
import { annexSummary } from './annex';
import { Card, Collapsible, DataTable, Pill, money, signedMoney, short, type Col } from './ui';
import { PageHead, STATUS_TONE, vendorOf, entityOf, type Ctx, type Screen } from './App';

// Where to go next for each status. Matching runs by itself once ledgers are in and openings validate.
export const NEXT: Record<WfStatus, [string, Screen]> = {
  'Awaiting ledgers': ['Upload vendor ledger', 'upload'], 'Opening check': ['Resolve opening balance', 'upload'], 'Matching': ['Reconciling', 'upload'],
  'In review': ['Review open items', 'open'], 'Statement prepared': ['Share statement', 'statement'], 'With vendor': ['Record vendor response', 'statement'],
  'Vendor accepted': ['Final sign-off', 'statement'], 'Vendor disputed': ['Reopen and amend', 'statement'], 'Signed off': ['Close and carry forward', 'statement'], 'Closed': ['Upload next ledger', 'upload'],
};
interface Row { sg: number; pt: number; rq: number; ann: ReturnType<typeof annexSummary>; st: RelState; tag: string; status: WfStatus; gateOk: boolean; openB: number; openV: number; hist: number; value: number; s: Statement; matched: number }

export default function Dashboard({ ctx }: { ctx: Ctx }) {
  const { ws, settings, go } = ctx;
  const [entity, setEntity] = useState(''); const [bu, setBu] = useState('');
  const rows: Row[] = ctx.visible.filter(st => (!entity || st.rel.entityId === entity) && (!bu || st.rel.bu === bu)).map(st => {
    const tag = currentPeriod(st).tag; const items = openItems(st, tag, settings); const s = statement(st, tag, settings); const p = currentPeriod(st);
    return { sg: st.candidates.filter(c => c.status === 'pending' && c.periodTag === tag).length, pt: st.matches.filter(m => !m.reversed && m.partial).length, rq: ctx.requests.filter(q => q.relId === st.rel.id && q.status === 'pending').length, ann: annexSummary(st, s), st, tag, status: ctx.stat(st, tag), gateOk: gate(st, tag).passed || !p.imports.V, openB: s.countB, openV: s.countV, hist: items.filter(i => i.txn.originTag !== tag).length, value: items.reduce((t, i) => t + Math.abs(i.txn.amount), 0), s, matched: st.matches.filter(m => !m.reversed && m.periodTag === tag).length };
  });
  const inr = rows.filter(r => r.st.rel.currency === 'INR'), usd = rows.filter(r => r.st.rel.currency === 'USD');
  const closed = ctx.visible.reduce((n, st) => n + st.periods.filter(p => p.phase === 'closed').length, 0);
  const awaiting = rows.filter(r => r.status === 'Awaiting ledgers');
  const tiles: [string, React.ReactNode, string, string?][] = [
    ['Vendor relationships', rows.length, `${VENDORS.length} vendors · ${ENTITIES.length} entities`],
    ['Ledgers awaited', awaiting.length, awaiting.length ? awaiting.map(r => vendorOf(r.st).displayName).join(', ') : 'All received', awaiting.length ? 'amber' : ''],
    ['Opening check failing', rows.filter(r => !r.gateOk).length, 'Reconciliation paused until resolved', rows.some(r => !r.gateOk) ? 'red' : ''],
    ['With vendor for sign-off', rows.filter(r => r.status === 'With vendor').length, 'Statement shared, response due', 'violet'],
    ['Open items', rows.reduce((n, r) => n + r.openB + r.openV, 0), `${rows.reduce((n, r) => n + r.openB, 0)} buyer-side · ${rows.reduce((n, r) => n + r.openV, 0)} vendor-side`],
    ['Unmatched value', short(inr.reduce((t, r) => t + r.value, 0)), usd.length ? `INR · plus ${money(usd.reduce((t, r) => t + r.value, 0), 'USD', 0)}` : 'Gross, INR'],
    ['Suggested matches', rows.reduce((n, r) => n + r.sg, 0), 'Waiting for a reviewer', rows.some(r => r.sg) ? 'amber' : ''],
    ['Partially reconciled', rows.reduce((n, r) => n + r.pt, 0), 'Forced matches with a difference'],
    ['Vendor requests', rows.reduce((n, r) => n + r.rq, 0), 'Awaiting buyer review', rows.some(r => r.rq) ? 'violet' : ''],
    ['Vendor concerns raised', rows.filter(r => r.status === 'Vendor disputed').length, 'Statements the vendor did not accept', rows.some(r => r.status === 'Vendor disputed') ? 'red' : ''],
    ['Carried from earlier periods', rows.reduce((n, r) => n + r.hist, 0), 'Still open after a previous close', 'amber'],
    ['Periods closed', closed, 'Signed off and carried forward'],
  ];
  const cols: Col<Row>[] = [
    { key: 'v', label: 'Vendor', width: 230, sticky: true, noToggle: true, text: r => ctx.label(r.st), render: r => <span className="rd-vlink"><span className={'rw-dot ' + STATUS_TONE[r.status]} /><span><b>{vendorOf(r.st).displayName}</b><small>{r.st.rel.vendorCode} · {r.st.rel.bu} · {r.st.rel.currency}</small></span></span> },
    { key: 'e', label: 'Entity', hidden: true, text: r => entityOf(r.st).name },
    { key: 'p', label: 'Period', text: r => r.tag, render: r => <b>{tagLabel(r.tag)}</b> },
    { key: 's', label: 'Status', text: r => r.status, render: r => <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill> },
    { key: 'b', label: 'Buyer closing', align: 'right', text: r => money(r.s.buyerClosing, r.st.rel.currency, 0), sort: r => r.s.buyerClosing ?? 0 },
    { key: 'vc', label: 'Vendor closing', align: 'right', text: r => money(r.s.vendorClosing, r.st.rel.currency, 0), sort: r => r.s.vendorClosing ?? 0 },
    { key: 'd', label: 'Difference', align: 'right', text: r => money(r.s.difference, r.st.rel.currency, 0), sort: r => r.s.difference ?? 0, render: r => <b className={r.s.difference ? 'rw-neg' : ''}>{money(r.s.difference, r.st.rel.currency, 0)}</b> },
    { key: 'm', label: 'Matched', align: 'right', text: r => String(r.matched), sort: r => r.matched },
    { key: 'o', label: 'Open B / V', align: 'right', text: r => `${r.openB} / ${r.openV}`, sort: r => r.openB + r.openV },
    { key: 'sg', label: 'Suggested', align: 'right', text: r => String(r.sg), sort: r => r.sg, render: r => r.sg ? <button className="rw-link" onClick={e => { e.stopPropagation(); go('open', r.st.rel.id); }}>{r.sg}</button> : <span className="rx-muted">0</span> },
    { key: 'pt', label: 'Partial', align: 'right', text: r => String(r.pt), sort: r => r.pt, render: r => r.pt ? <button className="rw-link" onClick={e => { e.stopPropagation(); go('open', r.st.rel.id); }}>{r.pt}</button> : <span className="rx-muted">0</span> },
    { key: 'rq', label: 'Vendor requests', align: 'right', text: r => String(r.rq), sort: r => r.rq, render: r => r.rq ? <button className="rw-link" onClick={e => { e.stopPropagation(); go('open', r.st.rel.id); }}>{r.rq} pending</button> : <span className="rx-muted">0</span> },
    { key: 'a', label: 'Annexures', width: 260, text: r => r.ann.map(a => `A${a.n} ${a.count}`).join(' '), render: r => r.ann.length ? <span className="rx-annex-chips">{r.ann.map(a => <span key={a.n} title={`Annexure ${a.n} · ${a.name}: ${a.count} item(s), ${signedMoney(a.effect, r.st.rel.currency, 0)}`}><b>A{a.n}</b>{a.count}</span>)}</span> : <span className="rx-muted">—</span> },
    { key: 'u', label: 'Unexplained', align: 'right', text: r => r.s.unexplained === null ? '—' : money(r.s.unexplained, r.st.rel.currency), render: r => r.s.unexplained === null ? '—' : Math.abs(r.s.unexplained) < 0.005 ? <span className="rw-ok">✓ 0</span> : <span className="rw-neg">{money(r.s.unexplained, r.st.rel.currency)}</span> },
    { key: 'n', label: 'Next', noToggle: true, text: r => NEXT[r.status][0], render: r => <button className="rw-btn small" onClick={e => { e.stopPropagation(); go(NEXT[r.status][1], r.st.rel.id); }}>{NEXT[r.status][0]} →</button> },
  ];
  const expand = (r: Row) => { const c = r.st.rel.currency;
    return <div className="rx-dash-x">
      <div className="rx-dash-sum"><div><span>Buyer closing</span><b>{money(r.s.buyerClosing, c)}</b></div><div><span>Vendor closing</span><b>{money(r.s.vendorClosing, c)}</b></div><div><span>Difference</span><b>{money(r.s.difference, c)}</b></div><div><span>Open buyer items</span><b>{signedMoney(r.s.openB, c)}</b></div><div><span>Open vendor items</span><b>{signedMoney(-r.s.openV, c)}</b></div><div><span>Adjustments</span><b>{signedMoney(r.s.adjEffect, c)}</b></div></div>
      {r.ann.length ? <table className="rw-table compact"><thead><tr><th>Annexure</th><th>What it holds</th><th className="ar">Items</th><th className="ar">Effect on the bridge</th></tr></thead>
        <tbody>{r.ann.map(a => <tr key={a.n}><td><b>Annexure {a.n}</b></td><td>{a.name}</td><td className="ar">{a.count}</td><td className="ar"><b>{signedMoney(a.effect, c)}</b></td></tr>)}</tbody></table>
        : <p className="rx-muted">{r.status === 'Awaiting ledgers' ? 'No reconciliation yet: the vendor ledger for this period has not been uploaded.' : 'No open items. Nothing to annex.'}</p>}
      <div className="rd-btns"><button className="rw-btn small" onClick={() => go('statement', r.st.rel.id)}>Reconciliation statement</button><button className="rw-btn small ghost" onClick={() => go('open', r.st.rel.id)}>Unreconciled transactions</button><button className="rw-btn small ghost" onClick={() => go('upload', r.st.rel.id)}>Vendor ledger upload</button></div>
    </div>; };
  return <>
    <PageHead title="Reconciliation dashboard" actions={<div className="rd-btns">
      <select className="rx-sel" value={entity} onChange={e => { setEntity(e.target.value); setBu(''); }} aria-label="Entity"><option value="">All entities</option>{ENTITIES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      <select className="rx-sel" value={bu} onChange={e => setBu(e.target.value)} aria-label="Business unit"><option value="">All business units</option>{ENTITIES.filter(e => !entity || e.id === entity).flatMap(e => e.bus).map(b => <option key={b}>{b}</option>)}</select></div>}>
      Every vendor, where its current period stands, and how its difference breaks down into annexures by the period each open item came from.
    </PageHead>
    <Collapsible id="dashboard" label="summary"><div className="rx-tiles four">{tiles.map(([k, v, s, tone]) => <div key={k} className={'rx-tile ' + (tone ?? '')}><span>{k}</span><b>{v}</b><small>{s}</small></div>)}</div></Collapsible>
    <Card title="Vendors" tip="Click a vendor to see its balances and each annexure. Annexure chips show the originating period and how many items it holds; the current period is highlighted.">
      <DataTable rows={rows} cols={cols} rowKey={r => r.st.rel.id} fileName="vendor-summary.csv" expand={expand} pageSize={10} />
    </Card>
  </>;
}
