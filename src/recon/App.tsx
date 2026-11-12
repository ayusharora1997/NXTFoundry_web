import React, { useEffect, useMemo, useRef, useState } from 'react';
import { confirmBalance, setAgreedCn, manualMatch, reverseMatch, decideCandidate, status, gate, heldTxnIds, statement, openItems, currentPeriod, type RelState, type Result, type Settings, type WfStatus } from './cycle';
import { initWorkspace, USERS, canApprove, now, bcOf, nextDef, type Workspace, type User, type VendorRequest, type BcRec } from './store';
import { VENDORS, ENTITIES, tagLabel } from './ledger';
import { Icon, Drawer, Picker, PeriodPicker, Toasts, Avatar, type Toast } from './ui';
import Reconcile from './Reconcile';
import Dashboard from './Dashboard';
import LedgerUpload from './LedgerUpload';
import OpenItemsScreen from './OpenItems';
import Balance from './Balance';
import SettingsScreen from './Settings';
import BalanceConfirm from './BalanceConfirm';
import CreditMapping from './CreditMapping';
import { allocate, creditItems, docKind, type CnSub, type CnDoc, type BulkReq } from './credit';
import { Tour, useTour } from './tour';
import { toursFor } from './tours';
import './app.css';

// Four screens; each sub-tab is a route of its own.
export type Screen = 'credit' | 'dash' | 'upload' | 'matched' | 'open' | 'statement' | 'confirm' | 'admin';
const NAV: { id: string; label: string; icon: string; subs: [Screen, string][] }[] = [
  { id: 'credit', label: 'Credit Mapping', icon: 'file', subs: [['credit', '']] },
  { id: 'recon', label: 'Reconciliation', icon: 'check', subs: [['dash', 'Dashboard'], ['upload', 'Vendor Ledger Upload'], ['matched', 'Reconciled Transactions'], ['open', 'Unreconciled Transactions'], ['statement', 'Reconciliation Statement']] },
  { id: 'confirm', label: 'Balance Confirmation', icon: 'sign', subs: [['confirm', '']] },
  { id: 'admin', label: 'Admin Settings', icon: 'rules', subs: [['admin', '']] },
];
const ALL_SCREENS = NAV.flatMap(n => n.subs.map(s => s[0]));
const navOf = (s: Screen) => NAV.find(n => n.subs.some(x => x[0] === s))!;
export interface Ctx {
  ws: Workspace; user: User; approver: boolean; settings: Settings; setSettings: (s: Settings) => void; setUserId: (id: string) => void;
  relId: string; tag: string; st: RelState; select: (relId: string, tag?: string) => void; go: (s: Screen, relId?: string, tag?: string) => void;
  run: (fn: (st: RelState) => Result<RelState>, okMsg: string, relId?: string) => boolean; toast: (msg: string, tone?: Toast['tone']) => void; at: () => string;
  stat: (st: RelState, tag: string) => WfStatus; label: (st: RelState) => string;
  isVendor: boolean; visible: RelState[]; requests: VendorRequest[];
  submit: (r: Pick<VendorRequest, 'relId' | 'tag' | 'kind' | 'ids' | 'refId' | 'force' | 'reason' | 'summary'>) => void; decide: (id: string, approve: boolean) => void;
  updateBc: (id: string, patch: Partial<BcRec>, what: string) => void; confirmBc: (id: string, remarks: string) => boolean;
  submitCn: (buyerIds: string[], cn: CnDoc, via?: CnSub['via'], bulkId?: string) => string; decideCn: (id: string, action: 'accept' | 'reject' | 'reopen', reason?: string) => boolean; addBulk: (b: BulkReq) => void;
}
export const vendorOf = (st: RelState) => VENDORS.find(v => v.id === st.rel.vendorId)!;
export const entityOf = (st: RelState) => ENTITIES.find(e => e.id === st.rel.entityId)!;
export const STATUS_TONE: Record<WfStatus, string> = { 'Awaiting ledgers': 'grey', 'Opening check': 'red', 'Matching': 'blue', 'In review': 'amber', 'Statement prepared': 'violet', 'With vendor': 'violet', 'Vendor accepted': 'green', 'Vendor disputed': 'red', 'Signed off': 'green', 'Closed': 'grey' };

function readRoute(ws: Workspace): { screen: Screen; relId: string; tag: string } {
  const [, s, r, t] = window.location.hash.split('/');
  const u = USERS.find(x => x.id === ws.userId)!; const ok = (id: string) => !!ws.states[id] && (!u.vendorId || ws.states[id].rel.vendorId === u.vendorId);
  const relId = r && ok(r) ? r : ok('R3') ? 'R3' : Object.values(ws.states).find(x => ok(x.rel.id))!.rel.id; const st = ws.states[relId];
  return { screen: ALL_SCREENS.includes(s as Screen) ? s as Screen : 'dash', relId, tag: t && st.periods.some(p => p.tag === t) ? t : currentPeriod(st).tag };
}

export default function ReconApp() {
  const [ws, setWsState] = useState<Workspace>(initWorkspace);
  // Actions apply to the latest workspace, so several in a row (bulk updates) build on each other.
  const wsRef = useRef(ws); wsRef.current = ws;
  const setWs = (f: (w: Workspace) => Workspace) => { wsRef.current = f(wsRef.current); setWsState(wsRef.current); };
  const [route, setRoute] = useState(() => readRoute(ws));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [audit, setAudit] = useState(false);
  useEffect(() => { const f = () => setRoute(readRoute(ws)); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, [ws]);
  const st = ws.states[route.relId]; const user = USERS.find(u => u.id === ws.userId)!;
  const toast = (msg: string, tone: Toast['tone'] = 'ok') => { const id = Date.now() + Math.random(); setToasts(t => [...t.slice(-2), { id, msg, tone }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'warn' ? 9000 : 6000); };
  const go = (s: Screen, relId = route.relId, tag?: string) => { const t = tag ?? (relId === route.relId ? route.tag : currentPeriod(ws.states[relId]).tag); window.location.hash = `reconciliation-lab/${s}/${relId}/${t}`; };
  const label = (x: RelState) => `${vendorOf(x).displayName} · ${x.rel.bu} · ${x.rel.currency}`;
  const visible = Object.values(ws.states).filter(x => !user.vendorId || x.rel.vendorId === user.vendorId);
  const ctx: Ctx = {
    ws, user, approver: canApprove(user), settings: ws.settings, setSettings: s => setWs(w => ({ ...w, settings: s })), setUserId: id => { setWs(w => ({ ...w, userId: id })); const u = USERS.find(x => x.id === id)!; if (u.vendorId) { const f = Object.values(wsRef.current.states).find(x => x.rel.vendorId === u.vendorId)!; window.location.hash = `reconciliation-lab/dash/${f.rel.id}/${currentPeriod(f).tag}`; } },
    relId: route.relId, tag: route.tag, st, select: (r, t) => go(route.screen, r, t), go, toast, at: now, label,
    stat: (x, t) => status(x, t, ws.settings), isVendor: !!user.vendorId, visible, requests: ws.requests,
    submit: r => { setWs(w => ({ ...w, requests: [...w.requests, { ...r, id: `REQ-${String(w.requests.length + 1).padStart(3, '0')}`, status: 'pending', by: user.name, at: now() }] })); toast('Sent to the buyer for review. Nothing changes until they approve it.'); },
    decide: (id, approve) => { const q = wsRef.current.requests.find(x => x.id === id); if (!q) return; const s0 = wsRef.current.states[q.relId]; const note = `${q.reason ? q.reason + ' · ' : ''}requested by ${q.by}, reviewed by ${user.name}`;
      if (approve) { const res = q.kind === 'match' ? manualMatch(s0, q.tag, q.ids, note, user.name, now(), q.force) : q.kind === 'reverse' ? reverseMatch(s0, q.refId, q.tag, note, user.name, now(), canApprove(user)) : decideCandidate(s0, q.refId, q.kind === 'confirm', user.name, now()); if (!res.ok) { toast(res.error, 'warn'); return; } const next = res.state; setWs(w => ({ ...w, states: { ...w.states, [q.relId]: next } })); }
      setWs(w => ({ ...w, requests: w.requests.map(x => x.id === id ? { ...x, status: approve ? 'approved' : 'rejected', decidedBy: user.name, decidedAt: now() } : x) })); toast(approve ? `${q.id} approved and applied` : `${q.id} rejected`); },
    updateBc: (id, patch, what) => setWs(w => ({ ...w, bcs: w.bcs.map(b => b.id === id ? { ...b, ...patch, log: [...b.log, { at: now(), by: user.name, what }] } : b) })),
    confirmBc: (id, remarks) => { const b = wsRef.current.bcs.find(x => x.id === id); if (!b) return false; const s0 = wsRef.current.states[b.relId]; const at = now(); const certNo = `BCC-${b.tag}-${b.relId}`; const nx = nextDef(s0.rel, b.tag);
      const r = confirmBalance(s0, b.tag, b.balance, nx, certNo, user.name, user.name, at); if (!r.ok) { toast(r.error, 'warn'); return false; } const next = r.state;
      // The next period's confirmation is queued (not sent) once our ledger for it is available.
      const nf = nx && wsRef.current.files.find(f => f.relId === b.relId && f.periodTag === nx.tag && f.side === 'B' && f.kind === 'period');
      const nb: BcRec | null = nx && nf && !wsRef.current.bcs.some(x => x.relId === b.relId && x.tag === nx.tag) ? { id: `BC-${nx.tag}-${b.relId}`, relId: b.relId, tag: nx.tag, balance: nf.closing ?? 0, reminders: [], status: 'Not sent', log: [{ at, by: 'System', what: `Queued after ${tagLabel(b.tag)} was confirmed` }] } : null;
      setWs(w => ({ ...w, states: { ...w.states, [b.relId]: next }, bcs: [...w.bcs.map(x => x.id === id ? { ...x, status: 'Confirmed' as const, respondedBy: user.name, respondedAt: at, remarks, certNo, log: [...x.log, { at, by: user.name, what: `Agreed. Certificate ${certNo} issued; ${tagLabel(b.tag)} closed without reconciliation` }] } : x), ...(nb ? [nb] : [])] }));
      return true; },
    submitCn: (buyerIds, cn, via = 'Form', bulkId) => { const id = `CNS-${String(wsRef.current.cns.length + 1).padStart(4, '0')}`; const at = now();
      setWs(w => ({ ...w, cns: [...w.cns, { id, relId: route.relId, tag: route.tag, buyerIds, cn, status: 'Submitted', via, bulkId, by: user.name, at, log: [{ at, by: user.name, what: via === 'Buyer entry' ? `Entered ${cn.no} on the vendor’s behalf` : `Submitted ${cn.no}${bulkId ? ` through bulk upload ${bulkId}` : ''}` }] }] })); return id; },
    addBulk: b => setWs(w => ({ ...w, bulks: [...w.bulks, b] })),
    decideCn: (id, action, reason = '') => { const q = wsRef.current.cns.find(x => x.id === id); if (!q) return false; const at = now(); const s0 = wsRef.current.states[q.relId];
      if ((action === 'reject' || action === 'reopen') && !reason.trim()) { toast('Give a reason.', 'warn'); return false; }
      let next = s0; let alloc = q.alloc; let status: CnSub['status'];
      if (action === 'accept') {
        if (q.status !== 'Submitted') return false; const items = creditItems(s0, s0.periods[s0.periods.length - 1].tag, wsRef.current.cns);
        alloc = allocate(q, bid => items.find(i => i.t.id === bid)?.diff ?? 0); if (!alloc.some(a => Math.abs(a.amount) > 0.004)) { toast('Nothing to map on these notes.', 'warn'); return false; }
        const r = setAgreedCn(s0, q.tag, alloc.filter(a => Math.abs(a.amount) > 0.004), q.cn.no, q.id, true, user.name, at, '', docKind(q.cn.docType)); if (!r.ok) { toast(r.error, 'warn'); return false; } next = r.state; status = 'Accepted';
      } else if (action === 'reject') { if (q.status !== 'Submitted') return false; status = 'Rejected'; }
      else if (q.status === 'Accepted') { const r = setAgreedCn(s0, q.tag, q.alloc ?? [], q.cn.no, q.id, false, user.name, at, reason, docKind(q.cn.docType)); if (!r.ok) { toast(r.error, 'warn'); return false; } next = r.state; status = 'Reopened'; }
      else if (q.status === 'Rejected') status = 'Submitted'; else return false;
      const what = action === 'accept' ? `Accepted ${q.cn.no}` : action === 'reject' ? `Rejected: ${reason}` : q.status === 'Accepted' ? `Reopened: ${reason}. Agreement withdrawn` : `Reopened for review: ${reason}`;
      setWs(w => ({ ...w, states: { ...w.states, [q.relId]: next }, cns: w.cns.map(x => x.id === id ? { ...x, status, alloc, reason: action === 'accept' ? x.reason : reason, decidedBy: user.name, decidedAt: at, log: [...x.log, { at, by: user.name, what }] } : x) }));
      toast(action === 'accept' ? `${q.cn.no} accepted` : action === 'reject' ? `${q.cn.no} rejected; the vendor can correct and resubmit` : `${q.cn.no} reopened`); return true; },
    run: (fn, okMsg, relId = route.relId) => { const r = fn(wsRef.current.states[relId]); if (!r.ok) { toast(r.error, 'warn'); return false; } const next = r.state; setWs(w => ({ ...w, states: { ...w.states, [relId]: next } })); if (okMsg) toast(okMsg); return true; },
  };
  const curStat = status(st, route.tag, ws.settings);
  const badge = useMemo(() => {
    const open = openItems(st, route.tag, ws.settings); const s = statement(st, route.tag, ws.settings);
    const held = heldTxnIds(st); return { open: open.filter(i => !held.has(i.txn.id)).length, balance: s.balanced ? 'ok' : 'bad' };
  }, [ws, route.relId, route.tag]);
  const period = st.periods.find(p => p.tag === route.tag)!; const bc = bcOf(ws, route.relId, route.tag);
  // One guided tour per Reconciliation screen, worded for buyer or vendor. Help in the sub-tab bar replays it.
  const isRecon = navOf(route.screen).id === 'recon';
  const [tourOn, startTour, endTour, skipTour] = useTour(`${route.screen}-${user.vendorId ? 'vendor' : 'buyer'}`, isRecon);
  const dot = (x: RelState) => STATUS_TONE[status(x, currentPeriod(x).tag, ws.settings)];

  return <section className="rw rx" id="reconciliation-lab">
    <div className="rx-top">
      <div className="rx-bar">
        <a className="rd-brand" href="#products" title="NXT Foundry products"><span className="rw-mark">NXT</span><div><b>Vendor Payable Reconciliation</b><small>Meridian Consumer Products · buyer workspace</small></div></a>
        {((navOf(route.screen).id === 'recon' && route.screen !== 'dash') || route.screen === 'credit') && <>
          <Picker value={route.relId} onChange={v => v !== 'ALL' && ctx.select(v)} allLabel="Choose a relationship" options={visible.map(x => ({ id: x.rel.id, label: label(x), meta: `${x.rel.entityId} · ${status(x, currentPeriod(x).tag, ws.settings)}`, dot: dot(x) }))} />
          <PeriodPicker tags={st.periods.map(p => p.tag)} value={route.tag} quarterly={st.rel.frequency === 'Quarterly'} onPick={t => ctx.select(route.relId, t)} />
        </>}
        <div className="rd-actions">
          <button className="rd-act" onClick={() => setAudit(true)}><Icon n="chat" /> Audit log</button>
          <label className="rx-user"><Avatar name={user.name} /><select value={user.id} onChange={e => ctx.setUserId(e.target.value)} aria-label="Signed in as">{USERS.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role === 'Vendor' ? `Vendor, ${VENDORS.find(v => v.id === u.vendorId)?.displayName}` : u.role}</option>)}</select></label>
        </div>
      </div>
      <nav className="rx-nav" aria-label="Screens">{NAV.map(n => { const on = navOf(route.screen).id === n.id; return <a key={n.id} href={`#reconciliation-lab/${n.subs[0][0]}/${route.relId}/${route.tag}`} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}><Icon n={n.icon} />{n.label}</a>; })}</nav>
      {navOf(route.screen).subs.length > 1 && <nav className="rx-subnav" aria-label="Sub-tabs">{navOf(route.screen).subs.map(([id, l]) => <a key={id} href={`#reconciliation-lab/${id}/${route.relId}/${route.tag}`} className={route.screen === id ? 'on' : ''} aria-current={route.screen === id ? 'page' : undefined}>{l}
        {id === 'open' && <em>{badge.open}</em>}{id === 'statement' && <em className={badge.balance === 'ok' ? 'ok' : 'warn'}>{badge.balance === 'ok' ? '✓' : '!'}</em>}</a>)}
        {isRecon && <button type="button" className="rx-help" onClick={startTour} title="Replay the tutorial for this screen" aria-label="Help: replay the tutorial for this screen"><Icon n="info" /><span>Help</span></button>}</nav>}
    </div>
    <p className="rw-banner">Illustrative NXT Foundry demo · synthetic data, in-memory only. The buyer, vendors, people and every figure are fictional; the user switcher stands in for sign-in and permissions.</p>
    {user.vendorId && <p className="rx-vbar"><b>Vendor view · {vendorOf(st).displayName}.</b> You can see every screen for your own account. Statement responses are yours to give; matches, reversals and suggestions you make are sent to the buyer for review and only apply once approved.</p>}
    {((navOf(route.screen).id === 'recon' && route.screen !== 'dash') || route.screen === 'credit') && <div className="rx-context">
      <div><b>{vendorOf(st).legalName}</b><span>{st.rel.vendorCode} · {entityOf(st).name} · {st.rel.bu} · {st.rel.currency} · {st.rel.frequency}</span></div>
      <div className="rx-context-r">{bc?.status === 'Confirmed' && <a className="rw-pill green" href={`#reconciliation-lab/confirm/${route.relId}/${route.tag}`} title={`Certificate ${bc.certNo}: vendor confirmed the balance on ${bc.respondedAt}`}>Balance confirmed · recon not required</a>}<span className={'rw-pill ' + STATUS_TONE[curStat]}>{curStat}</span><b>{tagLabel(route.tag)}</b>{period.version > 1 && <span>v{period.version}</span>}</div>
    </div>}
    <div className="rw-main">
      {route.screen === 'credit' && <CreditMapping key={route.relId} ctx={ctx} />}
      {route.screen === 'dash' && <Dashboard ctx={ctx} />}
      {route.screen === 'upload' && <LedgerUpload ctx={ctx} />}
      {route.screen === 'matched' && <Reconcile ctx={ctx} />}
      {route.screen === 'open' && <OpenItemsScreen ctx={ctx} />}
      {route.screen === 'statement' && <Balance ctx={ctx} />}
      {route.screen === 'confirm' && <BalanceConfirm ctx={ctx} />}
      {route.screen === 'admin' && <SettingsScreen ctx={ctx} />}
    </div>
    {audit && <Drawer wide title="Audit log" sub={`${label(st)} · who did what, when, and why. Read-only.`} onClose={() => setAudit(false)}>
      <ol className="rw-timeline">{[...st.audit].reverse().map(a => <li key={a.id}><Avatar name={a.by} /><div><p><b>{a.by}</b> · {a.action} <span className="rx-tag">{a.periodTag}</span></p><p className="rx-muted">{a.detail}</p>
        {(a.before || a.after) && <p className="rx-muted">{a.before && <>Before: <code>{a.before}</code> </>}{a.after && <>After: <code>{a.after}</code></>}</p>}{a.reason && <blockquote>{a.reason}</blockquote>}<small>{a.at}</small></div></li>)}</ol>
    </Drawer>}
    {tourOn && isRecon && <Tour key={route.screen} steps={toursFor(route.screen, !!user.vendorId)} onClose={endTour} onSkip={() => { skipTour(); toast('Tutorial skipped. Tutorials won’t open by themselves again; click Help anytime.'); }} />}
    <Toasts items={toasts} dismiss={id => setToasts(t => t.filter(x => x.id !== id))} />
  </section>;
}

function Planned({ title, what }: { title: string; what: string }) {
  return <><PageHead title={title}>{what}</PageHead><div className="rx-planned"><span className="rw-mark">NXT</span><b>To be designed together</b><p>This screen is next in line. We will agree its layout and rules before it is built.</p></div></>;
}

export function PageHead({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return <header className="rd-head"><div><h1>{title}</h1>{children && <p>{children}</p>}</div>{actions && <div className="rd-head-actions">{actions}</div>}</header>;
}
export const gateOf = (ctx: Ctx) => gate(ctx.st, ctx.tag);
