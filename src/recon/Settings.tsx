import React, { useState } from 'react';
import { STAGES, SIGN, TYPE_LABEL, LEDGER_COLUMNS, DEFAULT_SETTINGS, type TxnType } from './cycle';
import { BUYER, ENTITIES, VENDORS, RELS } from './ledger';
import { USERS } from './store';
import { Avatar, Card, DataTable, Pill } from './ui';
import { PageHead, vendorOf, type Ctx } from './App';

const PERMS: [string, boolean, boolean][] = [
  ['Import ledgers and preview files', true, true], ['Run matching stages, confirm or reject suggestions', true, true], ['Manual and grouped matches', true, true], ['Reverse a match from the current period', true, true],
  ['Reverse a match confirmed in a closed period', false, true], ['Approve opening balance differences', false, true], ['Record rounding adjustments', false, true], ['Approve accounting adjustments (not your own)', false, true],
  ['Prepare and share statements, record vendor response', true, true], ['Final sign-off, reopen, close and carry forward', false, true], ['Change reconciliation policy (Settings)', false, true],
];

export default function SettingsScreen({ ctx }: { ctx: Ctx }) {
  const { settings, setSettings, approver, user } = ctx;
  const [tab, setTab] = useState<'policy' | 'stages' | 'signs' | 'import' | 'users' | 'master'>('policy');
  const editable = approver;
  const num = (label: string, help: string, value: number, set: (n: number) => void, unit = '') => <label className="rw-setting"><span><b>{label}</b><small>{help}</small></span><span><input type="number" min={0} value={value} disabled={!editable} onChange={e => set(Math.max(0, Number(e.target.value) || 0))} />{unit}</span></label>;
  return <>
    <PageHead title="Settings and administration">Reconciliation policy, matching order, sign convention, import profiles, roles and master data.</PageHead>
    <div className="rw-tabs" role="tablist">{([['policy', 'Reconciliation policy'], ['stages', 'Matching stages'], ['signs', 'Sign convention'], ['import', 'Import profiles'], ['users', 'Users and roles'], ['master', 'Master data']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {!editable && (tab === 'policy' || tab === 'stages') && <p className="rw-note warn">Signed in as {user.name} ({user.role}). Policy is read-only; switch to an approver or admin to change it.</p>}
    {tab === 'policy' && <div className="rx-grid2">
      <Card title="Rounding tolerance by currency" tip="The largest unexplained difference that can be recorded as rounding. It never closes anything by itself: an approver must record the adjustment with a reason.">
        {Object.entries(settings.tolerance).map(([c, v]) => <React.Fragment key={c}>{num(`${c} tolerance`, c === 'INR' ? 'Default ₹500' : 'Per-currency policy', v, n => setSettings({ ...settings, tolerance: { ...settings.tolerance, [c]: n } }), c)}</React.Fragment>)}
      </Card>
      <Card title="Candidate matching" tip="Applies only to the final stage, which proposes pairs for a reviewer. Deterministic stages are unaffected.">
        {num('Score needed to propose', 'Out of 100: amount, dates, reference similarity, learned patterns', settings.probableThreshold, n => setSettings({ ...settings, probableThreshold: Math.min(100, n) }))}
        {num('Date window', 'Dates further apart than this get no date credit', settings.dateWindow, n => setSettings({ ...settings, dateWindow: n }), 'days')}
        {num('Timing window', 'Items this close to period end are flagged as possible timing differences', settings.timingDays, n => setSettings({ ...settings, timingDays: n }), 'days')}
        <button className="rw-btn" disabled={!editable} onClick={() => setSettings(DEFAULT_SETTINGS)}>Restore defaults</button>
      </Card>
    </div>}
    {tab === 'stages' && <Card title="Matching order" tip="Fixed sequence. TDS stages can be switched off where the accounting treatment differs; the others cannot.">
      <ol className="rx-stagelist">{STAGES.map((s, i) => <li key={s.id}><span className="n">{i + 1}</span><span><b>{s.label}</b><small>{s.desc}</small></span>
        {s.optional ? <label className="rd-toggle"><input type="checkbox" disabled={!editable} checked={settings.stages[s.optional]} onChange={e => setSettings({ ...settings, stages: { ...settings.stages, [s.optional!]: e.target.checked } })} /> Enabled</label> : <Pill>Always on</Pill>}</li>)}</ol>
      <h4 className="rw-h4">Safeguards that cannot be switched off</h4>
      <ul className="rx-list">{['A transaction sits in at most one active match or contra.', 'No match across vendors, legal entities, business units or currencies: everything is scoped to one relationship.', 'A group closes only when its signed amounts net to exactly zero; anything else stays open.', 'Suggested matches and uncertain contras never close without a reviewer.', 'Reversals reopen items with their original period tags and require a reason.', 'Matching is deterministic: the same data and settings always give the same result.'].map(x => <li key={x}>{x}</li>)}</ul>
    </Card>}
    {tab === 'signs' && <Card title="Sign convention" tip="Both ledgers are expressed from the buyer’s payable view. Locked once a relationship has imported data, because changing it would restate history.">
      <div className="rw-table-wrap"><table className="rw-table"><thead><tr><th>Transaction type</th><th>Sign</th><th>Buyer ledger (payable)</th><th>Vendor ledger (receivable)</th></tr></thead>
        <tbody>{(Object.keys(SIGN) as TxnType[]).map(t => <tr key={t}><td>{TYPE_LABEL[t]}</td><td><b>{SIGN[t] > 0 ? '+' : '−'}</b></td><td>{SIGN[t] > 0 ? 'Credit' : 'Debit'}</td><td>{SIGN[t] > 0 ? 'Debit' : 'Credit'}</td></tr>)}</tbody></table></div>
      <p className="rx-muted">Buyer signed amount = credit − debit. Vendor signed amount = debit − credit. Lines whose sign does not fit their type are flagged at import.</p>
      <p className="rw-note">Locked: {RELS.length} relationships have imported data under this convention.</p>
    </Card>}
    {tab === 'import' && <div className="rx-grid2">
      <Card title="Ledger template" tip="Different ERPs and vendors use different column names; each source gets a profile that maps its columns onto these fields. Source values are always kept.">
        <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Field</th><th>Required</th><th>ERP extract column</th><th>Vendor statement column</th></tr></thead>
          <tbody>{LEDGER_COLUMNS.map(c => <tr key={c}><td>{c}</td><td>{['Line ID', 'Document No', 'Document Date', 'Type', 'Debit', 'Credit'].includes(c) ? 'Yes' : ''}</td><td>{({ 'Line ID': 'BELNR+BUZEI', 'Document No': 'XBLNR', 'Document Date': 'BLDAT', 'Posting Date': 'BUDAT', 'Type': 'BLART (mapped)', 'Debit': 'DMBTR (S)', 'Credit': 'DMBTR (H)', 'Reference': 'ZUONR', 'Against Doc': 'REBZG', 'Narration': 'SGTXT', 'Period Tag': '—' } as Record<string, string>)[c]}</td><td>{({ 'Line ID': 'Sr No', 'Document No': 'Bill No / Vch No', 'Document Date': 'Date', 'Posting Date': '—', 'Type': 'Vch Type', 'Debit': 'Debit', 'Credit': 'Credit', 'Reference': 'UTR / Cheque No', 'Against Doc': 'Against Ref', 'Narration': 'Narration', 'Period Tag': 'Period (historical only)' } as Record<string, string>)[c]}</td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Accepted transaction labels">
        <ul className="rx-list">{['Invoice, Tax Invoice → Invoice', 'Invoice Reversal → Invoice reversal', 'Credit Note / Debit Note (and reversals)', 'Payment (buyer), Receipt (vendor) → Payment', 'Payment Reversal, Receipt Reversal → Payment reversal', 'TDS (buyer), TDS Receivable (vendor) → TDS', 'TDS Reversal'].map(x => <li key={x}>{x}</li>)}</ul>
        <p className="rx-muted">Unknown labels, invalid dates and non-numeric amounts are rejected at preview with a reason; nothing is dropped silently. Re-imported lines already in the reconciliation are skipped by transaction identity.</p>
      </Card>
    </div>}
    {tab === 'users' && <div className="rx-grid2">
      <Card title="Users"><ul className="rx-users">{USERS.map(u => <li key={u.id} className={u.id === user.id ? 'on' : ''}><Avatar name={u.name} /><span><b>{u.name}</b><small>{u.role}</small></span><button className="rw-btn small" disabled={u.id === user.id} onClick={() => ctx.setUserId(u.id)}>{u.id === user.id ? 'Signed in' : 'Switch'}</button></li>)}</ul>
        <p className="rx-muted">In this demo the switcher stands in for sign-in. In a deployment, roles come from your identity provider and each business sees only its own data.</p></Card>
      <Card title="Permissions"><div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Action</th><th>Preparer</th><th>Approver</th></tr></thead><tbody>{PERMS.map(([a, p, ap]) => <tr key={a}><td>{a}</td><td>{p ? '✓' : '—'}</td><td>{ap ? '✓' : '—'}</td></tr>)}</tbody></table></div>
        <p className="rx-muted">Segregation of duties: an adjustment cannot be approved by the person who proposed it.</p></Card>
    </div>}
    {tab === 'master' && <>
      <Card title="Buyer and legal entities"><dl className="rw-dl"><div><dt>Buyer</dt><dd>{BUYER.name}</dd></div><div><dt>Source system</dt><dd>{BUYER.erp}</dd></div><div><dt>Base currency</dt><dd>{BUYER.currency}</dd></div></dl>
        <div className="rw-table-wrap"><table className="rw-table compact"><thead><tr><th>Entity</th><th>GSTIN</th><th>Business units</th></tr></thead><tbody>{ENTITIES.map(e => <tr key={e.id}><td>{e.name}</td><td>{e.gstin}</td><td>{e.bus.join(', ')}</td></tr>)}</tbody></table></div></Card>
      <Card title="Vendor master"><DataTable rows={VENDORS} rowKey={v => v.id} fileName="vendor-master.csv" cols={[
        { key: 'c', label: 'Code', text: v => v.code }, { key: 'n', label: 'Legal name', text: v => v.legalName }, { key: 'g', label: 'GSTIN', text: v => v.gstin }, { key: 's', label: 'Status', text: v => v.status, render: v => <Pill tone={v.status === 'Active' ? 'green' : 'amber'}>{v.status}</Pill> },
        { key: 'f', label: 'Default frequency', text: v => v.frequency }, { key: 'o', label: 'Owner', text: v => v.owner }, { key: 'ct', label: 'Contact', text: v => `${v.contact.name} · ${v.contact.email}` }, { key: 'cr', label: 'Created', text: v => v.created },
      ]} /></Card>
      <Card title="Buyer–vendor relationships" tip="The unit of reconciliation. A vendor dealing with two business units or in two currencies has separate relationships, each with its own periods and history."><DataTable rows={Object.values(ctx.ws.states)} rowKey={s => s.rel.id} fileName="relationships.csv" cols={[
        { key: 'id', label: 'ID', text: s => s.rel.id }, { key: 'v', label: 'Vendor', text: s => vendorOf(s).displayName }, { key: 'e', label: 'Entity', text: s => ENTITIES.find(e => e.id === s.rel.entityId)!.name }, { key: 'b', label: 'Business unit', text: s => s.rel.bu },
        { key: 'c', label: 'Currency', text: s => s.rel.currency }, { key: 'f', label: 'Frequency', text: s => s.rel.frequency }, { key: 'fp', label: 'First period', text: s => s.periods[0].tag },
        { key: 'lc', label: 'Last closed', text: s => [...s.periods].reverse().find(p => p.phase === 'closed')?.tag ?? '—' }, { key: 'cp', label: 'Current', text: s => s.periods[s.periods.length - 1].tag }, { key: 'o', label: 'Owner', text: s => s.rel.owner },
      ]} /></Card>
    </>}
  </>;
}
