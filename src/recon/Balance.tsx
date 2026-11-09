import React, { useState } from 'react';
import { statement, prepare, share, vendorResponse, finalSignoff, reopen, closePeriod, approveRounding, fmtDay, r2, type Statement } from './cycle';
import { nextDef, filesFor } from './store';
import { tagLabel } from './ledger';
import { xlsx, saveBlob } from './xlsx';
import { Card, Icon, Pill, Waterfall, money, signedMoney } from './ui';
import { PageHead, vendorOf, entityOf, STATUS_TONE, type Ctx } from './App';
import History from './History';

export default function Balance({ ctx }: { ctx: Ctx }) {
  const { st, tag, settings, run, user, at, approver, go, ws } = ctx;
  const p = st.periods.find(x => x.tag === tag)!; const cur = st.rel.currency; const m = (n: number | null | undefined, dp = 2) => money(n, cur, dp);
  const live = statement(st, tag, settings, at());
  const s: Statement = p.phase !== 'working' && p.snapshot ? p.snapshot : live;
  const frozen = s !== live;
  const wf = ctx.stat(st, tag);
  const [open, setOpen] = useState<number | null>(s.annexures.length ? s.annexures.length : null);
  const [rep, setRep] = useState(vendorOf(st).contact.name); const [comments, setComments] = useState(''); const [reason, setReason] = useState(''); const [round, setRound] = useState('');
  const next = nextDef(st.rel, tag); const nextReady = next && filesFor(ws, st.rel.id, next.tag).some(f => f.kind === 'period');
  const v = vendorOf(st), e = entityOf(st);
  const exportXlsx = () => {
    const head = [['NXT Vendor Payable Reconciliation · Reconciliation statement'], [], ['Buyer entity', e.name], ['Business unit', st.rel.bu], ['Vendor', `${v.legalName} (${st.rel.vendorCode})`], ['Vendor GSTIN', v.gstin], ['Currency', cur], ['Period', `${tag} · ${tagLabel(tag)}`], ['Version', s.version], ['Status', wf], ['Generated', s.generatedAt || at()], [],
      ['Buyer closing balance', s.buyerClosing], ['Vendor closing balance', s.vendorClosing], ['Difference (buyer − vendor)', s.difference], [], ['Open items in buyer books', s.openB, `${s.countB} items`], ['Less open items in vendor books', -s.openV, `${s.countV} items`],
      ...s.adjustments.map(a => [`Adjustment ${a.id} (${a.kind})`, a.effect, a.reason]), ['Unexplained difference', s.unexplained, `tolerance ${s.tolerance}`], [], ['Annexure', 'Original period', 'Buyer items', 'Vendor items', 'Net'], ...s.annexures.map(a => [`Annexure ${a.n}`, a.tag, a.totalB, a.totalV, a.net])];
    const ann = s.annexures.map(a => ({ name: `Annexure ${a.n} ${a.tag}`, widths: [16, 14, 18, 12, 16, 16, 16, 26, 34, 34, 22], rows: [['Transaction no.', 'Date', 'Type', 'Original period', 'Buyer amount', 'Vendor amount', 'Outstanding (buyer − vendor)', 'Reference', 'Exception category', 'Remarks', 'Status'], ...a.rows.map(x => [x.docNo, fmtDay(x.date), x.type, x.originTag, x.buyerAmount, x.vendorAmount, x.outstanding, x.reference, x.category, x.remarks, x.status]), [], ['Total', '', '', '', a.totalB, a.totalV, a.net]] as (string | number | null)[][] }));
    const ms = st.matches.filter(x => x.periodTag === tag); const byId = new Map(st.txns.map(t => [t.id, t]));
    saveBlob(`${st.rel.vendorCode}_${st.rel.bu.replace(/\s/g, '')}_${tag}_reconciliation_v${s.version}.xlsx`, xlsx([{ name: 'Statement', widths: [38, 20, 30], rows: head }, ...ann,
      { name: 'Matches this period', widths: [12, 10, 12, 30, 40, 40, 14], rows: [['Match', 'Kind', 'Confidence', 'Rule', 'Buyer documents', 'Vendor documents', 'Status'], ...ms.map(x => [x.id, x.kind, x.confidence, x.rule, x.buyerIds.map(i => byId.get(i)?.docNo || byId.get(i)?.ref).join(', '), x.vendorIds.map(i => byId.get(i)?.docNo || byId.get(i)?.ref).join(', '), x.reversed ? `Reversed: ${x.reversed.reason}` : 'Active'])] },
      { name: 'Sign-off', widths: [10, 12, 22, 22, 18, 50], rows: [['Version', 'Event', 'By', 'Vendor representative', 'At', 'Comments'], ...p.signoffs.map(x => [x.version, x.event, x.by, x.rep ?? '', x.at, x.comments])] }]));
  };
  const steps = s.adjustments.map(a => ({ key: a.id, label: a.kind === 'rounding' ? 'Rounding' : a.kind.startsWith('opening') ? 'Opening adj.' : 'Adjustment', value: a.effect }));
  return <>
    <PageHead title="Reconciliation statement" actions={<><button className="rw-btn" onClick={exportXlsx}><Icon n="download" /> Excel</button><button className="rw-btn" onClick={() => window.print()}><Icon n="file" /> PDF</button></>}>
      Buyer closing − vendor closing must equal the open buyer items − open vendor items, plus approved adjustments. Anything left over is unexplained, and is shown, never absorbed.
    </PageHead>
    {frozen && <p className="rw-note">Showing version {s.version} exactly as {p.phase === 'closed' ? 'closed' : 'prepared'} on {s.generatedAt}. {p.phase !== 'closed' && 'Changes need the period reopened, which creates a new version.'}</p>}
    <div className="rx-balance">
      <div className="rx-print">
        <Card className="rx-stmt">
          <div className="rx-stmt-h"><div><span className="rd-k">Reconciliation statement</span><h2>{v.legalName}</h2><p>{st.rel.vendorCode} · GSTIN {v.gstin} · {e.name} · {st.rel.bu} · {cur}</p></div>
            <div className="rx-stmt-meta"><span className="rx-tag">{tag}</span><b>{tagLabel(tag)}</b><small>Version {s.version} · <Pill tone={STATUS_TONE[wf]}>{wf}</Pill></small></div></div>
          <div className="rx-bridge">
            <div className="row"><span>Closing balance per buyer ledger (payable)</span><b>{m(s.buyerClosing)}</b></div>
            <div className="row"><span>Less closing balance per vendor ledger (receivable)</span><b>{m(s.vendorClosing === null ? null : -s.vendorClosing)}</b></div>
            <div className="row tot"><span>Difference to reconcile</span><b>{m(s.difference)}</b></div>
            <p className="sub">Represented by</p>
            <div className="row"><span>Open items in buyer books, not in vendor’s <em>{s.countB}</em></span><b>{signedMoney(s.openB, cur)}</b></div>
            <div className="row"><span>Less open items in vendor books, not in buyer’s <em>{s.countV}</em></span><b>{signedMoney(-s.openV, cur)}</b></div>
            {s.adjustments.map(a => <div key={a.id} className="row adj"><span>{a.kind === 'rounding' ? 'Rounding adjustment' : a.kind === 'opening-position' ? 'Approved opening position' : a.kind === 'opening-continuity' ? `Approved ${a.side === 'B' ? 'buyer' : 'vendor'} opening difference` : 'Approved adjustment'} <em>{a.id} · {a.periodTag} · {a.approvedBy}</em><small>{a.reason}</small></span><b>{signedMoney(a.effect, cur)}</b></div>)}
            <div className={'row tot ' + (s.balanced ? 'ok' : 'bad')}><span>Unexplained difference <em>{s.balanced ? 'nil' : s.withinTolerance ? `within ${m(s.tolerance, 0)} tolerance · needs approval` : `above ${m(s.tolerance, 0)} tolerance`}</em></span><b>{m(s.unexplained)}</b></div>
          </div>
          <div className="rx-control"><div><span>Open-item balance control</span><b>{signedMoney(s.openNet, cur)}</b><small>Net of buyer and vendor open items</small></div><div><span>+ adjustments</span><b>{signedMoney(s.adjEffect, cur)}</b></div><div><span>= explained</span><b>{signedMoney(r2(s.openNet + s.adjEffect), cur)}</b></div><div className={s.balanced ? 'ok' : 'bad'}><span>vs. difference</span><b>{s.balanced ? '✓ agrees' : signedMoney(s.unexplained ?? 0, cur) + ' gap'}</b></div></div>
          <p className="rx-muted">Sign convention: invoices and debit notes +, credit notes, payments and TDS −; both ledgers expressed from the buyer’s payable view. {s.matched} matches and {s.contras} contra pairs closed so far{s.pendingCandidates ? `; ${s.pendingCandidates} suggestion(s) await review` : ''}.</p>
        </Card>
        <Card title="Annexures by originating period" tip="Open items grouped by the period they first appeared in. A carried item keeps its original tag however many periods it stays open.">
          <div className="rx-annex-sum">{s.annexures.map(a => <button key={a.n} className={open === a.n ? 'on' : ''} onClick={() => setOpen(open === a.n ? null : a.n)}><span>Annexure {a.n}</span><b className="rx-tag">{a.tag}</b><small>{tagLabel(a.tag)} · {a.rows.length} item{a.rows.length === 1 ? '' : 's'}</small><em>{signedMoney(a.net, cur, 0)}</em></button>)}
            {!s.annexures.length && <p className="rx-muted">No open items. Nothing to annex.</p>}</div>
          {s.annexures.map(a => <div key={a.n} className={'rx-annex' + (open === null || a.n === open ? '' : ' collapsed')}>
            <h4>Annexure {a.n} — {a.tag} <small>{tagLabel(a.tag)}</small></h4>
            <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Transaction</th><th>Date</th><th>Type</th><th>Period</th><th className="ar">Buyer amount</th><th className="ar">Vendor amount</th><th className="ar">Outstanding</th><th>Reference</th><th>Category</th><th>Remarks</th><th>Status</th></tr></thead>
              <tbody>{a.rows.map(x => <tr key={x.txnId}><td><b>{x.docNo}</b></td><td>{fmtDay(x.date)}</td><td>{x.type}</td><td><span className="rx-tag old">{x.originTag}</span>{x.carried ? <small> ·{x.carried}×</small> : null}</td><td className="ar">{x.buyerAmount === null ? '' : signedMoney(x.buyerAmount, cur)}</td><td className="ar">{x.vendorAmount === null ? '' : signedMoney(x.vendorAmount, cur)}</td><td className="ar"><b>{signedMoney(x.outstanding, cur)}</b></td><td>{x.reference}</td><td>{x.category}</td><td className="rx-wrap">{x.remarks}</td><td>{x.status}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={4}>Total annexure {a.n}</td><td className="ar">{signedMoney(a.totalB, cur)}</td><td className="ar">{signedMoney(a.totalV, cur)}</td><td className="ar">{signedMoney(a.net, cur)}</td><td colSpan={4} /></tr></tfoot></table></div></div>)}
        </Card>
      </div>
      <aside className="rx-side">
        <Card title="How the difference is made up">
          {s.difference !== null ? <Waterfall height={130} start={{ label: 'Buyer', value: s.buyerClosing ?? 0 }} end={{ label: 'Vendor', value: s.vendorClosing ?? 0 }} fmt={n => money(n, cur, 0)}
            steps={[{ key: 'b', label: 'Buyer items', value: s.openB }, { key: 'v', label: 'Vendor items', value: -s.openV }, ...steps, ...(s.balanced ? [] : [{ key: 'u', label: 'Unexplained', value: s.unexplained ?? 0 }])]} /> : <p className="rx-muted">Import both ledgers first.</p>}
        </Card>
        <Card title="Review and sign-off" tip="Buyer prepares, shares, records the vendor’s response and signs; an approver closes. A signed statement cannot change silently: any change reopens it as a new version.">
          <ol className="rx-flow">{(['Prepared', 'Shared with vendor', 'Vendor response', 'Final sign-off', 'Closed'] as const).map((x, i) => { const reached = { working: 0, prepared: 1, shared: 2, disputed: 2, accepted: 3, signed: 4, closed: 5 }[p.phase];
            return <li key={x} className={(reached > i ? 'done' : reached === i ? 'cur' : '') + (i === 2 && p.phase === 'disputed' ? ' bad' : '')}><span>{reached > i ? '✓' : i + 1}</span>{i === 2 && p.phase === 'disputed' ? 'Vendor disputed' : x}</li>; })}</ol>
          {p.phase === 'working' && <>
            {!s.balanced && s.withinTolerance && s.unexplained !== null && <div className="rx-round"><p>Unexplained {m(s.unexplained)} is within the {m(s.tolerance, 0)} tolerance. It must be recorded as rounding by an approver, with a reason, before the statement can be prepared.</p>
              <input value={round} onChange={e => setRound(e.target.value)} placeholder="Reason (required)" aria-label="Rounding reason" /><button className="rw-btn small" disabled={!approver || !round.trim()} title={approver ? '' : 'Approver only'} onClick={() => run(x => approveRounding(x, tag, round, user.name, at(), settings, approver), 'Rounding adjustment recorded')}>Record rounding</button></div>}
            {!s.balanced && !s.withinTolerance && s.unexplained !== null && <p className="rw-note warn">Unexplained difference above tolerance. Investigate the ledgers (import integrity, missing lines) before preparing.</p>}
            <button className="rw-btn lime full" disabled={wf !== 'In review' || !s.balanced} title={wf !== 'In review' ? 'Finish every matching stage first' : ''} onClick={() => run(x => prepare(x, tag, settings, user.name, at()), `Statement v${p.version} prepared`)}>Prepare statement (buyer review)</button>
            {wf !== 'In review' && <p className="rx-muted">Available once all matching stages have run. <button className="rw-link" onClick={() => go('matched')}>Go to reconciled transactions</button></p>}
            {s.pendingCandidates > 0 && <p className="rx-muted">{s.pendingCandidates} suggestion(s) are still waiting; they will appear as open items if not decided.</p>}</>}
          {p.phase === 'prepared' && <button className="rw-btn lime full" onClick={() => run(x => share(x, tag, user.name, at()), 'Statement shared with vendor')}>Share with vendor</button>}
          {p.phase === 'shared' && <div className="rx-resp"><label className="rw-field"><span>Vendor representative</span><input value={rep} onChange={e => setRep(e.target.value)} /></label>
            <label className="rw-field"><span>Vendor comments</span><textarea rows={3} value={comments} onChange={e => setComments(e.target.value)} placeholder="What the vendor said (required for a dispute)" /></label>
            <div className="rd-btns"><button className="rw-btn lime" onClick={() => run(x => vendorResponse(x, tag, true, rep, comments, user.name, at()), 'Vendor acceptance recorded')}>Vendor accepts</button><button className="rw-btn" onClick={() => run(x => vendorResponse(x, tag, false, rep, comments, user.name, at()), 'Vendor dispute recorded')}>Vendor disputes</button></div></div>}
          {p.phase === 'accepted' && <button className="rw-btn lime full" disabled={!approver} title={approver ? '' : 'Approver only'} onClick={() => run(x => finalSignoff(x, tag, user.name, at(), approver), 'Final sign-off captured')}>Capture final sign-off</button>}
          {p.phase === 'signed' && <><button className="rw-btn lime full" disabled={!approver} title={approver ? '' : 'Approver only'} onClick={() => run(x => closePeriod(x, tag, next, settings, user.name, at(), approver), `${tag} closed; ${s.countB + s.countV} item(s) carried to ${next?.tag ?? 'the next period'}`)}>Close period and carry forward</button>
            <p className="rx-muted">{s.countB + s.countV} unresolved item(s) will carry into {next ? `${next.tag} (${next.label})` : 'the next period'} with their original tags. Matches, contras and settled items stay closed.</p></>}
          {p.phase === 'closed' && <>{next && st.periods.some(x => x.tag === next.tag) && <button className="rw-btn lime full" onClick={() => go('upload', st.rel.id, next.tag)}>Open {next.tag}{nextReady ? '' : ' (files not in yet)'} →</button>}<p className="rx-muted">Closed {p.dates.closed}. {p.carriedOut.length} item(s) carried forward.</p></>}
          {['prepared', 'shared', 'accepted', 'disputed', 'signed'].includes(p.phase) && <div className="rx-reopen"><input value={reason} onChange={e => setReason(e.target.value)} placeholder={p.phase === 'disputed' ? 'What will be amended (required)' : 'Reason to reopen (required)'} aria-label="Reopen reason" />
            <button className="rw-btn small" disabled={!approver || !reason.trim()} title={approver ? '' : 'Approver only'} onClick={() => run(x => reopen(x, tag, reason, user.name, at(), approver), `Reopened as version ${p.version + 1}`)}>Reopen as v{p.version + 1}</button></div>}
          <h4 className="rw-h4">Record</h4>
          <ol className="rw-timeline compact">{[...p.signoffs].reverse().map((x, i) => <li key={i} className={x.event === 'disputed' ? 'reminder' : x.event === 'signed' || x.event === 'accepted' ? 'signoff' : ''}><span className="rw-avatar">v{x.version}</span><div><p><b>{x.event[0].toUpperCase() + x.event.slice(1)}</b> · {x.by}{x.rep ? ` · vendor: ${x.rep}` : ''}</p>{x.comments && <blockquote>{x.comments}</blockquote>}<small>{x.at}</small></div></li>)}{!p.signoffs.length && <li className="empty">Not prepared yet.</li>}</ol>
        </Card>
      </aside>
    </div>
    <History ctx={ctx} embedded />
  </>;
}
