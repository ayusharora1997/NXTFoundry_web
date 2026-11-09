import React, { useState } from 'react';
import { ANNEXURES, ENTITY, ledgerBalance, vendorStatus, type Annex, type AnnexId, type SignOff, type VendorStatus } from './model';
import { Card, DataTable, Drawer, Icon, Pill, Ring, Waterfall, num, short, statusTone, type Col } from './ui';
import { PageHead, type Ctx } from './App';

export interface VRow { id: string; name: string; category: string; status: VendorStatus; vendorCB: number | null; buyerCB: number; diff: number | null; annex: Annex | null; grand: number | null; openEx: number; vSign?: SignOff; bSign?: SignOff }
export const GROUPS = ['Invoice', 'Credit / debit notes', 'Payments', 'Pending', 'Others'] as const;
const gcls = (g: string) => 'grp-' + g.replace(/\W+/g, '').toLowerCase();
const STATUSES: VendorStatus[] = ['Ledger not received', 'Open items in discussion', 'Signed off'];

export function vendorRows(ctx: Ctx): VRow[] {
  const { ws, r, annex } = ctx;
  return ws.data.suppliers.map(s => {
    const v = r.vendors.find(x => x.vendorId === s.id); const a = v ? annex.get(s.id)?.annex ?? Object.fromEntries(ANNEXURES.map(x => [x.id, 0])) as Annex : null;
    const grand = a ? Math.round(Object.values(a).reduce((t, x) => t + x, 0) * 100) / 100 : null;
    return { id: s.id, name: s.name, category: s.category, status: vendorStatus(ws, s.id), vendorCB: v ? v.supplierBalance : null, buyerCB: v ? v.buyerBalance : ledgerBalance(ws.data, s.id), diff: v ? v.variance : null, annex: a, grand, openEx: v ? v.openExceptions : 0, vSign: ws.vendorSign[s.id], bSign: ws.buyerSign[s.id] };
  });
}

export default function SummaryScreen({ ctx }: { ctx: Ctx }) {
  const { vendor, r, go } = ctx;
  const [statusF, setStatusF] = useState<VendorStatus | ''>('');
  const [group, setGroup] = useState('');
  const [view, setView] = useState<'map' | 'table'>('map');
  const [cell, setCell] = useState<{ v: string; a: AnnexId } | null>(null);
  const all = vendorRows(ctx).filter(x => vendor === 'ALL' || x.id === vendor);
  const rows = statusF ? all.filter(x => x.status === statusF) : all;
  const rec = all.filter(x => x.diff !== null);
  const buyer = rec.reduce((t, x) => t + x.buyerCB, 0), seller = rec.reduce((t, x) => t + (x.vendorCB ?? 0), 0);
  const gsum = (g: string) => rec.reduce((t, x) => t + ANNEXURES.filter(a => a.group === g).reduce((u, a) => u + (x.annex?.[a.id] ?? 0), 0), 0);
  const recs = r.normalized.buyer.filter(x => vendor === 'ALL' || x.vendorId === vendor).length + r.normalized.supplier.filter(x => vendor === 'ALL' || x.vendorId === vendor).length;
  const pairs = r.matches.filter(m => vendor === 'ALL' || m.buyer.vendorId === vendor).length;
  const exs = r.exceptions.filter(e => vendor === 'ALL' || e.vendorId === vendor);
  const timing = r.bridge.filter(b => (vendor === 'ALL' || b.vendorId === vendor) && b.bucket === 'Timing differences').reduce((t, b) => t + b.amount, 0);
  const max = Math.max(1, ...rec.flatMap(x => ANNEXURES.map(a => Math.abs(x.annex?.[a.id] ?? 0))));
  const ready = all.filter(x => x.status === 'Open items in discussion' && x.openEx === 0).length;

  const money = (key: string, label: string, f: (x: VRow) => number | null, extra: Partial<Col<VRow>> = {}): Col<VRow> => ({ key, label, align: 'right', text: x => num(f(x)), sort: x => f(x) ?? 0, total: xs => num(xs.reduce((s, x) => s + (f(x) ?? 0), 0)), ...extra });
  const cols: Col<VRow>[] = [
    { key: 'vendor', label: 'Vendor', sticky: true, width: 230, noToggle: true, text: x => x.name, render: x => <span className="rw-stack"><b>{x.name}</b><small>{x.id} · {x.category}</small></span>, total: () => <b>Total</b> },
    { key: 'entity', label: 'Entity', hidden: true, text: () => ENTITY },
    { key: 'status', label: 'Status', text: x => x.status, render: x => <Pill tone={statusTone(x.status)}>{x.status}</Pill> },
    money('vcb', 'CB as per vendor', x => x.vendorCB), money('bcb', 'CB as per buyer', x => x.buyerCB),
    money('diff', 'Difference', x => x.diff, { sub: 'buyer − vendor' }),
    ...ANNEXURES.map(a => money('a' + a.id, `Annexure ${a.id}`, x => x.annex ? x.annex[a.id] : null, { group: a.group, sub: a.title })),
    money('grand', 'Grand total', x => x.grand),
    { key: 'unexp', label: 'Unexplained', align: 'right', text: x => x.diff === null ? '—' : num((x.diff ?? 0) - (x.grand ?? 0)) },
    { key: 'vby', label: 'Vendor sign-off', text: x => x.vSign ? `${x.vSign.by} · ${x.vSign.at}` : '—' },
    { key: 'bby', label: 'Buyer sign-off', text: x => x.bSign ? `${x.bSign.by} · ${x.bSign.at}` : '—' },
  ];
  const cellRow = cell && rec.find(x => x.id === cell.v);

  return <>
    <PageHead n="04" title="Review and sign off" actions={ready > 0 && <span className="rd-hint"><Icon n="sign" s={15} /> {ready} vendor{ready > 1 ? 's have' : ' has'} no open items and can be signed off</span>}>
      Where the difference between the two sets of books sits, vendor by vendor, and who has agreed it.
    </PageHead>

    <section className="rd-hero">
      <div className="rd-hero-l">
        <span className="rd-k">Difference to explain</span>
        <b className="rd-big">{short(buyer - seller)}</b>
        <p>Buyer books show <b>{short(buyer)}</b> payable; vendor statements show <b>{short(seller)}</b>{all.length !== rec.length && <> ({all.length - rec.length} ledger{all.length - rec.length > 1 ? 's' : ''} not received)</>}.</p>
        <div className="rd-hero-rings">
          <Ring dark value={recs ? pairs * 2 / recs : 0} label="Records matched" sub={`${pairs} pairs`} />
          <Ring dark value={exs.length ? exs.filter(e => e.status === 'Resolved').length / exs.length : 0} label="Items resolved" sub={`${exs.filter(e => e.status === 'Resolved').length} of ${exs.length} · ${short(timing)} is timing`} />
        </div>
        <div className="rd-status-bar" role="group" aria-label="Vendors by status">
          {STATUSES.map(s => { const n = all.filter(x => x.status === s).length; return n ? <button key={s} style={{ flex: n }} className={statusTone(s) + (statusF === s ? ' on' : '')} onClick={() => setStatusF(statusF === s ? '' : s)} aria-pressed={statusF === s} title={s}><b>{n}</b><span>{s}</span></button> : null; })}
        </div>
      </div>
      <div className="rd-hero-r">
        <div className="rd-hero-rh"><span className="rd-k">From buyer balance to vendor balance</span>{group && <button className="rw-filter-tag dark" onClick={() => setGroup('')}>{group} <Icon n="x" s={12} /></button>}</div>
        <Waterfall start={{ label: 'Buyer CB', value: buyer }} end={{ label: 'Vendor CB', value: seller }} active={group} onPick={setGroup}
          steps={GROUPS.map(g => ({ key: g, label: g === 'Credit / debit notes' ? 'CN / DN' : g, value: gsum(g), note: ANNEXURES.filter(a => a.group === g).map(a => `${a.id} ${a.title}`).join(', ') }))} />
        <p className="rd-cap">Each bar is a group of annexures. Click one to highlight it in the vendor map below.</p>
      </div>
    </section>

    <Card title={<>Where the difference sits{statusF && <button className="rw-filter-tag" onClick={() => setStatusF('')}>{statusF} <Icon n="x" s={12} /></button>}</>}
      tip="Every bridge line lands in exactly one annexure, so a vendor’s annexures always add up to its difference. Darker cells are larger amounts; blue means the buyer records more, amber means the vendor does."
      actions={<div className="rw-seg"><button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>Heat map</button><button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Full table</button></div>}>
      {view === 'table' ? <DataTable rows={rows} cols={cols} rowKey={x => x.id} fileName="vendor-level-summary.csv" onRowClick={x => go('vendor', x.id)} />
        : <div className="rw-table-wrap"><table className="rd-map">
          <thead><tr><th rowSpan={2} className="v">Vendor</th><th rowSpan={2} className="ar">Difference</th>{GROUPS.map(g => <th key={g} colSpan={ANNEXURES.filter(a => a.group === g).length} className={'grp ' + gcls(g) + (group && group !== g ? ' dim' : '')}>{g}</th>)}<th rowSpan={2}>Open</th><th rowSpan={2}>Sign-off</th></tr>
            <tr>{ANNEXURES.map(a => <th key={a.id} className={'an ' + (group && group !== a.group ? 'dim' : '')} title={`${a.title}: ${a.sub}`}>{a.id}<small>{a.title}</small></th>)}</tr></thead>
          <tbody>{rows.map(x => <tr key={x.id}>
            <td className="v"><button className="rd-vlink" onClick={() => go('vendor', x.id)}><span className={'rw-dot ' + statusTone(x.status)} /><span><b>{x.name}</b><small>{x.status}</small></span></button></td>
            <td className="ar"><b>{x.diff === null ? '—' : short(x.diff)}</b></td>
            {ANNEXURES.map(a => { const v = x.annex?.[a.id] ?? 0; const k = Math.min(1, Math.abs(v) / max); const dim = group && group !== a.group;
              return <td key={a.id} className={'cell' + (dim ? ' dim' : '')}>{x.annex === null ? <span className="na">·</span> : v === 0 ? <span className="zero">–</span>
                : <button className={v > 0 ? 'pos' : 'neg'} style={{ ['--k' as string]: 0.12 + k * 0.78 } as React.CSSProperties} onClick={() => setCell({ v: x.id, a: a.id })} aria-label={`${x.name}, annexure ${a.id}: ${num(v)}`}>{short(v).replace('₹', '')}</button>}</td>; })}
            <td className="ar">{x.diff === null ? '—' : x.openEx}</td>
            <td><span className="rd-sign" title={`Vendor: ${x.vSign ? 'signed' : 'pending'} · Buyer: ${x.bSign ? 'signed' : 'pending'}`}><i className={x.vSign ? 'on' : ''}>V</i><i className={x.bSign ? 'on' : ''}>B</i></span></td>
          </tr>)}</tbody></table></div>}
    </Card>
    {cell && cellRow && <CellDrawer ctx={ctx} row={cellRow} a={cell.a} onClose={() => setCell(null)} />}
  </>;
}

function CellDrawer({ ctx, row, a, onClose }: { ctx: Ctx; row: VRow; a: AnnexId; onClose: () => void }) {
  const { annex, r, openException, go } = ctx;
  const meta = ANNEXURES.find(x => x.id === a)!;
  const lines = annex.get(row.id)?.lines[a] ?? [];
  return <Drawer title={`Annexure ${a} · ${meta.title}`} sub={`${row.name} · ${meta.sub}`} onClose={onClose}>
    <dl className="rw-dl"><div><dt>Lines</dt><dd>{lines.length}</dd></div><div><dt>Amount (buyer − vendor)</dt><dd>{num(row.annex?.[a] ?? 0, 2)}</dd></div></dl>
    <ul className="rd-lines">{lines.map(b => { const e = r.exceptions.find(x => x.key === b.exceptionKey); return <li key={b.id}><div><b>{b.description}</b><small>{b.effect} · {b.refs.join(', ')}</small></div><b className="amt">{num(b.amount, 2)}</b>
      {e && <button className="rw-btn small" onClick={() => openException(e.key)}>{e.id} · {e.status} <Icon n="open" s={13} /></button>}</li>; })}</ul>
    <button className="rw-btn" onClick={() => go('vendor', row.id)}>Open {row.name.split(' ')[0]} workspace →</button>
  </Drawer>;
}
