import React, { useEffect, useState } from 'react';
import { fmtDate } from './data';
import { OWNERS, type Category, type Exception, type Resolution, type Status } from './engine';
import { actTime, ME } from './model';
import { Avatar, Card, DataTable, Drawer, Icon, Pill, inr, num, sevTone, short, statusTone, type Col } from './ui';
import { PageHead, type Ctx } from './App';

const STATUSES: Status[] = ['Open', 'Under investigation', 'Awaiting supplier', 'Resolved'];
const STATUS_LABEL: Record<Status, string> = { 'Open': 'Open', 'Under investigation': 'Investigating', 'Awaiting supplier': 'Waiting on vendor', 'Resolved': 'Resolved' };
const RESOLUTIONS: Exclude<Resolution, ''>[] = ['Buyer ledger adjustment', 'Supplier statement correction', 'Timing difference — clears next period', 'Explained — no adjustment needed'];
const PARTIAL = new Set<Category>(['Invoice amount mismatch', 'Tax amount mismatch', 'Partial payment']);
const CONTROLS = new Set<Category>(['Purchase order amount variance', 'Goods receipt discrepancy', 'Quantity mismatch', 'Price mismatch', 'Duplicate payment', 'Date or period mismatch']);
type Tab = 'all' | 'open' | 'partial' | 'suggested' | 'timing' | 'controls';
const TABS: { id: Tab; label: string; tip: string }[] = [
  { id: 'all', label: 'Everything', tip: 'Every open item across the categories below.' },
  { id: 'open', label: 'One side only', tip: 'On one side only, or posted against the wrong vendor. These make up most of the difference.' },
  { id: 'partial', label: 'Partly matched', tip: 'The same document on both sides with a different value or tax, and invoices paid in part.' },
  { id: 'suggested', label: 'Suggested matches', tip: 'Different references but the same vendor, amount and date. Confirm or reject each one.' },
  { id: 'timing', label: 'Clears next period', tip: 'Invoices and payments at period end that the other side accounts next period.' },
  { id: 'controls', label: 'Control checks', tip: 'Not differences between the ledgers, but risks found against POs, goods receipts and the payment register.' },
];
function catOf(e: Exception): Exclude<Tab, 'all'> {
  if (e.category === 'Probable match awaiting confirmation') return 'suggested';
  if (e.nature === 'Timing difference') return 'timing';
  if (PARTIAL.has(e.category) || (e.category === 'Debit note discrepancy' && e.records.length === 2)) return 'partial';
  if (CONTROLS.has(e.category)) return 'controls';
  return 'open';
}
const AGES: [string, number, number][] = [['0–15 days', 0, 15], ['16–30', 16, 30], ['31–60', 31, 60], ['Over 60', 61, 9999]];

export default function UnreconciledScreen({ ctx }: { ctx: Ctx }) {
  const { r, vendor, vName, edit, setDecisions, focus, clearFocus, undoable, log } = ctx;
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [age, setAge] = useState<number | null>(null);
  const [cat, setCat] = useState<Category | ''>('');
  const [showResolved, setShowResolved] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Status | ''>('');
  useEffect(() => { if (!focus.exception) return; const e = r.exceptions.find(x => x.key === focus.exception); if (e) { setTab(catOf(e) === 'suggested' ? 'suggested' : 'all'); setDetail(e.key); setShowResolved(true); } clearFocus(); }, [focus.exception]);
  const mine = r.exceptions.filter(e => (vendor === 'ALL' || e.vendorId === vendor) && catOf(e) !== 'suggested');
  const pending = r.pending.filter(m => vendor === 'ALL' || m.buyer.vendorId === vendor);
  const open = mine.filter(e => e.status !== 'Resolved');
  const inTab = mine.filter(e => (tab === 'all' || catOf(e) === tab) && (age === null || (e.ageDays >= AGES[age][1] && e.ageDays <= AGES[age][2])) && (!cat || e.category === cat));
  const listRows = showResolved ? inTab : inTab.filter(e => e.status !== 'Resolved');
  const ageData = AGES.map(([l, a, b]) => { const xs = open.filter(e => e.ageDays >= a && e.ageDays <= b); return { l, n: xs.length, v: xs.reduce((t, e) => t + e.impact, 0) }; });
  const ageMax = Math.max(1, ...ageData.map(x => x.v));
  const cats = Object.entries(open.reduce<Record<string, number>>((m, e) => ({ ...m, [e.category]: (m[e.category] ?? 0) + e.impact }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const catMax = Math.max(1, ...cats.map(c => c[1]));
  const move = (key: string, to: Status) => {
    const e = r.exceptions.find(x => x.key === key); if (!e || e.status === to) return;
    if (to === 'Resolved') { setResolving(key); return; }
    undoable(`${e.id} moved to ${STATUS_LABEL[to]}`, () => edit(key, { status: to, resolution: e.status === 'Resolved' ? '' : undefined }));
  };
  const bulk = (patch: { owner?: string; status?: Status }) => { const n = sel.length; undoable(`${n} item${n > 1 ? 's' : ''} updated`, () => sel.forEach(k => edit(k, patch))); setSel([]); };
  const cols: Col<Exception>[] = [
    { key: 'id', label: 'Item', text: e => e.id, render: e => <span className="rw-stack"><b>{e.id}</b><small>{e.ageDays}d old</small></span>, sort: e => Number(e.id.slice(3)) },
    { key: 'sev', label: 'Severity', text: e => e.severity, sort: e => ['Critical', 'High', 'Medium', 'Low'].indexOf(e.severity), render: e => <Pill tone={sevTone(e.severity)}>{e.severity}</Pill> },
    { key: 'cat', label: 'What', width: 260, text: e => `${e.category} ${e.subtype}`, render: e => <span className="rw-stack"><b>{e.category}</b><small>{e.subtype} · {e.refs.join(', ')}</small></span> },
    { key: 'vendor', label: 'Vendor', width: 180, text: e => vName(e.vendorId), hidden: vendor !== 'ALL' },
    { key: 'b', label: 'Buyer', align: 'right', text: e => num(e.buyerAmount, 2), sort: e => e.buyerAmount ?? 0 },
    { key: 's', label: 'Vendor amount', align: 'right', text: e => num(e.supplierAmount, 2), sort: e => e.supplierAmount ?? 0 },
    { key: 'eff', label: 'Effect on difference', align: 'right', hidden: true, text: e => num(e.balanceEffect, 2), sort: e => e.balanceEffect },
    { key: 'imp', label: 'Impact', align: 'right', text: e => num(e.impact, 2), sort: e => e.impact, render: e => <b>{num(e.impact)}</b> },
    { key: 'owner', label: 'Owner', text: e => e.owner, render: e => <span className="rd-owner"><Avatar name={e.owner} />{e.owner}</span> },
    { key: 'status', label: 'Status', text: e => e.status, render: e => <Pill tone={statusTone(e.status)}>{STATUS_LABEL[e.status]}</Pill> },
  ];
  const sel1 = r.exceptions.find(e => e.key === detail);
  const res1 = r.exceptions.find(e => e.key === resolving);
  return <>
    <PageHead n="03" title="Resolve open items" actions={<div className="rw-seg"><button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button></div>}>
      Everything that did not reconcile cleanly. Drag items across the board as work moves, or use the list to sort, select and update in bulk.
    </PageHead>
    <section className="rd-insights">
      <div className="rd-ins"><span className="rd-k">Open impact</span><b className="rd-big2">{short(open.reduce((t, e) => t + e.impact, 0))}</b><small>{open.length} open items · {mine.length - open.length} resolved{pending.length ? ` · ${pending.length} suggestions waiting` : ''}</small></div>
      <div className="rd-ins"><span className="rd-k">Ageing of open items</span><div className="rd-age">{ageData.map((x, i) => <button key={x.l} className={(age === i ? 'on' : '') + (age !== null && age !== i ? ' dim' : '')} onClick={() => setAge(age === i ? null : i)} aria-pressed={age === i}>
        <span className="bar"><i style={{ height: `${Math.max(4, (x.v / ageMax) * 100)}%` }} /></span><b>{short(x.v)}</b><small>{x.l} · {x.n}</small></button>)}</div></div>
      <div className="rd-ins"><span className="rd-k">Biggest categories</span><ul className="rd-hbars">{cats.map(([c, v]) => <li key={c}><button className={(cat === c ? 'on' : '') + (cat && cat !== c ? ' dim' : '')} onClick={() => setCat(cat === c ? '' : c as Category)} aria-pressed={cat === c}><span>{c}</span><i style={{ width: `${(v / catMax) * 100}%` }} /><b>{short(v)}</b></button></li>)}</ul></div>
    </section>
    <Card>
      <div className="rw-tabs" role="tablist">{TABS.map(t => { const n = t.id === 'suggested' ? pending.length : open.filter(e => t.id === 'all' || catOf(e) === t.id).length;
        return <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setSel([]); }}>{t.label}<em>{n}</em></button>; })}</div>
      <div className="rd-filterline"><p>{TABS.find(t => t.id === tab)!.tip}</p>
        {(age !== null || cat) && <span>{age !== null && <button className="rw-filter-tag" onClick={() => setAge(null)}>{AGES[age][0]} <Icon n="x" s={12} /></button>}{cat && <button className="rw-filter-tag" onClick={() => setCat('')}>{cat} <Icon n="x" s={12} /></button>}</span>}
        {view === 'list' && tab !== 'suggested' && <label className="rd-toggle"><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Show resolved</label>}</div>

      {tab === 'suggested' ? (pending.length === 0 ? <p className="rw-empty-block">No suggestions waiting. Rejected ones move to “One side only”.</p>
        : <div className="rw-pairs">{pending.map(m => <div className="rw-pair" key={m.key}>
          <div><span>Buyer ledger</span><b>{m.buyer.rawRef}</b><small>{m.buyer.id} · {fmtDate(m.buyer.date)}</small><b className="amt">{inr(m.buyer.amount, 2)}</b><small>{m.buyer.description}</small></div>
          <div><span>Vendor statement</span><b>{m.supplier.rawRef}</b><small>{m.supplier.id} · {fmtDate(m.supplier.date)}</small><b className="amt">{inr(m.supplier.amount, 2)}</b><small>{m.supplier.description}</small></div>
          <p><b>{vName(m.buyer.vendorId)}</b> · amounts differ by {inr(m.diff, 2)}, dates {Math.round(Math.abs(m.buyer.date - m.supplier.date) / 86400000)} day(s) apart. The buyer reference looks like a delivery challan number rather than the invoice number.</p>
          <div className="rw-pair-actions">
            <button className="rw-btn lime" onClick={() => undoable(`Match confirmed: ${m.buyer.rawRef} = ${m.supplier.rawRef}`, () => { setDecisions(d => ({ ...d, probable: { ...d.probable, [m.key]: 'confirmed' } })); log({ kind: 'match', vendorId: m.buyer.vendorId, what: `Confirmed suggested match ${m.buyer.rawRef} = ${m.supplier.rawRef}` }); })}>Same transaction · confirm</button>
            <button className="rw-btn" onClick={() => undoable('Suggestion rejected; both records are open items', () => { setDecisions(d => ({ ...d, probable: { ...d.probable, [m.key]: 'rejected' } })); log({ kind: 'match', vendorId: m.buyer.vendorId, what: `Rejected suggested match ${m.buyer.rawRef} / ${m.supplier.rawRef}` }); })}>Not the same</button></div>
        </div>)}</div>)

      : view === 'board' ? <div className="rd-board">{STATUSES.map(s => { const items = inTab.filter(e => e.status === s).sort((a, b) => b.impact - a.impact);
          return <section key={s} className={'rd-col ' + statusTone(s) + (dragOver === s ? ' over' : '')} onDragOver={e => { e.preventDefault(); setDragOver(s); }} onDragLeave={() => setDragOver('')} onDrop={e => { e.preventDefault(); setDragOver(''); const k = e.dataTransfer.getData('text/plain'); if (k) move(k, s); }}>
            <header><span className={'rw-dot ' + statusTone(s)} /><b>{STATUS_LABEL[s]}</b><em>{items.length}</em><small>{short(items.reduce((t, e) => t + e.impact, 0))}</small></header>
            <div className="rd-cards">{items.slice(0, s === 'Resolved' ? 8 : 40).map(e => <article key={e.key} className={'rd-card' + (detail === e.key ? ' on' : '')} draggable onDragStart={ev => { ev.dataTransfer.setData('text/plain', e.key); ev.dataTransfer.effectAllowed = 'move'; }} onClick={() => setDetail(e.key)} tabIndex={0} onKeyDown={ev => { if (ev.key === 'Enter') setDetail(e.key); }}>
              <div className="top"><b>{e.id}</b><Pill tone={sevTone(e.severity)}>{e.severity}</Pill><span className="imp">{short(e.impact)}</span></div>
              <p>{e.category}</p><small>{vName(e.vendorId)} · {e.ageDays}d</small>
              <div className="bot"><Avatar name={e.owner} /><select value={e.status} onClick={ev => ev.stopPropagation()} onChange={ev => move(e.key, ev.target.value as Status)} aria-label={`Move ${e.id}`}>{STATUSES.map(x => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}</select></div>
            </article>)}
              {s === 'Resolved' && items.length > 8 && <p className="rd-more-note">+{items.length - 8} more in the list view</p>}
              {!items.length && <p className="rd-drop-hint">Drop items here</p>}</div>
          </section>; })}</div>

      : <DataTable key={tab} rows={listRows} cols={cols} rowKey={e => e.key} fileName={`open-items-${tab}.csv`} onRowClick={e => setDetail(e.key)} activeKey={detail ?? undefined} selectable selected={sel} onSelect={setSel} initialSort={{ key: 'imp', dir: -1 }}
          empty="Nothing here for the selected vendors."
          toolbar={sel.length > 0 && <span className="rw-bulk">{sel.length} selected
            <select value="" onChange={e => e.target.value && bulk({ owner: e.target.value })} aria-label="Assign owner to selected"><option value="">Assign owner…</option>{OWNERS.map(o => <option key={o}>{o}</option>)}</select>
            <select value="" onChange={e => e.target.value && bulk({ status: e.target.value as Status })} aria-label="Set status of selected"><option value="">Move to…</option>{STATUSES.filter(s => s !== 'Resolved').map(o => <option key={o} value={o}>{STATUS_LABEL[o]}</option>)}</select></span>} />}
    </Card>
    {sel1 && <ExceptionDrawer ctx={ctx} e={sel1} onClose={() => setDetail(null)} onResolve={() => setResolving(sel1.key)} />}
    {res1 && <ResolveDialog ctx={ctx} e={res1} onClose={() => setResolving(null)} />}
  </>;
}

function ResolveDialog({ ctx, e, onClose }: { ctx: Ctx; e: Exception; onClose: () => void }) {
  const [res, setRes] = useState<Resolution>(e.nature === 'Timing difference' ? 'Timing difference — clears next period' : '');
  const [note, setNote] = useState('');
  const help: Record<string, string> = {
    'Buyer ledger adjustment': 'We correct our own books (post, reverse or reclassify).', 'Supplier statement correction': 'The vendor corrects their statement.',
    'Timing difference — clears next period': 'Both sides are right; it reverses in the next period.', 'Explained — no adjustment needed': 'Understood and documented; no entry needed.',
  };
  return <Drawer title={`Resolve ${e.id}`} sub={`${e.category} · ${ctx.vName(e.vendorId)} · ${inr(e.impact)}`} onClose={onClose}>
    <fieldset className="rd-res"><legend className="rw-h4">How was it resolved?</legend>{RESOLUTIONS.map(x => <label key={x} className={res === x ? 'on' : ''}><input type="radio" name="res" checked={res === x} onChange={() => setRes(x)} /><span><b>{x}</b><small>{help[x]}</small></span></label>)}</fieldset>
    <label className="rw-field"><span>Note for the audit trail <i>(optional)</i></span><textarea rows={3} value={note} onChange={ev => setNote(ev.target.value)} placeholder="e.g. Reversal posted as JV-2207 on 14 July" /></label>
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!res} onClick={() => {
      ctx.undoable(`${e.id} resolved`, () => { ctx.edit(e.key, { resolution: res, status: 'Resolved' }); if (note.trim()) ctx.log({ kind: 'comment', vendorId: e.vendorId, exceptionKey: e.key, what: `Note on ${e.id}`, text: note.trim() }); });
      onClose();
    }}>Mark resolved</button></div>
  </Drawer>;
}

function ExceptionDrawer({ ctx, e, onClose, onResolve }: { ctx: Ctx; e: Exception; onClose: () => void; onResolve: () => void }) {
  const { r, ws, vName, edit, setDecisions, undoable, log } = ctx;
  const unmatched = e.records.filter(x => (x.side === 'buyer' ? r.unmatchedBuyer : r.unmatchedSupplier).some(u => u.id === x.id));
  const one = unmatched.length === 1 && e.records.length === 1 ? unmatched[0] : null;
  const counterparts = one ? (one.side === 'buyer' ? r.unmatchedSupplier : r.unmatchedBuyer).filter(c => c.vendorId === one.vendorId && c.currency === one.currency && c.docClass === one.docClass) : [];
  const [cp, setCp] = useState(''); const [comment, setComment] = useState(''); const [copied, setCopied] = useState(false);
  const thread = ws.activity.filter(a => a.exceptionKey === e.key).sort((a, b) => actTime(a.at) - actTime(b.at) || a.id - b.id);
  const query = `Subject: ${ctx.vName(e.vendorId)} – statement query ${e.id}\n\nHello,\n\nWhile reconciling your statement for Apr–Jun 2026 we found a difference we need your help with:\n\n• ${e.category}: ${e.subtype}\n• Reference(s): ${e.refs.join(', ')}\n${e.buyerAmount !== null ? `• Per our books: ${inr(e.buyerAmount, 2)}\n` : ''}${e.supplierAmount !== null ? `• Per your statement: ${inr(e.supplierAmount, 2)}\n` : ''}\nCould you please check and share the supporting document or a corrected statement?\n\nThank you,\nAccounts Payable, Meridian Consumer Products`;
  const copy = async () => { try { await navigator.clipboard.writeText(query); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } if (e.status === 'Open' || e.status === 'Under investigation') edit(e.key, { status: 'Awaiting supplier' }); log({ kind: 'comment', vendorId: e.vendorId, exceptionKey: e.key, what: `Query drafted to vendor for ${e.id}` }); };
  return <Drawer wide title={<>{e.id} · {e.category}</>} sub={<>{vName(e.vendorId)} · {e.subtype} · <Pill tone={sevTone(e.severity)}>{e.severity}</Pill> <Pill>{e.nature}</Pill></>} onClose={onClose}>
    <div className="rd-status-pick" role="group" aria-label="Status">{STATUSES.map(s => <button key={s} className={e.status === s ? 'on ' + statusTone(s) : ''} onClick={() => s === 'Resolved' ? onResolve() : undoable(`${e.id} moved to ${STATUS_LABEL[s]}`, () => edit(e.key, { status: s, resolution: '' }))}>{STATUS_LABEL[s]}</button>)}</div>
    {e.resolution && <p className="rw-note ok">Resolved as <b>{e.resolution}</b>.</p>}
    <dl className="rw-dl five"><div><dt>Our books</dt><dd>{inr(e.buyerAmount, 2)}</dd></div><div><dt>Vendor statement</dt><dd>{inr(e.supplierAmount, 2)}</dd></div><div><dt>Effect on difference</dt><dd>{e.balanceEffect ? inr(e.balanceEffect, 2) : 'None'}</dd></div><div><dt>Potential impact</dt><dd>{inr(e.impact, 2)}</dd></div><div><dt>Age</dt><dd>{e.ageDays} days</dd></div></dl>
    <div className="rd-two">
      <div><h4 className="rw-h4">What to check</h4><p className="rw-advice">{e.recommendation}</p>
        <h4 className="rw-h4">Evidence</h4><ul className="rw-evidence">{e.evidence.map(x => <li key={x}>{x}</li>)}</ul></div>
      <div><h4 className="rw-h4">Owner</h4><div className="rd-owners">{OWNERS.map(o => <button key={o} className={e.owner === o ? 'on' : ''} onClick={() => edit(e.key, { owner: o })}><Avatar name={o} />{o}</button>)}</div></div>
    </div>
    <h4 className="rw-h4">Source records</h4>
    <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Side</th><th>Record</th><th>Reference</th><th>Date</th><th className="ar">Amount</th><th>PO / GRN</th><th>Narration</th></tr></thead>
      <tbody>{e.records.map(x => <tr key={x.id}><td>{x.side === 'buyer' ? 'Our books' : 'Vendor'}</td><td>{x.id}</td><td>{x.rawRef}</td><td>{fmtDate(x.date)}</td><td className="ar">{num(x.amount, 2)}</td><td>{[x.po, x.grn].filter(Boolean).join(' / ') || '—'}</td><td>{x.description}</td></tr>)}</tbody></table></div>
    {one && counterparts.length > 0 && <><h4 className="rw-h4">Pair it by hand</h4><div className="rw-manual"><select value={cp} onChange={ev => setCp(ev.target.value)} aria-label="Counterpart record"><option value="">Pick the matching {one.side === 'buyer' ? 'vendor statement' : 'buyer ledger'} line…</option>{counterparts.map(c => <option key={c.id} value={c.id}>{c.rawRef || c.id} · {fmtDate(c.date)} · {inr(c.amount, 2)}</option>)}</select>
      <button className="rw-btn" disabled={!cp} onClick={() => { undoable(`${e.id} paired by hand`, () => { setDecisions(d => ({ ...d, manual: [...d.manual, one.side === 'buyer' ? { buyerId: one.id, supplierId: cp } : { buyerId: cp, supplierId: one.id }] })); log({ kind: 'match', vendorId: e.vendorId, what: `Paired ${one.rawRef || one.id} by hand` }); }); onClose(); }}>Pair</button></div></>}
    {e.supplierAmount !== null || e.buyerAmount !== null ? <><div className="rw-h4-row"><h4 className="rw-h4">Query to the vendor</h4><button className="rw-btn small" onClick={copy}><Icon n="file" s={14} /> {copied ? 'Copied' : 'Copy and mark waiting'}</button></div>
      <pre className="rd-query">{query}</pre></> : null}
    <h4 className="rw-h4">Discussion</h4>
    <ol className="rw-timeline compact">{thread.map(a => <li key={a.id} className={a.kind}><Avatar name={a.who} /><div><p><b>{a.who}</b> · {a.what}</p>{a.text && <blockquote>{a.text}</blockquote>}<small>{a.at}</small></div></li>)}
      {!thread.length && <li className="empty">No comments yet.</li>}</ol>
    <div className="rd-note-box"><textarea rows={2} value={comment} onChange={ev => setComment(ev.target.value)} placeholder="Add a comment for the team" aria-label="Add a comment" />
      <button className="rw-btn small lime" disabled={!comment.trim()} onClick={() => { log({ kind: 'comment', vendorId: e.vendorId, exceptionKey: e.key, what: `Commented on ${e.id}`, text: comment.trim() }); setComment(''); }}>Comment</button></div>
    <p className="rw-note">Signed in as {ME}.</p>
  </Drawer>;
}
