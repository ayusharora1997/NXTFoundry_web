import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toCSV } from './engine';
import { useAiEnabled } from './ai';
import { tagLabel, TODAY } from './ledger';

// ---------- AI marker ----------
/**
 * ✦ marks a spot where AI assists. Until that AI feature is switched on it is an honest teaser: a dimmed chip
 * that says "in training" and, when clicked, what the AI sous-chef will do here.
 */
export function AiChip({ label, hint, run, hideWhenLive }: { label: string; hint: string; run?: () => Promise<React.ReactNode>; hideWhenLive?: boolean }) {
  const on = useAiEnabled(); const live = on && !!run;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ busy?: boolean; out?: React.ReactNode; err?: string }>({});
  if (hideWhenLive && on) return null;   // the live version of this chip appears elsewhere
  const click = async (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (!live) { setOpen(o => !o); return; }
    if (open && !state.busy) { setOpen(false); return; }
    setOpen(true); setState({ busy: true });
    try { setState({ out: await run!() }); } catch (err) { setState({ err: err instanceof Error ? err.message : 'Something went wrong.' }); }
  };
  return <span className="ai-chip-wrap">
    <button type="button" className={'ai-chip' + (live ? ' live' : '')} aria-expanded={open} onClick={click} disabled={state.busy}>
      <span className="ai-spark" aria-hidden="true">✦</span>{state.busy ? 'Thinking…' : label}{!live && <em>in training</em>}
    </button>
    {open && !live && <span className="ai-pop" role="status"><b>✦ AI sous-chef, in training.</b> {hint}</span>}
    {open && live && !state.busy && <span className="ai-pop live" role="status">
      {state.err ? <span>{state.err}</span> : state.out}
      <small>✦ AI-generated. Check it before relying on it.</small>
      <button type="button" className="ai-pop-x" aria-label="Close" onClick={e => { e.stopPropagation(); setOpen(false); }}>×</button>
    </span>}
  </span>;
}

// ---------- Formatting ----------
export const inr = (n: number | null | undefined, dp = 0) => n === null || n === undefined ? '—' : (n < -0.004 ? '−' : '') + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const num = (n: number | null | undefined, dp = 0) => n === null || n === undefined ? '—' : (n < -0.004 ? '−' : '') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
/** ₹ in lakh / crore for headline figures. */
export const short = (n: number) => { const a = Math.abs(n), s = n < -0.004 ? '−' : ''; return a >= 1e7 ? `${s}₹${(a / 1e7).toFixed(2)} Cr` : a >= 1e5 ? `${s}₹${(a / 1e5).toFixed(2)} L` : `${s}₹${a.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; };

export function download(name: string, text: string) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Icons ----------
const P: Record<string, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  upload: <><path d="M12 15V4" /><path d="m7 9 5-5 5 5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  summary: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M8 15v-3M12 15V9M16 15v-5" /></>,
  check: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  open: <><circle cx="12" cy="12" r="8" /><path d="M12 8v5M12 16h.01" /></>,
  info: <><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></>,
  cols: <><rect x="4" y="5" width="16" height="14" rx="1" /><path d="M10 5v14M15 5v14" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  x: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  rules: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  sort: <><path d="m8 9 4-4 4 4" /><path d="m8 15 4 4 4-4" /></>,
  file: <><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" /><path d="M14 3v4h4" /></>,
  reset: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  chat: <><path d="M5 5h14v10H9l-4 4z" /></>,
  sign: <><path d="M4 19h16" /><path d="m7 15 9-9 2 2-9 9H7z" /></>,
  inbox: <><path d="M4 13l2-8h12l2 8v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></>,
};
export const Icon = ({ n, s = 16 }: { n: keyof typeof P | string; s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>;

// ---------- Small pieces ----------
export function InfoTip({ children, label = 'About this' }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (!open) return; const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  return <span className="rw-tip" ref={ref}><button className="rw-iconbtn" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><Icon n="info" /></button>{open && <span className="rw-tip-pop" role="note">{children}</span>}</span>;
}
export function Drawer({ title, sub, onClose, children, wide }: { title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  return <div className="rw-drawer-wrap"><div className="rw-scrim" onClick={onClose} /><aside className={'rw-drawer' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'}>
    <div className="rw-drawer-head"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div><button className="rw-iconbtn" onClick={onClose} aria-label="Close"><Icon n="x" /></button></div>
    <div className="rw-drawer-body">{children}</div></aside></div>;
}
export const Pill = ({ children, tone = 'grey' }: { children: React.ReactNode; tone?: string }) => <span className={'rw-pill ' + tone}>{children}</span>;
export const statusTone = (s: string) => s === 'Signed off' || s === 'Resolved' ? 'green' : s === 'Ledger not received' ? 'red' : s === 'Awaiting supplier' ? 'violet' : s === 'Under investigation' ? 'blue' : s === 'Superseded' ? 'grey' : 'amber';
export const sevTone = (s: string) => s === 'Critical' ? 'red solid' : s === 'High' ? 'red' : s === 'Medium' ? 'amber' : 'grey';
export function Card({ title, tip, actions, children, className = '' }: { title?: React.ReactNode; tip?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={'rw-card ' + className}>{(title || actions) && <div className="rw-card-head"><h2>{title}{tip && <InfoTip>{tip}</InfoTip>}</h2>{actions && <div className="rw-card-actions">{actions}</div>}</div>}{children}</section>;
}

// ---------- Data table ----------
export interface Col<T> {
  key: string; label: string; sub?: string; group?: string; align?: 'right'; width?: number;
  text: (r: T) => string;                      // used for search and CSV
  render?: (r: T) => React.ReactNode;
  sort?: (r: T) => number | string;
  hidden?: boolean; sticky?: boolean; noToggle?: boolean;
  total?: (rows: T[]) => React.ReactNode;
}
interface TableProps<T> {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; fileName: string; empty?: string;
  onRowClick?: (r: T) => void; activeKey?: string;
  selectable?: boolean; selected?: string[]; onSelect?: (keys: string[]) => void;
  toolbar?: React.ReactNode; pageSize?: number; initialSort?: { key: string; dir: 1 | -1 };
  expand?: (r: T) => React.ReactNode; // inline detail under a row, toggled by clicking it
}
/** Excel-like search: comma-separated terms, * and ? wildcards, any term may match any column. */
function matcher(q: string) {
  const terms = q.split(',').map(t => t.trim()).filter(Boolean);
  if (!terms.length) return null;
  const res = terms.map(t => new RegExp(t.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i'));
  return (cells: string[]) => res.some(re => cells.some(c => re.test(c)));
}
export function DataTable<T>({ rows, cols, rowKey, fileName, empty = 'Nothing to show.', onRowClick, activeKey, selectable, selected = [], onSelect, toolbar, pageSize = 10, initialSort, expand }: TableProps<T>) {
  const [q, setQ] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [sort, setSort] = useState(initialSort ?? null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(cols.filter(c => c.hidden).map(c => c.key)));
  const [colsOpen, setColsOpen] = useState(false);
  const [page, setPage] = useState(0); const [size, setSize] = useState(pageSize);
  const visible = cols.filter(c => !hidden.has(c.key));
  const filtered = useMemo(() => {
    const m = matcher(q); let xs = m ? rows.filter(r => m(cols.map(c => c.text(r)))) : rows;
    if (sort) { const c = cols.find(x => x.key === sort.key); if (c) { const f = c.sort ?? c.text; xs = [...xs].sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir; }); } }
    return xs;
  }, [rows, cols, q, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)); const p = Math.min(page, pages - 1);
  const shown = filtered.slice(p * size, p * size + size);
  useEffect(() => setPage(0), [q, rows.length]);
  const groups: { label: string; span: number }[] = []; visible.forEach(c => { const g = c.group ?? ''; const last = groups[groups.length - 1]; if (last && last.label === g && g) last.span++; else groups.push({ label: g, span: 1 }); });
  const grouped = visible.some(c => c.group);
  // Sticky leading columns get fixed left offsets.
  let left = selectable ? 40 : 0; const stick: Record<string, number> = {};
  visible.forEach(c => { if (c.sticky) { stick[c.key] = left; left += c.width ?? 160; } });
  const sty = (c: Col<T>): React.CSSProperties => ({ ...(c.width ? { minWidth: c.width, width: c.width } : {}), ...(c.key in stick ? { left: stick[c.key] } : {}) });
  const cls = (c: Col<T>) => [c.align === 'right' ? 'ar' : '', c.key in stick ? 'stick' : '', c.group ? 'grp-' + c.group.replace(/\W+/g, '').toLowerCase() : ''].join(' ');
  const allSel = shown.length > 0 && shown.every(r => selected.includes(rowKey(r)));
  const toggleAll = () => onSelect?.(allSel ? selected.filter(k => !shown.some(r => rowKey(r) === k)) : [...new Set([...selected, ...shown.map(rowKey)])]);
  const toggle = (k: string) => onSelect?.(selected.includes(k) ? selected.filter(x => x !== k) : [...selected, k]);
  const head = (c: Col<T>, rowSpan?: number) => <th key={c.key} rowSpan={rowSpan} className={cls(c)} style={sty(c)} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
    <button className="rw-th" onClick={() => setSort(sort?.key === c.key ? (sort.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}><span>{c.label}{c.sub && <small>{c.sub}</small>}</span><i className={sort?.key === c.key ? 'on' : ''}>{sort?.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : '⇅'}</i></button></th>;
  const hasTotals = visible.some(c => c.total);
  return <div className="rw-table-block">
    <div className="rw-table-tools">
      <label className="rw-search"><Icon n="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search · separate terms with commas, * matches anything" aria-label="Search table" data-rw-search />{q && <button className="rw-iconbtn" onClick={() => setQ('')} aria-label="Clear search"><Icon n="x" s={14} /></button>}</label>
      {toolbar}
      <div className="rw-pop-anchor"><button className="rw-btn" onClick={() => setColsOpen(!colsOpen)} aria-expanded={colsOpen}><Icon n="cols" /> Columns</button>
        {colsOpen && <div className="rw-pop" onMouseLeave={() => setColsOpen(false)}>{cols.filter(c => !c.noToggle).map(c => <label key={c.key}><input type="checkbox" checked={!hidden.has(c.key)} onChange={() => { const h = new Set(hidden); if (h.has(c.key)) h.delete(c.key); else h.add(c.key); setHidden(h); }} />{c.group ? `${c.group} · ` : ''}{c.label}</label>)}</div>}</div>
      <button className="rw-btn lime" onClick={() => download(fileName, toCSV(filtered.map(r => Object.fromEntries(visible.map(c => [c.group ? `${c.group} ${c.label}` : c.label, c.text(r)])))))} aria-label="Download table as CSV" title="Download as CSV"><Icon n="download" /></button>
    </div>
    <div className="rw-table-wrap"><table className="rw-table">
      <thead>{grouped ? <>
        <tr>{selectable && <th rowSpan={2} className="chk stick" style={{ left: 0 }}><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="Select all on this page" /></th>}
          {(() => { let i = 0; return groups.map((g, gi) => { const cs = visible.slice(i, i + g.span); i += g.span; return g.label ? <th key={'g' + gi} colSpan={g.span} className={'grp grp-' + g.label.replace(/\W+/g, '').toLowerCase()}>{g.label}</th> : cs.map(c => head(c, 2)); }); })()}</tr>
        <tr>{visible.filter(c => c.group).map(c => head(c))}</tr></>
        : <tr>{selectable && <th className="chk stick" style={{ left: 0 }}><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="Select all on this page" /></th>}{visible.map(c => head(c))}</tr>}</thead>
      <tbody>{shown.length === 0 ? <tr><td colSpan={visible.length + (selectable ? 1 : 0)} className="rw-empty">{q ? 'No rows match your search.' : empty}</td></tr>
        : shown.map((r, i) => { const k = rowKey(r); const isOpen = !!expand && openRow === k; const click = onRowClick ? () => onRowClick(r) : expand ? () => setOpenRow(isOpen ? null : k) : undefined;
          return <React.Fragment key={k}><tr className={(click ? 'click' : '') + (k === activeKey || isOpen ? ' active' : '') + (selected.includes(k) ? ' sel' : '')} onClick={click} aria-expanded={expand ? isOpen : undefined}>
          {selectable && <td className="chk stick" style={{ left: 0 }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.includes(k)} onChange={() => toggle(k)} aria-label={`Select row ${p * size + i + 1}`} /></td>}
          {visible.map(c => <td key={c.key} className={cls(c)} style={sty(c)}>{c.render ? c.render(r) : c.text(r)}</td>)}</tr>
          {isOpen && <tr className="rw-expand"><td colSpan={visible.length + (selectable ? 1 : 0)}>{expand!(r)}</td></tr>}</React.Fragment>; })}</tbody>
      {hasTotals && filtered.length > 0 && <tfoot><tr>{selectable && <td className="chk stick" style={{ left: 0 }} />}{visible.map((c, i) => <td key={c.key} className={cls(c)} style={sty(c)}>{c.total ? c.total(filtered) : i === 0 ? 'Total' : ''}</td>)}</tr></tfoot>}
    </table></div>
    <div className="rw-pager"><span>Showing {filtered.length ? p * size + 1 : 0} to {Math.min(filtered.length, p * size + size)} of {filtered.length}{selected.length > 0 && ` · ${selected.length} selected`}</span>
      <div><button disabled={p === 0} onClick={() => setPage(0)} aria-label="First page">«</button><button disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="Previous page">‹</button><b>{p + 1}</b><span>of {pages}</span><button disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="Next page">›</button><button disabled={p >= pages - 1} onClick={() => setPage(pages - 1)} aria-label="Last page">»</button>
        <select value={size} onChange={e => { setSize(Number(e.target.value)); setPage(0); }} aria-label="Rows per page">{[5, 10, 25, 50].map(n => <option key={n} value={n}>{n} per page</option>)}</select></div></div>
  </div>;
}

// ---------- Charts and widgets ----------
export function Ring({ value, size = 92, stroke = 9, label, sub, dark }: { value: number; size?: number; stroke?: number; label: string; sub?: string; dark?: boolean }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return <div className={'rw-ring' + (dark ? ' dark' : '')}>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="track" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="val" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{Math.round(v * 100)}%</text>
    </svg><span><b>{label}</b>{sub && <small>{sub}</small>}</span></div>;
}

export interface WStep { key: string; label: string; value: number; note?: string }
/** Waterfall from one balance to another: each step moves the running total down by its value (end = start − Σ steps). */
export function Waterfall({ start, steps, end, active, onPick, height = 170, fmt = short }: { start: { label: string; value: number }; steps: WStep[]; end: { label: string; value: number }; active?: string; onPick?: (k: string) => void; height?: number; fmt?: (n: number) => string }) {
  let run = start.value;
  const bars: { key: string; label: string; from: number; to: number; kind: string; value: number; note: string }[] = [{ key: '__s', label: start.label, from: 0, to: start.value, kind: 'total', value: start.value, note: '' }];
  steps.forEach(s => { bars.push({ key: s.key, label: s.label, from: run, to: run - s.value, kind: s.value >= 0 ? 'down' : 'up', value: -s.value, note: s.note ?? '' }); run -= s.value; });
  bars.push({ key: '__e', label: end.label, from: 0, to: end.value, kind: 'total end', value: end.value, note: '' });
  // When the steps are small next to the balances (lakhs against crores), zoom onto the range the steps move through
  // and draw the two balances from a broken axis, so every step stays visible.
  const runs = bars.filter(b => !b.kind.startsWith('total')).flatMap(b => [b.from, b.to]).concat(start.value, end.value);
  const rlo = Math.min(...runs), rhi = Math.max(...runs), big = Math.max(Math.abs(start.value), Math.abs(end.value));
  const zoom = rlo > 0 && rhi - rlo < big * 0.25;
  const vals = bars.flatMap(b => [b.from, b.to]);
  const lo = zoom ? rlo - (rhi - rlo || 1) * 0.6 : Math.min(0, ...vals), hi = zoom ? rhi + (rhi - rlo || 1) * 0.15 : Math.max(0, ...vals); const span = hi - lo || 1;
  const y = (v: number) => Math.max(0, Math.min(100, ((hi - v) / span) * 100));
  if (zoom) bars.forEach(b => { if (b.kind.startsWith('total')) { b.from = lo; b.kind += ' broken'; } });
  return <div className="rw-wf" role="group" aria-label={`Waterfall from ${start.label} to ${end.label}`}>
    {bars.map(b => { const top = y(Math.max(b.from, b.to)), h = Math.max(0.8, Math.abs(y(b.from) - y(b.to))); const clickable = !!onPick && !b.kind.startsWith('total');
      return <button key={b.key} className={`rw-wf-col ${b.kind}${active === b.key ? ' on' : ''}${active && active !== b.key && clickable ? ' dim' : ''}`} disabled={!clickable} onClick={() => clickable && onPick!(active === b.key ? '' : b.key)} title={b.note || undefined} aria-pressed={clickable ? active === b.key : undefined}>
        <span className="rw-wf-val">{b.kind.startsWith('total') ? fmt(b.value) : (b.value > 0 ? '+' : '') + fmt(b.value)}</span>
        <span className="rw-wf-track" style={{ height }}>{!zoom && <span className="rw-wf-zero" style={{ top: `${y(0)}%` }} />}<i style={{ top: `${top}%`, height: `${h}%` }} /></span>
        <span className="rw-wf-lab">{b.label}</span></button>; })}
  </div>;
}

export function Meter({ value, tone = '' }: { value: number; tone?: string }) { return <span className={'rw-meter ' + tone}><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></span>; }
export const initials = (s: string) => s.replace(/\(.*?\)|·.*$/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const Avatar = ({ name }: { name: string }) => <span className="rw-avatar" title={name}>{initials(name)}</span>;

export interface Toast { id: number; msg: string; undo?: () => void; tone?: 'ok' | 'warn' }
export function Toasts({ items, dismiss }: { items: Toast[]; dismiss: (id: number) => void }) {
  return <div className="rw-toasts" aria-live="polite">{items.map(t => <div key={t.id} className={'rw-toast ' + (t.tone ?? 'ok')}><Icon n="check" /><span>{t.msg}</span>
    {t.undo && <button onClick={() => { t.undo!(); dismiss(t.id); }}>Undo</button>}<button className="x" onClick={() => dismiss(t.id)} aria-label="Dismiss"><Icon n="x" s={14} /></button></div>)}</div>;
}

/** Searchable vendor switcher. */
export function Picker({ value, options, onChange, allLabel }: { value: string; options: { id: string; label: string; meta?: string; dot?: string }[]; onChange: (v: string) => void; allLabel: string }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  const cur = options.find(o => o.id === value);
  const list = options.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  const pick = (v: string) => { onChange(v); setOpen(false); setQ(''); };
  return <div className="rw-picker" ref={ref}>
    <button className="rw-picker-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}><i>Vendor</i><b>{cur ? cur.label : allLabel}</b><span aria-hidden="true">▾</span></button>
    {open && <div className="rw-picker-pop"><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find a vendor" aria-label="Find a vendor" onKeyDown={e => { if (e.key === 'Enter' && list[0]) pick(list[0].id); if (e.key === 'Escape') setOpen(false); }} />
      <ul role="listbox"><li role="option" aria-selected={value === 'ALL'}><button className={value === 'ALL' ? 'on' : ''} onClick={() => pick('ALL')}><span className="rw-dot all" /><span>{allLabel}</span></button></li>
        {list.map(o => <li key={o.id} role="option" aria-selected={value === o.id}><button className={value === o.id ? 'on' : ''} onClick={() => pick(o.id)}><span className={'rw-dot ' + (o.dot ?? '')} /><span>{o.label}</span>{o.meta && <small>{o.meta}</small>}</button></li>)}</ul></div>}
  </div>;
}

/** Currency-aware amount: ₹ with Indian grouping, $ with Western grouping. */
export const money = (n: number | null | undefined, cur = 'INR', dp = 2) => n === null || n === undefined ? '—' : (n < -0.004 ? '−' : '') + (cur === 'USD' ? '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
export const signedMoney = (n: number, cur = 'INR', dp = 2) => (n > 0.004 ? '+' : '') + money(n, cur, dp);

// ---------- Period calendar ----------
const SHORT_M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Month (or quarter) grid. Periods that have started are open; upcoming and out-of-scope ones are greyed out. */
export function PeriodCalendar({ tags, value, quarterly, onPick }: { tags: string[]; value: string; quarterly: boolean; onPick: (tag: string) => void }) {
  const [year, setYear] = useState(Number(value.slice(3)));
  const cells = quarterly ? [3, 6, 9, 12].map(m => ({ m, label: `${SHORT_M[m - 3]}–${SHORT_M[m - 1]}`, tag: `Q${String(m).padStart(2, '0')}${year}`, start: Date.UTC(year, m - 3, 1) }))
    : SHORT_M.map((l, i) => ({ m: i + 1, label: l, tag: `M${String(i + 1).padStart(2, '0')}${year}`, start: Date.UTC(year, i, 1) }));
  return <div className="rx-cal" role="group" aria-label="Choose a period">
    <div className="rx-cal-head"><button type="button" className="rw-iconbtn" aria-label="Previous year" onClick={() => setYear(year - 1)}>‹</button><b>{year}</b><button type="button" className="rw-iconbtn" aria-label="Next year" onClick={() => setYear(year + 1)}>›</button></div>
    <div className={'rx-cal-grid' + (quarterly ? ' q' : '')}>{cells.map(c => { const upcoming = c.start > TODAY, inScope = tags.includes(c.tag), off = upcoming || !inScope;
      return <button type="button" key={c.tag} disabled={off} className={c.tag === value ? 'on' : ''} aria-pressed={c.tag === value} title={upcoming ? 'Upcoming period' : inScope ? undefined : 'Not part of this reconciliation'} onClick={() => onPick(c.tag)}>{c.label}</button>; })}</div>
    <p className="rx-cal-note">Greyed out: upcoming periods, or periods before this reconciliation began.</p>
  </div>;
}
export function PeriodPicker({ tags, value, quarterly, onPick }: { tags: string[]; value: string; quarterly: boolean; onPick: (tag: string) => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  return <div className="rx-pp" ref={ref}><button type="button" className="rx-pp-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><i>Period</i><b>{tagLabel(value)}</b><Icon n="chevron" /></button>
    {open && <div className="rx-pp-pop"><PeriodCalendar tags={tags} value={value} quarterly={quarterly} onPick={t => { onPick(t); setOpen(false); }} /></div>}</div>;
}

/** A strip of summary cards that can be folded away. The choice is remembered per strip in this browser. */
export function Collapsible({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const key = `nxt-recon-collapsed-${id}`;
  const [closed, setClosed] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  const flip = () => { const n = !closed; setClosed(n); try { localStorage.setItem(key, n ? '1' : '0'); } catch { /* remembering is optional */ } };
  return <div className={'rx-fold' + (closed ? ' shut' : '')}><button type="button" className="rx-fold-btn" aria-expanded={!closed} onClick={flip}><Icon n="chevron" />{closed ? `Show ${label}` : `Hide ${label}`}</button>{!closed && children}</div>;
}
