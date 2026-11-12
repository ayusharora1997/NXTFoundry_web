import React, { useState } from 'react';
import { statement, heldTxnIds, agreedNotes, FAMILY, LEDGER_COLUMNS, tagKey, prepare, share, vendorResponse, finalSignoff, reopen, closePeriod, approveRounding, fmtDay, r2, type Statement, type AnnexRow, type Side } from './cycle';
import { nextDef, filesFor } from './store';
import { tagLabel } from './ledger';
import { xlsx, saveBlob } from './xlsx';
import { Card, Icon, Pill, Waterfall, money, signedMoney } from './ui';
import { PageHead, vendorOf, entityOf, STATUS_TONE, type Ctx } from './App';
import History from './History';
import { kindOf } from './PairTable';
import { SECT, type Info } from './annex';

export default function Balance({ ctx }: { ctx: Ctx }) {
  const { st, tag, settings, run, user, at, approver, go, ws } = ctx;
  const p = st.periods.find(x => x.tag === tag)!; const cur = st.rel.currency; const m = (n: number | null | undefined, dp = 2) => money(n, cur, dp);
  const live = statement(st, tag, settings, at());
  const s: Statement = p.phase !== 'working' && p.snapshot ? p.snapshot : live;
  const frozen = s !== live;
  const wf = ctx.stat(st, tag); const vend = ctx.isVendor;
  const [open, setOpen] = useState<number | null>(null); const [recAll, setRecAll] = useState(false);
  const [rep, setRep] = useState(vendorOf(st).contact.name); const [comments, setComments] = useState(''); const [reason, setReason] = useState(''); const [round, setRound] = useState('');
  const next = nextDef(st.rel, tag); const nextReady = next && filesFor(ws, st.rel.id, next.tag).some(f => f.kind === 'period');
  const v = vendorOf(st), e = entityOf(st);
  // ---- Statement model: closing balance per buyer → annexures → closing balance per vendor ----
  const held = heldTxnIds(st); const agreedSet = agreedNotes(st); const byId = new Map(st.txns.map(t => [t.id, t]));
  const info = (r: AnnexRow): Info => ({ fam: FAMILY[byId.get(r.txnId)!.type], side: r.buyerAmount !== null ? 'B' : 'V', held: held.has(r.txnId), timing: r.category.endsWith('(timing)'), agreed: agreedSet.has(r.txnId) });
  // Moving from the buyer's closing to the vendor's: remove what only the buyer has, add what only the vendor has.
  const eff = (r: AnnexRow) => r.buyerAmount !== null ? -r.buyerAmount : (r.vendorAmount ?? 0);
  const allRows = s.annexures.flatMap(a => a.rows);
  const secs = SECT.map(d => { const rows = allRows.filter(r => { const i = info(r); return d.fam.includes(i.fam) && d.t(i); }); return { ...d, rows, effect: r2(rows.reduce((x, r) => x + eff(r), 0)) }; });
  const ANN = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => { const ss = secs.filter(x => x.n === n); return { n, name: n === 5 ? 'Credit notes' : n === 9 ? 'TDS' : ss[0].title, secs: ss, count: ss.reduce((x, y) => x + y.rows.length, 0), effect: r2(ss.reduce((x, y) => x + y.effect, 0)) }; });
  const SHOWN = ANN.filter(a => a.effect !== 0); // annexures with nothing to explain are left out
  const selN = SHOWN.some(a => a.n === open) ? open : SHOWN[0]?.n;
  const annTotal = r2(ANN.reduce((x, a) => x + a.effect, 0)); // equals vendor − buyer once adjustments and unexplained are nil
  const adjRows = s.adjustments.map(a => ({ id: a.id, label: a.kind === 'rounding' ? 'Rounding adjustment' : a.kind === 'opening-position' ? 'Approved opening position' : a.kind.startsWith('opening') ? `Approved ${a.side === 'B' ? 'buyer' : 'vendor'} opening difference` : 'Approved adjustment', effect: r2(-a.effect) }));
  const unexEff = s.unexplained === null ? 0 : r2(-s.unexplained);
  const endV = s.buyerClosing === null ? null : r2(s.buyerClosing + annTotal + adjRows.reduce((x, a) => x + a.effect, 0) + unexEff);
  const agrees = endV !== null && s.vendorClosing !== null && Math.abs(endV - s.vendorClosing) < 0.005;

  const exportXlsx = () => {
    const files = filesFor(ws, st.rel.id, tag); const ledger = (side: Side) => { const f = files.find(x => x.side === side && x.kind === 'period');
      return { name: side === 'B' ? 'Buyer Ledger' : 'Vendor Ledger', widths: [16, 22, 14, 14, 14, 14, 14, 22, 22, 30, 12], rows: [[side === 'B' ? `Buyer ledger · ${e.name}` : `Vendor ledger · ${v.legalName}`], ['Opening balance', p.opening[side]], ['Closing balance', p.closing[side]], ['File', f?.fileName ?? 'Not received'], [], LEDGER_COLUMNS, ...(f?.rows ?? []).map(r => LEDGER_COLUMNS.map(c => r[c] ?? ''))] as (string | number | null)[][] }; };
    const annSheet = (a: typeof ANN[number]) => { const rows: (string | number | null)[][] = [[`Annexure ${a.n} · ${a.name}`], []]; const head = ['Annexure tag', 'Document no.', 'Type', 'Date', 'Buyer amount', 'Vendor amount', 'Reference', 'Status', 'Effect on bridge'];
      a.secs.filter(x => x.effect !== 0).forEach(x => { if (a.secs.length > 1) rows.push([`${a.n}${x.sub} · ${x.title}`]); rows.push(head); x.rows.forEach(r => rows.push([r.originTag, r.docNo, r.type, fmtDay(r.date), r.buyerAmount, r.vendorAmount, r.reference, r.status, eff(r)])); if (!x.rows.length) rows.push(['Nil']); rows.push(['Total', '', '', '', '', '', '', '', x.effect], []); });
      if (a.secs.length > 1) rows.push([`Total annexure ${a.n}`, '', '', '', '', '', '', '', a.effect]); return { name: `Annexure ${a.n}`, widths: [16, 18, 18, 14, 16, 16, 24, 22, 16], rows }; };
    const pop = new Set(st.txns.filter(t => t.importedIn === tag || p.carriedIn.includes(t.id)).map(t => t.id)); const doc = (i: string) => byId.get(i)?.docNo || byId.get(i)?.ref || '';
    const rec = st.matches.filter(x => !x.reversed && !x.partial && x.kind !== 'adjustment' && [...x.buyerIds, ...x.vendorIds].some(i => pop.has(i)));
    const recSheet = { name: 'Reconciled Transactions', widths: [10, 16, 26, 12, 16, 30, 16, 30, 16, 14], rows: [['Match', 'Match type', 'Rule', 'Confidence', 'Open period', 'Buyer documents', 'Buyer amount', 'Vendor documents', 'Vendor amount', 'Difference'],
      ...rec.map(x => { const B = x.buyerIds.map(i => byId.get(i)!).filter(Boolean), V = x.vendorIds.map(i => byId.get(i)!).filter(Boolean); const bs = r2(B.reduce((q, t) => q + t.amount, 0)), vs = r2(V.reduce((q, t) => q + t.amount, 0));
        return [x.id, kindOf(B, V, x.kind === 'contra'), x.rule, x.confidence, tagLabel([...B, ...V].map(t => t.originTag).sort((a, b) => tagKey(a) - tagKey(b))[0] ?? tag), B.map(t => t.docNo || t.ref).join(', '), B.length ? bs : null, V.map(t => t.docNo || t.ref).join(', '), V.length ? vs : null, r2(bs - vs)]; })] as (string | number | null)[][] };
    const bridge: (string | number | null)[][] = [['NXT Vendor Payable Reconciliation · Reconciliation statement'], [], ['Buyer entity', e.name], ['Business unit', st.rel.bu], ['Vendor', `${v.legalName} (${st.rel.vendorCode})`], ['Vendor GSTIN', v.gstin], ['Currency', cur], ['Period', tagLabel(tag)], ['Statement tag', tag], ['Version', s.version], ['Status', wf], ['Generated', s.generatedAt || at()], [],
      ['Closing balance as per buyer', s.buyerClosing], ...ANN.flatMap(a => [[`Annexure ${a.n} · ${a.name}`, a.effect, `${a.count} item(s)`], ...(a.secs.length > 1 ? a.secs.map(x => [`   ${a.n}${x.sub} · ${x.title}`, x.effect, `${x.rows.length} item(s)`]) : [])]),
      ...adjRows.map(a => [a.label, a.effect]), ...(unexEff ? [['Unexplained difference', unexEff]] : []), ['Closing balance as per vendor (computed)', endV], ['Closing balance per vendor ledger', s.vendorClosing], [], ['Difference in closing balances (buyer − vendor)', s.difference], ['Sum of annexures (buyer − vendor)', r2(-annTotal)]];
    saveBlob(`${st.rel.vendorCode}_${st.rel.bu.replace(/\s/g, '')}_${tag}_reconciliation_v${s.version}.xlsx`, xlsx([{ name: 'Statement', widths: [48, 20, 20], rows: bridge }, ledger('B'), ledger('V'), ...SHOWN.map(annSheet), recSheet,
      { name: 'Sign-off', widths: [10, 12, 22, 22, 18, 50], rows: [['Version', 'Event', 'By', 'Vendor representative', 'At', 'Comments'], ...p.signoffs.map(x => [x.version, x.event, x.by, x.rep ?? '', x.at, x.comments])] }]));
  };
  if (p.confirmed) return <>
    <PageHead title="Reconciliation statement" />
    <div className="rx-bc-cert rx-bc-closed"><Icon n="check" s={22} /><div><b>{tagLabel(tag)} was closed by balance confirmation · certificate {p.confirmed.certNo}</b>
      <p>{p.confirmed.rep} confirmed our closing balance of {m(p.confirmed.balance)} on {p.confirmed.at}, so no reconciliation statement is needed for this period. Open items stay recorded as they are; {next ? `${tagLabel(next.tag)} opens from the confirmed balance and reconciles only its own entries.` : 'the next period opens from the confirmed balance.'}</p>
      <button className="rw-btn small" onClick={() => go('confirm')}>View the confirmation</button>{next && st.periods.some(q => q.tag === next.tag) && <button className="rw-btn small lime" onClick={() => ctx.select(st.rel.id, next.tag)}>Go to {tagLabel(next.tag)}</button>}</div></div>
  </>;
  return <>
    <PageHead title="Reconciliation statement" actions={<><button className="rw-btn" onClick={exportXlsx}><Icon n="download" /> Excel</button><button className="rw-btn" onClick={() => window.print()}><Icon n="file" /> PDF</button></>}>
      Starts from the closing balance per buyer and ends at the closing balance per vendor. The annexures are the unreconciled items, and together they equal the difference between the two closing balances. Anything left over is shown as unexplained, never absorbed.
    </PageHead>
    {frozen && <p className="rw-note">Showing version {s.version} exactly as {p.phase === 'closed' ? 'closed' : 'prepared'} on {s.generatedAt}. {p.phase !== 'closed' && 'Changes need the period reopened, which creates a new version.'}</p>}
    <div className="rx-balance">
      <div className="rx-print">
        <Card className="rx-stmt">
          <div className="rx-stmt-h"><div><span className="rd-k">Reconciliation statement</span><h2>{v.legalName}</h2><p>{st.rel.vendorCode} · GSTIN {v.gstin} · {e.name} · {st.rel.bu} · {cur}</p></div>
            <div className="rx-stmt-meta"><b>{tagLabel(tag)}</b><small>Version {s.version} · <Pill tone={STATUS_TONE[wf]}>{wf}</Pill></small></div></div>
          <div className="rx-bridge">
            <div className="row tot"><span>Closing balance as per buyer</span><b>{m(s.buyerClosing)}</b></div>
            <p className="sub">Add / (less) to reach the vendor’s balance</p>
            {!SHOWN.length && <div className="row"><span className="rx-muted">No unreconciled items. No annexures.</span><b>—</b></div>}
            {SHOWN.map(a => <React.Fragment key={a.n}>
              <button type="button" className="row ann" onClick={() => { setOpen(a.n); document.getElementById('annexures')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span>Annexure {a.n} · {a.name} <em>{a.count} item{a.count === 1 ? '' : 's'}</em></span><b>{a.effect ? signedMoney(a.effect, cur) : '—'}</b></button>
              {a.secs.length > 1 && a.secs.filter(x => x.effect !== 0).map(x => <div key={x.sub} className="row subr"><span>{x.title} <em>{x.rows.length}</em></span><b>{x.effect ? signedMoney(x.effect, cur) : '—'}</b></div>)}
            </React.Fragment>)}
            {adjRows.map(a => <div key={a.id} className="row adj"><span>{a.label} <em>{a.id}</em></span><b>{signedMoney(a.effect, cur)}</b></div>)}
            {unexEff !== 0 && <div className="row bad"><span>Unexplained difference <em>{s.withinTolerance ? `within ${m(s.tolerance, 0)} tolerance · needs approval` : `above ${m(s.tolerance, 0)} tolerance`}</em></span><b>{signedMoney(unexEff, cur)}</b></div>}
            <div className={'row tot ' + (agrees ? 'ok' : 'bad')}><span>Closing balance as per vendor <em>{agrees ? 'agrees with the vendor ledger' : 'does not agree with the vendor ledger'}</em></span><b>{m(endV)}</b></div>
            {!agrees && <div className="row"><span>Closing balance per vendor ledger</span><b>{m(s.vendorClosing)}</b></div>}
          </div>
          <div className="rx-sumchk"><div><span>Difference in closing balances (buyer − vendor)</span><b>{m(s.difference)}</b></div><div><span>Sum of all annexures</span><b>{m(r2(-annTotal))}</b></div><div className={s.balanced ? 'ok' : 'bad'}><span>{s.balanced ? 'Annexures explain the full difference' : adjRows.length ? 'Annexures + adjustments' : 'Left unexplained'}</span><b>{s.balanced ? '✓' : m(s.unexplained)}</b></div></div>
          <p className="rx-muted">Amounts are shown from the buyer’s payable view: items only the buyer has are taken out, items only the vendor has are added. {s.matched} matches and {s.contras} contra pairs are reconciled and not part of any annexure{s.pendingCandidates ? `; ${s.pendingCandidates} suggestion(s) await review and appear as open items` : ''}.</p>
        </Card>
        <div id="annexures"><Card title="Annexures" tip="Each annexure lists the unreconciled items behind its line in the statement, with the period each first appeared in. Items held in a partial match appear under ‘partially matched’.">
          {!SHOWN.length && <p className="rx-muted">No unreconciled items, so there are no annexures.</p>}
          {SHOWN.length > 0 && <div className="rw-tabs" role="tablist" aria-label="Annexures">{SHOWN.map(a => <button key={a.n} role="tab" aria-selected={a.n === selN} className={a.n === selN ? 'on' : ''} onClick={() => setOpen(a.n)}>Annexure {a.n}<em>{a.count}</em></button>)}</div>}
          {SHOWN.filter(a => a.n === selN).map(a => <div key={a.n} className="rx-annex">
            <h4>Annexure {a.n} — {a.name} <small>{a.count} item{a.count === 1 ? '' : 's'} · {signedMoney(a.effect, cur)}</small></h4>
            {a.secs.filter(x => x.effect !== 0).map(x => <div key={x.sub ?? 'x'}>
              {a.secs.length > 1 && <h5 className="rx-annex-sub">{a.n}{x.sub}. {x.title}</h5>}
              {x.rows.length === 0 ? <p className="rx-muted">Nil</p> : <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Annexure tag</th><th>Document no.</th><th>Type</th><th>Date</th><th className="ar">Buyer amount</th><th className="ar">Vendor amount</th><th>Reference</th><th>Status</th><th className="ar">Effect</th></tr></thead>
                <tbody>{x.rows.map(r => <tr key={r.txnId}><td><span className={'rx-tag' + (r.originTag !== tag ? ' old' : '')}>{r.originTag}</span><small className="rx-sub">{tagLabel(r.originTag)}</small></td><td><b>{r.docNo}</b></td><td>{r.type}</td><td>{fmtDay(r.date)}</td><td className="ar">{r.buyerAmount === null ? '' : signedMoney(r.buyerAmount, cur)}</td><td className="ar">{r.vendorAmount === null ? '' : signedMoney(r.vendorAmount, cur)}</td><td>{r.reference}</td><td>{r.status}</td><td className="ar"><b>{signedMoney(eff(r), cur)}</b></td></tr>)}</tbody>
                <tfoot><tr><td colSpan={8}>Total {a.secs.length > 1 ? `${a.n}${x.sub}` : `annexure ${a.n}`}</td><td className="ar">{signedMoney(x.effect, cur)}</td></tr></tfoot></table></div>}
            </div>)}
          </div>)}
        </Card></div>
      </div>
      <aside className="rx-side">
        <Card title="Where the difference sits" tip="Each bar is one annexure: how far it moves the buyer’s closing balance towards the vendor’s. Hover or tap the statement lines to open an annexure.">
          {SHOWN.length ? <ul className="rx-abars">{SHOWN.map(a => { const mx = Math.max(...SHOWN.map(x => Math.abs(x.effect)), 1); return <li key={a.n} className={a.effect < 0 ? 'neg' : a.effect > 0 ? 'pos' : ''}><span>Annexure {a.n}</span><i><b style={{ width: `${Math.abs(a.effect) / mx * 100}%` }} /></i><em>{a.effect ? signedMoney(a.effect, cur, 0) : '—'}</em></li>; })}</ul> : <p className="rx-muted">No unreconciled items. Nothing to explain.</p>}
          <p className="rx-muted">Buyer closing {m(s.buyerClosing, 0)} → vendor closing {m(s.vendorClosing, 0)}.</p>
        </Card>
        <Card title="Review and sign-off" tip="Buyer prepares, shares, records the vendor’s response and signs; an approver closes. A signed statement cannot change silently: any change reopens it as a new version.">
          <ol className="rx-flow">{(['Prepared', 'Shared with vendor', 'Vendor response', 'Final sign-off', 'Closed'] as const).map((x, i) => { const reached = { working: 0, prepared: 1, shared: 2, disputed: 2, accepted: 3, signed: 4, closed: 5 }[p.phase];
            return <li key={x} className={(reached > i ? 'done' : reached === i ? 'cur' : '') + (i === 2 && p.phase === 'disputed' ? ' bad' : '')}><span>{reached > i ? '✓' : i + 1}</span>{i === 2 && p.phase === 'disputed' ? 'Vendor disputed' : x}</li>; })}</ol>
          {!vend && p.phase === 'working' && <>
            {!s.balanced && s.withinTolerance && s.unexplained !== null && <div className="rx-round"><p>Unexplained {m(s.unexplained)} is within the {m(s.tolerance, 0)} tolerance. It must be recorded as rounding by an approver, with a reason, before the statement can be prepared.</p>
              <input value={round} onChange={e => setRound(e.target.value)} placeholder="Reason (required)" aria-label="Rounding reason" /><button className="rw-btn small" disabled={!approver || !round.trim()} title={approver ? '' : 'Approver only'} onClick={() => run(x => approveRounding(x, tag, round, user.name, at(), settings, approver), 'Rounding adjustment recorded')}>Record rounding</button></div>}
            {!s.balanced && !s.withinTolerance && s.unexplained !== null && <p className="rw-note warn">Unexplained difference above tolerance. Investigate the ledgers (import integrity, missing lines) before preparing.</p>}
            <button className="rw-btn lime full" disabled={wf !== 'In review' || !s.balanced} title={wf !== 'In review' ? 'Finish every matching stage first' : ''} onClick={() => run(x => prepare(x, tag, settings, user.name, at()), `Statement v${p.version} prepared`)}>Prepare statement (buyer review)</button>
            {wf !== 'In review' && <p className="rx-muted">Available once all matching stages have run. <button className="rw-link" onClick={() => go('matched')}>Go to reconciled transactions</button></p>}
            {s.pendingCandidates > 0 && <p className="rx-muted">{s.pendingCandidates} suggestion(s) are still waiting; they will appear as open items if not decided.</p>}</>}
          {!vend && p.phase === 'prepared' && <button className="rw-btn lime full" onClick={() => run(x => share(x, tag, user.name, at()), 'Statement shared with vendor')}>Share with vendor</button>}
          {p.phase === 'shared' && (vend ? <div className="rx-resp"><p className="rw-note">This statement was shared with you. Accept it to sign it off, or raise concerns with your justification.</p>
            <label className="rw-field"><span>Your name</span><input value={rep} onChange={e => setRep(e.target.value)} /></label>
            <label className="rw-field"><span>Justification (required if you raise concerns)</span><textarea rows={3} value={comments} onChange={e => setComments(e.target.value)} placeholder="Which items or amounts you disagree with, and why" /></label>
            <div className="rd-btns"><button className="rw-btn lime" onClick={() => run(x => { const by = `${rep} (vendor)`; const r1 = vendorResponse(x, tag, true, rep, comments, by, at()); return r1.ok ? finalSignoff(r1.state, tag, by, at(), true) : r1; }, 'Statement accepted and signed off')}>Accept and sign off</button>
              <button className="rw-btn" disabled={!comments.trim()} title={comments.trim() ? '' : 'Give your justification first'} onClick={() => run(x => vendorResponse(x, tag, false, rep, comments, `${rep} (vendor)`, at()), 'Concerns sent to the buyer')}>Raise concerns</button></div></div>
            : <p className="rw-note">Shared with {vendorOf(st).displayName}. The vendor accepts it, which signs it off, or raises concerns with a justification. The buyer team does not respond on their behalf.</p>)}
          {p.phase === 'disputed' && (() => { const d = [...p.signoffs].reverse().find(x => x.event === 'disputed'); return d ? <p className="rw-note warn"><b>Vendor raised concerns{d.rep ? ` (${d.rep})` : ''}:</b> {d.comments}</p> : null; })()}
          {!vend && p.phase === 'accepted' && <button className="rw-btn lime full" disabled={!approver} title={approver ? '' : 'Approver only'} onClick={() => run(x => finalSignoff(x, tag, user.name, at(), approver), 'Final sign-off captured')}>Capture final sign-off</button>}
          {!vend && p.phase === 'signed' && <><button className="rw-btn lime full" disabled={!approver} title={approver ? '' : 'Approver only'} onClick={() => run(x => closePeriod(x, tag, next, settings, user.name, at(), approver), `${tag} closed; ${s.countB + s.countV} item(s) carried to ${next?.tag ?? 'the next period'}`)}>Close period and carry forward</button>
            <p className="rx-muted">{s.countB + s.countV} unresolved item(s) will carry into {next ? `${next.tag} (${next.label})` : 'the next period'} with their original tags. Matches, contras and settled items stay closed.</p></>}
          {!vend && p.phase === 'closed' && <>{next && st.periods.some(x => x.tag === next.tag) && <button className="rw-btn lime full" onClick={() => go('upload', st.rel.id, next.tag)}>Open {next.tag}{nextReady ? '' : ' (files not in yet)'} →</button>}<p className="rx-muted">Closed {p.dates.closed}. {p.carriedOut.length} item(s) carried forward.</p></>}
          {!vend && ['prepared', 'shared', 'accepted', 'disputed', 'signed'].includes(p.phase) && <div className="rx-reopen"><input value={reason} onChange={e => setReason(e.target.value)} placeholder={p.phase === 'disputed' ? 'What will be amended (required)' : 'Reason to reopen (required)'} aria-label="Reopen reason" />
            <button className="rw-btn small" disabled={!approver || !reason.trim()} title={approver ? '' : 'Approver only'} onClick={() => run(x => reopen(x, tag, reason, user.name, at(), approver), `Reopened as version ${p.version + 1}`)}>Reopen as v{p.version + 1}</button></div>}
          {vend && p.phase !== 'shared' && <p className="rx-muted">The buyer prepares, shares, closes and carries forward the statement. You respond once it is shared with you.</p>}
          <h4 className="rw-h4 rx-rechead">Record <small>{p.signoffs.length} entr{p.signoffs.length === 1 ? 'y' : 'ies'}</small>{p.signoffs.length > 2 && <button type="button" className="rw-link" aria-expanded={recAll} onClick={() => setRecAll(!recAll)}>{recAll ? 'Show last 2' : 'Show all'}</button>}</h4>
          <ol className="rw-timeline compact">{[...p.signoffs].reverse().slice(0, recAll ? undefined : 2).map((x, i) => <li key={i} className={x.event === 'disputed' ? 'reminder' : x.event === 'signed' || x.event === 'accepted' ? 'signoff' : ''}><span className="rw-avatar">v{x.version}</span><div><p><b>{x.event[0].toUpperCase() + x.event.slice(1)}</b> · {x.by}{x.rep ? ` · vendor: ${x.rep}` : ''}</p>{x.comments && <blockquote>{x.comments}</blockquote>}<small>{x.at}</small></div></li>)}{!p.signoffs.length && <li className="empty">Not prepared yet.</li>}</ol>
        </Card>
      </aside>
    </div>
    <History ctx={ctx} embedded />
  </>;
}
