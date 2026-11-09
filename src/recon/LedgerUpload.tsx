import React, { useState } from 'react';
import { gate, importFile, statement, openItems, r2, fmtDay, type LedgerFile, type Side } from './cycle';
import { filesFor, autoReconcile } from './store';
import { tagLabel } from './ledger';
import { Card, DataTable, Icon, Pill, money } from './ui';
import { PageHead, STATUS_TONE, vendorOf, type Ctx } from './App';
import { GateCard, ImportDrawer, ApproveDrawer, UploadDrawer } from './Reconcile';

type StepState = 'done' | 'wait' | 'bad' | 'todo';

export default function LedgerUpload({ ctx }: { ctx: Ctx }) {
  const { st, tag, ws, settings, run, user, at, approver, go, select, label } = ctx;
  const p = st.periods.find(x => x.tag === tag)!; const idx = st.periods.indexOf(p); const prev = st.periods[idx - 1];
  const cur = st.rel.currency; const m = (n: number | null | undefined, dp = 2) => money(n, cur, dp);
  const files = filesFor(ws, st.rel.id, tag); const vendorFile = files.find(f => f.side === 'V' && f.kind === 'period');
  const [preview, setPreview] = useState<LedgerFile | null>(null);
  const [approve, setApprove] = useState<{ side: Side; kind: 'opening-continuity' | 'opening-position' } | null>(null);
  const [own, setOwn] = useState(false);
  const g = gate(st, tag); const s = statement(st, tag, settings); const wf = ctx.stat(st, tag);
  const auto = (x: typeof st) => autoReconcile(x, ws, tag, at());
  const upload = (f: LedgerFile) => { if (run(x => { const r = importFile(x, f, tag, f.side === 'V' ? `${vendorOf(st).contact.name} (vendor)` : user.name, at()); return r.ok ? { ok: true, state: auto(r.state) } : r; }, `${f.fileName} uploaded. Reconciliation ran automatically.`)) setPreview(null); };
  const when = (pred: (a: typeof st.audit[number]) => boolean) => [...st.audit].reverse().find(a => a.periodTag === tag && pred(a));
  const vIn = when(a => a.action === 'Import' && a.detail.startsWith('Vendor period')), bIn = when(a => a.action === 'Import' && a.detail.startsWith('Buyer period'));
  const matchedAt = when(a => a.action === 'Run stage' && a.detail.startsWith('Other candidates'));
  const items = openItems(st, tag, settings); const groups = st.matches.filter(x => !x.reversed && x.periodTag === tag);
  const pending = st.candidates.filter(c => c.status === 'pending' && c.periodTag === tag).length;
  const both = !!p.imports.B && !!p.imports.V; const stagesDone = !!p.stages.other;
  const vendorName = vendorOf(st).displayName;

  const steps: { k: string; state: StepState; title: string; body: React.ReactNode }[] = [
    { k: 'v', state: p.imports.V ? 'done' : 'wait', title: 'Vendor ledger', body: p.imports.V ? <>Received {vIn ? `${vIn.at} · ` : ''}{st.txns.filter(t => t.fileId === p.imports.V).length} lines · opening {m(p.opening.V)}, closing {m(p.closing.V)}</> : <>Waiting for {vendorName} to upload its ledger for {p.tag}.</> },
    { k: 'b', state: p.imports.B ? 'done' : 'wait', title: 'Buyer ledger (ERP)', body: p.imports.B ? <>Fetched {bIn ? `${bIn.at} by ${bIn.by}` : ''} · opening {m(p.opening.B)}, closing {m(p.closing.B)}</> : <>Fetched automatically from the ERP once the period’s extract is available.</> },
    { k: 'g', state: !both ? 'todo' : g.passed ? 'done' : 'bad', title: 'Opening balance check', body: !both ? 'Runs as soon as both ledgers are in.' : g.passed ? <>Both openings continue from the last close{g.first ? ' (first period: opening position agreed)' : ''}.</> : <>The {g.first ? 'opening position' : g.V.status === 'FAILED' && g.B.status === 'FAILED' ? 'buyer and vendor openings' : g.V.status === 'FAILED' ? 'vendor opening' : 'buyer opening'} does not agree. Reconciliation is paused until this is resolved below.</> },
    { k: 'r', state: stagesDone ? 'done' : !both || !g.passed ? 'todo' : 'wait', title: 'Reconciliation', body: stagesDone ? <>Ran automatically{matchedAt ? ` ${matchedAt.at}` : ''}: {groups.filter(x => x.kind === 'match').length} matches and {groups.filter(x => x.kind === 'contra').length} contra pairs closed; {items.length} item(s) open{pending ? `, ${pending} suggested match(es) to review` : ''}.</> : 'Runs automatically once the opening check passes.' },
    { k: 's', state: !stagesDone ? 'todo' : s.balanced ? 'done' : 'bad', title: 'Reconciliation statement', body: !stagesDone ? 'Drafted automatically after reconciliation.' : <>{p.phase === 'working' ? 'Draft ready' : wf}: difference {m(s.difference)} explained by {s.countB + s.countV} open item(s) in {s.annexures.length} annexure(s){s.balanced ? '' : `, ${m(s.unexplained)} unexplained`}.</> },
  ];
  const history = [...st.periods].reverse().map(x => { const vf = st.txns.find(t => t.fileId === x.imports.V); const va = [...st.audit].find(a => a.periodTag === x.tag && a.action === 'Import' && a.detail.startsWith('Vendor period')); return { x, vf, va }; });

  return <>
    <PageHead title="Vendor ledger upload">Choose the vendor and the period the ledger belongs to, then upload. The platform fetches the buyer’s ledger, checks both openings and reconciles automatically.</PageHead>
    <div className="rx-up">
      <Card className="rx-up-main" title="Upload a ledger">
        <div className="rx-up-pick">
          <label className="rw-field"><span>Vendor</span><select value={st.rel.id} onChange={e => select(e.target.value)}>{Object.values(ws.states).map(x => <option key={x.rel.id} value={x.rel.id}>{label(x)}</option>)}</select></label>
          <label className="rw-field"><span>Period this ledger is for</span><select value={tag} onChange={e => select(st.rel.id, e.target.value)}>{[...st.periods].reverse().map(x => <option key={x.tag} value={x.tag}>{x.tag} · {x.label} · {x.phase === 'closed' ? 'closed' : ctx.stat(st, x.tag)}</option>)}</select></label>
        </div>
        {p.phase === 'closed' ? <p className="rw-note">{p.tag} is closed. Its ledger was received and the period was signed off; choose the current period to upload.</p>
          : p.imports.V ? <div className="rx-up-done"><Icon n="check" s={22} /><div><b>Ledger received for {p.tag}</b><small>{files.find(f => f.id === p.imports.V)?.fileName ?? 'Uploaded file'}{vIn ? ` · ${vIn.at}` : ''}</small></div><button className="rw-btn small" onClick={() => go('statement')}>View statement →</button></div>
          : p.phase !== 'working' ? <p className="rw-note warn">The statement for {p.tag} is {wf.toLowerCase()}. Reopen it on the statement tab before uploading.</p>
          : <>
            {vendorFile ? <div className="rx-up-file"><Icon n="file" s={20} /><div><b>{vendorFile.fileName}</b><small>{vendorFile.source} · received {vendorFile.availableAt} · {vendorFile.rows.length} lines</small></div><button className="rw-btn lime" onClick={() => setPreview(vendorFile)}><Icon n="upload" /> Preview and upload</button></div>
              : <p className="rx-muted">No ledger from {vendorName} for {p.tag} yet{p.end > Date.now() ? ` (the period ends ${fmtDay(p.end)})` : ''}.</p>}
            <button className="rw-link" onClick={() => setOwn(true)}>Upload a different CSV in the ledger template</button>
          </>}
        {prev && <div className="rx-up-ctx"><span>Previous period <b className="rx-tag">{prev.tag}</b> closed {prev.dates.closed?.split(' ')[0] ?? '—'}</span><span>Buyer closing <b>{m(prev.closing.B, 0)}</b></span><span>Vendor closing <b>{m(prev.closing.V, 0)}</b></span><span>Carried in <b>{p.carriedIn.length} open item(s)</b></span></div>}
        {!prev && <div className="rx-up-ctx"><span>First reconciliation for this vendor. Opening balances and any historical open items come in with the first ledgers.</span></div>}
      </Card>
      <Card className="rx-up-run" title={`What happens for ${p.tag}`} tip="Everything here runs on its own. A person is needed only if an opening balance does not agree, and to review suggested matches and sign the statement.">
        <ol className="rx-run">{steps.map(x => <li key={x.k} className={x.state}><span>{x.state === 'done' ? '✓' : x.state === 'bad' ? '!' : x.state === 'wait' ? '…' : ''}</span><div><b>{x.title}</b><p>{x.body}</p></div></li>)}</ol>
        {stagesDone && <div className="rx-run-links">
          <button onClick={() => go('matched')}><b>{groups.length}</b><span>Reconciled</span></button>
          <button onClick={() => go('open')}><b>{items.length}</b><span>Unreconciled</span></button>
          <button onClick={() => go('statement')}><b className={s.balanced ? 'rw-ok' : 'rw-neg'}>{s.balanced ? '✓' : '!'}</b><span>Statement</span></button></div>}
      </Card>
    </div>

    {both && !g.passed && p.phase === 'working' && <Card title="Opening balance check needs attention" tip="Each party’s opening must continue from its own previous closing, plus any entries it back-dated into a closed period. This is separate from the buyer–vendor difference, which is the carried open-item position.">
      <div className="rx-gate">
        {g.first ? <>
          <GateCard title="Buyer opening" c={g.B} cur={cur} note="First period" /><GateCard title="Vendor opening" c={g.V} cur={cur} note="First period" />
          {g.position && <div className="rx-gatecard bad"><header><b>Opening position</b><Pill tone="red">{g.position.status}</Pill></header><dl><div><dt>Buyer opening less its historical items</dt><dd>{m(g.position.buyerBase)}</dd></div><div><dt>Vendor opening less its historical items</dt><dd>{m(g.position.vendorBase)}</dd></div><div className="k"><dt>Unexplained opening difference</dt><dd>{m(g.position.diff)}</dd></div></dl>
            <p className="rx-muted">Historical items do not explain the gap between the two openings. Agree it with the vendor, then record the approval with evidence. It is never assumed to be zero.</p><button className="rw-btn small" disabled={!approver} title={approver ? '' : 'Approver only'} onClick={() => setApprove({ side: 'B', kind: 'opening-position' })}>Approve with evidence</button></div>}
        </> : <>{(['B', 'V'] as Side[]).map(x => <GateCard key={x} title={x === 'B' ? 'Buyer continuity' : 'Vendor continuity'} c={g[x]} cur={cur} actions={g[x].status === 'FAILED' && <div className="rd-btns">
          {files.some(f => f.side === x && f.kind === 'backdated' && !p.extraFiles.includes(f.id)) && <button className="rw-btn small lime" onClick={() => setPreview(files.find(f => f.side === x && f.kind === 'backdated')!)}>Upload the vendor’s back-dated entries</button>}
          <button className="rw-btn small" disabled={!approver} title={approver ? '' : 'Approver only'} onClick={() => setApprove({ side: x, kind: 'opening-continuity' })}>Approve explained difference</button></div>} />)}
          <div className="rx-gatecard info"><header><b>Difference at previous close</b><Pill>Information</Pill></header><dl><div className="k"><dt>Buyer − vendor</dt><dd>{m(g.prevDifference)}</dd></div></dl><p className="rx-muted">Explained by the {p.carriedIn.length} carried items. Not an opening error.</p></div></>}
      </div>
      <p className="rx-gateline bad">Reconciliation is paused. As soon as this check passes or is approved, matching runs automatically.</p>
    </Card>}

    <Card title={`Ledger history · ${label(st)}`} tip="Every period of this relationship and the vendor ledger received for it.">
      <DataTable rows={history} rowKey={h => h.x.tag} fileName={`${st.rel.id}_ledger-history.csv`} pageSize={6} onRowClick={h => select(st.rel.id, h.x.tag)} activeKey={tag} cols={[
        { key: 'p', label: 'Period', text: h => h.x.tag, render: h => <span className="rw-stack"><span className="rx-tag">{h.x.tag}</span><small>{h.x.label}</small></span> },
        { key: 'v', label: 'Vendor ledger', text: h => h.x.imports.V ? 'Received' : 'Awaited', render: h => h.x.imports.V ? <span className="rw-stack"><span>{files.find(f => f.id === h.x.imports.V)?.fileName ?? ws.files.find(f => f.id === h.x.imports.V)?.fileName ?? 'Received'}</span><small>{h.va?.at}</small></span> : <Pill tone="amber">Awaited</Pill> },
        { key: 'b', label: 'Buyer ledger', text: h => h.x.imports.B ? 'Fetched' : 'Awaited', render: h => h.x.imports.B ? <Pill tone="green">Fetched</Pill> : <Pill>Awaited</Pill> },
        { key: 'o', label: 'Openings', align: 'right', text: h => `${m(h.x.opening.B, 0)} / ${m(h.x.opening.V, 0)}`, render: h => <span className="rw-stack"><span>{m(h.x.opening.B, 0)}</span><small>{m(h.x.opening.V, 0)}</small></span> },
        { key: 'c', label: 'Closings', align: 'right', text: h => `${m(h.x.closing.B, 0)} / ${m(h.x.closing.V, 0)}`, render: h => <span className="rw-stack"><span>{m(h.x.closing.B, 0)}</span><small>{m(h.x.closing.V, 0)}</small></span> },
        { key: 'd', label: 'Difference', align: 'right', text: h => h.x.closing.B !== null && h.x.closing.V !== null ? m(r2(h.x.closing.B - h.x.closing.V), 0) : '—' },
        { key: 's', label: 'Status', text: h => ctx.stat(st, h.x.tag), render: h => <Pill tone={STATUS_TONE[ctx.stat(st, h.x.tag)]}>{ctx.stat(st, h.x.tag)}</Pill> },
      ]} />
    </Card>
    {preview && <ImportDrawer ctx={ctx} file={preview} onClose={() => setPreview(null)} onImport={f => f.kind === 'period' ? upload(f) : (run(x => { const r = importFile(x, f, tag, user.name, at()); return r.ok ? { ok: true, state: auto(r.state) } : r; }, `${f.fileName} imported. Reconciliation ran automatically.`) && setPreview(null))} />}
    {approve && <ApproveDrawer ctx={ctx} side={approve.side} kind={approve.kind} amount={approve.kind === 'opening-position' ? g.position?.diff ?? 0 : g[approve.side].variance ?? 0} onClose={() => setApprove(null)} after={auto} />}
    {own && <UploadDrawer ctx={ctx} side="V" onClose={() => setOwn(false)} onReady={f => { setOwn(false); setPreview(f); }} />}
  </>;
}
