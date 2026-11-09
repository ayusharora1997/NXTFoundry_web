import React, { useEffect, useMemo, useState } from 'react';
import { toCSV } from './engine';
import { agreedOpening, applyUpload, autoMap, act, ledgerBalance, parseCSV, prepareUpload, sampleRows, stamp, vendorStatus, FIELDS, PERIOD, type Job, type Mapping } from './model';
import { Card, DataTable, Drawer, Icon, Meter, Pill, download, inr, num, short, statusTone, type Col } from './ui';
import { PageHead, type Ctx } from './App';

interface JobRow extends Job { status: string; latest: boolean }

export default function UploadScreen({ ctx }: { ctx: Ctx }) {
  const { ws, setWs, r, vendor, vName, go } = ctx;
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const [filter, setFilter] = useState<'' | 'pending' | 'variance'>('');
  useEffect(() => { if (ctx.focus.upload) { setUploadFor(ctx.focus.upload); ctx.clearFocus(); } }, [ctx.focus.upload]);
  const vf = (id: string) => vendor === 'ALL' || id === vendor;
  const latest = new Map<string, Job>(); ws.jobs.forEach(j => { if (!latest.has(j.vendorId)) latest.set(j.vendorId, j); });
  const vendors = ws.data.suppliers.filter(s => vf(s.id)).map(s => {
    const j = latest.get(s.id); const v = r.vendors.find(x => x.vendorId === s.id);
    const variance = j && j.currentOpening !== null ? j.currentOpening - j.priorClosing : null;
    return { s, j, v, status: vendorStatus(ws, s.id), variance, balanceOk: !!j && variance !== null && Math.abs(variance) < 0.5 };
  });
  const shown = vendors.filter(x => !filter || (filter === 'pending' ? x.status === 'Ledger not received' : !!x.j && !x.balanceOk));
  const received = vendors.filter(x => x.j).length, ok = vendors.filter(x => x.balanceOk).length;
  const jobs: JobRow[] = ws.jobs.filter(j => vf(j.vendorId)).map(j => ({ ...j, latest: latest.get(j.vendorId)?.id === j.id, status: latest.get(j.vendorId)?.id === j.id ? vendorStatus(ws, j.vendorId) : 'Superseded' }));
  const request = (id: string) => { setWs(w => ({ ...w, requested: { ...w.requested, [id]: stamp() }, activity: [act({ kind: 'reminder', vendorId: id, what: w.requested[id] ? 'Sent a reminder for the statement of account' : 'Statement of account requested from vendor' }), ...w.activity] })); ctx.toast(`Reminder logged for ${vName(id)}`); };

  const jobCols: Col<JobRow>[] = [
    { key: 'id', label: 'Job', text: j => j.id, render: j => <b>{j.id}</b> },
    { key: 'vendor', label: 'Vendor', width: 220, text: j => vName(j.vendorId), render: j => <span className="rw-stack"><b>{vName(j.vendorId)}</b><small>{j.fileName}</small></span> },
    { key: 'status', label: 'Status', text: j => j.status, render: j => <Pill tone={statusTone(j.status)}>{j.status}</Pill> },
    { key: 'by', label: 'Uploaded by', text: j => `${j.uploadedBy} ${j.uploadedAt}`, sort: j => Date.parse(j.uploadedAt.replace(/-/g, ' ')) || 0, render: j => <span className="rw-stack"><span>{j.uploadedBy}</span><small>{j.uploadedAt}</small></span> },
    { key: 'rows', label: 'Rows', align: 'right', text: j => String(j.rows.length), sort: j => j.rows.length },
    { key: 'period', label: 'Ledger period', text: j => `${j.from} – ${j.to}` },
    { key: 'prior', label: 'Prior closing', group: 'Balance check', align: 'right', text: j => num(j.priorClosing, 2), sort: j => j.priorClosing },
    { key: 'open', label: 'Current opening', group: 'Balance check', align: 'right', text: j => num(j.currentOpening, 2), sort: j => j.currentOpening ?? 0 },
    { key: 'var', label: 'Variance', group: 'Balance check', align: 'right', text: j => j.currentOpening === null ? 'No opening row' : num(j.currentOpening - j.priorClosing, 2), render: j => j.currentOpening === null ? <span className="rw-neg">No opening row</span> : Math.abs(j.currentOpening - j.priorClosing) > 0.5 ? <span className="rw-neg">{num(j.currentOpening - j.priorClosing, 2)}</span> : <span className="rw-ok">✓ agrees</span> },
    { key: 'docs', label: 'Files', noToggle: true, text: () => '', render: j => <span className="rw-docs" onClick={e => e.stopPropagation()}><button onClick={() => download(j.fileName, toCSV(j.rows))} title="Download the file as received">Source</button>
      <button disabled={!j.latest} onClick={() => download(`${j.vendorId}_open-items.csv`, toCSV(r.exceptions.filter(e => e.vendorId === j.vendorId).map(e => ({ 'Item': e.id, 'Category': e.category, 'References': e.refs.join(' | '), 'Effect on difference': e.balanceEffect, 'Status': e.status }))))} title="Open items raised from this file">Items</button></span> },
  ];

  return <>
    <PageHead n="01" title="Collect vendor ledgers" actions={<button className="rw-btn lime" onClick={() => setUploadFor(vendor === 'ALL' ? '' : vendor)}><Icon n="upload" /> Upload a statement</button>}>
      Every vendor’s statement of account for {PERIOD.label}, checked against the opening balance agreed last period before it is reconciled.
    </PageHead>
    <div className="rd-progress">
      <div><span className="rd-k">Statements received</span><b>{received} <i>of {vendors.length}</i></b><Meter value={vendors.length ? received / vendors.length : 0} /></div>
      <div><span className="rd-k">Opening balance agrees</span><b>{ok} <i>of {received}</i></b><Meter value={received ? ok / received : 0} tone={ok < received ? 'warn' : ''} /></div>
      <div className="rd-seg-wrap"><div className="rw-seg">
        <button className={!filter ? 'on' : ''} onClick={() => setFilter('')}>All {vendors.length}</button>
        <button className={filter === 'pending' ? 'on' : ''} onClick={() => setFilter('pending')}>Awaited {vendors.length - received}</button>
        <button className={filter === 'variance' ? 'on' : ''} onClick={() => setFilter('variance')}>Balance check fails {received - ok}</button></div></div>
    </div>
    <div className="rd-vcards">{shown.map(({ s, j, v, status, variance, balanceOk }) => <article key={s.id} className={'rd-vcard ' + statusTone(status)}>
      <header><span className={'rw-dot ' + statusTone(status)} /><div><b>{s.name}</b><small>{s.id} · {s.category}</small></div></header>
      {j ? <>
        <dl><div><dt>Received</dt><dd>{j.uploadedAt.split(' ')[0]}</dd></div><div><dt>Rows</dt><dd>{j.rows.length}</dd></div><div><dt>Difference</dt><dd className={v && Math.abs(v.variance) > 0.5 ? 'rw-neg' : 'rw-ok'}>{v ? short(v.variance) : '—'}</dd></div></dl>
        <p className={'rd-check ' + (balanceOk ? 'ok' : 'bad')}>{balanceOk ? '✓ Opening balance agrees with last period' : variance === null ? '! No opening balance row on the statement' : `! Opening differs from agreed closing by ${inr(variance)}`}</p>
        <footer><button className="rw-btn small" onClick={() => go('vendor', s.id)}>Open</button><button className="rw-btn small ghost" onClick={() => setJob({ ...j, latest: true, status })}>File check</button><button className="rw-btn small ghost" onClick={() => setUploadFor(s.id)}>Re-upload</button></footer>
      </> : <>
        <p className="rd-await">Statement not received.{ws.requested[s.id] ? <> Requested {ws.requested[s.id]}.</> : ''}</p>
        <dl><div><dt>Buyer ledger shows</dt><dd>{short(ledgerBalance(ws.data, s.id))}</dd></div></dl>
        <footer><button className="rw-btn small lime" onClick={() => setUploadFor(s.id)}><Icon n="upload" s={14} /> Upload</button><button className="rw-btn small ghost" onClick={() => request(s.id)}>{ws.requested[s.id] ? 'Send reminder' : 'Request statement'}</button></footer>
      </>}
    </article>)}</div>
    <Card title="Upload history" tip="Every file received, newest first. A later upload for the same vendor supersedes the earlier one; the old file stays on record.">
      <DataTable rows={jobs} cols={jobCols} rowKey={j => j.id} fileName="upload-history.csv" onRowClick={setJob} activeKey={job?.id} empty="No statements uploaded yet." />
    </Card>
    {uploadFor !== null && <UploadWizard ctx={ctx} initial={uploadFor} onClose={() => setUploadFor(null)} />}
    {job && <JobDrawer ctx={ctx} job={job} onClose={() => setJob(null)} />}
  </>;
}

const STEPS = ['Vendor and period', 'File', 'Map columns', 'Review'];

function UploadWizard({ ctx, initial, onClose }: { ctx: Ctx; initial: string; onClose: () => void }) {
  const { ws, vName, undoable, setWs, go } = ctx;
  const firstPending = ws.data.suppliers.find(s => vendorStatus(ws, s.id) === 'Ledger not received')?.id;
  const [step, setStep] = useState(initial ? 1 : 0);
  const [v, setV] = useState(initial || firstPending || ws.data.suppliers[0].id);
  const [from, setFrom] = useState(PERIOD.months[0]); const [to, setTo] = useState(PERIOD.months[2]);
  const [comments, setComments] = useState('');
  const [file, setFile] = useState<{ name: string; columns: string[]; rows: Record<string, string>[] } | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [fileError, setFileError] = useState(''); const [drag, setDrag] = useState(false);
  const prep = useMemo(() => file ? prepareUpload(v, file.columns, file.rows, mapping) : null, [file, v, mapping]);
  const prior = agreedOpening(ws.data, v);
  const periodError = PERIOD.months.indexOf(to) < PERIOD.months.indexOf(from) ? '“To” must be the same as or after “From”.' : '';
  const take = async (f: File | undefined) => {
    setFileError(''); if (!f) return;
    if (/\.(xlsx|xlsb|xls)$/i.test(f.name)) { setFileError('Excel workbooks are not read in this demo. In Excel use File → Save As → CSV UTF-8, then upload the CSV.'); return; }
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') { setFileError('Upload a .csv file.'); return; }
    if (f.size > 5 * 1024 * 1024) { setFileError('This demo accepts files up to 5 MB.'); return; }
    const p = parseCSV(await f.text());
    if (!p.columns.length) { setFileError('The file is empty.'); return; }
    setFile({ name: f.name, ...p }); setMapping(autoMap(p.columns)); setStep(2);
  };
  const mapped = FIELDS.filter(f => mapping[f.key]).length;
  const canNext = step === 0 ? !periodError : step === 1 ? !!file : step === 2 ? !!prep && !prep.errors.length : false;
  const submit = () => {
    if (!file || !prep || prep.errors.length) return;
    undoable(`${vName(v)}: ${prep.rows.length} rows uploaded and reconciled`, () => setWs(w => applyUpload(w, v, prep.rows, { fileName: file.name, from, to, comments })));
    onClose(); go('vendor', v);
  };
  const sample = (kind: 'clean' | 'messy') => {
    const rows = sampleRows(ws, v);
    if (kind === 'clean') return download(`${v}_statement_sample.csv`, toCSV(rows));
    // The same statement with the headers and labels a vendor's own system might use, to try the column mapping.
    const ren: Record<string, string> = { 'Document Type': 'Vch Type', 'Supplier Invoice Number': 'Bill No', 'Invoice Date': 'Date', 'Invoice Amount': 'Debit', 'Payment Received': 'Credit', 'Credit Note Reference': 'CN No', 'Debit Note Reference': 'DN No', 'Description': 'Narration', 'Supplier Name': 'Party Name' };
    const lab: Record<string, string> = { 'Invoice': 'Tax Invoice', 'Receipt': 'Bank Receipt', 'Credit Note': 'CN', 'Debit Note': 'DN', 'Opening Balance': 'Balance B/F' };
    download(`${v}_statement_own-format.csv`, toCSV(rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !['Supplier Transaction ID', 'Vendor ID', 'Statement Date', 'Outstanding Balance'].includes(k)).map(([k, x]) => [ren[k] ?? k, k === 'Document Type' ? lab[x] ?? x : x])))));
  };
  return <Drawer wide title="Upload a statement" sub={`Step ${step + 1} of 4 · ${STEPS[step]}`} onClose={onClose}>
    <ol className="rd-wiz">{STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'cur' : ''}><button disabled={i > step} onClick={() => setStep(i)}><span>{i < step ? '✓' : i + 1}</span>{s}</button></li>)}</ol>

    {step === 0 && <>
      <label className="rw-field"><span>Vendor</span><select value={v} onChange={e => setV(e.target.value)}>{ws.data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name} · {vendorStatus(ws, s.id)}</option>)}</select></label>
      {vendorStatus(ws, v) !== 'Ledger not received' && <p className="rw-note warn">A statement is already on file for {vName(v)}. Uploading replaces it{ws.vendorSign[v] || ws.buyerSign[v] ? ' and withdraws the existing sign-off' : ''}.</p>}
      <div className="rw-row2">
        <label className="rw-field"><span>Ledger from</span><select value={from} onChange={e => setFrom(e.target.value)}>{PERIOD.months.map(m => <option key={m}>{m}</option>)}</select></label>
        <label className="rw-field"><span>Ledger to</span><select value={to} onChange={e => setTo(e.target.value)}>{PERIOD.months.map(m => <option key={m}>{m}</option>)}</select></label>
      </div>
      {periodError && <p className="rw-err">{periodError}</p>}
      <label className="rw-field"><span>Comments <i>(optional)</i></span><textarea rows={3} value={comments} onChange={e => setComments(e.target.value)} placeholder="e.g. Revised statement after our call on 12 July" /></label>
    </>}

    {step === 1 && <>
      <label className={'rw-drop' + (drag ? ' drag' : '')} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files[0]); }}>
        <input type="file" accept=".csv,text/csv" onChange={e => take(e.target.files?.[0])} />
        <Icon n="upload" s={26} /><b>{file ? file.name : `Drop ${vName(v).split(' ')[0]}’s statement here, or click to choose`}</b><small>CSV · up to 5 MB · any column names, you map them next</small>
      </label>
      {fileError && <p className="rw-err">{fileError}</p>}
      <div className="rd-samples"><span>No file to hand? Try one:</span><button className="rw-link" onClick={() => sample('clean')}>Sample in standard format</button><button className="rw-link" onClick={() => sample('messy')}>Same data in the vendor’s own format</button></div>
    </>}

    {step === 2 && file && prep && <>
      <p className="rw-note">{mapped} of {FIELDS.length} fields matched automatically from <b>{file.name}</b> ({file.rows.length} rows). Check each one; required fields are marked.</p>
      <div className="rd-map-grid">{FIELDS.map(f => { const col = mapping[f.key]; const ex = col ? file.rows.slice(0, 3).map(r => r[col]).filter(Boolean).join(' · ') : '';
        return <div key={f.key} className={'rd-map-row' + (f.required && !col ? ' miss' : col ? ' ok' : '')}>
          <span><b>{f.label}{f.required && <i className="req"> *</i>}</b><small>{f.key}</small></span>
          <select value={col} onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })} aria-label={`Column for ${f.label}`}><option value="">— not in file —</option>{file.columns.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <small className="ex">{ex || (f.required ? 'Required' : 'Optional')}</small></div>; })}</div>
      {prep.errors.length > 0 && <ul className="rw-errs">{prep.errors.map(x => <li key={x}>{x}</li>)}</ul>}
    </>}

    {step === 3 && file && prep && <>
      <dl className="rw-dl four"><div><dt>Rows</dt><dd>{prep.rows.length}</dd></div><div><dt>To set aside</dt><dd className={prep.setAside.length ? 'rw-neg' : ''}>{prep.setAside.length}</dd></div><div><dt>Labels standardised</dt><dd>{prep.typeFixes}</dd></div><div><dt>IDs generated</dt><dd>{prep.generatedIds}</dd></div></dl>
      <h4 className="rw-h4">Balance check</h4>
      <div className={'rd-balcheck ' + (prep.opening !== null && Math.abs(prep.opening - prior) < 0.5 ? 'ok' : 'bad')}>
        <div><span>Agreed closing, last period</span><b>{inr(prior, 2)}</b></div><div><span>Opening on this statement</span><b>{prep.opening === null ? 'Not found' : inr(prep.opening, 2)}</b></div>
        <div><span>Result</span><b>{prep.opening === null ? 'Cannot check' : Math.abs(prep.opening - prior) < 0.5 ? '✓ Agrees' : `Differs by ${inr(prep.opening - prior, 2)}`}</b></div></div>
      <h4 className="rw-h4">What is in the file</h4>
      <div className="rd-types">{Object.entries(prep.byType).map(([t, n]) => <span key={t}><b>{n}</b> {t}</span>)}</div>
      {prep.warnings.map(w => <p key={w} className="rw-note warn">{w}</p>)}
      {prep.setAside.length > 0 && <ul className="rw-errs">{prep.setAside.slice(0, 6).map(x => <li key={x.row}>Row {x.row}: {x.reason}</li>)}{prep.setAside.length > 6 && <li>…and {prep.setAside.length - 6} more</li>}</ul>}
      <h4 className="rw-h4">Preview · first 5 rows after mapping</h4>
      <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr>{['Document Type', 'Supplier Invoice Number', 'Invoice Date', 'Invoice Amount', 'Payment Received'].map(c => <th key={c}>{FIELDS.find(f => f.key === c)!.label}</th>)}</tr></thead>
        <tbody>{prep.rows.slice(0, 5).map((x, i) => <tr key={i}>{['Document Type', 'Supplier Invoice Number', 'Invoice Date', 'Invoice Amount', 'Payment Received'].map(c => <td key={c}>{x[c]}</td>)}</tr>)}</tbody></table></div>
    </>}

    <div className="rw-drawer-foot">
      {step > 0 && <button className="rw-btn ghost" onClick={() => setStep(step - 1)}>← Back</button>}
      <span className="sp" />
      {step < 3 ? <button className="rw-btn lime" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue →</button>
        : <button className="rw-btn lime" disabled={!prep || prep.errors.length > 0} onClick={submit}><Icon n="upload" /> Upload and reconcile</button>}
    </div>
  </Drawer>;
}

function JobDrawer({ ctx, job, onClose }: { ctx: Ctx; job: JobRow; onClose: () => void }) {
  const { r, vName } = ctx;
  const ids = new Set(job.rows.map(x => (x['Supplier Transaction ID'] ?? '').trim()));
  const rejected = job.latest ? r.normalized.rejections.filter(j => j.dataset === 'Supplier statements' && ids.has(j.recordId)) : [];
  const changes = job.latest ? r.normalized.changes.filter(c => c.dataset === 'Supplier statements' && ids.has(c.recordId)) : [];
  const accepted = job.latest ? r.normalized.supplier.filter(s => ids.has(s.id)).length : null;
  const variance = job.currentOpening === null ? null : job.currentOpening - job.priorClosing;
  return <Drawer wide title={`${job.id} · file check`} sub={`${vName(job.vendorId)} · ${job.fileName} · ${job.uploadedBy}, ${job.uploadedAt}`} onClose={onClose}>
    {job.comments && <p className="rw-note">“{job.comments}”</p>}
    {job.latest ? <dl className="rw-dl four"><div><dt>Rows received</dt><dd>{job.rows.length}</dd></div><div><dt>Reconciled</dt><dd>{accepted}</dd></div><div><dt>Set aside</dt><dd className={rejected.length ? 'rw-neg' : ''}>{rejected.length}</dd></div><div><dt>Values cleaned</dt><dd>{changes.length}</dd></div></dl>
      : <p className="rw-note">A later upload replaced this file; the engine no longer uses it.</p>}
    {rejected.length > 0 && <><h4 className="rw-h4">Set aside, with reasons</h4><ul className="rw-errs">{rejected.map((j, i) => <li key={j.recordId + i}><b>{j.recordId}</b>: {j.reasons.join('; ')}</li>)}</ul></>}
    <h4 className="rw-h4">Balance check</h4>
    <div className={'rd-balcheck ' + (variance !== null && Math.abs(variance) < 0.5 ? 'ok' : 'bad')}>
      <div><span>Agreed closing at 31-Mar-2026</span><b>{inr(job.priorClosing, 2)}</b></div><div><span>Opening on statement</span><b>{inr(job.currentOpening, 2)}</b></div>
      <div><span>Result</span><b>{variance === null ? 'No opening row' : Math.abs(variance) < 0.5 ? '✓ Agrees' : `Differs by ${inr(variance, 2)}`}</b></div></div>
    {changes.length > 0 && <><h4 className="rw-h4">Cleaning log</h4><p className="rw-note">Original values are kept next to every cleaned value. Nothing changes silently.</p>
      <DataTable rows={changes} cols={[
        { key: 'rec', label: 'Record', text: c => c.recordId }, { key: 'f', label: 'Field', text: c => c.field },
        { key: 'raw', label: 'As received', text: c => c.raw, render: c => <code>{JSON.stringify(c.raw)}</code> }, { key: 'n', label: 'Cleaned to', text: c => c.normalized, render: c => <code>{c.normalized}</code> },
      ]} rowKey={c => c.recordId + c.field} fileName={`${job.id}_cleaning-log.csv`} pageSize={5} /></>}
  </Drawer>;
}
