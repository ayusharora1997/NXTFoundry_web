import React, { useMemo, useState } from 'react';
import { generate, fmtDate, type Dataset } from './data';
import {
  reconcile, DEFAULT_SETTINGS, EMPTY_DECISIONS, BUCKETS, CATEGORIES, OWNERS, DOC_LABEL, toCSV,
  type Settings, type Decisions, type Exception, type Match, type Rec, type Severity, type Status, type Resolution, type Nature, type ExceptionEdit,
} from './engine';
import './lab.css';

const inr = (n: number | null | undefined, dp = 0) => n === null || n === undefined ? '—' : (n < -0.004 ? '−' : '') + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const signed = (n: number, dp = 0) => (n > 0.004 ? '+' : '') + inr(n, dp);
const pct = (a: number, b: number) => b ? Math.round((a / b) * 100) : 0;
const SEVS: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
const NATURES: Nature[] = ['Confirmed discrepancy', 'Potential financial exposure', 'Timing difference', 'Data quality issue', 'Information gap'];
const STATUSES: Status[] = ['Open', 'Under investigation', 'Awaiting supplier', 'Resolved'];
const RESOLUTIONS: Resolution[] = ['', 'Buyer ledger adjustment', 'Supplier statement correction', 'Timing difference — clears next period', 'Explained — no adjustment needed'];
const STEPS = ['Overview', 'Data & quality', 'Matching', 'Exceptions', 'Bridge', 'Reports'] as const;

const GUIDE: Record<typeof STEPS[number], { what: string; points: string[]; tryThis: string }> = {
  'Overview': { what: 'Where the two sides stand. Meridian\'s accounts payable ledger says it owes one amount; its suppliers\' statements say another. This page shows the gap and where it sits.', points: ['Variance = buyer payable balance − supplier reported balance.', 'A negative variance means suppliers say Meridian owes more than its own books show.', 'Click a supplier row to filter every page to that supplier.'], tryThis: 'Click the supplier with the largest variance, then press Next.' },
  'Data & quality': { what: 'Before anything is matched, every input file is checked and cleaned. Original values are kept next to the cleaned ones, and nothing is changed silently.', points: ['Five inputs: AP ledger, supplier statements, purchase orders, goods receipts, payment register.', 'Dates, amounts and supplier names arrive in mixed formats and are standardised.', 'Bad rows are rejected with a reason, and duplicate rows are set aside.'], tryThis: 'Open the Supplier statements tab and find the three rejected rows.' },
  'Matching': { what: 'Records from both sides are paired in a fixed order, strictest rule first. Each pair keeps the rule that matched it and a confidence label.', points: ['Level 1, exact: same vendor ID, same document number.', 'Level 2, strong: same document number after cleaning (case, separators, leading zeros) or a known supplier name alias, dates within tolerance.', 'Level 3, probable: different references but the same vendor, amount and date. These need your confirmation.', 'Levels 4–5 check invoices against POs, goods receipts and the payment register.'], tryThis: 'Confirm or reject the probable matches, then change the date tolerance and watch the counts move.' },
  'Exceptions': { what: 'Everything that did not reconcile cleanly, sorted by severity. Severity comes from fixed rules on the amount and type, not from a guess.', points: ['Each exception is labelled as a confirmed discrepancy, potential exposure, timing difference, data quality issue or information gap.', 'Not every difference is a loss; timing differences clear on their own next period.', 'Assign an owner, record notes, and mark how it was resolved.'], tryThis: 'Open EX-001, read the recommended investigation, and resolve it as a buyer ledger adjustment.' },
  'Bridge': { what: 'The bridge explains the full variance line by line. Each record appears once, so the lines always add up exactly to the difference between the two balances.', points: ['Start at Meridian\'s balance and end at the suppliers\' balance.', 'Every line names its source records and which side it moves.', 'Resolved exceptions move into "Confirmed adjustments"; the rest stays in "Unresolved".'], tryThis: 'Expand "Supplier-only transactions" and open one of the lines.' },
  'Reports': { what: 'Everything you have seen, as files you can take away. All exports reflect your confirmations and resolutions so far.', points: ['CSV files open directly in Excel.', 'The summary is generated from the numbers using fixed rules, with no AI writing.', 'The methodology explains every calculation and the sign convention.'], tryThis: 'Download the exceptions register and open it in Excel.' },
};

function download(name: string, text: string) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Pager<T>({ rows, size = 15, render }: { rows: T[]; size?: number; render: (r: T[]) => React.ReactNode }) {
  const [page, setPage] = useState(0); const pages = Math.max(1, Math.ceil(rows.length / size)); const p = Math.min(page, pages - 1);
  return <>{render(rows.slice(p * size, p * size + size))}{pages > 1 && <div className="lab-pager"><button disabled={p === 0} onClick={() => setPage(p - 1)}>‹ Prev</button><span>Page {p + 1} of {pages} · {rows.length} rows</span><button disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next ›</button></div>}</>;
}
const Sev = ({ s }: { s: Severity }) => <span className={'sev sev-' + s.toLowerCase()}>{s}</span>;
const Chip = ({ children, tone = '' }: { children: React.ReactNode; tone?: string }) => <span className={'chip ' + tone}>{children}</span>;
const natureTone = (n: string) => n === 'Timing difference' ? 'tone-time' : n === 'Confirmed discrepancy' ? 'tone-bad' : n === 'Potential financial exposure' ? 'tone-warn' : 'tone-info';

export default function ReconciliationLab() {
  const data = useMemo(() => generate(), []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [decisions, setDecisions] = useState<Decisions>(EMPTY_DECISIONS);
  // #reconciliation-lab/3 opens step 3 directly (handy for sharing a step).
  const [step, setStep] = useState(() => { const n = Number(window.location.hash.split('/')[1]); return n >= 1 && n <= 6 ? n - 1 : 0; });
  React.useEffect(() => { const f = () => { const n = Number(window.location.hash.split('/')[1]); if (n >= 1 && n <= 6) setStep(n - 1); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const [vendor, setVendor] = useState('ALL');
  const [selected, setSelected] = useState<string>('');
  const [guideOpen, setGuideOpen] = useState(true);
  const r = useMemo(() => reconcile(data, settings, decisions), [data, settings, decisions]);
  const vf = <T extends { vendorId: string }>(xs: T[]) => vendor === 'ALL' ? xs : xs.filter(x => x.vendorId === vendor);
  const go = (i: number) => { setStep(i); history.replaceState(null, '', `#reconciliation-lab/${i + 1}`);document.getElementById('reconciliation-lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const openException = (key: string) => { setSelected(key); go(3); };
  const edit = (key: string, e: ExceptionEdit) => setDecisions(d => ({ ...d, edits: { ...d.edits, [key]: { ...d.edits[key], ...e } } }));
  const resetAll = () => { setDecisions(EMPTY_DECISIONS); setSettings(DEFAULT_SETTINGS); setSelected(''); setVendor('ALL'); };
  const vName = (id: string) => data.suppliers.find(s => s.id === id)?.name ?? id;
  const guide = GUIDE[STEPS[step]];
  const changed = Object.keys(decisions.edits).length + Object.keys(decisions.probable).length + decisions.manual.length;

  return <section className="page section lab" id="reconciliation-lab">
    <div className="lab-banner" role="note">Illustrative NXT Foundry Solution Demonstration — Synthetic Data. Meridian Consumer Products, its suppliers and every figure here are fictional.</div>
    <div className="lab-head">
      <div><span className="eyebrow">REVENUE ASSURANCE DESK · WORKING DEMO</span><h1>Reconciliation <em>Lab</em></h1>
        <p className="page-lede">Vendor and accounts payable reconciliation: does what Meridian thinks it owes agree with what its suppliers say they are owed? Follow the six steps to see how the tool gets from raw files to an explained difference.</p></div>
      <dl className="lab-meta"><div><dt>Company</dt><dd>{data.company}</dd></div><div><dt>Period</dt><dd>{data.periodStart} to {data.periodEnd}</dd></div><div><dt>Statement date</dt><dd>{data.periodEnd}</dd></div><div><dt>Data</dt><dd>Synthetic · seed {data.seed}</dd></div></dl>
    </div>

    <nav className="lab-steps" aria-label="Reconciliation steps">{STEPS.map((s, i) => <button key={s} className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}><b>{String(i + 1).padStart(2, '0')}</b>{s}</button>)}</nav>
    <div className="lab-toolbar">
      <label>Supplier <select value={vendor} onChange={e => setVendor(e.target.value)}><option value="ALL">All suppliers ({data.suppliers.length})</option>{data.suppliers.map(s => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}</select></label>
      <span className={'lab-check ' + (r.bridgeCheck ? 'ok' : 'bad')}>{r.bridgeCheck ? '✓ Bridge explains the full variance' : '✗ Bridge does not reconcile'}</span>
      {changed > 0 && <button className="lab-link" onClick={resetAll}>Reset demo ({changed} change{changed > 1 ? 's' : ''})</button>}
    </div>

    <aside className={'lab-guide' + (guideOpen ? '' : ' closed')}>
      <button className="lab-guide-toggle" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>{guideOpen ? 'Hide guide' : 'How this step works'}</button>
      {guideOpen && <><p>{guide.what}</p><ul>{guide.points.map(p => <li key={p}>{p}</li>)}</ul><p className="lab-try"><b>Try this:</b> {guide.tryThis}</p></>}
    </aside>

    <div className="lab-body">
      {step === 0 && <Overview r={r} vf={vf} vendor={vendor} setVendor={setVendor} openException={openException} />}
      {step === 1 && <DataStep r={r} datasets={data.datasets} aliases={data.aliases} />}
      {step === 2 && <MatchingStep r={r} vf={vf} settings={settings} setSettings={setSettings} decisions={decisions} setDecisions={setDecisions} />}
      {step === 3 && <ExceptionsStep r={r} vf={vf} selected={selected} setSelected={setSelected} edit={edit} settings={settings} setSettings={setSettings} setDecisions={setDecisions} vName={vName} />}
      {step === 4 && <BridgeStep r={r} vendor={vendor} vf={vf} openException={openException} vName={vName} />}
      {step === 5 && <ReportsStep r={r} data={data.datasets} vendor={vendor} vName={vName} />}
    </div>

    <div className="lab-nav">
      <button disabled={step === 0} onClick={() => go(step - 1)}>← {step > 0 ? STEPS[step - 1] : 'Back'}</button>
      {step < STEPS.length - 1 ? <button className="primary" onClick={() => go(step + 1)}>Next: {STEPS[step + 1]} →</button> : <a className="primary" href="#contact-form">Talk to us about your reconciliation →</a>}
    </div>
  </section>;
}

type R = ReturnType<typeof reconcile>;
type VF = <T extends { vendorId: string }>(xs: T[]) => T[];

function Overview({ r, vf, vendor, setVendor, openException }: { r: R; vf: VF; vendor: string; setVendor: (v: string) => void; openException: (k: string) => void }) {
  const vs = vf(r.vendors);
  const b = vs.reduce((s, v) => s + v.buyerBalance, 0), s = vs.reduce((s2, v) => s2 + v.supplierBalance, 0), variance = b - s;
  const ex = vf(r.exceptions).filter(e => e.status !== 'Resolved');
  const recs = vs.reduce((t, v) => t + v.buyerRecs + v.supplierRecs, 0), matched = vs.reduce((t, v) => t + v.matched, 0) * 2;
  const exposure = ex.filter(e => e.nature !== 'Timing difference' && e.nature !== 'Data quality issue').reduce((t, e) => t + e.impact, 0);
  const timing = vf(r.bridge).filter(x => x.bucket === 'Timing differences').reduce((t, x) => t + x.amount, 0);
  const maxV = Math.max(1, ...r.vendors.map(v => Math.abs(v.variance)));
  const byNature = NATURES.map(n => ({ n, c: ex.filter(e => e.nature === n).length, v: ex.filter(e => e.nature === n).reduce((t, e) => t + e.impact, 0) }));
  const maxN = Math.max(1, ...byNature.map(x => x.v));
  return <>
    <div className="kpis">
      <div className="kpi"><span>Suppliers</span><b>{vs.length}</b><small>{recs} records across both sides</small></div>
      <div className="kpi"><span>Buyer ledger balance</span><b>{inr(b)}</b><small>What Meridian says it owes</small></div>
      <div className="kpi"><span>Supplier statement balance</span><b>{inr(s)}</b><small>What suppliers say they are owed</small></div>
      <div className="kpi kpi-key"><span>Reconciliation variance</span><b>{signed(variance)}</b><small>{variance < 0 ? 'Suppliers report more than Meridian records' : variance > 0 ? 'Meridian records more than suppliers report' : 'Balances agree'}</small></div>
      <div className="kpi"><span>Records matched</span><b>{pct(matched, recs)}%</b><small>{matched} of {recs}</small></div>
      <div className="kpi"><span>Open exceptions</span><b>{ex.length}</b><small>{SEVS.map(sv => `${ex.filter(e => e.severity === sv).length} ${sv.toLowerCase()}`).join(' · ')}</small></div>
      <div className="kpi"><span>Potential exposure</span><b>{inr(exposure)}</b><small>Open items, excluding timing and data quality</small></div>
      <div className="kpi"><span>Timing differences</span><b>{signed(timing)}</b><small>Expected to clear next period</small></div>
    </div>
    <p className="sign-note"><b>Sign convention.</b> Variance = buyer payable balance − supplier reported receivable balance. Positive: Meridian records a higher payable than the supplier reports. Negative: Meridian records a lower payable.</p>
    <div className="lab-grid2">
      <div className="panel"><h3>Variance by supplier</h3>
        <div className="table-wrap"><table className="lab-table"><thead><tr><th>Supplier</th><th className="ar">Buyer</th><th className="ar">Supplier</th><th>Variance</th><th className="ar">Open</th></tr></thead>
          <tbody>{r.vendors.map(v => <tr key={v.vendorId} className={'clickable' + (vendor === v.vendorId ? ' sel' : '')} onClick={() => setVendor(vendor === v.vendorId ? 'ALL' : v.vendorId)}>
            <td><b>{v.vendorId}</b> {v.name}</td><td className="ar">{inr(v.buyerBalance)}</td><td className="ar">{inr(v.supplierBalance)}</td>
            <td><div className="vbar"><div className="vtrack"><i style={{ width: `${(Math.abs(v.variance) / maxV) * 50}%`, [v.variance < 0 ? 'right' : 'left']: '50%' } as React.CSSProperties} className={v.variance < 0 ? 'neg' : 'pos'} /></div><span>{signed(v.variance)}</span></div></td>
            <td className="ar">{v.openExceptions}</td></tr>)}</tbody></table></div>
        <p className="hint">Click a row to filter every step to that supplier. Click again to clear.</p>
      </div>
      <div className="panel"><h3>Open exceptions by nature</h3>
        {byNature.map(x => <div className="hbar" key={x.n}><span>{x.n} <em>({x.c})</em></span><div><i className={natureTone(x.n)} style={{ width: `${(x.v / maxN) * 100}%` }} /></div><b>{inr(x.v)}</b></div>)}
        <h3 className="mt">Where to look first</h3>
        <ol className="toplist">{ex.slice(0, 5).map(e => <li key={e.key}><button onClick={() => openException(e.key)}><Sev s={e.severity} /> <b>{e.id}</b> {e.category} <span>{e.vendorId} · {inr(e.impact)}</span></button></li>)}</ol>
      </div>
    </div>
  </>;
}

function DataStep({ r, datasets, aliases }: { r: R; datasets: Dataset[]; aliases: { alias: string; vendorId: string }[] }) {
  const [tab, setTab] = useState<string>('statement');
  const [chg, setChg] = useState('ALL');
  const N = r.normalized;
  const d = datasets.find(x => x.key === tab);
  const changes = chg === 'ALL' ? N.changes : N.changes.filter(c => c.dataset === chg);
  return <>
    <div className="panel"><h3>Data quality report</h3>
      <div className="table-wrap"><table className="lab-table"><thead><tr><th>Input</th><th className="ar">Received</th><th className="ar">Accepted</th><th className="ar">Rejected</th><th className="ar">Duplicates</th><th className="ar">Missing fields</th><th className="ar">Invalid dates</th><th className="ar">Invalid amounts</th><th className="ar">Normalised values</th></tr></thead>
        <tbody>{N.quality.map(q => <tr key={q.dataset}><td>{q.dataset}</td><td className="ar">{q.received}</td><td className="ar">{q.accepted}</td><td className={'ar' + (q.rejected ? ' warn' : '')}>{q.rejected}</td><td className={'ar' + (q.duplicates ? ' warn' : '')}>{q.duplicates}</td><td className="ar">{q.missing}</td><td className="ar">{q.invalidDates}</td><td className="ar">{q.invalidAmounts}</td><td className="ar">{q.changes}</td></tr>)}</tbody></table></div>
      {N.rejections.length > 0 && <><h4>Rows set aside</h4><ul className="rejects">{N.rejections.map(j => <li key={j.recordId + j.reasons[0]}><b>{j.recordId}</b> <span>{j.dataset}</span> — {j.reasons.join('; ')}</li>)}</ul></>}
    </div>
    <div className="panel"><div className="panel-head"><h3>Normalisation log <em>({changes.length})</em></h3>
      <select value={chg} onChange={e => setChg(e.target.value)}><option value="ALL">All inputs</option>{N.quality.map(q => <option key={q.dataset}>{q.dataset}</option>)}</select></div>
      <p className="hint">The original value is kept alongside every cleaned value. Document numbers are also reduced to a matching key (for example <code>KPL/26-27/0045</code> → <code>KPL262745</code>); you can see those keys on the Matching step.</p>
      <Pager rows={changes} size={10} render={rows => <div className="table-wrap"><table className="lab-table"><thead><tr><th>Input</th><th>Record</th><th>Field</th><th>Original</th><th>Normalised</th></tr></thead><tbody>{rows.map((c, i) => <tr key={c.recordId + c.field + i}><td>{c.dataset}</td><td>{c.recordId}</td><td>{c.field}</td><td><code>{JSON.stringify(c.raw)}</code></td><td><code>{c.normalized}</code></td></tr>)}</tbody></table></div>} />
    </div>
    <div className="panel"><div className="panel-head"><h3>Input files</h3><div className="tabs">{datasets.map(x => <button key={x.key} className={tab === x.key ? 'on' : ''} onClick={() => setTab(x.key)}>{x.title} <em>{x.rows.length}</em></button>)}<button className={tab === 'alias' ? 'on' : ''} onClick={() => setTab('alias')}>Vendor aliases <em>{aliases.length}</em></button></div></div>
      {d ? <><p className="hint">{d.description} <button className="lab-link" onClick={() => download(`${d.key}-synthetic.csv`, toCSV(d.rows))}>Download as CSV</button></p>
        <Pager key={d.key} rows={d.rows} size={12} render={rows => <div className="table-wrap"><table className="lab-table small"><thead><tr>{d.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{d.columns.map(c => <td key={c}>{row[c]}</td>)}</tr>)}</tbody></table></div>} /></>
        : <><p className="hint">Suppliers name themselves differently on their statements. This table maps each name variant to a vendor in Meridian's master; it is how Level 2 matches statements that carry no vendor ID.</p>
          <div className="table-wrap"><table className="lab-table small"><thead><tr><th>Name as written</th><th>Vendor ID</th></tr></thead><tbody>{aliases.map(a => <tr key={a.alias}><td>{a.alias}</td><td>{a.vendorId}</td></tr>)}</tbody></table></div></>}
      <p className="lab-note">In this demo the inputs are generated synthetic files. Upload of your own CSV or Excel files, with column mapping and an import preview, is part of the full version.</p>
    </div>
  </>;
}

function RecCell({ rec }: { rec: Rec }) { return <><b>{rec.rawRef || rec.id}</b><small>{rec.id} · {fmtDate(rec.date)}</small></>; }

function MatchingStep({ r, vf, settings, setSettings, decisions, setDecisions }: { r: R; vf: VF; settings: Settings; setSettings: (s: Settings) => void; decisions: Decisions; setDecisions: React.Dispatch<React.SetStateAction<Decisions>> }) {
  const [conf, setConf] = useState('ALL'); const [q, setQ] = useState('');
  const withVendor = (m: Match) => ({ ...m, vendorId: m.buyer.vendorId });
  const all = vf(r.matches.map(withVendor));
  const pend = vf(r.pending.map(withVendor));
  const rejected = Object.entries(decisions.probable).filter(([, v]) => v === 'rejected');
  const list = all.filter(m => (conf === 'ALL' || m.confidence === conf) && (!q || `${m.buyer.rawRef} ${m.supplier.rawRef} ${m.buyer.id} ${m.supplier.id}`.toLowerCase().includes(q.toLowerCase())));
  const ub = vf(r.unmatchedBuyer).length, us = vf(r.unmatchedSupplier).length;
  const levels = [
    { l: 'Level 1 · Exact', d: 'Vendor ID + exact document number + currency', c: all.filter(m => m.level === 1).length },
    { l: 'Level 2 · Strong', d: 'Cleaned document number or supplier alias + currency, dates within tolerance', c: all.filter(m => m.level === 2).length },
    { l: 'Level 3 · Probable', d: 'Same vendor, amount within tolerance, dates within tolerance, different references', c: pend.length + all.filter(m => m.level === 3).length },
    { l: 'Manual', d: 'Paired by a reviewer from the exception panel', c: all.filter(m => m.level === 0).length },
    { l: 'Level 4 · PO & GRN', d: 'Invoices checked against approved PO, accepted quantity, rate and receipt value', c: vf(r.exceptions).filter(e => ['Purchase order amount variance', 'Goods receipt discrepancy', 'Quantity mismatch', 'Price mismatch'].includes(e.category)).length, ex: true },
    { l: 'Level 5 · Payments', d: 'Payment register, ledger postings and supplier receipts compared by UTR', c: vf(r.exceptions).filter(e => ['Duplicate payment', 'Partial payment', 'Payment recorded by buyer but not supplier', 'Payment recorded by supplier but not buyer', 'Unallocated payment'].includes(e.category)).length, ex: true },
  ];
  const num = (k: keyof Settings, label: string, unit: string, min = 0) => <label className="setting">{label}<span><input type="number" min={min} value={settings[k] as number} onChange={e => setSettings({ ...settings, [k]: Math.max(min, Number(e.target.value) || 0) })} />{unit}</span></label>;
  return <>
    <div className="lab-grid2">
      <div className="panel"><h3>Matching hierarchy</h3>
        <ol className="levels">{levels.map(x => <li key={x.l}><div><b>{x.l}</b><span>{x.d}</span></div><em>{x.c}{x.ex ? ' flags' : ' pairs'}</em></li>)}</ol>
        <p className="hint">Left unmatched: {ub} buyer records and {us} supplier records. They are classified on the Exceptions step.</p>
      </div>
      <div className="panel"><h3>Matching rules</h3>
        <p className="hint">These settings feed the engine directly. Change one and every count, exception and bridge line recalculates.</p>
        {num('dateTolerance', 'Date tolerance (Levels 2–3)', 'days')}{num('amountTolerance', 'Amount tolerance (Level 3, duplicates)', '₹')}{num('transitDays', 'In-transit window before period end', 'days')}
        <p className="hint">Controls always on: no match across vendors or currencies; every record is used at most once; probable matches stay pending until a reviewer confirms them.</p>
      </div>
    </div>
    <div className="panel"><h3>Probable matches awaiting confirmation <em>({pend.length})</em></h3>
      {pend.length === 0 ? <p className="hint">Nothing pending.{rejected.length ? ` ${rejected.length} rejected — those records are back in the exception list.` : ''}</p> :
        <div className="pairs">{pend.map(m => <div className="pair" key={m.key}>
          <div><span className="side">Buyer ledger</span><RecCell rec={m.buyer} /><b className="amt">{inr(m.buyer.amount, 2)}</b><small>{m.buyer.description}</small></div>
          <div><span className="side">Supplier statement</span><RecCell rec={m.supplier} /><b className="amt">{inr(m.supplier.amount, 2)}</b><small>{m.supplier.description}</small></div>
          <p>{m.rule}. Amounts differ by {inr(m.diff, 2)}; dates are {Math.round(Math.abs(m.buyer.date - m.supplier.date) / 86400000)} day(s) apart. The buyer reference looks like a delivery challan number.</p>
          <div className="pair-actions"><button className="primary" onClick={() => setDecisions(d => ({ ...d, probable: { ...d.probable, [m.key]: 'confirmed' } }))}>Confirm match</button><button onClick={() => setDecisions(d => ({ ...d, probable: { ...d.probable, [m.key]: 'rejected' } }))}>Not the same</button></div>
        </div>)}</div>}
    </div>
    <div className="panel"><div className="panel-head"><h3>Match register <em>({list.length})</em></h3>
      <div className="filters"><input placeholder="Search reference or ID" value={q} onChange={e => setQ(e.target.value)} /><select value={conf} onChange={e => setConf(e.target.value)}><option value="ALL">All confidence levels</option>{['Exact match', 'Strong match', 'Probable match', 'Manual match'].map(c => <option key={c}>{c}</option>)}</select></div></div>
      <Pager key={conf + q} rows={list} render={rows => <div className="table-wrap"><table className="lab-table"><thead><tr><th>Confidence</th><th>Type</th><th>Buyer ledger</th><th>Supplier statement</th><th>Matching key</th><th className="ar">Buyer</th><th className="ar">Supplier</th><th className="ar">Difference</th><th>Rule</th></tr></thead>
        <tbody>{rows.map(m => <tr key={m.key}><td><Chip tone={m.level === 1 ? 'tone-ok' : m.level === 2 ? 'tone-info' : 'tone-warn'}>{m.confidence}</Chip></td><td>{DOC_LABEL[m.buyer.docClass]}</td><td className="stack"><RecCell rec={m.buyer} /></td><td className="stack"><RecCell rec={m.supplier} /></td><td><code>{m.buyer.ref || '—'}</code></td><td className="ar">{inr(m.buyer.amount, 2)}</td><td className="ar">{inr(m.supplier.amount, 2)}</td><td className={'ar' + (Math.abs(m.diff) > 0.005 ? ' warn' : '')}>{Math.abs(m.diff) > 0.005 ? signed(m.diff, 2) : '—'}</td><td className="rule">{m.rule}</td></tr>)}</tbody></table></div>} />
    </div>
  </>;
}

function ExceptionsStep({ r, vf, selected, setSelected, edit, settings, setSettings, setDecisions, vName }: { r: R; vf: VF; selected: string; setSelected: (k: string) => void; edit: (k: string, e: ExceptionEdit) => void; settings: Settings; setSettings: (s: Settings) => void; setDecisions: React.Dispatch<React.SetStateAction<Decisions>>; vName: (id: string) => string }) {
  const [f, setF] = useState({ sev: 'ALL', nature: 'ALL', cat: 'ALL', status: 'ALL', q: '' });
  const list = vf(r.exceptions).filter(e => (f.sev === 'ALL' || e.severity === f.sev) && (f.nature === 'ALL' || e.nature === f.nature) && (f.cat === 'ALL' || e.category === f.cat) && (f.status === 'ALL' || (f.status === 'Unresolved' ? e.status !== 'Resolved' : e.status === f.status)) && (!f.q || `${e.id} ${e.refs.join(' ')} ${e.vendorName}`.toLowerCase().includes(f.q.toLowerCase())));
  const sel = r.exceptions.find(e => e.key === selected);
  const cats = CATEGORIES.filter(c => r.exceptions.some(e => e.category === c));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const resolved = vf(r.exceptions).filter(e => e.status === 'Resolved').length;
  return <>
    <div className="panel"><div className="panel-head"><h3>Exception register <em>({list.length} shown · {resolved} resolved)</em></h3>
      <div className="filters"><input placeholder="Search ID, reference, supplier" value={f.q} onChange={set('q')} />
        <select value={f.sev} onChange={set('sev')}><option value="ALL">All severities</option>{SEVS.map(s => <option key={s}>{s}</option>)}</select>
        <select value={f.nature} onChange={set('nature')}><option value="ALL">All types</option>{NATURES.map(s => <option key={s}>{s}</option>)}</select>
        <select value={f.cat} onChange={set('cat')}><option value="ALL">All categories</option>{cats.map(s => <option key={s}>{s}</option>)}</select>
        <select value={f.status} onChange={set('status')}><option value="ALL">All statuses</option><option>Unresolved</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div></div>
      <div className={'ex-layout' + (sel ? ' with-detail' : '')}>
        <Pager key={JSON.stringify(f)} rows={list} size={14} render={rows => <div className="table-wrap"><table className="lab-table"><thead><tr><th>ID</th><th>Severity</th><th>Category</th><th>Supplier</th><th className="ar">Effect on variance</th><th className="ar">Impact</th><th className="ar">Age</th><th>Status</th></tr></thead>
          <tbody>{rows.map(e => <tr key={e.key} className={'clickable' + (e.key === selected ? ' sel' : '')} onClick={() => setSelected(e.key)}><td><b>{e.id}</b></td><td><Sev s={e.severity} /></td><td>{e.category}<small className="sub"><Chip tone={natureTone(e.nature)}>{e.nature}</Chip> {e.subtype}</small></td><td>{e.vendorId}</td><td className="ar">{e.balanceEffect ? signed(e.balanceEffect) : '—'}</td><td className="ar">{inr(e.impact)}</td><td className="ar">{e.ageDays}d</td><td>{e.status}{e.resolution && <small className="sub">{e.resolution}</small>}</td></tr>)}</tbody></table></div>} />
        {sel && <ExceptionDetail key={sel.key} e={sel} r={r} edit={edit} close={() => setSelected('')} setDecisions={setDecisions} vName={vName} />}
      </div>
    </div>
    <div className="panel"><h3>Severity rules</h3>
      <p className="hint">Severity is set by fixed, editable rules on the potential impact, then adjusted by type: duplicates are at least High; timing differences are at most Medium; data quality issues, partial payments and pending matches are Low.</p>
      <div className="settings-row">{(['critical', 'high', 'medium'] as const).map(k => <label className="setting" key={k}>{k[0].toUpperCase() + k.slice(1)} from<span>₹<input type="number" min={0} step={5000} value={settings[k]} onChange={e => setSettings({ ...settings, [k]: Math.max(0, Number(e.target.value) || 0) })} /></span></label>)}</div>
    </div>
  </>;
}

function ExceptionDetail({ e, r, edit, close, setDecisions, vName }: { e: Exception; r: R; edit: (k: string, x: ExceptionEdit) => void; close: () => void; setDecisions: React.Dispatch<React.SetStateAction<Decisions>>; vName: (id: string) => string }) {
  const unmatched = e.records.filter(x => (x.side === 'buyer' ? r.unmatchedBuyer : r.unmatchedSupplier).some(u => u.id === x.id));
  const one = unmatched.length === 1 && e.records.length === 1 ? unmatched[0] : null;
  const counterparts = one ? (one.side === 'buyer' ? r.unmatchedSupplier : r.unmatchedBuyer).filter(c => c.vendorId === one.vendorId && c.currency === one.currency && c.docClass === one.docClass) : [];
  const [cp, setCp] = useState('');
  return <aside className="ex-detail" aria-label={`Exception ${e.id}`}>
    <div className="ex-detail-head"><div><b>{e.id}</b> <Sev s={e.severity} /> <Chip tone={natureTone(e.nature)}>{e.nature}</Chip><h4>{e.category}</h4><p>{e.vendorId} · {vName(e.vendorId)} · {e.subtype}</p></div><button className="lab-link" onClick={close} aria-label="Close detail">✕</button></div>
    <dl className="ex-figs"><div><dt>Buyer amount</dt><dd>{inr(e.buyerAmount, 2)}</dd></div><div><dt>Supplier amount</dt><dd>{inr(e.supplierAmount, 2)}</dd></div><div><dt>Potential impact</dt><dd>{inr(e.impact, 2)}</dd></div><div><dt>Effect on variance</dt><dd>{e.balanceEffect ? signed(e.balanceEffect, 2) : 'None'}</dd></div><div><dt>Age</dt><dd>{e.ageDays} days</dd></div></dl>
    <h5>Source records</h5>
    <div className="table-wrap"><table className="lab-table small"><thead><tr><th>Side</th><th>Record</th><th>Reference</th><th>Date</th><th className="ar">Amount</th><th>PO / GRN</th></tr></thead>
      <tbody>{e.records.map(x => <tr key={x.id}><td>{x.side === 'buyer' ? 'Ledger' : 'Statement'}</td><td>{x.id}</td><td>{x.rawRef}</td><td>{fmtDate(x.date)}</td><td className="ar">{inr(x.amount, 2)}</td><td>{[x.po, x.grn].filter(Boolean).join(' / ') || '—'}</td></tr>)}</tbody></table></div>
    <h5>Recommended investigation</h5><p className="advice">{e.recommendation}</p>
    <h5>Evidence</h5><ul className="evidence">{e.evidence.map(x => <li key={x}>{x}</li>)}</ul>
    {one && counterparts.length > 0 && <><h5>Match manually</h5><div className="manual"><select value={cp} onChange={ev => setCp(ev.target.value)}><option value="">Pick a {one.side === 'buyer' ? 'supplier' : 'buyer'} record from {one.vendorId}…</option>{counterparts.map(c => <option key={c.id} value={c.id}>{c.rawRef || c.id} · {fmtDate(c.date)} · {inr(c.amount, 2)}</option>)}</select>
      <button disabled={!cp} onClick={() => { setDecisions(d => ({ ...d, manual: [...d.manual, one.side === 'buyer' ? { buyerId: one.id, supplierId: cp } : { buyerId: cp, supplierId: one.id }] })); close(); }}>Pair records</button></div><p className="hint">One-to-one only, same supplier and currency. The pair is recorded as a Manual match.</p></>}
    <h5>Workflow</h5>
    <div className="workflow">
      <label>Owner<select value={e.owner} onChange={ev => edit(e.key, { owner: ev.target.value })}>{OWNERS.map(o => <option key={o}>{o}</option>)}</select></label>
      <label>Status<select value={e.status} onChange={ev => edit(e.key, { status: ev.target.value as Status })}>{STATUSES.map(o => <option key={o}>{o}</option>)}</select></label>
      <label className="wide">Resolution<select value={e.resolution} onChange={ev => { const v = ev.target.value as Resolution; edit(e.key, { resolution: v, status: v ? 'Resolved' : e.status === 'Resolved' ? 'Open' : e.status }); }}>{RESOLUTIONS.map(o => <option key={o} value={o}>{o || 'Not resolved'}</option>)}</select></label>
      <label className="wide">Notes<textarea rows={3} value={e.notes} placeholder="What was checked, who was contacted, what was agreed" onChange={ev => edit(e.key, { notes: ev.target.value })} /></label>
    </div>
  </aside>;
}

function BridgeStep({ r, vendor, vf, openException, vName }: { r: R; vendor: string; vf: VF; openException: (k: string) => void; vName: (id: string) => string }) {
  const [open, setOpen] = useState<string>('');
  const items = vf(r.bridge);
  const vs = vf(r.vendors);
  const b = vs.reduce((s, v) => s + v.buyerBalance, 0), s = vs.reduce((t, v) => t + v.supplierBalance, 0);
  const total = items.reduce((t, x) => t + x.amount, 0);
  const timing = items.filter(x => x.bucket === 'Timing differences').reduce((t, x) => t + x.amount, 0);
  const adj = items.filter(x => x.bucket === 'Confirmed adjustments').reduce((t, x) => t + x.amount, 0);
  return <>
    <p className="sign-note"><b>Sign convention.</b> Each line shows its contribution to buyer balance − supplier balance. A line in the buyer ledger only adds its amount; a line on the supplier statement only subtracts it. Matched records with equal amounts contribute nothing.</p>
    <div className="panel bridge"><h3>Reconciliation bridge {vendor !== 'ALL' && <em>· {vendor} {vName(vendor)}</em>}</h3>
      <div className="bridge-row total"><span>Buyer ledger balance (Meridian AP)</span><b>{inr(b, 2)}</b></div>
      <div className="bridge-row minus"><span>less: Supplier statement balance</span><b>{inr(-s, 2)}</b></div>
      <div className="bridge-row total strong"><span>Reconciliation variance to explain</span><b>{signed(b - s, 2)}</b></div>
      <p className="bridge-sub">Explained by:</p>
      {BUCKETS.map(k => { const xs = items.filter(x => x.bucket === k); if (!xs.length) return null; const sum = xs.reduce((t, x) => t + x.amount, 0); const isOpen = open === k;
        return <div key={k} className="bucket"><button className="bridge-row" onClick={() => setOpen(isOpen ? '' : k)} aria-expanded={isOpen}><span>{isOpen ? '▾' : '▸'} {k} <em>({xs.length})</em></span><b>{signed(sum, 2)}</b></button>
          {isOpen && <div className="table-wrap"><table className="lab-table small"><thead><tr><th>Line</th><th>Supplier</th><th>What</th><th>Effect</th><th>Status</th><th className="ar">Amount</th></tr></thead><tbody>{xs.map(x => <tr key={x.id}><td>{x.id}<small className="sub">{x.refs.join(', ')}</small></td><td>{x.vendorId}</td><td>{x.description}</td><td>{x.effect}</td><td>{x.exceptionKey ? <button className="lab-link" onClick={() => openException(x.exceptionKey)}>{r.exceptions.find(e => e.key === x.exceptionKey)?.id} · {x.nature}</button> : x.nature}</td><td className="ar">{signed(x.amount, 2)}</td></tr>)}</tbody></table></div>}</div>; })}
      <div className="bridge-row total strong"><span>Total explained</span><b>{signed(total, 2)}</b></div>
      <div className={'bridge-row check ' + (Math.abs(total - (b - s)) < 0.01 ? 'ok' : 'bad')}><span>Unexplained remainder</span><b>{inr(total - (b - s), 2)}</b></div>
      <div className="bridge-split"><div><span>Timing differences</span><b>{signed(timing)}</b></div><div><span>Confirmed adjustments</span><b>{signed(adj)}</b></div><div><span>Unresolved differences</span><b>{signed(total - timing - adj)}</b></div></div>
    </div>
  </>;
}

function ReportsStep({ r, data, vendor, vName }: { r: R; data: Dataset[]; vendor: string; vName: (id: string) => string }) {
  const ex = r.exceptions.filter(e => vendor === 'ALL' || e.vendorId === vendor);
  const open = ex.filter(e => e.status !== 'Resolved');
  const top = [...r.vendors].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))[0];
  const timing = r.bridge.filter(b => b.bucket === 'Timing differences').reduce((t, b) => t + b.amount, 0);
  const cats: Record<string, number> = {}; open.forEach(e => { cats[e.category] = (cats[e.category] ?? 0) + e.impact; });
  const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const files: { name: string; desc: string; make: () => string }[] = [
    { name: 'exceptions-register.csv', desc: 'Every exception with severity, owner, status, notes and recommended investigation.', make: () => toCSV(ex.map(e => ({ 'Exception ID': e.id, 'Vendor ID': e.vendorId, 'Vendor': e.vendorName, 'Category': e.category, 'Type': e.nature, 'Detail': e.subtype, 'References': e.refs.join(' | '), 'Buyer amount': e.buyerAmount ?? '', 'Supplier amount': e.supplierAmount ?? '', 'Variance': e.variance, 'Effect on variance': e.balanceEffect, 'Potential impact': e.impact, 'Age (days)': e.ageDays, 'Severity': e.severity, 'Status': e.status, 'Owner': e.owner, 'Resolution': e.resolution, 'Notes': e.notes, 'Recommended investigation': e.recommendation, 'Evidence': e.evidence.join(' | ') }))) },
    { name: 'reconciliation-bridge.csv', desc: 'Line-by-line bridge from buyer balance to supplier balance, with source records.', make: () => toCSV(r.bridge.filter(b => vendor === 'ALL' || b.vendorId === vendor).map(b => ({ 'Line': b.id, 'Vendor ID': b.vendorId, 'Bucket': b.bucket, 'Description': b.description, 'Effect': b.effect, 'Contribution to buyer − supplier': b.amount, 'Status': b.nature, 'Source records': b.refs.join(' | '), 'Exception': r.exceptions.find(e => e.key === b.exceptionKey)?.id ?? '' }))) },
    { name: 'match-register.csv', desc: 'Every matched pair with its rule, confidence and timestamp.', make: () => toCSV(r.matches.filter(m => vendor === 'ALL' || m.buyer.vendorId === vendor).map(m => ({ 'Vendor ID': m.buyer.vendorId, 'Confidence': m.confidence, 'Rule': m.rule, 'Status': m.status === 'auto' ? 'Automatic' : 'Confirmed by reviewer', 'Buyer record': m.buyer.id, 'Buyer reference': m.buyer.rawRef, 'Supplier record': m.supplier.id, 'Supplier reference': m.supplier.rawRef, 'Buyer amount': m.buyer.amount, 'Supplier amount': m.supplier.amount, 'Difference': m.diff, 'Matched at': m.timestamp }))) },
    { name: 'vendor-summary.csv', desc: 'Balances, variance, match rate and open exposure per supplier.', make: () => toCSV(r.vendors.map(v => ({ 'Vendor ID': v.vendorId, 'Vendor': v.name, 'Buyer balance': v.buyerBalance, 'Supplier balance': v.supplierBalance, 'Variance (buyer − supplier)': v.variance, 'Matched pairs': v.matched, 'Open exceptions': v.openExceptions, 'Open exposure': v.exposure }))) },
    { name: 'data-quality-report.csv', desc: 'Records received, accepted and rejected per input, with rejection reasons.', make: () => toCSV([...r.normalized.quality.map(q => ({ 'Input': q.dataset, 'Record': '', 'Received': q.received, 'Accepted': q.accepted, 'Rejected': q.rejected, 'Duplicates': q.duplicates, 'Missing fields': q.missing, 'Invalid dates': q.invalidDates, 'Invalid amounts': q.invalidAmounts, 'Normalised values': q.changes, 'Reason': '' })), ...r.normalized.rejections.map(j => ({ 'Input': j.dataset, 'Record': j.recordId, 'Received': '', 'Accepted': '', 'Rejected': '', 'Duplicates': '', 'Missing fields': '', 'Invalid dates': '', 'Invalid amounts': '', 'Normalised values': '', 'Reason': j.reasons.join('; ') }))]) },
  ];
  return <>
    <div className="panel summary"><h3>Reconciliation summary {vendor !== 'ALL' && <em>· {vendor} {vName(vendor)}</em>}</h3>
      <p>At {fmtDate(r.periodEnd)}, Meridian's AP ledger shows <b>{inr(r.buyerBalance)}</b> payable to {r.vendors.length} suppliers, against <b>{inr(r.supplierBalance)}</b> on their statements: a variance of <b>{signed(r.variance)}</b> (buyer − supplier). {r.variance < 0 ? 'Suppliers report more than Meridian has recorded.' : 'Meridian has recorded more than suppliers report.'}</p>
      <p>{r.matches.length} pairs were matched automatically or by review. {r.exceptions.length} exceptions were raised, of which <b>{open.length} remain open</b>; {inr(timing)} of the variance is timing differences that should clear next period. The largest single-supplier gap is {top.vendorId} {top.name} at {signed(top.variance)}.</p>
      {topCats.length > 0 && <p>The biggest open exposure sits in: {topCats.map(([c, v], i) => <React.Fragment key={c}>{i ? '; ' : ''}<b>{c.toLowerCase()}</b> ({inr(v)})</React.Fragment>)}.</p>}
      <p className="hint">Generated from the numbers with fixed wording rules. No AI wrote or calculated any part of this summary.</p>
    </div>
    <div className="panel"><h3>Downloads</h3>
      <ul className="downloads">{files.map(f => <li key={f.name}><div><b>{f.name}</b><span>{f.desc}</span></div><button onClick={() => download(f.name, f.make())}>Download CSV</button></li>)}
        <li><div><b>Synthetic input files</b><span>The five generated inputs, to inspect or to use as an import template.</span></div><button onClick={() => data.forEach(d => download(`${d.key}-synthetic.csv`, toCSV(d.rows)))}>Download 5 CSVs</button></li></ul>
    </div>
    <div className="panel method"><h3>Methodology</h3><ol>
      <li><b>Normalise.</b> Trim text, standardise dates to DD-MMM-YYYY, strip ₹ symbols and commas, resolve supplier names through the alias table, and derive a matching key from each document number. Original values are kept.</li>
      <li><b>Balances.</b> Buyer balance = sum of AP postings (credits for invoices and opening balance, debits for payments, credit notes and debit notes). Supplier balance = statement debits − credits.</li>
      <li><b>Match.</b> Level 1 exact → Level 2 normalised or alias → Level 3 probable (needs confirmation) → manual. One-to-one, same vendor and currency only.</li>
      <li><b>Validate.</b> Level 4 checks invoices against PO rate and approved amount, GRN accepted quantity and value. Level 5 checks the payment register for duplicates and part-payments, and payments by UTR across both sides.</li>
      <li><b>Classify.</b> Each difference gets a category, a type (confirmed, exposure, timing, data quality, information gap) and a rule-based severity.</li>
      <li><b>Bridge.</b> Every accepted record sits in exactly one place: a matched pair (contributes buyer − supplier) or unmatched (buyer-only adds, supplier-only subtracts). So the bridge always equals the variance, with no double counting.</li>
    </ol><p className="hint">Sign convention: variance = buyer payable balance − supplier reported receivable balance. Positive means Meridian records a higher payable than the supplier reports.</p></div>
  </>;
}
