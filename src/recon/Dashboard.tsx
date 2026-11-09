import React, { useState } from 'react';
import { gate, openItems, statement, currentPeriod, type RelState, type WfStatus } from './cycle';
import { VENDORS, ENTITIES, tagLabel } from './ledger';
import { Card, DataTable, Icon, Pill, money, short, type Col } from './ui';
import { PageHead, STATUS_TONE, vendorOf, entityOf, type Ctx, type Screen } from './App';

const PIPE: WfStatus[] = ['Awaiting ledgers', 'Opening check', 'Matching', 'In review', 'With vendor', 'Vendor disputed', 'Signed off'];
export const NEXT: Record<WfStatus, [string, Screen]> = {
  'Awaiting ledgers': ['Import ledgers', 'reconcile'], 'Opening check': ['Resolve opening balance', 'reconcile'], 'Matching': ['Run matching stages', 'reconcile'],
  'In review': ['Review and prepare statement', 'balance'], 'Statement prepared': ['Share with vendor', 'balance'], 'With vendor': ['Record vendor response', 'balance'],
  'Vendor accepted': ['Final sign-off', 'balance'], 'Vendor disputed': ['Reopen and amend', 'balance'], 'Signed off': ['Close and carry forward', 'balance'], 'Closed': ['Start next period', 'reconcile'],
};
interface Row { st: RelState; tag: string; status: WfStatus; gateOk: boolean; openB: number; openV: number; hist: number; value: number; unexplained: number | null; diff: number | null }

export default function Dashboard({ ctx }: { ctx: Ctx }) {
  const { ws, settings, go, label } = ctx;
  const [entity, setEntity] = useState(''); const [bu, setBu] = useState('');
  const rows: Row[] = Object.values(ws.states).filter(st => (!entity || st.rel.entityId === entity) && (!bu || st.rel.bu === bu)).map(st => {
    const tag = currentPeriod(st).tag; const items = openItems(st, tag, settings); const s = statement(st, tag, settings); const g = gate(st, tag);
    return { st, tag, status: ctx.stat(st, tag), gateOk: g.passed || (!st.periods.find(p => p.tag === tag)!.imports.V), openB: items.filter(i => i.txn.side === 'B').length, openV: items.filter(i => i.txn.side === 'V').length, hist: items.filter(i => i.txn.originTag !== tag).length, value: items.reduce((t, i) => t + Math.abs(i.txn.amount), 0), unexplained: s.unexplained, diff: s.difference };
  });
  const inr = rows.filter(r => r.st.rel.currency === 'INR'), usd = rows.filter(r => r.st.rel.currency === 'USD');
  const closed = Object.values(ws.states).reduce((n, st) => n + st.periods.filter(p => p.phase === 'closed').length, 0);
  const tiles: [string, React.ReactNode, string, string?][] = [
    ['Vendors', VENDORS.length, `${VENDORS.filter(v => v.status === 'Onboarding').length} onboarding`],
    ['Active relationships', rows.length, `${ENTITIES.length} entities · ${new Set(rows.map(r => r.st.rel.bu)).size} business units`],
    ['In progress', rows.filter(r => !['Signed off', 'Closed', 'With vendor'].includes(r.status)).length, 'Current period being worked'],
    ['Awaiting vendor sign-off', rows.filter(r => r.status === 'With vendor').length, 'Statement shared, response due', 'violet'],
    ['Closed reconciliations', closed, 'Periods closed and carried forward'],
    ['Buyer-side open items', rows.reduce((n, r) => n + r.openB, 0), 'In buyer books, not in vendor’s'],
    ['Vendor-side open items', rows.reduce((n, r) => n + r.openV, 0), 'In vendor books, not in buyer’s'],
    ['Unmatched value', short(inr.reduce((t, r) => t + r.value, 0)), usd.length ? `INR · plus ${money(usd.reduce((t, r) => t + r.value, 0), 'USD', 0)}` : 'Gross, INR'],
    ['Historical open items', rows.reduce((n, r) => n + r.hist, 0), 'Carried from earlier periods', 'amber'],
    ['Current-period open items', rows.reduce((n, r) => n + r.openB + r.openV - r.hist, 0), 'Raised this period'],
    ['Opening balance failures', rows.filter(r => !r.gateOk).length, 'Matching blocked until resolved', rows.some(r => !r.gateOk) ? 'red' : ''],
    ['Unexplained variances', rows.filter(r => r.unexplained !== null && Math.abs(r.unexplained) >= 0.005).length, 'Bridge does not close yet', rows.some(r => r.unexplained !== null && Math.abs(r.unexplained) >= 0.005) ? 'red' : ''],
  ];
  const cols: Col<Row>[] = [
    { key: 'v', label: 'Relationship', width: 250, sticky: true, noToggle: true, text: r => label(r.st), render: r => <button className="rd-vlink" onClick={() => go('reconcile', r.st.rel.id)}><span className={'rw-dot ' + STATUS_TONE[r.status]} /><span><b>{vendorOf(r.st).displayName}</b><small>{r.st.rel.vendorCode} · {r.st.rel.bu} · {r.st.rel.currency}</small></span></button> },
    { key: 'e', label: 'Entity', text: r => entityOf(r.st).name },
    { key: 'f', label: 'Frequency', text: r => r.st.rel.frequency },
    { key: 'p', label: 'Current period', text: r => r.tag, render: r => <span className="rw-stack"><span className="rx-tag">{r.tag}</span><small>{tagLabel(r.tag)}</small></span> },
    { key: 's', label: 'Status', text: r => r.status, render: r => <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill> },
    { key: 'g', label: 'Opening check', text: r => r.gateOk ? 'OK' : 'Failed', render: r => r.gateOk ? <span className="rw-ok">✓</span> : <span className="rw-neg">✕ Failed</span> },
    { key: 'ob', label: 'Open · buyer', align: 'right', text: r => String(r.openB), sort: r => r.openB },
    { key: 'ov', label: 'Open · vendor', align: 'right', text: r => String(r.openV), sort: r => r.openV },
    { key: 'h', label: 'Of which historical', align: 'right', text: r => String(r.hist), sort: r => r.hist },
    { key: 'd', label: 'Closing difference', align: 'right', text: r => money(r.diff, r.st.rel.currency, 0), sort: r => r.diff ?? 0 },
    { key: 'u', label: 'Unexplained', align: 'right', text: r => r.unexplained === null ? '—' : money(r.unexplained, r.st.rel.currency, 2), render: r => r.unexplained === null ? '—' : Math.abs(r.unexplained) < 0.005 ? <span className="rw-ok">✓ 0</span> : <span className="rw-neg">{money(r.unexplained, r.st.rel.currency)}</span> },
    { key: 'n', label: 'Next action', noToggle: true, text: r => NEXT[r.status][0], render: r => <button className="rw-btn small" onClick={() => go(NEXT[r.status][1], r.st.rel.id)}>{NEXT[r.status][0]} →</button> },
  ];
  return <>
    <PageHead title="Reconciliation dashboard" actions={<div className="rw-seg">
      <select className="rx-sel" value={entity} onChange={e => { setEntity(e.target.value); setBu(''); }} aria-label="Entity"><option value="">All entities</option>{ENTITIES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      <select className="rx-sel" value={bu} onChange={e => setBu(e.target.value)} aria-label="Business unit"><option value="">All business units</option>{ENTITIES.filter(e => !entity || e.id === entity).flatMap(e => e.bus).map(b => <option key={b}>{b}</option>)}</select></div>}>
      Every buyer–vendor relationship, where its current period stands in the cycle, and what needs doing next.
    </PageHead>
    <div className="rx-tiles">{tiles.map(([k, v, s, tone]) => <div key={k} className={'rx-tile ' + (tone ?? '')}><span>{k}</span><b>{v}</b><small>{s}</small></div>)}</div>
    <Card title="Cycle pipeline" tip="Each card is a relationship’s current period, placed at its workflow status. Click to open it.">
      <div className="rx-pipe">{PIPE.map(s => { const xs = rows.filter(r => r.status === s || (s === 'With vendor' && (r.status === 'Statement prepared' || r.status === 'Vendor accepted')));
        return <section key={s} className={'rx-lane ' + STATUS_TONE[s]}><header><span className={'rw-dot ' + STATUS_TONE[s]} /><b>{s}</b><em>{xs.length}</em></header>
          {xs.map(r => <button key={r.st.rel.id} className="rx-card" onClick={() => go(NEXT[r.status][1], r.st.rel.id)}><b>{vendorOf(r.st).displayName}</b><small>{r.st.rel.bu} · {r.st.rel.currency} · {r.tag}</small>
            <span>{r.openB + r.openV} open{r.hist ? ` · ${r.hist} carried` : ''}</span><i>{NEXT[r.status][0]} <Icon n="open" s={12} /></i></button>)}
          {!xs.length && <p className="rx-empty">None</p>}</section>; })}</div>
    </Card>
    <Card title="Relationships" tip="One row per buyer entity, business unit, vendor and currency. Each is reconciled independently; nothing is matched across them.">
      <DataTable rows={rows} cols={cols} rowKey={r => r.st.rel.id} fileName="relationships.csv" />
    </Card>
  </>;
}
