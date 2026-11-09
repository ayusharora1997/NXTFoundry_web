import React, { useEffect, useRef, useState } from 'react';

// A looping, GIF-like walkthrough of the Vendor Payable Reconciliation tool, drawn in code so it stays sharp and light.
// Scenes: upload a vendor ledger → automatic reconciliation → statement → reviewer confirms a suggestion.
const LOOP = 14000;
const SCENES = [{ at: 0, label: 'Upload' }, { at: 2600, label: 'Reconcile' }, { at: 6600, label: 'Statement' }, { at: 10000, label: 'Review' }];
const STAGES = ['Contra · buyer', 'Contra · vendor', 'Invoices & DNs', 'Credit notes', 'Payments', 'TDS', 'Payment + TDS'];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export default function ToolPreview() {
  const [t, setT] = useState(9000);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return; // stays on the statement frame
    let raf = 0, start = performance.now() - 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); if (ref.current) io.observe(ref.current);
    const tick = (now: number) => { if (visible && !document.hidden) setT((now - start) % LOOP); raf = requestAnimationFrame(tick); };
    start = performance.now(); raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);
  const scene = SCENES.filter(s => t >= s.at).length - 1;

  // Cursor path (percent of the window body).
  let cx = 88, cy = 92, click = false, carry = false;
  if (scene === 0) { const k = ease((t - 200) / 1000); cx = lerp(88, 50, k); cy = lerp(92, 44, k); carry = t > 200 && t < 1250; click = t > 1150 && t < 1350; }
  else if (scene === 1 || scene === 2) { cx = 92; cy = 96; }
  else { const k = ease((t - 10200) / 1000); cx = lerp(92, 30, k); cy = lerp(96, 66, k); click = t > 11250 && t < 11450; }
  const confirmed = t > 11350;
  const matches = scene < 1 ? 0 : scene === 1 ? Math.round(27 * clamp((t - 3600) / 2600)) : confirmed ? 28 : 27;
  const open = confirmed ? 7 : 8;

  return <div className="tp" ref={ref} aria-label="Animated walkthrough of the reconciliation tool" role="img">
    <div className="tp-bar"><i /><i /><i /><span>{['Vendor ledger upload', 'Reconciling automatically', 'Reconciliation statement', 'Reviewing suggestions'][scene]} · Deccan Polymers · Sep 2026</span></div>
    <div className="tp-body">
      {scene === 0 && <div className="tp-scene">
        <div className="tp-pick"><span><small>Vendor</small>Deccan Polymers · Home Care</span><span><small>Period</small>M092026 · Sep 2026</span></div>
        <div className={'tp-drop' + (t > 1250 ? ' got' : '') + (carry && t > 900 ? ' over' : '')}>
          {t < 1250 ? <><b>Drop the vendor’s ledger here</b><small>CSV · one vendor, one period</small></> : <><b>DEC-1002_vendor_AR_M092026.csv</b><small>{t < 2300 ? 'Uploading…' : '9 lines · uploaded ✓'}</small><span className="tp-prog"><i style={{ width: `${clamp((t - 1300) / 1000) * 100}%` }} /></span></>}
        </div>
      </div>}
      {scene === 1 && <div className="tp-scene">
        <ul className="tp-steps">{[['Vendor ledger received', 2600], ['Buyer ledger fetched from ERP', 2900], ['Opening balances agree', 3300]].map(([l, at]) => <li key={l as string} className={t > (at as number) ? 'on' : ''}><b>✓</b>{l}</li>)}</ul>
        <div className="tp-stages">{STAGES.map((s, i) => <span key={s} className={t > 3600 + i * 360 ? 'on' : ''}><b>✓</b>{s}</span>)}</div>
        <div className="tp-count"><b>{matches}</b><span>matches closed automatically</span></div>
      </div>}
      {scene === 2 && <div className="tp-scene">
        <div className="tp-bridge">{[['Buyer closing', '₹13,31,000'], ['Vendor closing', '₹13,26,500'], ['Difference', '₹4,500']].map(([k, v], i) => <div key={k} className={(i === 2 ? 'k ' : '') + (t > 6700 + i * 300 ? 'on' : '')}><small>{k}</small><b>{v}</b></div>)}</div>
        <div className="tp-bars">{[[86, '', 0], [34, 'up', 1], [32, 'dn', 2], [84, 'end', 3]].map(([h, c, i]) => <i key={i as number} className={c as string} style={{ height: `${(h as number) * ease((t - 7600 - (i as number) * 220) / 600)}%` }} />)}</div>
        <div className={'tp-annex' + (t > 8800 ? ' on' : '')}><small>Open items by original period</small><span>M062026 <b>2</b></span><span className="cur">M092026 <b>6</b></span><em>Unexplained ₹0 ✓</em></div>
      </div>}
      {scene === 3 && <div className="tp-scene">
        <div className={'tp-cand' + (confirmed ? ' done' : '')}><header><b>Suggested match</b><span>85</span><small>Same amount · same date · numbers end in 123 · pattern seen before</small></header>
          <div className="tp-pair"><span><i>Buyer</i>DC-0123<b>+₹1,39,500</b></span><span><i>Vendor</i>DEC/26-27/0123<b>+₹1,39,500</b></span></div>
          <div className="tp-btns"><span className={'tp-confirm' + (click ? ' press' : '')}>{confirmed ? 'Confirmed ✓' : 'Confirm'}</span><span>Reject</span></div></div>
        {confirmed && t < 13600 && <div className="tp-toast">✓ Confirmed by reviewer · items closed</div>}
      </div>}
      <span className={'tp-cursor' + (click ? ' click' : '')} style={{ left: `${cx}%`, top: `${cy}%` }}>{carry && <em>CSV</em>}</span>
    </div>
    <div className="tp-foot"><span><b>{matches}</b> matches · <b>{scene >= 2 ? open : '—'}</b> open</span>
      <ol>{SCENES.map((s, i) => <li key={s.label} className={i === scene ? 'on' : i < scene ? 'done' : ''}>{s.label}</li>)}</ol></div>
  </div>;
}
