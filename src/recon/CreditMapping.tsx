import React, { useMemo, useState } from 'react';
import { fmtDay, r2, type Txn } from './cycle';
import { tagLabel } from './ledger';
import { parseCSV } from './csv';
import { toCSV } from './engine';
import { creditItems, kindLabel, mappingOf, clears, docSign, type CItem, type CnSub, type CnDoc, type DocType } from './credit';
import { AiChip, Card, DataTable, Drawer, Icon, Pill, Avatar, money, signedMoney, download, type Col } from './ui';
import { askAi, blobUrlToBase64 } from './ai';
import { PageHead, vendorOf, entityOf, type Ctx } from './App';
import { Tour, useTour, card, type TourStep } from './tour';
import { DocViewer, sheetPdf, type ViewDoc } from './DocViewer';

// Credit Mapping. The vendor (L1) gives credit notes, vendor debits or refunds against our debit notes and the credit notes
// we booked; the buyer (L2) accepts, rejects or reopens them, and can also map documents itself (accepted at once).
// Accepted documents are agreements: the vendor's ledger stays the source of truth, and reconciliation matches the note
// once the same documents appear in it.
type Tab = 'open' | 'sub' | 'rej' | 'map' | 'bulk';
const STATE_TONE: Record<string, string> = { Open: 'grey', 'Partly mapped': 'amber', 'Over-credited': 'red', Submitted: 'blue', Rejected: 'red', Mapped: 'green' };
const SUB_TONE: Record<string, string> = { Submitted: 'blue', Accepted: 'green', Rejected: 'red', Reopened: 'grey' };
const DOCS: DocType[] = ['Credit note', 'Vendor debit', 'Refund'];
const docOf = (c: CnDoc): DocType => c.docType ?? 'Credit note';
const sumIds = (items: CItem[], ids: string[]) => r2(items.filter(i => ids.includes(i.t.id)).reduce((a, i) => a + i.diff, 0));

const TOUR = (vendor: boolean): TourStep[] => [
  { target: '.rx-cm-help', title: 'Credit Mapping in a minute', body: vendor ? 'Your customer has raised debit notes on you (claims, short supply, rate differences). Give the credit note, debit or refund for each one here. Skip anytime; Help brings this back.' : 'Debit notes we raised, and credit notes we booked, waiting for the vendor’s documents. The vendor submits; you accept, reject or reopen. Skip anytime; Help brings this back.' },
  { target: '.rx-cm-tiles', title: 'Where everything stands', body: 'Open, waiting for review, rejected, and mapped (either already in the vendor’s ledger, or agreed here and waiting for it). Click a tile to open that list.' },
  { target: '.rx-cm-tabs', title: vendor ? 'Your lists' : 'The review lists', body: vendor ? <><b>Open</b> needs a document. <b>Submitted</b> is with the buyer. <b>Rejected</b> came back with a reason. <b>Mapped</b> is done. <b>Bulk upload</b> takes many at once.</> : <><b>Awaiting review</b> is what the vendor submitted. <b>Open</b> still needs a document. <b>Rejected</b> went back with a reason. <b>Mapped</b> is done.</>, before: () => document.querySelector<HTMLButtonElement>(`.rx-cm-tabs button[data-tab="${vendor ? 'open' : 'sub'}"]`)?.click() },
  { target: card(vendor ? 'Open debit notes' : 'Documents awaiting your review'), title: vendor ? 'Select, then map' : 'Review each document', body: vendor ? 'Tick one or more debit notes and click Map documents. Add as many credit notes, vendor debits or refunds as it takes in the same window. Click any document number to see its details and copy.' : 'Open one to see the document, its copy, the notes it covers and the difference. Accept to agree it; reject with a reason. Got documents by email? Map them yourself from Open; they are accepted at once.' },
  { target: '.rx-cm-source', title: 'The vendor’s ledger decides', body: <>An accepted document is <b>agreed</b>, not reconciled. It shows on the statement as its own line until the same document appears in the vendor’s ledger; then reconciliation matches it automatically.</>, before: () => document.querySelector<HTMLButtonElement>('.rx-cm-tabs button[data-tab="map"]')?.click() },
  { target: '.rx-cm-help', title: 'Need it again?', body: 'Click Help anytime to replay this tutorial.' },
];

/** A document number that opens its details. */
const DocLink = ({ no, sub, onClick }: { no: string; sub?: string; onClick: () => void }) => <button type="button" className="rx-doclink" onClick={e => { e.stopPropagation(); onClick(); }} title={`Open ${no}`}>{no}{sub && <small>{sub}</small>}</button>;

export default function CreditMapping({ ctx }: { ctx: Ctx }) {
  const { st, tag, ws } = ctx; const vendor = ctx.isVendor; const cur = st.rel.currency; const m = (n: number | null | undefined) => money(n, cur, 2);
  const items = useMemo(() => creditItems(st, tag, ws.cns), [st, tag, ws.cns]);
  const subs = ws.cns.filter(s => s.relId === st.rel.id);
  const [tab, setTab] = useState<Tab>(vendor ? 'open' : 'sub'); const [sel, setSel] = useState<string[]>([]);
  const [form, setForm] = useState<{ ids: string[]; prefill?: CnDoc } | null>(null); const [view, setView] = useState<string | null>(null);
  const [ledgerDoc, setLedgerDoc] = useState<string | null>(null); const [viewer, setViewer] = useState<ViewDoc | null>(null);
  const [tour, startTour, endTour, skipTour] = useTour(`credit-${vendor ? 'vendor' : 'buyer'}`);
  const open = items.filter(i => i.state === 'Open' || i.state === 'Partly mapped' || i.state === 'Over-credited' || i.state === 'Rejected');
  const submitted = subs.filter(s => s.status === 'Submitted'); // A rejected document drops off the list once a later one is submitted for the same notes.
  const rejected = subs.filter(s => s.status === 'Rejected' && !subs.some((o, k) => k > subs.indexOf(s) && o.status !== 'Rejected' && o.buyerIds.some(id => s.buyerIds.includes(id))));
  const mapped = items.filter(i => i.state === 'Mapped');
  const docs = (ids: string[]) => ids.map(id => st.txns.find(t => t.id === id)?.docNo ?? id);
  const vName = vendorOf(st).displayName;
  const copyOf = (s: CnSub): ViewDoc => ({ name: s.cn.file ?? `${s.cn.no.replace(/[^\w-]+/g, '-')}.pdf`, url: s.cn.fileUrl, generated: !s.cn.fileUrl, make: () => sheetPdf(subSheet(ctx, s)) });

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

  // Every document recorded on a note: submissions here (any status but reopened) and documents from the vendor ledger.
  const docChips = (i: CItem) => <span className="rx-cm-chips">
    {i.subs.filter(s => s.status !== 'Reopened').map(s => <DocLink key={s.id} no={s.cn.no} sub={`${docOf(s.cn)} · ${s.status}`} onClick={() => setView(s.id)} />)}
    {i.vendorCns.map(t => <DocLink key={t.id} no={t.docNo} sub="Vendor ledger" onClick={() => setLedgerDoc(t.id)} />)}
    {!i.subs.length && !i.vendorCns.length && <span className="rx-muted">—</span>}</span>;
  const noteCol: Col<CItem> = { key: 'note', label: 'Note', text: i => `${i.t.docNo} ${kindLabel(i.kind)}`, render: i => <><b className="rx-mono">{i.t.docNo}</b><br /><small className="rx-muted">{kindLabel(i.kind)}</small></> };
  const openCols: Col<CItem>[] = [noteCol,
    { key: 'date', label: 'Date', text: i => fmtDay(i.t.date), sort: i => i.t.date },
    { key: 'inv', label: 'Against invoice', text: i => i.t.against || '—' },
    { key: 'per', label: 'Period', text: i => tagLabel(i.t.originTag) },
    { key: 'amt', label: 'Amount', align: 'right', text: i => String(i.amount), sort: i => i.amount, render: i => m(i.amount), total: r => <b>{m(r.reduce((a, i) => a + i.amount, 0))}</b> },
    { key: 'docs', label: 'Documents', text: i => i.subs.map(s => s.cn.no).join(', '), render: docChips },
    { key: 'ag', label: 'Agreed', align: 'right', text: i => String(i.agreed), render: i => i.agreed ? m(i.agreed) : <span className="rx-muted">—</span> },
    { key: 'diff', label: 'Difference', align: 'right', text: i => String(i.diff), sort: i => i.diff, render: i => <b>{m(i.diff)}</b>, total: r => <b>{m(r.reduce((a, i) => a + i.diff, 0))}</b> },
    { key: 'st', label: 'Status', text: i => i.state, render: i => <Pill tone={STATE_TONE[i.state]}>{i.state === 'Rejected' ? 'Last document rejected' : i.state === 'Over-credited' ? `Over-credited by ${m(-i.diff)}` : i.state}</Pill> },
  ];
  const subCols = (actions: (s: CnSub) => React.ReactNode): Col<CnSub>[] => [
    { key: 'id', label: 'Request', text: s => s.id, render: s => <><b className="rx-mono">{s.id}</b>{s.via === 'Bulk upload' && <><br /><small className="rx-muted">Bulk · {s.bulkId}</small></>}{s.via === 'Buyer entry' && <><br /><small className="rx-muted">Entered by buyer</small></>}</> },
    { key: 'cn', label: 'Document', text: s => `${docOf(s.cn)} ${s.cn.no}`, render: s => <DocLink no={s.cn.no} sub={`${docOf(s.cn)} · ${s.cn.date}`} onClick={() => setView(s.id)} /> },
    { key: 'tx', label: 'Taxable', align: 'right', text: s => String(s.cn.taxable), render: s => m(s.cn.taxable) },
    { key: 'gst', label: 'GST', align: 'right', text: s => String(s.cn.cgst + s.cn.sgst + s.cn.igst), render: s => m(r2(s.cn.cgst + s.cn.sgst + s.cn.igst)) },
    { key: 'tot', label: 'Amount', sub: 'vendor books', align: 'right', text: s => String(docSign(docOf(s.cn)) * s.cn.total), render: s => <b>{signedMoney(docSign(docOf(s.cn)) * s.cn.total, cur)}</b> },
    { key: 'notes', label: 'Against', text: s => docs(s.buyerIds).join(', '), render: s => <span className="rx-mono rx-cm-docs">{docs(s.buyerIds).join(', ')}</span> },
    { key: 'type', label: 'Mapping', text: s => mappingOf(s) },
    { key: 'diff', label: 'Difference', align: 'right', text: s => String(r2(sumIds(items, s.buyerIds) - clears(s.cn))), render: s => { const d = r2(sumIds(items, s.buyerIds) - clears(s.cn)); return s.status === 'Submitted' ? <b className={Math.abs(d) < 0.005 ? 'rw-ok' : 'rw-neg'}>{m(d)}</b> : <span className="rx-muted">—</span>; } },
    { key: 'by', label: tab === 'rej' ? 'Rejected by' : 'Submitted by', text: s => `${s.by} ${s.at}`, render: s => tab === 'rej' ? <><span>{s.decidedBy}</span><br /><small className="rx-muted">{s.decidedAt}</small></> : <><span>{s.by}</span><br /><small className="rx-muted">{s.at}</small></> },
    { key: 'act', label: '', noToggle: true, text: () => '', render: s => <span className="rx-bc-acts">{actions(s)}</span> },
  ];
  const resub = (s: CnSub) => setForm({ ids: s.buyerIds.filter(id => open.some(i => i.t.id === id)), prefill: s.cn });
  const rejCols: Col<CnSub>[] = (() => { const c = subCols(s => <>{vendor && <button className="rw-btn small lime" onClick={e => { e.stopPropagation(); resub(s); }}>Correct and resubmit</button>}<button className="rw-btn small ghost" onClick={e => { e.stopPropagation(); setView(s.id); }}>{vendor ? 'View' : 'View or reopen'}</button></>).filter(x => x.key !== 'diff');
    c.splice(c.length - 1, 0, { key: 'why', label: 'Reason', text: s => s.reason ?? '', render: s => <span className="rx-cm-why">{s.reason}</span> }); return c; })();
  const mapCols: Col<CItem>[] = [noteCol,
    { key: 'amt', label: 'Amount', align: 'right', text: i => String(i.amount), render: i => m(i.amount), total: r => <b>{m(r.reduce((a, i) => a + i.amount, 0))}</b> },
    { key: 'cns', label: 'Documents', text: i => i.cnNos.join(', '), render: i => i.source === 'Vendor ledger' ? <span className="rx-cm-chips">{i.vendorCns.map(t => <DocLink key={t.id} no={t.docNo} sub={`${t.type === 'CN' ? 'Credit note' : 'Debit'} · vendor ledger`} onClick={() => setLedgerDoc(t.id)} />)}</span> : <span className="rx-cm-chips">{i.subs.filter(s => s.status === 'Accepted').map(s => <DocLink key={s.id} no={s.cn.no} sub={docOf(s.cn)} onClick={() => setView(s.id)} />)}</span> },
    { key: 'mt', label: 'Mapping', text: i => i.mapping },
    { key: 'src', label: 'Source', text: i => i.source ?? '', render: i => <span className="rx-cm-source">{i.source === 'Vendor ledger' ? <Pill tone="green">In vendor ledger · reconciled</Pill> : <Pill tone="violet">Agreed here · awaiting vendor ledger</Pill>}</span> },
    { key: 'on', label: 'Mapped on', text: i => i.mappedOn ?? '' },
  ];
  const viewSub = view ? ws.cns.find(s => s.id === view) : undefined;
  const pickTab = (t: Tab) => { setTab(t); setSel([]); };

  return <>
    {tour && <Tour steps={TOUR(vendor)} onClose={endTour} onSkip={() => { skipTour(); ctx.toast('Tutorial skipped. Tutorials won’t open by themselves again; click Help anytime.'); }} />}
    <PageHead title="Credit Mapping" actions={<button type="button" className="rw-btn rx-cm-help" onClick={startTour} title="Replay the tutorial for this screen"><Icon n="info" /> Help</button>}>
      {vendor ? `Debit notes raised on ${vName}, and credit notes booked by the buyer, waiting for your documents. Submit credit notes, debits or refunds; the buyer reviews them. Once they are in your ledger, reconciliation matches them.` : `Debit notes we raised on ${vName}, and credit notes we booked, waiting for the vendor’s documents. The vendor submits; you accept, reject or reopen, or map documents yourself. The vendor’s ledger stays the source of truth.`}
    </PageHead>
    <div className="rx-tiles mini rx-cm-tiles">{tiles.map(([k, n, v, t, tone]) => <button type="button" key={k} className={'rx-tile rx-bc-tile ' + (n ? tone : '') + (tab === t ? ' on' : '')} onClick={() => pickTab(t)}><span>{k}</span><b>{n}</b><small>{m(v)}</small></button>)}</div>
    <div className="rw-tabs rx-cm-tabs" role="tablist">{TABS.map(([k, l, n]) => <button key={k} role="tab" data-tab={k} aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pickTab(k)}>{l} <em>{n}</em></button>)}</div>

    {tab === 'open' && <Card title={vendor ? 'Open debit notes' : 'Open: waiting for the vendor’s documents'} tip="Debit notes we raised and credit notes we booked that no document in the vendor’s ledger, or agreed here, covers yet. Click a document number to see it.">
      <DataTable rows={open} cols={openCols} rowKey={i => i.t.id} fileName="credit-mapping-open" empty="Nothing open. Every note is covered."
        selectable selected={sel} onSelect={setSel}
        toolbar={<span className="rx-cm-bar"><span>{sel.length ? <>Selected {sel.length} · open <b>{m(sumIds(items, sel))}</b></> : vendor ? 'Tick the notes your documents cover' : `Waiting for ${vName}, or tick notes to map documents you received`}</span><button className="rw-btn lime" disabled={!sel.length} onClick={() => setForm({ ids: sel })}><Icon n="file" /> Map documents</button></span>} />
    </Card>}
    {tab === 'sub' && <Card title={vendor ? 'Submitted to the buyer' : 'Documents awaiting your review'} tip={vendor ? 'The buyer accepts or rejects each one. Nothing changes in reconciliation until it is accepted.' : 'Accept to agree the document; reject with a reason so the vendor can correct it.'}>
      <DataTable rows={submitted} cols={subCols(s => <button className={'rw-btn small' + (vendor ? ' ghost' : ' lime')} onClick={e => { e.stopPropagation(); setView(s.id); }}>{vendor ? 'View' : 'Review'}</button>)} rowKey={s => s.id} fileName="credit-documents-submitted" onRowClick={s => setView(s.id)} empty={vendor ? 'Nothing waiting with the buyer.' : 'Nothing to review.'} />
    </Card>}
    {tab === 'rej' && <Card title="Rejected documents" tip="Sent back with a reason. The vendor corrects and resubmits; the buyer can also reopen one for review.">
      <DataTable rows={rejected} cols={rejCols} rowKey={s => s.id} fileName="credit-documents-rejected" onRowClick={s => setView(s.id)} empty="No rejected documents." />
    </Card>}
    {tab === 'map' && <Card title="Mapped notes" tip="Fully covered. ‘In vendor ledger’ means reconciliation matched it; ‘Agreed here’ means the buyer accepted it and it is waiting to appear in the vendor’s ledger. Click a document number for its details.">
      <DataTable rows={mapped} cols={mapCols} rowKey={i => i.t.id} fileName="credit-mapping-mapped" empty="Nothing mapped yet." />
    </Card>}
    {tab === 'bulk' && <Bulk ctx={ctx} open={open} onDone={() => pickTab('sub')} onOpen={setView} />}

    {form && <MapDrawer ctx={ctx} items={items.filter(i => form.ids.includes(i.t.id))} prefill={form.prefill} onClose={() => setForm(null)} onDone={full => { setForm(null); setSel([]); pickTab(vendor ? 'sub' : full ? 'map' : 'open'); }} onView={setViewer} />}
    {viewSub && <SubDrawer ctx={ctx} sub={viewSub} items={items} onClose={() => setView(null)} onOpen={setView} onLedger={id => { setView(null); setLedgerDoc(id); }} onView={() => setViewer(copyOf(viewSub))} onResubmit={() => { const s = viewSub; setView(null); resub(s); }} />}
    {ledgerDoc && <LedgerDocDrawer ctx={ctx} id={ledgerDoc} items={items} onClose={() => setLedgerDoc(null)} onView={setViewer} />}
    {viewer && <DocViewer doc={viewer} onClose={() => setViewer(null)} />}
  </>;
}

/** What a submitted document would look like printed: used when no file was uploaded (seeded examples). */
function subSheet(ctx: Ctx, s: CnSub) {
  const st = ctx.ws.states[s.relId]; const v = vendorOf(st), e = entityOf(st); const dt = docOf(s.cn); const cur = st.rel.currency; const m = (n: number) => money(n, cur, 2);
  const notes = s.buyerIds.map(id => st.txns.find(t => t.id === id)).filter((t): t is Txn => !!t);
  return { title: dt === 'Refund' ? 'Refund advice' : dt === 'Vendor debit' ? 'Debit note' : 'Credit note', number: s.cn.no, date: s.cn.date, from: [v.legalName, `GSTIN ${v.gstin}`] as [string, string], to: [e.name, `GSTIN ${e.gstin}`] as [string, string],
    against: notes.map(t => `${t.docNo} (${typeLabel(t)}) dated ${fmtDay(t.date)}${t.against ? `, invoice ${t.against}` : ''}`),
    rows: [...(dt === 'Refund' ? [] : [['Taxable value', m(s.cn.taxable)], ...(s.cn.igst ? [['IGST', m(s.cn.igst)]] : s.cn.cgst ? [['CGST', m(s.cn.cgst)], ['SGST', m(s.cn.sgst)]] : []), ['Type', s.cn.kind], ...(s.cn.irn ? [['IRN', s.cn.irn]] : [])]), [dt === 'Refund' ? 'Amount refunded' : 'Total', m(s.cn.total)]] as [string, string][],
    note: 'Generated copy for the NXT Foundry demo, from the details recorded in Credit Mapping. Synthetic data.' };
}
const typeLabel = (t: Txn) => t.raw?.['Type'] || t.type;

// ---------- Map documents: one or more credit notes, vendor debits and refunds against the selected notes ----------
const isoToDay = (iso: string) => { const ms = Date.parse(iso + 'T00:00:00Z'); return isNaN(ms) ? '' : fmtDay(ms); };
const dayToIso = (d: string) => { const ms = Date.parse(d.replace(/-/g, ' ') + ' UTC'); return isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10); };
interface Draft { key: number; doc: DocType; no: string; date: string; kind: CnDoc['kind']; inter: boolean; taxable: string; rate: string; irn: string; file: string; size?: number; url?: string }
const calc = (d: Draft) => { const refund = d.doc === 'Refund'; const tx = Number(d.taxable) || 0; const g = d.kind === 'Taxable' && !refund ? r2(tx * (Number(d.rate) || 0) / 100) : 0;
  const cgst = d.inter ? 0 : r2(g / 2), sgst = d.inter ? 0 : r2(g - r2(g / 2)), igst = d.inter ? g : 0; const total = r2(tx + g); return { tx, cgst, sgst, igst, total, effect: d.doc === 'Vendor debit' ? -total : total }; };
let seq = 0;
const blank = (doc: DocType): Draft => ({ key: ++seq, doc, no: '', date: '', kind: doc === 'Refund' ? 'Non-taxable' : 'Taxable', inter: false, taxable: '', rate: '18', irn: '', file: '' });

function MapDrawer({ ctx, items, prefill, onClose, onDone, onView }: { ctx: Ctx; items: CItem[]; prefill?: CnDoc; onClose: () => void; onDone: (full: boolean) => void; onView: (d: ViewDoc) => void }) {
  const vendor = ctx.isVendor; const cur = ctx.st.rel.currency; const m = (n: number) => money(n, cur, 2);
  const openAmt = r2(items.reduce((a, i) => a + i.diff, 0));
  const [drafts, setDrafts] = useState<Draft[]>(() => [prefill ? { key: ++seq, doc: prefill.docType ?? 'Credit note', no: prefill.no, date: dayToIso(prefill.date), kind: prefill.kind, inter: !!prefill.igst, taxable: String(prefill.taxable), rate: '18', irn: prefill.irn, file: prefill.file ?? '', size: prefill.fileSize, url: prefill.fileUrl } : blank(openAmt < -0.005 ? 'Vendor debit' : 'Credit note')]);
  const [active, setActive] = useState(drafts[0].key);
  const upd = (k: number, p: Partial<Draft>) => setDrafts(ds => ds.map(d => d.key === k ? { ...d, ...p } : d));
  const net = r2(drafts.reduce((a, d) => a + calc(d).effect, 0)); const diff = r2(openAmt - net);
  const taken = (d: Draft) => ctx.ws.cns.some(s => s.relId === ctx.st.rel.id && s.cn.no.trim().toUpperCase() === d.no.trim().toUpperCase() && (s.status === 'Submitted' || s.status === 'Accepted'));
  const twice = (d: Draft) => drafts.some(o => o.key !== d.key && o.no.trim() && o.no.trim().toUpperCase() === d.no.trim().toUpperCase());
  const valid = (d: Draft) => !!d.no.trim() && !!d.date && calc(d).total > 0 && !taken(d) && !twice(d);
  const ok = items.length > 0 && drafts.every(valid);
  const mapping = drafts.length > 1 ? (items.length > 1 ? 'Many-to-many' : 'One-to-many') : items.length > 1 ? 'Many-to-one' : items[0]?.agreed ? 'One-to-many' : 'One-to-one';
  const add = (doc: DocType) => { const d = blank(doc); setDrafts(ds => [...ds, d]); setActive(d.key); };
  const remove = (k: number) => { const rest = drafts.filter(d => d.key !== k); setDrafts(rest); if (active === k) setActive(rest[rest.length - 1].key); };
  // What this document still needs to cover, after the others in the window.
  const fill = (d: Draft) => { const others = r2(net - calc(d).effect); const left = r2(openAmt - others); const need = d.doc === 'Vendor debit' ? Math.max(0, -left) : Math.max(0, left);
    upd(d.key, { taxable: String(d.kind === 'Taxable' && d.doc !== 'Refund' ? r2(need / (1 + (Number(d.rate) || 0) / 100)) : need) }); };
  const toDoc = (d: Draft): CnDoc => { const c = calc(d); return { docType: d.doc, no: d.no.trim(), date: isoToDay(d.date), kind: d.doc === 'Refund' ? 'Non-taxable' : d.kind, taxable: c.tx, cgst: c.cgst, sgst: c.sgst, igst: c.igst, total: c.total, irn: d.kind === 'Taxable' && d.doc !== 'Refund' ? d.irn.trim() : '', file: d.file || undefined, fileSize: d.file ? d.size : undefined, fileUrl: d.file ? d.url : undefined }; };
  // A vendor's documents go to the buyer for review; the buyer's own entries are accepted at once (credits and refunds first, then debits).
  const submit = () => { const group = `G${Date.now()}`; const ids = items.map(i => i.t.id); const list = drafts.map(toDoc);
    if (vendor) { list.forEach(d => ctx.submitCn(ids, d, 'Form', undefined, group)); ctx.toast(`${list.length} document${list.length === 1 ? '' : 's'} sent to the buyer for review`); onDone(false); return; }
    const order = [...list].sort((a, b) => (a.docType === 'Vendor debit' ? 1 : 0) - (b.docType === 'Vendor debit' ? 1 : 0));
    const subIds = order.map(d => ctx.submitCn(ids, d, 'Buyer entry', undefined, group)); if (subIds.every(id => ctx.decideCn(id, 'accept'))) onDone(Math.abs(diff) < 0.005); };
  return <Drawer wide title="Map documents" sub={`${items.length} note${items.length === 1 ? '' : 's'} · ${drafts.length} document${drafts.length === 1 ? '' : 's'} · ${mapping}${vendor ? '' : ' · entered on the vendor’s behalf'}`} onClose={onClose}>
    <div className="rx-cm-sel">{items.map(i => <div key={i.t.id}><span className="rx-mono">{i.t.docNo}</span><small>{kindLabel(i.kind)}</small><b>{m(i.diff)}</b></div>)}</div>
    <div className="rx-cm-drafts">{drafts.map((d, n) => { const c = calc(d); const on = d.key === active; const refund = d.doc === 'Refund';
      return <section key={d.key} className={'rx-cm-draft' + (on ? ' on' : '') + (valid(d) ? ' ok' : '')}>
        <header onClick={() => setActive(d.key)}>
          <span className="rx-cm-n">{n + 1}</span>
          <span className="rx-cm-dh"><b>{d.no.trim() || `New ${d.doc.toLowerCase()}`}</b><small>{d.doc}{d.date ? ` · ${isoToDay(d.date)}` : ''}{d.file ? ' · copy attached' : ''}</small></span>
          <b className={'rx-cm-amt ' + (docSign(d.doc) < 0 ? 'neg' : 'pos')}>{c.total ? signedMoney(docSign(d.doc) * c.total, cur) : '—'}</b>
          {valid(d) && !on && <span className="rx-cm-tick" aria-label="Complete">✓</span>}
          {drafts.length > 1 && <button type="button" className="rx-cm-x" aria-label={`Remove document ${n + 1}`} title="Remove" onClick={e => { e.stopPropagation(); remove(d.key); }}><Icon n="x" s={14} /></button>}
        </header>
        {on && <div className="rx-cm-dbody">
          <div className="rx-cm-docs-pick" role="radiogroup" aria-label="Document type">{DOCS.map(k => <button key={k} type="button" role="radio" aria-checked={d.doc === k} className={d.doc === k ? 'on' : ''} onClick={() => upd(d.key, { doc: k, kind: k === 'Refund' ? 'Non-taxable' : d.kind })}>
            <b>{k} <span className={'rx-cm-sign ' + (docSign(k) < 0 ? 'neg' : 'pos')}>{docSign(k) < 0 ? '−' : '+'}</span></b>
            <small>{k === 'Credit note' ? 'Clears the debit note. Matches credit notes.' : k === 'Vendor debit' ? 'Adds back, e.g. reversing an excess credit. Matches debits.' : 'Settled in cash. Matches the payment received.'}</small></button>)}</div>
          <div className="rx-cm-form">
            <label className="rw-field">{refund ? 'Refund reference (UTR)' : `${d.doc} number`}<input id={`cm-no-${n}`} value={d.no} onChange={e => upd(d.key, { no: e.target.value })} placeholder={refund ? 'e.g. UTR4100123' : d.doc === 'Vendor debit' ? 'e.g. VD/KAV/0042' : 'e.g. CN/KAV/9012'} />{(taken(d) || twice(d)) && <small className="rw-err">{twice(d) ? 'Used twice in this window.' : 'Already submitted or accepted.'}</small>}</label>
            <label className="rw-field">{refund ? 'Refund date' : `${d.doc} date`}<input id={`cm-date-${n}`} type="date" value={d.date} onChange={e => upd(d.key, { date: e.target.value })} /></label>
            {!refund && <div className="rw-field">Type<div className="rw-seg">{(['Taxable', 'Non-taxable'] as const).map(k => <button key={k} type="button" className={d.kind === k ? 'on' : ''} aria-pressed={d.kind === k} onClick={() => upd(d.key, { kind: k })}>{k}</button>)}</div></div>}
            <label className="rw-field">{refund ? 'Refund amount' : 'Taxable value'}<input id={`cm-tx-${n}`} inputMode="decimal" value={d.taxable} onChange={e => upd(d.key, { taxable: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0.00" /><button type="button" className="rw-link" onClick={() => fill(d)}>Use what is left</button></label>
            {d.kind === 'Taxable' && !refund && <>
              <label className="rw-field">GST rate (%)<select className="rx-sel" value={d.rate} onChange={e => upd(d.key, { rate: e.target.value })}>{['5', '12', '18', '28'].map(r => <option key={r}>{r}</option>)}</select></label>
              <div className="rw-field">Supply<div className="rw-seg"><button type="button" className={!d.inter ? 'on' : ''} onClick={() => upd(d.key, { inter: false })}>CGST + SGST</button><button type="button" className={d.inter ? 'on' : ''} onClick={() => upd(d.key, { inter: true })}>IGST</button></div></div>
              <label className="rw-field">IRN (e-invoice)<input value={d.irn} onChange={e => upd(d.key, { irn: e.target.value })} placeholder="Optional" /></label>
              <div className="rw-field"><span>GST</span><b className="rx-cm-gst">{d.inter ? `IGST ${m(c.igst)}` : `CGST ${m(c.cgst)} · SGST ${m(c.sgst)}`}</b></div>
            </>}
            <div className="rw-field rx-cm-att">{refund ? 'Bank advice or refund proof' : `${d.doc} copy`}<Attach id={`cm-file-${n}`} file={d.file} size={d.size} url={d.url} onPick={(name, size, url) => upd(d.key, { file: name, size, url })} onClear={() => upd(d.key, { file: '', size: undefined, url: undefined })} onView={() => d.url && onView({ name: d.file, url: d.url })} /></div>
          </div>
        </div>}
      </section>; })}</div>
    <div className="rx-cm-add"><span>Add another</span>{DOCS.map(k => <button key={k} type="button" className="rw-btn small ghost" onClick={() => add(k)}><Icon n="plus" s={14} /> {k}</button>)}</div>
    <dl className="rx-cm-sum">
      <div><dt>Open on selected notes</dt><dd>{m(openAmt)}</dd></div>
      <div><dt>Documents clear</dt><dd>{m(net)}</dd></div>
      <div><dt>Documents</dt><dd>{drafts.filter(valid).length} of {drafts.length} ready</dd></div>
      <div className={Math.abs(diff) < 0.005 ? 'ok' : 'bad'}><dt>Difference</dt><dd>{m(diff)}</dd></div>
    </dl>
    <p className="rw-note">{!net ? 'Enter the amounts.' : Math.abs(diff) < 0.005 ? (vendor ? 'Brings the difference to zero. Once the buyer accepts, the notes move to Mapped.' : 'Brings the difference to zero. The notes move to Mapped as agreed, until the documents appear in the vendor’s ledger.') : diff > 0 ? `${m(diff)} stays open; the notes show as partly mapped until more documents cover it.` : `This leaves the notes over-credited by ${m(-diff)}. Add a vendor debit for that amount to bring it back to zero.`}{drafts.some(d => d.doc === 'Refund') ? ' For a refund, the buyer reverses the note (credit note reversal) and accounts the refund as payment received; the refund then reconciles with that payment.' : ''}</p>
    {!vendor && <p className="rx-muted rx-cm-behalf">Accepted as soon as you map them, and recorded as entered by {ctx.user.name} on the vendor’s behalf.</p>}
    <div className="rw-drawer-foot"><button className="rw-btn ghost" onClick={onClose}>Cancel</button><span className="sp" /><button className="rw-btn lime" disabled={!ok} onClick={submit}>{vendor ? `Submit ${drafts.length} to buyer` : `Map and accept ${drafts.length}`}</button></div>
  </Drawer>;
}

// ---------- One document: details, copy, other documents on the same notes, buyer decision, history ----------
function SubDrawer({ ctx, sub, items, onClose, onOpen, onLedger, onView, onResubmit }: { ctx: Ctx; sub: CnSub; items: CItem[]; onClose: () => void; onOpen: (id: string) => void; onLedger: (txnId: string) => void; onView: () => void; onResubmit: () => void }) {
  const cur = ctx.st.rel.currency; const m = (n: number) => money(n, cur, 2); const vendor = ctx.isVendor;
  const [reason, setReason] = useState('');
  const rows = sub.buyerIds.map(id => items.find(i => i.t.id === id)).filter((x): x is CItem => !!x);
  const openAmt = r2(rows.reduce((a, i) => a + i.diff, 0)); const diff = r2(openAmt - clears(sub.cn)); const dt = docOf(sub.cn);
  const inLedger = rows.some(i => i.source === 'Vendor ledger');
  const others = ctx.ws.cns.filter(o => o.id !== sub.id && o.relId === sub.relId && o.buyerIds.some(id => sub.buyerIds.includes(id)));
  const ledgerDocs = rows.flatMap(i => i.vendorCns);
  const act = (a: 'accept' | 'reject' | 'reopen') => { if (ctx.decideCn(sub.id, a, reason)) onClose(); };
  return <Drawer title={`${dt} ${sub.cn.no}`} sub={`${sub.id} · ${sub.status} · ${mappingOf(sub)} · ${sub.via}`} onClose={onClose}>
    <dl className="rx-cm-dl">
      <div><dt>Date</dt><dd>{sub.cn.date}</dd></div><div><dt>Document</dt><dd>{dt}{dt !== 'Refund' ? ` · ${sub.cn.kind}` : ''}</dd></div>
      <div><dt>{dt === 'Refund' ? 'Amount' : 'Taxable value'}</dt><dd>{m(sub.cn.taxable)}</dd></div><div><dt>GST</dt><dd>{sub.cn.igst ? `IGST ${m(sub.cn.igst)}` : sub.cn.cgst ? `CGST ${m(sub.cn.cgst)} · SGST ${m(sub.cn.sgst)}` : '—'}</dd></div>
      <div><dt>Amount (vendor books)</dt><dd><b>{signedMoney(docSign(dt) * sub.cn.total, cur)}</b></dd></div><div><dt>{dt === 'Refund' ? 'UTR' : 'IRN'}</dt><dd className="rx-mono">{dt === 'Refund' ? sub.cn.no : sub.cn.irn || '—'}</dd></div>
      <div><dt>{sub.via === 'Buyer entry' ? 'Entered' : 'Submitted'}</dt><dd>{sub.by} · {sub.at}</dd></div><div><dt>Status</dt><dd><Pill tone={SUB_TONE[sub.status]}>{sub.status}</Pill></dd></div>
    </dl>
    <h4 className="rw-h4">{dt === 'Refund' ? 'Refund proof' : `${dt} copy`}</h4>
    <FileCard name={sub.cn.file ?? `${sub.cn.no} (generated copy)`} size={sub.cn.fileSize} note={sub.cn.file ? `Attached by ${sub.by}` : 'No file attached; view a copy generated from these details'} onView={onView} />
    <h4 className="rw-h4">Against</h4>
    <div className="rx-cm-sel">{rows.map(i => <div key={i.t.id}><span className="rx-mono">{i.t.docNo}</span><small>{kindLabel(i.kind)} · {m(i.amount)}</small><b>{i.state === 'Mapped' ? <Pill tone="green">Mapped</Pill> : m(i.diff)}</b></div>)}</div>
    {(others.length > 0 || ledgerDocs.length > 0) && <><h4 className="rw-h4">Other documents on these notes</h4>
      <ul className="rx-cm-others">{others.map(o => <li key={o.id}><DocLink no={o.cn.no} sub={docOf(o.cn)} onClick={() => onOpen(o.id)} /><Pill tone={SUB_TONE[o.status]}>{o.status}</Pill><b>{signedMoney(docSign(docOf(o.cn)) * o.cn.total, cur)}</b></li>)}
        {ledgerDocs.map(t => <li key={t.id}><DocLink no={t.docNo} sub="Vendor ledger" onClick={() => onLedger(t.id)} /><Pill tone="green">Reconciled</Pill><b>{signedMoney(t.amount, cur)}</b></li>)}</ul></>}
    {sub.status === 'Submitted' && <p className={'rw-note' + (Math.abs(diff) < 0.005 ? '' : ' warn')}>Open {m(openAmt)}; this {dt.toLowerCase()} {dt === 'Vendor debit' ? 'adds back' : 'clears'} {m(sub.cn.total)}: difference {m(diff)}. {Math.abs(diff) < 0.005 ? 'Accepting maps these notes fully.' : diff > 0 ? 'Accepting maps them partly; the rest stays open.' : `Accepting leaves them over-credited by ${m(-diff)}; a vendor debit can bring it back.`}</p>}
    {sub.reason && <blockquote className="rx-cm-reason"><b>{sub.status === 'Rejected' ? 'Rejected' : 'Reason'}:</b> {sub.reason}</blockquote>}
    {!vendor && sub.status !== 'Reopened' && (sub.status !== 'Accepted' || !inLedger) && <label className="rw-field">Reason {sub.status === 'Submitted' ? '(required to reject)' : '(required)'}<textarea id="cm-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={sub.status === 'Submitted' ? 'e.g. GST charged on a non-taxable claim' : 'Why this needs another look'} /></label>}
    {!vendor && sub.status === 'Accepted' && inLedger && <p className="rw-note">This document is already in the vendor’s ledger and reconciled, so it cannot be reopened here. Reverse the match in Reconciled Transactions if it is wrong.</p>}
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

// ---------- A document that came from the vendor's ledger ----------
function LedgerDocDrawer({ ctx, id, items, onClose, onView }: { ctx: Ctx; id: string; items: CItem[]; onClose: () => void; onView: (d: ViewDoc) => void }) {
  const st = ctx.st; const t = st.txns.find(x => x.id === id); const cur = st.rel.currency; const m = (n: number) => money(n, cur, 2);
  if (!t) return null;
  const match = st.matches.find(x => !x.reversed && x.vendorIds.includes(t.id)); const notes = items.filter(i => match?.buyerIds.includes(i.t.id));
  const file = ctx.ws.files.find(f => f.id === t.fileId); const v = vendorOf(st), e = entityOf(st);
  const make = () => sheetPdf({ title: t.type === 'CN' ? 'Credit note' : t.type === 'DN' ? 'Debit note' : typeLabel(t), number: t.docNo, date: fmtDay(t.date), from: [v.legalName, `GSTIN ${v.gstin}`], to: [e.name, `GSTIN ${e.gstin}`],
    against: notes.length ? notes.map(i => `${i.t.docNo} (${typeLabel(i.t)})`) : [t.against || '—'], rows: [['Narration', t.narration || '—'], ['Ledger line', `${t.line} · ${file?.fileName ?? 'vendor ledger'}`], ['Amount', m(Math.abs(t.amount))]],
    note: 'Generated copy for the NXT Foundry demo, from the line in the vendor ledger. Synthetic data.' });
  return <Drawer title={`${typeLabel(t)} ${t.docNo}`} sub={`From the vendor’s ledger · ${tagLabel(t.originTag)}`} onClose={onClose}>
    <dl className="rx-cm-dl">
      <div><dt>Date</dt><dd>{fmtDay(t.date)}</dd></div><div><dt>Amount (vendor books)</dt><dd><b>{signedMoney(t.amount, cur)}</b></dd></div>
      <div><dt>Against</dt><dd className="rx-mono">{t.against || '—'}</dd></div><div><dt>Narration</dt><dd>{t.narration || '—'}</dd></div>
      <div><dt>Ledger file</dt><dd>{file?.fileName ?? '—'}</dd></div><div><dt>Line</dt><dd className="rx-mono">{t.line}</dd></div>
    </dl>
    <h4 className="rw-h4">Copy</h4>
    <FileCard name={`${t.docNo} (generated copy)`} note="From the vendor ledger line" onView={() => onView({ name: `${t.docNo.replace(/[^\w-]+/g, '-')}.pdf`, make, generated: true })} />
    <h4 className="rw-h4">Reconciled with</h4>
    {match ? <><div className="rx-cm-sel">{notes.map(i => <div key={i.t.id}><span className="rx-mono">{i.t.docNo}</span><small>{kindLabel(i.kind)}</small><b>{m(i.amount)}</b></div>)}</div>
      <p className="rw-note">{match.rule} · {match.confidence} · {match.at}. {match.explanation}</p></> : <p className="rx-muted">Not matched yet.</p>}
    <div className="rw-drawer-foot"><span className="sp" /><button className="rw-btn ghost" onClick={onClose}>Close</button></div>
  </Drawer>;
}

// ---------- AI: read an attached PDF and show what it says, for the user to check (never applied automatically) ----------
type PdfFields = { documentType: string; number: string | null; date: string | null; supplierName: string | null; supplierGstin: string | null; buyerName: string | null; buyerGstin: string | null; againstDocument: string | null; taxableValue: number | null; cgst: number | null; sgst: number | null; igst: number | null; total: number | null; confidence: string };
const inr = (n: number | null) => n === null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function readPdf(url: string) {
  const pdf = await blobUrlToBase64(url, 3 * 1048576);
  const { fields: f, checks } = await askAi<{ fields: PdfFields; checks: { totalsAddUp: boolean | null } }>({ task: 'read-pdf', pdf });
  const rows: [string, string][] = [['Document', f.documentType], ['Number', f.number ?? '—'], ['Date', f.date ?? '—'],
    ['From', [f.supplierName, f.supplierGstin].filter(Boolean).join(' · ') || '—'], ['To', [f.buyerName, f.buyerGstin].filter(Boolean).join(' · ') || '—'],
    ['Against', f.againstDocument ?? '—'], ['Taxable value', inr(f.taxableValue)], ['CGST / SGST / IGST', [f.cgst, f.sgst, f.igst].map(inr).join(' / ')], ['Total', inr(f.total)]];
  return <span className="ai-fields"><table><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
    <span className={'ai-check ' + (checks.totalsAddUp === false ? 'warn' : 'ok')}>{checks.totalsAddUp === null ? 'Totals not printed in full' : checks.totalsAddUp ? '✓ Taxable value + GST = total' : '⚠ Taxable value + GST doesn’t equal the total'} · confidence {f.confidence}</span>
    <span className="ai-note">The PDF was sent to our AI provider to read it; we don’t store it.</span></span>;
}

// ---------- Attachment: drop or browse a PDF; shown as a file card once picked ----------
const fmtSize = (b?: number) => b === undefined ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
function FileCard({ name, size, note, onClear, onView }: { name: string; size?: number; note: string; onClear?: () => void; onView?: () => void }) {
  return <div className="rx-att-file"><span className="rx-att-ic" aria-hidden="true">PDF</span><div><b title={name}>{name}</b><small>{[fmtSize(size), note].filter(Boolean).join(' · ')}</small></div>
    {onView && <button type="button" className="rx-att-view" onClick={onView}><Icon n="eye" s={14} /> View</button>}
    {onClear && <button type="button" onClick={onClear} aria-label={`Remove ${name}`} title="Remove"><Icon n="x" s={14} /></button>}</div>;
}
function Attach({ id, file, size, url, onPick, onClear, onView }: { id: string; file: string; size?: number; url?: string; onPick: (name: string, size: number, url: string) => void; onClear: () => void; onView: () => void }) {
  const [over, setOver] = useState(false); const [err, setErr] = useState('');
  const take = (f?: File) => { setErr(''); if (!f) return; if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setErr('Attach it as a PDF.'); return; } if (f.size > 10 * 1048576) { setErr('The file is larger than 10 MB.'); return; } onPick(f.name, f.size, URL.createObjectURL(f)); };
  if (file) return <><FileCard name={file} size={size} note="Ready to submit" onClear={onClear} onView={url ? onView : undefined} />{url && <AiChip label="Read this PDF" hint="Soon it will read the credit note number, date, amount and GST from the PDF and fill them in for you to check." run={() => readPdf(url)} />}</>;
  return <><AiChip hideWhenLive label="Read this PDF" hint="Soon it will read the credit note number, date, amount and GST from the PDF and fill them in for you to check." /><label className={'rx-att-drop' + (over ? ' over' : '')} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}>
    <input id={id} type="file" accept=".pdf,application/pdf" className="sr-only" onChange={e => { take(e.target.files?.[0]); e.currentTarget.value = ''; }} />
    <span className="rx-att-cloud" aria-hidden="true"><Icon n="upload" s={18} /></span><span><b>Drop the PDF here</b><small>or <u>browse your files</u> · PDF up to 10 MB</small></span></label>
    {err && <small className="rw-err">{err}</small>}</>;
}

// ---------- Bulk upload ----------
interface BRow { line: number; note: string; cn: string; total: number; err: string; ids: string[]; doc?: CnDoc }
function Bulk({ ctx, open, onDone, onOpen }: { ctx: Ctx; open: CItem[]; onDone: () => void; onOpen: (id: string) => void }) {
  const cur = ctx.st.rel.currency; const m = (n: number) => money(n, cur, 2); const vendor = ctx.isVendor;
  const [rows, setRows] = useState<BRow[] | null>(null); const [fileName, setFileName] = useState(''); const [err, setErr] = useState('');
  const history = ctx.ws.bulks.filter(b => b.relId === ctx.st.rel.id);
  const template = () => download(`${ctx.st.rel.vendorCode}_credit-document-template.csv`, toCSV(open.map(i => ({ 'Note No': i.t.docNo, 'Note Type': kindLabel(i.kind), 'Open Amount': i.diff.toFixed(2), 'Document': i.diff < 0 ? 'Vendor debit' : 'Credit note', 'CN No': '', 'CN Date (YYYY-MM-DD)': '', 'CN Type': 'Taxable', 'Taxable Value': '', 'CGST': '', 'SGST': '', 'IGST': '', 'IRN': '' }))));
  const check = (raw: Record<string, string>[]): BRow[] => raw.map((r, k) => {
    const note = (r['Note No'] ?? '').trim(); const it = open.find(i => i.t.docNo.toUpperCase() === note.toUpperCase()); const cn = (r['CN No'] ?? '').trim();
    const n = (c: string) => Number(String(r[c] ?? '').replace(/,/g, '')) || 0; const tx = n('Taxable Value'), c1 = n('CGST'), s1 = n('SGST'), i1 = n('IGST'); const total = r2(tx + c1 + s1 + i1);
    const day = isoToDay((r['CN Date (YYYY-MM-DD)'] ?? '').trim()); const kind = /non/i.test(r['CN Type'] ?? '') ? 'Non-taxable' : 'Taxable'; const docType: DocType = /debit/i.test(r['Document'] ?? '') ? 'Vendor debit' : /refund/i.test(r['Document'] ?? '') ? 'Refund' : 'Credit note';
    const e = !it ? `Note ${note || '(blank)'} is not open for this vendor` : !cn ? 'Document number missing' : !day ? 'Date must be YYYY-MM-DD' : total <= 0 ? 'Amount missing' : kind === 'Non-taxable' && c1 + s1 + i1 > 0 ? 'GST on a non-taxable document' : '';
    return { line: k + 2, note, cn, total, err: e, ids: it ? [it.t.id] : [], doc: e ? undefined : { docType, no: cn, date: day, kind, taxable: tx, cgst: c1, sgst: s1, igst: i1, total, irn: (r['IRN'] ?? '').trim() } };
  });
  const pick = async (f?: File) => { setErr(''); if (!f) return; if (!/\.csv$/i.test(f.name)) { setErr('This demo reads CSV files. In Excel use File → Save As → CSV UTF-8.'); return; }
    const p = parseCSV(await f.text()); const miss = ['Note No', 'CN No', 'Taxable Value'].filter(c => !p.columns.includes(c)); if (miss.length) { setErr(`Missing columns: ${miss.join(', ')}. Download the template for the layout.`); return; }
    setFileName(f.name); setRows(check(p.rows)); };
  const sample = () => { setFileName('credit_notes_sample.csv'); setRows(check(open.filter(i => i.state !== 'Partly mapped' && i.diff > 0).slice(0, 3).map((i, k) => { const tx = r2(i.diff / 1.18); const g = r2((i.diff - tx) / 2);
    return { 'Note No': i.t.docNo, 'Document': 'Credit note', 'CN No': `CN/${ctx.st.rel.vendorCode.slice(0, 3)}/B${String(k + 1).padStart(2, '0')}`, 'CN Date (YYYY-MM-DD)': '2026-10-05', 'CN Type': 'Taxable', 'Taxable Value': String(tx), 'CGST': String(g), 'SGST': String(r2(i.diff - tx - g)), 'IGST': '0', 'IRN': '' }; }))); };
  // Rows with the same document number become one submission covering several notes (many-to-one).
  const groups = (rows ?? []).filter(r => !r.err).reduce((a, r) => { const k = `${r.doc!.docType}|${r.cn}`; const g = a.get(k) ?? { ids: [] as string[], doc: r.doc! }; g.ids.push(...r.ids); a.set(k, g); return a; }, new Map<string, { ids: string[]; doc: CnDoc }>());
  const submit = () => { const id = `BLK-${String(ctx.ws.bulks.length + 1).padStart(4, '0')}`; const ids = [...groups.values()].map(g => ctx.submitCn(g.ids, g.doc, 'Bulk upload', id));
    ctx.addBulk({ id, relId: ctx.st.rel.id, file: fileName, rows: rows!.length, subs: ids, by: ctx.user.name, at: ctx.at() }); ctx.toast(`${groups.size} document${groups.size === 1 ? '' : 's'} sent to the buyer (${id})`); setRows(null); onDone(); };
  return <>
    {vendor && <Card title="Upload many documents at once" tip="One row per note. Rows that share a document number become one document covering several notes. The Document column takes Credit note, Vendor debit or Refund.">
      <div className="rx-cm-bulk">
        <button className="rw-btn" onClick={template} disabled={!open.length}><Icon n="download" /> Download template ({open.length} open)</button>
        <label className="rw-btn"><Icon n="upload" /> Upload filled template<input type="file" accept=".csv" hidden onChange={e => { pick(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
        <button className="rw-btn ghost" onClick={sample} disabled={!open.length}>Try a filled sample</button>
      </div>
      {err && <p className="rw-err">{err}</p>}
      {rows && <>
        <h4 className="rw-h4">{fileName} · {rows.length} row{rows.length === 1 ? '' : 's'} · {rows.filter(r => !r.err).length} ready</h4>
        <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Line</th><th>Note</th><th>Document</th><th className="ar">Total</th><th>Check</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.line}><td>{r.line}</td><td className="rx-mono">{r.note}</td><td className="rx-mono">{r.cn}{r.doc && <small className="rx-muted"> · {r.doc.docType}</small>}</td><td className="ar">{m(r.total)}</td><td>{r.err ? <span className="rw-neg">{r.err}</span> : <span className="rw-ok">Ready</span>}</td></tr>)}</tbody></table></div>
        <div className="rd-btns"><button className="rw-btn ghost" onClick={() => setRows(null)}>Discard</button><button className="rw-btn lime" disabled={!groups.size} onClick={submit}>Submit {groups.size} document{groups.size === 1 ? '' : 's'} to the buyer</button></div>
      </>}
    </Card>}
    <Card title="Bulk upload history">
      <DataTable rows={history} rowKey={b => b.id} fileName="credit-bulk-uploads" empty="No bulk uploads yet." cols={[
        { key: 'id', label: 'Request', text: b => b.id, render: b => <b className="rx-mono">{b.id}</b> },
        { key: 'f', label: 'File', text: b => b.file },
        { key: 'n', label: 'Rows', align: 'right', text: b => String(b.rows) },
        { key: 's', label: 'Documents', text: b => b.subs.map(id => ctx.ws.cns.find(x => x.id === id)?.cn.no ?? id).join(', '), render: b => <span className="rx-cm-chips">{b.subs.map(id => { const s = ctx.ws.cns.find(x => x.id === id); return s ? <DocLink key={id} no={s.cn.no} sub={s.status} onClick={() => onOpen(id)} /> : null; })}</span> },
        { key: 'by', label: 'Uploaded by', text: b => `${b.by} ${b.at}`, render: b => <><span>{b.by}</span><br /><small className="rx-muted">{b.at}</small></> },
      ]} />
    </Card>
    {!vendor && !history.length && <p className="rx-muted">Vendors can upload many documents at once here; each one still comes to you for review.</p>}
  </>;
}
