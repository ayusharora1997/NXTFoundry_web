import React, { useMemo, useState } from 'react';
import { fmtDay, r2 } from './cycle';
import { tagLabel } from './ledger';
import { parseCSV } from './csv';
import { toCSV } from './engine';
import { creditItems, kindLabel, mappingOf, type CItem, type CnSub, type CnDoc } from './credit';
import { Card, DataTable, Drawer, Icon, Pill, Avatar, money, download, type Col } from './ui';
import { PageHead, vendorOf, type Ctx } from './App';
import { Tour, useTour, card, type TourStep } from './tour';

// Credit Mapping. The vendor (L1) gives credit note details against our debit notes and the credit notes we booked;
// the buyer (L2) accepts, rejects or reopens them. Accepted credit notes are agreements: the vendor's ledger stays the
// source of truth, and reconciliation matches the note once that credit note number appears in it.
type Tab = 'open' | 'sub' | 'rej' | 'map' | 'bulk';
const STATE_TONE: Record<string, string> = { Open: 'grey', 'Partly mapped': 'amber', Submitted: 'blue', Rejected: 'red', Mapped: 'green' };
const sumIds = (items: CItem[], ids: string[]) => r2(items.filter(i => ids.includes(i.t.id)).reduce((a, i) => a + i.diff, 0));

const TOUR = (vendor: boolean): TourStep[] => [
  { target: '.rx-cm-help', title: 'Credit Mapping in a minute', body: vendor ? 'Your customer has raised debit notes on you (claims, short supply, rate differences). Give the credit note for each one here. Skip anytime; Help brings this back.' : 'Debit notes we raised, and credit notes we booked, waiting for the vendor’s credit note. The vendor submits; you accept, reject or reopen. Skip anytime; Help brings this back.' },
  { target: '.rx-cm-tiles', title: 'Where everything stands', body: 'Open, waiting for review, rejected, and mapped (either already in the vendor’s ledger, or agreed here and waiting for it). Click a tile to open that list.' },
  { target: '.rx-cm-tabs', title: vendor ? 'Your lists' : 'The review lists', body: vendor ? <><b>Open</b> needs a credit note. <b>Submitted</b> is with the buyer. <b>Rejected</b> came back with a reason. <b>Mapped</b> is done. <b>Bulk upload</b> takes many at once.</> : <><b>Awaiting review</b> is what the vendor submitted. <b>Open</b> still needs a credit note. <b>Rejected</b> went back with a reason. <b>Mapped</b> is done.</>, before: () => document.querySelector<HTMLButtonElement>(`.rx-cm-tabs button[data-tab="${vendor ? 'open' : 'sub'}"]`)?.click() },
  { target: card(vendor ? 'Open debit notes' : 'Credit notes awaiting your review'), title: vendor ? 'Select, then map' : 'Review each credit note', body: vendor ? 'Tick one or more debit notes and click Map credit note. One credit note can cover several debit notes; a debit note can take several credit notes until nothing is left.' : 'Open one to see the credit note, the debit notes it covers and the difference. Accept to agree it; reject with a reason so the vendor can correct it.' },
  { target: '.rx-cm-source', title: 'The vendor’s ledger decides', body: <>An accepted credit note is <b>agreed</b>, not reconciled. It shows on the statement as its own line until the same credit note appears in the vendor’s ledger; then reconciliation matches it automatically.</>, before: () => document.querySelector<HTMLButtonElement>('.rx-cm-tabs button[data-tab="map"]')?.click() },
  { target: '.rx-cm-help', title: 'Need it again?', body: 'Click Help anytime to replay this tutorial.' },
];

export default function CreditMapping({ ctx }: { ctx: Ctx }) {
  const { st, tag, ws } = ctx; const vendor = ctx.isVendor; const cur = st.rel.currency; const m = (n: number | null | undefined) => money(n, cur, 2);
  const items = useMemo(() => creditItems(st, tag, ws.cns), [st, tag, ws.cns]);
  const subs = ws.cns.filter(s => s.relId === st.rel.id);
  const [tab, setTab] = useState<Tab>(vendor ? 'open' : 'sub'); const [sel, setSel] = useState<string[]>([]);
  const [form, setForm] = useState<{ ids: string[]; prefill?: CnDoc } | null>(null); const [view, setView] = useState<string | null>(null);
  const [tour, startTour, endTour, skipTour] = useTour(`credit-${vendor ? 'vendor' : 'buyer'}`);
  const open = items.filter(i => i.state === 'Open' || i.state === 'Partly mapped' || i.state === 'Rejected');
  const submitted = subs.filter(s => s.status === 'Submitted'); // A rejected credit note drops off the list once a later one is submitted for the same notes.
  const rejected = subs.filter(s => s.status === 'Rejected' && !subs.some((o, k) => k > subs.indexOf(s) && o.status !== 'Rejected' && o.buyerIds.some(id => s.buyerIds.includes(id))));
  const mapped = items.filter(i => i.state === 'Mapped');
  const docs = (ids: string[]) => ids.map(id => st.txns.find(t => t.id === id)?.docNo ?? id);
  const vName = vendorOf(st).displayName;

  const tiles: [string, number, number, Tab, string][] = [
    ['Open', open.length, open.reduce((a, i) => a + i.diff, 0), 'open', open.length ? 'amber' : ''],
    [vendor ? 'With the buyer' : 'Awaiting review', submitted.length, submitted.reduce((a, s) => a + s.cn.total, 0), 'sub', submitted.length ? 'violet' : ''],
    ['Rejected', rejected.length, rejected.reduce((a, s) => a + s.cn.total, 0), 'rej', rejected.length ? 'red' : ''],
    ['Mapped · vendor ledger', mapped.filter(i => i.source === 'Vendor ledger').length, mapped.filter(i => i.source === 'Vendor ledger').reduce((a, i) => a + i.amount, 0), 'map', 'green'],
    ['Mapped · agreed here', mapped.filter(i => i.source === 'Credit Mapping').length, mapped.filter(i => i.source === 'Credit Mapping').reduce((a, i) => a + i.amount, 0), 'map', ''],
  ];
  const TABS: [Tab, string, number][] = vendor
    ? [['open', 'Open', open.length], ['sub', 'Submitted to buyer', submitted.length], ['rej', 'Rejected', rejected.length], ['map', 'Mapped', mapped.length], ['bulk', 'Bulk upload', ws.bulks.filter(b => b.relId === st.rel.id).length]]
    : [['sub', 'Awaiting review', submitted.length], ['open', 'Open', open.length], ['rej', 'Rejected', rejected.length], ['map', 'Mapped', mapped.length], ['bulk', 'Bulk uploads', ws.bulks.filter(b => b.relId === st.rel.id).length]];

  const noteCol: Col<CItem> = { key: 'note', label: 'Note', text: i => `${i.t.docNo} ${kindLabel(i.kind)}`, render: i => <><b className="rx-mono">{i.t.docNo}</b><br /><small className="rx-muted">{kindLabel(i.kind)}</small></> };
  const openCols: Col<CItem>[] = [noteCol,
    { key: 'date', label: 'Date', text: i => fmtDay(i.t.date), sort: i => i.t.date },
    { key: 'inv', label: 'Against invoice', text: i => i.t.against || '—' },
    { key: 'per', label: 'Period', text: i => tagLabel(i.t.originTag) },
    { key: 'amt', label: 'Amount', align: 'right', text: i => String(i.amount), sort: i => i.amount, render: i => m(i.amount), total: r => <b>{m(r.reduce((a, i) => a + i.amount, 0))}</b> },
    { key: 'ag', label: 'Agreed', align: 'right', text: i => String(i.agreed), render: i => i.agreed ? m(i.agreed) : <span className="rx-muted">—</span> },
    { key: 'diff', label: 'Difference', align: 'right', text: i => String(i.diff), sort: i => i.diff, render: i => <b>{m(i.diff)}</b>, total: r => <b>{m(r.reduce((a, i) => a + i.diff, 0))}</b> },
    { key: 'st', label: 'Status', text: i => i.state, render: i => <Pill tone={STATE_TONE[i.state]}>{i.state === 'Rejected' ? 'Last credit note rejected' : i.state}</Pill> },
  ];
  const subCols = (actions: (s: CnSub) => React.ReactNode): Col<CnSub>[] => [
    { key: 'id', label: 'Request', text: s => s.id, render: s => <><b className="rx-mono">{s.id}</b>{s.via === 'Bulk upload' && <><br /><small className="rx-muted">Bulk · {s.bulkId}</small></>}</> },
    { key: 'cn', label: 'Credit note', text: s => s.cn.no, render: s => <><b className="rx-mono">{s.cn.no}</b><br /><small className="rx-muted">{s.cn.date} · {s.cn.kind}</small></> },
    { key: 'tx', label: 'Taxable', align: 'right', text: s => String(s.cn.taxable), render: s => m(s.cn.taxable) },
    { key: 'gst', label: 'GST', align: 'right', text: s => String(s.cn.cgst + s.cn.sgst + s.cn.igst), render: s => m(r2(s.cn.cgst + s.cn.sgst + s.cn.igst)) },
    { key: 'tot', label: 'CN total', align: 'right', text: s => String(s.cn.total), render: s => <b>{m(s.cn.total)}</b> },
    { key: 'notes', label: 'Against', text: s => docs(s.buyerIds).join(', '), render: s => <span className="rx-mono rx-cm-docs">{docs(s.buyerIds).join(', ')}</span> },
    { key: 'type', label: 'Mapping', text: s => mappingOf(s) },
    { key: 'diff', label: 'Difference', align: 'right', text: s => String(r2(sumIds(items, s.buyerIds) - s.cn.total)), render: s => { const d = r2(sumIds(items, s.buyerIds) - s.cn.total); return s.status === 'Submitted' ? <b className={Math.abs(d) < 0.005 ? 'rw-ok' : 'rw-neg'}>{m(d)}</b> : <span className="rx-muted">—</span>; } },
    { key: 'by', label: s0Label(tab), text: s => `${s.by} ${s.at}`, render: s => tab === 'rej' ? <><span>{s.decidedBy}</span><br /><small className="rx-muted">{s.decidedAt}</small></> : <><span>{s.by}</span><br /><small className="rx-muted">{s.at}</small></> },
    { key: 'act', label: '', noToggle: true, text: () => '', render: s => <span className="rx-bc-acts">{actions(s)}</span> },
  ];
  const resub = (s: CnSub) => setForm({ ids: s.buyerIds.filter(id => open.some(i => i.t.id === id)), prefill: s.cn });
  const rejCols: Col<CnSub>[] = (() => { const c = subCols(s => <>{vendor && <button className="rw-btn small lime" onClick={e => { e.stopPropagation(); resub(s); }}>Correct and resubmit</button>}<button className="rw-btn small ghost" onClick={e => { e.stopPropagation(); setView(s.id); }}>{vendor ? 'View' : 'View or reopen'}</button></>).filter(x => x.key !== 'diff');
    c.splice(c.length - 1, 0, { key: 'why', label: 'Reason', text: s => s.reason ?? '', render: s => <span className="rx-cm-why">{s.reason}</span> }); return c; })();
  const mapCols: Col<CItem>[] = [noteCol,
    { key: 'amt', label: 'Amount', align: 'right', text: i => String(i.amount), render: i => m(i.amount), total: r => <b>{m(r.reduce((a, i) => a + i.amount, 0))}</b> },
    { key: 'cns', label: 'Credit note(s)', text: i => i.cnNos.join(', '), render: i => <span className="rx-mono">{i.cnNos.join(', ') || '—'}</span> },
    { key: 'mt', label: 'Mapping', text: i => i.mapping },
    { key: 'src', label: 'Source', text: i => i.source ?? '', render: i => <span className="rx-cm-source">{i.source === 'Vendor ledger' ? <Pill tone="green">In vendor ledger · reconciled</Pill> : <Pill tone="violet">Agreed here · awaiting vendor ledger</Pill>}</span> },
    { key: 'on', label: 'Mapped on', text: i => i.mappedOn ?? '' },
    { key: 'act', label: '', noToggle: true, text: () => '', render: i => { const acc = [...i.subs].reverse().find(s => s.status === 'Accepted'); return acc ? <button className="rw-btn small ghost" onClick={e => { e.stopPropagation(); setView(acc.id); }}>{vendor || i.source === 'Vendor ledger' ? 'View' : 'View or reopen'}</button> : null; } },
  ];
  const viewSub = view ? ws.cns.find(s => s.id === view) : undefined;
  const pickTab = (t: Tab) => { setTab(t); setSel([]); };

  return <>
    {tour && <Tour steps={TOUR(vendor)} onClose={endTour} onSkip={() => { skipTour(); ctx.toast('Tutorial skipped. Tutorials won’t open by themselves again; click Help anytime.'); }} />}
    <PageHead title="Credit Mapping" actions={<button type="button" className="rw-btn rx-cm-help" onClick={startTour} title="Replay the tutorial for this screen"><Icon n="info" /> Help</button>}>
      {vendor ? `Debit notes raised on ${vName}, and credit notes booked by the buyer, waiting for your credit note. Submit the credit note details; the buyer reviews them. Once the credit note is in your ledger, reconciliation matches it.` : `Debit notes we raised on ${vName}, and credit notes we booked, waiting for the vendor’s credit note. The vendor submits; you accept, reject or reopen. The vendor’s ledger stays the source of truth.`}
    </PageHead>
    <div className="rx-tiles mini rx-cm-tiles">{tiles.map(([k, n, v, t, tone]) => <button type="button" key={k} className={'rx-tile rx-bc-tile ' + (n ? tone : '') + (tab === t ? ' on' : '')} onClick={() => pickTab(t)}><span>{k}</span><b>{n}</b><small>{m(v)}</small></button>)}</div>
    <div className="rw-tabs rx-cm-tabs" role="tablist">{TABS.map(([k, l, n]) => <button key={k} role="tab" data-tab={k} aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pickTab(k)}>{l} <em>{n}</em></button>)}</div>

    {tab === 'open' && <Card title={vendor ? 'Open debit notes' : 'Open: waiting for the vendor’s credit note'} tip="Debit notes we raised and credit notes we booked that no credit note in the vendor’s ledger, or agreed here, covers yet.">
      <DataTable rows={open} cols={openCols} rowKey={i => i.t.id} fileName="credit-mapping-open" empty="Nothing open. Every note has a credit note."
        selectable={vendor} selected={sel} onSelect={setSel}
        toolbar={vendor ? <span className="rx-cm-bar"><span>{sel.length ? <>Selected {sel.length} · open <b>{m(sumIds(items, sel))}</b></> : 'Tick the debit notes one credit note covers'}</span><button className="rw-btn lime" disabled={!sel.length} onClick={() => setForm({ ids: sel })}><Icon n="file" /> Map credit note</button></span> : <span className="rx-muted">Waiting for {vName} to submit credit notes.</span>} />
    </Card>}
    {tab === 'sub' && <Card title={vendor ? 'Submitted to the buyer' : 'Credit notes awaiting your review'} tip={vendor ? 'The buyer accepts or rejects each one. Nothing changes in reconciliation until it is accepted.' : 'Accept to agree the credit note; reject with a reason so the vendor can correct it.'}>
      <DataTable rows={submitted} cols={subCols(s => <button className={'rw-btn small' + (vendor ? ' ghost' : ' lime')} onClick={e => { e.stopPropagation(); setView(s.id); }}>{vendor ? 'View' : 'Review'}</button>)} rowKey={s => s.id} fileName="credit-notes-submitted" onRowClick={s => setView(s.id)} empty={vendor ? 'Nothing waiting with the buyer.' : 'Nothing to review.'} />
    </Card>}
    {tab === 'rej' && <Card title="Rejected credit notes" tip="Sent back with a reason. The vendor corrects and resubmits; the buyer can also reopen one for review.">
      <DataTable rows={rejected} cols={rejCols}
        rowKey={s => s.id} fileName="credit-notes-rejected" onRowClick={s => setView(s.id)} empty="No rejected credit notes." />
    </Card>}
    {tab === 'map' && <Card title="Mapped notes" tip="Fully covered by credit notes. ‘In vendor ledger’ means reconciliation matched it; ‘Agreed here’ means the buyer accepted it and it is waiting to appear in the vendor’s ledger.">
      <DataTable rows={mapped} cols={mapCols} rowKey={i => i.t.id} fileName="credit-mapping-mapped" empty="Nothing mapped yet." />
    </Card>}
    {tab === 'bulk' && <Bulk ctx={ctx} open={open} onDone={() => pickTab('sub')} />}

    {form && <MapDrawer ctx={ctx} items={items.filter(i => form.ids.includes(i.t.id))} prefill={form.prefill} onClose={() => setForm(null)} onDone={() => { setForm(null); setSel([]); pickTab('sub'); }} />}
    {viewSub && <SubDrawer ctx={ctx} sub={viewSub} items={items} onClose={() => setView(null)} onResubmit={() => { const s = viewSub; setView(null); resub(s); }} />}
  </>;
}
const s0Label = (t: Tab) => t === 'rej' ? 'Rejected by' : 'Submitted by';

// ---------- Vendor: give a credit note against one or more notes ----------
const isoToDay = (iso: string) => { const ms = Date.parse(iso + 'T00:00:00Z'); return isNaN(ms) ? '' : fmtDay(ms); };
const dayToIso = (d: string) => { const ms = Date.parse(d.replace(/-/g, ' ') + ' UTC'); return isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10); };
function MapDrawer({ ctx, items, prefill, onClose, onDone }: { ctx: Ctx; items: CItem[]; prefill?: CnDoc; onClose: () => void; onDone: () => void }) {
  const cur = ctx.st.rel.currency; const m = (n: number) => money(n, cur, 2);
  const openAmt = r2(items.reduce((a, i) => a + i.diff, 0));
  const [no, setNo] = useState(prefill?.no ?? ''); const [date, setDate] = useState(prefill ? dayToIso(prefill.date) : '');
  const [kind, setKind] = useState<CnDoc['kind']>(prefill?.kind ?? 'Taxable'); const [inter, setInter] = useState(!!prefill?.igst);
  const [taxable, setTaxable] = useState(prefill ? String(prefill.taxable) : ''); const [rate, setRate] = useState('18'); const [irn, setIrn] = useState(prefill?.irn ?? ''); const [file, setFile] = useState(prefill?.file ?? '');
  const tx = Number(taxable) || 0; const gstAmt = kind === 'Taxable' ? r2(tx * (Number(rate) || 0) / 100) : 0;
  const cgst = inter ? 0 : r2(gstAmt / 2), sgst = inter ? 0 : r2(gstAmt - r2(gstAmt / 2)), igst = inter ? gstAmt : 0; const total = r2(tx + gstAmt);
  const diff = r2(openAmt - total);
  const dupe = ctx.ws.cns.some(s => s.relId === ctx.st.rel.id && s.cn.no.trim().toUpperCase() === no.trim().toUpperCase() && (s.status === 'Submitted' || s.status === 'Accepted'));
  const mapping = items.length > 1 ? 'Many-to-one' : items[0]?.agreed ? 'One-to-many' : 'One-to-one';
  const ok = no.trim() && date && total > 0 && !dupe && items.length > 0;
  const fillOpen = () => { setTaxable(String(kind === 'Taxable' ? r2(openAmt / (1 + (Number(rate) || 0) / 100)) : openAmt)); };
  const submit = () => { ctx.submitCn(items.map(i => i.t.id), { no: no.trim(), date: isoToDay(date), kind, taxable: tx, cgst, sgst, igst, total, irn: kind === 'Taxable' ? irn.trim() : '', file: file || undefined }); ctx.toast(`${no.trim()} sent to the buyer for review`); onDone(); };
  return <Drawer title="Map a credit note" sub={`${items.length} note${items.length === 1 ? '' : 's'} · ${mapping}`} onClose={onClose}>
    <div className="rx-cm-sel">{items.map(i => <div key={i.t.id}><span className="rx-mono">{i.t.docNo}</span><small>{kindLabel(i.kind)}</small><b>{m(i.diff)}</b></div>)}</div>
    <div className="rx-cm-form">
      <label className="rw-field">Credit note number<input id="cm-no" value={no} onChange={e => setNo(e.target.value)} placeholder="e.g. CN/KAV/9012" />{dupe && <small className="rw-err">This credit note number is already submitted or accepted.</small>}</label>
      <label className="rw-field">Credit note date<input id="cm-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <div className="rw-field">Type<div className="rw-seg">{(['Taxable', 'Non-taxable'] as const).map(k => <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}</div></div>
      <label className="rw-field">Taxable value<input id="cm-tx" inputMode="decimal" value={taxable} onChange={e => setTaxable(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" /><button type="button" className="rw-link" onClick={fillOpen}>Use the open amount</button></label>
      {kind === 'Taxable' && <>
        <label className="rw-field">GST rate (%)<select id="cm-rate" className="rx-sel" value={rate} onChange={e => setRate(e.target.value)}>{['5', '12', '18', '28'].map(r => <option key={r}>{r}</option>)}</select></label>
        <div className="rw-field">Supply<div className="rw-seg"><button type="button" className={!inter ? 'on' : ''} onClick={() => setInter(false)}>Within state (CGST + SGST)</button><button type="button" className={inter ? 'on' : ''} onClick={() => setInter(true)}>Inter-state (IGST)</button></div></div>
        <label className="rw-field">IRN (e-invoice)<input id="cm-irn" value={irn} onChange={e => setIrn(e.target.value)} placeholder="Optional" /></label>
      </>}
      <label className="rw-field">Credit note copy (PDF)<input id="cm-file" type="file" accept=".pdf,application/pdf" onChange={e => setFile(e.target.files?.[0]?.name ?? '')} />{file && <small className="rx-muted">{file}</small>}</label>
    </div>
    <dl className="rx-cm-sum">
      <div><dt>Open on selected notes</dt><dd>{m(openAmt)}</dd></div>
      {kind === 'Taxable' && <div><dt>{inter ? 'IGST' : 'CGST + SGST'}</dt><dd>{inter ? m(igst) : `${m(cgst)} + ${m(sgst)}`}</dd></div>}
      <div><dt>Credit note total</dt><dd>{m(total)}</dd></div>
      <div className={Math.abs(diff) < 0.005 ? 'ok' : 'bad'}><dt>Difference</dt><dd>{m(diff)}</dd></div>
    </dl>
    <p className="rw-note">{!total ? 'Enter the credit note value.' : Math.abs(diff) < 0.005 ? 'Covers the notes exactly. Once the buyer accepts, they move to Mapped.' : diff > 0 ? `${m(diff)} stays open. If the buyer accepts, the notes show as partly mapped until another credit note covers the rest.` : `The credit note is ${m(-diff)} more than what is open. The buyer is likely to reject it.`}</p>
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!ok} onClick={submit}>Submit to buyer</button></div>
  </Drawer>;
}

// ---------- One submission: details, buyer decision, history ----------
function SubDrawer({ ctx, sub, items, onClose, onResubmit }: { ctx: Ctx; sub: CnSub; items: CItem[]; onClose: () => void; onResubmit: () => void }) {
  const cur = ctx.st.rel.currency; const m = (n: number) => money(n, cur, 2); const vendor = ctx.isVendor;
  const [reason, setReason] = useState('');
  const rows = sub.buyerIds.map(id => items.find(i => i.t.id === id)).filter((x): x is CItem => !!x);
  const openAmt = r2(rows.reduce((a, i) => a + i.diff, 0)); const diff = r2(openAmt - sub.cn.total);
  const inLedger = rows.some(i => i.source === 'Vendor ledger');
  const act = (a: 'accept' | 'reject' | 'reopen') => { if (ctx.decideCn(sub.id, a, reason)) onClose(); };
  return <Drawer title={`${sub.cn.no} · ${sub.id}`} sub={`${sub.status} · ${mappingOf(sub)} · ${sub.via}`} onClose={onClose}>
    <dl className="rx-cm-dl">
      <div><dt>Date</dt><dd>{sub.cn.date}</dd></div><div><dt>Type</dt><dd>{sub.cn.kind}</dd></div>
      <div><dt>Taxable value</dt><dd>{m(sub.cn.taxable)}</dd></div><div><dt>GST</dt><dd>{sub.cn.igst ? `IGST ${m(sub.cn.igst)}` : sub.cn.cgst ? `CGST ${m(sub.cn.cgst)} · SGST ${m(sub.cn.sgst)}` : '—'}</dd></div>
      <div><dt>Credit note total</dt><dd><b>{m(sub.cn.total)}</b></dd></div><div><dt>IRN</dt><dd className="rx-mono">{sub.cn.irn || '—'}</dd></div>
      <div><dt>Copy</dt><dd>{sub.cn.file ? <span className="rx-cm-file"><Icon n="file" s={14} /> {sub.cn.file}</span> : '—'}</dd></div><div><dt>Submitted</dt><dd>{sub.by} · {sub.at}</dd></div>
    </dl>
    <h4 className="rw-h4">Against</h4>
    <div className="rx-cm-sel">{rows.map(i => <div key={i.t.id}><span className="rx-mono">{i.t.docNo}</span><small>{kindLabel(i.kind)} · {m(i.amount)}</small><b>{i.state === 'Mapped' ? <Pill tone="green">Mapped</Pill> : m(i.diff)}</b></div>)}</div>
    {sub.status === 'Submitted' && <p className={'rw-note' + (Math.abs(diff) < 0.005 ? '' : ' warn')}>Open {m(openAmt)} against a credit note of {m(sub.cn.total)}: difference {m(diff)}. {Math.abs(diff) < 0.005 ? 'Accepting maps these notes fully.' : diff > 0 ? 'Accepting maps them partly; the rest stays open.' : 'The credit note is more than what is open.'}</p>}
    {sub.reason && <blockquote className="rx-cm-reason"><b>{sub.status === 'Rejected' ? 'Rejected' : 'Reason'}:</b> {sub.reason}</blockquote>}
    {!vendor && sub.status !== 'Reopened' && (sub.status !== 'Accepted' || !inLedger) && <label className="rw-field">Reason {sub.status === 'Submitted' ? '(required to reject)' : '(required)'}<textarea id="cm-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={sub.status === 'Submitted' ? 'e.g. GST charged on a non-taxable claim' : 'Why this needs another look'} /></label>}
    {!vendor && sub.status === 'Accepted' && inLedger && <p className="rw-note">This credit note is already in the vendor’s ledger and reconciled, so it cannot be reopened here. Reverse the match in Reconciled Transactions if it is wrong.</p>}
    <h4 className="rw-h4">History</h4>
    <ol className="rw-timeline compact">{[...sub.log].reverse().map((l, k) => <li key={k}><Avatar name={l.by} /><div><p><b>{l.by}</b> · {l.what}</p><small>{l.at}</small></div></li>)}</ol>
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Close</button><span className="sp" />
      {!vendor && sub.status === 'Submitted' && <><button className="rw-btn" disabled={!reason.trim()} onClick={() => act('reject')}>Reject</button><button className="rw-btn lime" onClick={() => act('accept')}>Accept</button></>}
      {!vendor && sub.status === 'Rejected' && <button className="rw-btn" disabled={!reason.trim()} onClick={() => act('reopen')}>Reopen for review</button>}
      {!vendor && sub.status === 'Accepted' && !inLedger && <button className="rw-btn" disabled={!reason.trim()} onClick={() => act('reopen')}>Reopen</button>}
      {vendor && sub.status === 'Rejected' && <button className="rw-btn lime" onClick={onResubmit}>Correct and resubmit</button>}
    </div>
  </Drawer>;
}

// ---------- Bulk upload ----------
const COLS = ['Note No', 'Note Type', 'Open Amount', 'CN No', 'CN Date (YYYY-MM-DD)', 'CN Type', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'IRN'];
interface BRow { line: number; note: string; cn: string; total: number; err: string; ids: string[]; doc?: CnDoc }
function Bulk({ ctx, open, onDone }: { ctx: Ctx; open: CItem[]; onDone: () => void }) {
  const cur = ctx.st.rel.currency; const m = (n: number) => money(n, cur, 2); const vendor = ctx.isVendor;
  const [rows, setRows] = useState<BRow[] | null>(null); const [fileName, setFileName] = useState(''); const [err, setErr] = useState('');
  const history = ctx.ws.bulks.filter(b => b.relId === ctx.st.rel.id);
  const template = () => download(`${ctx.st.rel.vendorCode}_credit-note-template.csv`, toCSV(open.map(i => ({ 'Note No': i.t.docNo, 'Note Type': kindLabel(i.kind), 'Open Amount': i.diff.toFixed(2), 'CN No': '', 'CN Date (YYYY-MM-DD)': '', 'CN Type': 'Taxable', 'Taxable Value': '', 'CGST': '', 'SGST': '', 'IGST': '', 'IRN': '' }))));
  const check = (raw: Record<string, string>[]): BRow[] => raw.map((r, k) => {
    const note = (r['Note No'] ?? '').trim(); const it = open.find(i => i.t.docNo.toUpperCase() === note.toUpperCase()); const cn = (r['CN No'] ?? '').trim();
    const n = (c: string) => Number(String(r[c] ?? '').replace(/,/g, '')) || 0; const tx = n('Taxable Value'), c1 = n('CGST'), s1 = n('SGST'), i1 = n('IGST'); const total = r2(tx + c1 + s1 + i1);
    const day = isoToDay((r['CN Date (YYYY-MM-DD)'] ?? '').trim()); const kind = /non/i.test(r['CN Type'] ?? '') ? 'Non-taxable' : 'Taxable';
    const e = !it ? `Note ${note || '(blank)'} is not open for this vendor` : !cn ? 'Credit note number missing' : !day ? 'Date must be YYYY-MM-DD' : total <= 0 ? 'Credit note value missing' : kind === 'Non-taxable' && c1 + s1 + i1 > 0 ? 'GST on a non-taxable credit note' : '';
    return { line: k + 2, note, cn, total, err: e, ids: it ? [it.t.id] : [], doc: e ? undefined : { no: cn, date: day, kind, taxable: tx, cgst: c1, sgst: s1, igst: i1, total, irn: (r['IRN'] ?? '').trim() } };
  });
  const pick = async (f?: File) => { setErr(''); if (!f) return; if (!/\.csv$/i.test(f.name)) { setErr('This demo reads CSV files. In Excel use File → Save As → CSV UTF-8.'); return; }
    const p = parseCSV(await f.text()); const miss = ['Note No', 'CN No', 'Taxable Value'].filter(c => !p.columns.includes(c)); if (miss.length) { setErr(`Missing columns: ${miss.join(', ')}. Download the template for the layout.`); return; }
    setFileName(f.name); setRows(check(p.rows)); };
  const sample = () => { setFileName('credit_notes_sample.csv'); setRows(check(open.filter(i => i.state !== 'Partly mapped').slice(0, 3).map((i, k) => { const tx = r2(i.diff / 1.18); const g = r2((i.diff - tx) / 2);
    return { 'Note No': i.t.docNo, 'CN No': `CN/${ctx.st.rel.vendorCode.slice(0, 3)}/B${String(k + 1).padStart(2, '0')}`, 'CN Date (YYYY-MM-DD)': '2026-10-05', 'CN Type': 'Taxable', 'Taxable Value': String(tx), 'CGST': String(g), 'SGST': String(r2(i.diff - tx - g)), 'IGST': '0', 'IRN': '' }; }))); };
  // Rows with the same credit note number become one submission covering several notes (many-to-one).
  const groups = (rows ?? []).filter(r => !r.err).reduce((a, r) => { const g = a.get(r.cn) ?? { ids: [] as string[], doc: r.doc! }; g.ids.push(...r.ids); a.set(r.cn, g); return a; }, new Map<string, { ids: string[]; doc: CnDoc }>());
  const submit = () => { const id = `BLK-${String(ctx.ws.bulks.length + 1).padStart(4, '0')}`; const ids = [...groups.values()].map(g => ctx.submitCn(g.ids, g.doc, 'Bulk upload', id));
    ctx.addBulk({ id, relId: ctx.st.rel.id, file: fileName, rows: rows!.length, subs: ids, by: ctx.user.name, at: ctx.at() }); ctx.toast(`${groups.size} credit note${groups.size === 1 ? '' : 's'} sent to the buyer (${id})`); setRows(null); onDone(); };
  return <>
    {vendor && <Card title="Upload many credit notes at once" tip="One row per debit note. Rows that share a credit note number become one credit note covering several debit notes.">
      <div className="rx-cm-bulk">
        <button className="rw-btn" onClick={template} disabled={!open.length}><Icon n="download" /> Download template ({open.length} open)</button>
        <label className="rw-btn"><Icon n="upload" /> Upload filled template<input type="file" accept=".csv" hidden onChange={e => { pick(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
        <button className="rw-btn ghost" onClick={sample} disabled={!open.length}>Try a filled sample</button>
      </div>
      {err && <p className="rw-err">{err}</p>}
      {rows && <>
        <h4 className="rw-h4">{fileName} · {rows.length} row{rows.length === 1 ? '' : 's'} · {rows.filter(r => !r.err).length} ready</h4>
        <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Line</th><th>Note</th><th>Credit note</th><th className="ar">Total</th><th>Check</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.line}><td>{r.line}</td><td className="rx-mono">{r.note}</td><td className="rx-mono">{r.cn}</td><td className="ar">{m(r.total)}</td><td>{r.err ? <span className="rw-neg">{r.err}</span> : <span className="rw-ok">Ready</span>}</td></tr>)}</tbody></table></div>
        <div className="rd-btns"><button className="rw-btn ghost" onClick={() => setRows(null)}>Discard</button><button className="rw-btn lime" disabled={!groups.size} onClick={submit}>Submit {groups.size} credit note{groups.size === 1 ? '' : 's'} to the buyer</button></div>
      </>}
    </Card>}
    <Card title="Bulk upload history">
      <DataTable rows={history} rowKey={b => b.id} fileName="credit-bulk-uploads" empty="No bulk uploads yet." cols={[
        { key: 'id', label: 'Request', text: b => b.id, render: b => <b className="rx-mono">{b.id}</b> },
        { key: 'f', label: 'File', text: b => b.file },
        { key: 'n', label: 'Rows', align: 'right', text: b => String(b.rows) },
        { key: 's', label: 'Credit notes', text: b => b.subs.map(id => { const s = ctx.ws.cns.find(x => x.id === id); return s ? `${s.cn.no} (${s.status})` : id; }).join(', ') },
        { key: 'by', label: 'Uploaded by', text: b => `${b.by} ${b.at}`, render: b => <><span>{b.by}</span><br /><small className="rx-muted">{b.at}</small></> },
      ]} />
    </Card>
    {!vendor && !history.length && <p className="rx-muted">Vendors can upload many credit notes at once here; each one still comes to you for review.</p>}
  </>;
}
