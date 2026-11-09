// Engine checks for the Reconciliation Lab. Run: npm run test:recon
// Verifies the dataset sizes, that the bridge explains the variance exactly, that matching is one-to-one
// and never crosses vendors, that results are reproducible, and that every seeded issue is detected.
import { generate } from '../src/recon/data';
import { reconcile, DEFAULT_SETTINGS, EMPTY_DECISIONS } from '../src/recon/engine';
import { annexByVendor, initialWorkspace, activeData, applyUpload, sampleRows } from '../src/recon/model';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed++; };

const data = generate();
const n = (k: string) => data.datasets.find(d => d.key === k)!.rows.length;
const ledger = data.datasets.find(d => d.key === 'ledger')!.rows;
const count = (t: string) => ledger.filter(r => r['Transaction Type'] === t).length;
console.log('Rows:', Object.fromEntries(data.datasets.map(d => [d.key, d.rows.length])), 'CN', count('Credit Note'), 'DN', count('Debit Note'));
check('Suppliers 8–12', data.suppliers.length >= 8 && data.suppliers.length <= 12, String(data.suppliers.length));
check('Ledger 150–250', n('ledger') >= 150 && n('ledger') <= 250, String(n('ledger')));
check('Statement 150–250', n('statement') >= 150 && n('statement') <= 250, String(n('statement')));
check('POs 60–100', n('po') >= 60 && n('po') <= 100, String(n('po')));
check('GRNs 60–100', n('grn') >= 60 && n('grn') <= 100, String(n('grn')));
check('Payments 20–40', n('payments') >= 20 && n('payments') <= 40, String(n('payments')));
check('Credit notes 10–20', count('Credit Note') >= 10 && count('Credit Note') <= 20);
check('Debit notes 10–20', count('Debit Note') >= 10 && count('Debit Note') <= 20);
check('Seeded exceptions 40–60', data.seeded.length >= 40 && data.seeded.length <= 60, String(data.seeded.length));

const r = reconcile(data, DEFAULT_SETTINGS, EMPTY_DECISIONS);
console.log(`Buyer ${r.buyerBalance.toFixed(2)}  Supplier ${r.supplierBalance.toFixed(2)}  Variance ${r.variance.toFixed(2)}  Bridge ${r.bridgeTotal.toFixed(2)}`);
check('Bridge sums exactly to the variance', r.bridgeCheck);
const vendorBridge = r.vendors.every(v => Math.abs(r.bridge.filter(b => b.vendorId === v.vendorId).reduce((s, b) => s + b.amount, 0) - v.variance) < 0.01);
check('Bridge sums to the variance for every vendor', vendorBridge);
const bIds = r.matches.map(m => m.buyer.id), sIds = r.matches.map(m => m.supplier.id);
check('Matching is one-to-one', new Set(bIds).size === bIds.length && new Set(sIds).size === sIds.length);
check('No match crosses vendors or currencies', r.matches.every(m => m.buyer.vendorId === m.supplier.vendorId && m.buyer.currency === m.supplier.currency));
const total = r.normalized.buyer.length + r.normalized.supplier.length;
check('Every record is matched or unmatched, never both', r.matches.length * 2 + r.unmatchedBuyer.length + r.unmatchedSupplier.length === total);
const r2 = reconcile(generate(), DEFAULT_SETTINGS, EMPTY_DECISIONS);
check('Reproducible (same seed, same result)', r2.variance === r.variance && r2.exceptions.length === r.exceptions.length && r2.exceptions.every((e, i) => e.key === r.exceptions[i].key));

// Confirming a probable match must not change the variance, only move it out of "pending".
const confirmed = reconcile(data, DEFAULT_SETTINGS, { ...EMPTY_DECISIONS, probable: Object.fromEntries(r.pending.map(m => [m.key, 'confirmed' as const])) });
check('Confirming probable matches keeps the variance and clears pending', confirmed.variance === r.variance && confirmed.pending.length === 0 && confirmed.bridgeCheck);

console.log('\nExceptions by category:');
const byCat: Record<string, number> = {}; r.exceptions.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + 1; });
Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([c, k]) => console.log(`  ${String(k).padStart(3)}  ${c}`));
console.log(`Matches: ${r.matches.length} (${['Exact match', 'Strong match', 'Probable match', 'Manual match'].map(c => `${c}: ${r.matches.filter(m => m.confidence === c).length}`).join(', ')}), pending ${r.pending.length}`);
console.log('Quality:', r.normalized.quality.map(q => `${q.dataset} ${q.accepted}/${q.received} (rej ${q.rejected}, dup ${q.duplicates}, chg ${q.changes})`).join(' | '));

// Seeded issues must each surface somewhere (exception refs, pending matches, or data-quality rejections).
const refs = new Set<string>();
r.exceptions.forEach(e => { e.refs.forEach(x => refs.add(x.toUpperCase())); e.records.forEach(x => { refs.add(x.id.toUpperCase()); refs.add(x.rawRef.toUpperCase()); refs.add(x.payRef.toUpperCase()); }); e.evidence.forEach(x => x.split(/[ ·]+/).forEach(t => refs.add(t.toUpperCase()))); });
r.normalized.rejections.forEach(j => refs.add(j.recordId.toUpperCase()));
const missed = data.seeded.filter(s => !s.refs.some(x => refs.has(x.toUpperCase())));
check('Every seeded issue is detected', missed.length === 0, missed.map(m => `${m.category}: ${m.refs.join(',')}`).join(' | '));

// Recon Desk: annexures must add up to each vendor's difference, and uploading a held-back ledger must reconcile it.
const annex = annexByVendor(r);
check('Annexures sum to the difference for every vendor', r.vendors.every(v => Math.abs(Object.values(annex.get(v.vendorId)?.annex ?? {}).reduce((s, x) => s + x, 0) - v.variance) < 0.01));
const ws = initialWorkspace();
const before = reconcile(activeData(ws), DEFAULT_SETTINGS, EMPTY_DECISIONS);
check('Held-back vendor is not reconciled before upload', !before.vendors.some(v => v.vendorId === 'V010') && before.bridgeCheck);
const after = reconcile(activeData(applyUpload(ws, 'V010', sampleRows(ws, 'V010'), { fileName: 't.csv', from: 'Apr-26', to: 'Jun-26', comments: '' })), DEFAULT_SETTINGS, EMPTY_DECISIONS);
const full = r.vendors.find(v => v.vendorId === 'V010')!, up = after.vendors.find(v => v.vendorId === 'V010');
check('Uploading the sample ledger reconciles that vendor like the full run', !!up && Math.abs(up.variance - full.variance) < 0.01 && after.bridgeCheck);
const reopenKey = r.matches.find(m => m.level === 1)!.key;
const reo = reconcile(data, DEFAULT_SETTINGS, { ...EMPTY_DECISIONS, reopened: [reopenKey] });
check('Reopening a match removes it and keeps the bridge exact', !reo.matches.some(m => m.key === reopenKey) && reo.bridgeCheck);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
