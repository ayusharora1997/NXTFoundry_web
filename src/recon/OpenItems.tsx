import React, { useMemo, useState } from 'react';
import { openItems, updateException, proposeAdjustment, decideAdjustment, currentPeriod, TYPE_LABEL, MANUAL_STATUSES, fmtDay, tagKey, type OpenItem, type RelState, type ExStatus } from './cycle';
import { ENTITIES } from './ledger';
import { USERS } from './store';
import { Avatar, Card, DataTable, Drawer, Icon, Pill, money, signedMoney, type Col } from './ui';
import { PageHead, vendorOf, entityOf, type Ctx } from './App';

interface Row { st: RelState; tag: string; it: OpenItem }
const OWNERS = ['Priya Nair', 'Arjun Mehta', 'Procurement', 'Treasury', 'Stores'];
const AGE: [string, number, number][] = [['0–30 days', 0, 30], ['31–60', 31, 60], ['61–90', 61, 90], ['Over 90', 91, 99999]];
const exTone = (s: ExStatus) => s === 'Open' ? 'amber' : s.startsWith('Awaiting') ? 'violet' : s === 'Under Investigation' ? 'blue' : s.startsWith('Closed') || s === 'Resolved' ? 'green' : 'grey';

export default function OpenItemsScreen({ ctx }: { ctx: Ctx }) {
  const { ws, settings, run, user, at, label, go } = ctx;
  const [f, setF] = useState({ rel: '', entity: '', bu: '', origin: '', type: '', cat: '', side: '', min: '', age: '', owner: '', status: '' });
  const [sel, setSel] = useState<string[]>([]); const [detail, setDetail] = useState<string | null>(null);
  const all: Row[] = useMemo(() => Object.values(ws.states).flatMap(st => { const tag = currentPeriod(st).tag; return openItems(st, tag, settings).map(it => ({ st, tag, it })); }), [ws, settings]);
  const rows = all.filter(r => (!f.rel || r.st.rel.id === f.rel) && (!f.entity || r.st.rel.entityId === f.entity) && (!f.bu || r.st.rel.bu === f.bu) && (!f.origin || r.it.txn.originTag === f.origin) && (!f.type || TYPE_LABEL[r.it.txn.type] === f.type)
    && (!f.cat || r.it.category === f.cat) && (!f.side || r.it.txn.side === f.side) && (!f.min || Math.abs(r.it.txn.amount) >= Number(f.min)) && (!f.age || (r.it.ageDays >= AGE[+f.age][1] && r.it.ageDays <= AGE[+f.age][2])) && (!f.owner || r.it.ex.owner === f.owner) && (!f.status || r.it.ex.status === f.status));
  const uniq = (fn: (r: Row) => string) => [...new Set(all.map(fn))].sort();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const bulk = (patch: { owner?: string; status?: ExStatus }) => { let n = 0; sel.forEach(id => { const r = all.find(x => x.it.txn.id === id); if (r && run(s => updateException(s, r.tag, id, patch, user.name, at(), settings), '', r.st.rel.id)) n++; }); if (n) ctx.toast(`${n} item(s) updated`); setSel([]); };
  const cols: Col<Row>[] = [
    { key: 'doc', label: 'Item', width: 200, text: r => `${r.it.txn.docNo} ${r.it.txn.ref}`, render: r => <span className="rw-stack"><b>{r.it.txn.docNo || r.it.txn.ref}</b><small>{r.it.txn.side === 'B' ? 'Buyer books' : 'Vendor books'} · {TYPE_LABEL[r.it.txn.type]}</small></span> },
    { key: 'rel', label: 'Relationship', width: 200, text: r => label(r.st), render: r => <span className="rw-stack"><span>{vendorOf(r.st).displayName}</span><small>{r.st.rel.bu} · {r.st.rel.currency}</small></span> },
    { key: 'tag', label: 'Original period', text: r => r.it.txn.originTag, sort: r => tagKey(r.it.txn.originTag), render: r => <span className="rw-stack"><span className={'rx-tag' + (r.it.txn.originTag !== r.tag ? ' old' : '')}>{r.it.txn.originTag}</span>{r.it.carriedPeriods.length > 0 && <small>carried {r.it.carriedPeriods.length}×</small>}</span> },
    { key: 'amt', label: 'Amount', align: 'right', text: r => money(r.it.txn.amount, r.st.rel.currency), sort: r => Math.abs(r.it.txn.amount), render: r => <b>{signedMoney(r.it.txn.amount, r.st.rel.currency)}</b> },
    { key: 'age', label: 'Age', align: 'right', text: r => `${r.it.ageDays}d`, sort: r => r.it.ageDays },
    { key: 'cat', label: 'Category', width: 220, text: r => r.it.category, render: r => <span className="rw-stack"><span>{r.it.category}</span>{r.it.timing && <small>Possible timing difference</small>}</span> },
    { key: 'pri', label: 'Priority', text: r => r.it.ex.priority, render: r => <Pill tone={r.it.ex.priority === 'High' ? 'red' : r.it.ex.priority === 'Medium' ? 'amber' : 'grey'}>{r.it.ex.priority}</Pill> },
    { key: 'own', label: 'Owner', text: r => r.it.ex.owner, render: r => <span className="rd-owner"><Avatar name={r.it.ex.owner} />{r.it.ex.owner}</span> },
    { key: 'st', label: 'Status', text: r => r.it.ex.status, render: r => <Pill tone={exTone(r.it.ex.status)}>{r.it.ex.status}</Pill> },
    { key: 'ent', label: 'Entity', hidden: true, text: r => entityOf(r.st).name },
  ];
  const cur = all.find(r => r.it.txn.id === detail);
  const pendingAdj = Object.values(ws.states).flatMap(st => st.adjustments.filter(a => a.status === 'pending').map(a => ({ st, a })));
  const totals = (side: 'B' | 'V') => rows.filter(r => r.it.txn.side === side).length;
  return <>
    <PageHead title="Open item management">Every item still open in the current period of each relationship, with its original period, how long it has been carried, and who is working on it.</PageHead>
    <div className="rx-tiles four">
      <div className="rx-tile"><span>Open items shown</span><b>{rows.length}</b><small>{totals('B')} buyer-side · {totals('V')} vendor-side</small></div>
      <div className="rx-tile amber"><span>Carried from earlier periods</span><b>{rows.filter(r => r.it.txn.originTag !== r.tag).length}</b><small>Oldest {rows.length ? rows.map(r => r.it.txn.originTag).sort((a, b) => tagKey(a) - tagKey(b))[0] : '—'}</small></div>
      <div className="rx-tile"><span>Waiting on someone</span><b>{rows.filter(r => r.it.ex.status.startsWith('Awaiting')).length}</b><small>Vendor, buyer, documents or approval</small></div>
      <div className={'rx-tile ' + (pendingAdj.length ? 'violet' : '')}><span>Adjustments awaiting approval</span><b>{pendingAdj.length}</b><small>{ctx.approver ? 'You can approve these' : 'Approver needed'}</small></div>
    </div>
    {pendingAdj.length > 0 && <Card title="Adjustments awaiting approval" tip="Proposed by a preparer, approved by someone else. Approval settles the items in the reconciliation; it does not post to either ledger.">
      {pendingAdj.map(({ st, a }) => <div key={a.id} className="rx-adj"><div className="rw-stack"><b>{a.id} · {money(a.amount, st.rel.currency)}</b><small>{label(st)} · {a.txnIds.length} item(s) · proposed by {a.requestedBy} {a.at}</small><small>{a.reason}{a.evidence ? ` · ${a.evidence}` : ''}</small></div>
        <div className="rd-btns"><button className="rw-btn small lime" disabled={!ctx.approver || a.requestedBy === user.name} title={a.requestedBy === user.name ? 'You proposed this adjustment; someone else must approve it' : ''} onClick={() => run(s => decideAdjustment(s, a.id, true, user.name, at(), ctx.approver), `${a.id} approved; items settled`, st.rel.id)}>Approve</button><button className="rw-btn small" disabled={!ctx.approver} onClick={() => run(s => decideAdjustment(s, a.id, false, user.name, at(), ctx.approver), `${a.id} rejected`, st.rel.id)}>Reject</button></div></div>)}
    </Card>}
    <Card>
      <div className="rx-filters">
        <select value={f.rel} onChange={set('rel')} aria-label="Vendor relationship"><option value="">All relationships</option>{Object.values(ws.states).map(st => <option key={st.rel.id} value={st.rel.id}>{label(st)}</option>)}</select>
        <select value={f.entity} onChange={set('entity')} aria-label="Entity"><option value="">All entities</option>{ENTITIES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <select value={f.bu} onChange={set('bu')} aria-label="Business unit"><option value="">All units</option>{uniq(r => r.st.rel.bu).map(x => <option key={x}>{x}</option>)}</select>
        <select value={f.origin} onChange={set('origin')} aria-label="Original period"><option value="">Any original period</option>{uniq(r => r.it.txn.originTag).sort((a, b) => tagKey(a) - tagKey(b)).map(x => <option key={x}>{x}</option>)}</select>
        <select value={f.type} onChange={set('type')} aria-label="Type"><option value="">All types</option>{uniq(r => TYPE_LABEL[r.it.txn.type]).map(x => <option key={x}>{x}</option>)}</select>
        <select value={f.cat} onChange={set('cat')} aria-label="Category"><option value="">All categories</option>{uniq(r => r.it.category).map(x => <option key={x}>{x}</option>)}</select>
        <select value={f.side} onChange={set('side')} aria-label="Side"><option value="">Both sides</option><option value="B">Buyer books</option><option value="V">Vendor books</option></select>
        <select value={f.age} onChange={set('age')} aria-label="Age"><option value="">Any age</option>{AGE.map(([l], i) => <option key={l} value={i}>{l}</option>)}</select>
        <select value={f.owner} onChange={set('owner')} aria-label="Owner"><option value="">Any owner</option>{uniq(r => r.it.ex.owner).map(x => <option key={x}>{x}</option>)}</select>
        <select value={f.status} onChange={set('status')} aria-label="Status"><option value="">Any status</option>{uniq(r => r.it.ex.status).map(x => <option key={x}>{x}</option>)}</select>
        <input value={f.min} onChange={set('min')} placeholder="Min amount" inputMode="decimal" aria-label="Minimum amount" />
        {Object.values(f).some(Boolean) && <button className="rw-link" onClick={() => setF({ rel: '', entity: '', bu: '', origin: '', type: '', cat: '', side: '', min: '', age: '', owner: '', status: '' })}>Clear filters</button>}
      </div>
      <DataTable rows={rows} cols={cols} rowKey={r => r.it.txn.id} fileName="open-items.csv" onRowClick={r => setDetail(r.it.txn.id)} activeKey={detail ?? undefined} selectable selected={sel} onSelect={setSel} initialSort={{ key: 'amt', dir: -1 }}
        toolbar={sel.length > 0 && <span className="rw-bulk">{sel.length} selected
          <select value="" onChange={e => e.target.value && bulk({ owner: e.target.value })} aria-label="Assign owner"><option value="">Assign owner…</option>{OWNERS.map(o => <option key={o}>{o}</option>)}</select>
          <select value="" onChange={e => e.target.value && bulk({ status: e.target.value as ExStatus })} aria-label="Set status"><option value="">Set status…</option>{MANUAL_STATUSES.map(o => <option key={o}>{o}</option>)}</select></span>} empty="No open items match these filters." />
    </Card>
    {cur && <ItemDrawer ctx={ctx} r={cur} onClose={() => setDetail(null)} onWorkbench={() => go('reconcile', cur.st.rel.id)} />}
  </>;
}

function ItemDrawer({ ctx, r, onClose, onWorkbench }: { ctx: Ctx; r: Row; onClose: () => void; onWorkbench: () => void }) {
  const { run, user, at, settings } = ctx; const { st, tag, it } = r; const t = it.txn; const c = st.rel.currency;
  const [note, setNote] = useState(''); const [ev, setEv] = useState(''); const [adj, setAdj] = useState(false); const [reason, setReason] = useState(''); const [jv, setJv] = useState('');
  const upd = (patch: Parameters<typeof updateException>[3], msg: string, n?: string, e?: string) => run(s => updateException(s, tag, t.id, patch, user.name, at(), settings, n, e), msg, st.rel.id);
  const linked = st.txns.filter(x => it.linked.includes(x.id));
  const lockedP = st.periods.find(p => p.tag === tag)!.phase !== 'working';
  return <Drawer wide title={`${t.docNo || t.ref} · ${it.category}`} sub={<>{vendorOf(st).displayName} · {st.rel.bu} · {t.side === 'B' ? 'buyer books' : 'vendor books'} · <span className="rx-tag old">{t.originTag}</span></>} onClose={onClose}>
    <dl className="rw-dl five"><div><dt>Amount</dt><dd>{signedMoney(t.amount, c)}</dd></div><div><dt>Date</dt><dd>{fmtDay(t.date)}</dd></div><div><dt>Type</dt><dd>{TYPE_LABEL[t.type]}</dd></div><div><dt>Age</dt><dd>{it.ageDays} days</dd></div><div><dt>Source</dt><dd>{t.line}</dd></div></dl>
    <h4 className="rw-h4">Period lineage</h4>
    <ol className="rx-lineage">{[t.originTag, ...it.carriedPeriods.filter(p => p !== t.originTag), tag].filter((x, i, a) => a.indexOf(x) === i).map((p, i, a) => <li key={p} className={i === a.length - 1 ? 'cur' : ''}><span className="rx-tag">{p}</span><small>{i === 0 ? 'Originated' : i === a.length - 1 ? 'Open now' : 'Carried forward at close'}</small></li>)}</ol>
    {linked.length > 0 && <><h4 className="rw-h4">Linked on the other side</h4>{linked.map(x => <p key={x.id} className="rx-muted"><b>{x.docNo || x.ref}</b> · {x.side === 'B' ? 'buyer' : 'vendor'} · {signedMoney(x.amount, c)} · difference {signedMoney(t.side === 'B' ? t.amount - x.amount : x.amount - t.amount, c)}</p>)}</>}
    {it.candidateId && <p className="rw-note">A suggested pairing is waiting on the workbench. <button className="rw-link" onClick={onWorkbench}>Review it</button></p>}
    <div className="rd-two">
      <div><h4 className="rw-h4">Action required</h4><p className="rw-advice">{it.ex.action}</p>
        <h4 className="rw-h4">Status</h4><div className="rx-statuses">{MANUAL_STATUSES.map(s => <button key={s} className={it.ex.status === s ? 'on' : ''} onClick={() => upd({ status: s }, `Status set to ${s}`)}>{s}</button>)}</div>
        <p className="rx-muted">Resolved and Closed are set by a match or an approved adjustment, never by hand.</p></div>
      <div><h4 className="rw-h4">Owner</h4><select className="rx-sel full" value={it.ex.owner} onChange={e => upd({ owner: e.target.value }, `Owner set to ${e.target.value}`)} aria-label="Owner">{[...new Set([...OWNERS, ...USERS.map(u => u.name), it.ex.owner])].map(o => <option key={o}>{o}</option>)}</select>
        <h4 className="rw-h4">Priority</h4><div className="rw-seg">{(['High', 'Medium', 'Low'] as const).map(p => <button key={p} className={it.ex.priority === p ? 'on' : ''} onClick={() => upd({ priority: p }, `Priority ${p}`)}>{p}</button>)}</div>
        <h4 className="rw-h4">Evidence</h4><ul className="rx-ev">{it.ex.evidence.map(e => <li key={e.name + e.at}><Icon n="file" s={14} /> {e.name} <small>{e.by} · {e.at}</small></li>)}{!it.ex.evidence.length && <li className="rx-muted">None attached.</li>}</ul>
        <label className="rx-attach"><input type="file" onChange={e => { const f = e.target.files?.[0]; if (f) upd({}, `${f.name} attached`, undefined, f.name); }} /><Icon n="upload" s={14} /> Attach a document</label></div>
    </div>
    <h4 className="rw-h4">Investigation history · travels with the item across periods</h4>
    <ol className="rw-timeline compact">{it.ex.notes.map((n, i) => <li key={i}><Avatar name={n.by} /><div><p><b>{n.by}</b> <span className="rx-tag old">{n.periodTag}</span></p><blockquote>{n.text}</blockquote><small>{n.at}</small></div></li>)}{!it.ex.notes.length && <li className="empty">No notes yet.</li>}</ol>
    <div className="rd-note-box"><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Add an investigation note" aria-label="Note" /><button className="rw-btn small lime" disabled={!note.trim()} onClick={() => { if (upd({}, 'Note added', note, ev || undefined)) { setNote(''); setEv(''); } }}>Add note</button></div>
    <h4 className="rw-h4">Adjustment</h4>
    {!adj ? <button className="rw-btn" disabled={lockedP} onClick={() => setAdj(true)}>Propose an adjustment to settle this item</button> : <div className="rx-adjform">
      <p className="rx-muted">Proposes settling {signedMoney(t.amount, c)} through an accounting adjustment. It needs an approver other than you, and the item stays open until it is approved.</p>
      <label className="rw-field"><span>Reason</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Duplicate posting reversed in the buyer ledger" /></label>
      <label className="rw-field"><span>Journal or evidence reference</span><input value={jv} onChange={e => setJv(e.target.value)} placeholder="e.g. JV-2026-1187" /></label>
      <div className="rd-btns"><button className="rw-btn small lime" disabled={!reason.trim()} onClick={() => { if (run(s => proposeAdjustment(s, tag, [t.id], reason, jv, user.name, at()), 'Adjustment proposed for approval', st.rel.id)) setAdj(false); }}>Propose</button><button className="rw-btn small ghost" onClick={() => setAdj(false)}>Cancel</button></div></div>}
  </Drawer>;
}
