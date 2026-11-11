import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// A short, optional guided tour. Each step spotlights one part of the screen and explains it.
// A step whose target is not on screen is skipped. Each tour starts once by itself; skipping any tour stops the others
// from starting by themselves too. Every tour can be replayed from the Help button.
export type Target = string | (() => Element | null);
export interface TourStep { target: Target; title: string; body: React.ReactNode; before?: () => void }

export const find = (t: Target): Element | null => typeof t === 'string' ? document.querySelector(t) : t();
/** The card whose heading starts with this text. */
export const card = (title: string): Target => () => [...document.querySelectorAll('.rw-main .rw-card')].find(c => c.querySelector('.rw-card-head h2')?.textContent?.trim().startsWith(title)) ?? null;
/** Clicks the tab whose label starts with this text, inside the main area. */
export const clickTab = (label: string) => () => { const b = [...document.querySelectorAll<HTMLButtonElement>('.rw-main .rw-tabs button')].find(x => x.textContent?.trim().startsWith(label)); if (b && b.getAttribute('aria-selected') !== 'true') b.click(); };

const KEY = (id: string) => `nxt-tour-${id}`; const OPT_OUT = 'nxt-tour-optout';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string) => { try { localStorage.setItem(k, '1'); } catch { /* remembering is optional */ } };

/** Returns [open, start, finish, skip]. Opens once by itself unless already seen or the person opted out by skipping. */
export function useTour(id: string, autoStart = true): [boolean, () => void, () => void, () => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); if (!autoStart || get(KEY(id)) || get(OPT_OUT)) return; const t = setTimeout(() => setOpen(true), 700); return () => clearTimeout(t); }, [id, autoStart]);
  return [open, () => setOpen(true), () => { set(KEY(id)); setOpen(false); }, () => { set(KEY(id)); set(OPT_OUT); setOpen(false); }];
}

export function Tour({ steps, onClose, onSkip }: { steps: TourStep[]; onClose: () => void; onSkip?: () => void }) {
  // Steps that switch something first (a tab) are kept; their target appears once that runs.
  const [live] = useState(() => steps.filter(s => s.before || find(s.target)));
  const [i, setI] = useState(0); const [rect, setRect] = useState<DOMRect | null>(null); const dir = useRef(1);
  const pop = useRef<HTMLDivElement>(null); const next = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -999, left: -999 });
  const step = live[Math.min(i, live.length - 1)];
  const last = i >= live.length - 1;
  const go = (d: number) => { dir.current = d; if (d > 0 && last) { onClose(); return; } setI(x => Math.max(0, Math.min(live.length - 1, x + d))); };
  const skip = () => { (onSkip ?? onClose)(); };

  // Run the step's set-up, bring the target into view, then follow it while the page scrolls or resizes.
  useEffect(() => {
    if (!step) return; step.before?.(); let alive = true; let iv = 0;
    const el = () => find(step.target) as HTMLElement | null;
    const measure = () => { const e = el(); if (e && alive) setRect(e.getBoundingClientRect()); };
    const t0 = setTimeout(() => {
      const t = el();
      if (!t) { const d = dir.current < 0 ? -1 : 1; if ((d < 0 && i === 0) || (d > 0 && last)) onClose(); else setI(x => x + d); return; }
      const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      // Tall areas line up just under the sticky header; smaller ones are centred.
      const head = (document.querySelector('.rx-top') as HTMLElement | null)?.getBoundingClientRect().bottom ?? 0; const r = t.getBoundingClientRect();
      if (r.height > (window.innerHeight - head) * 0.6) window.scrollTo({ top: r.top + window.scrollY - head - 16, behavior }); else t.scrollIntoView({ block: 'center', behavior });
      measure(); iv = window.setInterval(measure, 120); setTimeout(() => clearInterval(iv), 1000); next.current?.focus();
    }, step.before ? 80 : 0);
    window.addEventListener('scroll', measure, true); window.addEventListener('resize', measure);
    return () => { alive = false; clearTimeout(t0); clearInterval(iv); window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [i]);
  // Place the card below the target when there is room, else above, else at the bottom of the screen; keep it on screen.
  useLayoutEffect(() => {
    if (!rect || !pop.current) return; const w = pop.current.offsetWidth, h = pop.current.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, g = 12;
    let top = rect.bottom + g; if (top + h > vh - 8) top = rect.top - h - g; if (top < 8) top = vh - h - 16;
    const left = Math.max(8, Math.min(vw - w - 8, rect.left + Math.min(24, rect.width / 2) - 24));
    setPos({ top: Math.max(8, Math.min(top, vh - h - 8)), left });
  }, [rect, i]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  if (!step) return null;
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
