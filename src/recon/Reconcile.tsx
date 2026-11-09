import React, { useMemo, useState } from 'react';
import { gate, previewFile, importFile, approveOpening, runStage, stageAvailable, decideCandidate, reverseMatch, manualMatch, closedTxnIds, openPool, STAGES, TYPE_LABEL, LEDGER_COLUMNS, fmtDay, r2, type LedgerFile, type Txn, type StageId, type Side, type SideCheck } from './cycle';
import { filesFor } from './store';
import { tagLabel } from './ledger';
import { parseCSV } from './csv';
import { toCSV } from './engine';
import { Card, DataTable, Drawer, Icon, Pill, money, signedMoney, download, type Col } from './ui';
import { PageHead, type Ctx, type Screen } from './App';
import Dashboard from './Dashboard';

export default function Reconcile({ ctx, part }: { ctx: Ctx; part: 'upload' | 'matched' }) {
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
    {part === 'upload' ? <PageHead title="Vendor ledger upload" actions={<button className="rw-btn lime" onClick={() => go('matched')}>Reconciled transactions →</button>}>
      Bring in both ledgers for {tagLabel(tag)}, carry forward what is still open, and validate both openings. Matching cannot start until they pass.
    </PageHead> : <PageHead title="Reconciled transactions" actions={<><button className="rw-btn" onClick={() => go('open')}>Unreconciled transactions</button><button className="rw-btn lime" onClick={() => go('statement')}>Reconciliation statement →</button></>}>
      Matching for {tagLabel(tag)}, stage by stage: what closed, by which rule, and what is waiting for a reviewer.
    </PageHead>}
    {p.phase === 'closed' && <p className="rw-note">This period is closed. Figures here reflect the latest state of the relationship; the statement exactly as signed is on the Reconciliation Statement tab.</p>}
    {lockedP && p.phase !== 'closed' && <p className="rw-note warn">The statement for this period is {p.phase}. Matching is locked; an approver can reopen it from the Reconciliation Statement tab, which creates version {p.version + 1}.</p>}
    <ol className="rx-steps">{steps.map((s, i) => <li key={s.t} className={s.done ? 'done' : i === cur1 ? 'cur' : ''}><button onClick={() => s.sub !== part ? go(s.sub) : document.getElementById(s.href)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span>{s.done ? '✓' : i + 1}</span><b>{s.t}</b><small>{s.d}</small></button></li>)}</ol>

    {part === 'upload' && <>
    <Dashboard ctx={ctx} embedded />
    <div className="rx-grid2" id="rx-period">
      <Card title="Previous period" tip="Pulled automatically from the last closed period. Its closing balances become this period’s expected openings.">
        {prev ? <><dl className="rw-dl"><div><dt>Period</dt><dd><span className="rx-tag">{prev.tag}</span> {prev.phase === 'closed' ? `closed ${prev.dates.closed?.split(' ')[0]}` : prev.phase}</dd></div><div><dt>Buyer closing</dt><dd>{m(prev.closing.B)}</dd></div><div><dt>Vendor closing</dt><dd>{m(prev.closing.V)}</dd></div><div><dt>Difference at close</dt><dd>{m(r2((prev.closing.B ?? 0) - (prev.closing.V ?? 0)))}</dd></div></dl>
          <p className="rx-muted">A difference at the previous close is not an error in this period’s opening: it is the open-item position carried forward.</p></>
          : <p className="rw-note">First reconciliation for this relationship (new vendor). The opening position is established from the uploaded opening balances and any historical open items, and must be agreed or formally approved.</p>}
      </Card>
      <Card title="Carried forward into this period" tip="Unresolved items from the previous close. They keep their original period tag and investigation history.">
        <div className="rx-carry"><button onClick={() => go('matched')} title="See them under Reconciled transactions"><b>{pop.prevB.length}</b><span>Buyer-side open items</span><small>{m(pop.prevB.reduce((s, t) => s + t.amount, 0), 0)}</small></button>
          <button onClick={() => go('matched')} title="See them under Reconciled transactions"><b>{pop.prevV.length}</b><span>Vendor-side open items</span><small>{m(pop.prevV.reduce((s, t) => s + t.amount, 0), 0)}</small></button></div>
        {p.carriedIn.length > 0 && <p className="rx-muted">Originating periods: {[...new Set([...pop.prevB, ...pop.prevV].map(t => t.originTag))].sort().map(t => <span key={t} className="rx-tag old">{t}</span>)}</p>}
      </Card>
    </div>

    <Card title="Import ledgers" tip="Each import is previewed and validated before anything is written. Source rows are kept unchanged; normalised values are derived alongside them. Lines already in the reconciliation are never recreated.">
      <div className="rx-imports" id="rx-import">{(['B', 'V'] as Side[]).map(side => { const fid = p.imports[side]; const f = files.find(x => x.id === fid) ?? null; const avail = files.filter(x => x.side === side && x.kind === 'period');
        const n = st.txns.filter(t => t.fileId === fid).length;
        return <div key={side} className={'rx-slot' + (fid ? ' done' : '')}><header><b>{side === 'B' ? 'Buyer ledger · accounts payable' : 'Vendor ledger · accounts receivable'}</b>{fid ? <Pill tone="green">Imported</Pill> : <Pill>Awaited</Pill>}</header>
          {fid ? <><p className="rw-stack"><b>{f?.fileName ?? fid}</b><small>{f?.source} · {n} lines</small></p><dl className="rw-dl"><div><dt>Opening</dt><dd>{m(p.opening[side])}</dd></div><div><dt>Closing</dt><dd>{m(p.closing[side])}</dd></div></dl></>
            : avail.length ? avail.map(x => <div key={x.id} className="rx-file"><Icon n="file" /><span className="rw-stack"><b>{x.fileName}</b><small>{x.source} · received {x.availableAt} · {x.rows.length} lines</small></span><button className="rw-btn small lime" disabled={lockedP} onClick={() => setPreview(x)}>Preview and import</button></div>)
            : <p className="rx-muted">No file for {tag} yet{tagLabel(tag) ? ` (the period has to end first)` : ''}.</p>}
          {!fid && <button className="rw-link" disabled={lockedP} onClick={() => setUpload(side)}>Or upload a CSV in the ledger template</button>}
        </div>; })}
        {files.filter(f => f.kind !== 'period').map(f => { const done = p.extraFiles.includes(f.id); return <div key={f.id} className={'rx-slot extra' + (done ? ' done' : '')}><header><b>{f.kind === 'historical' ? `${f.side === 'B' ? 'Buyer' : 'Vendor'} historical open items` : 'Vendor supporting records · back-dated entries'}</b>{done ? <Pill tone="green">Imported</Pill> : <Pill tone="amber">Available</Pill>}</header>
          <div className="rx-file"><Icon n="file" /><span className="rw-stack"><b>{f.fileName}</b><small>{f.source} · {f.rows.length} line(s) · tagged {[...new Set(f.rows.map(r => r['Period Tag']))].join(', ')}</small></span>{!done && <button className="rw-btn small" disabled={lockedP} onClick={() => setPreview(f)}>Preview and import</button>}</div></div>; })}
      </div>
    </Card>

    <Card title="Opening balance validation" tip="A mandatory gate. Each party’s current opening must equal its own previous closing (plus any back-dated entries it supplies). This is separate from the buyer–vendor difference, which is the carried open-item position.">
      <div id="rx-gate" />
      {g.first ? <div className="rx-gate">
        <GateCard title="Buyer opening" c={g.B} cur={cur} note="First period" />
        <GateCard title="Vendor opening" c={g.V} cur={cur} note="First period" />
        {g.position && <div className={'rx-gatecard ' + (g.position.status === 'UNVERIFIED' ? 'bad' : 'ok')}><header><b>Opening position</b><Pill tone={g.position.status === 'UNVERIFIED' ? 'red' : 'green'}>{g.position.status}</Pill></header>
          <dl><div><dt>Buyer opening less its historical items</dt><dd>{m(g.position.buyerBase)}</dd></div><div><dt>Vendor opening less its historical items</dt><dd>{m(g.position.vendorBase)}</dd></div><div className="k"><dt>Unexplained opening difference</dt><dd>{m(g.position.diff)}</dd></div></dl>
          {g.position.status === 'UNVERIFIED' ? <><p className="rx-muted">Historical items do not fully explain the difference between the two opening balances. It must be agreed with the vendor and formally approved, with evidence. It is never assumed to be zero.</p><button className="rw-btn small" disabled={!approver || lockedP} title={approver ? '' : 'Approver only'} onClick={() => setApprove({ side: 'B', kind: 'opening-position' })}>Approve with evidence</button></>
            : g.position.adjustment ? <p className="rx-muted">Approved by {g.position.adjustment.approvedBy}: “{g.position.adjustment.reason}” ({g.position.adjustment.evidence})</p> : null}
        </div>}
      </div> : <div className="rx-gate">
        {(['B', 'V'] as Side[]).map(s => <GateCard key={s} title={s === 'B' ? 'Buyer continuity' : 'Vendor continuity'} c={g[s]} cur={cur} actions={g[s].status === 'FAILED' && <div className="rd-btns">
          {files.some(f => f.side === s && f.kind === 'backdated' && !p.extraFiles.includes(f.id)) && <button className="rw-btn small lime" disabled={lockedP} onClick={() => setPreview(files.find(f => f.side === s && f.kind === 'backdated')!)}>Upload supporting entries</button>}
          <button className="rw-btn small" disabled={!approver || lockedP} title={approver ? '' : 'Approver only'} onClick={() => setApprove({ side: s, kind: 'opening-continuity' })}>Approve explained difference</button></div>} />)}
        <div className="rx-gatecard info"><header><b>Buyer–vendor difference at previous close</b><Pill>Information</Pill></header><dl><div className="k"><dt>Buyer closing − vendor closing</dt><dd>{m(g.prevDifference)}</dd></div></dl><p className="rx-muted">Explained by the {p.carriedIn.length} items carried forward. Not an opening error.</p></div>
      </div>}
      <p className={'rx-gateline ' + (g.passed && p.imports.V ? 'ok' : 'bad')}>{g.passed && p.imports.V ? '✓ Opening balance validation passed. Matching is unlocked.' : !p.imports.B || !p.imports.V ? 'Import both ledgers to validate openings.' : '✕ Matching is blocked until every check above passes or is formally approved. There is no bypass.'}</p>
    </Card>
    </>}

    {part === 'matched' && <>
    <Card title="Reconciliation workbench" tip="Stages run in a fixed order: contra inside each ledger first, then invoices and debit notes, credit notes, payments, TDS, payment + TDS, and finally candidates for review. A group closes only when its signed amounts agree exactly. Candidates never close without a reviewer."
      actions={<button className="rw-btn lime" disabled={!stageAvailable(st, tag, stages.find(s => !p.stages[s.id])?.id ?? 'other', settings).ok || stages.every(s => p.stages[s.id])} onClick={runAll}>Run all remaining stages</button>}>
      <div id="rx-bench" className="rx-bench">
        <div className="rx-bench-h"><span>#</span><span>Stage</span><span>Considered</span><span>Matched</span><span>Unmatched</span><span>Value matched</span><span>For review</span><span>Rejected</span><span /></div>
        {stages.map((s, i) => { const x = p.stages[s.id]; const av = stageAvailable(st, tag, s.id, settings); const cs = st.candidates.filter(c => c.stage === s.id && c.periodTag === tag); const ms = st.matches.filter(mm => mm.stage === s.id && mm.periodTag === tag); const isOpen = openStage === s.id;
          return <div key={s.id} className={'rx-stage' + (x ? ' done' : '') + (isOpen ? ' open' : '')}>
            <div className="rx-stage-row" role="button" tabIndex={0} onClick={() => setOpenStage(isOpen ? '' : s.id)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenStage(isOpen ? '' : s.id); } }} aria-expanded={isOpen}>
              <span className="n">{x ? '✓' : i + 1}</span><span className="t"><b>{s.label}</b><small>{s.desc}</small></span>
              <span>{x?.considered ?? '—'}</span><span>{x ? x.matched : '—'}</span><span>{x ? Math.max(0, x.considered - x.matched) : '—'}</span><span>{x ? m(x.matchAmount, 0) : '—'}</span>
              <span>{cs.filter(c => c.status === 'pending').length || (x ? 0 : '—')}</span><span>{cs.filter(c => c.status === 'rejected').length || (x ? 0 : '—')}</span>
              <span onClick={e => e.stopPropagation()}>{!x ? <button className="rw-btn small" disabled={!av.ok} title={av.why} onClick={() => runOne(s.id)}>Run</button> : <button className="rw-btn small ghost" disabled={lockedP || !g.passed} title="Run again on what is still open, e.g. after credit mapping" onClick={() => runOne(s.id)}>Re-run</button>}</span>
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
    </>}

    {preview && <ImportDrawer ctx={ctx} file={preview} onClose={() => setPreview(null)} onImport={doImport} />}
    {approve && <ApproveDrawer ctx={ctx} side={approve.side} kind={approve.kind} amount={approve.kind === 'opening-position' ? g.position?.diff ?? 0 : g[approve.side].variance ?? 0} onClose={() => setApprove(null)} />}
    {grouping && <GroupDrawer ctx={ctx} txns={selTx} onClose={() => setGrouping(false)} onDone={() => { setSel([]); setGrouping(false); }} />}
    {upload && <UploadDrawer ctx={ctx} side={upload} onClose={() => setUpload(null)} onReady={f => { setUpload(null); setPreview(f); }} />}
  </>;
}

function GateCard({ title, c, cur, note, actions }: { title: string; c: SideCheck; cur: string; note?: string; actions?: React.ReactNode }) {
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

function ImportDrawer({ ctx, file, onClose, onImport }: { ctx: Ctx; file: LedgerFile; onClose: () => void; onImport: (f: LedgerFile) => void }) {
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

function ApproveDrawer({ ctx, side, kind, amount, onClose }: { ctx: Ctx; side: Side; kind: 'opening-continuity' | 'opening-position'; amount: number; onClose: () => void }) {
  const { st, tag, run, user, at, approver } = ctx; const [reason, setReason] = useState(''); const [ev, setEv] = useState('');
  return <Drawer title="Approve an explained opening difference" sub={`${kind === 'opening-position' ? 'Opening position' : side === 'B' ? 'Buyer continuity' : 'Vendor continuity'} · ${money(amount, st.rel.currency)}`} onClose={onClose}>
    <p className="rw-note">This records an approved adjustment of {money(amount, st.rel.currency)} with your name, reason and evidence. It appears as a reconciling line on the statement for {tag}. Nothing in either ledger is changed.</p>
    {!approver && <p className="rw-note warn">You are signed in as a preparer. Switch to an approver to continue.</p>}
    <label className="rw-field"><span>Reason</span><textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="What caused the difference and who agreed it" /></label>
    <label className="rw-field"><span>Supporting document reference</span><input value={ev} onChange={e => setEv(e.target.value)} placeholder="e.g. Vendor email 12-Oct-2026, onboarding minutes" /></label>
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!approver || !reason.trim() || !ev.trim()} onClick={() => { if (run(s => approveOpening(s, tag, side, kind, reason, ev, user.name, at(), approver), 'Opening difference approved and recorded')) onClose(); }}>Approve</button></div>
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

function UploadDrawer({ ctx, side, onClose, onReady }: { ctx: Ctx; side: Side; onClose: () => void; onReady: (f: LedgerFile) => void }) {
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
