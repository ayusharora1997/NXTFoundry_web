import React, { useEffect, useMemo, useRef, useState } from 'react';
import { status, gate, statement, openItems, noteMappings, currentPeriod, type RelState, type Result, type Settings, type WfStatus } from './cycle';
import { initWorkspace, USERS, canApprove, now, type Workspace, type User } from './store';
import { VENDORS, ENTITIES, tagLabel } from './ledger';
import { Icon, Drawer, Picker, Toasts, Avatar, type Toast } from './ui';
import Dashboard from './Dashboard';
import Reconcile from './Reconcile';
import CreditMapping from './CreditMapping';
import OpenItemsScreen from './OpenItems';
import Balance from './Balance';
import History from './History';
import SettingsScreen from './Settings';
import './app.css';

export type Screen = 'dashboard' | 'reconcile' | 'credit' | 'open' | 'balance' | 'history' | 'settings';
const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'summary' }, { id: 'reconcile', label: 'Reconciliation', icon: 'check' }, { id: 'credit', label: 'Credit mapping', icon: 'file' },
  { id: 'open', label: 'Open items', icon: 'open' }, { id: 'balance', label: 'Balance reconciliation', icon: 'sign' }, { id: 'history', label: 'History', icon: 'chat' }, { id: 'settings', label: 'Settings', icon: 'rules' },
];
export interface Ctx {
  ws: Workspace; user: User; approver: boolean; settings: Settings; setSettings: (s: Settings) => void; setUserId: (id: string) => void;
  relId: string; tag: string; st: RelState; select: (relId: string, tag?: string) => void; go: (s: Screen, relId?: string, tag?: string) => void;
  run: (fn: (st: RelState) => Result<RelState>, okMsg: string, relId?: string) => boolean; toast: (msg: string, tone?: Toast['tone']) => void; at: () => string;
  stat: (st: RelState, tag: string) => WfStatus; label: (st: RelState) => string;
}
export const vendorOf = (st: RelState) => VENDORS.find(v => v.id === st.rel.vendorId)!;
export const entityOf = (st: RelState) => ENTITIES.find(e => e.id === st.rel.entityId)!;
export const STATUS_TONE: Record<WfStatus, string> = { 'Awaiting ledgers': 'grey', 'Opening check': 'red', 'Matching': 'blue', 'In review': 'amber', 'Statement prepared': 'violet', 'With vendor': 'violet', 'Vendor accepted': 'green', 'Vendor disputed': 'red', 'Signed off': 'green', 'Closed': 'grey' };

function readRoute(ws: Workspace): { screen: Screen; relId: string; tag: string } {
  const [, s, r, t] = window.location.hash.split('/');
  const relId = r && ws.states[r] ? r : 'R3'; const st = ws.states[relId];
  return { screen: NAV.some(n => n.id === s) ? s as Screen : 'dashboard', relId, tag: t && st.periods.some(p => p.tag === t) ? t : currentPeriod(st).tag };
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
  const ctx: Ctx = {
    ws, user, approver: canApprove(user), settings: ws.settings, setSettings: s => setWs(w => ({ ...w, settings: s })), setUserId: id => setWs(w => ({ ...w, userId: id })),
    relId: route.relId, tag: route.tag, st, select: (r, t) => go(route.screen, r, t), go, toast, at: now, label,
    stat: (x, t) => status(x, t, ws.settings),
    run: (fn, okMsg, relId = route.relId) => { const r = fn(wsRef.current.states[relId]); if (!r.ok) { toast(r.error, 'warn'); return false; } const next = r.state; setWs(w => ({ ...w, states: { ...w.states, [relId]: next } })); if (okMsg) toast(okMsg); return true; },
  };
  const curStat = status(st, route.tag, ws.settings);
  const badge = useMemo(() => {
    const open = openItems(st, route.tag, ws.settings); const s = statement(st, route.tag, ws.settings);
    return { reconcile: curStat, credit: noteMappings(st, route.tag).filter(n => n.status !== 'Mapped').length, open: Object.values(ws.states).reduce((n, x) => n + openItems(x, currentPeriod(x).tag, ws.settings).length, 0), balance: s.balanced ? 'ok' : 'bad', openHere: open.length };
  }, [ws, route.relId, route.tag]);
  const period = st.periods.find(p => p.tag === route.tag)!;
  const dot = (x: RelState) => STATUS_TONE[status(x, currentPeriod(x).tag, ws.settings)];

  return <section className="rw rx" id="reconciliation-lab">
    <div className="rx-top">
      <div className="rx-bar">
        <div className="rd-brand"><span className="rw-mark">NXT</span><div><b>Vendor Payable Reconciliation</b><small>Meridian Consumer Products · buyer workspace</small></div></div>
        {route.screen !== 'dashboard' && route.screen !== 'settings' && <>
          <Picker value={route.relId} onChange={v => v !== 'ALL' && ctx.select(v)} allLabel="Choose a relationship" options={Object.values(ws.states).map(x => ({ id: x.rel.id, label: label(x), meta: `${x.rel.entityId} · ${status(x, currentPeriod(x).tag, ws.settings)}`, dot: dot(x) }))} />
          <label className="rx-period"><i>Period</i><select value={route.tag} onChange={e => ctx.select(route.relId, e.target.value)} aria-label="Reconciliation period">{[...st.periods].reverse().map(p => <option key={p.tag} value={p.tag}>{p.tag} · {p.label}{p.phase === 'closed' ? ' · closed' : ' · current'}</option>)}</select></label>
        </>}
        <div className="rd-actions">
          <button className="rd-act" onClick={() => setAudit(true)}><Icon n="chat" /> Audit log</button>
          <label className="rx-user"><Avatar name={user.name} /><select value={user.id} onChange={e => ctx.setUserId(e.target.value)} aria-label="Signed in as">{USERS.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}</select></label>
        </div>
      </div>
      <nav className="rx-nav" aria-label="Sections">{NAV.map(n => <a key={n.id} href={`#reconciliation-lab/${n.id}/${route.relId}/${route.tag}`} className={route.screen === n.id ? 'on' : ''} aria-current={route.screen === n.id ? 'page' : undefined}><Icon n={n.icon} />{n.label}
        {n.id === 'credit' && badge.credit > 0 && <em className="warn">{badge.credit}</em>}{n.id === 'open' && <em>{badge.open}</em>}{n.id === 'balance' && <em className={badge.balance === 'ok' ? 'ok' : 'warn'}>{badge.balance === 'ok' ? '✓' : '!'}</em>}</a>)}</nav>
    </div>
    <p className="rw-banner">Illustrative NXT Foundry demo · synthetic data, in-memory only. The buyer, vendors, people and every figure are fictional; the user switcher stands in for sign-in and permissions.</p>
    {route.screen !== 'dashboard' && route.screen !== 'settings' && route.screen !== 'open' && <div className="rx-context">
      <div><b>{vendorOf(st).legalName}</b><span>{st.rel.vendorCode} · {entityOf(st).name} · {st.rel.bu} · {st.rel.currency} · {st.rel.frequency}</span></div>
      <div className="rx-context-r"><span className={'rw-pill ' + STATUS_TONE[curStat]}>{curStat}</span><span className="rx-tag">{route.tag}</span><span>{tagLabel(route.tag)}{period.version > 1 ? ` · v${period.version}` : ''}</span></div>
    </div>}
    <div className="rw-main">
      {route.screen === 'dashboard' && <Dashboard ctx={ctx} />}
      {route.screen === 'reconcile' && <Reconcile ctx={ctx} />}
      {route.screen === 'credit' && <CreditMapping ctx={ctx} />}
      {route.screen === 'open' && <OpenItemsScreen ctx={ctx} />}
      {route.screen === 'balance' && <Balance ctx={ctx} />}
      {route.screen === 'history' && <History ctx={ctx} />}
      {route.screen === 'settings' && <SettingsScreen ctx={ctx} />}
    </div>
    {audit && <Drawer wide title="Audit log" sub={`${label(st)} · who did what, when, and why. Read-only.`} onClose={() => setAudit(false)}>
      <ol className="rw-timeline">{[...st.audit].reverse().map(a => <li key={a.id}><Avatar name={a.by} /><div><p><b>{a.by}</b> · {a.action} <span className="rx-tag">{a.periodTag}</span></p><p className="rx-muted">{a.detail}</p>
        {(a.before || a.after) && <p className="rx-muted">{a.before && <>Before: <code>{a.before}</code> </>}{a.after && <>After: <code>{a.after}</code></>}</p>}{a.reason && <blockquote>{a.reason}</blockquote>}<small>{a.at}</small></div></li>)}</ol>
    </Drawer>}
    <Toasts items={toasts} dismiss={id => setToasts(t => t.filter(x => x.id !== id))} />
  </section>;
}

export function PageHead({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return <header className="rd-head"><div><h1>{title}</h1>{children && <p>{children}</p>}</div>{actions && <div className="rd-head-actions">{actions}</div>}</header>;
}
export const gateOf = (ctx: Ctx) => gate(ctx.st, ctx.tag);
