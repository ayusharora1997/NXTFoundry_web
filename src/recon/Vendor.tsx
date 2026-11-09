import React, { useState } from 'react';
import { toCSV } from './engine';
import { ANNEXURES, ME, act, actTime, stamp, type AnnexId } from './model';
import { Avatar, Card, Icon, Pill, Ring, Waterfall, download, inr, num, short, statusTone } from './ui';
import { PageHead, type Ctx } from './App';
import { vendorRows } from './Summary';

export default function VendorScreen({ ctx, vendorId }: { ctx: Ctx; vendorId: string }) {
  const { ws, setWs, r, annex, go, openException, openUpload, undoable, log } = ctx;
  const all = vendorRows(ctx); const i = all.findIndex(x => x.id === vendorId); const row = all[i];
  const [open, setOpen] = useState<AnnexId | ''>('');
  const [pick, setPick] = useState('');
  const [signer, setSigner] = useState(row ? `${row.name.split(' ')[0]} accounts (vendor)` : '');
  const [note, setNote] = useState('');
  if (!row) return <PageHead title="Vendor not found">That vendor is not in this demo. <button className="rw-link" onClick={() => go('summary')}>Back to all vendors</button></PageHead>;
  const nav = <div className="rd-crumbs"><button className="rw-link" onClick={() => go('summary')}>← All vendors</button><span>{i + 1} of {all.length}</span>
    <button className="rw-btn small ghost" disabled={i === 0} onClick={() => go('vendor', all[i - 1].id)}>‹ Previous</button><button className="rw-btn small ghost" disabled={i === all.length - 1} onClick={() => go('vendor', all[i + 1].id)}>Next ›</button></div>;
  const timeline = ws.activity.filter(a => a.vendorId === row.id).sort((a, b) => actTime(b.at) - actTime(a.at) || b.id - a.id);
  const addNote = () => { if (!note.trim()) return; log({ kind: 'comment', vendorId: row.id, what: 'Added a note', text: note.trim() }); setNote(''); };

  if (row.status === 'Ledger not received') {
    const asked = ws.requested[row.id];
    return <>{nav}
      <PageHead title={row.name} actions={<Pill tone="red">Ledger not received</Pill>}>{row.id} · {row.category}. No statement of account has arrived for {row.name.split(' ')[0]} this period, so there is nothing to reconcile yet.</PageHead>
      <div className="rd-cols"><Card title="What we know">
        <dl className="rw-dl"><div><dt>Buyer ledger balance</dt><dd>{inr(row.buyerCB, 2)}</dd></div><div><dt>Statement requested</dt><dd>{asked ?? 'Not yet'}</dd></div></dl>
        <div className="rd-btns"><button className="rw-btn lime" onClick={() => openUpload(row.id)}><Icon n="upload" /> Upload their statement</button>
          <button className="rw-btn" onClick={() => { setWs(w => ({ ...w, requested: { ...w.requested, [row.id]: stamp() }, activity: [act({ kind: 'reminder', vendorId: row.id, what: asked ? 'Sent a reminder for the statement of account' : 'Statement of account requested from vendor' }), ...w.activity] })); ctx.toast(`Reminder logged for ${row.name}`); }}><Icon n="chat" /> {asked ? 'Send reminder' : 'Request statement'}</button></div>
      </Card><Timeline items={timeline} note={note} setNote={setNote} addNote={addNote} /></div></>;
  }

  const data = annex.get(row.id);
  const recs = r.normalized.buyer.filter(x => x.vendorId === row.id).length + r.normalized.supplier.filter(x => x.vendorId === row.id).length;
  const pairs = r.matches.filter(m => m.buyer.vendorId === row.id).length;
  const exs = r.exceptions.filter(e => e.vendorId === row.id);
  const resolved = exs.filter(e => e.status === 'Resolved').length;
  const job = ws.jobs.find(j => j.vendorId === row.id);
  const steps = [
    { t: 'Ledger received', d: job ? job.uploadedAt : '', done: true },
    { t: 'Matched', d: `${pairs} pairs · ${recs ? Math.round(pairs * 200 / recs) : 0}%`, done: true },
    { t: 'Open items', d: `${resolved} of ${exs.length} resolved`, done: resolved === exs.length },
    { t: 'Vendor sign-off', d: row.vSign?.at ?? 'Pending', done: !!row.vSign },
    { t: 'Buyer sign-off', d: row.bSign?.at ?? 'Pending', done: !!row.bSign },
  ];
  const current = steps.findIndex(s => !s.done);
  const sign = (side: 'vendorSign' | 'buyerSign', by: string | null) => undoable(by ? `${side === 'vendorSign' ? 'Vendor' : 'Buyer'} sign-off recorded for ${row.name}` : 'Sign-off withdrawn', () => setWs(w => {
    const m = { ...w[side] }; if (by) m[row.id] = { by, at: stamp() }; else delete m[row.id];
    return { ...w, [side]: m, activity: [act({ kind: 'signoff', vendorId: row.id, who: by ?? ME, what: by ? `${side === 'vendorSign' ? 'Vendor' : 'Buyer'} signed off the reconciliation` : `${side === 'vendorSign' ? 'Vendor' : 'Buyer'} sign-off withdrawn` }), ...w.activity] };
  }));
  const exportLines = () => download(`${row.id}_reconciliation.csv`, toCSV(ANNEXURES.flatMap(a => (data?.lines[a.id] ?? []).map(b => ({ 'Annexure': a.id, 'Title': a.title, 'Line': b.id, 'Description': b.description, 'Amount (buyer − vendor)': b.amount, 'Status': b.nature, 'Open item': r.exceptions.find(e => e.key === b.exceptionKey)?.id ?? '', 'Source records': b.refs.join(' | ') })))));
  const nz = ANNEXURES.filter(a => (row.annex?.[a.id] ?? 0) !== 0);

  return <>{nav}
    <PageHead title={row.name} actions={<><Pill tone={statusTone(row.status)}>{row.status}</Pill><button className="rw-btn" onClick={exportLines}><Icon n="download" /> Reconciliation CSV</button><button className="rw-btn" onClick={() => openUpload(row.id)}><Icon n="upload" /> Re-upload</button></>}>
      {row.id} · {row.category}{job && <> · statement from {job.uploadedBy}, {job.uploadedAt}</>}
    </PageHead>
    <ol className="rd-steps" aria-label="Reconciliation progress">{steps.map((s, k) => <li key={s.t} className={s.done ? 'done' : k === current ? 'cur' : ''}><span>{s.done ? '✓' : k + 1}</span><b>{s.t}</b><small>{s.d}</small></li>)}</ol>
    <div className="rd-kpis">
      <div><span>Buyer closing</span><b>{inr(row.buyerCB)}</b></div><div><span>Vendor closing</span><b>{inr(row.vendorCB)}</b></div>
      <div className="key"><span>Difference</span><b>{inr(row.diff)}</b></div>
      <div><Ring size={58} stroke={7} value={recs ? pairs * 2 / recs : 0} label="Matched" sub={`${pairs} pairs`} /></div>
      <div><span>Open items</span><b>{row.openEx}</b>{row.openEx > 0 && <button className="rw-link" onClick={() => { ctx.setVendor(row.id); go('unreconciled'); }}>Work through them →</button>}</div>
    </div>
    <div className="rd-cols">
      <div>
        <Card title="How the difference builds up" tip="Starts at the buyer’s closing balance; each annexure moves it until it reaches the vendor’s closing balance. Click a bar to open that annexure.">
          {nz.length ? <Waterfall height={150} start={{ label: 'Buyer', value: row.buyerCB }} end={{ label: 'Vendor', value: row.vendorCB ?? 0 }} active={pick} onPick={k => { setPick(k); setOpen(k as AnnexId); }}
            steps={nz.map(a => ({ key: a.id, label: a.id, value: row.annex![a.id], note: a.title }))} /> : <p className="rw-note ok">The two balances agree. Nothing to explain.</p>}
        </Card>
        <Card title="Annexures" tip="Every line behind the difference, grouped. Lines linked to an open item take you to it.">
          <div className="rw-annex">
            {ANNEXURES.map(a => { const ls = data?.lines[a.id] ?? []; const amt = row.annex?.[a.id] ?? 0; const isOpen = open === a.id;
              return <div key={a.id} className={'rw-annex-item' + (ls.length ? '' : ' empty')}>
                <button disabled={!ls.length} onClick={() => { setOpen(isOpen ? '' : a.id); setPick(isOpen ? '' : a.id); }} aria-expanded={isOpen}><span className="id">{a.id}</span><span><b>{a.title}</b><small>{a.group} · {a.sub}</small></span><em>{ls.length || ''}</em><b className="amt">{num(amt, 2)}</b></button>
                {isOpen && <ul>{ls.map(b => { const e = r.exceptions.find(x => x.key === b.exceptionKey); return <li key={b.id}><span><b>{b.description}</b><small>{b.effect} · {b.refs.join(', ')}</small></span>{e ? <button className="rw-link" onClick={() => openException(e.key)}>{e.id} · {e.status}</button> : <small>{b.nature}</small>}<b className="amt">{num(b.amount, 2)}</b></li>; })}</ul>}
              </div>; })}
            <div className="rw-annex-total"><span>Grand total</span><b>{num(row.grand, 2)}</b></div>
            <div className="rw-annex-total check"><span>Unexplained</span><b className={Math.abs((row.diff ?? 0) - (row.grand ?? 0)) < 0.5 ? 'rw-ok' : 'rw-neg'}>{Math.abs((row.diff ?? 0) - (row.grand ?? 0)) < 0.5 ? '✓ 0.00' : num((row.diff ?? 0) - (row.grand ?? 0), 2)}</b></div>
          </div>
        </Card>
      </div>
      <div>
        <Card title="Sign-off" tip="Both sides sign to agree the statement and its annexures, including any items still open. A new upload withdraws both signatures.">
          {row.openEx > 0 && !row.bSign && <p className="rw-note">{row.openEx} item{row.openEx > 1 ? 's are' : ' is'} still open. Signing records agreement with these items listed.</p>}
          <div className="rw-sign">
            <div><span>Vendor</span>{row.vSign ? <><b>{row.vSign.by}</b><small>{row.vSign.at}</small><button className="rw-link" onClick={() => sign('vendorSign', null)}>Withdraw</button></>
              : <><input value={signer} onChange={e => setSigner(e.target.value)} aria-label="Vendor signatory" /><button className="rw-btn small" disabled={!signer.trim()} onClick={() => sign('vendorSign', signer.trim())}>Record vendor sign-off</button></>}</div>
            <div><span>Buyer</span>{row.bSign ? <><b>{row.bSign.by}</b><small>{row.bSign.at}</small><button className="rw-link" onClick={() => sign('buyerSign', null)}>Withdraw</button></>
              : <button className="rw-btn small lime" onClick={() => sign('buyerSign', ME)}><Icon n="sign" s={14} /> Sign off as buyer</button>}</div>
          </div>
        </Card>
        <Timeline items={timeline} note={note} setNote={setNote} addNote={addNote} />
      </div>
    </div>
  </>;
}

function Timeline({ items, note, setNote, addNote }: { items: ReturnType<typeof act>[]; note: string; setNote: (s: string) => void; addNote: () => void }) {
  return <Card title="Timeline" tip="Everything that has happened with this vendor this period. Notes are visible to the whole AP team.">
    <div className="rd-note-box"><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note, e.g. called their AR desk, promised revised statement by Friday" aria-label="Add a note" onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }} /><button className="rw-btn small lime" disabled={!note.trim()} onClick={addNote}>Add note</button></div>
    <ol className="rw-timeline">{items.map(a => <li key={a.id} className={a.kind}><Avatar name={a.who} /><div><p><b>{a.who}</b> · {a.what}</p>{a.text && <blockquote>{a.text}</blockquote>}<small>{a.at}</small></div></li>)}
      {!items.length && <li className="empty">Nothing recorded yet.</li>}</ol>
  </Card>;
}
