import React, { useEffect, useState } from 'react';
import { fmtDate } from './data';
import { OWNERS, type Category, type Exception, type Resolution, type Status } from './engine';
import { Card, DataTable, Drawer, Icon, Pill, inr, num, sevTone, short, statusTone, type Col } from './ui';
import type { Ctx } from './App';

const STATUSES: Status[] = ['Open', 'Under investigation', 'Awaiting supplier', 'Resolved'];
const RESOLUTIONS: Resolution[] = ['', 'Buyer ledger adjustment', 'Supplier statement correction', 'Timing difference — clears next period', 'Explained — no adjustment needed'];
const PARTIAL = new Set<Category>(['Invoice amount mismatch', 'Tax amount mismatch', 'Partial payment']);
const CONTROLS = new Set<Category>(['Purchase order amount variance', 'Goods receipt discrepancy', 'Quantity mismatch', 'Price mismatch', 'Duplicate payment', 'Date or period mismatch']);
type Tab = 'open' | 'partial' | 'suggested' | 'timing' | 'controls' | 'resolved';
const TABS: { id: Tab; label: string; tip: string }[] = [
  { id: 'open', label: 'Open transactions', tip: 'On one side only, or posted against the wrong vendor. These make up most of the difference.' },
  { id: 'partial', label: 'Partially matched', tip: 'The same document on both sides with a different value or tax, and invoices paid in part.' },
  { id: 'suggested', label: 'Suggested matches', tip: 'Different references but the same vendor, amount and date. Confirm or reject each one.' },
  { id: 'timing', label: 'Subsequently accounted', tip: 'Invoices and payments at period end that the other side will account next period.' },
  { id: 'controls', label: 'Control checks', tip: 'Not differences between the two ledgers, but risks found by checking invoices against POs, goods receipts and the payment register.' },
  { id: 'resolved', label: 'Resolved', tip: 'Closed with a recorded resolution.' },
];
const isDnPair = (e: Exception) => e.category === 'Debit note discrepancy' && e.records.length === 2;
function tabOf(e: Exception): Tab {
  if (e.status === 'Resolved') return 'resolved';
  if (e.category === 'Probable match awaiting confirmation') return 'suggested';
  if (e.nature === 'Timing difference') return 'timing';
  if (PARTIAL.has(e.category) || isDnPair(e)) return 'partial';
  if (CONTROLS.has(e.category)) return 'controls';
  return 'open';
}

export default function UnreconciledScreen({ ctx }: { ctx: Ctx }) {
  const { r, vendor, vName, edit, setDecisions, focus, clearFocus } = ctx;
  const [tab, setTab] = useState<Tab>('open');
  const [statusF, setStatusF] = useState<Status | ''>('');
  const [sel, setSel] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => { if (!focus.exception) return; const e = r.exceptions.find(x => x.key === focus.exception); if (e) { setTab(tabOf(e)); setDetail(e.key); } clearFocus(); }, [focus.exception]);
  const mine = r.exceptions.filter(e => vendor === 'ALL' || e.vendorId === vendor);
  const pending = r.pending.filter(m => vendor === 'ALL' || m.buyer.vendorId === vendor);
  const inTab = mine.filter(e => tabOf(e) === tab && (!statusF || e.status === statusF));
  const stat = (s: Status) => { const xs = mine.filter(e => e.status === s); return { n: xs.length, v: xs.reduce((t, e) => t + e.impact, 0) }; };
  const bulk = (patch: { owner?: string; status?: Status }) => { sel.forEach(k => edit(k, patch)); setSel([]); };
  const cols: Col<Exception>[] = [
    { key: 'id', label: 'ID', text: e => e.id, render: e => <b>{e.id}</b> },
    { key: 'sev', label: 'Severity', text: e => e.severity, sort: e => ['Critical', 'High', 'Medium', 'Low'].indexOf(e.severity), render: e => <Pill tone={sevTone(e.severity)}>{e.severity}</Pill> },
    { key: 'cat', label: 'Category', width: 240, text: e => `${e.category} ${e.subtype}`, render: e => <span className="rw-stack"><b>{e.category}</b><small>{e.nature} · {e.subtype}</small></span> },
    { key: 'vendor', label: 'Vendor', width: 190, text: e => vName(e.vendorId), hidden: vendor !== 'ALL' },
    { key: 'refs', label: 'References', text: e => e.refs.join(', ') },
    { key: 'b', label: 'Buyer amount', align: 'right', text: e => num(e.buyerAmount, 2), sort: e => e.buyerAmount ?? 0 },
    { key: 's', label: 'Vendor amount', align: 'right', text: e => num(e.supplierAmount, 2), sort: e => e.supplierAmount ?? 0 },
    { key: 'eff', label: 'Effect on difference', align: 'right', text: e => num(e.balanceEffect, 2), sort: e => e.balanceEffect, render: e => e.balanceEffect ? num(e.balanceEffect, 2) : <span className="rw-zero">—</span> },
    { key: 'imp', label: 'Impact', align: 'right', text: e => num(e.impact, 2), sort: e => e.impact },
    { key: 'age', label: 'Age', align: 'right', text: e => `${e.ageDays}d`, sort: e => e.ageDays },
    { key: 'owner', label: 'Owner', text: e => e.owner },
    { key: 'status', label: 'Status', text: e => e.status, render: e => <Pill tone={statusTone(e.status)}>{e.status}</Pill> },
    { key: 'res', label: 'Resolution', hidden: tab !== 'resolved', text: e => e.resolution },
  ];
  const sel1 = r.exceptions.find(e => e.key === detail);
  return <>
    <Card title="Status overview" tip="Potential impact of every exception for the selected vendors, by workflow status. Click a status to filter the list.">
      <div className="rw-status">{STATUSES.map(s => { const x = stat(s); return <button key={s} className={'rw-stat ' + statusTone(s) + (statusF === s ? ' on' : '')} onClick={() => setStatusF(statusF === s ? '' : s)} aria-pressed={statusF === s}><Icon n={s === 'Resolved' ? 'check' : 'file'} s={20} /><span><b>{short(x.v)}</b><small>{s} · {x.n} item{x.n === 1 ? '' : 's'}</small></span></button>; })}</div>
    </Card>
    <Card title={<>Unreconciled transactions{statusF && <button className="rw-filter-tag" onClick={() => setStatusF('')}>{statusF} <Icon n="x" s={12} /></button>}</>}>
      <div className="rw-tabs" role="tablist">{TABS.map(t => { const n = t.id === 'suggested' ? pending.length : mine.filter(e => tabOf(e) === t.id && (!statusF || e.status === statusF)).length;
        return <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setSel([]); }}>{t.label}<em>{n}</em></button>; })}</div>
      <p className="rw-note">{TABS.find(t => t.id === tab)!.tip}</p>
      {tab === 'suggested' ? (pending.length === 0 ? <p className="rw-empty-block">No suggested matches waiting. Rejected suggestions move to Open transactions.</p>
        : <div className="rw-pairs">{pending.map(m => <div className="rw-pair" key={m.key}>
          <div><span>Buyer ledger</span><b>{m.buyer.rawRef}</b><small>{m.buyer.id} · {fmtDate(m.buyer.date)}</small><b className="amt">{inr(m.buyer.amount, 2)}</b><small>{m.buyer.description}</small></div>
          <div><span>Vendor statement</span><b>{m.supplier.rawRef}</b><small>{m.supplier.id} · {fmtDate(m.supplier.date)}</small><b className="amt">{inr(m.supplier.amount, 2)}</b><small>{m.supplier.description}</small></div>
          <p>{vName(m.buyer.vendorId)} · amounts differ by {inr(m.diff, 2)}, dates {Math.round(Math.abs(m.buyer.date - m.supplier.date) / 86400000)} day(s) apart. The buyer reference looks like a delivery challan number.</p>
          <div className="rw-pair-actions"><button className="rw-btn lime" onClick={() => setDecisions(d => ({ ...d, probable: { ...d.probable, [m.key]: 'confirmed' } }))}>Confirm match</button><button className="rw-btn" onClick={() => setDecisions(d => ({ ...d, probable: { ...d.probable, [m.key]: 'rejected' } }))}>Not the same</button></div>
        </div>)}</div>)
        : <DataTable key={tab} rows={inTab} cols={cols} rowKey={e => e.key} fileName={`unreconciled-${tab}.csv`} onRowClick={e => setDetail(e.key)} activeKey={detail ?? undefined} selectable selected={sel} onSelect={setSel} initialSort={{ key: 'sev', dir: 1 }}
          empty="Nothing here for the selected vendors."
          toolbar={sel.length > 0 && <span className="rw-bulk">{sel.length} selected
            <select value="" onChange={e => e.target.value && bulk({ owner: e.target.value })} aria-label="Assign owner to selected"><option value="">Assign owner…</option>{OWNERS.map(o => <option key={o}>{o}</option>)}</select>
            <select value="" onChange={e => e.target.value && bulk({ status: e.target.value as Status })} aria-label="Set status of selected"><option value="">Set status…</option>{STATUSES.filter(s => s !== 'Resolved').map(o => <option key={o}>{o}</option>)}</select></span>} />}
    </Card>
    {sel1 && <ExceptionDrawer ctx={ctx} e={sel1} onClose={() => setDetail(null)} />}
  </>;
}

function ExceptionDrawer({ ctx, e, onClose }: { ctx: Ctx; e: Exception; onClose: () => void }) {
  const { r, vName, edit, setDecisions } = ctx;
  const unmatched = e.records.filter(x => (x.side === 'buyer' ? r.unmatchedBuyer : r.unmatchedSupplier).some(u => u.id === x.id));
  const one = unmatched.length === 1 && e.records.length === 1 ? unmatched[0] : null;
  const counterparts = one ? (one.side === 'buyer' ? r.unmatchedSupplier : r.unmatchedBuyer).filter(c => c.vendorId === one.vendorId && c.currency === one.currency && c.docClass === one.docClass) : [];
  const [cp, setCp] = useState('');
  return <Drawer wide title={<>{e.id} · {e.category}</>} sub={<>{vName(e.vendorId)} · {e.subtype} · <Pill tone={sevTone(e.severity)}>{e.severity}</Pill> <Pill>{e.nature}</Pill></>} onClose={onClose}>
    <dl className="rw-dl five"><div><dt>Buyer amount</dt><dd>{inr(e.buyerAmount, 2)}</dd></div><div><dt>Vendor amount</dt><dd>{inr(e.supplierAmount, 2)}</dd></div><div><dt>Effect on difference</dt><dd>{e.balanceEffect ? inr(e.balanceEffect, 2) : 'None'}</dd></div><div><dt>Potential impact</dt><dd>{inr(e.impact, 2)}</dd></div><div><dt>Age</dt><dd>{e.ageDays} days</dd></div></dl>
    <h4 className="rw-h4">Source records</h4>
    <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Side</th><th>Record</th><th>Reference</th><th>Date</th><th className="ar">Amount</th><th>PO / GRN</th></tr></thead>
      <tbody>{e.records.map(x => <tr key={x.id}><td>{x.side === 'buyer' ? 'Buyer ledger' : 'Vendor statement'}</td><td>{x.id}</td><td>{x.rawRef}</td><td>{fmtDate(x.date)}</td><td className="ar">{num(x.amount, 2)}</td><td>{[x.po, x.grn].filter(Boolean).join(' / ') || '—'}</td></tr>)}</tbody></table></div>
    <h4 className="rw-h4">Recommended investigation</h4><p className="rw-advice">{e.recommendation}</p>
    <h4 className="rw-h4">Evidence</h4><ul className="rw-evidence">{e.evidence.map(x => <li key={x}>{x}</li>)}</ul>
    {one && counterparts.length > 0 && <><h4 className="rw-h4">Match manually</h4><div className="rw-manual"><select value={cp} onChange={ev => setCp(ev.target.value)} aria-label="Counterpart record"><option value="">Pick a {one.side === 'buyer' ? 'vendor statement' : 'buyer ledger'} record…</option>{counterparts.map(c => <option key={c.id} value={c.id}>{c.rawRef || c.id} · {fmtDate(c.date)} · {inr(c.amount, 2)}</option>)}</select>
      <button className="rw-btn" disabled={!cp} onClick={() => { setDecisions(d => ({ ...d, manual: [...d.manual, one.side === 'buyer' ? { buyerId: one.id, supplierId: cp } : { buyerId: cp, supplierId: one.id }] })); onClose(); }}>Pair records</button></div>
      <p className="rw-note">One-to-one, same vendor and currency. The pair moves to Reconciled transactions as a manual match.</p></>}
    <h4 className="rw-h4">Workflow</h4>
    <div className="rw-workflow">
      <label className="rw-field"><span>Owner</span><select value={e.owner} onChange={ev => edit(e.key, { owner: ev.target.value })}>{OWNERS.map(o => <option key={o}>{o}</option>)}</select></label>
      <label className="rw-field"><span>Status</span><select value={e.status} onChange={ev => edit(e.key, { status: ev.target.value as Status })}>{STATUSES.map(o => <option key={o}>{o}</option>)}</select></label>
      <label className="rw-field wide"><span>Resolution</span><select value={e.resolution} onChange={ev => { const v = ev.target.value as Resolution; edit(e.key, { resolution: v, status: v ? 'Resolved' : e.status === 'Resolved' ? 'Open' : e.status }); }}>{RESOLUTIONS.map(o => <option key={o} value={o}>{o || 'Not resolved'}</option>)}</select></label>
      <label className="rw-field wide"><span>Notes</span><textarea rows={3} value={e.notes} placeholder="What was checked, who was contacted, what was agreed" onChange={ev => edit(e.key, { notes: ev.target.value })} /></label>
    </div>
  </Drawer>;
}
