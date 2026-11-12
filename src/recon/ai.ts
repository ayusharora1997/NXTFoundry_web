// Client side of the AI sous-chef (/api/assist). AI is "on" only when the server says so (API key set in Vercel);
// until then every ✦ chip stays an honest "in training" teaser. The offline bundle never calls it.
import { useEffect, useState } from 'react';

const OFFLINE = import.meta.env.BASE_URL === './';
let enabled: Promise<boolean> | null = null;

export function aiEnabled(): Promise<boolean> {
  if (OFFLINE) return Promise.resolve(false);
  return (enabled ??= fetch('/api/assist', { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : { enabled: false }))
    .then(j => j?.enabled === true)
    .catch(() => false));
}

export function useAiEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { let live = true; aiEnabled().then(v => { if (live) setOn(v); }); return () => { live = false; }; }, []);
  return on;
}

const MESSAGES: Record<string, string> = {
  rate_limited: 'The sous-chef needs a breather. Try again in a few minutes.',
  busy: 'The sous-chef is busy right now. Try again in a minute.',
  ungrounded: 'The answer didn’t match the numbers, so we didn’t show it. Try again.',
  declined: 'The sous-chef couldn’t help with this one.',
  not_pdf: 'That file doesn’t look like a PDF.',
  too_large: 'That PDF is too large for the sous-chef (3 MB max).',
};

export async function askAi<T>(body: Record<string, unknown>): Promise<T> {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 55_000);
  try {
    const r = await fetch('/api/assist', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok !== true) throw new Error(MESSAGES[j.error] || 'Couldn’t reach the sous-chef. Try again in a moment.');
    return j as T;
  } catch (e) {
    throw new Error(e instanceof Error && !/abort/i.test(e.name) ? e.message : 'The sous-chef took too long. Try again.');
  } finally { clearTimeout(timer); }
}

/** Base64 of a blob URL's bytes (for sending an attached PDF). */
export async function blobUrlToBase64(url: string, maxBytes: number): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error(MESSAGES.too_large);
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
