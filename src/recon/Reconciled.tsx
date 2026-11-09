import React, { useState } from 'react';
import { fmtDate } from './data';
import { DOC_LABEL, type DocClass, type Match, type Rec } from './engine';
import { Card, DataTable, Icon, Ring, num, short, type Col } from './ui';
import { PageHead, type Ctx } from './App';

const CLASSES: { c: DocClass; label: string }[] = [{ c: 'INV', label: 'Invoices' }, { c: 'PAY', label: 'Payments' }, { c: 'CN', label: 'Credit notes' }, { c: 'DN', label: 'Debit notes' }, { c: 'OB', label: 'Opening balances' }];
const LEVELS: { l: number; label: string; d: string }[] = [
  { l: 1, label: 'L1 Exact', d: 'Same vendor ID and document number' }, { l: 2, label: 'L2 Strong', d: 'Same number once cleaned, or a known vendor alias' },
  { l: 3, label: 'L3 Probable', d: 'Same amount and date, confirmed by a reviewer' }, { l: 0, label: 'Manual', d: 'Paired by a reviewer' },
];
const caseId = (m: Match) => 'RC-' + m.buyer.id.replace(/\D/g, '');
const ruleId = (m: Match) => m.level === 0 ? 'Manual' : `L${m.level}`;

/** Field-by-field comparison of a matched pair, with what the rule actually compared. */
function Compare({ m }: { m: Match }) {
  const b = m.buyer, s = m.supplier;
  const rows: [string, string, string, boolean][] = [
    ['Reference', b.rawRef || '—', s.rawRef || '—', b.rawRef.toUpperCase() === s.rawRef.toUpperCase()],
    ['Matching key', b.ref || '—', s.ref || '—', b.ref === s.ref],
    ['Vendor', b.vendorId, `${s.vendorId}${s.vendorVia === 'alias' ? ' (via name alias)' : ''}`, b.vendorId === s.vendorId],
    ['Date', fmtDate(b.date), fmtDate(s.date), b.date === s.date],
    ['Amount', num(b.amount, 2), num(s.amount, 2), Math.abs(b.amount - s.amount) < 0.005],
    ['Taxable value', num(b.taxable, 2), num(s.taxable, 2), b.taxable === s.taxable],
    ['Tax', num(b.tax, 2), num(s.tax, 2), b.tax === null || s.tax === null || Math.abs((b.tax ?? 0) - (s.tax ?? 0)) < 0.005],
    ['PO', b.po || '—', s.po || '—', !b.po || !s.po || b.po === s.po],
  ];
  const days = Math.round(Math.abs(b.date - s.date) / 86400000);
  const why = m.level === 1 ? 'Vendor ID and the document number are identical on both sides.'
    : m.level === 2 ? `${b.rawRef.toUpperCase() === s.rawRef.toUpperCase() ? 'Document numbers are identical' : `Document numbers differ only in formatting; both reduce to the key ${b.ref}`}.${s.vendorVia === 'alias' ? ' The statement has no vendor ID, so the vendor was found from its name.' : ''} Dates are ${days} day${days === 1 ? '' : 's'} apart, inside the tolerance.`
    : m.level === 3 ? 'References differ, but vendor, amount and date agree. A reviewer confirmed it is the same transaction.'
    : 'A reviewer paired these records by hand.';
  return <div className="rd-compare">
    <p className="rd-why"><b>Why it matched.</b> {why}{Math.abs(m.diff) > 0.005 && <> The amounts differ by <b>{num(m.diff, 2)}</b>, which stays open as an item to resolve.</>}</p>
    <table><thead><tr><th /><th>Buyer ledger · {b.id}</th><th>Vendor statement · {s.id}</th><th /></tr></thead>
      <tbody>{rows.map(([k, x, y, same]) => <tr key={k} className={same ? '' : 'diff'}><th>{k}</th><td>{x}</td><td>{y}</td><td>{same ? '✓' : '≠'}</td></tr>)}</tbody></table>
    <p className="rd-desc"><span>{b.description}</span><span>{s.description}</span></p>
  </div>;
}

export default function ReconciledScreen({ ctx }: { ctx: Ctx }) {
  const { r, vendor, vName, decisions, setDecisions, undoable, log } = ctx;
  const [cls, setCls] = useState<DocClass | ''>('');
  const [lvl, setLvl] = useState<number | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const mine = r.matches.filter(m => vendor === 'ALL' || m.buyer.vendorId === vendor);
  const rows = mine.filter(m => (!cls || m.buyer.docClass === cls) && (lvl === null || m.level === lvl) && (!onlyDiff || Math.abs(m.diff) > 0.005));
  const total = r.normalized.buyer.filter((x: Rec) => vendor === 'ALL' || x.vendorId === vendor).length + r.normalized.supplier.filter((x: Rec) => vendor === 'ALL' || x.vendorId === vendor).length;
  const pend = r.pending.filter(m => vendor === 'ALL' || m.buyer.vendorId === vendor).length;
  const reopen = () => {
    const ms = r.matches.filter(m => sel.includes(m.key));
    undoable(`${ms.length} pair${ms.length > 1 ? 's' : ''} reopened and moved to Resolve`, () => {
      setDecisions(d => ({
        ...d,
        reopened: [...d.reopened, ...ms.filter(m => m.status === 'auto' && m.level > 0).map(m => m.key)],
        manual: d.manual.filter(x => !ms.some(m => m.level === 0 && m.buyer.id === x.buyerId && m.supplier.id === x.supplierId)),
        probable: { ...d.probable, ...Object.fromEntries(ms.filter(m => m.status === 'confirmed').map(m => [m.key, 'rejected' as const])) },
      }));
      ms.forEach(m => log({ kind: 'match', vendorId: m.buyer.vendorId, what: `Reopened ${caseId(m)} (${m.buyer.rawRef || m.buyer.id}); both records back in Resolve` }));
    });
    setSel([]);
  };
  const cols: Col<Match>[] = [
    { key: 'case', label: 'Case', text: caseId, render: m => <span className="rw-stack"><b>{caseId(m)}</b><small>{fmtDate(Date.parse(m.timestamp))}</small></span> },
    { key: 'rule', label: 'Rule', text: m => `${ruleId(m)} ${m.confidence}`, sort: m => m.level || 9, render: m => <span className={'rd-rule l' + m.level}>{ruleId(m)}<small>{m.status === 'confirmed' ? 'Reviewer confirmed' : m.level === 0 ? 'Reviewer' : 'Automatic'}</small></span> },
    { key: 'doc', label: 'Document', text: m => DOC_LABEL[m.buyer.docClass] },
    { key: 'vendor', label: 'Vendor', width: 190, text: m => vName(m.buyer.vendorId), hidden: vendor !== 'ALL' },
    { key: 'bref', label: 'Buyer ledger', text: m => m.buyer.rawRef || m.buyer.id, render: m => <span className="rw-stack"><b>{m.buyer.rawRef || m.buyer.id}</b><small>{fmtDate(m.buyer.date)}</small></span> },
    { key: 'sref', label: 'Vendor statement', text: m => m.supplier.rawRef || m.supplier.id, render: m => <span className="rw-stack"><b>{m.supplier.rawRef || m.supplier.id}</b><small>{fmtDate(m.supplier.date)}</small></span> },
    { key: 'amt', label: 'Amount', align: 'right', text: m => num(m.buyer.amount, 2), sort: m => Math.abs(m.buyer.amount) },
    { key: 'diff', label: 'Difference', align: 'right', text: m => num(m.diff, 2), sort: m => Math.abs(m.diff), render: m => Math.abs(m.diff) > 0.005 ? <span className="rw-neg">{num(m.diff, 2)}</span> : <span className="rw-zero">—</span> },
    { key: 'key', label: 'Matching key', hidden: true, text: m => m.buyer.ref },
    { key: 'more', label: '', noToggle: true, text: () => '', render: () => <span className="rd-more" aria-hidden="true">▾</span> },
  ];
  return <>
    <PageHead n="02" title="Matched transactions" actions={<button className="rw-btn" onClick={ctx.openRules}><Icon n="rules" /> Matching rules</button>}>
      Every pair the engine matched, strictest rule first. Open a row to compare the two records side by side and see exactly why they were paired.
    </PageHead>
    <section className="rd-matchbar">
      <Ring value={total ? mine.length * 2 / total : 0} label="Records matched" sub={`${mine.length * 2} of ${total}${pend ? ` · ${pend} suggestions to confirm` : ''}`} />
      <div className="rd-stack-wrap">
        <div className="rd-stack" role="group" aria-label="Matches by rule">{LEVELS.map(x => { const n = mine.filter(m => m.level === x.l).length; return n ? <button key={x.l} style={{ flex: n }} className={'l' + x.l + (lvl === x.l ? ' on' : '') + (lvl !== null && lvl !== x.l ? ' dim' : '')} onClick={() => setLvl(lvl === x.l ? null : x.l)} aria-pressed={lvl === x.l} title={x.d}><b>{n}</b><span>{x.label}</span></button> : null; })}</div>
        <div className="rd-chips">{CLASSES.map(x => { const ms = mine.filter(m => m.buyer.docClass === x.c); return <button key={x.c} className={cls === x.c ? 'on' : ''} onClick={() => setCls(cls === x.c ? '' : x.c)} aria-pressed={cls === x.c}>{x.label} <b>{ms.length}</b><small>{short(ms.reduce((t, m) => t + Math.abs(m.buyer.amount), 0))}</small></button>; })}
          <label className="rd-toggle"><input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} /> Only pairs with a difference ({mine.filter(m => Math.abs(m.diff) > 0.005).length})</label></div>
      </div>
    </section>
    <Card title={`${rows.length} pair${rows.length === 1 ? '' : 's'}`} tip="Reopen sends a pair back to Resolve: both records become open items again until they are re-matched or explained. You can undo straight after.">
      {decisions.reopened.length > 0 && <p className="rw-note">{decisions.reopened.length} automatic match{decisions.reopened.length > 1 ? 'es are' : ' is'} reopened. <button className="rw-link" onClick={() => setDecisions(d => ({ ...d, reopened: [] }))}>Restore all</button></p>}
      <DataTable rows={rows} cols={cols} rowKey={m => m.key} fileName="matched-transactions.csv" selectable selected={sel} onSelect={setSel} expand={m => <Compare m={m} />}
        toolbar={sel.length > 0 && <button className="rw-btn lime" onClick={reopen}>Reopen {sel.length} pair{sel.length > 1 ? 's' : ''}</button>} />
    </Card>
  </>;
}
