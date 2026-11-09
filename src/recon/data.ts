// Synthetic data generator for the Reconciliation Lab.
// Everything here is fictional: Meridian Consumer Products Pvt. Ltd., its suppliers,
// GSTIN-like IDs, documents and amounts. A fixed seed makes every run identical.
// Rows are produced as plain strings, the way they would arrive from a CSV or Excel export,
// so the normalization engine has real work to do.

export type Row = Record<string, string>;

export interface Dataset {
  key: 'ledger' | 'statement' | 'po' | 'grn' | 'payments';
  title: string;
  description: string;
  columns: string[];
  rows: Row[];
}

export interface Supplier {
  id: string; name: string; statementName: string; state: string; gstin: string;
  category: string; item: string; prefix: string; service: boolean; idOnStatement: boolean;
}

export interface SeededIssue { category: string; note: string; refs: string[] }

export interface LabData {
  company: string; periodStart: string; periodEnd: string; seed: number;
  suppliers: Supplier[]; aliases: { alias: string; vendorId: string }[];
  datasets: Dataset[]; seeded: SeededIssue[];
}

export const SEED = 20260630;
export const PERIOD_START = Date.UTC(2026, 3, 1);
export const PERIOD_END = Date.UTC(2026, 5, 30);
const DAY = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}
const isoSlash = (ms: number) => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const money = (n: number) => n.toFixed(2);
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUPPLIERS: Omit<Supplier, 'gstin'>[] = [
  { id: 'V001', name: 'Kaveri Packaging Private Limited', statementName: 'Kaveri Packaging Pvt. Ltd.', state: 'KA', category: 'Packaging', item: 'Corrugated shipper cartons', prefix: 'KPL/26-27/', service: false, idOnStatement: true },
  { id: 'V002', name: 'Deccan Polymers Limited', statementName: 'DECCAN POLYMERS LTD', state: 'TS', category: 'Raw materials', item: 'PET preforms', prefix: 'DPL-', service: false, idOnStatement: false },
  { id: 'V003', name: 'Sahyadri Agro Ingredients LLP', statementName: 'Sahyadri Agro Ingredients LLP', state: 'MH', category: 'Raw materials', item: 'Food-grade starch', prefix: 'SAI/', service: false, idOnStatement: true },
  { id: 'V004', name: 'Nandi Logistics Private Limited', statementName: 'Nandi Logistics Pvt Ltd', state: 'KA', category: 'Logistics', item: 'Primary freight (FTL)', prefix: 'NLP-FRT-', service: true, idOnStatement: true },
  { id: 'V005', name: 'Coromandel Chemicals Limited', statementName: 'Coromandel Chemicals Ltd.', state: 'TN', category: 'Chemicals', item: 'Surfactant blend', prefix: 'CCL', service: false, idOnStatement: true },
  { id: 'V006', name: 'Malnad Print Works', statementName: 'MALNAD PRINT WORKS', state: 'KA', category: 'Printing', item: 'Printed labels (roll)', prefix: 'MPW/INV/', service: false, idOnStatement: false },
  { id: 'V007', name: 'Arabian Sea Glass Private Limited', statementName: 'Arabian Sea Glass Pvt. Ltd.', state: 'GJ', category: 'Packaging', item: 'Amber glass bottles', prefix: 'ASG-', service: false, idOnStatement: true },
  { id: 'V008', name: 'Hampi Facility Services', statementName: 'Hampi Facility Services', state: 'KA', category: 'Services', item: 'Warehouse housekeeping', prefix: 'HFS/', service: true, idOnStatement: true },
  { id: 'V009', name: 'Vindhya Metal Closures Limited', statementName: 'Vindhya Metal Closures Ltd', state: 'MP', category: 'Packaging', item: 'Aluminium closures', prefix: 'VMC', service: false, idOnStatement: true },
  { id: 'V010', name: 'Konkan Spices & Extracts Private Limited', statementName: 'Konkan Spices and Extracts Pvt Ltd', state: 'GA', category: 'Raw materials', item: 'Spice oleoresins', prefix: 'KSE-', service: false, idOnStatement: true },
];
const STATE_CODE: Record<string, string> = { KA: '29', TS: '36', MH: '27', TN: '33', GJ: '24', MP: '23', GA: '30' };

interface Inv {
  vendor: Supplier; no: string; supNo: string; date: number; post: number; po: string; grn: string;
  qty: number; rate: number; taxable: number; gstRate: number; inBuyer: boolean; inSupplier: boolean;
  buyerTaxable?: number; buyerGstRate?: number; buyerVendor?: Supplier; buyerDate?: number; supDate?: number;
}

export function generate(seed = SEED): LabData {
  const rnd = mulberry32(seed);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const day = (ms: number) => Math.min(PERIOD_END, ms);

  const suppliers: Supplier[] = SUPPLIERS.map((s, i) => ({ ...s, gstin: `${STATE_CODE[s.state]}SYNTH${String(i + 1).padStart(4, '0')}Z9X` }));
  const seeded: SeededIssue[] = [];
  const pos: Row[] = [], grns: Row[] = [], payReg: Row[] = [];
  const invoices: Inv[] = [];
  let poN = 4100, grnN = 7300, txN = 1, supTxN = 1, payN = 900, utrN = 0;
  const utr = () => `SYNUTR26${String(48213 + (utrN++) * 37).padStart(7, '0')}`;

  // Purchase orders, goods receipts and the invoices that follow them.
  const poInfo: Record<string, { rate: number; approved: number; acceptedQty: number; grn: string }> = {};
  suppliers.forEach((v, vi) => {
    const nPo = 10;
    let invSeq = 31 + vi * 7;
    for (let k = 0; k < nPo; k++) {
      const poNo = `MCP/PO/${poN++}`;
      const poDate = PERIOD_START + int(0, 58) * DAY;
      const qty = v.service ? int(4, 12) : int(8, 60) * 50;
      const rate = v.service ? int(18, 65) * 1000 : int(12, 140) * 5;
      const total = qty * rate;
      const approved = total;
      const hasGrn = !(v.id === 'V009' && k === 6) && !(v.id === 'V003' && k === 9);
      const rejected = hasGrn && !v.service && rnd() < 0.12 ? Math.round(qty * pick([0.02, 0.04, 0.05])) : 0;
      const recvDate = poDate + int(4, 12) * DAY;
      const grnNo = hasGrn ? `GRN-${grnN++}` : '';
      pos.push({ 'PO Number': poNo, 'Vendor ID': v.id, 'PO Date': fmtDate(poDate), 'Item Description': v.item, 'Quantity Ordered': String(qty), 'Unit Price': money(rate), 'Total PO Amount': money(total), 'Approved Amount': money(approved), 'PO Status': hasGrn ? 'Closed' : 'Open', 'Approval Reference': `APR-${poNo.slice(-4)}-${pick(['FIN', 'PROC', 'COO'])}` });
      if (hasGrn) grns.push({ 'GRN Number': grnNo, 'PO Number': poNo, 'Vendor ID': v.id, 'Receipt Date': fmtDate(recvDate), 'Quantity Received': String(qty), 'Accepted Quantity': String(qty - rejected), 'Rejected Quantity': String(rejected), 'Receipt Value': money((qty - rejected) * rate), 'GRN Status': rejected ? 'Partially accepted' : 'Accepted' });
      poInfo[poNo] = { rate, approved, acceptedQty: qty - rejected, grn: grnNo };
      const invDate = day(recvDate + int(0, 3) * DAY);
      if (invDate > PERIOD_END) continue;
      const billQty = qty - rejected;
      const no = v.prefix + String(invSeq++).padStart(4, '0');
      invoices.push({ vendor: v, no, supNo: no, date: invDate, post: day(invDate + int(1, 4) * DAY), po: poNo, grn: grnNo, qty: billQty, rate, taxable: billQty * rate, gstRate: v.category === 'Raw materials' && v.id === 'V003' ? 12 : 18, inBuyer: true, inSupplier: true });
      if (rejected) invoices[invoices.length - 1].qty = billQty;
    }
    // A few extra non-PO service invoices for service vendors (normal, not an exception).
    if (v.service) for (let k = 0; k < 3; k++) {
      const d = PERIOD_START + int(5, 85) * DAY; const no = v.prefix + String(invSeq++).padStart(4, '0'); const amt = int(30, 90) * 1000;
      invoices.push({ vendor: v, no, supNo: no, date: d, post: day(d + int(1, 3) * DAY), po: '', grn: '', qty: 1, rate: amt, taxable: amt, gstRate: 18, inBuyer: true, inSupplier: true });
    }
  });
  invoices.sort((a, b) => a.date - b.date || a.no.localeCompare(b.no));
  const byNo = (no: string) => invoices.find(i => i.no === no)!;
  const ofVendor = (id: string, from = 0) => invoices.filter(i => i.vendor.id === id && i.po).slice(from);

  // ---- Seeded invoice-level exceptions ----
  // Supplier formats its own invoice numbers differently (normalization should clear these).
  ['V001', 'V005', 'V009', 'V010'].forEach(id => ofVendor(id, 1).slice(0, 4).forEach(i => {
    i.supNo = id === 'V001' ? i.no.replace(/\//g, '-') : id === 'V005' ? 'CCL/' + i.no.slice(3) : id === 'V009' ? i.no.replace(/VMC0*/, 'VMC-') : i.no.toLowerCase().replace('-', ' ');
  }));
  // 1. Buyer-only invoices (supplier has no record).
  [ofVendor('V003')[2], ofVendor('V007')[5]].forEach(i => { i.inSupplier = false; seeded.push({ category: 'Buyer-only invoice', note: 'Posted by buyer; supplier statement has no matching invoice', refs: [i.no] }); });
  // 2. Supplier-only invoices: two genuinely unposted, two timing (late June, in transit).
  [ofVendor('V002')[3], ofVendor('V006')[4]].forEach(i => { i.inBuyer = false; seeded.push({ category: 'Supplier-only invoice', note: 'Supplier invoice never posted by buyer', refs: [i.no] }); });
  suppliers.filter(v => ['V001', 'V010', 'V005'].includes(v.id)).forEach((v, k) => {
    const d = PERIOD_END - (k + 1) * DAY; const no = v.prefix + String(900 + k).padStart(4, '0'); const qty = 400; const rate = 85 + k * 20;
    invoices.push({ vendor: v, no, supNo: no, date: d, post: d, po: '', grn: '', qty, rate, taxable: qty * rate, gstRate: 18, inBuyer: false, inSupplier: true });
    seeded.push({ category: 'Timing difference', note: 'Invoice dated in the last days of June; goods in transit', refs: [no] });
  });
  // 3. Amount mismatch (transposed digits / wrong quantity keyed).
  [ofVendor('V001')[6], ofVendor('V007')[2], ofVendor('V010')[6], ofVendor('V005')[7]].forEach((i, k) => {
    i.buyerTaxable = k === 0 ? i.taxable + 9000 : k === 1 ? Math.round(i.taxable * 0.9) : k === 2 ? i.taxable - 4500 : i.taxable + 270;
    seeded.push({ category: 'Amount mismatch', note: 'Buyer keyed a different taxable value', refs: [i.no] });
  });
  // 4. Tax mismatch: buyer applied 12% instead of 18%.
  [ofVendor('V002')[6], ofVendor('V009')[3], ofVendor('V006')[1]].forEach(i => { i.buyerGstRate = 12; seeded.push({ category: 'Tax mismatch', note: 'Buyer applied 12% GST; supplier billed 18%', refs: [i.no] }); });
  // 17. Posted to the wrong vendor in the buyer ledger.
  [ofVendor('V005')[4], ofVendor('V001')[8]].forEach(i => { i.buyerVendor = suppliers.find(s => s.id === (i.vendor.id === 'V005' ? 'V003' : 'V007'))!; seeded.push({ category: 'Incorrect vendor allocation', note: `Posted against ${i.buyerVendor.id} instead of ${i.vendor.id}`, refs: [i.no] }); });
  // 18. Date / period mismatch (same reference, dates far apart).
  [ofVendor('V009')[7], ofVendor('V010')[8], ofVendor('V007')[7]].forEach(i => { i.buyerDate = i.date + 34 * DAY; seeded.push({ category: 'Date or period mismatch', note: 'Buyer posted with a date a month after the supplier invoice', refs: [i.no] }); });
  // Level 3 candidates: buyer keyed the supplier's delivery challan number instead of the invoice number.
  const probable = [ofVendor('V006')[6], ofVendor('V009')[8], ofVendor('V003')[5]];
  probable.forEach(i => seeded.push({ category: 'Probable match', note: 'Buyer recorded the delivery challan number; amount and date agree', refs: [i.no] }));
  // Level 4: PO and GRN validation.
  const priceHike = [ofVendor('V005')[1], ofVendor('V010')[3], ofVendor('V007')[4]];
  priceHike.forEach(i => { i.rate = Math.round(i.rate * 1.06); i.taxable = i.qty * i.rate; seeded.push({ category: 'Price mismatch', note: 'Billed rate 6% above PO price', refs: [i.no, i.po] }); });
  const qtyOver = [ofVendor('V001')[3], ofVendor('V009')[5]];
  qtyOver.forEach(i => { i.qty = i.qty + 120; i.taxable = i.qty * i.rate; seeded.push({ category: 'Quantity mismatch', note: 'Invoice quantity above accepted GRN quantity', refs: [i.no, i.grn] }); });
  const noPo = [ofVendor('V002')[8], ofVendor('V006')[8]];
  noPo.forEach(i => { i.po = ''; i.grn = ''; seeded.push({ category: 'Purchase order variance', note: 'Goods invoice with no PO reference', refs: [i.no] }); });
  invoices.filter(i => i.po && !poInfo[i.po].grn).forEach(i => { i.grn = ''; seeded.push({ category: 'Goods receipt discrepancy', note: 'Invoice against a PO with no goods receipt', refs: [i.no, i.po] }); });

  // ---- Credit notes (supplier-issued) and debit notes (buyer-raised) ----
  interface Note { vendor: Supplier; no: string; date: number; amount: number; inBuyer: boolean; inSupplier: boolean; against: string; reason: string }
  const cns: Note[] = [], dns: Note[] = [];
  let cnSeq = 11, dnSeq = 51;
  for (let k = 0; k < 15; k++) {
    const v = suppliers[k % 10]; const base = pick(invoices.filter(i => i.vendor.id === v.id));
    cns.push({ vendor: v, no: `CN-${v.id.slice(-2)}-${cnSeq++}`, date: day(base.date + int(5, 25) * DAY), amount: int(3, 40) * 500, inBuyer: true, inSupplier: true, against: base.no, reason: pick(['Rate difference', 'Volume discount', 'Damaged goods credit', 'Freight reimbursement']) });
  }
  cns[2].inBuyer = false; cns[7].inBuyer = false; cns[12].inBuyer = false;
  [cns[2], cns[7], cns[12]].forEach(c => seeded.push({ category: 'Credit note missing in buyer ledger', note: 'Supplier issued credit; buyer has not recorded it', refs: [c.no] }));
  cns[5].inSupplier = false; cns[10].inSupplier = false;
  [cns[5], cns[10]].forEach(c => seeded.push({ category: 'Credit note missing in supplier statement', note: 'Buyer booked an expected credit the supplier has not issued', refs: [c.no] }));
  for (let k = 0; k < 12; k++) {
    const v = suppliers[(k * 3) % 10]; const base = pick(invoices.filter(i => i.vendor.id === v.id));
    dns.push({ vendor: v, no: `MCP/DN/${dnSeq++}`, date: day(base.date + int(3, 15) * DAY), amount: int(2, 30) * 500, inBuyer: true, inSupplier: true, against: base.no, reason: pick(['Short supply', 'Quality rejection', 'Late delivery penalty', 'Price difference']) });
  }
  dns[1].inSupplier = false; dns[6].inSupplier = false; dns[9].inSupplier = false;
  [dns[1], dns[6], dns[9]].forEach(d => seeded.push({ category: 'Debit note discrepancy', note: 'Buyer debit note not accepted by supplier', refs: [d.no] }));

  // ---- Payments ----
  interface Pay { vendor: Supplier; ref: string; utr: string; date: number; amount: number; inv: string; inBuyer: boolean; inSupplier: boolean; inRegister: boolean; supDesc?: string; supVendor?: Supplier; onAccount?: boolean }
  const pays: Pay[] = [];
  const payable = invoices.filter(i => i.inBuyer && i.inSupplier && !i.buyerVendor && !i.buyerTaxable && !i.buyerGstRate && i.date < PERIOD_END - 40 * DAY);
  const chosen: Inv[] = [];
  suppliers.forEach(v => chosen.push(...payable.filter(i => i.vendor.id === v.id).slice(0, 3)));
  chosen.slice(0, 30).forEach((i, k) => {
    const gross = Math.round(i.taxable * (1 + i.gstRate / 100));
    const partial = k === 4 || k === 13 || k === 22;
    pays.push({ vendor: i.vendor, ref: `MCP/PAY/${payN++}`, utr: utr(), date: day(i.date + int(30, 45) * DAY), amount: partial ? Math.round(gross * 0.6) : gross, inv: i.no, inBuyer: true, inSupplier: true, inRegister: true });
    if (partial) seeded.push({ category: 'Partial payment', note: '60% of the invoice paid; balance outstanding on both sides', refs: [i.no] });
  });
  // Duplicate payment: same invoice paid twice; supplier holds the second amount on account.
  [pays[1], pays[17]].forEach(p => {
    const d: Pay = { ...p, ref: `MCP/PAY/${payN++}`, utr: utr(), date: day(p.date + 6 * DAY), onAccount: true };
    pays.push(d); seeded.push({ category: 'Duplicate payment', note: 'Same invoice paid twice from the payment run', refs: [p.inv, p.ref, d.ref] });
  });
  // Payments in transit at period end (timing) and one never received by supplier.
  const unpaid = payable.filter(x => !chosen.includes(x));
  const grossOf = (i: Inv) => Math.round(i.taxable * (1 + i.gstRate / 100));
  [unpaid[3], unpaid[9]].forEach(i => { const p: Pay = { vendor: i.vendor, ref: `MCP/PAY/${payN++}`, utr: utr(), date: PERIOD_END - DAY, amount: grossOf(i), inv: i.no, inBuyer: true, inSupplier: false, inRegister: true }; pays.push(p); seeded.push({ category: 'Timing difference', note: 'Payment released on 29-Jun; supplier credits it in July', refs: [p.ref] }); });
  { const i = unpaid[14]; const p: Pay = { vendor: i.vendor, ref: `MCP/PAY/${payN++}`, utr: utr(), date: PERIOD_END - 25 * DAY, amount: grossOf(i), inv: i.no, inBuyer: true, inSupplier: false, inRegister: true }; pays.push(p); seeded.push({ category: 'Payment recorded by buyer but not supplier', note: 'Payment out of the bank but not credited by supplier', refs: [p.ref] }); }
  // Supplier shows a receipt the buyer ledger does not have (paid by a group company).
  { const v = suppliers[3]; const p: Pay = { vendor: v, ref: '', utr: utr(), date: PERIOD_START + 40 * DAY, amount: 42000, inv: '', inBuyer: false, inSupplier: true, inRegister: false }; pays.push(p); seeded.push({ category: 'Payment recorded by supplier but not buyer', note: 'Receipt on supplier statement with no buyer posting', refs: [p.utr] }); }
  // Unallocated on-account receipt.
  { const v = suppliers[7]; const p: Pay = { vendor: v, ref: `MCP/PAY/${payN++}`, utr: utr(), date: PERIOD_START + 55 * DAY, amount: 30000, inv: '', inBuyer: true, inSupplier: true, inRegister: true, onAccount: true }; pays.push(p); seeded.push({ category: 'Unallocated payment', note: 'Advance paid without invoice reference; supplier holds it on account', refs: [p.ref] }); }

  // ---- Opening balances (agreed at 01-Apr-2026) ----
  const opening = suppliers.map(v => ({ v, amt: int(12, 60) * 10000 }));

  // ---- Build the five datasets ----
  const ledger: Row[] = [], statement: Row[] = [];
  const L = (o: Partial<Row>) => { const r: Row = { 'Transaction ID': `AP-${String(txN++).padStart(5, '0')}`, 'Vendor ID': '', 'Vendor Name': '', 'Invoice Number': '', 'Invoice Date': '', 'Posting Date': '', 'Purchase Order Number': '', 'Goods Receipt Number': '', 'Quantity': '', 'Unit Rate': '', 'Gross Invoice Amount': '', 'Taxable Amount': '', 'CGST': '', 'SGST': '', 'IGST': '', 'TDS': '0.00', 'Debit/Credit': '', 'Transaction Type': '', 'Payment Reference': '', 'Payment Date': '', 'Outstanding Amount': '', 'Currency': 'INR', 'Description': '' }; Object.assign(r, o); ledger.push(r); return r; };
  const S = (v: Supplier, o: Partial<Row>) => { const r: Row = { 'Supplier Transaction ID': `${v.id}-ST-${String(supTxN++).padStart(4, '0')}`, 'Vendor ID': v.idOnStatement ? v.id : '', 'Supplier Name': v.statementName, 'Document Type': '', 'Supplier Invoice Number': '', 'Invoice Date': '', 'Statement Date': fmtDate(PERIOD_END), 'Purchase Order Reference': '', 'Invoice Amount': '', 'Taxable Amount': '', 'Tax Amount': '', 'Credit Note Reference': '', 'Debit Note Reference': '', 'Payment Received': '', 'Outstanding Balance': '', 'Currency': 'INR', 'Description': '' }; Object.assign(r, o); statement.push(r); return r; };
  const tax = (v: Supplier, taxable: number, rate: number) => { const t = Math.round(taxable * rate) / 100; return v.state === 'KA' ? { cgst: t / 2, sgst: t / 2, igst: 0, total: t } : { cgst: 0, sgst: 0, igst: t, total: t }; };

  opening.forEach(({ v, amt }) => {
    L({ 'Vendor ID': v.id, 'Vendor Name': v.name, 'Invoice Number': 'OB-FY27', 'Invoice Date': fmtDate(PERIOD_START), 'Posting Date': fmtDate(PERIOD_START), 'Gross Invoice Amount': money(amt), 'Debit/Credit': 'Cr', 'Transaction Type': 'Opening Balance', 'Outstanding Amount': money(amt), 'Description': 'Opening balance agreed with supplier at 31-Mar-2026' });
    S(v, { 'Document Type': 'Opening Balance', 'Supplier Invoice Number': 'OB-FY27', 'Invoice Date': fmtDate(PERIOD_START), 'Invoice Amount': money(amt), 'Outstanding Balance': money(amt), 'Description': 'Balance brought forward' });
  });

  const dupBuyer = [ofVendor('V004', 0)[0], ofVendor('V008', 0)[0], ofVendor('V002')[5]].filter(Boolean);
  dupBuyer.forEach(i => seeded.push({ category: 'Duplicate invoice', note: 'Same supplier invoice posted twice in the buyer ledger', refs: [i.no] }));

  invoices.forEach(i => {
    const gross = Math.round((i.taxable + tax(i.vendor, i.taxable, i.gstRate).total) * 100) / 100;
    if (i.inBuyer) {
      const bv = i.buyerVendor ?? i.vendor; const bt = i.buyerTaxable ?? i.taxable; const bTax = tax(i.vendor, bt, i.buyerGstRate ?? i.gstRate); const bGross = Math.round((bt + bTax.total) * 100) / 100;
      const isProbable = probable.includes(i);
      const row = { 'Vendor ID': bv.id, 'Vendor Name': bv.name, 'Invoice Number': isProbable ? `DC-${i.no.replace(/\D/g, '').slice(-4)}` : i.no, 'Invoice Date': fmtDate(i.buyerDate ?? i.date), 'Posting Date': fmtDate(i.buyerDate ? i.buyerDate + DAY : i.post), 'Purchase Order Number': i.po, 'Goods Receipt Number': i.grn, 'Quantity': String(i.qty), 'Unit Rate': money(i.rate), 'Gross Invoice Amount': money(bGross), 'Taxable Amount': money(bt), 'CGST': money(bTax.cgst), 'SGST': money(bTax.sgst), 'IGST': money(bTax.igst), 'Debit/Credit': 'Cr', 'Transaction Type': 'Invoice', 'Outstanding Amount': money(bGross), 'Description': `${i.vendor.item}${i.po ? '' : ' (non-PO)'}` };
      L(row);
      if (dupBuyer.includes(i)) L({ ...row, 'Invoice Number': i.no.toLowerCase().replace(/\//g, ' / '), 'Posting Date': fmtDate(day(i.post + 9 * DAY)), 'Description': row['Description'] + ' — re-entered from emailed copy' });
    }
    if (i.inSupplier) {
      const t = tax(i.vendor, i.taxable, i.gstRate);
      S(i.vendor, { 'Document Type': 'Invoice', 'Supplier Invoice Number': i.supNo, 'Invoice Date': fmtDate(i.supDate ?? i.date), 'Purchase Order Reference': i.po, 'Invoice Amount': money(gross), 'Taxable Amount': money(i.taxable), 'Tax Amount': money(t.total), 'Outstanding Balance': money(gross), 'Description': i.vendor.item });
    }
  });
  cns.forEach(c => {
    if (c.inBuyer) L({ 'Vendor ID': c.vendor.id, 'Vendor Name': c.vendor.name, 'Invoice Number': c.no, 'Invoice Date': fmtDate(c.date), 'Posting Date': fmtDate(day(c.date + 2 * DAY)), 'Gross Invoice Amount': money(c.amount), 'Debit/Credit': 'Dr', 'Transaction Type': 'Credit Note', 'Description': `${c.reason} against ${c.against}` });
    if (c.inSupplier) S(c.vendor, { 'Document Type': 'Credit Note', 'Credit Note Reference': c.no, 'Invoice Date': fmtDate(c.date), 'Payment Received': money(c.amount), 'Description': `${c.reason} against ${c.against}` });
  });
  dns.forEach(d => {
    if (d.inBuyer) L({ 'Vendor ID': d.vendor.id, 'Vendor Name': d.vendor.name, 'Invoice Number': d.no, 'Invoice Date': fmtDate(d.date), 'Posting Date': fmtDate(d.date), 'Gross Invoice Amount': money(d.amount), 'Debit/Credit': 'Dr', 'Transaction Type': 'Debit Note', 'Description': `${d.reason} on ${d.against}` });
    if (d.inSupplier) S(d.vendor, { 'Document Type': 'Debit Note', 'Debit Note Reference': d.no, 'Invoice Date': fmtDate(day(d.date + 3 * DAY)), 'Payment Received': money(d.amount), 'Description': `Buyer debit note accepted (${d.reason.toLowerCase()})` });
  });
  pays.sort((a, b) => a.date - b.date).forEach(p => {
    if (p.inRegister) payReg.push({ 'Payment Reference': p.ref, 'Vendor ID': p.vendor.id, 'Payment Date': fmtDate(p.date), 'Invoice Reference': p.inv, 'Payment Amount': money(p.amount), 'Bank Reference': p.utr, 'Payment Status': 'Cleared', 'Payment Mode': p.amount >= 200000 ? 'RTGS' : 'NEFT' });
    if (p.inBuyer) L({ 'Vendor ID': p.vendor.id, 'Vendor Name': p.vendor.name, 'Invoice Number': p.inv, 'Gross Invoice Amount': money(p.amount), 'Debit/Credit': 'Dr', 'Transaction Type': 'Payment', 'Payment Reference': p.ref, 'Payment Date': fmtDate(p.date), 'Posting Date': fmtDate(p.date), 'Description': `Payment ${p.utr}${p.inv ? '' : ' — advance, no invoice'}` });
    if (p.inSupplier) S(p.supVendor ?? p.vendor, { 'Document Type': p.onAccount ? 'On-account Receipt' : 'Receipt', 'Invoice Date': fmtDate(day(p.date + DAY)), 'Payment Received': money(p.amount), 'Description': `${p.onAccount ? 'Unallocated receipt' : p.inv ? 'Receipt against ' + p.inv : 'Receipt, remitter not identified'} UTR ${p.utr}` });
  });

  // ---- Import noise the normalization engine should catch ----
  // Mixed date and amount formats from a supplier's spreadsheet export.
  statement.filter(r => r['Vendor ID'] === 'V007' || r['Supplier Name'] === 'MALNAD PRINT WORKS').forEach((r, k) => {
    const ms = parseD(r['Invoice Date']);
    if (k % 3 === 0) r['Invoice Date'] = iso(ms); else if (k % 3 === 1) r['Invoice Date'] = isoSlash(ms);
    if (r['Invoice Amount'] && k % 2 === 0) r['Invoice Amount'] = inr(Number(r['Invoice Amount']));
  });
  statement.filter(r => r['Supplier Name'].startsWith('Konkan')).slice(0, 4).forEach(r => { r['Supplier Name'] = '  ' + r['Supplier Name'] + ' '; });
  // Rows that must be rejected or flagged as duplicates.
  const firstKav = statement.find(r => r['Vendor ID'] === 'V001' && r['Document Type'] === 'Invoice')!;
  statement.push({ ...firstKav });
  seeded.push({ category: 'Data quality', note: 'Duplicate row in supplier statement export', refs: [firstKav['Supplier Transaction ID']] });
  statement.push({ ...firstKav, 'Supplier Transaction ID': 'V001-ST-9001', 'Supplier Invoice Number': 'KPL/26-27/0999', 'Invoice Date': '31-Jun-2026', 'Description': 'Row with an impossible date' });
  statement.push({ ...firstKav, 'Supplier Transaction ID': 'V001-ST-9002', 'Supplier Invoice Number': '', 'Invoice Amount': 'TBC', 'Description': 'Row with no invoice number or amount' });
  seeded.push({ category: 'Data quality', note: 'Rows with an invalid date, missing invoice number, or non-numeric amount', refs: ['V001-ST-9001', 'V001-ST-9002'] });

  const aliases = suppliers.flatMap(v => [{ alias: v.statementName, vendorId: v.id }, { alias: v.name, vendorId: v.id }]);

  const cols = (rows: Row[]) => Object.keys(rows[0]);
  return {
    company: 'Meridian Consumer Products Pvt. Ltd.', periodStart: fmtDate(PERIOD_START), periodEnd: fmtDate(PERIOD_END), seed,
    suppliers, aliases, seeded,
    datasets: [
      { key: 'ledger', title: 'Buyer AP ledger', description: 'Meridian\'s accounts payable postings: opening balances, invoices, credit notes, debit notes and payments.', columns: cols(ledger), rows: ledger },
      { key: 'statement', title: 'Supplier statements', description: 'Statements of account received from each supplier, as exported from their systems.', columns: cols(statement), rows: statement },
      { key: 'po', title: 'Purchase orders', description: 'Approved purchase orders raised by Meridian.', columns: cols(pos), rows: pos },
      { key: 'grn', title: 'Goods receipts', description: 'Goods received notes with accepted and rejected quantities.', columns: cols(grns), rows: grns },
      { key: 'payments', title: 'Payment register', description: 'Payments released from Meridian\'s bank, with UTR references.', columns: cols(payReg), rows: payReg },
    ],
  };
}

function parseD(s: string): number {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
  return m ? Date.UTC(+m[3], MON.indexOf(m[2]), +m[1]) : 0;
}
