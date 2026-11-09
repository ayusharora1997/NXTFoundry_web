import React, { useEffect, useMemo, useState } from 'react';
import { reconcile, DEFAULT_SETTINGS, EMPTY_DECISIONS, type Settings, type Decisions, type Result, type ExceptionEdit, type BridgeItem } from './engine';
import { initialWorkspace, activeData, annexByVendor, vendorStatus, PERIOD, ENTITY, type Workspace, type Annex, type AnnexId } from './model';
import { Icon, Drawer } from './ui';
import UploadScreen from './Upload';
import SummaryScreen from './Summary';
import ReconciledScreen from './Reconciled';
import UnreconciledScreen from './Unreconciled';
import './app.css';

export type Screen = 'upload' | 'summary' | 'reconciled' | 'unreconciled';
const SCREENS: { id: Screen; label: string; icon: string; lede: string }[] = [
  { id: 'upload', label: 'Vendor ledger upload', icon: 'upload', lede: 'Receive each vendor’s statement of account, check it against the agreed opening balance, and keep every upload on record.' },
  { id: 'summary', label: 'Reconciliation summary', icon: 'summary', lede: 'Where every vendor stands: both closing balances, the difference, and the annexures that explain it line by line.' },
  { id: 'reconciled', label: 'Reconciled transactions', icon: 'check', lede: 'Every pair the engine matched, with the rule that matched it. Reopen any pair that should not have matched.' },
  { id: 'unreconciled', label: 'Unreconciled transactions', icon: 'open', lede: 'Everything that did not reconcile cleanly, split by what needs to happen next. Assign, investigate and resolve.' },
];
export interface Ctx {
  ws: Workspace; setWs: React.Dispatch<React.SetStateAction<Workspace>>; r: Result;
  annex: Map<string, { annex: Annex; lines: Record<AnnexId, BridgeItem[]> }>;
  vendor: string; setVendor: (v: string) => void; vName: (id: string) => string;
  decisions: Decisions; setDecisions: React.Dispatch<React.SetStateAction<Decisions>>;
  edit: (key: string, e: ExceptionEdit) => void;
  go: (s: Screen) => void; openException: (key: string) => void; openUpload: (vendorId: string) => void; openRules: () => void;
  focus: { exception?: string; upload?: string }; clearFocus: () => void;
}

const readScreen = (): Screen => { const s = window.location.hash.split('/')[1] as Screen; return SCREENS.some(x => x.id === s) ? s : 'summary'; };

export default function ReconWorkspace() {
  const [ws, setWs] = useState<Workspace>(initialWorkspace);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [decisions, setDecisions] = useState<Decisions>(EMPTY_DECISIONS);
  const [vendor, setVendor] = useState('ALL');
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [focus, setFocus] = useState<Ctx['focus']>({});
  useEffect(() => { const f = () => setScreen(readScreen()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const r = useMemo(() => reconcile(activeData(ws), settings, decisions), [ws, settings, decisions]);
  const annex = useMemo(() => annexByVendor(r), [r]);
  const go = (s: Screen) => { window.location.hash = `reconciliation-lab/${s}`; setScreen(s); };
  const vName = (id: string) => ws.data.suppliers.find(s => s.id === id)?.name ?? id;
  const ctx: Ctx = {
    ws, setWs, r, annex, vendor, setVendor, vName, decisions, setDecisions,
    edit: (key, e) => setDecisions(d => ({ ...d, edits: { ...d.edits, [key]: { ...d.edits[key], ...e } } })),
    go, openException: key => { setFocus({ exception: key }); go('unreconciled'); }, openUpload: v => { setFocus({ upload: v }); go('upload'); }, openRules: () => setRulesOpen(true),
    focus, clearFocus: () => setFocus({}),
  };
  const pending = ws.data.suppliers.filter(s => vendorStatus(ws, s.id) === 'Ledger not received').length;
  const openEx = r.exceptions.filter(e => e.status !== 'Resolved' && (vendor === 'ALL' || e.vendorId === vendor)).length;
  const changed = Object.keys(decisions.edits).length + Object.keys(decisions.probable).length + decisions.manual.length + decisions.reopened.length + ws.jobs.filter(j => j.source === 'reviewer upload').length;
  const reset = () => { setWs(initialWorkspace()); setDecisions(EMPTY_DECISIONS); setSettings(DEFAULT_SETTINGS); setVendor('ALL'); setFocus({}); };
  const cur = SCREENS.find(s => s.id === screen)!;

  return <section className="rw" id="reconciliation-lab">
    <p className="rw-banner">Illustrative NXT Foundry demo · synthetic data. Meridian Consumer Products, its vendors, people and every figure here are fictional.</p>
    <div className="rw-shell">
      <aside className="rw-side">
        <div className="rw-brand"><span className="rw-mark">NXT</span><div><b>Recon Desk</b><small>Vendor reconciliation</small></div></div>
        <nav aria-label="Recon Desk">
          <span className="rw-nav-label">Reconciliation</span>
          {SCREENS.map(s => <a key={s.id} href={`#reconciliation-lab/${s.id}`} className={screen === s.id ? 'on' : ''} aria-current={screen === s.id ? 'page' : undefined}><Icon n={s.icon} /><span>{s.label}</span>
            {s.id === 'upload' && pending > 0 && <em className="warn">{pending}</em>}{s.id === 'unreconciled' && <em>{openEx}</em>}</a>)}
          <span className="rw-nav-label">Rule management</span>
          <button onClick={() => setRulesOpen(true)}><Icon n="rules" /><span>Matching rules</span></button>
        </nav>
        <div className="rw-side-foot">
          <dl><div><dt>Entity</dt><dd>{ENTITY}</dd></div><div><dt>Period</dt><dd>{PERIOD.quarter} · {PERIOD.label}</dd></div><div><dt>Signed in as</dt><dd>AP reviewer</dd></div></dl>
          {changed > 0 && <button className="rw-reset" onClick={reset}><Icon n="reset" s={14} /> Reset demo ({changed} change{changed > 1 ? 's' : ''})</button>}
        </div>
      </aside>
      <div className="rw-main">
        <div className="rw-filters" role="group" aria-label="Filters">
          <span className="rw-chip"><b>Quarterly</b></span>
          <span className="rw-chip">{PERIOD.quarter} · {PERIOD.label}</span>
          <span className="rw-chip"><i>Entity</i>{ENTITY}</span>
          <span className="rw-chip"><i>Ledger</i>Full ledger</span>
          <label className="rw-chip select"><i>Vendor</i><select value={vendor} onChange={e => setVendor(e.target.value)} aria-label="Vendor filter"><option value="ALL">All vendors ({ws.data.suppliers.length})</option>{ws.data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          {vendor !== 'ALL' && <button className="rw-btn ghost" onClick={() => setVendor('ALL')}>Reset all</button>}
        </div>
        <header className="rw-page-head"><h1>{cur.label}</h1><p>{cur.lede}</p></header>
        {screen === 'upload' && <UploadScreen ctx={ctx} />}
        {screen === 'summary' && <SummaryScreen ctx={ctx} />}
        {screen === 'reconciled' && <ReconciledScreen ctx={ctx} />}
        {screen === 'unreconciled' && <UnreconciledScreen ctx={ctx} />}
      </div>
    </div>
    {rulesOpen && <RulesDrawer settings={settings} setSettings={setSettings} onClose={() => setRulesOpen(false)} r={r} />}
  </section>;
}

function RulesDrawer({ settings, setSettings, onClose, r }: { settings: Settings; setSettings: (s: Settings) => void; onClose: () => void; r: Result }) {
  const field = (k: keyof Settings, label: string, unit: string, step = 1) => <label className="rw-setting"><span>{label}</span><span><input type="number" min={0} step={step} value={settings[k] as number} onChange={e => setSettings({ ...settings, [k]: Math.max(0, Number(e.target.value) || 0) })} />{unit}</span></label>;
  const count = (l: number) => r.matches.filter(m => m.level === l).length;
  return <Drawer title="Matching rules" sub="Changes apply immediately: every match, exception and annexure recalculates." onClose={onClose}>
    <h4 className="rw-h4">Rule hierarchy</h4>
    <ol className="rw-levels">
      <li><b>L1 · Exact</b><span>Vendor ID + exact document number + currency</span><em>{count(1)} pairs</em></li>
      <li><b>L2 · Strong</b><span>Cleaned document number or vendor name alias, dates within tolerance</span><em>{count(2)} pairs</em></li>
      <li><b>L3 · Probable</b><span>Same vendor and amount, dates within tolerance, different references. Needs a reviewer.</span><em>{count(3) + r.pending.length} pairs</em></li>
      <li><b>L4 · PO and GRN</b><span>Invoices checked against PO rate and approved amount, GRN quantity and value</span><em>checks</em></li>
      <li><b>L5 · Payments</b><span>Payment register checked for duplicates and part-payments, by UTR</span><em>checks</em></li>
    </ol>
    <h4 className="rw-h4">Tolerances</h4>
    {field('dateTolerance', 'Date tolerance (L2, L3)', 'days')}{field('amountTolerance', 'Amount tolerance (L3, duplicates)', '₹')}{field('transitDays', 'In-transit window before period end', 'days')}
    <h4 className="rw-h4">Severity thresholds (potential impact)</h4>
    {field('critical', 'Critical from', '₹', 5000)}{field('high', 'High from', '₹', 5000)}{field('medium', 'Medium from', '₹', 5000)}
    <p className="rw-note">Always on: no match across vendors or currencies, each record is used once, and probable matches stay pending until confirmed.</p>
    <button className="rw-btn" onClick={() => setSettings(DEFAULT_SETTINGS)}>Restore defaults</button>
  </Drawer>;
}
