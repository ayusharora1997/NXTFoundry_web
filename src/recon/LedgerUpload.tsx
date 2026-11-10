import React, { useEffect, useState } from 'react';
import { gate, importFile, previewFile, statement, openItems, r2, TYPE_LABEL, type LedgerFile, type RelState, type Side } from './cycle';
import { filesFor, autoReconcile } from './store';
import { tagLabel } from './ledger';
import { parseCSV } from './csv';
import { toCSV } from './engine';
import { Card, DataTable, Drawer, Icon, Pill, PeriodCalendar, download, money, signedMoney } from './ui';
import { PageHead, STATUS_TONE, vendorOf, entityOf, type Ctx } from './App';
import { GateCard, ImportDrawer, ApproveDrawer } from './Reconcile';

type StepState = 'done' | 'wait' | 'bad' | 'todo';
const STD_COLS = ['Line ID', 'Document No', 'Document Date', 'Type', 'Debit', 'Credit'];
// What the AI step reports for a vendor's own layout. A mock-up of the real extraction, which is a product feature of its own.
const OWN_MAP: [string, string, number][] = [['Inv / Doc No.', 'Document No', 99], ['Doc Dt', 'Document Date', 98], ['Posting Dt', 'Posting Date', 97], ['Txn Type', 'Type', 94], ['Dr Amt', 'Debit', 99], ['Cr Amt', 'Credit', 99], ['Your Ref', 'Reference', 91], ['Particulars', 'Narration', 88]];

export default function LedgerUpload({ ctx }: { ctx: Ctx }) {
  const { st, tag, ws, settings, run, user, at, approver, go, select, label } = ctx;
  const p = st.periods.find(x => x.tag === tag)!; const idx = st.periods.indexOf(p); const prev = st.periods[idx - 1];
  const cur = st.rel.currency; const m = (n: number | null | undefined, dp = 2) => money(n, cur, dp);
  const files = filesFor(ws, st.rel.id, tag); const vendorFile = files.find(f => f.side === 'V' && f.kind === 'period'); const buyerFile = files.find(f => f.side === 'B' && f.kind === 'period');
  const [preview, setPreview] = useState<LedgerFile | null>(null);
  const [approve, setApprove] = useState<{ side: Side; kind: 'opening-continuity' | 'opening-position' } | null>(null);
  const [uploading, setUploading] = useState(false);
  const g = gate(st, tag); const s = statement(st, tag, settings); const wf = ctx.stat(st, tag);
  const auto = (x: RelState) => autoReconcile(x, ws, tag, at());
  const when = (t: string, pred: (a: RelState['audit'][number]) => boolean) => [...st.audit].reverse().find(a => a.periodTag === t && pred(a));
  const vIn = (t: string) => when(t, a => a.action === 'Import' && a.detail.startsWith('Vendor period')), bIn = (t: string) => when(t, a => a.action === 'Import' && a.detail.startsWith('Buyer period'));
  const matchedAt = when(tag, a => a.action === 'Run stage' && a.detail.startsWith('Other candidates'));
  const items = openItems(st, tag, settings); const groups = st.matches.filter(x => !x.reversed && x.periodTag === tag);
  const pending = st.candidates.filter(c => c.status === 'pending' && c.periodTag === tag).length;
  const both = !!p.imports.B && !!p.imports.V; const stagesDone = !!p.stages.other;
  const vendorName = vendorOf(st).displayName; const name = tagLabel(tag);
  const buyerFetched = buyerFile ? (/ERP/i.test(buyerFile.source) ? `Fetched from ERP on ${buyerFile.availableAt}` : `Uploaded on ${buyerFile.availableAt}`) : 'Fetched from the ERP once the period’s extract is available';

  const standardised = (x: RelState['periods'][number]) => st.txns.filter(t => t.fileId === x.imports.V).map(t => ({ 'Line ID': t.line, 'Document No': t.docNo, 'Document Type': TYPE_LABEL[t.type], 'Document Date': t.date ? new Date(t.date).toISOString().slice(0, 10) : '', 'Reference': t.ref || t.against, 'Signed amount': t.amount, 'Original period': tagLabel(t.originTag) }));
  const dlSrc = (f: LedgerFile | undefined) => f && download(f.fileName, toCSV(f.rows));

  const steps: { k: string; state: StepState; title: string; body: React.ReactNode }[] = [
    { k: 'v', state: p.imports.V ? 'done' : 'wait', title: 'Vendor ledger', body: p.imports.V ? <>Received {vIn(tag)?.at ?? ''} · {st.txns.filter(t => t.fileId === p.imports.V).length} lines · opening {m(p.opening.V)}, closing {m(p.closing.V)}</> : <>Waiting for {vendorName} to upload its ledger for {name}.</> },
    { k: 'a', state: p.imports.V ? 'done' : 'todo', title: 'AI scrutiny', body: p.imports.V ? 'Layout read, columns mapped to the standard ledger, amounts and document numbers normalised.' : 'Runs on upload: reads any ledger layout and maps it to the standard ledger.' },
    { k: 'b', state: p.imports.B ? 'done' : 'wait', title: 'Buyer ledger', body: p.imports.B ? <>{buyerFetched} · opening {m(p.opening.B)}, closing {m(p.closing.B)}</> : buyerFetched + '.' },
    { k: 'g', state: !both ? 'todo' : g.passed ? 'done' : 'bad', title: 'Opening balance check', body: !both ? 'Runs as soon as both ledgers are in.' : g.passed ? <>Both openings continue from the previous closing{g.first ? ' (first period: opening position agreed)' : ''}.</> : <>The {g.first ? 'opening position' : g.V.status === 'FAILED' && g.B.status === 'FAILED' ? 'buyer and vendor openings' : g.V.status === 'FAILED' ? 'vendor opening' : 'buyer opening'} does not agree. Reconciliation is paused until this is resolved below.</> },
    { k: 'r', state: stagesDone ? 'done' : !both || !g.passed ? 'todo' : 'wait', title: 'Reconciliation', body: stagesDone ? <>Ran automatically{matchedAt ? ` ${matchedAt.at}` : ''}: {groups.filter(x => x.kind === 'match').length} matches and {groups.filter(x => x.kind === 'contra').length} contra pairs closed; {items.length} item(s) open{pending ? `, ${pending} suggested match(es) to review` : ''}.</> : 'Runs automatically once the opening check passes.' },
    { k: 's', state: !stagesDone ? 'todo' : s.balanced ? 'done' : 'bad', title: 'Reconciliation statement', body: !stagesDone ? 'Drafted automatically after reconciliation.' : <>{p.phase === 'working' ? 'Draft ready' : wf}: difference {m(s.difference)} explained by {s.countB + s.countV} open item(s) in {s.annexures.length} annexure(s){s.balanced ? '' : `, ${m(s.unexplained)} unexplained`}.</> },
  ];
  const history = [...st.periods].reverse().map((x, i) => ({ x, n: st.periods.length - i, vf: ws.files.find(f => f.id === x.imports.V), bf: ws.files.find(f => f.id === x.imports.B), va: vIn(x.tag), g: gate(st, x.tag) }));
  const diff = p.closing.B !== null && p.closing.V !== null ? r2(p.closing.B - p.closing.V) : null;
  const chk = (c: ReturnType<typeof gate>['V'], who: string) => <tr key={who}><td><b>{who}</b></td><td className="ar">{c.status === 'FIRST PERIOD' ? '—' : m(c.prevClosing)}</td><td className="ar">{c.status === 'FIRST PERIOD' ? '—' : m(c.backdated)}</td><td className="ar">{m(c.opening)}</td><td className="ar">{c.variance === null ? '—' : <span className={Math.abs(c.variance) < 0.005 ? 'rw-ok' : 'rw-neg'}>{m(c.variance)}</span>}</td><td><Pill tone={c.status === 'PASSED' || c.status === 'FIRST PERIOD' ? 'green' : c.status === 'APPROVED' ? 'violet' : c.status === 'FAILED' ? 'red' : 'grey'}>{c.status === 'FIRST PERIOD' ? 'First period' : c.status === 'PENDING' ? 'Awaiting ledger' : c.status === 'PASSED' ? 'Agrees' : c.status === 'APPROVED' ? 'Approved' : 'Does not agree'}</Pill></td></tr>;

  return <>
    <PageHead title="Vendor ledger upload" actions={<button className="rw-btn lime" onClick={() => setUploading(true)}><Icon n="upload" /> Upload ledger</button>}>
      Upload a vendor’s ledger in its own format or in the standard format. The platform reads it, checks the vendor’s opening against its previous closing, fetches the buyer ledger and reconciles automatically.
    </PageHead>

    <Card title={`Balance for ${name}`} actions={<button className="rw-btn small" disabled={!vendorFile && !p.imports.V} onClick={() => dlSrc(ws.files.find(f => f.id === p.imports.V) ?? vendorFile)}><Icon n="download" /> Vendor ledger</button>}>
      <div className="rw-table-wrap"><table className="rw-table"><thead><tr><th>Entity</th><th>Vendor</th><th className="ar">Entity closing balance (CB)</th><th className="ar">Vendor closing balance (CB)</th><th className="ar">Difference</th></tr></thead>
        <tbody><tr><td>{entityOf(st).name}<br /><small className="rx-muted">{st.rel.bu} · {st.rel.currency}</small></td><td>{vendorOf(st).legalName}<br /><small className="rx-muted">{st.rel.vendorCode}</small></td>
          <td className="ar">{m(p.closing.B)}</td><td className="ar">{p.closing.V === null ? <span className="rx-muted">Awaiting upload</span> : m(p.closing.V)}</td><td className="ar">{diff === null ? '—' : <b>{m(diff)}</b>}</td></tr></tbody></table></div>
      <div className="rx-src">
        <span><i>Buyer ledger</i><b>{buyerFetched}</b>{buyerFile && <small>{buyerFile.source}</small>}</span>
        <span><i>Vendor ledger</i><b>{p.imports.V ? `Uploaded ${vIn(tag)?.at ?? ''}` : `Awaiting ${vendorName}`}</b>{p.imports.V && <small>{ws.files.find(f => f.id === p.imports.V)?.fileName}</small>}</span>
        <span><i>Previous period</i><b>{prev ? `${tagLabel(prev.tag)} · closed ${prev.dates.closed?.split(' ')[0] ?? '—'}` : 'First reconciliation'}</b>{prev && <small>Carried in {p.carriedIn.length} open item(s)</small>}</span>
      </div>
    </Card>

    <div className="rx-up">
      <Card title="Opening and closing balance check" tip="The main check. Each party’s opening for this period must equal its own closing for the previous period, plus any entries it back-dated into a closed period. The vendor’s check comes first; it is the one the vendor controls.">
        <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Ledger</th><th className="ar">Previous closing</th><th className="ar">Back-dated entries</th><th className="ar">Opening per ledger</th><th className="ar">Variance</th><th>Result</th></tr></thead><tbody>{chk(g.V, 'Vendor')}{chk(g.B, 'Buyer')}</tbody></table></div>
        {g.first && <p className="rx-muted">This is the first reconciliation for this vendor, so there is no earlier close. The two openings are compared once both ledgers are in.</p>}
        {p.imports.V && <p className={'rw-note' + (g.V.status === 'FAILED' ? ' warn' : '')}>{g.V.status === 'FAILED' ? <>The vendor’s opening is {m(g.V.variance)} away from where {prev ? tagLabel(prev.tag) : 'the last period'} closed. Reconciliation is paused until it is explained.</> : 'The vendor’s ledger continues from the previous close.'}</p>}
      </Card>
      <Card className="rx-up-run" title={`What happens for ${name}`} tip="Everything here runs on its own. A person is needed only if an opening balance does not agree, and to review suggested matches and sign the statement.">
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

    <Card title="All uploaded ledgers" tip="Every period of this relationship. Previous periods’ ledgers can be downloaded again, as received and as standardised by the platform.">
      <DataTable rows={history} rowKey={h => h.x.tag} fileName={`${st.rel.id}_uploaded-ledgers.csv`} pageSize={6} onRowClick={h => select(st.rel.id, h.x.tag)} activeKey={tag} cols={[
        { key: 'n', label: '#', width: 40, text: h => String(h.n) },
        { key: 'j', label: 'Job ID', text: h => `UL-${st.rel.id}-${h.x.tag.slice(3)}${h.x.tag.slice(1, 3)}`, render: h => <code>{`UL-${st.rel.id}-${h.x.tag.slice(3)}${h.x.tag.slice(1, 3)}`}</code> },
        { key: 's', label: 'Status', text: h => ctx.stat(st, h.x.tag), render: h => <Pill tone={STATUS_TONE[ctx.stat(st, h.x.tag)]}>{ctx.stat(st, h.x.tag)}</Pill> },
        { key: 'u', label: 'Vendor / user', text: h => h.va?.by ?? '—', render: h => h.va ? <span className="rw-stack"><span>{h.va.by}</span><small>{h.va.at}</small></span> : <Pill tone="amber">Awaited</Pill> },
        { key: 'p', label: 'Period', text: h => tagLabel(h.x.tag), render: h => <span className="rw-stack"><b>{tagLabel(h.x.tag)}</b><small>{h.x.type}</small></span> },
        { key: 'b', label: 'Buyer ledger', text: h => h.bf ? h.bf.availableAt : '—', render: h => h.bf ? <span className="rw-stack"><span>{h.bf.availableAt}</span><small>{/ERP/i.test(h.bf.source) ? 'Fetched from ERP' : 'Uploaded'}</small></span> : <Pill>Awaited</Pill> },
        { key: 'd', label: 'Download', text: () => '', render: h => <span className="rx-docs" onClick={e => e.stopPropagation()}>
          {h.vf ? <button className="rw-link" onClick={() => dlSrc(h.vf)}>Vendor</button> : <span className="rx-muted">Vendor —</span>}
          {h.vf && <button className="rw-link" onClick={() => download(`${st.rel.vendorCode}_${h.x.tag}_standardised.csv`, toCSV(standardised(h.x)))}>Standardised</button>}
          {h.bf && <button className="rw-link" onClick={() => dlSrc(h.bf)}>Buyer</button>}</span> },
        { key: 'pc', label: 'Prior closing', align: 'right', text: h => h.g.V.prevClosing === null ? '—' : m(h.g.V.prevClosing, 0) },
        { key: 'co', label: 'Current opening', align: 'right', text: h => h.g.V.opening === null ? '—' : m(h.g.V.opening, 0) },
        { key: 'vr', label: 'Variance', align: 'right', text: h => h.g.V.variance === null ? '—' : m(h.g.V.variance, 0), render: h => h.g.V.variance === null ? <span className="rx-muted">—</span> : <span className={Math.abs(h.g.V.variance) < 0.005 ? 'rw-ok' : 'rw-neg'}>{Math.abs(h.g.V.variance) < 0.005 ? '✓ 0.00' : m(h.g.V.variance, 0)}</span> },
      ]} />
    </Card>
    {preview && <ImportDrawer ctx={ctx} file={preview} onClose={() => setPreview(null)} onImport={f => { if (run(x => { const r = importFile(x, f, tag, user.name, at()); return r.ok ? { ok: true, state: auto(r.state) } : r; }, `${f.fileName} imported. Reconciliation ran automatically.`)) setPreview(null); }} />}
    {approve && <ApproveDrawer ctx={ctx} side={approve.side} kind={approve.kind} amount={approve.kind === 'opening-position' ? g.position?.diff ?? 0 : g[approve.side].variance ?? 0} onClose={() => setApprove(null)} after={auto} />}
    {uploading && <UploadLedgerDrawer ctx={ctx} onClose={() => setUploading(false)} />}
  </>;
}

// ---------- Upload ledger drawer: format, period, file, AI scrutiny, then reconciliation ----------
interface Picked { name: string; rows: Record<string, string>[]; opening: number | null; closing: number | null; sample: boolean }

function UploadLedgerDrawer({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { st, tag, ws, run, at, select } = ctx;
  const [fmt, setFmt] = useState<'own' | 'std'>('own'); const [target, setTarget] = useState(tag); const [comment, setComment] = useState('');
  const [pick, setPick] = useState<Picked | null>(null); const [err, setErr] = useState(''); const [open, setOpen] = useState(''); const [close, setClose] = useState('');
  const [stage, setStage] = useState<'form' | 'ai' | 'review'>('form'); const [step, setStep] = useState(0);
  const cur = st.rel.currency; const m = (n: number | null | undefined) => money(n, cur, 2);
  const tp = st.periods.find(x => x.tag === target)!; const ti = st.periods.indexOf(tp); const prev = st.periods[ti - 1];
  const sample = filesFor(ws, st.rel.id, target).find(f => f.side === 'V' && f.kind === 'period');
  const blocked = tp.phase !== 'working' ? `${tagLabel(target)} is ${tp.phase === 'closed' ? 'closed' : 'already with the statement workflow'}; a ledger can no longer be uploaded for it.` : tp.imports.V ? `A vendor ledger has already been received for ${tagLabel(target)}.` : '';
  const vendorName = vendorOf(st).displayName;
  const AI_STEPS = fmt === 'own'
    ? ['Reading the file and finding the ledger table', 'Detecting the vendor’s layout and column headings', 'Mapping columns to the standard ledger fields', 'Normalising dates, amounts and document numbers', 'Reading opening and closing balances', 'Checking the opening against the previous closing']
    : ['Checking the standard template columns', 'Normalising dates, amounts and document numbers', 'Reading opening and closing balances', 'Checking the opening against the previous closing'];
  useEffect(() => { setPick(null); setErr(''); }, [target, fmt]);
  useEffect(() => { if (stage !== 'ai') return; if (step >= AI_STEPS.length) { const t = setTimeout(() => setStage('review'), 350); return () => clearTimeout(t); } const t = setTimeout(() => setStep(step + 1), 650); return () => clearTimeout(t); }, [stage, step]);

  const useSample = () => { if (!sample) return; setPick({ name: sample.fileName, rows: sample.rows, opening: sample.opening, closing: sample.closing, sample: true }); setErr(''); };
  const take = async (f?: File) => {
    setErr(''); if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setErr(sample ? `This demo reads CSV files only. Use “${sample.fileName}”, the sample ledger received from ${vendorName}, to see the full flow.` : 'This demo reads CSV files only. In Excel use File → Save As → CSV UTF-8.'); return; }
    const parsed = parseCSV(await f.text()); const miss = STD_COLS.filter(c => !parsed.columns.includes(c));
    if (miss.length) { setErr(sample ? `This demo can only read the standard columns from a file you pick (missing: ${miss.join(', ')}). Use the sample ledger received from ${vendorName} to see the AI step on a vendor layout.` : `Missing columns: ${miss.join(', ')}. Download the standard format for the layout.`); return; }
    setPick({ name: f.name, rows: parsed.rows, opening: null, closing: null, sample: false });
  };
  const o = pick?.sample ? pick.opening : open === '' ? null : Number(open), c = pick?.sample ? pick.closing : close === '' ? null : Number(close);
  const ready = !!pick && !blocked && o !== null && c !== null && !isNaN(o) && !isNaN(c);
  const file = (): LedgerFile => ({ id: pick!.sample && sample ? sample.id : `${st.rel.id}-V-${target}-UP${Date.now()}`, relId: st.rel.id, side: 'V', periodTag: target, kind: 'period', fileName: pick!.name, source: `Vendor upload${comment.trim() ? ` · ${comment.trim()}` : ''}`, availableAt: at().split(' ')[0], opening: o, closing: c, rows: pick!.rows });
  const pv = stage === 'review' && pick && ready ? previewFile(st, file(), target) : null;
  const obVar = prev && o !== null ? r2(o - prev.closing.V! ) : null;
  const push = () => {
    const f = file();
    if (run(x => { const r = importFile(x, f, target, `${vendorOf(x).contact.name} (vendor)`, at()); return r.ok ? { ok: true, state: autoReconcile(r.state, ws, target, at()) } : r; }, `Ledger for ${tagLabel(target)} uploaded. Reconciliation started automatically.`)) { if (target !== tag) select(st.rel.id, target); onClose(); }
  };

  return <Drawer wide title="Upload ledger" sub={`${vendorName} · ${st.rel.bu} · ${cur}`} onClose={onClose}>
    {stage === 'form' && <>
      <h4 className="rw-h4">Ledger format</h4>
      <div className="rx-fmt" role="radiogroup" aria-label="Ledger format">
        <button type="button" role="radio" aria-checked={fmt === 'own'} className={fmt === 'own' ? 'on' : ''} onClick={() => setFmt('own')}><b>Your own format</b><small>Upload the ledger as your system produces it. The AI step reads the layout and maps it to the standard ledger.</small></button>
        <button type="button" role="radio" aria-checked={fmt === 'std'} className={fmt === 'std' ? 'on' : ''} onClick={() => setFmt('std')}><b>Standard ledger format</b><small>Use the platform’s template. Read directly, no mapping needed.</small></button>
      </div>
      {fmt === 'std' && <button className="rw-link" onClick={() => download('standard_ledger_template.csv', toCSV([Object.fromEntries(['Line ID', 'Document No', 'Document Date', 'Posting Date', 'Type', 'Debit', 'Credit', 'Reference', 'Against Doc', 'Narration'].map(k => [k, '']))]))}>Download the standard ledger template</button>}
      <h4 className="rw-h4">Period this ledger is for · {tagLabel(target)}</h4>
      <PeriodCalendar tags={st.periods.map(x => x.tag)} value={target} quarterly={st.rel.frequency === 'Quarterly'} onPick={setTarget} />
      {blocked && <p className="rw-note warn">{blocked}</p>}
      {!blocked && prev && <p className="rx-muted">The ledger’s opening balance will be checked against the vendor’s closing for {tagLabel(prev.tag)}: <b>{m(prev.closing.V)}</b>.</p>}
      <label className="rw-field"><span>Comments (optional)</span><textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Any remark for this ledger" /></label>
      <h4 className="rw-h4">Attach file</h4>
      <label className="rw-drop"><input type="file" accept=".csv,.xls,.xlsx,.xlsb,text/csv" disabled={!!blocked} onChange={e => take(e.target.files?.[0])} /><Icon n="upload" s={24} /><b>{pick?.name ?? 'Click to upload'}</b><small>CSV in this demo · XLS, XLSX and XLSB in the full product · up to 50 MB</small></label>
      {sample && !blocked && <button className="rw-link" onClick={useSample}>Use the sample ledger received from {vendorName} for {tagLabel(target)}</button>}
      {err && <p className="rw-err">{err}</p>}
      {pick && !pick.sample && <div className="rw-row2"><label className="rw-field"><span>Opening balance per ledger</span><input inputMode="decimal" value={open} onChange={e => setOpen(e.target.value)} /></label><label className="rw-field"><span>Closing balance per ledger</span><input inputMode="decimal" value={close} onChange={e => setClose(e.target.value)} /></label></div>}
      {pick?.sample && <p className="rw-note">Ready: {pick.rows.length} lines · opening {m(pick.opening)} · closing {m(pick.closing)}.</p>}
      <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!ready} onClick={() => { setStep(0); setStage('ai'); }}>Upload and scrutinise</button></div>
    </>}
    {stage === 'ai' && <>
      <p className="rx-muted">{pick?.name}</p>
      <ol className="rx-ai">{AI_STEPS.map((x, i) => <li key={x} className={i < step ? 'done' : i === step ? 'now' : ''}><span>{i < step ? '✓' : ''}</span>{x}</li>)}</ol>
    </>}
    {stage === 'review' && pick && <>
      <p className="rw-note">AI scrutiny finished. Nothing has been pushed yet; check what was read, then send it to reconciliation.</p>
      {pv && <dl className="rw-dl four"><div><dt>Lines read</dt><dd>{pv.txns.length}</dd></div><div><dt>Opening per ledger</dt><dd>{m(o)}</dd></div><div><dt>Closing per ledger</dt><dd>{m(c)}</dd></div><div><dt>Opening + lines = closing</dt><dd className={pv.integrity ? 'rw-neg' : 'rw-ok'}>{pv.integrity ? signedMoney(pv.integrity, cur) : '✓ agrees'}</dd></div></dl>}
      <h4 className="rw-h4">Opening against previous closing</h4>
      {prev ? <p className={'rw-note' + (obVar !== null && Math.abs(obVar) >= 0.005 ? ' warn' : '')}>{obVar !== null && Math.abs(obVar) < 0.005 ? <>✓ The opening {m(o)} equals the vendor’s closing for {tagLabel(prev.tag)}.</> : <>The opening {m(o)} is {m(obVar)} away from the vendor’s closing for {tagLabel(prev.tag)} ({m(prev.closing.V)}). Back-dated entries may explain it. You can still push the ledger; reconciliation will pause at the opening check until it is explained.</>}</p>
        : <p className="rx-muted">First reconciliation for this vendor: the opening position is agreed with the buyer’s opening once both ledgers are in.</p>}
      {fmt === 'own' && <><h4 className="rw-h4">How the columns were mapped</h4>
        <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Found in your file</th><th>Standard ledger field</th><th className="ar">Confidence</th></tr></thead><tbody>{OWN_MAP.map(([a, b, n]) => <tr key={a}><td>{a}</td><td>{b}</td><td className="ar">{n}%</td></tr>)}</tbody></table></div>
        <p className="rx-muted">Shown as an illustration of the AI step. The extraction itself is part of the full product.</p></>}
      <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={() => setStage('form')}>Back</button><span className="sp" /><button className="rw-btn lime" disabled={!pv || !pv.txns.length} onClick={push}>Push to reconciliation</button></div>
    </>}
  </Drawer>;
}
