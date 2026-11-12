import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { COUNTRIES, type Country } from './countries';

// Flag images from flag-icons (MIT), emitted as separate files (never inlined into the JS) and
// lazy-loaded, so only the flags actually shown are downloaded.
const FLAG_FILES = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
const flagUrl = (iso: string) => FLAG_FILES[`/node_modules/flag-icons/flags/4x3/${iso}.svg`];
const SORTED = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'en'));

const Flag = ({ iso }: { iso: string }) => <img className="cc-flag" src={flagUrl(iso)} alt="" width={20} height={15} loading="lazy" decoding="async" />;

// Where several countries share a calling code, list the main one first (+1 United States, +44 United Kingdom…).
const PRIMARY = new Set(['us', 'gb', 'ru', 'no', 'it', 'au', 'ma', 're', 'fi', 'gp', 'cw', 'nf']);

/** Lower is better; -1 = no match. Names: starts with > word starts with > contains. Codes: exact > prefix. */
function rank(c: Country, q: string): number {
  const s = q.trim().toLowerCase().replace(/^\+/, '');
  if (!s) return 0;
  if (/^\d[\d ]*$/.test(s)) {
    const d = c.dial.replace(' ', ''), want = s.replace(/ /g, '');
    if (!d.startsWith(want)) return -1;
    return (d === want ? 0 : 2) + (PRIMARY.has(c.iso) ? 0 : 1);
  }
  const name = c.name.toLowerCase();
  if (c.iso === s || name.startsWith(s)) return 0;
  if (name.split(/[\s(-]+/).some(w => w.startsWith(s))) return 1;
  return name.includes(s) ? 2 : -1;
}

type Props = {
  id: string; label: string; iso: string; onIso: (iso: string) => void;
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  maxLength: number; invalid: boolean; describedBy?: string; children?: React.ReactNode;
};

/** Phone input with a searchable country-code picker (flag, name, dial code). */
export default function PhoneField({ id, label, iso, onIso, value, onChange, maxLength, invalid, describedBy, children }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const country = COUNTRIES.find(c => c.iso === iso) || COUNTRIES[0];
  const results = useMemo(() => SORTED.map(c => [rank(c, query), c] as const).filter(([r]) => r >= 0)
    .sort((a, b) => a[0] - b[0]).map(([, c]) => c), [query]);   // stable sort keeps A–Z within a rank

  const openList = () => { setQuery(''); setActive(Math.max(0, SORTED.findIndex(c => c.iso === iso))); setOpen(true) };
  const close = (refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus({ preventScroll: true }) };
  const choose = (c: Country) => { onIso(c.iso); close(false); document.getElementById(id)?.focus({ preventScroll: true }) };

  useEffect(() => { if (open) search.current?.focus({ preventScroll: true }) }, [open]);
  // Keep the highlighted row visible by scrolling the list only (scrollIntoView would also move the page).
  useEffect(() => {
    const l = list.current, el = l?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!open || !l || !el) return;
    if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight;
  }, [active, open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) close(false) };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) choose(results[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'Tab') close(false);
  };

  return <div className="phone-field" ref={root}>
    <label htmlFor={id}>{label}</label>
    <div className="phone-anchor">
    <div className={'phone-row' + (invalid ? ' invalid' : '')}>
      <button type="button" ref={button} className="cc-button" aria-haspopup="listbox" aria-expanded={open}
        aria-label={`Country code: ${country.name} +${country.dial}. Change country`} onClick={() => open ? close(true) : openList()}>
        <Flag iso={country.iso} /><span className="cc-dial">+{country.dial}</span><span className="cc-caret" aria-hidden="true">▾</span>
      </button>
      <input id={id} type="tel" name="phone" placeholder="Phone number" autoComplete="tel-national" inputMode="tel"
        maxLength={maxLength} value={value} onChange={onChange} aria-invalid={invalid} aria-describedby={describedBy} />
    </div>
    {open && <div className="cc-panel">
      <input ref={search} className="cc-search" type="text" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={results[active] ? `${listId}-${results[active].iso}` : undefined} aria-label="Search country or code"
        placeholder="Search country or code" value={query} onChange={e => { setQuery(e.target.value); setActive(0) }} onKeyDown={onSearchKey} />
      <ul ref={list} id={listId} className="cc-list" role="listbox" aria-label="Countries">
        {results.map((c, i) => <li key={c.iso} id={`${listId}-${c.iso}`} data-i={i} role="option" aria-selected={c.iso === iso}
          className={(i === active ? 'active' : '') + (c.iso === iso ? ' selected' : '')}
          onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => choose(c)}>
          <Flag iso={c.iso} /><span className="cc-name">{c.name}</span><span className="cc-code">+{c.dial}</span>
        </li>)}
        {!results.length && <li className="cc-empty" role="presentation">No matching country</li>}
      </ul>
    </div>}
    </div>
    {children}
  </div>;
}
