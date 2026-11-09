import React, { useMemo, useState } from 'react';
import { gate, previewFile, importFile, approveOpening, runStage, stageAvailable, decideCandidate, reverseMatch, manualMatch, closedTxnIds, openPool, STAGES, TYPE_LABEL, LEDGER_COLUMNS, fmtDay, r2, type LedgerFile, type Txn, type StageId, type Side, type SideCheck, type RelState } from './cycle';
import { filesFor } from './store';
import { tagLabel } from './ledger';
import { parseCSV } from './csv';
import { toCSV } from './engine';
import { Card, DataTable, Drawer, Icon, Pill, money, signedMoney, download, type Col } from './ui';
import { PageHead, type Ctx, type Screen } from './App';
import Dashboard from './Dashboard';

export default function Reconcile({ ctx }: { ctx: Ctx }) {
  const { st, tag, ws, settings, run, user, approver, at, go } = ctx;
  const idx = st.periods.findIndex(p => p.tag === tag); const p = st.periods[idx]; const prev = st.periods[idx - 1];
  const cur = st.rel.currency; const m = (n: number | null | undefined, dp = 2) => money(n, cur, dp);
  const g = gate(st, tag); const files = filesFor(ws, st.rel.id, tag);
  const [preview, setPreview] = useState<LedgerFile | null>(null);
  const [approve, setApprove] = useState<{ side: Side; kind: 'opening-continuity' | 'opening-position' } | null>(null);
  const [openStage, setOpenStage] = useState<StageId | ''>('');
  const [tab, setTab] = useState<'prevB' | 'prevV' | 'curB' | 'curV'>('curB');
  const [sel, setSel] = useState<string[]>([]); const [grouping, setGrouping] = useState(false);
  const [upload, setUpload] = useState<Side | null>(null);
  const lockedP = p.phase !== 'working';
  const stages = STAGES.filter(s => !s.optional || settings.stages[s.optional]);
  const pending = st.candidates.filter(c => c.status === 'pending' && c.periodTag === tag);
  const ran = (ids: StageId[]) => ids.every(i => p.stages[i]);
  const steps: { t: string; d: string; done: boolean; href: string; sub: Screen }[] = [
    { t: 'Period', d: `${p.tag} · ${p.type}`, done: true, href: 'rx-period', sub: 'upload' },
    { t: 'Carry forward', d: prev ? `${p.carriedIn.length} items in` : 'First period', done: true, href: 'rx-period', sub: 'upload' },
    { t: 'Buyer ledger', d: p.imports.B ? 'Imported' : 'Awaited', done: !!p.imports.B, href: 'rx-import', sub: 'upload' },
    { t: 'Vendor ledger', d: p.imports.V ? 'Imported' : 'Awaited', done: !!p.imports.V, href: 'rx-import', sub: 'upload' },
    { t: 'Opening check', d: g.passed ? 'Passed' : p.imports.B && p.imports.V ? 'Blocking' : 'Pending', done: g.passed && !!p.imports.V, href: 'rx-gate', sub: 'upload' },
    { t: 'Contra', d: ran(['contraB', 'contraV']) ? 'Both ledgers' : 'To run', done: ran(['contraB', 'contraV']), href: 'rx-bench', sub: 'matched' },
    { t: 'Matching', d: ran(stages.filter(s => !s.id.startsWith('contra') && s.id !== 'other').map(s => s.id)) ? 'Stages run' : 'To run', done: ran(stages.filter(s => !s.id.startsWith('contra') && s.id !== 'other').map(s => s.id)), href: 'rx-bench', sub: 'matched' },
    { t: 'Review', d: p.stages.other ? `${pending.length} to decide` : 'To run', done: !!p.stages.other && !pending.length, href: 'rx-bench', sub: 'matched' },
    { t: 'Statement', d: p.phase === 'working' ? 'Not prepared' : p.phase, done: p.phase !== 'working', href: '', sub: 'statement' },
    { t: 'Close', d: p.phase === 'closed' ? 'Closed' : 'Open', done: p.phase === 'closed', href: '', sub: 'statement' },
  ];
  const cur1 = steps.findIndex(s => !s.done);
  const doImport = (f: LedgerFile) => { if (run(s => importFile(s, f, tag, user.name, at()), `${f.fileName} imported`)) setPreview(null); };
  const runOne = (id: StageId) => run(s => runStage(s, tag, id, settings, user.name, at()), `${STAGES.find(x => x.id === id)!.label}: done`);
  const runAll = () => { let s0 = st; for (const s of stages) { if (p.stages[s.id]) continue; const r = runStage(s0, tag, s.id, settings, user.name, at()); if (!r.ok) { ctx.toast(r.error, 'warn'); break; } s0 = r.state; } if (s0 !== st) run(() => ({ ok: true, state: s0 }), 'All remaining stages run'); };

  const closed = closedTxnIds(st);
  const matchOf = useMemo(() => { const mm = new Map<string, string>(); st.matches.filter(x => !x.reversed).forEach(x => [...x.buyerIds, ...x.vendorIds].forEach(i => mm.set(i, `${x.id} · ${x.kind === 'contra' ? 'contra' : STAGES.find(s => s.id === x.stage)?.label ?? x.stage}`))); return mm; }, [st]);
  const openIds = new Set(openPool(st, tag).map(t => t.id));
  const pop: Record<typeof tab, Txn[]> = {
    prevB: st.txns.filter(t => t.side === 'B' && p.carriedIn.includes(t.id)), prevV: st.txns.filter(t => t.side === 'V' && p.carriedIn.includes(t.id)),
    curB: st.txns.filter(t => t.side === 'B' && t.importedIn === tag), curV: st.txns.filter(t => t.side === 'V' && t.importedIn === tag),
  };
  const tcols: Col<Txn>[] = [
    { key: 'doc', label: 'Document', text: t => `${t.docNo} ${t.ref}`, render: t => <span className="rw-stack"><b>{t.docNo || t.ref}</b><small>{t.ref && t.docNo ? `Ref ${t.ref}` : ''}{t.against ? ` · against ${t.against}` : ''}</small></span> },
    { key: 'date', label: 'Date', text: t => fmtDay(t.date), sort: t => t.date },
    { key: 'type', label: 'Type', text: t => TYPE_LABEL[t.type] },
    { key: 'amt', label: 'Signed amount', align: 'right', text: t => m(t.amount), sort: t => t.amount, render: t => <b>{signedMoney(t.amount, cur)}</b> },
    { key: 'tag', label: 'Original period', text: t => t.originTag, render: t => <span className={'rx-tag' + (t.originTag !== tag ? ' old' : '')}>{t.originTag}</span> },
    { key: 'src', label: 'Source', text: t => `${t.kind} ${t.line}`, render: t => <span className="rw-stack"><small>{t.kind === 'period' ? 'Period ledger' : t.kind === 'backdated' ? 'Back-dated entry' : 'Historical item'}</small><small>{t.line}</small></span> },
    { key: 'st', label: 'Status', text: t => closed.has(t.id) ? matchOf.get(t.id) ?? 'Matched' : 'Open', render: t => closed.has(t.id) ? <span className="rw-stack"><Pill tone="green">Matched</Pill><small>{matchOf.get(t.id)}</small></span> : <Pill tone="amber">Open</Pill> },
    { key: 'iss', label: 'Checks', hidden: true, text: t => t.issues.join('; ') },
  ];
  const selTx = st.txns.filter(t => sel.includes(t.id));

  return <>
    <PageHead title="Reconciled transactions" actions={<><button className="rw-btn" onClick={() => go('open')}>Unreconciled transactions</button><button className="rw-btn lime" onClick={() => go('statement')}>Reconciliation statement →</button></>}>
      Everything the platform matched for {tagLabel(tag)}, stage by stage, with the rule behind each match. Review suggested matches and reverse anything that should not have matched.
    </PageHead>
    {p.phase === 'closed' && <p className="rw-note">This period is closed. Figures here reflect the latest state of the relationship; the statement exactly as signed is on the Reconciliation Statement tab.</p>}
    {lockedP && p.phase !== 'closed' && <p className="rw-note warn">The statement for this period is {p.phase}. Matching is locked; an approver can reopen it from the Reconciliation Statement tab, which creates version {p.version + 1}.</p>}


    <Card title="How it was matched" tip="The platform ran these automatically, in a fixed order: contra inside each ledger first, then invoices and debit notes, credit notes, payments, TDS, payment + TDS, and finally candidates for review. A group closes only when its signed amounts agree exactly. Candidates never close without a reviewer."
>
      {!p.stages.other && <p className="rw-note warn">Matching has not run for {tag} yet. It starts automatically once both ledgers are in and the opening check passes. <button className="rw-link" onClick={() => go('upload')}>See Vendor ledger upload</button></p>}
      <div id="rx-bench" className="rx-bench">
        <div className="rx-bench-h"><span>#</span><span>Stage</span><span>Considered</span><span>Matched</span><span>Unmatched</span><span>Value matched</span><span>For review</span><span>Rejected</span></div>
        {stages.map((s, i) => { const x = p.stages[s.id]; const av = stageAvailable(st, tag, s.id, settings); const cs = st.candidates.filter(c => c.stage === s.id && c.periodTag === tag); const ms = st.matches.filter(mm => mm.stage === s.id && mm.periodTag === tag); const isOpen = openStage === s.id;
          return <div key={s.id} className={'rx-stage' + (x ? ' done' : '') + (isOpen ? ' open' : '')}>
            <div className="rx-stage-row" role="button" tabIndex={0} onClick={() => setOpenStage(isOpen ? '' : s.id)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenStage(isOpen ? '' : s.id); } }} aria-expanded={isOpen}>
              <span className="n">{x ? '✓' : i + 1}</span><span className="t"><b>{s.label}</b><small>{s.desc}</small></span>
              <span>{x?.considered ?? '—'}</span><span>{x ? x.matched : '—'}</span><span>{x ? Math.max(0, x.considered - x.matched) : '—'}</span><span>{x ? m(x.matchAmount, 0) : '—'}</span>
              <span>{cs.filter(c => c.status === 'pending').length || (x ? 0 : '—')}</span><span>{cs.filter(c => c.status === 'rejected').length || (x ? 0 : '—')}</span>
            </div>
            {isOpen && <div className="rx-stage-body">
              {!x && !av.ok && <p className="rw-note warn">{av.why}</p>}
              {cs.filter(c => c.status === 'pending').map(c => { const tx = st.txns.filter(t => [...c.buyerIds, ...c.vendorIds].includes(t.id));
                return <div key={c.id} className="rx-cand"><div className="rx-cand-h"><b>{c.kind === 'contra' ? 'Possible contra' : 'Suggested match'}</b><span className="rx-score">{c.score}</span><small>{c.reasons.join(' · ')}</small></div>
                  <div className="rx-cand-tx">{tx.map(t => <div key={t.id}><span className="side">{t.side === 'B' ? 'Buyer' : 'Vendor'}</span><b>{t.docNo || t.ref}</b><small>{TYPE_LABEL[t.type]} · {fmtDay(t.date)} · {t.originTag}</small><b className="amt">{signedMoney(t.amount, cur)}</b></div>)}</div>
                  <div className="rd-btns"><button className="rw-btn small lime" disabled={lockedP} onClick={() => run(s0 => decideCandidate(s0, c.id, true, user.name, at()), 'Confirmed by reviewer')}>Confirm</button><button className="rw-btn small" disabled={lockedP} onClick={() => run(s0 => decideCandidate(s0, c.id, false, user.name, at()), 'Rejected; items stay open')}>Reject</button></div></div>; })}
              {ms.length > 0 && <MatchList ctx={ctx} ids={ms.map(mm => mm.id)} />}
              {x && !ms.length && !cs.length && <p className="rx-muted">Nothing matched at this stage.</p>}
              {cs.filter(c => c.status !== 'pending').length > 0 && <p className="rx-muted">Decided: {cs.filter(c => c.status !== 'pending').map(c => `${c.id} ${c.status}${c.by ? ` by ${c.by}` : ''}`).join(' · ')}</p>}
            </div>}
          </div>; })}
      </div>
    </Card>

    <Card title="Transaction populations" tip="Four populations kept apart: what was carried in from earlier periods and what arrived this period, for each side. Select open items to build a manual or grouped match.">
      <div id="rx-pop" className="rw-tabs" role="tablist">{([['prevB', 'Previous buyer open items'], ['prevV', 'Previous vendor open items'], ['curB', 'Current buyer transactions'], ['curV', 'Current vendor transactions']] as const).map(([k, l]) =>
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<em>{pop[k].length}</em></button>)}</div>
      <DataTable key={tab} rows={pop[tab]} cols={tcols} rowKey={t => t.id} fileName={`${st.rel.id}_${tag}_${tab}.csv`} selectable selected={sel.filter(i => pop[tab].some(t => t.id === i))} onSelect={k => setSel([...sel.filter(i => !pop[tab].some(t => t.id === i)), ...k.filter(i => openIds.has(i))])}
        toolbar={sel.length > 0 && <span className="rw-bulk">{sel.length} selected · net {signedMoney(r2(selTx.filter(t => t.side === 'B').reduce((s, t) => s + t.amount, 0) - selTx.filter(t => t.side === 'V').reduce((s, t) => s + t.amount, 0)), cur)}<button className="rw-btn small lime" disabled={lockedP} onClick={() => setGrouping(true)}>Match selected</button><button className="rw-btn small ghost" onClick={() => setSel([])}>Clear</button></span>} empty="Nothing in this population." />
      <p className="rx-muted">Selections can span tabs (for example a carried buyer item and a current vendor item). Only open items can be selected.</p>
    </Card>

    {preview && <ImportDrawer ctx={ctx} file={preview} onClose={() => setPreview(null)} onImport={doImport} />}
    {approve && <ApproveDrawer ctx={ctx} side={approve.side} kind={approve.kind} amount={approve.kind === 'opening-position' ? g.position?.diff ?? 0 : g[approve.side].variance ?? 0} onClose={() => setApprove(null)} />}
    {grouping && <GroupDrawer ctx={ctx} txns={selTx} onClose={() => setGrouping(false)} onDone={() => { setSel([]); setGrouping(false); }} />}
    {upload && <UploadDrawer ctx={ctx} side={upload} onClose={() => setUpload(null)} onReady={f => { setUpload(null); setPreview(f); }} />}
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

function MatchList({ ctx, ids }: { ctx: Ctx; ids: string[] }) {
  const { st, tag, run, user, at, approver } = ctx; const [rev, setRev] = useState(''); const [reason, setReason] = useState('');
  const cur = st.rel.currency; const byId = new Map(st.txns.map(t => [t.id, t]));
  return <div className="rx-matches">{st.matches.filter(mm => ids.includes(mm.id)).map(mm => <div key={mm.id} className={'rx-match' + (mm.reversed ? ' rev' : '')}>
    <div className="rx-match-h"><b>{mm.id}</b><span className={'rd-rule ' + (mm.confidence === 'Exact' ? 'l1' : mm.confidence === 'Rule-based' ? 'l2' : mm.confidence === 'Probable' ? 'l3' : 'l0')}>{mm.confidence}</span><small>{mm.rule} · {mm.buyerIds.length}:{mm.vendorIds.length}{mm.dateDiff ? ` · ${mm.dateDiff}d apart` : ''} · {mm.engine}</small>
      {mm.reversed ? <Pill tone="red">Reversed</Pill> : <button className="rw-link" onClick={() => { setRev(rev === mm.id ? '' : mm.id); setReason(''); }}>Reverse</button>}</div>
    <p>{mm.explanation}</p>
    <div className="rx-match-tx">{[...mm.buyerIds, ...mm.vendorIds].map(i => byId.get(i)!).map(t => <span key={t.id}><i>{t.side}</i>{t.docNo || t.ref} <b>{signedMoney(t.amount, cur)}</b> <em className="rx-tag old">{t.originTag}</em></span>)}</div>
    {mm.reversed && <p className="rx-muted">Reversed by {mm.reversed.by} in {mm.reversed.periodTag}: {mm.reversed.reason}</p>}
    {rev === mm.id && !mm.reversed && <div className="rx-inline"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for reversing (required)" aria-label="Reason" /><button className="rw-btn small" disabled={!reason.trim()} onClick={() => { if (run(s => reverseMatch(s, mm.id, tag, reason, user.name, at(), approver), `${mm.id} reversed; items reopened with their original tags`)) setRev(''); }}>Reverse match</button></div>}
  </div>)}</div>;
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
