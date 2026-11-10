import React, { useMemo, useState } from 'react';
import { openItems, decideCandidate, manualMatch, reverseMatch, STAGES, r2, updateException, proposeAdjustment, decideAdjustment, currentPeriod, TYPE_LABEL, MANUAL_STATUSES, fmtDay, tagKey, type OpenItem, type MatchRec, type Txn, type RelState, type ExStatus } from './cycle';
import { ENTITIES, tagLabel } from './ledger';
import { PairTable, kindOf, sumOf } from './PairTable';
import { USERS } from './store';
import { Avatar, Card, DataTable, Drawer, Icon, Pill, money, signedMoney, type Col } from './ui';
import { PageHead, vendorOf, entityOf, type Ctx } from './App';

interface Row { st: RelState; tag: string; it: OpenItem }
const OWNERS = ['Priya Nair', 'Arjun Mehta', 'Procurement', 'Treasury', 'Stores'];
const AGE: [string, number, number][] = [['0–30 days', 0, 30], ['31–60', 31, 60], ['61–90', 61, 90], ['Over 90', 91, 99999]];
const exTone = (s: ExStatus) => s === 'Open' ? 'amber' : s.startsWith('Awaiting') ? 'violet' : s === 'Under Investigation' ? 'blue' : s.startsWith('Closed') || s === 'Resolved' ? 'green' : 'grey';

type Tab = 'sugg' | 'partial' | 'open';

export default function OpenItemsScreen({ ctx }: { ctx: Ctx }) {
  const { st, tag, settings, run, user, at, go } = ctx; const cur = st.rel.currency; const p = st.periods.find(x => x.tag === tag)!; const locked = p.phase !== 'working';
  const [tab, setTab] = useState<Tab>('sugg'); const [selB, setSelB] = useState<string[]>([]); const [selV, setSelV] = useState<string[]>([]);
  const [matching, setMatching] = useState(false); const [detail, setDetail] = useState<string | null>(null); const [rev, setRev] = useState<MatchRec | null>(null); const [reason, setReason] = useState('');
  const items = useMemo(() => openItems(st, tag, settings), [st, tag, settings]);
  const byId = useMemo(() => new Map(st.txns.map(t => [t.id, t])), [st]);
  const get = (ids: string[]) => ids.map(i => byId.get(i)!).filter(Boolean);
  const oldest = (x: Txn[]) => x.map(t => t.originTag).sort((a, b) => tagKey(a) - tagKey(b))[0] ?? tag;
  const stageName = (mm: MatchRec) => mm.kind === 'contra' ? 'Contra' : STAGES.find(s => s.id === mm.stage)?.label ?? 'Manual';
  const val = (B: Txn[], V: Txn[], contra: boolean) => contra ? r2([...B, ...V].reduce((s, t) => s + Math.abs(t.amount), 0) / 2) : Math.max(Math.abs(sumOf(B)), Math.abs(sumOf(V)));

  const sugg = st.candidates.filter(c => c.status === 'pending' && c.periodTag === tag).map(c => ({ c, B: get(c.buyerIds), V: get(c.vendorIds) }));
  const pop = new Set(st.txns.filter(t => t.importedIn === tag || p.carriedIn.includes(t.id)).map(t => t.id));
  // Matched but with a difference left over. A group whose difference is zero is fully reconciled and lives on Reconciled transactions. Reversing sends the items back to open.
  const partial = st.matches.filter(mm => !mm.reversed && mm.kind !== 'adjustment' && [...mm.buyerIds, ...mm.vendorIds].some(i => pop.has(i)))
    .map(mm => ({ mm, B: get(mm.buyerIds), V: get(mm.vendorIds) })).filter(x => Math.abs(sumOf(x.B) - sumOf(x.V)) >= 0.005);
  const openB = items.filter(i => i.txn.side === 'B').sort((a, b) => a.txn.date - b.txn.date), openV = items.filter(i => i.txn.side === 'V').sort((a, b) => a.txn.date - b.txn.date);
  const openIds = new Set(items.map(i => i.txn.id)); const sB = selB.filter(i => openIds.has(i)), sV = selV.filter(i => openIds.has(i));
  const pendingAdj = st.adjustments.filter(a => a.status === 'pending');
  const detailRow = items.find(i => i.txn.id === detail);

  const cue = (t: Tab, label: string, n: number, B: number, V: number, value: number, note: string) => <button key={t} type="button" className={'rx-cue' + (tab === t ? ' on' : '')} onClick={() => setTab(t)} aria-pressed={tab === t}>
    <span>{label}</span><b>{n}</b><i>{note} · {money(value, cur, 0)}</i><span className="rx-cue-tip" role="tooltip">{label}: {n}<br />Buyer items {B} · Vendor items {V}<br />Value {money(value, cur, 0)}</span></button>;

  const panel = (side: 'B' | 'V') => {
    const list = side === 'B' ? openB : openV, sel = side === 'B' ? sB : sV, setSel = side === 'B' ? setSelB : setSelV; const all = list.length > 0 && sel.length === list.length;
    return <section className="rx-mx" aria-label={side === 'B' ? 'Open buyer items' : 'Open vendor items'}>
      <header><h3>{side === 'B' ? 'Buyer items' : 'Vendor items'} <em>{list.length}</em></h3><span>{sel.length} selected · {signedMoney(sumOf(get(sel)), cur)}</span></header>
      <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th><input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? [] : list.map(i => i.txn.id))} /></th><th>Open period</th><th>Document no.</th><th>Type</th><th>Date</th><th className="ar">Amount</th><th>Reference</th><th>Age</th><th>Status</th></tr></thead>
        <tbody>{list.map(i => { const t = i.txn; return <tr key={t.id} className={sel.includes(t.id) ? 'sel' : ''}>
          <td><input type="checkbox" aria-label={`Select ${t.docNo || t.ref}`} checked={sel.includes(t.id)} onChange={() => setSel(sel.includes(t.id) ? sel.filter(x => x !== t.id) : [...sel, t.id])} /></td>
          <td><span className={'rx-tag' + (t.originTag !== tag ? ' old' : '')}>{tagLabel(t.originTag)}</span></td>
          <td><button className="rw-link" onClick={() => setDetail(t.id)}>{t.docNo || t.ref}</button></td><td>{TYPE_LABEL[t.type]}</td><td>{fmtDay(t.date)}</td><td className="ar"><b>{signedMoney(t.amount, cur)}</b></td><td>{t.ref || (t.against ? `Against ${t.against}` : '—')}</td><td>{i.ageDays}d</td>
          <td>{i.candidateId ? <Pill tone="violet">Suggested</Pill> : <Pill tone={exTone(i.ex.status)}>{i.ex.status}</Pill>}</td></tr>; })}
          {!list.length && <tr><td colSpan={9} className="rx-muted">No open {side === 'B' ? 'buyer' : 'vendor'} items.</td></tr>}</tbody></table></div>
    </section>;
  };

  return <>
    <PageHead title="Unreconciled transactions" actions={<><button className="rw-btn" onClick={() => go('matched')}>Reconciled transactions</button><button className="rw-btn lime" onClick={() => go('statement')}>Reconciliation statement →</button></>}>
      Everything for {tagLabel(tag)} that is not yet reconciled: matches waiting for you, matches you may want to undo, and items still open on either side.
    </PageHead>
    {locked && <p className="rw-note warn">The statement for this period is {p.phase}. Matching is locked; an approver can reopen it from the Reconciliation Statement tab.</p>}
    <div className="rx-cues">
      {cue('sugg', 'Suggested matches', sugg.length, sugg.reduce((s, x) => s + x.B.length, 0), sugg.reduce((s, x) => s + x.V.length, 0), sugg.reduce((s, x) => s + val(x.B, x.V, x.c.kind === 'contra'), 0), 'to review')}
      {cue('partial', 'Partially reconciled', partial.length, partial.reduce((s, x) => s + x.B.length, 0), partial.reduce((s, x) => s + x.V.length, 0), partial.reduce((s, x) => s + val(x.B, x.V, x.mm.kind === 'contra'), 0), 'with a difference')}
      {cue('open', 'Open items', items.length, openB.length, openV.length, items.reduce((s, i) => s + Math.abs(i.txn.amount), 0), 'unmatched')}
    </div>
    <div className="rw-tabs" role="tablist">{([['sugg', 'Suggested match', sugg.length], ['partial', 'Partially reconciled', partial.length], ['open', 'Open items', items.length]] as const).map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<em>{n}</em></button>)}</div>

    {tab === 'sugg' && <Card title="Suggested matches" tip="Probable pairings the platform will not close on its own. They stay unreconciled until you confirm; confirmed matches move to Reconciled transactions.">
      <PairTable cur={cur} curTag={tag} status={<Pill tone="violet">Suggested</Pill>} empty="No suggested matches waiting for review." rows={sugg.map(({ c, B, V }) => ({ key: c.id, tag: oldest([...B, ...V]), B, V, type: c.kind === 'contra' ? 'Contra (suggested)' : kindOf(B, V) + ' (suggested)', sub: `Score ${c.score} · ${c.reasons.join(' · ')}`,
        actions: <><button className="rw-btn small lime" disabled={locked} onClick={() => run(s0 => decideCandidate(s0, c.id, true, user.name, at()), 'Confirmed. The items moved to Reconciled transactions.')}>Match</button><button className="rw-btn small" disabled={locked} onClick={() => run(s0 => decideCandidate(s0, c.id, false, user.name, at()), 'Rejected; the items stay open.')}>Reject</button></> }))} />
    </Card>}

    {tab === 'partial' && <Card title="Partially reconciled" tip="Matches that still carry a difference. Once the difference is zero a match is fully reconciled and moves to Reconciled transactions. Reverse one to send its items back to Open items.">
      <PairTable cur={cur} curTag={tag} status={<Pill tone="amber">Matched</Pill>} empty="No matches carry a difference. Fully matched items are on Reconciled transactions." rows={partial.map(({ mm, B, V }) => ({ key: mm.id, tag: oldest([...B, ...V]), B, V, type: kindOf(B, V, mm.kind === 'contra'), sub: `${stageName(mm)} · ${mm.confidence}`,
        actions: <button className="rw-btn small" disabled={locked} onClick={() => { setRev(mm); setReason(''); }}>Reverse</button> }))} />
    </Card>}

    {tab === 'open' && <>
      {pendingAdj.length > 0 && <Card title="Adjustments awaiting approval" tip="Proposed by a preparer, approved by someone else. Approval settles the items in the reconciliation; it does not post to either ledger.">
        {pendingAdj.map(a => <div key={a.id} className="rx-adj"><div className="rw-stack"><b>{a.id} · {money(a.amount, cur)}</b><small>{a.txnIds.length} item(s) · proposed by {a.requestedBy} {a.at}</small><small>{a.reason}{a.evidence ? ` · ${a.evidence}` : ''}</small></div>
          <div className="rd-btns"><button className="rw-btn small lime" disabled={!ctx.approver || a.requestedBy === user.name} title={a.requestedBy === user.name ? 'You proposed this adjustment; someone else must approve it' : ''} onClick={() => run(s => decideAdjustment(s, a.id, true, user.name, at(), ctx.approver), `${a.id} approved`)}>Approve</button><button className="rw-btn small" disabled={!ctx.approver || a.requestedBy === user.name} onClick={() => run(s => decideAdjustment(s, a.id, false, user.name, at(), ctx.approver), `${a.id} rejected`)}>Reject</button></div></div>)}
      </Card>}
      <div className="rx-matchbar"><span>Select one or more items on either side, then match them.</span><b>{sB.length} buyer · {sV.length} vendor</b>
        <button className="rw-btn lime" disabled={locked || sB.length + sV.length === 0} onClick={() => setMatching(true)}>Match selected</button>{sB.length + sV.length > 0 && <button className="rw-btn ghost" onClick={() => { setSelB([]); setSelV([]); }}>Clear</button>}</div>
      <div className="rx-mxs">{panel('B')}{panel('V')}</div>
    </>}

    {matching && <MatchDrawer ctx={ctx} B={get(sB)} V={get(sV)} onClose={() => setMatching(false)} onDone={() => { setSelB([]); setSelV([]); setMatching(false); }} />}
    {rev && <Drawer title={`Reverse ${rev.id}`} sub={`${rev.rule} · ${stageName(rev)}`} onClose={() => setRev(null)}>
      <p className="rw-note">The items go back to Open items with their original periods. The reversal is recorded with your name and reason.</p>
      <label className="rw-field"><span>Reason</span><textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why this should not stay matched" /></label>
      <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={() => setRev(null)}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!reason.trim()} onClick={() => { if (run(s => reverseMatch(s, rev.id, tag, reason, user.name, at(), ctx.approver), `${rev.id} reversed; items are open again`)) { setRev(null); setTab('open'); } }}>Reverse match</button></div>
    </Drawer>}
    {detailRow && <ItemDrawer ctx={ctx} r={{ st, tag, it: detailRow }} onClose={() => setDetail(null)} onWorkbench={() => { setDetail(null); setTab('sugg'); }} />}
  </>;
}

function MatchDrawer({ ctx, B, V, onClose, onDone }: { ctx: Ctx; B: Txn[]; V: Txn[]; onClose: () => void; onDone: () => void }) {
  const { st, tag, run, user, at } = ctx; const cur = st.rel.currency; const [remarks, setRemarks] = useState(''); const [files, setFiles] = useState<string[]>([]);
  const same = !B.length || !V.length; const net = same ? sumOf([...B, ...V]) : r2(sumOf(B) - sumOf(V)); const ok = Math.abs(net) < 0.005;
  const list = (title: string, x: Txn[]) => <div className="rx-mm"><h4 className="rw-h4">{title} · {x.length}</h4>{x.length ? <div className="rx-cand-tx">{x.map(t => <div key={t.id}><span className="side">{t.side === 'B' ? 'Buyer' : 'Vendor'}</span><b>{t.docNo || t.ref}</b><small>{TYPE_LABEL[t.type]} · {fmtDay(t.date)} · {tagLabel(t.originTag)}</small><b className="amt">{signedMoney(t.amount, cur)}</b></div>)}</div> : <p className="rx-muted">None selected.</p>}</div>;
  return <Drawer wide title="Match selected items" sub={`${kindOf(B, V)} · ${B.length} buyer, ${V.length} vendor`} onClose={onClose}>
    {list('Buyer entries', B)}{list('Vendor entries', V)}
    <dl className="rw-dl four"><div><dt>Buyer value</dt><dd>{signedMoney(sumOf(B), cur)}</dd></div><div><dt>Vendor value</dt><dd>{signedMoney(sumOf(V), cur)}</dd></div><div><dt>{same ? 'Net of selection' : 'Difference (buyer − vendor)'}</dt><dd className={ok ? 'rw-ok' : 'rw-neg'}>{ok ? '✓ 0.00' : signedMoney(net, cur)}</dd></div></dl>
    {!ok && <p className="rw-note warn">These do not net to zero, so they cannot be closed as a match. Change the selection, or open an item and propose an adjustment for the difference.</p>}
    <label className="rw-field"><span>Remarks</span><textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Why these belong together (e.g. vendor allocated one receipt across three invoices)" /></label>
    <label className="rw-field"><span>Supporting files (optional)</span><input type="file" multiple onChange={e => setFiles([...(e.target.files ?? [])].map(f => f.name))} /></label>
    {files.length > 0 && <p className="rx-muted">Attached: {files.join(', ')}</p>}
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!ok || !remarks.trim() || !(B.length + V.length)} onClick={() => { if (run(s => manualMatch(s, tag, [...B, ...V].map(t => t.id), remarks.trim() + (files.length ? ` [Attachments: ${files.join(', ')}]` : ''), user.name, at()), 'Match recorded. The items moved to Reconciled transactions.')) onDone(); }}>Record match</button></div>
  </Drawer>;
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
    {it.candidateId && <p className="rw-note">A suggested pairing for this item is listed under Suggested matches at the top of this screen.</p>}
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
