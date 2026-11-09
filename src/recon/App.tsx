import React, { useEffect, useMemo, useState } from 'react';
import { reconcile, DEFAULT_SETTINGS, EMPTY_DECISIONS, type Settings, type Decisions, type Result, type ExceptionEdit, type BridgeItem } from './engine';
import { initialWorkspace, activeData, annexByVendor, vendorStatus, act, actTime, PERIOD, ENTITY, type Workspace, type Annex, type AnnexId, type Act } from './model';
import { Icon, Drawer, Picker, Toasts, Meter, Avatar, short, type Toast } from './ui';
import UploadScreen from './Upload';
import SummaryScreen from './Summary';
import VendorScreen from './Vendor';
import ReconciledScreen from './Reconciled';
import UnreconciledScreen from './Unreconciled';
import './app.css';

export type Screen = 'upload' | 'reconciled' | 'unreconciled' | 'summary' | 'vendor';
const STAGES: { id: Exclude<Screen, 'vendor'>; n: string; label: string; verb: string }[] = [
  { id: 'upload', n: '01', label: 'Collect', verb: 'Vendor ledgers' },
  { id: 'reconciled', n: '02', label: 'Match', verb: 'Reconciled transactions' },
  { id: 'unreconciled', n: '03', label: 'Resolve', verb: 'Unreconciled transactions' },
  { id: 'summary', n: '04', label: 'Sign off', verb: 'Reconciliation summary' },
];
export interface Ctx {
  ws: Workspace; setWs: React.Dispatch<React.SetStateAction<Workspace>>; r: Result;
  annex: Map<string, { annex: Annex; lines: Record<AnnexId, BridgeItem[]> }>;
  vendor: string; setVendor: (v: string) => void; vName: (id: string) => string;
  decisions: Decisions; setDecisions: React.Dispatch<React.SetStateAction<Decisions>>;
  edit: (key: string, e: ExceptionEdit) => void;
  log: (a: Omit<Act, 'id' | 'at' | 'who'>) => void;
  toast: (msg: string, tone?: Toast['tone']) => void;
  /** Run a change and offer Undo, restoring the workspace and decisions as they were. */
  undoable: (msg: string, change: () => void) => void;
  go: (s: Screen, vendorId?: string) => void; openException: (key: string) => void; openUpload: (vendorId: string) => void; openRules: () => void;
  focus: { exception?: string; upload?: string }; clearFocus: () => void;
}

function readRoute(): { screen: Screen; vendorId: string } {
  const [, s, id] = window.location.hash.split('/');
  if (s === 'vendor' && id) return { screen: 'vendor', vendorId: id };
  return { screen: STAGES.some(x => x.id === s) ? s as Screen : 'summary', vendorId: '' };
}

export default function ReconWorkspace() {
  const [ws, setWs] = useState<Workspace>(initialWorkspace);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [decisions, setDecisions] = useState<Decisions>(EMPTY_DECISIONS);
  const [vendor, setVendor] = useState('ALL');
  const [route, setRoute] = useState(readRoute);
  const [panel, setPanel] = useState<'' | 'rules' | 'activity' | 'keys'>('');
  const [focus, setFocus] = useState<Ctx['focus']>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => { const f = () => setRoute(readRoute()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const r = useMemo(() => reconcile(activeData(ws), settings, decisions), [ws, settings, decisions]);
  const annex = useMemo(() => annexByVendor(r), [r]);
  const go = (s: Screen, id = '') => { window.location.hash = s === 'vendor' ? `reconciliation-lab/vendor/${id}` : `reconciliation-lab/${s}`; };
  const vName = (id: string) => ws.data.suppliers.find(s => s.id === id)?.name ?? id;
  const toast = (msg: string, tone: Toast['tone'] = 'ok', undo?: () => void) => { const id = Date.now() + Math.random(); setToasts(t => [...t.slice(-2), { id, msg, tone, undo }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 7000); };
  const log: Ctx['log'] = a => setWs(w => ({ ...w, activity: [act(a), ...w.activity] }));
  const ctx: Ctx = {
    ws, setWs, r, annex, vendor, setVendor, vName, decisions, setDecisions, log,
    edit: (key, e) => {
      const ex = r.exceptions.find(x => x.key === key);
      setDecisions(d => ({ ...d, edits: { ...d.edits, [key]: { ...d.edits[key], ...e } } }));
      if (ex && (e.status || e.owner || e.resolution !== undefined)) log({ kind: 'exception', vendorId: ex.vendorId, exceptionKey: key, what: `${ex.id}: ${[e.owner && `owner set to ${e.owner}`, e.resolution ? `resolved as “${e.resolution}”` : e.status && `status set to ${e.status}`].filter(Boolean).join(', ')}` });
    },
    toast: (m, tone) => toast(m, tone),
    undoable: (msg, change) => { const snap = { ws, decisions }; change(); toast(msg, 'ok', () => { setWs(snap.ws); setDecisions(snap.decisions); }); },
    go, openException: key => { setFocus({ exception: key }); go('unreconciled'); }, openUpload: v => { setFocus({ upload: v }); go('upload'); }, openRules: () => setPanel('rules'),
    focus, clearFocus: () => setFocus({}),
  };

  // Keyboard: 1–4 switch stage, / focuses the table search, ? lists shortcuts.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
      if (document.querySelector('.rw-drawer')) return;
      const i = ['1', '2', '3', '4'].indexOf(e.key); if (i >= 0) { go(STAGES[i].id); return; }
      if (e.key === '/') { const s = document.querySelector<HTMLInputElement>('[data-rw-search]'); if (s) { e.preventDefault(); s.focus(); } }
      if (e.key === '?') setPanel('keys');
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, []);

  // Live progress for the process rail, for the selected vendor or all.
  const vf = (id: string) => vendor === 'ALL' || id === vendor;
  const sup = ws.data.suppliers.filter(s => vf(s.id));
  const received = sup.filter(s => ws.received.includes(s.id)).length;
  const recs = r.normalized.buyer.filter(x => vf(x.vendorId)).length + r.normalized.supplier.filter(x => vf(x.vendorId)).length;
  const pairs = r.matches.filter(m => vf(m.buyer.vendorId)).length;
  const pend = r.pending.filter(m => vf(m.buyer.vendorId)).length;
  const open = r.exceptions.filter(e => vf(e.vendorId) && e.status !== 'Resolved');
  const signed = sup.filter(s => vendorStatus(ws, s.id) === 'Signed off').length;
  const rail: Record<string, { value: string; sub: string; p: number }> = {
    upload: { value: `${received} of ${sup.length}`, sub: received === sup.length ? 'All ledgers received' : `${sup.length - received} awaited`, p: sup.length ? received / sup.length : 0 },
    reconciled: { value: `${recs ? Math.round((pairs * 2 / recs) * 100) : 0}%`, sub: `${pairs} pairs${pend ? ` · ${pend} to confirm` : ''}`, p: recs ? pairs * 2 / recs : 0 },
    unreconciled: { value: `${open.length} open`, sub: short(open.reduce((t, e) => t + e.impact, 0)) + ' impact', p: r.exceptions.filter(e => vf(e.vendorId)).length ? 1 - open.length / r.exceptions.filter(e => vf(e.vendorId)).length : 1 },
    summary: { value: `${signed} of ${sup.length}`, sub: 'vendors signed off', p: sup.length ? signed / sup.length : 0 },
  };
  const stage = route.screen === 'vendor' ? 'summary' : route.screen;
  const changed = Object.keys(decisions.edits).length + Object.keys(decisions.probable).length + decisions.manual.length + decisions.reopened.length + ws.jobs.filter(j => j.source === 'reviewer upload').length;
  const reset = () => { setWs(initialWorkspace()); setDecisions(EMPTY_DECISIONS); setSettings(DEFAULT_SETTINGS); setVendor('ALL'); setFocus({}); toast('Demo reset to its starting data'); };
  const dot = (id: string) => { const s = vendorStatus(ws, id); return s === 'Signed off' ? 'green' : s === 'Ledger not received' ? 'red' : 'amber'; };

  return <section className="rw" id="reconciliation-lab">
    <div className="rd-top">
      <div className="rd-bar">
        <div className="rd-brand"><span className="rw-mark">NXT</span><div><b>Recon Desk</b><small>{ENTITY} · {PERIOD.quarter} ({PERIOD.label})</small></div></div>
        <Picker value={vendor} onChange={setVendor} allLabel={`All vendors (${ws.data.suppliers.length})`} options={ws.data.suppliers.map(s => ({ id: s.id, label: s.name, meta: vendorStatus(ws, s.id), dot: dot(s.id) }))} />
        <div className="rd-actions">
          <button className="rd-act" onClick={() => setPanel('activity')}><Icon n="chat" /> Activity <em>{ws.activity.length}</em></button>
          <button className="rd-act" onClick={() => setPanel('rules')}><Icon n="rules" /> Rules</button>
          <button className="rd-act icon" onClick={() => setPanel('keys')} aria-label="Keyboard shortcuts">?</button>
          {changed > 0 && <button className="rd-act lime" onClick={reset}><Icon n="reset" s={14} /> Reset demo</button>}
        </div>
      </div>
      <nav className="rd-rail" aria-label="Reconciliation stages">
        {STAGES.map(s => { const x = rail[s.id]; return <a key={s.id} href={`#reconciliation-lab/${s.id}`} className={stage === s.id ? 'on' : ''} aria-current={stage === s.id ? 'page' : undefined}>
          <span className="n">{s.n}</span><span className="t"><b>{s.label}</b><small>{s.verb}</small></span><span className="v"><b>{x.value}</b><small>{x.sub}</small></span><Meter value={x.p} /></a>; })}
      </nav>
    </div>
    <p className="rw-banner">Illustrative NXT Foundry demo · synthetic data. Meridian Consumer Products, its vendors, people and every figure here are fictional.</p>
    <div className="rw-main">
      {route.screen === 'upload' && <UploadScreen ctx={ctx} />}
      {route.screen === 'summary' && <SummaryScreen ctx={ctx} />}
      {route.screen === 'vendor' && <VendorScreen ctx={ctx} vendorId={route.vendorId} />}
      {route.screen === 'reconciled' && <ReconciledScreen ctx={ctx} />}
      {route.screen === 'unreconciled' && <UnreconciledScreen ctx={ctx} />}
    </div>
    {panel === 'rules' && <RulesDrawer settings={settings} setSettings={s => { setSettings(s); }} onClose={() => setPanel('')} r={r} />}
    {panel === 'activity' && <ActivityDrawer ctx={ctx} onClose={() => setPanel('')} />}
    {panel === 'keys' && <Drawer title="Keyboard shortcuts" onClose={() => setPanel('')}>
      <dl className="rw-keys">{[['1 – 4', 'Go to Collect, Match, Resolve, Sign off'], ['/', 'Search the table on this page'], ['Esc', 'Close a panel'], ['?', 'Show this list']].map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl>
    </Drawer>}
    <Toasts items={toasts} dismiss={id => setToasts(t => t.filter(x => x.id !== id))} />
  </section>;
}

export function PageHead({ n, title, children, actions }: { n?: string; title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <header className="rd-head"><div>{n && <span className="rd-n">{n}</span>}<h1>{title}</h1><p>{children}</p></div>{actions && <div className="rd-head-actions">{actions}</div>}</header>;
}

function ActivityDrawer({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { ws, vName, vendor, openException, go } = ctx;
  const [kind, setKind] = useState<string>('');
  const items = ws.activity.filter(a => (vendor === 'ALL' || a.vendorId === vendor) && (!kind || a.kind === kind)).sort((a, b) => actTime(b.at) - actTime(a.at) || b.id - a.id);
  const KINDS: [string, string][] = [['', 'All'], ['upload', 'Uploads'], ['match', 'Matching'], ['exception', 'Exceptions'], ['comment', 'Comments'], ['signoff', 'Sign-offs'], ['reminder', 'Reminders']];
  return <Drawer title="Activity" sub={`Audit trail${vendor !== 'ALL' ? ` for ${vName(vendor)}` : ''}: every upload, decision and sign-off, with who and when.`} onClose={onClose}>
    <div className="rw-seg">{KINDS.map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
    <ol className="rw-timeline">{items.map(a => <li key={a.id} className={a.kind}>
      <Avatar name={a.who} /><div><p><b>{a.who}</b> · {a.what}</p>{a.text && <blockquote>{a.text}</blockquote>}
        <small>{a.at}{a.vendorId && <> · <button className="rw-link" onClick={() => { onClose(); go('vendor', a.vendorId); }}>{vName(a.vendorId)}</button></>}{a.exceptionKey && <> · <button className="rw-link" onClick={() => { onClose(); openException(a.exceptionKey!); }}>Open item</button></>}</small></div></li>)}
      {!items.length && <li className="empty">Nothing recorded yet.</li>}</ol>
  </Drawer>;
}

function RulesDrawer({ settings, setSettings, onClose, r }: { settings: Settings; setSettings: (s: Settings) => void; onClose: () => void; r: Result }) {
  const field = (k: keyof Settings, label: string, unit: string, help: string, step = 1) => <label className="rw-setting"><span><b>{label}</b><small>{help}</small></span><span><input type="number" min={0} step={step} value={settings[k] as number} onChange={e => setSettings({ ...settings, [k]: Math.max(0, Number(e.target.value) || 0) })} />{unit}</span></label>;
  const count = (l: number) => r.matches.filter(m => m.level === l).length;
  return <Drawer title="Matching rules" sub="Changes apply immediately: every match, open item and annexure recalculates." onClose={onClose}>
    <h4 className="rw-h4">Rule hierarchy · strictest first</h4>
    <ol className="rw-levels">
      <li><b>L1 Exact</b><span>Vendor ID, exact document number and currency</span><em>{count(1)}</em></li>
      <li><b>L2 Strong</b><span>Cleaned document number or vendor name alias, dates within tolerance</span><em>{count(2)}</em></li>
      <li><b>L3 Probable</b><span>Same vendor and amount, close dates, different references. A reviewer confirms.</span><em>{count(3) + r.pending.length}</em></li>
      <li><b>L4 PO / GRN</b><span>Invoice rate, quantity and value against the PO and goods receipt</span><em>checks</em></li>
      <li><b>L5 Payments</b><span>Payment register checked for duplicates and part-payments by UTR</span><em>checks</em></li>
    </ol>
    <h4 className="rw-h4">Tolerances</h4>
    {field('dateTolerance', 'Date tolerance', 'days', 'How far apart dates may be for L2 and L3')}
    {field('amountTolerance', 'Amount tolerance', '₹', 'Rounding allowed for L3 and duplicate checks')}
    {field('transitDays', 'In-transit window', 'days', 'Items this close to period end count as timing')}
    <h4 className="rw-h4">Severity by potential impact</h4>
    {field('critical', 'Critical from', '₹', 'And above', 5000)}{field('high', 'High from', '₹', 'Up to critical', 5000)}{field('medium', 'Medium from', '₹', 'Below this is low', 5000)}
    <p className="rw-note">Always on: no match across vendors or currencies, each record is used once, and probable matches wait for a reviewer.</p>
    <button className="rw-btn" onClick={() => setSettings(DEFAULT_SETTINGS)}><Icon n="reset" s={14} /> Restore defaults</button>
  </Drawer>;
}
