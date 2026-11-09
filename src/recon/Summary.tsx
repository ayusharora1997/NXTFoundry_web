import React, { useState } from 'react';
import { toCSV } from './engine';
import { ANNEXURES, ENTITY, ME, ledgerBalance, stamp, vendorStatus, type Annex, type AnnexId, type SignOff, type VendorStatus } from './model';
import { Card, DataTable, Drawer, Icon, Pill, download, inr, num, short, statusTone, type Col } from './ui';
import type { Ctx } from './App';

interface VRow { id: string; name: string; category: string; status: VendorStatus; vendorCB: number | null; buyerCB: number; diff: number | null; annex: Annex | null; grand: number | null; openEx: number; vSign?: SignOff; bSign?: SignOff }
const GROUPS = ['Invoice', 'Credit / debit notes', 'Payments', 'Pending', 'Others'];
const sum = (xs: VRow[], f: (x: VRow) => number | null) => num(xs.reduce((s, x) => s + (f(x) ?? 0), 0));

export default function SummaryScreen({ ctx }: { ctx: Ctx }) {
  const { ws, r, vendor, annex } = ctx;
  const [statusF, setStatusF] = useState<VendorStatus | 'ALL'>('ALL');
  const [overview, setOverview] = useState(true);
  const [drawer, setDrawer] = useState<string | null>(null);
  const all: VRow[] = ws.data.suppliers.filter(s => vendor === 'ALL' || s.id === vendor).map(s => {
    const v = r.vendors.find(x => x.vendorId === s.id); const a = annex.get(s.id)?.annex ?? null;
    const grand = a ? Math.round(Object.values(a).reduce((t, x) => t + x, 0) * 100) / 100 : v ? 0 : null;
    return { id: s.id, name: s.name, category: s.category, status: vendorStatus(ws, s.id), vendorCB: v ? v.supplierBalance : null, buyerCB: v ? v.buyerBalance : ledgerBalance(ws.data, s.id), diff: v ? v.variance : null, annex: v ? a ?? Object.fromEntries(ANNEXURES.map(x => [x.id, 0])) as Annex : null, grand, openEx: v ? v.openExceptions : 0, vSign: ws.vendorSign[s.id], bSign: ws.buyerSign[s.id] };
  });
  const rows = statusF === 'ALL' ? all : all.filter(x => x.status === statusF);
  const count = (s: VendorStatus) => all.filter(x => x.status === s).length;
  const lines = r.bridge.filter(b => vendor === 'ALL' || b.vendorId === vendor);
  const total = (f: (b: typeof lines[number]) => boolean) => lines.filter(f).reduce((t, b) => t + b.amount, 0);
  const totalOpen = total(b => b.bucket !== 'Confirmed adjustments');
  const closedLater = total(b => b.bucket === 'Timing differences');
  const pendingConf = total(b => b.bucket === 'Probable matches pending confirmation');
  const disputes = totalOpen - closedLater - pendingConf;
  const ex = r.exceptions.filter(e => vendor === 'ALL' || e.vendorId === vendor);
  const resolved = ex.filter(e => e.status === 'Resolved').length;
  const tile = (s: VendorStatus | 'ALL', n: number, label: string, sub: string, tone: string, icon: string) => <button className={'rw-tile ' + tone + (statusF === s ? ' on' : '')} onClick={() => setStatusF(statusF === s ? 'ALL' : s)} aria-pressed={statusF === s}><b>{n}</b><span>{label}</span><small>{sub}</small><Icon n={icon} s={22} /></button>;

  const money = (key: string, label: string, f: (x: VRow) => number | null, extra: Partial<Col<VRow>> = {}): Col<VRow> => ({ key, label, align: 'right', text: x => num(f(x)), sort: x => f(x) ?? 0, total: xs => sum(xs, f), ...extra });
  const cols: Col<VRow>[] = [
    { key: 'vendor', label: 'Vendor name', sticky: true, width: 230, noToggle: true, text: x => x.name, render: x => <span className="rw-stack"><button className="rw-link" onClick={e => { e.stopPropagation(); setDrawer(x.id); }}>{x.name}</button><small>{x.id} · {x.category}</small></span>, total: () => <b>Total</b> },
    { key: 'entity', label: 'Entity name', hidden: true, text: () => ENTITY },
    { key: 'status', label: 'Status', text: x => x.status, render: x => <Pill tone={statusTone(x.status)}>{x.status}</Pill> },
    money('vcb', 'CB as per vendor', x => x.vendorCB),
    money('bcb', 'CB as per buyer', x => x.buyerCB),
    money('diff', 'Difference', x => x.diff, { sub: 'buyer − vendor', render: x => <b className={x.diff && Math.abs(x.diff) > 0.5 ? 'rw-neg' : ''}>{num(x.diff)}</b> }),
    ...ANNEXURES.map(a => money('a' + a.id, `Annexure ${a.id}`, x => x.annex ? x.annex[a.id] : null, { group: a.group, sub: a.title, render: (x: VRow) => x.annex ? <span className={x.annex[a.id] ? '' : 'rw-zero'}>{num(x.annex[a.id])}</span> : '—' })),
    money('grand', 'Grand total', x => x.grand, { render: x => <b>{num(x.grand)}</b> }),
    { key: 'unexp', label: 'Unexplained', sub: 'difference − grand total', align: 'right', text: x => x.diff === null ? '—' : num((x.diff ?? 0) - (x.grand ?? 0)), render: x => x.diff === null ? '—' : Math.abs((x.diff ?? 0) - (x.grand ?? 0)) < 0.5 ? <span className="rw-ok">✓ 0</span> : <span className="rw-neg">{num((x.diff ?? 0) - (x.grand ?? 0))}</span> },
    { key: 'open', label: 'Open items', align: 'right', text: x => String(x.openEx), sort: x => x.openEx },
    { key: 'vby', label: 'Vendor sign-off by', text: x => x.vSign?.by ?? '', render: x => x.vSign?.by ?? '—' },
    { key: 'vat', label: 'Vendor sign-off date', text: x => x.vSign?.at ?? '', render: x => x.vSign?.at ?? '—' },
    { key: 'bby', label: 'Buyer sign-off by', text: x => x.bSign?.by ?? '', render: x => x.bSign?.by ?? '—' },
    { key: 'bat', label: 'Buyer sign-off date', text: x => x.bSign?.at ?? '', render: x => x.bSign?.at ?? '—' },
  ];

  return <>
    <Card className="rw-overview" title="Overview" actions={<button className="rw-iconbtn" onClick={() => setOverview(!overview)} aria-expanded={overview} aria-label={overview ? 'Collapse overview' : 'Expand overview'}>{overview ? '▴' : '▾'}</button>}>
      {overview && <div className="rw-ov">
        <div><h3 className="rw-h3">Your dashboard</h3><div className="rw-tiles">
          {tile('ALL', all.length, 'Total allocated', 'Vendors assigned to you', 'blue', 'user')}
          {tile('Ledger not received', count('Ledger not received'), 'Ledger not received', 'Vendors pending ledger upload', 'red', 'inbox')}
          {tile('Open items in discussion', count('Open items in discussion'), 'Open items in discussion', 'Reconciliations in progress', 'amber', 'chat')}
          {tile('Signed off', count('Signed off'), 'Signed off', 'Completed reconciliations', 'green', 'sign')}
        </div></div>
        <div><h3 className="rw-h3">Reconciliation metrics</h3><div className="rw-metrics">
          <div className="rw-metric big"><b>{short(totalOpen)}</b><span>Total open</span><small>Net unreconciled amount, buyer − vendor</small></div>
          <div className="rw-metric green"><b>{short(closedLater)}</b><span>Subsequently closed</span><small>Timing items that clear next period</small></div>
          <div className="rw-metric red"><b>{short(disputes)}</b><span>Actual disputes</span><small>Open after timing and pending matches</small></div>
          <div className="rw-metric blue"><b>{ex.length ? Math.round((resolved / ex.length) * 100) : 0}%</b><span>Percentage closed</span><small>{resolved} of {ex.length} exceptions resolved</small></div>
        </div>{pendingConf !== 0 && <p className="rw-note">{short(pendingConf)} sits in suggested matches awaiting confirmation (Annexure IX).</p>}</div>
      </div>}
    </Card>
    <Card title={<>Vendor-level summary{statusF !== 'ALL' && <button className="rw-filter-tag" onClick={() => setStatusF('ALL')}>{statusF} <Icon n="x" s={12} /></button>}</>}
      tip={<>Each vendor’s difference is split into ten annexures, grouped by invoice, credit and debit notes, payments, pending and others. Every bridge line sits in exactly one annexure, so the grand total always equals the difference and nothing is left unexplained. Click a vendor to see the lines behind each annexure and to record sign-off.</>}>
      <DataTable rows={rows} cols={cols} rowKey={x => x.id} fileName="vendor-level-summary.csv" onRowClick={x => setDrawer(x.id)} activeKey={drawer ?? undefined} empty="No vendors with this status." />
      <ul className="rw-legend">{GROUPS.map(g => <li key={g} className={'grp-' + g.replace(/\W+/g, '').toLowerCase()}>{g}: {ANNEXURES.filter(a => a.group === g).map(a => `${a.id} ${a.title.toLowerCase()}`).join(' · ')}</li>)}</ul>
    </Card>
    {drawer && <VendorDrawer ctx={ctx} row={all.find(x => x.id === drawer)!} onClose={() => setDrawer(null)} />}
  </>;
}

function VendorDrawer({ ctx, row, onClose }: { ctx: Ctx; row: VRow; onClose: () => void }) {
  const { ws, setWs, annex, r, openException, openUpload } = ctx;
  const [open, setOpen] = useState<AnnexId | ''>('');
  const [signer, setSigner] = useState(`${row.name.split(' ')[0]} accounts (vendor)`);
  const data = annex.get(row.id);
  const exId = (k: string) => r.exceptions.find(e => e.key === k);
  const sign = (side: 'vendorSign' | 'buyerSign', by: string | null) => setWs(w => { const m = { ...w[side] }; if (by) m[row.id] = { by, at: stamp() }; else delete m[row.id]; return { ...w, [side]: m }; });
  if (row.status === 'Ledger not received') return <Drawer title={row.name} sub={`${row.id} · ${row.category}`} onClose={onClose}>
    <p className="rw-note warn">No statement has been received from this vendor for the period, so there is nothing to reconcile yet. The buyer ledger shows {inr(row.buyerCB, 2)} payable.</p>
    <button className="rw-btn lime" onClick={() => openUpload(row.id)}><Icon n="upload" /> Upload ledger</button>
  </Drawer>;
  const exportLines = () => download(`${row.id}_reconciliation.csv`, toCSV(ANNEXURES.flatMap(a => (data?.lines[a.id] ?? []).map(b => ({ 'Annexure': a.id, 'Annexure title': a.title, 'Line': b.id, 'Description': b.description, 'Effect': b.effect, 'Amount (buyer − vendor)': b.amount, 'Status': b.nature, 'Exception': exId(b.exceptionKey)?.id ?? '', 'Source records': b.refs.join(' | ') })))));
  return <Drawer wide title={row.name} sub={<>{row.id} · {row.category} · <Pill tone={statusTone(row.status)}>{row.status}</Pill></>} onClose={onClose}>
    <dl className="rw-dl four"><div><dt>CB as per buyer</dt><dd>{inr(row.buyerCB, 2)}</dd></div><div><dt>CB as per vendor</dt><dd>{inr(row.vendorCB, 2)}</dd></div><div><dt>Difference</dt><dd className="rw-neg">{inr(row.diff, 2)}</dd></div><div><dt>Open items</dt><dd>{row.openEx}</dd></div></dl>
    <div className="rw-h4-row"><h4 className="rw-h4">Annexures</h4><button className="rw-btn small" onClick={exportLines}><Icon n="download" s={14} /> Download reconciliation</button></div>
    <div className="rw-annex">
      {ANNEXURES.map(a => { const ls = data?.lines[a.id] ?? []; const amt = row.annex?.[a.id] ?? 0; const isOpen = open === a.id;
        return <div key={a.id} className={'rw-annex-item' + (ls.length ? '' : ' empty')}>
          <button disabled={!ls.length} onClick={() => setOpen(isOpen ? '' : a.id)} aria-expanded={isOpen}><span className="id">{a.id}</span><span><b>{a.title}</b><small>{a.group} · {a.sub}</small></span><em>{ls.length} line{ls.length === 1 ? '' : 's'}</em><b className="amt">{num(amt, 2)}</b></button>
          {isOpen && <ul>{ls.map(b => { const e = exId(b.exceptionKey); return <li key={b.id}><span><b>{b.description}</b><small>{b.effect} · {b.refs.join(', ')}</small></span>{e ? <button className="rw-link" onClick={() => openException(e.key)}>{e.id} · {e.status}</button> : <small>{b.nature}</small>}<b className="amt">{num(b.amount, 2)}</b></li>; })}</ul>}
        </div>; })}
      <div className="rw-annex-total"><span>Grand total</span><b>{num(row.grand, 2)}</b></div>
      <div className="rw-annex-total check"><span>Unexplained (difference − grand total)</span><b className={Math.abs((row.diff ?? 0) - (row.grand ?? 0)) < 0.5 ? 'rw-ok' : 'rw-neg'}>{num((row.diff ?? 0) - (row.grand ?? 0), 2)}</b></div>
    </div>
    <h4 className="rw-h4">Sign-off</h4>
    {row.openEx > 0 && !row.bSign && <p className="rw-note">{row.openEx} item{row.openEx > 1 ? 's are' : ' is'} still open. Signing off records that both sides agree this statement and its annexures, including the open items listed.</p>}
    <div className="rw-sign">
      <div><span>Vendor</span>{row.vSign ? <><b>{row.vSign.by}</b><small>{row.vSign.at}</small><button className="rw-link" onClick={() => sign('vendorSign', null)}>Withdraw</button></>
        : <><input value={signer} onChange={e => setSigner(e.target.value)} aria-label="Vendor signatory" /><button className="rw-btn small" disabled={!signer.trim()} onClick={() => sign('vendorSign', signer.trim())}>Record vendor sign-off</button></>}</div>
      <div><span>Buyer</span>{row.bSign ? <><b>{row.bSign.by}</b><small>{row.bSign.at}</small><button className="rw-link" onClick={() => sign('buyerSign', null)}>Withdraw</button></>
        : <button className="rw-btn small lime" onClick={() => sign('buyerSign', ME)}><Icon n="sign" s={14} /> Sign off as buyer</button>}</div>
    </div>
    {ws.vendorSign[row.id] && ws.buyerSign[row.id] && <p className="rw-note ok">Both sides have signed. This vendor shows as Signed off.</p>}
  </Drawer>;
}
