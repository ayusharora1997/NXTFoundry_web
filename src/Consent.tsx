// Google Tag Manager (GTM-NSXP47S9, GA4 inside) with Google Consent Mode v2.
// GTM loads on every visit with analytics_storage DENIED by default, so GA4 counts the visit with cookieless pings
// and sets no cookies. "Let's do it" updates analytics_storage to GRANTED, and GA4 then uses its _ga cookies.
// "Not now" (or ignoring the banner) keeps it denied. Ad consent is always denied: there are no ad tags.
// The choice is kept in localStorage; "Cookie settings" in the footer reopens the banner.
// The privacy policy (public/privacy.html, section 3) describes this; keep them in step.
import { useEffect, useState } from 'react';

const GTM_ID = 'GTM-NSXP47S9';
const KEY = 'nxt-analytics-consent';          // 'granted' | 'denied'
const OPEN_EVENT = 'nxt-open-consent';
type Choice = 'granted' | 'denied' | null;

const read = (): Choice => { try { const v = localStorage.getItem(KEY); return v === 'granted' || v === 'denied' ? v : null; } catch { return null; } };
const save = (v: 'granted' | 'denied') => { try { localStorage.setItem(KEY, v); } catch { /* the banner just shows again next visit */ } };

declare global { interface Window { dataLayer?: unknown[] } }
// gtag must push the Arguments object itself (not an array), as in Google's snippet.
// eslint-disable-next-line prefer-rest-params, @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) { (window.dataLayer = window.dataLayer || []).push(arguments); }

let loaded = false;
/** Google's tag snippet, run from our bundle so the CSP needs no 'unsafe-inline'. Consent defaults go first. */
function loadGtm(granted: boolean) {
  if (loaded) return; loaded = true;
  gtag('consent', 'default', { analytics_storage: granted ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
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
  const [open, setOpen] = useState(() => read() === null);
  useEffect(() => { const c = read(); loadGtm(c === 'granted'); if (c !== 'granted') clearGaCookies(); }, []);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener(OPEN_EVENT, f); return () => window.removeEventListener(OPEN_EVENT, f); }, []);
  if (!open) return null;
  const decide = (v: 'granted' | 'denied') => {
    save(v); setOpen(false);
    gtag('consent', 'update', { analytics_storage: v });
    if (v === 'denied') clearGaCookies();
  };
  return <div className="consent" role="dialog" aria-live="polite" aria-labelledby="consent-title">
    <h2 className="consent-title" id="consent-title">Cookies aren’t just for snacking.</h2>
    <p>We’d also like to know what makes your visit worthwhile. With your permission, we’ll use optional analytics cookies to understand how visitors explore NXT Foundry, which pages they find useful and where we can make things better.</p>
    <p>No mind-reading, no unnecessary fuss. Just a little insight to help us build a better experience. The choice is entirely yours. You can learn more in our <a href="/privacy.html#analytics">Privacy Policy</a>.</p>
    <div className="consent-actions"><button type="button" className="consent-no" onClick={() => decide('denied')}>Not now</button><button type="button" className="button consent-yes" onClick={() => decide('granted')}>Let’s do it</button></div>
  </div>;
}
