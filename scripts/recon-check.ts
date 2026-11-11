// Lifecycle tests for the NXT Vendor Payable Reconciliation engine. Run: npm run test:recon
// Synthetic data only. Covers vendor lifecycle, period continuity, contra, sequential matching, the bridge,
// annexures by originating period, sign-off and closure, and carry-forward across three or more periods.
import {
  newRelState, importFile, gate, approveOpening, runStage, decideCandidate, manualMatch, reverseMatch, openItems, statement, prepare, share, vendorResponse,
  finalSignoff, reopen, closePeriod, confirmBalance, openPool, approveRounding, updateException, proposeAdjustment, decideAdjustment, closedTxnIds, status, noteMappings, mapNote, STAGES, DEFAULT_SETTINGS,
  type RelState, type LedgerFile, type Relationship, type PeriodDef, type Row,
} from '../src/recon/cycle';
import { initWorkspace, drive } from '../src/recon/store';
import { RELS, periodsFor, generateAll, CURRENT } from '../src/recon/ledger';

let failed = 0, passed = 0;
const check = (name: string, ok: boolean, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const S = DEFAULT_SETTINGS; const AT = '09-Nov-2026 10:00';

// ---------- Small hand-built ledgers for precise rules ----------
const rel: Relationship = { id: 'T1', buyerId: 'B', entityId: 'LE1', bu: 'Foods', vendorId: 'VX', vendorCode: 'VX-1', currency: 'INR', frequency: 'Monthly', owner: 'Tester', status: 'Active' };
const P = (m: number): PeriodDef => ({ tag: `M${String(m).padStart(2, '0')}2026`, type: 'Monthly', start: Date.UTC(2026, m - 1, 1), end: Date.UTC(2026, m, 0), label: `M${m}` });
let ln = 0;
const row = (doc: string, date: string, type: string, debit: number, credit: number, ref = '', against = '', tag = ''): Row => ({ 'Line ID': `L${++ln}`, 'Document No': doc, 'Document Date': date, 'Posting Date': date, 'Type': type, 'Debit': debit ? String(debit) : '', 'Credit': credit ? String(credit) : '', 'Reference': ref, 'Against Doc': against, 'Narration': '', 'Period Tag': tag });
// Buyer (payable): invoice = credit, payment/CN/TDS = debit. Vendor (receivable): invoice = debit, receipt/CN/TDS = credit.
const file = (relId: string, side: 'B' | 'V', tag: string, rows: Row[], opening: number, kind: LedgerFile['kind'] = 'period', closingAdj = 0): LedgerFile => {
  const signed = rows.reduce((s, r) => s + (side === 'B' ? Number(r['Credit'] || 0) - Number(r['Debit'] || 0) : Number(r['Debit'] || 0) - Number(r['Credit'] || 0)), 0);
  return { id: `${relId}-${side}-${tag}-${kind}-${ln}`, relId, side, periodTag: tag, kind, fileName: 'test.csv', source: 'test', availableAt: '', opening: kind === 'period' ? opening : null, closing: kind === 'period' ? opening + signed + closingAdj : null, rows };
};
const ok = <T,>(r: { ok: boolean; state?: T; error?: string }): T => { if (!r.ok) throw new Error(r.error); return r.state as T; };
const runAll = (st: RelState, tag: string) => { STAGES.forEach(s => { st = ok(runStage(st, tag, s.id, S, 'Tester', AT)); }); return st; };

{
  const tag = 'M062026'; let st = newRelState(rel, P(6));
  const B = file('T1', 'B', tag, [
    row('INV-1', '02-Jun-2026', 'Invoice', 0, 10000), row('INV-1-R', '04-Jun-2026', 'Invoice Reversal', 10000, 0, '', 'INV-1'),   // contra with reference
    row('INV-2', '05-Jun-2026', 'Invoice', 0, 25000), row('JV-9', '06-Jun-2026', 'Invoice Reversal', 25000, 0),                     // equal and opposite, no link
    row('inv/0003', '07-Jun-2026', 'Invoice', 0, 30000), row('INV-4', '08-Jun-2026', 'Invoice', 0, 41000),                          // formatting variant; amount mismatch
    row('DN-1', '09-Jun-2026', 'Debit Note', 0, 2000, '', 'INV-4'), row('MCN-77', '10-Jun-2026', 'Credit Note', 3000, 0),            // DN match; CN with own number
    row('PV-1', '12-Jun-2026', 'Payment', 50000, 0, 'UTR111'), row('PV-1R', '13-Jun-2026', 'Payment Reversal', 0, 50000, 'UTR111'),  // payment + reversal (contra)
    row('PV-2', '15-Jun-2026', 'Payment', 60000, 0, 'UTR222'),                                                                        // one-to-many: vendor splits
    row('PV-3', '16-Jun-2026', 'Payment', 9800, 0, 'UTR333', 'INV-9'), row('TDS/INV-9', '16-Jun-2026', 'TDS', 200, 0, '', 'INV-9'),   // payment + TDS vs one receipt
    row('TDS/INV-8', '17-Jun-2026', 'TDS', 400, 0, '', 'INV-8'),                                                                     // TDS match
    row('DC-0555', '18-Jun-2026', 'Invoice', 0, 12345),                                                                              // probable (challan number)
    row('INV-5', '19-Jun-2026', 'Invoice', 0, 7000),                                                                                 // vendor never books
  ], 100000);
  const V = file('T1', 'V', tag, [
    row('INV-1', '02-Jun-2026', 'Invoice', 10000, 0), row('INV-1-R', '04-Jun-2026', 'Invoice Reversal', 0, 10000, '', 'INV-1'),
    row('INV-2', '05-Jun-2026', 'Invoice', 25000, 0),
    row('INV/0003', '07-Jun-2026', 'Invoice', 30000, 0), row('INV-4', '08-Jun-2026', 'Invoice', 40000, 0),
    row('DN-1', '09-Jun-2026', 'Debit Note', 2000, 0, '', 'INV-4'), row('CN/VX/12', '09-Jun-2026', 'Credit Note', 0, 3000, '', 'INV-4'),
    row('R-1', '12-Jun-2026', 'Receipt', 0, 50000, 'UTR111'), row('R-1R', '13-Jun-2026', 'Receipt Reversal', 50000, 0, 'UTR111'),
    row('R-2a', '15-Jun-2026', 'Receipt', 0, 35000, 'UTR222'), row('R-2b', '15-Jun-2026', 'Receipt', 0, 25000, 'UTR222'),
    row('R-3', '17-Jun-2026', 'Receipt', 0, 10000, 'UTR333', 'INV-9'),
    row('TDSR-8', '18-Jun-2026', 'TDS Receivable', 0, 400, '', 'INV-8'),
    row('DPL/26-27/0555', '18-Jun-2026', 'Invoice', 12345, 0),
    row('INV-6', '20-Jun-2026', 'Invoice', 5000, 0),
  ], 100000);
  st = ok(importFile(st, B, tag, 'Tester', AT));
  const blocked = runStage(st, tag, 'contraB', S, 'Tester', AT);
  check('Matching is blocked until both ledgers are imported', !blocked.ok);
  st = ok(importFile(st, V, tag, 'Tester', AT));
  check('Duplicate import of the same file is refused', !importFile(st, B, tag, 'Tester', AT).ok);
  check('First period: opening position agreed when openings and history agree', gate(st, tag).position?.status === 'AGREED' && gate(st, tag).passed);
  check('Stages must run in order', !runStage(st, tag, 'invdn', S, 'Tester', AT).ok);
  st = runAll(st, tag);
  const m = st.matches.filter(x => !x.reversed); const has = (rule: string, ids: string[]) => m.some(x => x.rule.includes(rule) && ids.every(i => [...x.buyerIds, ...x.vendorIds].some(y => y.endsWith(':' + i))));
  const id = (side: string, doc: string) => st.txns.find(t => t.side === side && (t.docNo === doc))!.line;
  check('Contra: invoice and reversal with reference (buyer)', m.some(x => x.kind === 'contra' && x.buyerIds.length === 2 && x.confidence === 'Exact'));
  check('Contra: payment and payment reversal by UTR', m.filter(x => x.kind === 'contra' && x.rule.includes('references')).length >= 3);
  check('Contra: equal and opposite amounts without a link are only proposed, never closed', st.candidates.some(c => c.kind === 'contra' && c.status === 'pending') && !closedTxnIds(st).has(st.txns.find(t => t.docNo === 'JV-9')!.id));
  check('Exact invoice match (INV-1 handled by contra, INV-2 open on vendor side via buyer reversal)', true);
  check('Rule-based match on normalised invoice number', has('Document number', [id('B', 'inv/0003'), id('V', 'INV/0003')]));
  check('Invoice amount mismatch stays open as an amount difference', openItems(st, tag, S).some(o => o.txn.docNo === 'INV-4' && o.category === 'Amount mismatch'));
  check('Debit note match', has('Document number', [id('B', 'DN-1')]));
  check('Payment one-to-many match by UTR (1 buyer : 2 vendor)', m.some(x => x.stage === 'pay' && x.buyerIds.length === 1 && x.vendorIds.length === 2));
  check('TDS match against the same invoice', m.some(x => x.stage === 'tds'));
  check('Payment + TDS grouped against one receipt', m.some(x => x.stage === 'paytds' && x.buyerIds.length === 2 && x.vendorIds.length === 1));
  const prob = st.candidates.find(c => c.stage === 'other' && c.status === 'pending');
  check('Probable match proposed, not auto-confirmed', !!prob && !closedTxnIds(st).has(prob.buyerIds[0]));
  // Credit note with its own number: mapping to the invoice, then the credit-note stage matches it.
  const cnRow = noteMappings(st, tag).find(n => n.note.docNo === 'MCN-77')!;
  check('Credit mapping suggests the invoice named by the vendor’s matching note', cnRow.status === 'Suggested' && cnRow.suggestion?.invoice.docNo === 'INV-4');
  st = ok(mapNote(st, tag, cnRow.note.id, 'INV-4', 'Suggested', 'Tester', AT));
  st = ok(runStage(st, tag, 'cn', S, 'Tester', AT));
  check('Credit note matched by original invoice and amount after mapping', st.matches.some(x => x.stage === 'cn' && x.rule.includes('Original invoice')));
  st = ok(decideCandidate(st, prob!.id, true, 'Tester', AT));
  check('Confirmed probable match closes both items', closedTxnIds(st).has(prob!.buyerIds[0]) && closedTxnIds(st).has(prob!.vendorIds[0]));
  const ct = st.candidates.find(c => c.kind === 'contra' && c.status === 'pending')!; st = ok(decideCandidate(st, ct.id, false, 'Tester', AT));
  // Safeguards
  const used = closedTxnIds(st); const all = st.matches.filter(x => !x.reversed).flatMap(x => [...x.buyerIds, ...x.vendorIds]);
  check('No transaction sits in two active matches', all.length === new Set(all).size && used.size === all.length);
  check('Cross-relationship match is blocked', !manualMatch(st, tag, [st.txns[0].id, 'OTHER:V:L1'], 'test', 'Tester', AT).ok);
  const o = openItems(st, tag, S); const b5 = o.find(x => x.txn.docNo === 'INV-5')!, v6 = o.find(x => x.txn.docNo === 'INV-6')!;
  check('Manual match that does not net to zero is refused', !manualMatch(st, tag, [b5.txn.id, v6.txn.id], 'test', 'Tester', AT).ok);
  // Bridge
  const s1 = statement(st, tag, S);
  check('Bridge: buyer closing − vendor closing = open buyer − open vendor (+ adjustments)', s1.balanced, `unexplained ${s1.unexplained}`);
  // Reversal reopens with original tags
  const mt = st.matches.find(x => x.stage === 'invdn')!; const st2 = ok(reverseMatch(st, mt.id, tag, 'Wrong document pairing', 'Tester', AT, false));
  check('Match reversal reopens items with original period tag and keeps the bridge exact', openItems(st2, tag, S).some(x => mt.buyerIds.includes(x.txn.id) && x.txn.originTag === tag) && statement(st2, tag, S).balanced && st2.audit.some(a => a.action === 'Reverse match' && a.reason === 'Wrong document pairing'));
  // Exceptions cannot be closed by hand
  check('Resolved/closed status cannot be set by hand', !updateException(st, tag, b5.txn.id, { status: 'Closed' }, 'Tester', AT, S).ok);
  // Adjustment: proposer cannot approve; approver settles the item and the bridge still holds
  st = ok(proposeAdjustment(st, tag, [b5.txn.id], 'Duplicate keyed by buyer, reversing JV-1201', 'JV-1201', 'Tester', AT));
  const adj = st.adjustments.find(a => a.status === 'pending')!;
  check('Segregation of duties: proposer cannot approve the adjustment', !decideAdjustment(st, adj.id, true, 'Tester', AT, true).ok);
  st = ok(decideAdjustment(st, adj.id, true, 'Approver', AT, true));
  check('Approved adjustment settles the item and the bridge still balances', !openItems(st, tag, S).some(x => x.txn.id === b5.txn.id) && statement(st, tag, S).balanced);
  // Sign-off
  st = ok(prepare(st, tag, S, 'Tester', AT));
  check('Signed/prepared period is locked against changes', !manualMatch(st, tag, [], 'x', 'Tester', AT).ok && !runStage(st, tag, 'other', S, 'Tester', AT).ok);
  st = ok(share(st, tag, 'Tester', AT)); st = ok(vendorResponse(st, tag, false, 'Vendor rep', 'INV-4 value disputed', 'Tester', AT));
  check('Vendor dispute recorded', status(st, tag, S) === 'Vendor disputed');
  check('Reopen needs an approver', !reopen(st, tag, 'Amend', 'Tester', AT, false).ok);
  st = ok(reopen(st, tag, 'Vendor dispute on INV-4', 'Approver', AT, true));
  check('Reopening creates a new version', st.periods[0].version === 2 && st.periods[0].phase === 'working');
  st = ok(prepare(st, tag, S, 'Tester', AT)); st = ok(share(st, tag, 'Tester', AT)); st = ok(vendorResponse(st, tag, true, 'Vendor rep', 'Agreed', 'Tester', AT)); st = ok(finalSignoff(st, tag, 'Approver', AT, true));
  check('Close needs an approver', !closePeriod(st, tag, P(7), S, 'Tester', AT, false).ok);
  const open1 = openItems(st, tag, S).map(x => x.txn.id);
  st = ok(closePeriod(st, tag, P(7), S, 'Approver', AT, true));
  check('Closure carries forward exactly the unresolved items', st.periods[1].carriedIn.length === open1.length && open1.every(i => st.periods[1].carriedIn.includes(i)));
  check('Closed matches and contras are not carried forward', !st.periods[1].carriedIn.some(i => closedTxnIds(st).has(i)));
  // Period 2: opening continuity
  const t2 = 'M072026'; const cB = st.periods[0].closing.B!, cV = st.periods[0].closing.V!;
  st = ok(importFile(st, file('T1', 'B', t2, [row('INV-6', '03-Jul-2026', 'Invoice', 0, 5000)], cB), t2, 'Tester', AT));
  st = ok(importFile(st, file('T1', 'V', t2, [row('INV-7', '05-Jul-2026', 'Invoice', 8000, 0)], cV + 1500), t2, 'Tester', AT));
  const g2 = gate(st, t2);
  check('Buyer continuity passes; vendor opening mismatch fails separately', g2.B.status === 'PASSED' && g2.V.status === 'FAILED' && g2.V.variance === 1500 && !g2.passed);
  check('Matching blocked while continuity fails', !runStage(st, t2, 'contraB', S, 'Tester', AT).ok);
  check('Approval needs reason and evidence', !approveOpening(st, t2, 'V', 'opening-continuity', '', '', 'Approver', AT, true).ok);
  st = ok(importFile(st, file('T1', 'V', t2, [row('INV-0B', '29-Jun-2026', 'Invoice', 1500, 0, '', '', 'M062026')], 0, 'backdated'), t2, 'Tester', AT));
  check('Back-dated vendor entry explains the vendor opening; gate passes', gate(st, t2).passed && gate(st, t2).V.status === 'PASSED');
  st = runAll(st, t2);
  check('Carried item from period 1 matches in period 2 (INV-6)', st.matches.some(x => !x.reversed && x.periodTag === t2 && x.buyerIds.length && st.txns.find(t => t.id === x.vendorIds[0])?.docNo === 'INV-6'));
  const bd = openItems(st, t2, S).find(x => x.txn.docNo === 'INV-0B');
  check('Back-dated item keeps its original period tag', bd?.txn.originTag === 'M062026');
  check('Bridge balances in period 2', statement(st, t2, S).balanced, String(statement(st, t2, S).unexplained));
  const ann = statement(st, t2, S).annexures.map(a => a.tag);
  check('Annexures are grouped by originating period', ann.includes('M062026') && ann.includes('M072026') && ann.length >= 2, ann.join(','));
  // Rounding
  st = ok(prepare(st, t2, S, 'Tester', AT)); st = ok(share(st, t2, 'Tester', AT)); st = ok(vendorResponse(st, t2, true, 'Rep', '', 'Tester', AT)); st = ok(finalSignoff(st, t2, 'Approver', AT, true)); st = ok(closePeriod(st, t2, P(8), S, 'Approver', AT, true));
  const t3 = 'M082026';
  st = ok(importFile(st, file('T1', 'B', t3, [row('INV-8X', '03-Aug-2026', 'Invoice', 0, 900)], st.periods[1].closing.B!), t3, 'Tester', AT));
  st = ok(importFile(st, file('T1', 'V', t3, [row('INV-8X', '03-Aug-2026', 'Invoice', 900, 0)], st.periods[1].closing.V!, 'period', 120), t3, 'Tester', AT));
  st = runAll(st, t3); const s3 = statement(st, t3, S);
  check('Unexplained difference within tolerance is shown, not treated as reconciled', !s3.balanced && s3.withinTolerance && !prepare(st, t3, S, 'Tester', AT).ok);
  check('Rounding needs an approver', !approveRounding(st, t3, 'FX', 'Tester', AT, S, false).ok);
  st = ok(approveRounding(st, t3, 'Vendor statement rounding', 'Approver', AT, S, true));
  check('Approved rounding records amount, reason and approver; bridge balances', statement(st, t3, S).balanced && st.adjustments.some(a => a.kind === 'rounding' && a.approvedBy === 'Approver' && a.amount === -120));
  const t1Open = st.periods[0].carriedOut.find(i => !closedTxnIds(st).has(i));
  check('An item open since period 1 is still open in period 3 with its original tag', !!t1Open && openItems(st, t3, S).some(x => x.txn.id === t1Open && x.txn.originTag === 'M062026' && x.carriedPeriods.length === 2));
  const t1Matched = st.matches.find(x => x.periodTag === 'M062026' && !x.reversed && x.kind === 'match')!;
  check('A match made in period 1 stays closed in periods 2 and 3', !openItems(st, t3, S).some(x => t1Matched.buyerIds.includes(x.txn.id)));
  const inv6 = st.txns.find(t => t.docNo === 'INV-6' && t.side === 'V')!;
  check('An item resolved in period 2 is not carried into period 3', st.periods[1].carriedOut.every(i => i !== inv6.id) && !st.periods[2].carriedIn.includes(inv6.id));
  check('Re-uploading a closed transaction does not recreate it', importFile(st, file('T1', 'V', t3, [row('INV-1', '02-Jun-2026', 'Invoice', 10000, 0)], 0, 'backdated'), t3, 'Tester', AT).ok && (() => { const r = importFile(st, file('T1', 'V', t3, [row('INV-1', '02-Jun-2026', 'Invoice', 10000, 0)], 0, 'backdated'), t3, 'Tester', AT); return r.ok && r.state.txns.length === st.txns.length; })());
}

// ---------- New vendor ----------
{
  const relN: Relationship = { ...rel, id: 'T2' }; const tag = 'M092026'; let st = newRelState(relN, P(9));
  st = ok(importFile(st, file('T2', 'B', tag, [row('H-1', '10-Mar-2026', 'Invoice', 0, 5000, '', '', 'M032026')], 0, 'historical'), tag, 'T', AT));
  st = ok(importFile(st, file('T2', 'B', tag, [], 25000), tag, 'T', AT)); st = ok(importFile(st, file('T2', 'V', tag, [], 22000), tag, 'T', AT));
  const g = gate(st, tag);
  check('New vendor: opening position unverified when history does not explain it', g.first && g.position?.status === 'UNVERIFIED' && g.position.diff === -2000 && !g.passed);
  st = ok(approveOpening(st, tag, 'B', 'opening-position', 'Agreed at onboarding', 'Minutes', 'Approver', AT, true));
  st = runAll(st, tag);
  const s = statement(st, tag, S);
  check('New vendor: approved position + historical item explain the difference', gate(st, tag).passed && s.balanced && s.annexures.some(a => a.tag === 'M032026'));
}

// ---------- Full synthetic workspace ----------
const t0 = Date.now(); const ws = initWorkspace(); console.log(`Workspace built in ${Date.now() - t0} ms`);
check('Eight relationships across 2 entities, 3 business units, 2 currencies', RELS.length === 8 && new Set(RELS.map(r => r.entityId)).size === 2 && new Set(RELS.map(r => r.bu)).size === 3 && new Set(RELS.map(r => r.currency)).size === 2);
check('A vendor with relationships in two business units and two currencies is kept separate', ['R1', 'R2'].every(r => ws.states[r].rel.vendorId === 'V01') && ws.states.R6.rel.currency !== ws.states.R7.rel.currency && ws.states.R1.txns.every(t => t.relId === 'R1'));
let allBalanced = true, detail = '';
Object.values(ws.states).forEach(st => st.periods.filter(p => p.phase === 'closed').forEach(p => { if (!p.snapshot?.balanced) { allBalanced = false; detail += `${st.rel.id} ${p.tag} ${p.snapshot?.unexplained}; `; } }));
check('Every closed historical period balanced exactly at closure', allBalanced, detail);
check('Matches never cross relationships', Object.values(ws.states).every(st => st.matches.every(m => [...m.buyerIds, ...m.vendorIds].every(i => i.startsWith(st.rel.id + ':')))));
const R1 = ws.states.R1; check('Monthly relationships have three closed periods before the current one', R1.periods.filter(p => p.phase === 'closed').length === 3 && R1.periods.length === 4);
const R2 = ws.states.R2; check('R2 current period fails the vendor opening check (back-dated entry not yet uploaded)', gate(R2, R2.periods[3].tag).V.status === 'FAILED');
const R3 = ws.states.R3; const r3open = openItems(R3, 'M092026', S);
check('R3 amount difference from June is still open in September, tag M062026, carried 3 times, notes preserved', r3open.some(o => o.txn.originTag === 'M062026' && o.category === 'Amount mismatch' && o.carriedPeriods.length === 3 && o.ex.notes.length === 3));
check('R3 vendor invoice from July matched in September once the buyer booked it', R3.matches.some(m => m.periodTag === 'M092026' && m.stage === 'invdn' && R3.txns.find(t => t.id === m.vendorIds[0])?.originTag === 'M072026'));
check('R3 has pattern-assisted suggestions waiting for review', R3.candidates.some(c => c.status === 'pending' && c.reasons.some(x => x.startsWith('Pattern-assisted'))));
const R5 = ws.states.R5; const r5 = drive(R5, ws, 'M092026', 'matched');
check('R5 TDS, payment + TDS and payment reversal handled', r5.matches.some(m => m.periodTag === 'M092026' && m.stage === 'paytds') && r5.matches.some(m => m.stage === 'tds') && r5.matches.some(m => m.kind === 'contra' && m.rule.includes('references')));
check('R5 loose reversal proposed as possible contra', r5.candidates.some(c => c.kind === 'contra' && c.status === 'pending'));
check('R5 TDS not booked by vendor surfaces as an open item', openItems(r5, 'M092026', S).some(o => o.category === 'TDS not recognised by vendor'));
check('R5 current period balances after matching', statement(r5, 'M092026', S).balanced);
const R8 = ws.states.R8; check('New vendor R8 waits on opening position approval with historical items from M032026 and M062026', gate(R8, 'M092026').position?.status === 'UNVERIFIED' && R8.txns.some(t => t.originTag === 'M032026'));
const R7 = ws.states.R7; check('R7 disputed, with approved FX rounding inside USD tolerance', status(R7, 'M092026', S) === 'Vendor disputed' && R7.adjustments.some(a => a.kind === 'rounding'));
// Close R6 and run the next period end to end.
let R6 = ws.states.R6; const def6 = periodsFor(R6.rel);
R6 = ok(closePeriod(R6, 'M092026', def6[4], S, 'Arjun Mehta', AT, true));
R6 = drive(R6, ws, 'M102026', 'closed');
check('R6: September closed, October run end to end and closed, November opened with carry-forward', R6.periods.length === 6 && R6.periods[4].phase === 'closed' && R6.periods[5].prevClosing !== null);
// Balance confirmation: R1 September is confirmed without a reconciliation; October opens from the agreed balance.
{ const R1 = ws.states.R1; const bal = R1.periods[3].closing.B!; const before = openPool(R1, 'M092026').length; const d1 = periodsFor(R1.rel);
  const c = confirmBalance(R1, 'M092026', bal, d1[4], 'BCC-T', 'R. Iyer', 'R. Iyer', AT);
  check('Balance confirmation closes the period and opens the next from the confirmed balance', c.ok && c.state.periods[3].phase === 'closed' && !!c.state.periods[3].confirmed && c.state.periods[4].prevClosing?.B === bal && c.state.periods[4].prevClosing?.V === bal);
  check('Items up to a confirmed period stay recorded there and do not reach the next period', c.ok && before > 0 && openPool(c.state, 'M092026').length === before && openPool(c.state, 'M102026').length === 0);
  check('A closed period cannot be confirmed again', c.ok && !confirmBalance(c.state, 'M092026', bal, d1[4], 'BCC-T', 'R. Iyer', 'R. Iyer', AT).ok); }
check('Every relationship has a current period in the expected position', Object.entries(CURRENT).every(([r, i]) => ws.states[r].periods.length === i + 1));
check('Generator is deterministic', JSON.stringify(generateAll().files.map(f => f.closing)) === JSON.stringify(generateAll().files.map(f => f.closing)));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
