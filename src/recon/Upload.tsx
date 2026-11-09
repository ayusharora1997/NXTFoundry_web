import React, { useEffect, useMemo, useState } from 'react';
import { toCSV } from './engine';
import { agreedOpening, applyUpload, checkUpload, ledgerBalance, sampleRows, vendorStatus, PERIOD, ENTITY, type Job } from './model';
import { Card, DataTable, Drawer, Icon, Pill, download, inr, num, statusTone, type Col } from './ui';
import type { Ctx } from './App';

interface BalRow { id: string; name: string; status: string; entityCB: number; vendorCB: number | null; diff: number | null }
interface JobRow extends Job { status: string; latest: boolean }

export default function UploadScreen({ ctx }: { ctx: Ctx }) {
  const { ws, r, vendor, vName } = ctx;
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (ctx.focus.upload) { setUploadFor(ctx.focus.upload); ctx.clearFocus(); } }, [ctx.focus.upload]);
  const vf = (id: string) => vendor === 'ALL' || id === vendor;

  const balances: BalRow[] = ws.data.suppliers.filter(s => vf(s.id)).map(s => {
    const v = r.vendors.find(x => x.vendorId === s.id);
    return { id: s.id, name: s.name, status: vendorStatus(ws, s.id), entityCB: v ? v.buyerBalance : ledgerBalance(ws.data, s.id), vendorCB: v ? v.supplierBalance : null, diff: v ? v.variance : null };
  });
  const latest = new Map<string, string>(); ws.jobs.forEach(j => { if (!latest.has(j.vendorId)) latest.set(j.vendorId, j.id); });
  const jobs: JobRow[] = ws.jobs.filter(j => vf(j.vendorId)).map(j => ({ ...j, latest: latest.get(j.vendorId) === j.id, status: latest.get(j.vendorId) === j.id ? vendorStatus(ws, j.vendorId) : 'Superseded' }));

  const docs = (j: JobRow) => {
    const recs = r.normalized.supplier.filter(s => s.vendorId === j.vendorId);
    const ex = r.exceptions.filter(e => e.vendorId === j.vendorId);
    return <span className="rw-docs" onClick={e => e.stopPropagation()}>
      <button onClick={() => download(j.fileName, toCSV(j.rows))} title="Source file as uploaded">SRC</button>
      <button disabled={!j.latest} onClick={() => download(`${j.vendorId}_cleaned.csv`, toCSV(recs.map(x => ({ 'Record': x.id, 'Document type': x.docType, 'Reference': x.rawRef, 'Matching key': x.ref, 'Date': new Date(x.date).toISOString().slice(0, 10), 'Amount': x.amount, 'Vendor ID resolved via': x.vendorVia }))))} title="Cleaned records the engine used">CLEAN</button>
      <button disabled={!j.latest || !ex.length} onClick={() => download(`${j.vendorId}_exceptions.csv`, toCSV(ex.map(e => ({ 'Exception': e.id, 'Category': e.category, 'Type': e.nature, 'References': e.refs.join(' | '), 'Effect on difference': e.balanceEffect, 'Impact': e.impact, 'Status': e.status }))))} title="Exceptions raised for this vendor">EXC</button>
    </span>;
  };
  const balCols: Col<BalRow>[] = [
    { key: 'entity', label: 'Entity', text: () => ENTITY, width: 200 },
    { key: 'vendor', label: 'Vendor', text: x => x.name, width: 240, render: x => <b>{x.name}</b> },
    { key: 'status', label: 'Status', text: x => x.status, render: x => <Pill tone={statusTone(x.status)}>{x.status}</Pill> },
    { key: 'ecb', label: 'Entity closing balance (CB)', align: 'right', text: x => num(x.entityCB, 2), sort: x => x.entityCB, total: xs => num(xs.reduce((s, x) => s + x.entityCB, 0), 2) },
    { key: 'vcb', label: 'Vendor closing balance (CB)', align: 'right', text: x => num(x.vendorCB, 2), sort: x => x.vendorCB ?? 0, total: xs => num(xs.reduce((s, x) => s + (x.vendorCB ?? 0), 0), 2) },
    { key: 'diff', label: 'Difference', sub: 'entity − vendor', align: 'right', text: x => num(x.diff, 2), sort: x => x.diff ?? 0, render: x => <span className={x.diff && Math.abs(x.diff) > 0.5 ? 'rw-neg' : ''}>{num(x.diff, 2)}</span>, total: xs => num(xs.reduce((s, x) => s + (x.diff ?? 0), 0), 2) },
    { key: 'act', label: '', noToggle: true, text: () => '', render: x => <button className="rw-btn small" onClick={e => { e.stopPropagation(); setUploadFor(x.id); }}><Icon n="upload" s={14} /> {x.status === 'Ledger not received' ? 'Upload' : 'Re-upload'}</button> },
  ];
  const jobCols: Col<JobRow>[] = [
    { key: 'id', label: 'Job ID', text: j => j.id, render: j => <button className="rw-link" onClick={e => { e.stopPropagation(); setJob(j); }}>{j.id}</button> },
    { key: 'status', label: 'Status', text: j => j.status, render: j => <Pill tone={statusTone(j.status)}>{j.status}</Pill> },
    { key: 'vendor', label: 'Vendor / user', width: 230, text: j => `${vName(j.vendorId)} ${j.uploadedBy}`, render: j => <span className="rw-stack"><b>{vName(j.vendorId)}</b><small>{j.uploadedBy}</small></span> },
    { key: 'at', label: 'Uploaded', text: j => j.uploadedAt, sort: j => Date.parse(j.uploadedAt.replace(/-/g, ' ')) || 0 },
    { key: 'period', label: 'Periods', text: j => `Ledger ${j.from} – ${j.to}`, render: j => <span className="rw-stack"><small><i>Ledger</i> {j.from} – {j.to}</small><small><i>Recon</i> {PERIOD.months[0]} – {PERIOD.months[2]}</small></span> },
    { key: 'docs', label: 'Documents', noToggle: true, text: j => j.fileName, render: docs },
    { key: 'prior', label: 'Prior closing', group: 'Balance check', align: 'right', text: j => num(j.priorClosing, 2), sort: j => j.priorClosing },
    { key: 'open', label: 'Current opening', group: 'Balance check', align: 'right', text: j => num(j.currentOpening, 2), sort: j => j.currentOpening ?? 0 },
    { key: 'var', label: 'Variance', group: 'Balance check', align: 'right', text: j => j.currentOpening === null ? 'No opening row' : num(j.currentOpening - j.priorClosing, 2), render: j => j.currentOpening === null ? <span className="rw-neg">No opening row</span> : <span className={Math.abs(j.currentOpening - j.priorClosing) > 0.5 ? 'rw-neg' : 'rw-ok'}>{num(j.currentOpening - j.priorClosing, 2)}</span> },
    { key: 'by', label: 'Actioned by', text: j => j.actionedBy },
    { key: 'comments', label: 'Comments', hidden: true, text: j => j.comments },
  ];

  return <>
    {notice && <div className="rw-notice" role="status"><Icon n="check" /> {notice}<button className="rw-iconbtn" onClick={() => setNotice('')} aria-label="Dismiss"><Icon n="x" s={14} /></button></div>}
    <Card title={`Balance for ${PERIOD.label}`} tip="Closing balance per the buyer’s own ledger against the closing balance on the vendor’s statement. The difference is what the reconciliation has to explain." actions={<button className="rw-btn" onClick={() => setUploadFor(vendor === 'ALL' ? '' : vendor)}><Icon n="upload" /> Upload ledger</button>}>
      <DataTable rows={balances} cols={balCols} rowKey={x => x.id} fileName="vendor-balances.csv" pageSize={vendor === 'ALL' ? 10 : 5} />
    </Card>
    <Card title="All uploaded ledgers" tip="Every statement received, newest first. The balance check compares the opening balance on the statement with the closing balance agreed at the end of the previous period; a variance means the vendor’s opening position has moved.">
      <DataTable rows={jobs} cols={jobCols} rowKey={j => j.id} fileName="uploaded-ledgers.csv" onRowClick={setJob} activeKey={job?.id} empty="No ledgers uploaded for this vendor yet." />
    </Card>
    {uploadFor !== null && <UploadDrawer ctx={ctx} initial={uploadFor} onClose={() => setUploadFor(null)} onDone={m => { setNotice(m); setUploadFor(null); }} />}
    {job && <JobDrawer ctx={ctx} job={job} onClose={() => setJob(null)} />}
  </>;
}

function UploadDrawer({ ctx, initial, onClose, onDone }: { ctx: Ctx; initial: string; onClose: () => void; onDone: (msg: string) => void }) {
  const { ws, setWs, vName } = ctx;
  const firstPending = ws.data.suppliers.find(s => vendorStatus(ws, s.id) === 'Ledger not received')?.id;
  const [v, setV] = useState(initial || firstPending || ws.data.suppliers[0].id);
  const [from, setFrom] = useState(PERIOD.months[0]); const [to, setTo] = useState(PERIOD.months[2]);
  const [comments, setComments] = useState('');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState(''); const [drag, setDrag] = useState(false);
  const check = useMemo(() => file ? checkUpload(v, file.text) : null, [file, v]);
  const prior = agreedOpening(ws.data, v);
  const status = vendorStatus(ws, v);
  const periodError = PERIOD.months.indexOf(to) < PERIOD.months.indexOf(from) ? '“To” must be the same as or after “From”.' : '';
  const take = async (f: File | undefined) => {
    setFileError(''); setFile(null); if (!f) return;
    if (/\.(xlsx|xlsb|xls)$/i.test(f.name)) { setFileError('Excel workbooks are not read in this demo. In Excel use File → Save As → CSV UTF-8, then upload the CSV.'); return; }
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') { setFileError('Upload a .csv file.'); return; }
    if (f.size > 5 * 1024 * 1024) { setFileError('This demo accepts files up to 5 MB.'); return; }
    setFile({ name: f.name, text: await f.text() });
  };
  const submit = () => {
    if (!file || !check || check.errors.length || periodError) return;
    setWs(w => applyUpload(w, v, check.rows, { fileName: file.name, from, to, comments }));
    onDone(`${vName(v)}: ${check.rows.length} rows received and reconciled. See the Reconciliation summary for the result.`);
  };
  const preview = ['Supplier Transaction ID', 'Document Type', 'Supplier Invoice Number', 'Invoice Date', 'Invoice Amount', 'Payment Received'];
  return <Drawer title="Upload ledger" sub="Vendor statement of account, as a CSV file. The engine reconciles it as soon as it is uploaded." onClose={onClose}>
    <label className="rw-field"><span>Vendor</span><select value={v} onChange={e => { setV(e.target.value); }}>{ws.data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name} · {vendorStatus(ws, s.id)}</option>)}</select></label>
    {status !== 'Ledger not received' && <p className="rw-note warn">A ledger is already on file for this vendor. Uploading replaces it{ws.vendorSign[v] || ws.buyerSign[v] ? ' and withdraws the existing sign-off' : ''}.</p>}
    <fieldset className="rw-field"><legend>Ledger type</legend><label className="rw-radio"><input type="radio" checked readOnly /> Complete (full) ledger</label></fieldset>
    <div className="rw-row2">
      <label className="rw-field"><span>From</span><select value={from} onChange={e => setFrom(e.target.value)}>{PERIOD.months.map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="rw-field"><span>To</span><select value={to} onChange={e => setTo(e.target.value)}>{PERIOD.months.map(m => <option key={m}>{m}</option>)}</select></label>
    </div>
    {periodError && <p className="rw-err">{periodError}</p>}
    <label className="rw-field"><span>Comments <i>(optional)</i></span><textarea rows={3} value={comments} onChange={e => setComments(e.target.value)} placeholder="Add any remark for this ledger upload…" /></label>
    <div className="rw-field"><span>Attach file <b className="req">*</b></span>
      <label className={'rw-drop' + (drag ? ' drag' : '')} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files[0]); }}>
        <input type="file" accept=".csv,text/csv" onChange={e => take(e.target.files?.[0])} />
        <Icon n="upload" s={22} /><b>{file ? file.name : 'Click to upload or drag & drop'}</b><small>CSV · up to 5 MB · one vendor per file</small>
      </label>
      <button className="rw-link" onClick={() => download(`${v}_statement_sample.csv`, toCSV(sampleRows(ws, v)))}>Download a sample statement for {vName(v)}</button>
    </div>
    {fileError && <p className="rw-err">{fileError}</p>}
    {check && <div className="rw-preview">
      <h4 className="rw-h4">File check</h4>
      <dl className="rw-dl"><div><dt>Rows</dt><dd>{check.rows.length}</dd></div><div><dt>Columns</dt><dd>{check.columns.length}</dd></div><div><dt>Prior closing (agreed)</dt><dd>{inr(prior, 2)}</dd></div><div><dt>Opening on statement</dt><dd>{check.opening === null ? 'Not found' : inr(check.opening, 2)}</dd></div></dl>
      {check.errors.length > 0 ? <ul className="rw-errs">{check.errors.map(x => <li key={x}>{x}</li>)}</ul>
        : <p className="rw-note ok">Columns look right. {check.opening !== null && Math.abs(check.opening - prior) > 0.5 ? `Opening balance differs from the agreed closing by ${inr(check.opening - prior, 2)}; it will show as a balance check variance.` : 'Opening balance agrees with the prior period.'} Rows with bad dates or amounts are set aside with a reason, not dropped silently.</p>}
      {check.rows.length > 0 && <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr>{preview.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{check.rows.slice(0, 5).map((x, i) => <tr key={i}>{preview.map(c => <td key={c}>{x[c]}</td>)}</tr>)}</tbody></table></div>}
    </div>}
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><button className="rw-btn lime" disabled={!check || check.errors.length > 0 || !!periodError} onClick={submit}><Icon n="upload" /> Upload & reconcile</button></div>
  </Drawer>;
}

function JobDrawer({ ctx, job, onClose }: { ctx: Ctx; job: JobRow; onClose: () => void }) {
  const { r, vName } = ctx;
  const ids = new Set(job.rows.map(x => (x['Supplier Transaction ID'] ?? '').trim()));
  const rejected = job.latest ? r.normalized.rejections.filter(j => j.dataset === 'Supplier statements' && ids.has(j.recordId)) : [];
  const changes = job.latest ? r.normalized.changes.filter(c => c.dataset === 'Supplier statements' && ids.has(c.recordId)) : [];
  const accepted = job.latest ? r.normalized.supplier.filter(s => ids.has(s.id)).length : null;
  const variance = job.currentOpening === null ? null : job.currentOpening - job.priorClosing;
  return <Drawer wide title={job.id} sub={`${vName(job.vendorId)} · ${job.fileName}`} onClose={onClose}>
    <dl className="rw-dl four"><div><dt>Status</dt><dd><Pill tone={statusTone(job.status)}>{job.status}</Pill></dd></div><div><dt>Uploaded</dt><dd>{job.uploadedAt}</dd></div><div><dt>By</dt><dd>{job.uploadedBy}</dd></div><div><dt>Ledger period</dt><dd>{job.from} – {job.to}</dd></div></dl>
    {job.comments && <p className="rw-note">“{job.comments}”</p>}
    <h4 className="rw-h4">Data quality</h4>
    {job.latest ? <dl className="rw-dl four"><div><dt>Rows received</dt><dd>{job.rows.length}</dd></div><div><dt>Accepted</dt><dd>{accepted}</dd></div><div><dt>Set aside</dt><dd className={rejected.length ? 'rw-neg' : ''}>{rejected.length}</dd></div><div><dt>Values cleaned</dt><dd>{changes.length}</dd></div></dl>
      : <p className="rw-note">This file was replaced by a later upload; the engine no longer uses it.</p>}
    {rejected.length > 0 && <ul className="rw-errs">{rejected.map((j, i) => <li key={j.recordId + i}><b>{j.recordId}</b> — {j.reasons.join('; ')}</li>)}</ul>}
    <h4 className="rw-h4">Balance check</h4>
    <dl className="rw-dl"><div><dt>Prior closing (agreed at 31-Mar-2026)</dt><dd>{inr(job.priorClosing, 2)}</dd></div><div><dt>Current opening (on statement)</dt><dd>{inr(job.currentOpening, 2)}</dd></div><div><dt>Variance</dt><dd className={variance && Math.abs(variance) > 0.5 ? 'rw-neg' : 'rw-ok'}>{variance === null ? 'No opening balance row' : inr(variance, 2)}</dd></div></dl>
    {changes.length > 0 && <><h4 className="rw-h4">Cleaning log</h4><p className="rw-note">Original values are kept next to every cleaned value. Nothing is changed silently.</p>
      <DataTable rows={changes} cols={[
        { key: 'rec', label: 'Record', text: c => c.recordId }, { key: 'f', label: 'Field', text: c => c.field },
        { key: 'raw', label: 'Original', text: c => c.raw, render: c => <code>{JSON.stringify(c.raw)}</code> }, { key: 'n', label: 'Cleaned', text: c => c.normalized, render: c => <code>{c.normalized}</code> },
      ]} rowKey={c => c.recordId + c.field} fileName={`${job.id}_cleaning-log.csv`} pageSize={5} /></>}
  </Drawer>;
}
