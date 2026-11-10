import React, { useMemo, useState } from 'react';
import { gate, previewFile, importFile, approveOpening, runStage, stageAvailable, decideCandidate, reverseMatch, manualMatch, closedTxnIds, openPool, STAGES, TYPE_LABEL, LEDGER_COLUMNS, fmtDay, r2, type LedgerFile, type MatchRec, type Txn, type StageId, type Side, type SideCheck, type RelState } from './cycle';
import { filesFor } from './store';
import { tagLabel } from './ledger';
import { parseCSV } from './csv';
import { toCSV } from './engine';
import { Card, DataTable, Drawer, Icon, Pill, money, signedMoney, download, type Col } from './ui';
import { PageHead, type Ctx, type Screen } from './App';
import Dashboard from './Dashboard';

type Cat = 'invdn' | 'cn' | 'pay' | 'tds' | 'paytds' | 'contra' | 'other';
const CATS: { id: Cat; label: string }[] = [{ id: 'invdn', label: 'Invoices & debit notes' }, { id: 'cn', label: 'Credit notes' }, { id: 'pay', label: 'Payments' }, { id: 'tds', label: 'TDS' }, { id: 'paytds', label: 'Payment + TDS' }, { id: 'contra', label: 'Contra' }, { id: 'other', label: 'Reviewed / manual' }];
const catOf = (mm: MatchRec): Cat => mm.kind === 'contra' ? 'contra' : (['invdn', 'cn', 'pay', 'tds', 'paytds'] as string[]).includes(mm.stage) ? mm.stage as Cat : 'other';
interface Row { key: string; mm?: MatchRec; cat: Cat | 'open'; B: Txn[]; V: Txn[]; tag: string; diff: number; suggested: boolean }
const pkey = (t: string) => t.slice(3) + t.slice(1, 3);
const sum = (x: Txn[]) => r2(x.reduce((s, t) => s + t.amount, 0));

export default function Reconcile({ ctx }: { ctx: Ctx }) {
  const { st, tag, run, user, at, go } = ctx;
  const p = st.periods.find(x => x.tag === tag)!; const cur = st.rel.currency;
  const [cat, setCat] = useState<Cat | 'open' | 'all'>('all'); const [q, setQ] = useState(''); const [limit, setLimit] = useState(40);
  const [sel, setSel] = useState<string[]>([]); const [grouping, setGrouping] = useState(false); const [rev, setRev] = useState<MatchRec | null>(null); const [reason, setReason] = useState('');
  const lockedP = p.phase !== 'working'; const approver = ctx.approver;
  const pending = st.candidates.filter(c => c.status === 'pending' && c.periodTag === tag);
  const stageName = (mm: MatchRec) => mm.kind === 'contra' ? 'Contra' : STAGES.find(s => s.id === mm.stage)?.label ?? 'Manual';

  const rows = useMemo(() => {
    const pop = new Set(st.txns.filter(t => t.importedIn === tag || p.carriedIn.includes(t.id)).map(t => t.id)); const byId = new Map(st.txns.map(t => [t.id, t])); const closed = closedTxnIds(st);
    const sugg = new Set(pending.flatMap(c => [...c.buyerIds, ...c.vendorIds])); const out: Row[] = []; const seen = new Set<string>();
    const oldest = (x: Txn[]) => x.map(t => t.originTag).sort((a, b) => pkey(a).localeCompare(pkey(b)))[0] ?? tag;
    st.matches.filter(mm => !mm.reversed && mm.kind !== 'adjustment').forEach(mm => {
      const ids = [...mm.buyerIds, ...mm.vendorIds]; if (!ids.some(i => pop.has(i))) return; ids.forEach(i => seen.add(i));
      const B = mm.buyerIds.map(i => byId.get(i)!).filter(Boolean), V = mm.vendorIds.map(i => byId.get(i)!).filter(Boolean);
      out.push({ key: mm.id, mm, cat: catOf(mm), B, V, tag: oldest([...B, ...V]), diff: r2(sum(B) - sum(V)), suggested: false });
    });
    st.txns.filter(t => pop.has(t.id) && !seen.has(t.id) && !closed.has(t.id)).forEach(t => out.push({ key: t.id, cat: 'open', B: t.side === 'B' ? [t] : [], V: t.side === 'V' ? [t] : [], tag: t.originTag, diff: t.side === 'B' ? t.amount : -t.amount, suggested: sugg.has(t.id) }));
    return out.sort((a, b) => pkey(a.tag).localeCompare(pkey(b.tag)) || (a.cat === 'open' ? 1 : 0) - (b.cat === 'open' ? 1 : 0) || (a.B[0] ?? a.V[0]).date - (b.B[0] ?? b.V[0]).date);
  }, [st, tag]);

  const stat = (c: Cat | 'open') => { const r = rows.filter(x => x.cat === c); return { n: r.length, b: r.reduce((s, x) => s + x.B.length, 0), v: r.reduce((s, x) => s + x.V.length, 0) }; };
  const shown = rows.filter(r => (cat === 'all' || r.cat === cat) && (!q || [...r.B, ...r.V].some(t => `${t.docNo} ${t.ref} ${t.against}`.toLowerCase().includes(q.toLowerCase()))));
  const selTx = rows.filter(r => sel.includes(r.key)).flatMap(r => [...r.B, ...r.V]);
  const ref = (t: Txn) => t.ref || (t.against ? `Against ${t.against}` : '—');
  const cells = (items: Txn[], r: Row) => {
    const col = (f: (t: Txn) => React.ReactNode, cls = '') => <td className={cls}>{items.length ? items.map(t => <div key={t.id} className="rx-ln">{f(t)}</div>) : <span className="rx-muted">—</span>}</td>;
    return <>{col(t => <b>{t.docNo || t.ref}</b>, 'sep')}{col(t => TYPE_LABEL[t.type])}{col(t => fmtDay(t.date))}{col(t => <b>{signedMoney(t.amount, cur)}</b>, 'ar')}{col(ref)}{col(t => <small>{t.kind === 'period' ? 'Period ledger' : t.kind === 'backdated' ? 'Back-dated' : 'Historical'} · {t.line}</small>)}
      {col(() => r.mm ? <Pill tone="green">Matched</Pill> : r.suggested ? <Pill tone="violet">Suggested</Pill> : <Pill tone="amber">Open</Pill>)}</>;
  };
  const exportCsv = () => download(`${st.rel.id}_${tag}_transactions.csv`, toCSV(shown.map(r => ({ 'Open period': tagLabel(r.tag), Status: r.mm ? `Matched · ${stageName(r.mm)}` : 'Open', 'Buyer documents': r.B.map(t => t.docNo || t.ref).join(' | '), 'Buyer amount': r.B.length ? sum(r.B) : '', 'Vendor documents': r.V.map(t => t.docNo || t.ref).join(' | '), 'Vendor amount': r.V.length ? sum(r.V) : '', 'Difference (buyer − vendor)': r.diff }))));
  const toggle = (k: string) => setSel(sel.includes(k) ? sel.filter(x => x !== k) : [...sel, k]);
  const card = (id: Cat | 'open', label: string) => { const s = stat(id); return <button key={id} type="button" className={'rx-cue' + (cat === id ? ' on' : '') + (id === 'open' ? ' open' : '')} onClick={() => setCat(cat === id ? 'all' : id)} aria-pressed={cat === id}>
    <b>{s.n}</b><span>{label}</span><i>{id === 'open' ? 'items still open' : 'matched'}</i>
    <span className="rx-cue-tip" role="tooltip">{label}: {s.n}<br />Buyer items {s.b} · Vendor items {s.v}</span></button>; };

  return <>
    <PageHead title="Reconciled transactions" actions={<><button className="rw-btn" onClick={() => go('open')}>Unreconciled transactions</button><button className="rw-btn lime" onClick={() => go('statement')}>Reconciliation statement →</button></>}>
      Every buyer and vendor item for {tagLabel(tag)}, including what was carried in, in one table. Items matched with each other sit on the same row.
    </PageHead>
    {p.phase === 'closed' && <p className="rw-note">This period is closed. Figures here reflect the latest state of the relationship; the statement exactly as signed is on the Reconciliation Statement tab.</p>}
    {lockedP && p.phase !== 'closed' && <p className="rw-note warn">The statement for this period is {p.phase}. Matching is locked; an approver can reopen it from the Reconciliation Statement tab, which creates version {p.version + 1}.</p>}
    {!p.stages.other && <p className="rw-note warn">Matching has not run for {tagLabel(tag)} yet. It starts automatically once both ledgers are in and the opening check passes. <button className="rw-link" onClick={() => go('upload')}>See Vendor ledger upload</button></p>}

    <div className="rx-cues" aria-label="Matched by type. Click to filter the table.">{CATS.filter(c => stat(c.id).n > 0).map(c => card(c.id, c.label))}{card('open', 'Open')}</div>

    {pending.length > 0 && <Card title={`Suggested matches · ${pending.length} to review`} tip="Probable matches the platform will not close on its own. Confirm only when the two sides are the same transaction.">
      {pending.map(c => { const tx = st.txns.filter(t => [...c.buyerIds, ...c.vendorIds].includes(t.id));
        return <div key={c.id} className="rx-cand"><div className="rx-cand-h"><b>{c.kind === 'contra' ? 'Possible contra' : 'Suggested match'}</b><span className="rx-score">{c.score}</span><small>{c.reasons.join(' · ')}</small></div>
          <div className="rx-cand-tx">{tx.map(t => <div key={t.id}><span className="side">{t.side === 'B' ? 'Buyer' : 'Vendor'}</span><b>{t.docNo || t.ref}</b><small>{TYPE_LABEL[t.type]} · {fmtDay(t.date)} · {tagLabel(t.originTag)}</small><b className="amt">{signedMoney(t.amount, cur)}</b></div>)}</div>
          <div className="rd-btns"><button className="rw-btn small lime" disabled={lockedP} onClick={() => run(s0 => decideCandidate(s0, c.id, true, user.name, at()), 'Confirmed by reviewer')}>Confirm</button><button className="rw-btn small" disabled={lockedP} onClick={() => run(s0 => decideCandidate(s0, c.id, false, user.name, at()), 'Rejected; items stay open')}>Reject</button></div></div>; })}
    </Card>}

    <Card title={`Transactions · ${shown.length}${shown.length !== rows.length ? ` of ${rows.length}` : ''}`} actions={<><input className="rx-q" value={q} onChange={e => { setQ(e.target.value); setLimit(40); }} placeholder="Search document or reference" aria-label="Search" />{cat !== 'all' && <button className="rw-btn small ghost" onClick={() => setCat('all')}>Clear filter</button>}<button className="rw-btn small" onClick={exportCsv}><Icon n="download" /> CSV</button></>}>
      {sel.length > 0 && <div className="rw-bulk">{sel.length} open row(s) selected · net {signedMoney(r2(selTx.filter(t => t.side === 'B').reduce((s, t) => s + t.amount, 0) - selTx.filter(t => t.side === 'V').reduce((s, t) => s + t.amount, 0)), cur)}<button className="rw-btn small lime" disabled={lockedP} onClick={() => setGrouping(true)}>Match selected</button><button className="rw-btn small ghost" onClick={() => setSel([])}>Clear</button></div>}
      <div className="rw-table-wrap"><table className="rw-table compact rx-rec">
        <thead><tr><th rowSpan={2}><span className="sr-only">Select</span></th><th rowSpan={2}>Open period</th><th colSpan={7} className="grp sep">Buyer items</th><th colSpan={7} className="grp sep">Vendor items</th><th rowSpan={2} className="ar sep">Difference<br /><small>buyer − vendor</small></th><th rowSpan={2}><span className="sr-only">Actions</span></th></tr>
          <tr>{['Document no.', 'Type', 'Date', 'Amount', 'Reference', 'Source', 'Status', 'Document no.', 'Type', 'Date', 'Amount', 'Reference', 'Source', 'Status'].map((h, i) => <th key={i} className={(i === 0 || i === 7 ? 'sep ' : '') + (h === 'Amount' ? 'ar' : '')}>{h}</th>)}</tr></thead>
        <tbody>{shown.slice(0, limit).map(r => <tr key={r.key} className={r.mm ? 'matched' : ''}>
          <td>{!r.mm && <input type="checkbox" aria-label="Select row" checked={sel.includes(r.key)} onChange={() => toggle(r.key)} />}</td>
          <td><span className={'rx-tag' + (r.tag !== tag ? ' old' : '')}>{tagLabel(r.tag)}</span>{r.mm && <small className="rx-sub">{stageName(r.mm)}</small>}</td>
          {cells(r.B, r)}{cells(r.V, r)}
          <td className="ar sep">{Math.abs(r.diff) < 0.005 ? <span className="rw-ok">0.00</span> : <b className="rw-neg">{signedMoney(r.diff, cur)}</b>}</td>
          <td>{r.mm && <button className="rw-link" disabled={lockedP} onClick={() => { setRev(r.mm!); setReason(''); }}>Reverse</button>}</td></tr>)}
          {!shown.length && <tr><td colSpan={18} className="rx-muted">Nothing to show for this filter.</td></tr>}</tbody></table></div>
      {shown.length > limit && <div className="rd-btns"><button className="rw-btn small" onClick={() => setLimit(limit + 60)}>Show more ({shown.length - limit} left)</button></div>}
      <p className="rx-muted">Tick open rows to build a manual or grouped match. A group closes only when the signed amounts net to zero.</p>
    </Card>

    {grouping && <GroupDrawer ctx={ctx} txns={selTx} onClose={() => setGrouping(false)} onDone={() => { setSel([]); setGrouping(false); }} />}
    {rev && <Drawer title={`Reverse ${rev.id}`} sub={`${rev.rule} · ${stageName(rev)}`} onClose={() => setRev(null)}>
      <p className="rw-note">The items reopen with their original periods. The reversal is recorded with your name and reason.</p>
      <label className="rw-field"><span>Reason</span><textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why this should not have matched" /></label>
      <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={() => setRev(null)}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!reason.trim()} onClick={() => { if (run(s => reverseMatch(s, rev.id, tag, reason, user.name, at(), approver), `${rev.id} reversed; items reopened with their original periods`)) setRev(null); }}>Reverse match</button></div>
    </Drawer>}
  </>;
}

export function GateCard({ title, c, cur, note, actions }: { title: string; c: SideCheck; cur: string; note?: string; actions?: React.ReactNode }) {
  const m = (n: number | null) => money(n, cur);
  const tone = c.status === 'FAILED' ? 'bad' : c.status === 'PENDING' ? '' : 'ok';
  return <div className={'rx-gatecard ' + tone}><header><b>{title}</b><Pill tone={c.status === 'FAILED' ? 'red' : c.status === 'PENDING' ? 'grey' : c.status === 'APPROVED' ? 'violet' : 'green'}>{c.status}</Pill></header>
    {note ? <dl><div><dt>Opening per ledger</dt><dd>{m(c.opening)}</dd></div></dl>
      : <dl><div><dt>Previous closing</dt><dd>{m(c.prevClosing)}</dd></div>{c.backdated !== 0 && <div><dt>+ back-dated entries supplied</dt><dd>{m(c.backdated)}</dd></div>}<div><dt>Expected opening</dt><dd>{m(c.expected)}</dd></div><div><dt>Opening per ledger</dt><dd>{m(c.opening)}</dd></div><div className="k"><dt>Variance</dt><dd className={c.variance ? 'rw-neg' : ''}>{m(c.variance)}</dd></div></dl>}
    {c.adjustment && <p className="rx-muted">Approved by {c.adjustment.approvedBy}: “{c.adjustment.reason}” ({c.adjustment.evidence})</p>}
    {c.status === 'FAILED' && <p className="rx-muted">The opening does not continue from the last closing. Typical causes: entries back-dated into a closed period, opening adjustments, or an extraction error.</p>}
    {actions}</div>;
}

export function ImportDrawer({ ctx, file, onClose, onImport }: { ctx: Ctx; file: LedgerFile; onClose: () => void; onImport: (f: LedgerFile) => void }) {
  const { st, tag } = ctx; const pv = previewFile(st, file, tag); const cur = st.rel.currency;
  return <Drawer wide title="Preview import" sub={`${file.fileName} · ${file.source} · ${file.side === 'B' ? 'buyer' : 'vendor'} ${file.kind} file`} onClose={onClose}>
    <dl className="rw-dl four"><div><dt>Lines in file</dt><dd>{file.rows.length}</dd></div><div><dt>Will import</dt><dd>{pv.txns.length}</dd></div><div><dt>Rejected</dt><dd className={pv.rejected.length ? 'rw-neg' : ''}>{pv.rejected.length}</dd></div><div><dt>Already in reconciliation</dt><dd>{pv.duplicates.length}</dd></div></dl>
    {file.kind === 'period' && <dl className="rw-dl four"><div><dt>Opening per file</dt><dd>{money(file.opening, cur)}</dd></div><div><dt>+ lines imported</dt><dd>{money(pv.txns.reduce((s, t) => s + t.amount, 0), cur)}</dd></div><div><dt>Closing per file</dt><dd>{money(file.closing, cur)}</dd></div><div><dt>Integrity</dt><dd className={pv.integrity ? 'rw-neg' : 'rw-ok'}>{pv.integrity ? money(pv.integrity, cur) : '✓ agrees'}</dd></div></dl>}
    <div className="rd-types">{Object.entries(pv.byType).map(([k, n]) => <span key={k}><b>{n}</b> {k}</span>)}</div>
    {pv.warnings.map(w => <p key={w} className="rw-note warn">{w}</p>)}
    {pv.rejected.length > 0 && <ul className="rw-errs">{pv.rejected.map(r => <li key={r.line}>{r.line}: {r.reason}</li>)}</ul>}
    {pv.duplicates.length > 0 && <ul className="rw-errs">{pv.duplicates.map(r => <li key={r.line}>{r.line}: {r.reason}</li>)}</ul>}
    <h4 className="rw-h4">Normalised lines · source values kept alongside</h4>
    <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Line</th><th>Document (source)</th><th>Normalised key</th><th>Type</th><th>Date</th><th className="ar">Signed amount</th><th>Reference</th><th>Original period</th></tr></thead>
      <tbody>{pv.txns.slice(0, 40).map(t => <tr key={t.id}><td>{t.line}</td><td>{t.docNo}</td><td><code>{t.docNorm || '—'}</code></td><td>{TYPE_LABEL[t.type]}</td><td>{fmtDay(t.date)}</td><td className="ar">{signedMoney(t.amount, cur)}</td><td>{t.ref || t.against}</td><td><span className={'rx-tag' + (t.originTag !== tag ? ' old' : '')}>{t.originTag}</span></td></tr>)}</tbody></table></div>
    {pv.txns.length > 40 && <p className="rx-muted">…and {pv.txns.length - 40} more.</p>}
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!pv.txns.length || file.relId !== st.rel.id} onClick={() => onImport(file)}><Icon n="upload" /> Import {pv.txns.length} lines</button></div>
  </Drawer>;
}

export function ApproveDrawer({ ctx, side, kind, amount, onClose, after }: { ctx: Ctx; side: Side; kind: 'opening-continuity' | 'opening-position'; amount: number; onClose: () => void; after?: (st: RelState) => RelState }) {
  const { st, tag, run, user, at, approver } = ctx; const [reason, setReason] = useState(''); const [ev, setEv] = useState('');
  return <Drawer title="Approve an explained opening difference" sub={`${kind === 'opening-position' ? 'Opening position' : side === 'B' ? 'Buyer continuity' : 'Vendor continuity'} · ${money(amount, st.rel.currency)}`} onClose={onClose}>
    <p className="rw-note">This records an approved adjustment of {money(amount, st.rel.currency)} with your name, reason and evidence. It appears as a reconciling line on the statement for {tag}. Nothing in either ledger is changed.</p>
    {!approver && <p className="rw-note warn">You are signed in as a preparer. Switch to an approver to continue.</p>}
    <label className="rw-field"><span>Reason</span><textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="What caused the difference and who agreed it" /></label>
    <label className="rw-field"><span>Supporting document reference</span><input value={ev} onChange={e => setEv(e.target.value)} placeholder="e.g. Vendor email 12-Oct-2026, onboarding minutes" /></label>
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!approver || !reason.trim() || !ev.trim()} onClick={() => { if (run(s => { const r = approveOpening(s, tag, side, kind, reason, ev, user.name, at(), approver); return r.ok && after ? { ok: true, state: after(r.state) } : r; }, after ? 'Opening difference approved; reconciliation ran automatically' : 'Opening difference approved and recorded')) onClose(); }}>Approve</button></div>
  </Drawer>;
}

function GroupDrawer({ ctx, txns, onClose, onDone }: { ctx: Ctx; txns: Txn[]; onClose: () => void; onDone: () => void }) {
  const { st, tag, run, user, at } = ctx; const [reason, setReason] = useState(''); const cur = st.rel.currency;
  const b = txns.filter(t => t.side === 'B'), v = txns.filter(t => t.side === 'V'); const same = !b.length || !v.length;
  const net = same ? r2(txns.reduce((s, t) => s + t.amount, 0)) : r2(b.reduce((s, t) => s + t.amount, 0) - v.reduce((s, t) => s + t.amount, 0));
  return <Drawer title={same ? 'Manual contra' : `Grouped match · ${b.length}:${v.length}`} sub="Reviewer-built match. It closes only if the signed amounts net to zero." onClose={onClose}>
    <div className="rx-cand-tx">{txns.map(t => <div key={t.id}><span className="side">{t.side === 'B' ? 'Buyer' : 'Vendor'}</span><b>{t.docNo || t.ref}</b><small>{TYPE_LABEL[t.type]} · {fmtDay(t.date)} · {t.originTag}</small><b className="amt">{signedMoney(t.amount, cur)}</b></div>)}</div>
    <dl className="rw-dl"><div><dt>{same ? 'Net of selection' : 'Buyer − vendor'}</dt><dd className={Math.abs(net) < 0.005 ? 'rw-ok' : 'rw-neg'}>{Math.abs(net) < 0.005 ? '✓ 0.00' : signedMoney(net, cur)}</dd></div></dl>
    {Math.abs(net) >= 0.005 && <p className="rw-note warn">These do not net to zero, so they cannot be closed as a match. Leave them open, or propose an adjustment for the difference from Open items.</p>}
    <label className="rw-field"><span>Reason</span><textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why these belong together (e.g. vendor allocated one receipt across three invoices)" /></label>
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={Math.abs(net) >= 0.005 || !reason.trim()} onClick={() => { if (run(s => manualMatch(s, tag, txns.map(t => t.id), reason, user.name, at()), 'Manual match recorded')) onDone(); }}>Record match</button></div>
  </Drawer>;
}

export function UploadDrawer({ ctx, side, onClose, onReady }: { ctx: Ctx; side: Side; onClose: () => void; onReady: (f: LedgerFile) => void }) {
  const { st, tag } = ctx; const [err, setErr] = useState(''); const [open, setOpen] = useState(''); const [close, setClose] = useState(''); const [rows, setRows] = useState<Record<string, string>[] | null>(null); const [name, setName] = useState('');
  const take = async (f?: File) => { setErr(''); if (!f) return; if (!/\.csv$/i.test(f.name)) { setErr('Upload a .csv file. In Excel use File → Save As → CSV UTF-8.'); return; } const p = parseCSV(await f.text()); const miss = ['Line ID', 'Document No', 'Document Date', 'Type', 'Debit', 'Credit'].filter(c => !p.columns.includes(c)); if (miss.length) { setErr(`Missing columns: ${miss.join(', ')}. Download the template for the layout.`); return; } setRows(p.rows); setName(f.name); };
  const o = Number(open), c = Number(close);
  return <Drawer title={`Upload ${side === 'B' ? 'buyer' : 'vendor'} ledger`} sub={`For ${tag}. Use the ledger template; the opening and closing balances come from the ledger itself.`} onClose={onClose}>
    <button className="rw-link" onClick={() => download('ledger_template.csv', toCSV([Object.fromEntries(LEDGER_COLUMNS.map(k => [k, '']))]))}>Download the ledger template</button>
    <label className="rw-drop"><input type="file" accept=".csv,text/csv" onChange={e => take(e.target.files?.[0])} /><Icon n="upload" s={24} /><b>{name || 'Choose a CSV file'}</b><small>Columns: {LEDGER_COLUMNS.join(', ')}</small></label>
    {err && <p className="rw-err">{err}</p>}
    <div className="rw-row2"><label className="rw-field"><span>Opening balance per ledger</span><input inputMode="decimal" value={open} onChange={e => setOpen(e.target.value)} /></label><label className="rw-field"><span>Closing balance per ledger</span><input inputMode="decimal" value={close} onChange={e => setClose(e.target.value)} /></label></div>
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!rows || open === '' || close === '' || isNaN(o) || isNaN(c)} onClick={() => onReady({ id: `${st.rel.id}-${side}-${tag}-UP${Date.now()}`, relId: st.rel.id, side, periodTag: tag, kind: 'period', fileName: name, source: 'Uploaded by reviewer', availableAt: '', opening: o, closing: c, rows: rows! })}>Preview</button></div>
  </Drawer>;
}
