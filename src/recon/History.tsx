import React, { useState } from 'react';
import { typeName, TYPE_LABEL, fmtDay, r2 } from './cycle';
import { tagLabel } from './ledger';
import { Card, DataTable, Pill, money, signedMoney } from './ui';
import { PageHead, STATUS_TONE, type Ctx } from './App';

export default function History({ ctx, embedded }: { ctx: Ctx; embedded?: boolean }) {
  const { st, go, tag } = ctx; const cur = st.rel.currency; const m = (n: number | null | undefined) => money(n, cur, 0);
  const [view, setView] = useState<'carry' | 'rev' | 'adj' | 'sign'>('carry');
  const byId = new Map(st.txns.map(t => [t.id, t]));
  const periods = [...st.periods].reverse();
  const carry = st.carry.map(c => ({ ...c, t: byId.get(c.txnId)! })).filter(c => c.t);
  const resolvedLater = new Map<string, string>(); st.matches.filter(x => !x.reversed).forEach(x => [...x.buyerIds, ...x.vendorIds].forEach(i => resolvedLater.set(i, x.periodTag)));
  return <>
    {embedded ? <h2 className="rx-section">Previous periods <small>Every period of this relationship: what was matched, carried, reversed, adjusted and signed.</small></h2>
      : <PageHead title="Reconciliation history">Every period of this relationship, from the first reconciliation to now: what was matched, what stayed open, what was carried, reversed, adjusted and signed.</PageHead>}
    <div className="rx-hist">{periods.map(p => { const s = p.snapshot; const made = st.matches.filter(x => x.periodTag === p.tag && !x.reversed); const rev = st.matches.filter(x => x.reversed?.periodTag === p.tag); const adj = st.adjustments.filter(a => a.periodTag === p.tag && a.status === 'approved'); const wf = ctx.stat(st, p.tag);
      return <article key={p.tag} className={'rx-hcard' + (p.tag === tag ? ' on' : '')}>
        <header><b>{p.label}</b><Pill tone={STATUS_TONE[wf]}>{wf}</Pill>{p.version > 1 && <small>v{p.version}</small>}<span className="rx-hact"><button className="rw-btn small" onClick={() => go('statement', st.rel.id, p.tag)}>Statement</button><button className="rw-btn small ghost" onClick={() => go('upload', st.rel.id, p.tag)}>Workspace</button></span></header>
        <dl><div><dt>Buyer closing</dt><dd>{m(p.closing.B)}</dd></div><div><dt>Vendor closing</dt><dd>{m(p.closing.V)}</dd></div><div><dt>Difference</dt><dd>{p.closing.B !== null && p.closing.V !== null ? m(r2(p.closing.B - p.closing.V)) : '—'}</dd></div>
          <div><dt>Carried in</dt><dd>{p.carriedIn.length}</dd></div><div><dt>Matched here</dt><dd>{made.filter(x => x.kind === 'match').length} + {made.filter(x => x.kind === 'contra').length} contra</dd></div><div><dt>Open at close</dt><dd>{p.phase === 'closed' ? p.carriedOut.length : s ? s.countB + s.countV : '—'}</dd></div></dl>
        <p className="rx-muted">{[rev.length && `${rev.length} reversal(s)`, adj.length && `${adj.length} adjustment(s)`, p.signoffs.find(x => x.event === 'accepted') && `vendor accepted ${p.dates.vendorSignoff?.split(' ')[0]}`, p.signoffs.find(x => x.event === 'disputed') && 'vendor disputed', p.dates.closed && `closed ${p.dates.closed.split(' ')[0]}`].filter(Boolean).join(' · ') || 'In progress'}</p>
      </article>; })}</div>
    <Card actions={<div className="rw-seg">{([['carry', 'Carry-forward movements'], ['rev', 'Match reversals'], ['adj', 'Adjustments'], ['sign', 'Sign-off and closure']] as const).map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>}>
      {view === 'carry' && <DataTable rows={carry} rowKey={c => c.txnId + c.from} fileName={`${st.rel.id}_carry-forward.csv`} empty="Nothing has been carried forward yet." initialSort={{ key: 'from', dir: -1 }} cols={[
        { key: 'doc', label: 'Item', text: c => c.t.docNo || c.t.ref, render: c => <span className="rw-stack"><b>{c.t.docNo || c.t.ref}</b><small>{c.t.side === 'B' ? 'Buyer' : 'Vendor'} · {typeName(c.t)}</small></span> },
        { key: 'amt', label: 'Amount', align: 'right', text: c => money(c.t.amount, cur), render: c => signedMoney(c.t.amount, cur) },
        { key: 'orig', label: 'Original period', text: c => c.t.originTag, render: c => <span className="rx-tag old">{c.t.originTag}</span> },
        { key: 'from', label: 'Carried from', text: c => c.from, render: c => <span className="rx-tag">{c.from}</span> },
        { key: 'to', label: 'Into', text: c => c.to, render: c => <span className="rx-tag">{c.to}</span> },
        { key: 'at', label: 'At', text: c => c.at },
        { key: 'now', label: 'Outcome', text: c => resolvedLater.get(c.txnId) ?? 'Still open', render: c => resolvedLater.has(c.txnId) ? <Pill tone="green">Matched in {resolvedLater.get(c.txnId)}</Pill> : <Pill tone="amber">Still open</Pill> },
      ]} />}
      {view === 'rev' && <DataTable rows={st.matches.filter(x => x.reversed)} rowKey={x => x.id} fileName={`${st.rel.id}_reversals.csv`} empty="No matches have been reversed." cols={[
        { key: 'id', label: 'Match', text: x => x.id }, { key: 'rule', label: 'Rule', text: x => x.rule }, { key: 'made', label: 'Made in', text: x => x.periodTag },
        { key: 'by', label: 'Reversed by', text: x => `${x.reversed!.by} · ${x.reversed!.at}` }, { key: 'in', label: 'In period', text: x => x.reversed!.periodTag }, { key: 'why', label: 'Reason', text: x => x.reversed!.reason },
      ]} />}
      {view === 'adj' && <DataTable rows={st.adjustments} rowKey={a => a.id} fileName={`${st.rel.id}_adjustments.csv`} empty="No adjustments recorded." cols={[
        { key: 'id', label: 'Adjustment', text: a => a.id }, { key: 'k', label: 'Kind', text: a => a.kind }, { key: 'p', label: 'Period', text: a => a.periodTag },
        { key: 'a', label: 'Amount', align: 'right', text: a => money(a.amount, cur) }, { key: 'st', label: 'Status', text: a => a.status, render: a => <Pill tone={a.status === 'approved' ? 'green' : a.status === 'pending' ? 'amber' : 'red'}>{a.status}</Pill> },
        { key: 'by', label: 'Requested / approved', text: a => `${a.requestedBy} / ${a.approvedBy ?? '—'}` }, { key: 'r', label: 'Reason', text: a => `${a.reason}${a.evidence ? ` (${a.evidence})` : ''}` },
      ]} />}
      {view === 'sign' && <DataTable rows={st.periods.flatMap(p => p.signoffs.map((x, i) => ({ ...x, tag: p.tag, k: `${p.tag}-${i}` })))} rowKey={x => x.k} fileName={`${st.rel.id}_signoffs.csv`} empty="No sign-off activity yet." cols={[
        { key: 'tag', label: 'Period', text: x => x.tag }, { key: 'v', label: 'Version', text: x => `v${x.version}` }, { key: 'e', label: 'Event', text: x => x.event },
        { key: 'by', label: 'By', text: x => x.by }, { key: 'rep', label: 'Vendor representative', text: x => x.rep ?? '' }, { key: 'at', label: 'At', text: x => x.at }, { key: 'c', label: 'Comments', text: x => x.comments },
      ]} />}
    </Card>
    <p className="rx-muted">Dates shown as recorded. Opening tag of the relationship: {st.periods[0].tag} ({tagLabel(st.periods[0].tag)}); first transaction dated {st.txns.length ? fmtDay(Math.min(...st.txns.map(t => t.date))) : '—'}.</p>
  </>;
}
