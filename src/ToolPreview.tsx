import React, { useEffect, useRef, useState } from 'react';

// Looping, GIF-like walkthroughs of the reconciliation products, drawn in code so they stay sharp and light.
// Vendor and customer reconciliation share one engine, so they share one animation with the ledgers flipped.
// Scenes: upload a ledger → automatic reconciliation → statement → reviewer confirms a suggestion.
const LOOP = 14000;
const SCENES = [{ at: 0, label: 'Upload' }, { at: 2600, label: 'Reconcile' }, { at: 6600, label: 'Statement' }, { at: 10000, label: 'Review' }];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const COPY = {
  vendor: {
    party: 'Deccan Polymers', role: 'Vendor', unit: 'Home Care', file: 'DEC-1002_vendor_ledger_Sep2026.csv', drop: 'Drop the vendor’s ledger here',
    bars: ['Vendor ledger upload', 'Reconciling automatically', 'Reconciliation statement', 'Unreconciled · suggested match'],
    steps: ['Vendor ledger read · 8 columns mapped by AI', 'Buyer ledger fetched from ERP', 'Vendor opening = previous closing ✓'],
    close: ['Closing balance as per buyer', 'Closing balance as per vendor'], annex: ['Invoices not accounted by buyer', 'Invoices not accounted by vendor'],
    stages: ['Contra · buyer', 'Contra · vendor', 'Invoices & DNs', 'Credit notes', 'Payments', 'TDS', 'Payment + TDS'],
    bridge: ['Buyer closing', 'Vendor closing'], pair: [['Buyer', 'DC-0123'], ['Vendor', 'DEC/26-27/0123']],
  },
  customer: {
    party: 'Arcadia Retail', role: 'Customer', unit: 'Modern Trade', file: 'ARC-2001_customer_ledger_Sep2026.xlsx', drop: 'Drop the customer’s ledger here',
    bars: ['Customer ledger upload', 'Reconciling automatically', 'Reconciliation statement', 'Unreconciled · suggested match'],
    steps: ['Customer ledger read · 8 columns mapped by AI', 'Your receivables fetched from ERP', 'Customer opening = previous closing ✓'],
    close: ['Closing balance as per you', 'Closing balance as per customer'], annex: ['Invoices not accounted by you', 'Invoices not accounted by customer'],
    stages: ['Contra · yours', 'Contra · customer', 'Invoices & DNs', 'Credit notes', 'Receipts', 'TDS', 'Receipt + TDS'],
    bridge: ['Your closing', 'Customer closing'], pair: [['You', 'INV/26-27/0123'], ['Customer', 'GRN-0123']],
  },
};

function useLoop(ref: React.RefObject<HTMLElement | null>, loop: number, still: number) {
  const [t, setT] = useState(still);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return; // stays on a still frame
    let raf = 0, start = performance.now(), visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); if (ref.current) io.observe(ref.current);
    const tick = (now: number) => { if (visible && !document.hidden) setT((now - start) % loop); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [loop, ref]);
  return t;
}

export default function ToolPreview({ mode = 'vendor' }: { mode?: 'vendor' | 'customer' }) {
  const L = COPY[mode];
  const ref = useRef<HTMLDivElement>(null);
  const t = useLoop(ref, LOOP, 9000);
  const scene = SCENES.filter(s => t >= s.at).length - 1;

  // Cursor path (percent of the window body).
  let cx = 88, cy = 92, click = false, carry = false;
  if (scene === 0) { const k = ease((t - 200) / 1000); cx = lerp(88, 50, k); cy = lerp(92, 44, k); carry = t > 200 && t < 1250; click = t > 1150 && t < 1350; }
  else if (scene === 1 || scene === 2) { cx = 92; cy = 96; }
  else { const k = ease((t - 10200) / 1000); cx = lerp(92, 30, k); cy = lerp(96, 66, k); click = t > 11250 && t < 11450; }
  const confirmed = t > 11350;
  const matches = scene < 1 ? 0 : scene === 1 ? Math.round(27 * clamp((t - 3600) / 2600)) : confirmed ? 28 : 27;
  const open = confirmed ? 7 : 8;

  return <div className={'tp tp-' + mode} ref={ref} aria-label={`Animated walkthrough of ${mode} reconciliation`} role="img">
    <div className="tp-bar"><i /><i /><i /><span>{L.bars[scene]} · {L.party} · Sep 2026</span></div>
    <div className="tp-body">
      {scene === 0 && <div className="tp-scene">
        <div className="tp-pick"><span><small>{L.role}</small>{L.party} · {L.unit}</span><span><small>Period</small>September 2026</span></div>
        <div className={'tp-drop' + (t > 1250 ? ' got' : '') + (carry && t > 900 ? ' over' : '')}>
          {t < 1250 ? <><b>{L.drop}</b><small>Any layout · the AI reads it</small></> : <><b>{L.file}</b><small>{t < 2300 ? 'AI reading the layout · mapping columns…' : '9 lines · opening and closing read ✓'}</small><span className="tp-prog"><i style={{ width: `${clamp((t - 1300) / 1000) * 100}%` }} /></span></>}
        </div>
      </div>}
      {scene === 1 && <div className="tp-scene">
        <ul className="tp-steps">{L.steps.map((l, i) => <li key={l} className={t > [2600, 2900, 3300][i] ? 'on' : ''}><b>✓</b>{l}</li>)}</ul>
        <div className="tp-stages">{L.stages.map((s, i) => <span key={s} className={t > 3600 + i * 360 ? 'on' : ''}><b>✓</b>{s}</span>)}</div>
        <div className="tp-count"><b>{matches}</b><span>matches closed automatically</span></div>
      </div>}
      {scene === 2 && <div className="tp-scene">
        <ul className="tp-br">{([[L.close[0], '₹13,31,000', 'k'], [`Annexure 2 · ${L.annex[0]}`, '+₹2,61,000', ''], [`Annexure 4 · ${L.annex[1]}`, '−₹2,65,500', ''], [L.close[1], '₹13,26,500 ✓', 'k end']] as const).map(([k, v, c], i) => <li key={k} className={c + (t > 6800 + i * 550 ? ' on' : '')}><span>{k}</span><b>{v}</b></li>)}</ul>
        <div className={'tp-annex' + (t > 9000 ? ' on' : '')}><small>Sum of annexures = difference in closing balances</small><span className="cur">−₹4,500 = −₹4,500</span><em>Unexplained ₹0 ✓</em></div>
      </div>}
      {scene === 3 && <div className="tp-scene">
        <div className={'tp-cand' + (confirmed ? ' done' : '')}><header><b>Suggested match</b><span>85</span><small>Same amount · same date · numbers end in 123 · pattern seen before</small></header>
          <div className="tp-pair">{L.pair.map(([who, doc]) => <span key={who}><i>{who}</i>{doc}<b>+₹1,39,500</b></span>)}</div>
          <div className="tp-btns"><span className={'tp-confirm' + (click ? ' press' : '')}>{confirmed ? 'Confirmed ✓' : 'Confirm'}</span><span>Reject</span></div></div>
        {confirmed && t < 12600 && <div className="tp-toast">✓ Confirmed · moved to Reconciled as a suggested match</div>}
        {t >= 12600 && <div className="tp-toast sign">✓ Statement shared · {L.party} signed off</div>}
      </div>}
      <span className={'tp-cursor' + (click ? ' click' : '')} style={{ left: `${cx}%`, top: `${cy}%` }}>{carry && <em>{mode === 'customer' ? 'XLSX' : 'CSV'}</em>}</span>
    </div>
    <div className="tp-foot"><span><b>{matches}</b> matches · <b>{scene >= 2 ? open : '—'}</b> open</span>
      <ol>{SCENES.map((s, i) => <li key={s.label} className={i === scene ? 'on' : i < scene ? 'done' : ''}>{s.label}</li>)}</ol></div>
  </div>;
}

// GSTR reconciliation: books against the GST returns, row by row. A short loop that ticks invoices off against GSTR-2B.
const GST_ROWS: [string, string, string, 'ok' | 'miss' | 'diff' | 'late'][] = [
  ['KAV/0485', '₹1,18,000', '₹1,18,000', 'ok'],
  ['DEC/0123', '₹1,39,500', '—', 'miss'],
  ['NAN/2207', '₹63,720', '₹63,270', 'diff'],
  ['COR/0911', '₹2,36,000', '₹2,36,000', 'ok'],
  ['SAH/0344', '₹88,500', 'Oct return', 'late'],
  ['KON/0021', '₹47,200', '₹47,200', 'ok'],
];
const GST_LABEL = { ok: 'Matched', miss: 'Not in 2B · ITC at risk', diff: 'Value mismatch', late: 'Filed late by supplier' };
const GST_LOOP = 9000;
export function GstrPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const t = useLoop(ref, GST_LOOP, 7000);
  const shown = Math.min(GST_ROWS.length, Math.floor((t - 600) / 750) + 1);
  const ok = GST_ROWS.slice(0, Math.max(0, shown)).filter(r => r[3] === 'ok').length;
  return <div className="tp tp-gst" ref={ref} role="img" aria-label="Animated preview of GSTR reconciliation">
    <div className="tp-bar"><i /><i /><i /><span>Purchase register vs GSTR-2B · Sep 2026</span></div>
    <div className="tp-body gst-body">
      <div className="gst-head"><span>Invoice</span><span>Books</span><span>GSTR-2B</span><span>Result</span></div>
      {GST_ROWS.map((r, i) => <div key={r[0]} className={'gst-row' + (i < shown ? ' on ' + r[3] : '')}><b>{r[0]}</b><span>{r[1]}</span><span>{r[2]}</span><em>{i < shown ? GST_LABEL[r[3]] : '…'}</em></div>)}
    </div>
    <div className="tp-foot"><span><b>{ok}</b> of {GST_ROWS.length} matched · <b>{Math.max(0, shown) - ok}</b> to chase</span><ol><li className="on">GSTR-2B</li><li>GSTR-1</li></ol></div>
  </div>;
}

// Invoice reading: a scan line passes over an invoice, fields are lifted out, then checked against PO, GRN and the ledger.
const INV_FIELDS: [string, string][] = [['Supplier GSTIN', '29SYNTH1001K1Z'], ['Invoice no.', 'KAV/26-27/0485'], ['Invoice date', '18-Sep-2026'], ['Taxable value', '₹1,00,000'], ['GST @ 18%', '₹18,000'], ['Total', '₹1,18,000']];
const INV_CHECKS: [string, string, boolean][] = [['Purchase order', 'PO-7731 · rate agrees', true], ['Goods receipt', 'GRN-2210 · qty agrees', true], ['Ledger', 'Booked · ₹1,18,000', true], ['GSTR-2B', 'Not filed yet', false]];
const INV_LOOP = 10000;
export function InvoicePreview() {
  const ref = useRef<HTMLDivElement>(null);
  const t = useLoop(ref, INV_LOOP, 8000);
  const scan = clamp((t - 300) / 3000); const got = Math.min(INV_FIELDS.length, Math.floor(scan * INV_FIELDS.length + 0.001) + (t > 3300 ? 1 : 0));
  const checks = Math.max(0, Math.min(INV_CHECKS.length, Math.floor((t - 4200) / 700) + 1));
  return <div className="tp tp-inv" ref={ref} role="img" aria-label="Animated preview of invoice reading and reconciliation">
    <div className="tp-bar"><i /><i /><i /><span>Invoice inbox · KAV-0485.pdf · Sep 2026</span></div>
    <div className="tp-body inv-body">
      <div className="inv-doc"><div className="inv-scan" style={{ top: `${scan * 92}%`, opacity: t < 3400 ? 1 : 0 }} /><b>TAX INVOICE</b><small>Kaveri Packaging Pvt Ltd</small>
        {INV_FIELDS.map(([k, v], i) => <div key={k} className={'inv-line' + (i < got ? ' hit' : '')}><span>{k}</span><span>{v}</span></div>)}</div>
      <div className="inv-out"><small>Read by AI · {got} of {INV_FIELDS.length} fields</small>
        {INV_CHECKS.map(([k, v, ok], i) => <div key={k} className={'inv-chk' + (i < checks ? (ok ? ' on ok' : ' on warn') : '')}><b>{i < checks ? (ok ? '✓' : '!') : '·'}</b><span>{k}<small>{i < checks ? v : 'waiting…'}</small></span></div>)}</div>
    </div>
    <div className="tp-foot"><span><b>{got}</b> fields read · <b>{INV_CHECKS.slice(0, checks).filter(c => c[2]).length}</b> checks passed</span><ol><li className={t < 4200 ? 'on' : 'done'}>Read</li><li className={t >= 4200 ? 'on' : ''}>Reconcile</li></ol></div>
  </div>;
}
