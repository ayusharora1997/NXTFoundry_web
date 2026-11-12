// Synthetic master data and ledger files for NXT Vendor Payable Reconciliation.
// Everything is fictional. A fixed seed per relationship makes every run identical.
// Each relationship gets real period files (opening, lines, closing) for both ledgers, with situations seeded across
// periods: late postings that carry forward and clear later, reversals, split payments, TDS, payment + TDS,
// amount differences, back-dated vendor entries, historical items for a new vendor, and a small rounding gap.

import { SIGN, r2, type Buyer, type Entity, type Vendor, type Relationship, type PeriodDef, type LedgerFile, type Row, type Side, type TxnType, type Frequency } from './cycle';

const DAY = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (ms: number) => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`; };
export const TODAY = Date.UTC(2026, 10, 9); // files for periods that ended before this date are available

export const BUYER: Buyer = { id: 'BYR-01', name: 'Meridian Consumer Products', erp: 'ERP ledger extract (synthetic)', currency: 'INR' };
export const ENTITIES: Entity[] = [
  { id: 'LE1', name: 'Meridian Consumer Products Pvt. Ltd.', gstin: '29SYNTH0001Z9X', bus: ['Foods', 'Home Care'] },
  { id: 'LE2', name: 'Meridian Exports LLP', gstin: '29SYNTH0002Z9X', bus: ['Exports'] },
];
export const VENDORS: Vendor[] = [
  { id: 'V01', code: 'KAV-1001', legalName: 'Kaveri Packaging Private Limited', displayName: 'Kaveri Packaging', gstin: '29SYNTH1001K1Z', status: 'Active', currency: 'INR', contact: { name: 'R. Iyer', email: 'ar@kaveri.example' }, frequency: 'Monthly', owner: 'Priya Nair', created: '12-Jan-2024', category: 'Packaging' },
  { id: 'V02', code: 'DEC-1002', legalName: 'Deccan Polymers Limited', displayName: 'Deccan Polymers', gstin: '36SYNTH1002D1Z', status: 'Active', currency: 'INR', contact: { name: 'S. Reddy', email: 'accounts@deccan.example' }, frequency: 'Monthly', owner: 'Priya Nair', created: '03-Mar-2024', category: 'Raw materials' },
  { id: 'V03', code: 'SAH-1003', legalName: 'Sahyadri Agro Ingredients LLP', displayName: 'Sahyadri Agro', gstin: '27SYNTH1003S1Z', status: 'Active', currency: 'INR', contact: { name: 'M. Kulkarni', email: 'finance@sahyadri.example' }, frequency: 'Quarterly', owner: 'Arjun Mehta', created: '18-Jul-2023', category: 'Raw materials' },
  { id: 'V04', code: 'NAN-1004', legalName: 'Nandi Logistics Private Limited', displayName: 'Nandi Logistics', gstin: '29SYNTH1004N1Z', status: 'Active', currency: 'INR', contact: { name: 'K. Gowda', email: 'billing@nandi.example' }, frequency: 'Monthly', owner: 'Priya Nair', created: '22-Aug-2023', category: 'Logistics (TDS applies)' },
  { id: 'V05', code: 'COR-1005', legalName: 'Coromandel Chemicals Limited', displayName: 'Coromandel Chemicals', gstin: '33SYNTH1005C1Z', status: 'Active', currency: 'INR', contact: { name: 'L. Raman', email: 'ar@coromandel.example' }, frequency: 'Monthly', owner: 'Arjun Mehta', created: '09-Feb-2023', category: 'Chemicals' },
  { id: 'V06', code: 'KON-1006', legalName: 'Konkan Spices and Extracts Private Limited', displayName: 'Konkan Spices', gstin: '30SYNTH1006K1Z', status: 'Onboarding', currency: 'INR', contact: { name: 'A. Naik', email: 'accounts@konkan.example' }, frequency: 'Monthly', owner: 'Priya Nair', created: '28-Aug-2026', category: 'Raw materials' },
];
export const RELS: Relationship[] = [
  { id: 'R1', buyerId: 'BYR-01', entityId: 'LE1', bu: 'Foods', vendorId: 'V01', vendorCode: 'KAV-1001', currency: 'INR', frequency: 'Monthly', owner: 'Priya Nair', status: 'Active' },
  { id: 'R2', buyerId: 'BYR-01', entityId: 'LE1', bu: 'Home Care', vendorId: 'V01', vendorCode: 'KAV-1001', currency: 'INR', frequency: 'Monthly', owner: 'Priya Nair', status: 'Active' },
  { id: 'R3', buyerId: 'BYR-01', entityId: 'LE1', bu: 'Home Care', vendorId: 'V02', vendorCode: 'DEC-1002', currency: 'INR', frequency: 'Monthly', owner: 'Priya Nair', status: 'Active' },
  { id: 'R4', buyerId: 'BYR-01', entityId: 'LE1', bu: 'Foods', vendorId: 'V03', vendorCode: 'SAH-1003', currency: 'INR', frequency: 'Quarterly', owner: 'Arjun Mehta', status: 'Active' },
  { id: 'R5', buyerId: 'BYR-01', entityId: 'LE1', bu: 'Foods', vendorId: 'V04', vendorCode: 'NAN-1004', currency: 'INR', frequency: 'Monthly', owner: 'Priya Nair', status: 'Active' },
  { id: 'R6', buyerId: 'BYR-01', entityId: 'LE1', bu: 'Home Care', vendorId: 'V05', vendorCode: 'COR-1005', currency: 'INR', frequency: 'Monthly', owner: 'Arjun Mehta', status: 'Active' },
  { id: 'R7', buyerId: 'BYR-01', entityId: 'LE2', bu: 'Exports', vendorId: 'V05', vendorCode: 'COR-1005', currency: 'USD', frequency: 'Monthly', owner: 'Arjun Mehta', status: 'Active' },
  { id: 'R8', buyerId: 'BYR-01', entityId: 'LE1', bu: 'Foods', vendorId: 'V06', vendorCode: 'KON-1006', currency: 'INR', frequency: 'Monthly', owner: 'Priya Nair', status: 'Onboarding' },
];

// ---------- Periods ----------
const month = (y: number, m: number): PeriodDef => ({ tag: `M${String(m).padStart(2, '0')}${y}`, type: 'Monthly', start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 0), label: `${MONTHS[m - 1]} ${y}` });
const quarter = (y: number, endM: number, fq: string): PeriodDef => ({ tag: `Q${String(endM).padStart(2, '0')}${y}`, type: 'Quarterly', start: Date.UTC(y, endM - 3, 1), end: Date.UTC(y, endM, 0), label: `${MONTHS[endM - 3]} – ${MONTHS[endM - 1]} ${y} (${fq})` });
export function periodsFor(rel: Relationship): PeriodDef[] {
  if (rel.frequency === 'Quarterly') return [quarter(2026, 6, 'Q1 FY27'), quarter(2026, 9, 'Q2 FY27'), quarter(2026, 12, 'Q3 FY27')];
  if (rel.id === 'R8') return [month(2026, 9), month(2026, 10), month(2026, 11)];
  return [6, 7, 8, 9, 10, 11].map(m => month(2026, m));
}
/** Index of the period each relationship is working on today. Earlier periods are closed history. */
export const CURRENT: Record<string, number> = { R1: 3, R2: 3, R3: 3, R4: 1, R5: 3, R6: 3, R7: 3, R8: 0 };
export const tagLabel = (tag: string) => { const m = Number(tag.slice(1, 3)), y = tag.slice(3); return tag[0] === 'Q' ? `${MONTHS[m - 3]} – ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`; };

// ---------- Generator ----------
interface Spec { side: Side; tag: string; kind: LedgerFile['kind']; origin?: string; type: TxnType; doc: string; date: number; amt: number; ref?: string; against?: string; narr: string; truth: string; label?: string }
interface Inv { no: string; amt: number; date: number; truth: string }
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const B_LABEL: Record<TxnType, string> = { INV: 'Invoice', INVREV: 'Invoice Reversal', DN: 'Debit Note', DNREV: 'Debit Note Reversal', CN: 'Credit Note', CNREV: 'Credit Note Reversal', PAY: 'Payment', PAYREV: 'Payment Reversal', TDS: 'TDS', TDSREV: 'TDS Reversal' };
const V_LABEL: Record<TxnType, string> = { ...B_LABEL, PAY: 'Receipt', PAYREV: 'Receipt Reversal', TDS: 'TDS Receivable' };

function generateRel(rel: Relationship, defs: PeriodDef[], seed: number): Spec[] {
  const rnd = mulberry32(seed); const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const usd = rel.currency === 'USD'; const unit = usd ? 10 : 500; const vp = rel.vendorCode.slice(0, 3);
  const specs: Spec[] = []; const unpaid: Inv[] = []; let n = seed * 31 % 400 + 100, utr = seed * 97 % 900, k = 0;
  const truth = () => `T${seed}-${k++}`;
  const fy = (d: PeriodDef) => { const y = new Date(d.end).getUTCFullYear() % 100, m = new Date(d.end).getUTCMonth(); return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
  const dayIn = (d: PeriodDef, lo: number, hi: number) => Math.min(d.end, d.start + int(lo, hi) * DAY);
  const item = ({ V01: 'Corrugated cartons', V02: 'PET preforms', V03: 'Food-grade starch', V04: 'Primary freight', V05: usd ? 'Export surfactant lots' : 'Surfactant blend', V06: 'Spice oleoresins' } as Record<string, string>)[rel.vendorId];
  const tds = rel.vendorId === 'V04';
  const inv = (d: PeriodDef, o: { amt?: number; bAmt?: number; bNo?: string; bTag?: string; vTag?: string; bMissing?: boolean; vMissing?: boolean; noPay?: boolean; date?: number; bDate?: number; vKind?: Spec['kind']; vOrigin?: string } = {}): Inv => {
    const no = `${vp}/${fy(d)}/${String(n++).padStart(4, '0')}`; const amt = o.amt ?? int(20, usd ? 160 : 300) * unit; const date = o.date ?? dayIn(d, 0, 24); const t = truth();
    if (!o.vMissing) specs.push({ side: 'V', tag: o.vTag ?? d.tag, kind: o.vKind ?? 'period', origin: o.vOrigin, type: 'INV', doc: no, date, amt, narr: item, truth: t });
    if (!o.bMissing) specs.push({ side: 'B', tag: o.bTag ?? d.tag, kind: 'period', type: 'INV', doc: o.bNo ?? no, date: o.bDate ?? date, amt: o.bAmt ?? amt, narr: `${item} · GRN posted`, truth: t });
    const x = { no, amt, date, truth: t }; if (!o.noPay && !o.bMissing && !o.vMissing && o.bAmt === undefined && !o.bTag && !o.vTag) unpaid.push(x); return x;
  };
  const pay = (d: PeriodDef, invs: Inv[], o: { split?: boolean; vTag?: string; mode?: 'normal' | 'vendorFull' | 'vendorNoTds' } = {}) => {
    const ref = `${usd ? 'SWIFT' : 'UTR'}${String(4100000 + utr++ * 137)}`; const date = dayIn(d, 4, 26); const t = truth(); const pv = `PV/${fy(d)}/${String(utr).padStart(4, '0')}`;
    const lines = invs.map(i => ({ i, tds: tds ? Math.round(i.amt * 0.02) : 0 })); const net = r2(lines.reduce((s, l) => s + l.i.amt - l.tds, 0));
    const one = invs.length === 1 ? invs[0].no : '';
    specs.push({ side: 'B', tag: d.tag, kind: 'period', type: 'PAY', doc: pv, date, amt: net, ref, against: one, narr: `Payment ${one ? 'against ' + one : 'for ' + invs.length + ' invoices'}`, truth: t });
    lines.forEach(l => { if (l.tds) specs.push({ side: 'B', tag: d.tag, kind: 'period', type: 'TDS', doc: `TDS/${l.i.no}`, date, amt: l.tds, against: l.i.no, narr: 'TDS u/s 194C @2%', truth: `${t}-tds-${l.i.no}` }); });
    const vt = o.vTag ?? d.tag; const vd = o.vTag ? Math.min(d.end + 2 * DAY, date + 6 * DAY) : Math.min(d.end, date + DAY);
    if (o.mode === 'vendorFull') specs.push({ side: 'V', tag: vt, kind: 'period', type: 'PAY', doc: `RCPT-${utr}`, date: vd, amt: invs[0].amt, ref, against: invs[0].no, narr: 'Receipt incl. TDS', truth: t });
    else if (o.split) lines.forEach((l, j) => specs.push({ side: 'V', tag: vt, kind: 'period', type: 'PAY', doc: `RCPT-${utr}-${j + 1}`, date: vd, amt: l.i.amt - l.tds, ref, against: l.i.no, narr: `Receipt allocated to ${l.i.no}`, truth: t }));
    else specs.push({ side: 'V', tag: vt, kind: 'period', type: 'PAY', doc: `RCPT-${utr}`, date: vd, amt: net, ref, against: one, narr: 'Receipt', truth: t });
    if (tds && o.mode !== 'vendorFull' && o.mode !== 'vendorNoTds') lines.forEach(l => specs.push({ side: 'V', tag: vt, kind: 'period', type: 'TDS', doc: `TDSR-${l.i.no.slice(-4)}`, date: vd, amt: l.tds, against: l.i.no, narr: 'TDS receivable', truth: `${t}-tds-${l.i.no}` }));
    invs.forEach(i => { const at = unpaid.indexOf(i); if (at >= 0) unpaid.splice(at, 1); });
  };
  const cn = (d: PeriodDef, i: Inv, o: { amt?: number; bNo?: string; bNoAgainst?: boolean; bMissing?: boolean } = {}) => {
    const no = `CN/${vp}/${String(n++).padStart(3, '0')}`; const amt = o.amt ?? int(2, 16) * unit; const date = dayIn(d, 5, 25); const t = truth();
    specs.push({ side: 'V', tag: d.tag, kind: 'period', type: 'CN', doc: no, date, amt, against: i.no, narr: 'Rate difference credit', truth: t });
    if (!o.bMissing) specs.push({ side: 'B', tag: d.tag, kind: 'period', type: 'CN', doc: o.bNo ?? no, date: date + DAY, amt, against: o.bNoAgainst ? '' : i.no, narr: 'Credit note from vendor', truth: t });
  };
  const dn = (d: PeriodDef, i: Inv) => { const no = `DN/${vp}/${String(n++).padStart(3, '0')}`; const amt = int(1, 8) * unit; const date = dayIn(d, 5, 25); const t = truth();
    specs.push({ side: 'V', tag: d.tag, kind: 'period', type: 'DN', doc: no, date, amt, against: i.no, narr: 'Freight surcharge', truth: t }); specs.push({ side: 'B', tag: d.tag, kind: 'period', type: 'DN', doc: no, date: date + DAY, amt, against: i.no, narr: 'Vendor debit note', truth: t }); };
  // A debit note the buyer raises on the vendor (claim, quantity shortfall, price difference). It reduces the payable, so it
  // belongs with credit notes: the vendor is expected to issue a credit note for it. Amounts are fixed, so the rest of the
  // generated data does not shift.
  let dbn = 1;
  const bdn = (d: PeriodDef, i: Inv, kind: 'Claims' | 'Quantity' | 'Price', vendorCn?: { no: string; against?: boolean }) => {
    const pct = kind === 'Claims' ? 0.03 : kind === 'Quantity' ? 0.08 : 0.02; const amt = Math.max(unit, Math.round(i.amt * pct / unit) * unit);
    const no = `DBN/${vp}/${fy(d)}/${String(dbn++).padStart(3, '0')}`; const date = Math.min(d.end, i.date + 6 * DAY); const t = `DBN-${seed}-${no}`;
    specs.push({ side: 'B', tag: d.tag, kind: 'period', type: 'CN', doc: no, date, amt, against: i.no, narr: `Debit note raised · ${kind === 'Claims' ? 'damage claim' : kind === 'Quantity' ? 'short supply' : 'rate difference'}`, truth: t, label: `Debit Note - ${kind}` });
    if (vendorCn) specs.push({ side: 'V', tag: d.tag, kind: 'period', type: 'CN', doc: vendorCn.no, date: Math.min(d.end, date + 3 * DAY), amt, against: vendorCn.against ? i.no : '', narr: `Credit note for ${kind.toLowerCase()}`, truth: t });
  };
  const rev = (d: PeriodDef, i: Inv, loose = false) => {
    const date = Math.min(d.end, i.date + 3 * DAY); const at = unpaid.indexOf(i); if (at >= 0) unpaid.splice(at, 1);
    specs.push({ side: 'V', tag: d.tag, kind: 'period', type: 'INVREV', doc: `${i.no}-R`, date, amt: i.amt, against: i.no, narr: 'Invoice cancelled (wrong rate)', truth: i.truth });
    specs.push({ side: 'B', tag: d.tag, kind: 'period', type: 'INVREV', doc: loose ? `JV/${fy(d)}/${n++}` : `${i.no}-R`, date, amt: i.amt, against: loose ? '' : i.no, narr: loose ? 'Reversal journal' : 'Invoice reversal', truth: i.truth });
    inv(d, { amt: i.amt - unit * 2 });
  };
  const payrev = (d: PeriodDef, i: Inv) => {
    const ref = `UTR${String(4100000 + utr++ * 137)}`; const date = dayIn(d, 3, 10); const t = truth(); const amt = tds ? i.amt - Math.round(i.amt * 0.02) : i.amt;
    (['B', 'V'] as Side[]).forEach(s => { specs.push({ side: s, tag: d.tag, kind: 'period', type: 'PAY', doc: s === 'B' ? `PV/${utr}` : `RCPT-${utr}`, date, amt, ref, against: i.no, narr: 'Payment', truth: t }); specs.push({ side: s, tag: d.tag, kind: 'period', type: 'PAYREV', doc: s === 'B' ? `PV/${utr}-RET` : `RCPT-${utr}-RET`, date: date + 2 * DAY, amt, ref, against: i.no, narr: 'Payment returned by bank (account details)', truth: t }); });
  };
  const normal = (d: PeriodDef, count: number, payGroups = 2) => {
    const made: Inv[] = []; for (let j = 0; j < count; j++) made.push(inv(d));
    const due = unpaid.filter(i => i.date < d.start).slice(0, payGroups + 1);
    if (due.length >= 3) { pay(d, [due[0]]); pay(d, [due[1], due[2]]); } else due.forEach(i => pay(d, [i]));
    return made;
  };

  defs.forEach((d, i) => {
    if (d.start > TODAY) return;
    if (rel.id === 'R1') { const m = normal(d, 4); if (i === 0) inv(d, { bTag: defs[1].tag }); if (i === 1) inv(d, { vTag: defs[2].tag }); if (i === 2) rev(d, m[1]); if (i === 3 || i === 4) { const due = unpaid.filter(x => x.date < d.start).slice(0, 3); if (due.length > 1) pay(d, due, { split: true }); } if (i % 2 === 0) cn(d, m[0]); }
    if (rel.id === 'R1') { const m = unpaid.slice(-3); if (i === 2 && m[0]) bdn(d, m[0], 'Price'); if (i === 3 && m.length >= 2) { bdn(d, m[0], 'Claims', { no: 'CN/KAV/9001' }); bdn(d, m[1], 'Quantity'); } }
    if (rel.id === 'R2') { const m = normal(d, 4); if (i === 3) bdn(d, m[3], 'Claims'); if (i === 2) inv(d, { date: d.end - 2 * DAY, vKind: 'backdated', vTag: defs[3].tag, vOrigin: d.tag, bTag: defs[3].tag }); if (i === 1) dn(d, m[0]); if (i === 3) cn(d, m[2]); }
    if (rel.id === 'R3') {
      const m = normal(d, 4);
      if (i === 0) inv(d, { bAmt: 0 }); // placeholder replaced below
      if (i === 1) { inv(d, { bTag: defs[3].tag }); const x = inv(d, { noPay: true }); const dcNo = `DC-${x.no.slice(-4)}`; specs.splice(specs.findIndex(s => s.side === 'B' && s.doc === x.no), 1, { ...specs.find(s => s.side === 'B' && s.doc === x.no)!, doc: dcNo }); }
      if (i === 3) { [0, 1].forEach(() => { const x = inv(d, { noPay: true }); const at = specs.findIndex(s => s.side === 'B' && s.doc === x.no); specs[at] = { ...specs[at], doc: `DC-${x.no.slice(-4)}` }; }); cn(d, m[1], { bNo: `MCN-${n}`, bNoAgainst: true }); }
      if (i === 2) cn(d, m[0]);
      if (i === 1) bdn(d, m[2], 'Claims', { no: 'CN/DEC/0711', against: true });
      if (i === 3) { bdn(d, m[2], 'Quantity'); bdn(d, m[3], 'Price'); }
    }
    if (rel.id === 'R4') { const m = normal(d, 6, 3); if (i === 0) cn(d, m[2], { bMissing: true }); if (i === 1) { inv(d, { vMissing: true }); cn(d, m[0]); } }
    if (rel.id === 'R5') {
      const m = normal(d, 4);
      if (i === 3) { const a = inv(d, { date: d.start + DAY }), b = inv(d, { date: d.start + 2 * DAY }); unpaid.splice(unpaid.indexOf(a), 1); unpaid.splice(unpaid.indexOf(b), 1); pay(d, [a], { mode: 'vendorFull' }); pay(d, [b], { mode: 'vendorNoTds' }); const c = inv(d, { date: d.start + 3 * DAY }); payrev(d, c); rev(d, m[2], true); }
      if (i === 1) dn(d, m[1]);
    }
    if (rel.id === 'R6') { const m = normal(d, 4); if (i === 3) { const due = unpaid.filter(x => x.date < d.start).slice(0, 2); if (due.length === 2) pay(d, due, { split: true }); } if (i % 2 === 1) cn(d, m[0]); }
    if (rel.id === 'R7') { normal(d, 3); if (i === 3) inv(d, { bAmt: 0 }); }
    if (rel.id === 'R8') { normal(d, 4); }
  });
  // Amount differences: the buyer keyed a different value (R3 since June, never agreed; R7 in September, disputed).
  specs.forEach(s => { if (s.side === 'B' && s.type === 'INV' && s.amt === 0) { const v = specs.find(x => x.side === 'V' && x.doc === s.doc)!; s.amt = rel.currency === 'USD' ? v.amt - 120 : v.amt + 4500; } });
  // New vendor: historical items supplied at onboarding, tagged with the periods they came from.
  if (rel.id === 'R8') {
    const d0 = defs[0]; const h = (side: Side, origin: string, type: TxnType, doc: string, day: number, amt: number, narr: string, against = '') => specs.push({ side, tag: d0.tag, kind: 'historical', origin, type, doc, date: day, amt, against, narr, truth: `H-${doc}` });
    h('B', 'M032026', 'INV', 'KSE-0412', Date.UTC(2026, 2, 18), 48500, 'Oleoresin lot · vendor says never invoiced');
    h('V', 'M062026', 'INV', 'KSE-0577', Date.UTC(2026, 5, 22), 36200, 'Oleoresin lot · not received at buyer warehouse');
    h('V', 'M062026', 'CN', 'CN/KSE/031', Date.UTC(2026, 5, 29), 8000, 'Quality credit', 'KSE-0577');
    h('B', 'M062026', 'INV', 'KSE-0601', Date.UTC(2026, 5, 26), 52000, 'Oleoresin lot'); h('V', 'M062026', 'INV', 'KSE-0601', Date.UTC(2026, 5, 26), 52000, 'Oleoresin lot');
  }
  return specs;
}

export interface Generated { files: LedgerFile[]; truth: Record<string, string> }
export function generateAll(): Generated {
  const files: LedgerFile[] = []; const truth: Record<string, string> = {};
  RELS.forEach((rel, ri) => {
    const defs = periodsFor(rel); const specs = generateRel(rel, defs, 11 + ri);
    const base = rel.currency === 'USD' ? 18000 : (8 + ri * 3) * 50000;
    const close: Record<Side, number> = { B: base, V: base };
    if (rel.id === 'R8') { const hist = (s: Side) => specs.filter(x => x.side === s && x.kind === 'historical').reduce((a, x) => a + SIGN[x.type] * x.amt, 0); close.B = r2(base + hist('B')); close.V = r2(base + 2350 + hist('V')); }
    defs.forEach((d, pi) => {
      if (d.end >= TODAY) return; // future period: nothing to upload yet
      (['B', 'V'] as Side[]).forEach(side => {
        const line = (s: Spec, j: number, tagPart: string): Row => {
          const signed = SIGN[s.type] * s.amt; const dr = side === 'B' ? signed < 0 : signed > 0; const id = `${side}-${d.tag}${tagPart}-${String(j + 1).padStart(4, '0')}`;
          truth[`${rel.id}:${side}:${id}`] = s.truth;
          return { 'Line ID': id, 'Document No': s.doc, 'Document Date': fmt(s.date), 'Posting Date': fmt(Math.max(s.date, s.kind === 'period' ? d.start : s.date)), 'Type': s.label ?? (side === 'B' ? B_LABEL : V_LABEL)[s.type], 'Debit': dr ? s.amt.toFixed(2) : '', 'Credit': dr ? '' : s.amt.toFixed(2), 'Reference': s.ref ?? '', 'Against Doc': s.against ?? '', 'Narration': s.narr, 'Period Tag': s.origin ?? '' };
        };
        const extras = specs.filter(s => s.side === side && s.tag === d.tag && s.kind !== 'period');
        const back = extras.filter(s => s.kind === 'backdated');
        const opening = r2(close[side] + back.reduce((a, s) => a + SIGN[s.type] * s.amt, 0));
        const rows = specs.filter(s => s.side === side && s.tag === d.tag && s.kind === 'period').sort((a, b) => a.date - b.date).map((s, j) => line(s, j, ''));
        let closing = r2(opening + rows.reduce((a, r) => a + (side === 'B' ? Number(r['Credit'] || 0) - Number(r['Debit'] || 0) : Number(r['Debit'] || 0) - Number(r['Credit'] || 0)), 0));
        if (rel.id === 'R7' && side === 'V' && pi === 3) closing = r2(closing + 3.2); // FX rounding on the vendor's statement
        const avail = fmt(d.end + (side === 'B' ? 3 : 4 + (ri % 3)) * DAY);
        if (pi === 0 && rel.id === 'R8') files.push({ id: `${rel.id}-${side}-${d.tag}-HIST`, relId: rel.id, side, periodTag: d.tag, kind: 'historical', fileName: `${rel.vendorCode}_${side === 'B' ? 'buyer' : 'vendor'}_historical_open_items.csv`, source: side === 'B' ? 'Buyer onboarding schedule' : 'Vendor onboarding schedule', availableAt: avail, opening: null, closing: null, rows: extras.filter(s => s.kind === 'historical').map((s, j) => line(s, j, '-H')) });
        files.push({ id: `${rel.id}-${side}-${d.tag}`, relId: rel.id, side, periodTag: d.tag, kind: 'period', fileName: `${rel.vendorCode}_${rel.bu.replace(/\s/g, '')}_${rel.currency}_${side === 'B' ? 'ERP_AP' : 'vendor_AR'}_${d.tag}.csv`, source: side === 'B' ? BUYER.erp : (ri % 2 ? 'Vendor portal upload' : 'Emailed vendor statement'), availableAt: avail, opening, closing, rows });
        if (back.length) files.push({ id: `${rel.id}-${side}-${d.tag}-BD`, relId: rel.id, side, periodTag: d.tag, kind: 'backdated', fileName: `${rel.vendorCode}_vendor_backdated_entries_${back[0].origin}.csv`, source: 'Vendor (supporting records)', availableAt: avail, opening: null, closing: null, rows: back.map((s, j) => line(s, j, '-BD')) });
        close[side] = closing;
      });
    });
  });
  return { files, truth };
}
export type { Frequency };
