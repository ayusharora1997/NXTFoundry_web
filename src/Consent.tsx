// Google Tag Manager (GTM-NSXP47S9, GA4 inside) behind an opt-in banner.
// Nothing from Google Tag Manager or Google Analytics loads until the visitor clicks Accept. The choice is kept in
// localStorage; "Cookie settings" in the footer reopens the banner. Declining after accepting deletes the _ga cookies
// and reloads, so the tag is gone. The privacy policy (public/privacy.html, section 3) describes this; keep them in step.
import { useEffect, useState } from 'react';

const GTM_ID = 'GTM-NSXP47S9';
const KEY = 'nxt-analytics-consent';          // 'granted' | 'denied'
const OPEN_EVENT = 'nxt-open-consent';
type Choice = 'granted' | 'denied' | null;

const read = (): Choice => { try { const v = localStorage.getItem(KEY); return v === 'granted' || v === 'denied' ? v : null; } catch { return null; } };
const save = (v: 'granted' | 'denied') => { try { localStorage.setItem(KEY, v); } catch { /* the banner just shows again next visit */ } };

declare global { interface Window { dataLayer?: unknown[] } }
let loaded = false;
/** The Google tag snippet from GTM, run from our bundle so the CSP needs no 'unsafe-inline'. */
function loadGtm() {
  if (loaded) return; loaded = true;
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  function gtag(..._args: unknown[]) { window.dataLayer!.push(arguments); }
  gtag('js', new Date());
  const s = document.createElement('script');
  s.async = true; s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(s);
}

/** Removes Google Analytics cookies (_ga, _ga_<id>, _gid) on this domain and its parent. */
function clearGaCookies() {
  const host = location.hostname; const parts = host.split('.');
  const domains = ['', host, '.' + host, parts.length > 2 ? '.' + parts.slice(-2).join('.') : ''].filter((d, i, a) => a.indexOf(d) === i);
  document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => /^_ga($|_)|^_gid$|^_gat/.test(n))
    .forEach(n => domains.forEach(d => { document.cookie = `${n}=; Max-Age=0; path=/${d ? '; domain=' + d : ''}`; }));
}

/** Footer link: reopens the banner. */
export const openConsent = () => window.dispatchEvent(new Event(OPEN_EVENT));

export default function Consent() {
  const [choice, setChoice] = useState<Choice>(read);
  const [open, setOpen] = useState(() => read() === null);
  // Declined: also sweep on every load, since the tag can rewrite a cookie in the moment before the reload.
  useEffect(() => { if (choice === 'granted') loadGtm(); else if (choice === 'denied') clearGaCookies(); }, [choice]);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener(OPEN_EVENT, f); return () => window.removeEventListener(OPEN_EVENT, f); }, []);
  if (!open) return null;
  const decide = (v: 'granted' | 'denied') => {
    const wasOn = choice === 'granted'; save(v); setChoice(v); setOpen(false);
    if (v === 'denied' && wasOn) { clearGaCookies(); location.reload(); }   // the loaded tag can't be unloaded
  };
  return <div className="consent" role="dialog" aria-live="polite" aria-label="Analytics cookies">
    <p>We’d like to use Google Analytics cookies to understand how the site is used. They load only if you accept. <a href="/privacy.html#analytics">Privacy Policy</a></p>
    <div className="consent-actions"><button type="button" className="consent-no" onClick={() => decide('denied')}>Decline</button><button type="button" className="button consent-yes" onClick={() => decide('granted')}>Accept</button></div>
  </div>;
}
