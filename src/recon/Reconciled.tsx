import React, { useState } from 'react';
import { fmtDate } from './data';
import { DOC_LABEL, type DocClass, type Match } from './engine';
import { Card, DataTable, Icon, num, short, type Col } from './ui';
import type { Ctx } from './App';

const CLASSES: { c: DocClass; label: string; icon: string; tone: string }[] = [
  { c: 'INV', label: 'Invoice', icon: 'file', tone: 'blue' }, { c: 'DN', label: 'Debit note', icon: 'file', tone: 'violet' }, { c: 'CN', label: 'Credit note', icon: 'file', tone: 'green' },
  { c: 'PAY', label: 'Payment', icon: 'inbox', tone: 'amber' }, { c: 'OB', label: 'Opening balance', icon: 'summary', tone: 'red' },
];
const caseId = (m: Match) => 'RC-' + m.buyer.id.replace(/\D/g, '');
const category = (m: Match) => m.level === 0 ? 'Manual' : m.status === 'confirmed' ? 'Reviewer confirmed' : 'Auto';
const ruleId = (m: Match) => m.level === 0 ? 'MAN' : `L${m.level}`;

export default function ReconciledScreen({ ctx }: { ctx: Ctx }) {
  const { r, vendor, vName, decisions, setDecisions } = ctx;
  const [cls, setCls] = useState<DocClass | ''>('');
  const [sel, setSel] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const mine = r.matches.filter(m => vendor === 'ALL' || m.buyer.vendorId === vendor);
  const rows = cls ? mine.filter(m => m.buyer.docClass === cls) : mine;
  const reopen = () => {
    const ms = r.matches.filter(m => sel.includes(m.key));
    setDecisions(d => ({
      ...d,
      reopened: [...d.reopened, ...ms.filter(m => m.status === 'auto' && m.level > 0).map(m => m.key)],
      manual: d.manual.filter(x => !ms.some(m => m.level === 0 && m.buyer.id === x.buyerId && m.supplier.id === x.supplierId)),
      probable: { ...d.probable, ...Object.fromEntries(ms.filter(m => m.status === 'confirmed').map(m => [m.key, 'rejected' as const])) },
    }));
    setSel([]); setConfirming(false);
  };
  const cols: Col<Match>[] = [
    { key: 'case', label: 'Case ID', text: caseId, render: m => <b>{caseId(m)}</b> },
    { key: 'date', label: 'Reconciled on', text: m => fmtDate(Date.parse(m.timestamp)) },
    { key: 'cat', label: 'Match category', text: category },
    { key: 'type', label: 'Match type', text: m => m.confidence, render: m => <span className={'rw-conf l' + m.level}>{m.confidence}</span> },
    { key: 'rule', label: 'Rule ID', text: m => `${ruleId(m)} ${m.rule}`, render: m => <span className="rw-stack"><b>{ruleId(m)}</b><small>{m.rule.replace(/^L\d · /, '')}</small></span> },
    { key: 'doc', label: 'Document', text: m => DOC_LABEL[m.buyer.docClass] },
    { key: 'vendor', label: 'Vendor', width: 200, text: m => vName(m.buyer.vendorId), hidden: vendor !== 'ALL' },
    { key: 'bref', label: 'Buyer reference', group: 'Buyer ledger', text: m => m.buyer.rawRef || m.buyer.id, render: m => <span className="rw-stack"><b>{m.buyer.rawRef || m.buyer.id}</b><small>{m.buyer.id} · {fmtDate(m.buyer.date)}</small></span> },
    { key: 'bamt', label: 'Amount', group: 'Buyer ledger', align: 'right', text: m => num(m.buyer.amount, 2), sort: m => m.buyer.amount },
    { key: 'sref', label: 'Vendor reference', group: 'Vendor statement', text: m => m.supplier.rawRef || m.supplier.id, render: m => <span className="rw-stack"><b>{m.supplier.rawRef || m.supplier.id}</b><small>{m.supplier.id} · {fmtDate(m.supplier.date)}</small></span> },
    { key: 'samt', label: 'Amount', group: 'Vendor statement', align: 'right', text: m => num(m.supplier.amount, 2), sort: m => m.supplier.amount },
    { key: 'key', label: 'Matching key', hidden: true, text: m => m.buyer.ref },
    { key: 'diff', label: 'Difference', align: 'right', text: m => num(m.diff, 2), sort: m => m.diff, render: m => Math.abs(m.diff) > 0.005 ? <span className="rw-neg">{num(m.diff, 2)}</span> : <span className="rw-zero">0.00</span> },
  ];
  return <>
    <Card title="Reconciliation metrics" tip="Value and count of matched pairs by document type, from the buyer side. Click a card to filter the table.">
      <div className="rw-doccards">{CLASSES.map(x => { const ms = mine.filter(m => m.buyer.docClass === x.c); const v = ms.reduce((t, m) => t + Math.abs(m.buyer.amount), 0);
        return <button key={x.c} className={'rw-doccard ' + x.tone + (cls === x.c ? ' on' : '')} onClick={() => setCls(cls === x.c ? '' : x.c)} aria-pressed={cls === x.c}><Icon n={x.icon} s={20} /><b>{short(v)}</b><span>{x.label}</span><small>{ms.length} matched</small></button>; })}</div>
    </Card>
    <Card title={<>Matched transactions{cls && <button className="rw-filter-tag" onClick={() => setCls('')}>{DOC_LABEL[cls]} <Icon n="x" s={12} /></button>}</>}
      tip="Each pair keeps the rule that matched it. Reopen sends a pair back to Unreconciled transactions: both records then show as open differences until they are matched again or explained.">
      {decisions.reopened.length > 0 && <p className="rw-note">{decisions.reopened.length} automatic match{decisions.reopened.length > 1 ? 'es' : ''} reopened. <button className="rw-link" onClick={() => setDecisions(d => ({ ...d, reopened: [] }))}>Restore them</button></p>}
      <DataTable rows={rows} cols={cols} rowKey={m => m.key} fileName="matched-transactions.csv" selectable selected={sel} onSelect={setSel}
        toolbar={<>{confirming ? <span className="rw-confirm">Reopen {sel.length} pair{sel.length > 1 ? 's' : ''}? <button className="rw-btn small lime" onClick={reopen}>Yes, reopen</button><button className="rw-btn small ghost" onClick={() => setConfirming(false)}>Cancel</button></span>
          : <button className="rw-btn lime" disabled={!sel.length} onClick={() => setConfirming(true)}>Reopen{sel.length ? ` (${sel.length})` : ''}</button>}
          <button className="rw-btn" onClick={ctx.openRules}><Icon n="rules" /> Rules</button></>} />
    </Card>
  </>;
}
