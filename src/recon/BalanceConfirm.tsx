import React, { useState } from 'react';
import { periodsFor, tagLabel, BUYER, TODAY, ENTITIES } from './ledger';
import { fmtDay, LEDGER_COLUMNS, type RelState } from './cycle';
import { stampAt, type BcRec, type BcStatus } from './store';
import { xlsx, saveBlob } from './xlsx';
import { Card, DataTable, Drawer, Icon, Pill, Avatar, money, type Col } from './ui';
import { PageHead, vendorOf, entityOf, type Ctx } from './App';
import { UploadLedgerDrawer } from './LedgerUpload';

// Balance confirmation: the buyer's closing balance is sent to the vendor. Agreed → certificate, no reconciliation for that
// period. Disagreed → the vendor reconciles on their side from our ledger, or uploads theirs and the tool reconciles it.
const DAY = 86400000;
export const BC_TONE: Record<BcStatus, string> = { 'Not sent': 'grey', 'Awaiting response': 'amber', Escalated: 'red', Confirmed: 'green', Disputed: 'violet' };
const shown = (b: BcRec, c?: Cert | null) => b.status === 'Disputed' ? (c ? 'Reconciled · certified' : b.route === 'upload' ? 'Disputed · ledger uploaded' : 'Disputed · reconciling on their side') : b.status === 'Confirmed' ? 'Confirmed · certified' : b.status;
/** A certificate exists once the balance is agreed: directly (confirmed) or after the reconciliation was signed off. */
interface Cert { no: string; kind: 'confirmed' | 'reconciled'; at: string; by: string }
export function certOf(ctx: Pick<Ctx, 'ws'>, b: BcRec): Cert | null {
  if (b.status === 'Confirmed') return { no: b.certNo ?? `BCC-${b.tag}-${b.relId}`, kind: 'confirmed', at: b.respondedAt ?? '', by: b.respondedBy ?? '' };
  const p = ctx.ws.states[b.relId]?.periods.find(x => x.tag === b.tag);
  if (b.status === 'Disputed' && p && (p.phase === 'signed' || p.phase === 'closed') && !p.confirmed) { const sg = [...p.signoffs].reverse().find(x => x.event === 'signed'); return { no: `BCC-${b.tag}-${b.relId}`, kind: 'reconciled', at: sg?.at ?? p.dates.closed ?? '', by: [...p.signoffs].reverse().find(x => x.event === 'accepted')?.rep ?? b.respondedBy ?? '' }; }
  return null;
}
const dueText = (b: BcRec) => { if (!b.dueMs || b.status === 'Confirmed' || b.status === 'Disputed' || b.status === 'Not sent') return ''; const d = Math.round((b.dueMs - TODAY) / DAY); return d >= 0 ? `Due in ${d} day${d === 1 ? '' : 's'}` : `Overdue by ${-d} day${d === -1 ? '' : 's'}`; };
const nextAction = (b: BcRec): [string, string] | null => b.status === 'Not sent' ? ['Send BC', 'Balance confirmation sent'] : b.status !== 'Awaiting response' ? null : b.reminders.length === 0 ? ['Send reminder 1', 'Reminder 1 sent'] : b.reminders.length === 1 ? ['Send reminder 2', 'Reminder 2 sent'] : ['Escalate', 'Escalated: no response after reminder 2'];

function defOf(st: RelState, tag: string) { return periodsFor(st.rel).find(d => d.tag === tag)!; }
function downloadLedger(ctx: Ctx, b: BcRec) {
  const st = ctx.ws.states[b.relId]; const f = ctx.ws.files.find(x => x.relId === b.relId && x.periodTag === b.tag && x.side === 'B' && x.kind === 'period');
  if (!f) { ctx.toast('Our ledger for this period is not available yet.', 'warn'); return; }
  const cols = LEDGER_COLUMNS.filter(c => f.rows.some(r => r[c] !== undefined));
  const n = (v: string) => v === '' || isNaN(Number(v)) ? v : Number(v);
  saveBlob(`${st.rel.vendorCode}_${b.tag}_buyer-ledger.xlsx`, xlsx([{ name: 'Ledger', widths: cols.map(c => c === 'Narration' ? 34 : 15), rows: [
    [`Ledger of ${vendorOf(st).legalName} in the books of ${entityOf(st).name}`], [`Period ${tagLabel(b.tag)} · opening ${f.opening ?? ''} · closing ${f.closing ?? ''} · ${st.rel.currency}`], [],
    cols, ...f.rows.map(r => cols.map(c => n(r[c] ?? '')))] }]));
}
function downloadCert(ctx: Ctx, b: BcRec) {
  const c = certOf(ctx, b); if (!c) return; const st = ctx.ws.states[b.relId]; const d = defOf(st, b.tag); const p = st.periods.find(x => x.tag === b.tag);
  saveBlob(`${c.no}.xlsx`, xlsx([{ name: 'Certificate', widths: [30, 70], rows: [
    ['Balance confirmation certificate', c.no], ['Buyer entity', entityOf(st).name], ['Vendor', `${vendorOf(st).legalName} (${st.rel.vendorCode})`], ['Business unit', st.rel.bu],
    ['Period', `${fmtDay(d.start)} to ${fmtDay(d.end)}`], ['Balance as on', fmtDay(d.end)], ['Currency', st.rel.currency],
    ['Closing balance per buyer', b.balance], ...(c.kind === 'reconciled' ? [['Closing balance per vendor', p?.closing.V ?? '']] : []),
    ['Basis', c.kind === 'confirmed' ? 'Confirmed by the vendor without reconciliation' : 'Agreed after reconciliation; statement and annexures signed off'],
    [c.kind === 'confirmed' ? 'Confirmed by' : 'Accepted by (vendor)', c.by], [c.kind === 'confirmed' ? 'Confirmed at' : 'Signed off at', c.at], ['Request', b.id], ['Remarks', b.remarks ?? ''],
    ['Note', c.kind === 'confirmed' ? 'The vendor confirmed this closing balance. No reconciliation is required for this period; open items, if any, stay as they are.' : 'Any difference between the two closing balances is explained item by item in the signed reconciliation statement for this period.']] as (string | number | null)[][] }]));
  ctx.toast(`Certificate ${c.no} downloaded`);
}

export default function BalanceConfirm({ ctx }: { ctx: Ctx }) {
  return ctx.isVendor ? <VendorView ctx={ctx} /> : <BuyerView ctx={ctx} />;
}

// ---------- Buyer: tracker across vendors ----------
function BuyerView({ ctx }: { ctx: Ctx }) {
  const { ws } = ctx; const [f, setF] = useState<BcStatus | ''>(''); const [view, setView] = useState<string | null>(null);
  const mine = ws.bcs.filter(b => ctx.visible.some(s => s.rel.id === b.relId)); const endOf = (b: BcRec) => defOf(ws.states[b.relId], b.tag).end;
  const dates = [...new Set(mine.map(endOf))].sort((x, y) => y - x);
  const [asOf, setAsOf] = useState(() => String(Math.max(...mine.filter(b => b.status !== 'Not sent').map(endOf))));
  const [entity, setEntity] = useState(''); const [bu, setBu] = useState(''); const [cur, setCur] = useState('');
  const all = mine.filter(b => { const r = ws.states[b.relId].rel; return (!asOf || String(endOf(b)) === asOf) && (!entity || r.entityId === entity) && (!bu || r.bu === bu) && (!cur || r.currency === cur); });
  const curs = [...new Set(mine.map(b => ws.states[b.relId].rel.currency))];
  const count = (s: BcStatus) => all.filter(b => b.status === s).length;
  const rows = all.filter(b => !f || b.status === f);
  const act = (b: BcRec) => { const n = nextAction(b); if (!n) return; const at = ctx.at();
    if (b.status === 'Not sent') ctx.updateBc(b.id, { status: 'Awaiting response', sentAt: at, dueMs: Date.now() + 14 * DAY }, n[1]);
    else if (n[0] === 'Escalate') ctx.updateBc(b.id, { status: 'Escalated' }, n[1]);
    else ctx.updateBc(b.id, { reminders: [...b.reminders, at] }, n[1]);
    ctx.toast(`${vendorOf(ws.states[b.relId]).displayName}: ${n[1].toLowerCase()}`); };
  const st = (b: BcRec) => ws.states[b.relId];
  const cols: Col<BcRec>[] = [
    { key: 'code', label: 'Vendor code', text: b => st(b).rel.vendorCode },
    { key: 'v', label: 'Vendor', text: b => vendorOf(st(b)).displayName, render: b => <><b>{vendorOf(st(b)).displayName}</b><br /><small className="rx-muted">{st(b).rel.bu} · {st(b).rel.entityId}</small></> },
    { key: 'cur', label: 'Currency', text: b => st(b).rel.currency },
    { key: 'asof', label: 'As on', text: b => fmtDay(defOf(st(b), b.tag).end) },
    { key: 'per', label: 'Period', text: b => tagLabel(b.tag) },
    { key: 'bal', label: 'Balance as per our books', align: 'right', text: b => String(b.balance), sort: b => b.balance, render: b => <b>{money(b.balance, st(b).rel.currency, 2)}</b> },
    { key: 'sent', label: 'BC sent', text: b => b.sentAt?.split(' ')[0] ?? '—' },
    { key: 'rem', label: 'Reminders', text: b => b.reminders.map((_, i) => `R${i + 1}`).join(' · ') || '—', render: b => b.reminders.length ? b.reminders.map((_, i) => <span key={i} className="rx-tag">R{i + 1} ✓</span>) : <span className="rx-muted">—</span> },
    { key: 'resp', label: 'Vendor response', text: b => shown(b, certOf(ctx, b)), render: b => <><Pill tone={certOf(ctx, b) ? 'green' : BC_TONE[b.status]}>{shown(b, certOf(ctx, b))}</Pill>{dueText(b) && <><br /><small className={dueText(b).startsWith('Overdue') ? 'rx-bc-late' : 'rx-muted'}>{dueText(b)}</small></>}</> },
    { key: 'next', label: 'Reconciliation', text: b => b.status === 'Confirmed' ? 'Not required' : b.status === 'Disputed' ? ctx.stat(st(b), b.tag) : '—',
      render: b => b.status === 'Confirmed' ? <span className="rx-muted">Not required</span> : b.status === 'Disputed' ? <button className="rw-btn small ghost" onClick={e => { e.stopPropagation(); ctx.go(b.route === 'upload' ? 'statement' : 'upload', b.relId, b.tag); }}>{b.route === 'upload' ? ctx.stat(st(b), b.tag) : 'Awaiting ledger'}</button> : <span className="rx-muted">—</span> },
    { key: 'act', label: 'Action', noToggle: true, text: () => '', render: b => { const n = nextAction(b); return <span className="rx-bc-acts">
      <button className="rw-btn small" onClick={e => { e.stopPropagation(); setView(b.id); }}>View</button>
      {n && <button className={'rw-btn small' + (n[0] === 'Escalate' ? '' : ' lime')} onClick={e => { e.stopPropagation(); act(b); }}>{n[0]}</button>}
      {certOf(ctx, b) && <button className="rw-btn small ghost" onClick={e => { e.stopPropagation(); downloadCert(ctx, b); }}><Icon n="download" /> Certificate</button>}</span>; } },
  ];
  const tiles: [string, number, string, BcStatus | ''][] = [['In this cycle', all.length, '', ''], ['Confirmed & certified', count('Confirmed'), 'green', 'Confirmed'], ['Disputed → reconciliation', count('Disputed'), 'violet', 'Disputed'], ['Awaiting response', count('Awaiting response'), 'amber', 'Awaiting response'], ['Escalated', count('Escalated'), 'red', 'Escalated']];
  const vb = view ? ws.bcs.find(b => b.id === view) : undefined;
  return <>
    <PageHead title="Balance confirmation">Send each vendor our closing balance. If they agree, a confirmation certificate is issued and that period needs no reconciliation. If they don’t, they reconcile from our ledger or upload theirs and the tool reconciles it.</PageHead>
    <div className="rx-filters rx-bc-filters" role="group" aria-label="Filters">
      <label>As on<select className="rx-sel" value={asOf} onChange={e => setAsOf(e.target.value)}><option value="">All dates</option>{dates.map(d => <option key={d} value={String(d)}>{fmtDay(d)}</option>)}</select></label>
      <label>Entity<select className="rx-sel" value={entity} onChange={e => { setEntity(e.target.value); setBu(''); }}><option value="">All entities</option>{ENTITIES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label>Business unit<select className="rx-sel" value={bu} onChange={e => setBu(e.target.value)}><option value="">All business units</option>{ENTITIES.filter(e => !entity || e.id === entity).flatMap(e => e.bus).map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Currency<select className="rx-sel" value={cur} onChange={e => setCur(e.target.value)}><option value="">All currencies</option>{curs.map(c => <option key={c}>{c}</option>)}</select></label>
      {(asOf || entity || bu || cur || f) && <button className="rw-btn small ghost" onClick={() => { setAsOf(''); setEntity(''); setBu(''); setCur(''); setF(''); }}>Reset filters</button>}
    </div>
    <p className="rx-bc-cadence"><Icon n="info" s={14} /> BC mail on day 1 · reminder 1 after 7 days · reminder 2 after 14 days · escalate after reminder 2 · every step logged</p>
    <div className="rx-tiles mini">{tiles.map(([k, v, tone, s]) => <button type="button" key={k} className={'rx-tile rx-bc-tile ' + (v ? tone : '') + (f === s && s ? ' on' : '')} onClick={() => setF(f === s ? '' : s)} aria-pressed={!!s && f === s}><span>{k}</span><b>{v}</b></button>)}</div>
    <Card title={`Vendor tracker${f ? ` · ${f}` : ''}`} actions={f ? <button className="rw-btn small ghost" onClick={() => setF('')}>Show all</button> : undefined}>
      <DataTable rows={rows} cols={cols} rowKey={b => b.id} fileName="balance-confirmation-tracker" onRowClick={b => setView(b.id)} empty="No confirmations with this status." />
    </Card>
    {vb && <Drawer wide title={`Balance confirmation · ${vendorOf(st(vb)).displayName}`} sub={`${vb.id} · ${st(vb).rel.bu} · ${tagLabel(vb.tag)}`} onClose={() => setView(null)}><BcDetail ctx={ctx} b={vb} /></Drawer>}
  </>;
}

// ---------- Vendor: open requests first, then every earlier period with its certificate ----------
function VendorView({ ctx }: { ctx: Ctx }) {
  const { ws } = ctx; const [bu, setBu] = useState(''); const [asOf, setAsOf] = useState('');
  const endOf = (b: BcRec) => defOf(ws.states[b.relId], b.tag).end;
  const mine = ws.bcs.filter(b => ctx.visible.some(s => s.rel.id === b.relId) && b.status !== 'Not sent').sort((x, y) => endOf(y) - endOf(x));
  const bus = [...new Set(mine.map(b => ws.states[b.relId].rel.bu))]; const dates = [...new Set(mine.map(endOf))];
  const list = mine.filter(b => (!bu || ws.states[b.relId].rel.bu === bu) && (!asOf || String(endOf(b)) === asOf));
  const pending = list.filter(b => b.status === 'Awaiting response' || b.status === 'Escalated');
  const [sel, setSel] = useState<string>(() => (mine.find(b => b.relId === ctx.relId && b.tag === ctx.tag) ?? mine.find(b => b.status === 'Awaiting response' || b.status === 'Escalated') ?? mine[0])?.id ?? '');
  const b = mine.find(x => x.id === sel);
  const pickB = (x: BcRec) => { setSel(x.id); if (x.relId !== ctx.relId || x.tag !== ctx.tag) ctx.select(x.relId, x.tag); };
  const cols: Col<BcRec>[] = [
    { key: 'asof', label: 'As on', text: x => fmtDay(endOf(x)), sort: endOf },
    { key: 'per', label: 'Period', text: x => tagLabel(x.tag) },
    { key: 'bu', label: 'Business unit', text: x => `${ws.states[x.relId].rel.bu} · ${ws.states[x.relId].rel.currency}` },
    { key: 'bal', label: 'Balance per buyer', align: 'right', text: x => String(x.balance), sort: x => x.balance, render: x => <b>{money(x.balance, ws.states[x.relId].rel.currency, 2)}</b> },
    { key: 'st', label: 'Outcome', text: x => shown(x, certOf(ctx, x)), render: x => <Pill tone={certOf(ctx, x) ? 'green' : BC_TONE[x.status]}>{shown(x, certOf(ctx, x))}</Pill> },
    { key: 'cert', label: 'Certificate', noToggle: true, text: x => certOf(ctx, x)?.no ?? '', render: x => { const c = certOf(ctx, x); return <span className="rx-bc-acts"><button className="rw-btn small" onClick={e => { e.stopPropagation(); pickB(x); }}>Open</button>{c ? <button className="rw-btn small ghost" onClick={e => { e.stopPropagation(); downloadCert(ctx, x); }}><Icon n="download" /> {c.no}</button> : <span className="rx-muted">Not yet issued</span>}</span>; } },
  ];
  return <>
    <PageHead title="Balance confirmation">{BUYER.name} sends its closing balance for you to confirm. Agree and you receive a confirmation certificate; disagree and either reconcile from their ledger or upload yours. Certificates for every earlier period stay available below.</PageHead>
    <div className="rx-filters rx-bc-filters" role="group" aria-label="Filters">
      <label>As on<select className="rx-sel" value={asOf} onChange={e => setAsOf(e.target.value)}><option value="">All dates</option>{dates.map(d => <option key={d} value={String(d)}>{fmtDay(d)}</option>)}</select></label>
      {bus.length > 1 && <label>Business unit<select className="rx-sel" value={bu} onChange={e => setBu(e.target.value)}><option value="">All business units</option>{bus.map(x => <option key={x}>{x}</option>)}</select></label>}
      {(asOf || bu) && <button className="rw-btn small ghost" onClick={() => { setAsOf(''); setBu(''); }}>Reset filters</button>}
    </div>
    {pending.length > 0 && <div className="rx-bc-tabs" role="tablist" aria-label="Awaiting your response"><span className="rx-bc-tabs-l">Awaiting your response</span>{pending.map(x => <button key={x.id} role="tab" aria-selected={x.id === sel} className={x.id === sel ? 'on' : ''} onClick={() => pickB(x)}><b>{ws.states[x.relId].rel.bu}</b> · {tagLabel(x.tag)} <Pill tone={BC_TONE[x.status]}>{x.status}</Pill></button>)}</div>}
    {b ? <BcDetail key={b.id} ctx={ctx} b={b} /> : <div className="rx-empty">No balance confirmation requests.</div>}
    <Card title="All confirmations and certificates" tip="Every period the buyer asked you to confirm, with the outcome. A certificate is issued when you confirm the balance, or when the reconciliation is signed off.">
      <DataTable rows={list} cols={cols} rowKey={x => x.id} fileName="my-balance-confirmations" onRowClick={pickB} activeKey={sel} empty="No confirmations for these filters." pageSize={8} />
    </Card>
  </>;
}

function BcDetail({ ctx, b }: { ctx: Ctx; b: BcRec }) {
  const st = ctx.ws.states[b.relId]; const d = defOf(st, b.tag); const cur = st.rel.currency; const v = vendorOf(st);
  const [pick, setPick] = useState<'agree' | 'disagree' | ''>(''); const [route, setRoute] = useState<'download' | 'upload'>('upload');
  const [remarks, setRemarks] = useState(''); const [auth, setAuth] = useState(false); const [uploading, setUploading] = useState(false);
  const open = b.status === 'Awaiting response' || b.status === 'Escalated';
  const canRespond = ctx.isVendor && open;
  const steps: [string, 'done' | 'cur' | 'todo' | 'skip'][] = [
    ['Request received', b.status === 'Not sent' ? 'todo' : 'done'], ['Review balance', b.status === 'Not sent' ? 'todo' : 'done'],
    ['Respond: agree or disagree', open ? 'cur' : b.status === 'Not sent' ? 'todo' : 'done'],
    ['Ledger shared (if disputed)', b.status === 'Confirmed' ? 'skip' : b.status === 'Disputed' ? (b.route === 'upload' ? 'done' : 'cur') : 'todo'],
    [b.status === 'Disputed' ? 'Reconciliation' : 'Closed & certified', b.status === 'Confirmed' ? 'done' : b.status === 'Disputed' && b.route === 'upload' ? 'cur' : 'todo'],
  ];
  const submit = () => {
    if (pick === 'agree') { if (ctx.confirmBc(b.id, remarks.trim() || 'Balance agrees with our books.')) ctx.toast(`Balance confirmed. Certificate issued; ${tagLabel(b.tag)} needs no reconciliation.`); return; }
    if (route === 'upload') { setUploading(true); return; }
    ctx.updateBc(b.id, { status: 'Disputed', route: 'download', respondedBy: ctx.user.name, respondedAt: ctx.at(), remarks: remarks.trim() }, 'Disagreed. Reconciling on their side from our ledger'); downloadLedger(ctx, b); ctx.toast('Response sent. Our ledger has been downloaded for you to reconcile.');
  };
  const ok = auth && (pick === 'agree' || (pick === 'disagree' && remarks.trim().length > 0));
  const due = dueText(b);
  return <div className="rx-bc">
    <div className="rx-bc-head"><div><h2>Balance confirmation · {tagLabel(b.tag)}</h2><p className="rx-muted">{ctx.isVendor ? `Requested by ${BUYER.name}` : `Sent to ${v.legalName}`}{b.sentAt && ` · sent ${b.sentAt.split(' ')[0]}`}{b.dueMs && ` · respond by ${stampAt(b.dueMs).split(' ')[0]}`}</p></div>
      <div className="rx-bc-badges"><Pill tone={certOf(ctx, b) ? 'green' : BC_TONE[b.status]}>{shown(b, certOf(ctx, b))}</Pill>{due && <span className={'rx-bc-due' + (due.startsWith('Overdue') ? ' late' : '')}>{due}{b.reminders.length > 0 && ` · reminder ${b.reminders.length} of 2 sent`}</span>}</div></div>
    <ol className="rx-bc-steps">{steps.map(([l, s], i) => <li key={l} className={s}><span>{s === 'done' ? '✓' : s === 'skip' ? '–' : i + 1}</span><b>{l}</b></li>)}</ol>
    <div className="rx-bc-grid">
      <Card title={ctx.isVendor ? 'Balance as per the buyer’s books' : 'Balance as per our books'}>
        <div className="rx-bc-amt"><b>{money(b.balance, cur, 2)}</b><span>{ctx.isVendor ? `Receivable from ${BUYER.name}` : `Payable to ${v.displayName}`}<small>Position as on {fmtDay(d.end)}</small></span></div>
        <dl className="rx-bc-meta"><div><dt>Reporting period</dt><dd>{fmtDay(d.start)} – {fmtDay(d.end)}</dd></div><div><dt>As-on date</dt><dd>{fmtDay(d.end)}</dd></div><div><dt>Currency</dt><dd>{cur}</dd></div><div><dt>Buyer entity</dt><dd>{entityOf(st).name}</dd></div><div><dt>Business unit</dt><dd>{st.rel.bu}</dd></div><div><dt>Vendor code</dt><dd>{st.rel.vendorCode}</dd></div></dl>
        <button className="rw-btn" onClick={() => downloadLedger(ctx, b)}><Icon n="download" /> Download {ctx.isVendor ? 'their' : 'our'} ledger (XLS)</button>
      </Card>
      <Card title={ctx.isVendor ? 'Your response' : 'Vendor response'}>
        {canRespond && <>
          <p className="rx-muted">Check the balance, period and currency, then confirm or disagree.</p>
          <div className="rx-bc-choice"><button type="button" className={'agree' + (pick === 'agree' ? ' on' : '')} aria-pressed={pick === 'agree'} onClick={() => setPick('agree')}>✓ I agree, confirm balance</button><button type="button" className={'disagree' + (pick === 'disagree' ? ' on' : '')} aria-pressed={pick === 'disagree'} onClick={() => setPick('disagree')}>✕ I disagree</button></div>
          {pick === 'agree' && <p className="rx-bc-note">Your confirmation is recorded with date, time and your user ID, and a balance confirmation certificate is issued. No reconciliation is needed for this period.</p>}
          {pick === 'disagree' && <div className="rx-bc-dis"><b>How do you want to reconcile?</b>
            <div className="rx-bc-routes" role="radiogroup" aria-label="Reconcile how">
              <button type="button" role="radio" aria-checked={route === 'upload'} className={route === 'upload' ? 'on' : ''} onClick={() => setRoute('upload')}><Icon n="upload" /><b>Upload your ledger</b><small>The tool reads it, checks the opening and reconciles it automatically.</small></button>
              <button type="button" role="radio" aria-checked={route === 'download'} className={route === 'download' ? 'on' : ''} onClick={() => setRoute('download')}><Icon n="download" /><b>Download their ledger</b><small>Reconcile on your side, then upload your ledger when ready.</small></button>
            </div></div>}
          {pick && <textarea className="rx-bc-rem" rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder={pick === 'disagree' ? 'Reason (required), e.g. invoice not booked, payment in transit' : 'Remarks (optional)'} aria-label="Remarks" />}
          {pick && <label className="rx-bc-auth"><input type="checkbox" checked={auth} onChange={e => setAuth(e.target.checked)} /> I am authorised to respond for {v.displayName}</label>}
          {pick && <button className="rw-btn lime full" disabled={!ok} onClick={submit}>{pick === 'agree' ? 'Confirm balance' : route === 'upload' ? 'Continue to upload' : 'Submit and download ledger'}</button>}
        </>}
        {!ctx.isVendor && open && <><p className="rx-muted">Waiting for {v.contact.name} at {v.displayName} to respond.</p>{(() => { const n = nextAction(b); return n && <p className="rx-muted">Next step: <b>{n[0]}</b> (from the tracker).</p>; })()}</>}
        {b.status === 'Not sent' && <p className="rx-muted">Not sent yet.</p>}
        {b.status === 'Confirmed' && <div className="rx-bc-cert"><Icon n="check" s={22} /><div><b>Balance confirmed · certificate {certOf(ctx, b)?.no}</b><p>Confirmed by {b.respondedBy} on {b.respondedAt}. No reconciliation is required for {tagLabel(b.tag)}; open items, if any, stay as they are.</p>{b.remarks && <blockquote>{b.remarks}</blockquote>}<button className="rw-btn small" onClick={() => downloadCert(ctx, b)}><Icon n="download" /> Download certificate</button></div></div>}
        {(() => { const c = certOf(ctx, b); return c?.kind === 'reconciled' && <div className="rx-bc-cert"><Icon n="check" s={22} /><div><b>Agreed after reconciliation · certificate {c.no}</b><p>The reconciliation statement was accepted by {c.by} and signed off on {c.at}.</p><button className="rw-btn small" onClick={() => downloadCert(ctx, b)}><Icon n="download" /> Download certificate</button></div></div>; })()}
        {b.status === 'Disputed' && <div className="rx-bc-disp"><b>Disagreed by {b.respondedBy} on {b.respondedAt}</b>{b.remarks && <blockquote>{b.remarks}</blockquote>}
          {b.route === 'upload' ? <><p>Their ledger is in and the reconciliation has run. Status: <b>{ctx.stat(st, b.tag)}</b>.</p><button className="rw-btn small" onClick={() => ctx.go('statement', b.relId, b.tag)}>Open reconciliation statement</button></>
            : <><p>{ctx.isVendor ? 'You chose to reconcile on your side. Upload your ledger when ready and the tool reconciles it.' : 'The vendor is reconciling on their side from our ledger.'}</p>{ctx.isVendor && <button className="rw-btn small lime" onClick={() => setUploading(true)}><Icon n="upload" /> Upload your ledger</button>}</>}</div>}
      </Card>
    </div>
    <Card title="Activity"><ol className="rw-timeline">{[...b.log].reverse().map((l, i) => <li key={i}><Avatar name={l.by} /><div><p><b>{l.by}</b> · {l.what}</p><small>{l.at}</small></div></li>)}</ol></Card>
    {uploading && <UploadLedgerDrawer ctx={{ ...ctx, st, tag: b.tag }} onClose={() => setUploading(false)} onDone={() => ctx.updateBc(b.id, { status: 'Disputed', route: 'upload', respondedBy: b.respondedBy ?? ctx.user.name, respondedAt: b.respondedAt ?? ctx.at(), remarks: b.remarks || remarks.trim() }, 'Uploaded their ledger. Reconciliation started')} />}
  </div>;
}
