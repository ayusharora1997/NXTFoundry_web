// Workspace for the demo: every relationship's state, the available ledger files, settings and the signed-in user.
// History is not hard-coded: each closed period is run through the same engine calls a user would make,
// with reviewer and vendor decisions simulated from the generator's ground truth.

import {
  newRelState, importFile, gate, approveOpening, runStage, decideCandidate, prepare, share, vendorResponse, finalSignoff, closePeriod, approveRounding,
  statement, openItems, updateException, STAGES, DEFAULT_SETTINGS, type RelState, type Settings, type LedgerFile, type Result, type PeriodDef, type Relationship,
} from './cycle';
import { generateAll, periodsFor, RELS, VENDORS, CURRENT } from './ledger';

export interface User { id: string; name: string; role: 'Preparer' | 'Approver' | 'Admin' }
export const USERS: User[] = [
  { id: 'u1', name: 'Priya Nair', role: 'Preparer' },
  { id: 'u2', name: 'Arjun Mehta', role: 'Approver' },
  { id: 'u3', name: 'System admin', role: 'Admin' },
];
export const canApprove = (u: User) => u.role !== 'Preparer';
export interface Workspace { states: Record<string, RelState>; files: LedgerFile[]; truth: Record<string, string>; settings: Settings; userId: string }

const DAY = 86400000; const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const stampAt = (ms: number, hhmm = '10:00') => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()} ${hhmm}`; };
export const now = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${MON[d.getMonth()]}-${d.getFullYear()} ${d.toTimeString().slice(0, 5)}`; };
const must = (r: Result<RelState>, what: string): RelState => { if (!r.ok) throw new Error(`${what}: ${r.error}`); return r.state; };

export const filesFor = (ws: Workspace, relId: string, tag: string) => ws.files.filter(f => f.relId === relId && f.periodTag === tag);
export const nextDef = (rel: Relationship, tag: string): PeriodDef | undefined => { const d = periodsFor(rel); return d[d.findIndex(x => x.tag === tag) + 1]; };

/** Runs one period through the full cycle the way the team would have, up to `until`. */
export function drive(st0: RelState, ws: Pick<Workspace, 'files' | 'truth' | 'settings'>, tag: string, until: 'imported-buyer' | 'imported' | 'gate' | 'matched' | 'shared' | 'disputed' | 'signed' | 'closed', withExtras = true): RelState {
  let st = st0; const rel = st.rel; const def = periodsFor(rel).find(d => d.tag === tag)!; const S = ws.settings;
  const t = (days: number, hh = '10:00') => stampAt(def.end + days * DAY, hh);
  const prep = 'Priya Nair', appr = 'Arjun Mehta';
  const fs = ws.files.filter(f => f.relId === rel.id && f.periodTag === tag);
  const get = (side: 'B' | 'V', kind: LedgerFile['kind']) => fs.find(f => f.side === side && f.kind === kind);
  // Picks up wherever the period is: files already imported are skipped.
  const p0 = () => st.periods.find(p => p.tag === tag)!;
  const take = (f: LedgerFile | undefined, at: string, what: string) => { if (f && p0().imports[f.side] !== f.id && !p0().extraFiles.includes(f.id)) st = must(importFile(st, f, tag, prep, at), what); };
  take(get('B', 'period'), t(3, '09:20'), 'import buyer');
  if (until === 'imported-buyer') return st;
  (['B', 'V'] as const).forEach(s => take(get(s, 'historical'), t(3, '09:40'), 'import historical'));
  take(get('V', 'period'), t(5, '11:05'), 'import vendor');
  if (until === 'imported') return st;
  if (withExtras) take(get('V', 'backdated'), t(6, '15:30'), 'import backdated');
  const g = gate(st, tag);
  if (g.position?.status === 'UNVERIFIED') st = must(approveOpening(st, tag, 'B', 'opening-position', 'Opening position agreed on onboarding call; difference relates to pre-onboarding freight claim', 'Onboarding minutes OB-2026-031', appr, t(6), true), 'approve position');
  (['B', 'V'] as const).forEach(s => { if (gate(st, tag)[s].status === 'FAILED') st = must(approveOpening(st, tag, s, 'opening-continuity', 'Explained by vendor', 'Vendor email', appr, t(6), true), 'approve continuity'); });
  if (until === 'gate') return st;
  STAGES.filter(x => !x.optional || S.stages[x.optional]).forEach((x, i) => { if (!p0().stages[x.id]) st = must(runStage(st, tag, x.id, S, prep, t(7, `1${i}:00`)), `stage ${x.id}`); });
  if (until === 'matched') return st;
  // Simulated reviewer: confirm suggestions that are genuinely the same transaction, reject the rest.
  st.candidates.filter(c => c.status === 'pending' && c.periodTag === tag).forEach(c => {
    const keys = [...c.buyerIds, ...c.vendorIds].map(i => ws.truth[i]);
    const r = decideCandidate(st, c.id, keys.every(k => k && k === keys[0]), prep, t(8, '12:10')); if (r.ok) st = r.state;
  });
  const s = statement(st, tag, S);
  if (!s.balanced && s.withinTolerance) st = must(approveRounding(st, tag, 'FX rounding on vendor statement', appr, t(9), S, true), 'rounding');
  st = must(prepare(st, tag, S, prep, t(9, '16:00')), 'prepare');
  st = must(share(st, tag, prep, t(9, '16:30')), 'share');
  if (until === 'shared') return st;
  const rep = VENDORS.find(v => v.id === rel.vendorId)!.contact.name;
  if (until === 'disputed') return must(vendorResponse(st, tag, false, rep, 'We do not accept the short value on our invoice; our copy shows the agreed export price list.', prep, t(12, '11:00')), 'dispute');
  st = must(vendorResponse(st, tag, true, rep, 'Agreed. Open items noted for follow-up.', prep, t(12, '11:00')), 'accept');
  st = must(finalSignoff(st, tag, appr, t(13, '10:30'), true), 'sign');
  if (until === 'signed') return st;
  return must(closePeriod(st, tag, nextDef(rel, tag), S, appr, t(14, '17:00'), true), 'close');
}

const TARGET: Record<string, Parameters<typeof drive>[3]> = { R1: 'imported-buyer', R2: 'imported', R3: 'matched', R4: 'shared', R5: 'gate', R6: 'signed', R7: 'disputed', R8: 'imported' };
// Investigation notes left on long-running items in earlier periods (they travel with the item).
const NOTES: Record<string, string[]> = {
  R3: ['Vendor says a rate revision was approved in May; asked procurement for the revised PO.', 'Procurement confirms no revision was approved. Vendor asked for a credit note.', 'Vendor escalated to their sales head; awaiting response.'],
  R4: ['Credit note not received by our AP inbox; requested a copy from the vendor.'],
};

export function initWorkspace(): Workspace {
  const { files, truth } = generateAll();
  const base = { files, truth, settings: DEFAULT_SETTINGS };
  const states: Record<string, RelState> = {};
  RELS.forEach(rel => {
    const defs = periodsFor(rel); let st = newRelState(rel, defs[0]);
    for (let i = 0; i < CURRENT[rel.id]; i++) {
      st = drive(st, base, defs[i].tag, 'matched');
      // Leave investigation notes on items that stay open, before the period is reviewed and closed.
      const notes = NOTES[rel.id];
      if (notes?.[i]) { const it = openItems(st, defs[i].tag, base.settings).find(o => (rel.id === 'R3' ? o.category === 'Amount mismatch' && o.txn.side === 'B' : o.txn.side === 'V' && o.txn.type === 'CN'));
        if (it) { const r = updateException(st, defs[i].tag, it.txn.id, { status: 'Awaiting Vendor', owner: rel.id === 'R3' ? 'Procurement' : rel.owner }, 'Priya Nair', stampAt(defs[i].end + 8 * DAY, '15:00'), base.settings, notes[i]); if (r.ok) st = r.state; } }
      st = finishFrom(st, base, defs[i].tag);
    }
    st = drive(st, base, defs[CURRENT[rel.id]].tag, TARGET[rel.id], rel.id !== 'R2');
    states[rel.id] = st;
  });
  return { states, files, truth, settings: DEFAULT_SETTINGS, userId: 'u1' };
}
/** Continue a period that has already been matched through review, sign-off and close. */
function finishFrom(st: RelState, ws: Pick<Workspace, 'files' | 'truth' | 'settings'>, tag: string): RelState {
  const def = periodsFor(st.rel).find(d => d.tag === tag)!; const t = (days: number, hh = '10:00') => stampAt(def.end + days * DAY, hh); const S = ws.settings;
  st.candidates.filter(c => c.status === 'pending' && c.periodTag === tag).forEach(c => { const keys = [...c.buyerIds, ...c.vendorIds].map(i => ws.truth[i]); const r = decideCandidate(st, c.id, keys.every(k => k && k === keys[0]), 'Priya Nair', t(8, '12:10')); if (r.ok) st = r.state; });
  const s = statement(st, tag, S); if (!s.balanced && s.withinTolerance) st = must(approveRounding(st, tag, 'FX rounding on vendor statement', 'Arjun Mehta', t(9), S, true), 'rounding');
  st = must(prepare(st, tag, S, 'Priya Nair', t(9, '16:00')), `prepare ${st.rel.id} ${tag}`);
  st = must(share(st, tag, 'Priya Nair', t(9, '16:30')), 'share');
  st = must(vendorResponse(st, tag, true, VENDORS.find(v => v.id === st.rel.vendorId)!.contact.name, 'Agreed. Open items noted for follow-up.', 'Priya Nair', t(12, '11:00')), 'accept');
  st = must(finalSignoff(st, tag, 'Arjun Mehta', t(13, '10:30'), true), 'sign');
  return must(closePeriod(st, tag, nextDef(st.rel, tag), S, 'Arjun Mehta', t(14, '17:00'), true), 'close');
}
