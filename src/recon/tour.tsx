import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// A short, optional guided tour. Each step spotlights one part of the screen and explains it.
// Steps whose target is not on screen are skipped. Starts once by itself (remembered per tour), can be skipped at any
// time, and can be restarted from the screen's Help button.
export interface TourStep { target: string; title: string; body: React.ReactNode }

const seenKey = (id: string) => `nxt-tour-${id}`;
const wasSeen = (id: string) => { try { return localStorage.getItem(seenKey(id)) === '1'; } catch { return false; } };
const markSeen = (id: string) => { try { localStorage.setItem(seenKey(id), '1'); } catch { /* remembering is optional */ } };

/** Returns [open, start, close]. Opens once by itself on first visit. */
export function useTour(id: string, autoStart = true): [boolean, () => void, () => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!autoStart || wasSeen(id)) return; const t = setTimeout(() => setOpen(true), 700); return () => clearTimeout(t); }, [id]);
  return [open, () => setOpen(true), () => { markSeen(id); setOpen(false); }];
}

export function Tour({ steps, onClose, onSkip }: { steps: TourStep[]; onClose: () => void; onSkip?: () => void }) {
  const live = steps.filter(s => document.querySelector(s.target));
  const [i, setI] = useState(0); const [rect, setRect] = useState<DOMRect | null>(null);
  const pop = useRef<HTMLDivElement>(null); const next = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -999, left: -999 });
  const step = live[Math.min(i, live.length - 1)];
  const el = () => step ? document.querySelector(step.target) as HTMLElement | null : null;

  // Bring the target into view, then follow it while the page scrolls or resizes.
  useEffect(() => {
    const t = el(); if (!t) return; const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    // Tall areas line up just under the sticky header; smaller ones are centred.
    const head = (document.querySelector('.rx-top') as HTMLElement | null)?.getBoundingClientRect().bottom ?? 0; const r = t.getBoundingClientRect();
    if (r.height > (window.innerHeight - head) * 0.6) window.scrollTo({ top: r.top + window.scrollY - head - 16, behavior }); else t.scrollIntoView({ block: 'center', behavior });
    const measure = () => { const e = el(); if (e) setRect(e.getBoundingClientRect()); };
    measure(); const id = setInterval(measure, 120); setTimeout(() => clearInterval(id), 900);
    window.addEventListener('scroll', measure, true); window.addEventListener('resize', measure);
    next.current?.focus();
    return () => { clearInterval(id); window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [i, step?.target]);
  // Place the card below the target when there is room, else above; keep it on screen.
  useLayoutEffect(() => {
    if (!rect || !pop.current) return; const w = pop.current.offsetWidth, h = pop.current.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, g = 12;
    let top = rect.bottom + g; if (top + h > vh - 8) top = rect.top - h - g; if (top < 8) top = Math.max(8, vh - h - 16); // a tall target: sit at the bottom of the screen
    const left = Math.max(8, Math.min(vw - w - 8, rect.left + Math.min(24, rect.width / 2) - 24));
    setPos({ top: Math.max(8, Math.min(top, vh - h - 8)), left });
  }, [rect, i]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  if (!step) return null;
  const last = i >= live.length - 1;
  const go = (d: number) => { if (d > 0 && last) { onClose(); return; } setI(x => Math.max(0, Math.min(live.length - 1, x + d))); };
  const skip = () => { onClose(); onSkip?.(); };
  const pad = 6;
  return <div className="rx-tour" aria-live="polite">
    <div className="rx-tour-block" onClick={e => e.stopPropagation()} />
    {rect && <div className="rx-tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
    <div ref={pop} className="rx-tour-pop" role="dialog" aria-modal="true" aria-labelledby="rx-tour-t" style={{ top: pos.top, left: pos.left }}>
      <div className="rx-tour-meta"><span>Step {i + 1} of {live.length}</span><button type="button" className="rx-tour-skip" onClick={skip}>Skip tutorial</button></div>
      <h3 id="rx-tour-t">{step.title}</h3>
      <div className="rx-tour-body">{step.body}</div>
      <div className="rx-tour-foot">
        <span className="rx-tour-dots" aria-hidden="true">{live.map((_, j) => <i key={j} className={j === i ? 'on' : j < i ? 'done' : ''} />)}</span>
        <span className="rx-tour-btns">{i > 0 && <button type="button" className="rw-btn small ghost" onClick={() => go(-1)}>Back</button>}
          <button ref={next} type="button" className="rw-btn small lime" onClick={() => go(1)}>{last ? 'Finish' : 'Next'}</button></span>
      </div>
    </div>
  </div>;
}
