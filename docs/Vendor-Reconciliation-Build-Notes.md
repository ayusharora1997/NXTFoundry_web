# NXT Vendor Payable Reconciliation: build notes

A complete record of what was built in the sample, how it works, why each decision was taken, and what to change when building the real ledger reconciliation tool. Written for the product owner to reuse as a specification and a build checklist.

- **Status of the sample:** working demo, synthetic data, runs entirely in the browser, no backend.
- **Where it lives:** `src/recon/` (tool) and `src/ToolPreview.tsx` (animated product-card preview), inside the NXT Foundry site repository.
- **Live route:** `#reconciliation-lab` (for example `#reconciliation-lab/statement/R3/M092026`).
- **Tests:** `npm run test:recon` runs 68 lifecycle checks against the engine. All pass.

---

## Contents

1. [What the sample is, and is not](#1-what-the-sample-is-and-is-not)
2. [Tech stack, repo layout, commands](#2-tech-stack-repo-layout-commands)
3. [Vocabulary](#3-vocabulary)
4. [Data model](#4-data-model)
5. [Business rules, in the order the engine applies them](#5-business-rules-in-the-order-the-engine-applies-them)
6. [Roles, permissions, the vendor view](#6-roles-permissions-the-vendor-view)
7. [Screens: specification and behaviour](#7-screens-specification-and-behaviour)
8. [Synthetic data and the scenarios it seeds](#8-synthetic-data-and-the-scenarios-it-seeds)
9. [The test suite](#9-the-test-suite)
10. [How we got here: the build in order, with every decision and correction](#10-how-we-got-here)
11. [Design principles that held up](#11-design-principles-that-held-up)
12. [What is mocked or simplified in the sample](#12-what-is-mocked-or-simplified-in-the-sample)
13. [Blueprint for the real tool](#13-blueprint-for-the-real-tool)
14. [Open questions and deferred items](#14-open-questions-and-deferred-items)
15. [Bugs we hit and what they taught us](#15-bugs-we-hit-and-what-they-taught-us)
16. [Acceptance checklist for the real build](#16-acceptance-checklist-for-the-real-build)

---

## 1. What the sample is, and is not

### What it is

A period-based, bilateral vendor payable reconciliation between a **buyer** (the company that owes money) and each of its **vendors**. For every buyer–vendor relationship and every period (month or quarter) the platform:

1. receives the vendor's ledger (in the vendor's own format or a standard format),
2. gets the buyer's ledger from the ERP,
3. checks that each ledger's **opening balance continues from its own previous closing**,
4. matches transactions automatically, in a fixed order, with explicit confidence levels,
5. puts everything it cannot match on an **unreconciled** list with owners, notes, evidence and ageing,
6. produces a **reconciliation statement** that starts at the buyer's closing balance and ends at the vendor's closing balance, explained by numbered **annexures**,
7. takes the statement through **share, vendor response (accept or raise concerns), sign-off, close** and **carry-forward** of unresolved items into the next period, keeping their original period tag.

### The four top-level screens

| Screen | Sub-tabs | State in the sample |
|---|---|---|
| Credit Mapping | Unmapped Credits, Mapped Credits | Placeholders. Deliberately deferred ("will be discussed and built later") |
| Reconciliation | Dashboard, Vendor Ledger Upload, Reconciled Transactions, Unreconciled Transactions, Reconciliation Statement | Built |
| Balance Confirmation | none | Placeholder. Deferred |
| Admin Settings | Policy, Matching stages, Sign convention, Import profiles, Users and roles, **Vendor map**, Master data | Built ("fine for now") |

### What it is not

- Not a production system: no server, no database, no authentication, no ERP connection, no real AI extraction. All state is held in memory and resets on reload.
- Not the whole product. The brief was explicit: build a sample that shows how the product behaves, not the entire product.
- Not based on any real company's data or branding. Everything is synthetic (see section 8).

---

## 2. Tech stack, repo layout, commands

**Stack:** React 19, Vite, TypeScript (strict). Hash routing implemented in `src/main.tsx` (anything under `#reconciliation-lab/...` renders the tool). No UI library. Styling is plain CSS (`src/recon/app.css`) on top of the site's theme tokens (lime green, white, black).

**Deployment:** the site is deployed from `main` on Vercel. Every commit to `main` redeploys.

### Files in `src/recon/`

| File | Responsibility |
|---|---|
| `cycle.ts` | **The engine.** Types, import and preview, opening balance gate, matching stages, candidates, manual and forced matches, reversals, open items and exceptions, adjustments, statement and bridge, sign-off workflow, close and carry-forward, credit-note mapping notes. Pure functions: every action takes a `RelState` and returns a `Result<RelState>`. No UI. |
| `engine.ts` | Normalisation utilities only: `parseDate`, `parseAmount`, `normRef`, `normName`, `toCSV`. |
| `ledger.ts` | Synthetic master data (buyer, entities, vendors, relationships), period definitions, the seeded generator that produces ledger files and "truth". Also `tagLabel`/`MONTHS` (period naming). |
| `store.ts` | Workspace (all relationships + files + settings + current user + vendor requests), users and roles, `drive()` (runs a period through the whole cycle for the simulated history), `initWorkspace()`, and **`autoReconcile()`** (the automation that runs after a ledger arrives). |
| `annex.ts` | The nine-annexure classification shared by the statement, the Unreconciled screen and the Dashboard, so all three always agree. |
| `App.tsx` | Shell: header, four-screen navigation, sub-tabs, vendor picker, period calendar, user switcher, routing, toasts, audit log drawer, vendor-request queue, shared `Ctx`. |
| `Dashboard.tsx` | Dashboard sub-tab. |
| `LedgerUpload.tsx` | Vendor Ledger Upload sub-tab and the upload drawer (format choice, calendar, AI scrutiny steps). |
| `Reconcile.tsx` | Reconciled Transactions sub-tab. Also exports shared drawers (`GateCard`, `ImportDrawer`, `ApproveDrawer`, `UploadDrawer`). |
| `OpenItems.tsx` | Unreconciled Transactions sub-tab: Suggested match, Partially reconciled, Open items. Also the item detail drawer and the match drawer. |
| `PairTable.tsx` | The two-sided table (buyer items | vendor items | difference) used by Reconciled and by two Unreconciled tabs. |
| `Balance.tsx` | Reconciliation Statement sub-tab, sign-off flow, Excel export. |
| `History.tsx` | Period cards and carry-forward, reversal, adjustment and sign-off tables, shown under the statement. |
| `Settings.tsx` | Admin Settings. |
| `ui.tsx` | Shared components: data table, drawer, pills, period calendar and picker, collapsible strip, formatting helpers. |
| `csv.ts`, `xlsx.ts` | CSV parser; a small `.xlsx` writer (zip "store" mode with CRC32, no dependency). |
| `app.css` | All styles for the tool. |
| `scripts/recon-check.ts` | The 68 lifecycle tests. |

### Commands

```bash
npm run dev          # dev server (this project uses port 5173)
npm run build        # type-check (tsc -b) then vite build
npm run test:recon   # engine lifecycle tests
```

### Working agreements used throughout

- After every change: commit and push to `main` with a short plain message. (npm publishing stays manual.)
- No fees or prices anywhere on the site.
- The owner's personal name is not disclosed on the site; copy uses "we".
- Synthetic data only. No real vendor, person or company names; no third-party branding.

---

## 3. Vocabulary

| Term | Meaning in this tool |
|---|---|
| **Buyer** | The company that owes money. Its ledger is the **payable** view. |
| **Vendor** | The supplier. Its ledger is the **receivable** view. |
| **Relationship** | One buyer *entity* + *business unit* + *vendor* + *currency*. The unit of reconciliation. A vendor with two business units or two currencies has separate relationships. Nothing can match across relationships. |
| **Period** | A month or quarter. Quarterly relationships use quarter grids. |
| **Period tag** | A compact id: monthly `M062026` (June 2026), quarterly `Q092026` (quarter ending September 2026). Used for annexure and statement references only. Everywhere else the UI writes "June 2026" or "July – September 2026". |
| **Open period** (a.k.a. original period) | The period in which an item first appeared. It never changes, however many periods the item stays open. |
| **Carry-forward** | When a period closes, unresolved items move into the next period with their original period tag. |
| **Opening balance gate** | The check, before any matching, that each ledger's opening equals its own previous closing (plus back-dated entries). |
| **Contra** | Two entries *within the same ledger* that cancel each other (an invoice and its reversal; a payment and its reversal). Buyer-to-buyer or vendor-to-vendor. Never across ledgers. |
| **Match** | Entries across the two ledgers that agree. One to one, one to many, many to one, many to many. |
| **Candidate / suggested match** | A probable pairing the engine will not close by itself. A reviewer confirms or rejects. |
| **Partial match (forced match)** | A reviewer links buyer and vendor items that do **not** net to zero. The difference stays open. |
| **Annexure** | A numbered schedule of unreconciled items that explains part of the difference between the two closing balances. |
| **Bridge** | Closing balance per buyer → annexures → closing balance per vendor. |
| **Sign-off** | The vendor accepts the shared statement. |

---

## 4. Data model

Types live in `cycle.ts`. In plain terms:

- **`Relationship`**: `id, buyerId, entityId, bu, vendorId, vendorCode, currency, frequency (Monthly|Quarterly), owner, status`.
- **`PeriodDef`**: `tag, type, start, end, label`.
- **`LedgerFile`**: `id, relId, side (B|V), periodTag, kind (period | backdated | historical), fileName, source, availableAt, opening, closing, rows`.
  - `period`: the normal ledger for that period.
  - `backdated`: entries a party posted into an already closed period (explains an opening that differs from the previous closing).
  - `historical`: open items from before onboarding (new vendor).
- **Ledger row columns (standard template):** `Line ID, Document No, Document Date, Posting Date, Type, Debit, Credit, Reference, Against Doc, Narration, Period Tag`. Required: Line ID, Document No, Document Date, Type, Debit, Credit.
- **`Txn`** (a normalised transaction): `id, relId, side, type, docNo, docNorm, date, ref, refNorm, against, againstNorm, amount (signed), narration, originTag, importedIn, kind, fileId, line, raw (source row kept), issues`.
- **`TxnType`**: `INV, INVREV, DN, DNREV, CN, CNREV, PAY, PAYREV, TDS, TDSREV`. `FAMILY` maps a reversal to its base type.
- **`MatchRec`**: `id, kind (contra|match|adjustment), stage, rule, confidence (Exact|Rule-based|Probable|Manual), buyerIds, vendorIds, explanation, amountDiff, dateDiff, by, at, periodTag, engine, reversed?, partial?`.
- **`Candidate`**: `id, stage, kind (contra|probable), buyerIds, vendorIds, score, reasons, status (pending|confirmed|rejected|superseded), periodTag, by?, at?`.
- **`Adjustment`**: `kind (opening-continuity | opening-position | rounding | accounting), side, amount, txnIds, reason, evidence, requestedBy, approvedBy, status`.
- **`ExRec`** (exception record on an open item): `status, owner, priority, action, resolutionRef, notes[], evidence[]`.
- **`Period`** (per relationship): `tag, imports {B,V}, extraFiles, opening {B,V}, closing {B,V}, prevClosing {B,V}, phase, version, stages, signoffs[], snapshot, carriedIn[], carriedOut[], dates`.
- **`RelState`**: the whole state of one relationship: periods, txns, matches, candidates, adjustments, exceptions, carry log, credit map, audit log.
- **`Workspace`** (`store.ts`): `states` (by relationship), `files`, `truth`, `settings`, `userId`, `requests` (vendor requests).
- **`Result<T>`**: `{ ok: true, state } | { ok: false, error }`. Every engine action returns this, so the UI can show the exact reason an action was refused.

---

## 5. Business rules, in the order the engine applies them

### 5.1 Sign convention

Both ledgers are normalised to the **buyer's payable view** so they can be compared directly.

| Type | Sign |
|---|---|
| Invoice (INV), Debit note (DN) | + |
| Credit note (CN), Payment (PAY), TDS | − |
| Reversals (…REV) | opposite of the base type |

- Buyer signed amount = credit − debit. Vendor signed amount = debit − credit.
- A matched pair therefore has equal signed amounts. A difference is simply buyer − vendor.
- The sign table is locked once a relationship has imported data (changing it would restate history).

### 5.2 Relationship scope

Entity + business unit + vendor + currency. The engine refuses any action that mixes transactions from two relationships (tested). A vendor with two business units or two currencies is two relationships.

### 5.3 Periods and tags

- Monthly tag `MMYYYY` prefixed `M`; quarterly `Q` + end month + year.
- Period labels in the UI use full names: "September 2026", "July – September 2026".
- **Rule we settled on after feedback:** the compact tag appears only on statement/annexure contexts. Everything else is plain language.
- Period selection is a **calendar grid** (month grid, or quarter grid), not a dropdown. Periods that have started are open; **upcoming periods and periods before the reconciliation began are greyed out**.

### 5.4 Import and duplicate protection

- Import has a **preview** step: lines in file, lines that will import, rejected lines (with reason), duplicates, counts by type, integrity (opening + lines = closing), warnings, and a table of normalised lines with the source values alongside.
- **Duplicate identity** = side + type + normalised document number + date + amount + normalised reference. A file that would recreate an already imported (or already closed) transaction does not.
- A period has one period ledger per side. A second period file for the same side is refused.
- File integrity must hold: opening + signed lines = closing. A mismatch is flagged in the preview.
- Credit/debit notes that carry an "against" document are recorded in a credit map automatically (method "Reference on note").

### 5.5 Opening balance gate (the main check)

Runs as soon as both ledgers for a period are in. **Matching does not run until it passes or is formally approved.**

- **Not the first period:** for each side separately,
  `expected opening = previous closing of that side + back-dated entries supplied for that side`
  `variance = opening per ledger − expected opening`.
  Variance zero → PASSED. Otherwise FAILED.
- Buyer continuity and vendor continuity are checked **separately**. (Tested: buyer passes while vendor fails.)
- The buyer–vendor difference at the previous close is shown as **information only**. It is not an opening error; it is explained by the carried open items.
- A FAILED opening can be resolved two ways:
  1. **Upload the back-dated entries** the vendor supplied for the closed period, which explains the variance, or
  2. **Approve the explained difference**: an **approver** records the amount, a **reason** and **evidence reference**. It becomes an adjustment on the statement. Nothing in either ledger is changed.
- **First period of a relationship (new vendor):** no previous closing exists. The check is the **opening position**:
  `buyer opening − buyer historical items` versus `vendor opening − vendor historical items`.
  If they differ, status is UNVERIFIED and an approver must approve the position with evidence. It is **never assumed to be zero**.
- On the screen the gate is shown as a table: Previous closing, Back-dated entries, Expected opening, Opening per ledger, Variance, Result, for **vendor first** (the vendor's own continuity is the one the vendor controls) then buyer.
- Each uploaded ledger also shows prior closing / current opening / variance in the "All uploaded ledgers" table.

### 5.6 The automatic cycle

Matching is fully automatic. There are no "Run stage" buttons in the product.

`autoReconcile(state, workspace, tag, at)` in `store.ts`:

1. Only acts while the period is in the *working* phase.
2. Fetches the buyer's ERP ledger for the period if it is not in yet (importing as "ERP connector"), and imports any historical onboarding files.
3. If both ledgers are in **and** the gate passes, runs every enabled stage in order.
4. Is called after: a vendor ledger upload, an approval of an opening difference, and an upload of back-dated entries.

Result: the statement, reconciled items, unreconciled items and open items are produced without anyone pressing anything.

### 5.7 Matching stages (fixed order)

Stages must run in order; a later stage cannot run before an earlier one. TDS and Payment+TDS can be switched off in Settings; the others cannot.

| # | Stage | What it does |
|---|---|---|
| 1 | **Contra, buyer ledger** | Reversals inside the buyer's own entries. |
| 2 | **Contra, vendor ledger** | The same inside the vendor's entries. |
| 3 | **Invoices and debit notes** | Key = type + normalised document number. A group closes only if signed sums agree exactly. Exact if the raw document numbers are identical, Rule-based if they only agree after normalisation. |
| 4 | **Credit notes** | First by credit-note number + amount. Then by **original invoice + amount** (using the credit map) when the two sides numbered the note differently. |
| 5 | **Payments** | By UTR / bank reference (normalised). One-to-many and many-to-one allowed **when sums agree**. 1:1 is Exact; grouped is Rule-based. |
| 6 | **TDS** (optional) | Same invoice reference, same amount. |
| 7 | **Payment + TDS** (optional) | A payment and TDS together against one receipt on the other side: requires the **same invoice reference AND a supporting UTR/reference**, and the sums must be exact. Both directions are tried (buyer paid + TDS ↔ vendor receipt, and the reverse). |
| 8 | **Other candidates** | Scored suggestions only. **Never closed without a reviewer.** |

**Contra detail (stages 1 and 2):** for each reversal, find an original of the base type with the equal and opposite amount, dated on or before the reversal.
- Reversal references the original (document or UTR) → **Exact** contra, closed.
- Reversal number = original number + `R`/`REV`(+digits) → **Rule-based** contra, closed.
- Equal and opposite but nothing links them (within 60 days) → only a **possible contra candidate** (score 55), never closed automatically. While pending, neither item is available to cross-ledger stages.

**"Other candidates" scoring** (same type family, not reversals):

| Signal | Points |
|---|---|
| Same amount | +40 |
| Amount within 1% (otherwise the pair is dropped) | +20 |
| Dates within 3 days | +20 |
| Dates within the date window (default 10 days) | +10 |
| Numbers end in the same last 3 digits | +25 |
| Otherwise, references look similar (≥ 60% similarity) | +15 |
| **Pattern-assisted:** the same prefix pair (e.g. buyer "DC…" ↔ vendor "DEC/…") was confirmed before | +15 |

A pair becomes a candidate at or above the threshold (default **60**), capped at 99. Pairs are taken highest score first; an item can be in only one pair.

**Pattern learning:** every confirmed "other" match teaches the engine a prefix pair. The next period's candidates for the same pattern score higher and say so in their reasons ("Pattern-assisted … confirmed n time(s) before").

**Confidence labels** shown everywhere: Exact, Rule-based, Probable (confirmed suggestion), Manual.

**Guarantees (tested):**
- A transaction is in at most one active match.
- A group closes only when its signed sums net to **exactly zero**. A pending "other" suggestion may be overtaken (superseded) by a deterministic stage; a pending **contra** suggestion blocks the items from every stage until decided.
- Probable matches are proposed, never auto-confirmed.

### 5.8 Review decisions

- **Confirm a suggestion:** closes both sides. The match is recorded with confidence Probable and the reviewer's name. **Refused if the pair has an amount gap** (no silent adjustment).
- **Reject:** items stay open; the candidate is marked rejected and is not proposed again.
- **Manual match** (`manualMatch`): reviewer selects open items.
  - Both sides selected: must net to zero → recorded as `Manual grouped match b:v`.
  - **One side only:** treated as a **contra** (buyer to buyer, or vendor to vendor). Must net to zero. (Buyer and vendor items are never mixed in a contra.)
  - Items must be open, in the same relationship, and in a period that is not locked.
- **Forced match (partial match):** when buyer and vendor items **do not net to zero**, the reviewer can *force* the link. Rule label "Forced partial match b:v". The record is flagged `partial`. Behaviour:
  - the items **stay open** for the statement (the difference is real and still unreconciled), so the bridge still balances;
  - the pair is **hidden from the open-items tables** and **excluded from automatic stages** and further matching until reversed;
  - it is listed under **Partially reconciled** on the Unreconciled screen, with the difference, and a **Reverse** action;
  - it does **not** appear on Reconciled Transactions (that screen is only for matches with zero difference);
  - a contra can never be forced (one side only must net to zero).
- **Reverse a match:** items reopen **with their original period tag**; the reversal records who, when, why, and in which period. A match made in a closed period can be reversed only by an approver. Reason is mandatory.
- **Bucket rules the owner set explicitly:**
  - Reconciled bucket = confirmed matches with zero difference.
  - Not reconciled → Unreconciled bucket.
  - Reversing a reconciled match moves its items back to Unreconciled.
  - Suggested matches belong to Unreconciled until confirmed.
  - A forced match with a difference is "Partially reconciled" (Unreconciled screen).

### 5.9 Open items (unreconciled) and exceptions

Everything in the open pool (imported up to this period, not in an active match). Each item gets:

- **Category** (drives the recommended action):

| Category | When |
|---|---|
| Suggested match pending / Possible contra pending | in a pending candidate |
| Amount mismatch | invoice/DN/CN with the same document number on the other side but different amount |
| Payment amount mismatch | same UTR on the other side, different amount |
| Reversal without original | a reversal (not payment) with no original |
| Not booked by vendor / Not booked by buyer | invoice only on one side |
| Payment not credited by vendor / Receipt not recorded by buyer | payment only on one side |
| TDS not recognised by vendor / TDS not recorded by buyer | TDS only on one side |
| Credit/debit note not booked by vendor / by buyer | CN/DN only on one side |

- **Possible timing difference** flag: item dated within `timingDays` (default 5) of the period end *and* imported in this period.
- **Age** in days from period end; **carried** count from the carry log.
- **Priority**: High / Medium / Low by amount (INR 1,00,000 / 25,000; USD 1,500 / 400).
- **Owner** (defaults to the relationship owner), **status**, notes, evidence, recommended action text.
- **Exception statuses:** Open, Under Investigation, Awaiting Buyer, Awaiting Vendor, Awaiting Supporting Documents, Awaiting Internal Approval, Proposed Adjustment, Resolved, Closed, Closed - No Adjustment.
- **Rule:** a user can set only the *manual* statuses (Open, Under Investigation, Awaiting Buyer/Vendor/Supporting Documents). **Resolved and Closed can never be set by hand**: they happen only through a match, a reversal or an approved adjustment. (Tested.)

### 5.10 Adjustments and segregation of duties

- A preparer can **propose** an adjustment for open items (reason and evidence). It is not applied until an approver approves it.
- **The proposer cannot approve their own adjustment** (tested).
- Approval settles the items in the reconciliation. It does **not** post to either ledger.
- Adjustment kinds: opening-continuity, opening-position, rounding, accounting.

### 5.11 The statement and the bridge

```
buyer closing − vendor closing  =  open buyer items − open vendor items
                                    + approved adjustments
                                    + unexplained
```

- Rounding tolerance: **INR 500, USD 10** (editable in Settings).
- **Unexplained is shown, never absorbed.**
  - Within tolerance: the preparer sees it, and an **approver** may record it as a **rounding adjustment with a reason**. Only then can the statement be prepared.
  - Above tolerance: investigate (import integrity, missing lines). Cannot be rounded.
- A statement can be prepared only when matching has finished and the bridge is balanced.

### 5.12 The nine-annexure layout

The statement reads like a classic reconciliation statement:

```
Closing balance as per buyer                                     X
Add / (less):
  Annexure 1  Invoices subsequently accounted by buyer
  Annexure 2  Invoices not accounted by buyer
  Annexure 3  Invoices partially matched
  Annexure 4  Invoices not accounted by vendor
  Annexure 5  Credit notes
       5a  subsequently or not accounted by buyer
       5b  partially matched
       5c  subsequently or not accounted by vendor
  Annexure 6  Payments not accounted by buyer
  Annexure 7  Payments partially matched
  Annexure 8  Payments not accounted by vendor
  Annexure 9  TDS
       9a  not accounted by buyer
       9b  partially matched
       9c  not accounted by vendor
  (approved adjustments, unexplained, if any)
Closing balance as per vendor                                    Y
```

**Classification (in `annex.ts`):** by transaction family and by side/state.

- "Not accounted by buyer" = the item is in the **vendor's** books only. "Not accounted by vendor" = in the **buyer's** books only.
- "Partially matched" = the item is held in a forced (partial) match.
- "Subsequently accounted by buyer" (Annexure 1) = vendor invoice/DN flagged as a **timing difference** (dated close to the period end, so the buyer is expected to book it shortly).
- Every open item falls in **exactly one** section, so the annexures sum exactly to the difference.

**Effect of an item on the bridge:** moving from buyer closing to vendor closing, items **only the buyer has are taken out** (−amount) and items **only the vendor has are added** (+amount).

**Rules the owner set:**
- Annexures are **as per the unreconciled values** on the Unreconciled screen.
- **The sum of all annexures equals the difference in closing balances.** A check strip shows: difference in closing balances, sum of annexures, and a tick.
- **Annexures with no values, or that net to zero, are not shown** (statement lines, detail, chart and Excel).
- Numbering is fixed (an absent annexure leaves a gap; it is not renumbered).
- Annexure detail is a **tabbed view** (one tab per shown annexure). Clicking an annexure line on the statement selects its tab and scrolls to it.
- **Tie-back:** every item on the Unreconciled screen shows "Annexure 4 · M092026" (number + annexure tag = the original period tag). Suggested/partial rows list the annexures of both sides.

### 5.13 Workflow, sign-off, versions

Phases: `working → prepared → shared → (accepted | disputed) → signed → closed`.

| Status shown | Meaning |
|---|---|
| Awaiting ledgers | one or both ledgers not in |
| Opening check | gate failing, matching paused |
| Matching | stages still to run |
| In review | all stages ran, reviewer work remains |
| Statement prepared | buyer prepared it |
| With vendor | shared, waiting for the vendor |
| Vendor accepted | (transitional; in the current flow acceptance signs off directly) |
| Vendor disputed | vendor raised concerns |
| Signed off | accepted and signed |
| Closed | closed and carried forward |

- **Prepare** (buyer): only when matching is done and the bridge balances. A frozen **snapshot** of the statement is stored.
- **Share with vendor** (buyer).
- **Vendor response is the vendor's, not the buyer team's.** The buyer team sees "Waiting for the vendor". The vendor sees a form:
  - **Accept and sign off**: records acceptance and signs the statement off in one step.
  - **Raise concerns**: disabled until a **justification** is written. Moves to "Vendor disputed"; the buyer sees the justification on the statement.
- **Reopen** (approver, with a reason): creates **version n+1** and unfreezes the period. Any change to a prepared/signed statement must go through this. A signed statement cannot change silently.
- **Close and carry forward** (approver): atomic. Unresolved items move to the next period with their original tags; matches, contras and settled items stay closed. Re-uploading a closed transaction does not recreate it.
- A frozen version is shown exactly "as prepared/closed" with its timestamp.

### 5.14 Credit-note mapping notes (engine side)

The engine supports mapping a credit/debit note to the invoice it adjusts (`noteMappings`, `mapNote`) and uses that mapping in the credit-note stage. The *screens* for this (Credit Mapping) are deliberately not built yet.

---

## 6. Roles, permissions, the vendor view

### Users in the sample (the switcher stands in for sign-in)

| User | Role | Notes |
|---|---|---|
| Priya Nair | Preparer | Buyer team. Cannot approve. |
| Arjun Mehta | Approver | Buyer team. Approves openings, adjustments, rounding, reopen, close. |
| System admin | Admin | Can approve and change policy. |
| R. Iyer | Vendor | Kaveri Packaging only. |
| S. Reddy | Vendor | Deccan Polymers only. |

`canApprove` = Approver or Admin. **A vendor can never approve.**

### Permission summary

| Action | Preparer | Approver | Vendor |
|---|---|---|---|
| Import ledgers, review, manual/forced match | yes | yes | request only |
| Confirm/reject suggestions | yes | yes | request only |
| Reverse a match | yes (current period) | yes (also closed periods) | request only |
| Approve opening differences, rounding, accounting adjustments | no | yes | no |
| Prepare, share statement | yes | yes | no |
| Reopen, final close, carry forward | no | yes | no |
| Change policy | no | yes | no |
| Accept / raise concerns on a shared statement | no | no | **yes** |

### The vendor view

- A vendor user sees **every screen**, but **only their own vendor's relationships** (the picker, dashboard and everything else are filtered).
- A blue notice states that their actions go to the buyer for review.
- **Vendor actions are requests.** Match, forced match, reverse, confirm a suggestion, reject a suggestion are stored as **vendor requests** (`REQ-001` …) with who, when, reason and a summary of the items. **Nothing changes in the reconciliation until the buyer approves.**
- The buyer sees "Vendor requests · n awaiting your review" on the Unreconciled screen with **Approve** (which applies the action through the normal engine, recording the vendor as requester and the buyer as reviewer) or **Reject**. If the engine refuses (for example the items no longer net to zero), the buyer sees the reason and the request stays pending.
- The vendor sees their own requests with status (With buyer, Approved, Rejected).
- The vendor's **statement response** (accept or raise concerns) is theirs to give directly; it is not a request.

### Vendor map (Admin Settings)

A table of every relationship: vendor, vendor user (name, email, "Can sign in" or "No login yet"), buyer owner, entity and business unit, frequency, current period and the **live workflow status**.

---

## 7. Screens: specification and behaviour

### 7.1 Shell

- Dark top bar: product name, buyer name, **vendor picker** (searchable relationship picker, shown on all Reconciliation sub-tabs except the Dashboard), **period picker** (calendar popover), **Audit log** button, **user switcher**.
- Primary navigation: four screens. Sub-tabs under Reconciliation: Dashboard, Vendor Ledger Upload, Reconciled Transactions, Unreconciled Transactions (with an open-items badge), Reconciliation Statement (with a ✓/! balance badge).
- A context strip under the tabs shows the vendor legal name, code, entity, business unit, currency, frequency, the status pill and the period name (and version when above 1).
- **Demo notice** ("Illustrative NXT Foundry demo · synthetic data…") is **pinned to the bottom of the window**, always visible however the page scrolls.
- **Audit log** drawer: who did what, when, why, with before/after where applicable.
- Routing: `#reconciliation-lab/<screen>/<relationshipId>/<periodTag>`.

### 7.2 Dashboard

- **Summary tiles, values only** (label + number; the description is a hover tooltip): vendor relationships, ledgers awaited, opening check failing, with vendor for sign-off, open items, unmatched value, suggested matches, partially reconciled, vendor requests, vendor concerns raised. The strip can be **folded away**.
- **Vendors table:** one row per relationship for its current period. Columns: vendor, period, status, buyer closing, vendor closing, difference, matched, open buyer/vendor counts, suggested, partial, vendor requests (counts link to the Unreconciled screen), then **A1 to A9: the value of each annexure for that vendor**, unexplained, and a context-aware **Next** button.
- A legend explains A1–A9; the values add up to the difference.
- Expanding a row shows the balance summary and the annexure table (number, what it holds, items, effect), with buttons to the statement, unreconciled and upload screens.
- Entity and business-unit filters; sortable columns; CSV export.

### 7.3 Vendor Ledger Upload

Built around a real ledger-upload screen the owner supplied as a reference (layout and fields only; no branding reused).

- **Balance strip** for the selected period: entity, vendor, **entity closing balance (CB)**, **vendor closing balance (CB)**, **difference**. Actions: Upload ledger, download the vendor ledger.
- **Source strip:**
  - Buyer ledger: **"Fetched from ERP on <date>"**, or "Uploaded on <date>" if the ERP is not available.
  - Vendor ledger: uploaded date and file name.
  - Previous period: name, closed date, carried-in count.
- **Opening and closing balance check** table (vendor first, then buyer): previous closing, back-dated entries, opening per ledger, variance, result. The main check is **OB (vendor) must match the previous CB (vendor)**.
- **What happens for <period>** timeline: vendor ledger → **AI scrutiny** → buyer ledger → opening balance check → reconciliation → statement. Links to Reconciled, Unreconciled and Statement with counts.
- **Opening balance check needs attention** card appears only when the gate fails, with the actions from 5.5.
- **All uploaded ledgers** table: #, Job ID, status, vendor/user, uploaded, period, buyer ledger (date and "Fetched from ERP"/"Uploaded"), **Download** links (vendor ledger as received, **standardised copy**, buyer ledger), prior closing, current opening, variance. Vendors can download previous periods' ledgers from here.
- **Upload drawer** (right side):
  1. Choose **"Your own format"** (the platform's AI reads the layout) or **"Standard ledger format"** (template download).
  2. Choose the period on the **calendar** (blocked with a clear message if the period is closed or already has a ledger).
  3. Optional comment, attach file (CSV in the sample; XLS, XLSX, XLSB in the real product).
  4. **AI scrutiny** steps tick through (reading the file, detecting layout and headings, mapping columns to the standard ledger fields, normalising dates/amounts/document numbers, reading opening and closing, checking opening against previous closing).
  5. **Review screen:** lines read, opening, closing, integrity (opening + lines = closing), opening vs previous closing with variance, and (for own format) the column-mapping table with confidence. Nothing is pushed until the user chooses **Push to reconciliation**, which imports and runs the automatic cycle.
- Period names are plain ("September 2026"), never the tag.

### 7.4 Reconciled Transactions

Only **confirmed matches with a zero difference** (no open items, no suggestions, no partial matches).

- **Cue cards** (collapsible strip): All reconciled, Invoices & debit notes, Credit notes, Payments, TDS, Payment + TDS, Contra, Reviewed / manual. Each shows **count and value**; hover shows **buyer item count and vendor item count and value**; click filters the table; zero cards are dimmed.
- **One two-sided table**, one row per match group. Matched buyer and vendor entries sit on the **same row**.
  - Columns: Open period | Match type | **Buyer items** (document no., type, date, amount, reference, source, status) | **Vendor items** (same columns) | Difference (buyer − vendor) | action.
  - **Match type**: One to one, One to many, Many to one, Many to many, Contra, plus the rule beneath (for example "Payments", "TDS").
  - **Status colours:** green **Matched** (automatic), purple **Manual match** (made by hand), orange **Suggested match** (suggested then confirmed).
  - Per-row **Reverse** (reason required) moves the items back to Unreconciled.
  - Filters: match type, search by document or reference; CSV export; "show more" paging.

### 7.5 Unreconciled Transactions

Three tabs (plain tabs, not cue cards), same layout as Reconciled, with the same collapsible cue-card strip (**All**, Invoices & debit notes, Credit notes, Payments, TDS: count and value; hover shows buyer/vendor counts; click filters the tab).

1. **Suggested match**: pairs shown on one row, with match type "(suggested)", score and reasons, the annexures of both sides, and **Match** / **Reject** (vendors see "Request match" / "Request reject").
2. **Partially reconciled**: forced matches with a difference, status "Partial match", the difference shown, **Reverse** (reason required; returns items to Open items).
3. **Open items**: the **1×2 matrix**: **buyer items** and **vendor items** as two separate tables side by side (stacked on narrow screens).
   - Columns: select, **Annexure** ("Annexure 4 · M092026"), open period, document no. (click for the item drawer), type, date, amount, reference, age, status.
   - Select one or many entries on either side. A bar shows **Buyer total, Vendor total, Difference (buyer − vendor)** (or "Net of selection" if only one side is selected), updating live. Each table also has a **Total** row and a **Selected** row.
   - The action button adapts: "Match selected", "Match as buyer contra", "Match as vendor contra".
   - **Side drawer (compact):** buyer entries, vendor entries, buyer value, vendor value, **difference**, **remarks (required)**, **supporting files** (styled attach control with removable file chips). The primary button reads **Record match**, **Record contra**, or **Force match** (when the difference is not zero; a contra cannot be forced).
   - **Pending adjustments** card for approvals (proposer cannot approve).
- **Vendor requests** card at the top: pending requests for the buyer to approve/reject; the vendor's own requests with status.
- **Item drawer** (from a document number): lineage, notes, evidence, owner/priority/status updates (manual statuses only), propose an adjustment.

### 7.6 Reconciliation Statement

- Header: vendor legal name, code, GSTIN, entity, business unit, currency, period name, version, status.
- **The bridge** (5.12), annexure lines clickable.
- **Sum check strip:** difference in closing balances | sum of all annexures | ✓.
- **Annexures card:** tabs, one per shown annexure; sub-sections for 5 and 9; columns: annexure tag, document no., type, date, buyer amount, vendor amount, reference, status, effect; totals per section.
- **Side card "Where the difference sits":** a simple bar per annexure (replaced the original waterfall chart).
- **Review and sign-off card:** five-step flow (Prepared, Shared with vendor, Vendor response, Final sign-off, Closed); controls depend on role and phase (5.13). Rounding approval panel when unexplained is within tolerance. Reopen (with reason). **Record** (sign-off history) is collapsed to the **last two entries** with a "Show all" toggle.
- **Download Excel pack** contains: Statement (the bridge), **Buyer Ledger**, **Vendor Ledger**, **Annexure 1 … 9** (only those with values; one sheet each, with sub-sections), **Reconciled Transactions**, Sign-off. "PDF" uses the browser's print with print styles that hide navigation.
- **Previous periods** (History): compact cards (period name, status, Statement and Workspace buttons in the header row, six figures, one-line note), then tabs for carry-forward movements, match reversals, adjustments, sign-off and closure.

### 7.7 Admin Settings

Tabs: **Reconciliation policy** (tolerances by currency, probable threshold, date window, timing days), **Matching stages** (order fixed; TDS and Payment+TDS switchable), **Sign convention** (read-only table), **Import profiles** (field mapping from ERP extract and vendor statement), **Users and roles** (switcher, permissions table), **Vendor map**, **Master data** (entities, vendors, relationships). Policy is editable by approvers/admins only.

### 7.8 Product card on the site

The Products page card is named **Vendor Payable Reconciliation** (internal product name "NXT Vendor Payable Reconciliation"), with a single "Open the live tool" button. Its visual is an animated, looping preview drawn in code (`ToolPreview.tsx`), about 14 seconds, four scenes: Upload, Reconcile, Statement, Review. It pauses off-screen, pauses when the tab is hidden, and shows a still frame under `prefers-reduced-motion`.

---

## 8. Synthetic data and the scenarios it seeds

Everything fictional: buyer "Meridian Consumer Products"; two legal entities (a Pvt. Ltd. and an Exports LLP); six vendors; eight relationships. `TODAY` is fixed at **9 November 2026**. A seeded generator makes every run identical (test: "Generator is deterministic").

| Rel | Vendor | Scenario seeded |
|---|---|---|
| R1 | Kaveri Packaging, Foods | Vendor ledger for the current period not yet uploaded (waiting). Same vendor as R2 but a different business unit, to prove relationships stay separate. |
| R2 | Kaveri Packaging, Home Care | Vendor opening does not continue from last close because of an entry the vendor **back-dated** into a closed period. Opening check fails until the back-dated file is uploaded or approved. |
| R3 | Deccan Polymers, Home Care | An **amount difference from June** still open in September (original tag M062026, carried several times, notes preserved); a vendor invoice from July matched in September once the buyer booked it; **delivery-challan numbers** on the buyer side vs invoice numbers on the vendor side → pattern-assisted suggestions. |
| R4 | Sahyadri Agro (quarterly) | A quarterly relationship; sits in "With vendor". |
| R5 | Nandi Logistics | **TDS** cases, **payment + TDS = receipt**, payment reversal, a loose reversal proposed as a possible contra, TDS booked by the buyer but not the vendor. |
| R6 | Coromandel Chemicals (INR) | Fully run through: closed and signed periods. |
| R7 | Coromandel Chemicals (USD) | **USD rounding** gap of 3.20 within the USD 10 tolerance, approved as rounding; vendor disputed. |
| R8 | Konkan Spices | **New vendor**: first period, **historical open items** from before onboarding, and an **unverified opening position** (−2,350) that needs approval with evidence. |

Closed history: monthly relationships have three closed periods before the current one, each closed balanced exactly (tested). Simulated history is produced by `drive()` using the generator's "truth", so earlier periods look like real work was done.

---

## 9. The test suite

`scripts/recon-check.ts`, 68 checks, run with `npm run test:recon`. They build small hand-made ledgers for precise rules, then check the generated workspace. Groupings:

- **Imports:** matching blocked until both ledgers are imported; duplicate import refused; first-period opening position agreed.
- **Order:** stages must run in order.
- **Contra:** invoice + reversal by reference; payment + reversal by UTR; equal-and-opposite without a link is only proposed.
- **Matching:** normalised invoice number; debit note; amount mismatch stays open; payment one-to-many by UTR; TDS; payment + TDS; probable proposed not confirmed; credit mapping and credit note by original invoice + amount; confirmed probable closes both items.
- **Integrity:** no transaction in two active matches; cross-relationship match blocked; manual match not netting to zero refused.
- **Bridge:** balances; reversal reopens with the original tag and keeps the bridge exact.
- **Exceptions and adjustments:** Resolved/Closed cannot be set by hand; segregation of duties; an approved adjustment settles the item and the bridge still balances.
- **Workflow:** locked after prepare; dispute recorded; reopen needs an approver and creates a new version; close needs an approver; carry-forward carries exactly the unresolved items; closed matches are not carried.
- **Continuity:** buyer passes while vendor fails; matching blocked while it fails; approval needs reason and evidence; back-dated entry explains the vendor opening; carried items match in the next period; annexures group by originating period.
- **Rounding:** within tolerance is shown, not treated as reconciled; rounding needs an approver and records reason.
- **Three periods:** an item open since period 1 is still open in period 3 with its tag; a period-1 match stays closed; an item resolved in period 2 is not carried to period 3; re-uploading a closed transaction does not recreate it.
- **New vendor:** unverified position; approved position plus historical items explains the difference.
- **Workspace:** eight relationships across two entities, three business units, two currencies; every closed historical period balanced exactly; matches never cross relationships; each seeded scenario is present; every relationship sits at its expected period; the generator is deterministic.

**Not covered by automated tests** (checked by hand in the browser): UI behaviour, the Excel pack, force match / partial match, annexure classification, vendor requests, vendor sign-off. **Add tests for these in the real build** (see section 16).

---

## 10. How we got here

The order of work, with the instruction that drove each step and every correction. Useful as a decision log.

### Phase A: Marketing site changes (context)

1. Reworked "What we do" as a **management consulting** site (not a tech site), using the content structure of a public programme page as inspiration. "We" voice; owner's name not disclosed.
2. **No fees anywhere**; FAQ and CTAs say "connect with us".
3. Rewrote "Our approach" to feel genuine and hard-worked.
4. Added images (free stock photos, nine downloaded with approval).
5. Reduced vertical spacing site-wide; made programme cards compact, two per row, aligned top and bottom (CSS subgrid).

### Phase B: The reconciliation tool

1. **First build from wireframe screenshots** of an existing tool (the owner built the original; used for structure only). Immediate feedback: *"this looks too exactly like [that] one; take the structure but improve the UI/UX"*. → redesigned from scratch in the lime/white/black theme, with distinct layout, interactivity and detail.
2. **The full specification** (period-based bilateral reconciliation: opening gate, carry-forward, contra within each ledger, sequential matching, period-tagged annexures, sign-off and versioning, close and carry-forward, tests across three periods) → **rebuilt the engine** as `cycle.ts` with 68 tests, replaced the single-period engine.
3. *"No need to build the entire product, just the sample"* with five areas named. Then the owner restructured to **exactly four screens** with sub-tabs (see section 1). Credit Mapping and Balance Confirmation stay as placeholders *by request* (the owner disliked placeholders elsewhere, so placeholders exist only where explicitly deferred).
4. **Dashboard** as a sub-tab (vendor, summary, annexures); **Vendor Ledger Upload** shows which period the vendor uploads to; **the manual stage-running UI was removed**: when the vendor uploads, the platform reconciles automatically and produces the statement, reconciled, unreconciled and open items.
5. **Product card** renamed after the tool, given a visualisation and a single "open the tool" action; then a looping walkthrough animation (a real `.gif` was offered; an in-code loop was built because it stays sharp and light).
6. **Vendor Ledger Upload revamp** from the owner's reference screenshots: balance strip, OB-CB validation, upload history with documents, **own-format vs standard-format upload with an AI scrutiny step**, buyer-ledger fetch date and source, downloads of previous periods, **calendar period selection** (upcoming months greyed out), and **plain period names instead of tags** ("write September 2026, the tag is only for recon statements").
7. **Pinned demo notice** (stays put while scrolling).
8. **Reconciled Transactions**: first as four population tabs → feedback: *consolidate into one table, buyer and vendor on the same row, with columns period | buyer items | vendor items | difference; replace "how it was matched" with cue cards, hover for buyer and vendor counts*. Then: *don't show open items here; show the type of matching (one to one, contra, one to many, many to many); cue cards must show value*. Then: *suggested matches belong to Unreconciled only; items move between the buckets as they are matched or reversed*.
9. **Unreconciled Transactions** rebuilt to the same look with three tabs (Suggested, Partially reconciled, Open items). Open items as a **1×2 matrix**; match drawer; later made **compact** with a better file attach; cue cards by document type; **contra** for one-sided selection; **status colours** for manual (purple) and suggested-then-confirmed (orange) matches on Reconciled; **force match** for partial matches; the owner's correction that **a zero-difference match belongs on Reconciled, partial = difference remains**.
10. **Reconciliation Statement** redesigned as buyer closing → nine annexures → vendor closing; later: **hide annexures that are empty or net to zero**, **tie each unreconciled item back to its annexure number and tag**, **annexure tabs** (clicking an annexure line moved to the wrong area before; now selects the tab), compact previous-period cards (fixing a button overflow), a **collapsible Record**, an Excel pack with ledgers, annexures and reconciled transactions.
11. **Vendor users and vendor map**: vendor accepts (= sign-off) or raises concerns with justification; vendor sees all screens for their own account; vendor actions are requests for buyer review; Priya and Arjun as buyer owners plus two vendor logins; vendor map in Admin.
12. **Dashboard tie-back:** suggestions, partials, vendor requests, concerns and per-vendor annexure values; summary strips collapsible; value-only tiles; **selection totals** on the open-items matrix.

### Standing feedback themes

- Make it look **new and modern**, not like the original tool the owner built.
- **Compactness**: reduce vertical space, reduce card sizes, show only values where possible.
- **Automation over buttons**: the platform runs the cycle; people review.
- **Explainability**: every match says why; every difference is shown, never absorbed; every item ties back to an annexure.
- **Segregation of duties**: proposer ≠ approver; vendor ≠ buyer.

---

## 11. Design principles that held up

1. **Deterministic first, probabilistic second.** Anything that can be decided by a rule is; anything that needs judgement (probable matches, possible contras) is **proposed**, with the reasons, and decided by a person. Automation never closes a guess.
2. **Closed only when exactly zero.** A group of entries closes only when signed sums net to exactly zero. A remainder is either unexplained or an explicit adjustment or a partial match, never silently absorbed.
3. **Never lose the original period.** Carry-forward keeps the tag, so ageing and annexures stay truthful across periods.
4. **Two ledgers, one view.** Normalise both to the buyer's payable view so everything is a simple signed comparison.
5. **Opening balance first.** No matching until each ledger's opening continues from its own previous closing (or the break is formally explained).
6. **Everything is auditable.** Who, when, why, before, after. Reversals and approvals need reasons; proposers cannot approve.
7. **Immutable once signed.** Prepared and signed statements are frozen; changes create a new version through reopen.
8. **Pure engine, thin UI.** The engine is plain functions returning `Result`. The UI only calls them and shows `error` verbatim when refused. This made the 68 tests possible.
9. **One classification, many views.** The annexure rule lives in one file and is reused by the statement, the Unreconciled screen and the dashboard.
10. **Plain language for people, tags for statements.**

---

## 12. What is mocked or simplified in the sample

| Area | In the sample | In the real tool |
|---|---|---|
| Persistence | In memory; resets on reload | Database with history |
| Auth | User switcher | SSO/IdP, per-tenant RBAC |
| ERP ledger | Pre-generated file "fetched" automatically | Real connectors (scheduled extract), with a manual upload fallback |
| Vendor ledger extraction ("AI scrutiny") | Animated steps and a static example mapping table; only CSV with standard columns (or the sample vendor file) can actually be read | Real extraction of any layout (XLS/XLSX/XLSB/CSV/PDF), column mapping with confidence, human confirmation |
| Uploads on a match | Only file *names* are saved with the remarks | Real file storage and download |
| Vendor notifications | None | Email/portal notifications for shared statements, concerns, requests |
| Credit Mapping, Balance Confirmation | Placeholders | To be designed |
| "Subsequently accounted by buyer" (Annexure 1) | Approximated by the timing-difference flag | Needs a real definition (see section 14) |
| Dates | Fixed "today" of 9 Nov 2026 | Real clock and period calendar |
| Excel pack | Built client-side | Server-side generation, templates, branding, PDF |
| Concurrency | Single user | Optimistic locking, per-relationship queues, idempotent jobs |

---

## 13. Blueprint for the real tool

### 13.1 Architecture

- **Keep the engine as the domain core.** Port `cycle.ts` rules into a server-side module (TypeScript is fine). Keep it **pure** (state in, result out) and re-run it inside a transaction per relationship. The 68 tests move with it.
- Services:
  1. **Ingestion**: ERP connector jobs, file upload, extraction/normalisation.
  2. **Reconciliation service**: runs the opening gate and stages as a **job** after both ledgers land; idempotent.
  3. **Workflow service**: prepare, share, vendor response, sign-off, reopen, close/carry-forward.
  4. **Document service**: statement/annexure/Excel/PDF generation.
  5. **Notification service**.
  6. **Audit service** (append-only).
- Run reconciliation per **relationship** as the unit of locking and of scale.

### 13.2 Suggested database tables

`buyers`, `entities`, `vendors`, `relationships` (unique on entity+bu+vendor+currency), `periods` (relationship, tag, type, start, end, phase, version, opening/closing per side, prev closing per side), `ledger_files` (+ storage reference, checksum, source, kind), `ledger_rows_raw` (immutable source rows), `transactions` (normalised; origin period; import period; signed amount; normalised keys), `matches` and `match_members`, `candidates` and `candidate_members`, `adjustments`, `exceptions` (+ `exception_notes`, `exception_evidence`), `carry_log`, `credit_map`, `statement_versions` (frozen JSON snapshot + generated files), `signoff_events`, `vendor_requests`, `users`, `roles`, `user_vendor_access`, `audit_log` (append-only), `settings` (per tenant, versioned).

Indexes you will need: `(relationship_id, side, doc_norm, type)`, `(relationship_id, ref_norm)`, `(relationship_id, against_norm)`, `(relationship_id, origin_tag)`, and a partial index for open transactions.

### 13.3 Things to decide up front

1. **Identity of a transaction** (duplicate protection): side + type + normalised document + date + amount + normalised reference. Add file checksum and line number for traceability.
2. **Normalisation rules** (`normRef`, `normName`, dates, amounts, Indian number formats, document-number prefixes/suffixes, financial-year patterns like `26-27`). Make them configurable per vendor profile.
3. **Money precision:** the sample uses numbers rounded to 2 places. In production use integer minor units or a decimal type.
4. **Tolerances and thresholds** per currency and per tenant (rounding tolerance, probable threshold, date window, timing days).
5. **Period calendars** (monthly, quarterly, fiscal year start) and what "closed" means across entities.
6. **Statement versioning and retention.**
7. **Which statuses an auditor may inspect** and the export formats.

### 13.4 Real ledger ingestion

- Accept CSV, XLS, XLSX, XLSB (and later PDF via OCR).
- **Extraction pipeline:** detect the ledger table, header row and orientation; map columns to the standard fields; show the mapping with confidence; require **human confirmation** below a threshold; remember the mapping per vendor (import profile) so the second upload is silent.
- Validate: opening + lines = closing; date and amount parse errors listed per line; duplicate detection; periods outside the selected one flagged.
- Keep the **original file** and the **raw rows**; never edit the source.
- Provide the **standard template** and the **downloadable standardised copy** the sample already exposes.

### 13.5 Matching at scale

- Do exact-key stages with hash maps or SQL grouping (as the sample does), per relationship.
- For "other candidates", block on amount buckets and date windows before scoring so you never compare everything with everything.
- Keep the **explanation text** per match; it is a feature, not decoration.
- Make stage runs **idempotent** and restartable; record each stage's considered/matched/candidate counts.
- Treat learned patterns as **per-relationship**, with an admin view and the ability to delete a pattern.

### 13.6 Workflow and notifications

- Email the vendor contact when a statement is shared (link to a vendor portal view).
- Remind on aging "With vendor" statuses; escalate disputes to the buyer owner.
- Notify buyer owners of vendor requests.
- Give vendors their own portal or restricted tenant view, with the filtered data model described in section 6.
- Decide whether vendor **acceptance directly signs off** (as in the sample) or whether the buyer must still countersign (the sample asked for direct sign-off).

### 13.7 Security and privacy

- Strict **row-level access**: vendors only their own relationships; buyers per entity/business unit.
- Audit everything, including downloads.
- Store evidence files encrypted; virus-scan uploads.
- Never place personal data in URLs.

### 13.8 Performance

- Expect thousands of lines per vendor per period. Paginate tables, virtualise the two-sided table, and compute the dashboard from cached per-relationship summaries refreshed on state change.
- The annexure classification is O(items); cache per statement version.

### 13.9 Quality

- Port the 68 tests, then add the ones listed in section 16.
- Add **property-style tests**: for any generated pair of ledgers, after the cycle `buyer closing − vendor closing = Σ annexures + adjustments + unexplained` holds exactly; no transaction is in two active matches; carry-forward then close never changes a closed statement.
- Keep the seeded **scenario generator**: it doubles as a demo dataset and a regression fixture.

---

## 14. Open questions and deferred items

Raised during the build and not yet settled. Resolve these before the real build.

1. **Credit Mapping** (Unmapped Credits, Mapped Credits): the owner said it would be discussed later. Working assumption: map credit/debit notes to the invoices they adjust. The engine already supports it.
2. **Balance Confirmation**: screen not designed.
3. **The statement layout**: the owner said they would share how the statement should look. The nine-annexure layout was built from their description; confirm the exact format, wording and any extra sections.
4. **Annexure 1 ("Invoices subsequently accounted")**: in the sample it means vendor invoices flagged as timing differences. A real definition may be "open at period end but booked by the other side in a later period". Decide, because it changes the data needed.
5. **Annexure grouping**: the owner listed "Annexure 1 2 3 4" for invoices as four separate annexures and credit notes and TDS as one annexure each with three parts, and payments as three annexures (6, 7, 8). Confirm that this inconsistency is intended.
6. **"Partially reconciled" meaning**: built as forced matches that leave a difference. Confirm.
7. **Statement acceptance**: does the vendor's acceptance sign off directly (as built), and does the buyer still approve or countersign before close?
8. **Vendor map "status"**: shown as the live workflow status. Confirm whether the mapping itself has a review status.
9. **Vendor scope of matching**: vendors may select items on both sides and the buyer reviews. Confirm whether vendors should be limited to their own ledger's items.
10. **Zero-value annexures** are hidden. Confirm that hiding items that net to zero (but are still open) is acceptable for audit.
11. **Business rules still to confirm:** whether credit mapping means DN/CN-to-invoice mapping; whether anything beyond manual statuses may be set by hand; tolerance values per currency; document retention.

---

## 15. Bugs we hit and what they taught us

| Bug | Cause | Fix and lesson |
|---|---|---|
| Credit note stage test failed after mapping | A deterministic stage must be allowed to supersede an older pending "other" suggestion, but a pending **contra** must block items from every stage | Candidates now have a `superseded` status; pending contra items are excluded from all stages |
| Re-import error in the history driver | `drive()` imported a file already imported | Skip imports already done |
| Silent adjustment on confirming a suggestion with an amount gap | Confirmation tried to close a gap | Confirmation now **fails** with a message. Gaps are never absorbed |
| State shared between versions | `clone()` copied nested objects by reference | Clone openings, closings and dates explicitly |
| Stale state on bulk actions | Several actions in a row used an old workspace | A `wsRef` so each action builds on the latest state |
| Two-column grid leftover broke aligned cards | Old grid template still applied | Reset the template where subgrid is used |
| Mobile overflow on vendor, statement and reconciliation pages | Grid children without `min-width:0` | `minmax(0, 1fr)` and `min-width: 0` |
| Nested button warning; missing React key | Markup errors | Fixed |
| Dev server showing stale styles | HMR caching | Touch the file and reload |
| Button spilled out of period card | `nowrap` header in a narrow card | Wrap the header and widen the minimum card width |
| Clicking an annexure scrolled to the previous period | Scroll target and collapsed blocks | Annexure **tabs**; the click selects the tab and scrolls to a single container |
| Vendor given approver rights by mistake | `canApprove` was "anything but Preparer" | Now "Approver or Admin" only |
| Forced matches broke the bridge risk | Closing items would have removed the difference from the statement | Partial matches are **not** treated as closed for the statement; held items are only hidden and excluded from stages |
| Python heredocs failing in the shell | Environment quirk | Patch scripts written to files and run |

General lessons: keep the engine pure; return reasons; test the arithmetic invariants; never let the UI decide a rule.

---

## 16. Acceptance checklist for the real build

Use this to verify the real tool reproduces the sample's behaviour.

### Ledger upload
- [ ] Vendor can upload in own format or the standard format for a chosen period; closed and already-uploaded periods are blocked with a clear message.
- [ ] Period selection is a calendar; upcoming periods and periods before the reconciliation began are disabled.
- [ ] The buyer ledger is fetched from the ERP; the fetch date and source are shown; a manual upload fallback exists.
- [ ] Vendor OB is validated against previous CB (with back-dated entries); a failure pauses matching and shows variance.
- [ ] Buyer continuity is validated separately.
- [ ] First period uses the opening position check; an unverified position needs an approver, reason and evidence.
- [ ] Previous periods' ledgers (source and standardised) can be downloaded.
- [ ] After upload, reconciliation starts by itself and the statement is produced.

### Matching
- [ ] Stages run in the fixed order; TDS stages can be switched off; nothing runs before the gate passes.
- [ ] Exact, rule-based, probable and manual confidence are recorded.
- [ ] Possible contra and probable matches are never closed automatically.
- [ ] Pattern-assisted scoring improves after confirmations.
- [ ] No transaction is in two active matches; no cross-relationship matches.
- [ ] A group closes only at exactly zero; manual matches that do not net to zero are refused unless forced.
- [ ] Forced matches create **Partially reconciled** entries, stay in the statement as open, and can be reversed.
- [ ] Reversal restores items with original tags; closed-period reversal needs an approver.

### Screens
- [ ] Reconciled shows only zero-difference matches, buyer and vendor on one row, with match type, status colour and cue cards with count, value and hover counts.
- [ ] Unreconciled has Suggested, Partially reconciled and Open items tabs; open items as buyer and vendor tables with selection totals and a match drawer with remarks and files.
- [ ] Every unreconciled item shows its annexure number and tag.
- [ ] Dashboard shows value-only tiles and A1–A9 values per vendor; strips fold.

### Statement
- [ ] Starts at the buyer's closing and ends at the vendor's closing; the sum of annexures equals the difference.
- [ ] Empty and nil annexures are hidden; numbering is stable.
- [ ] Unexplained is shown, never absorbed; rounding within tolerance needs an approver and a reason.
- [ ] Excel pack: Statement, Buyer Ledger, Vendor Ledger, Annexures, Reconciled Transactions, Sign-off.
- [ ] Prepared and signed statements are frozen; reopen creates a new version.
- [ ] Close carries forward exactly the unresolved items with original tags; re-uploading closed items does not recreate them.

### Roles
- [ ] Proposer cannot approve; only approvers can reopen, close, approve openings and rounding.
- [ ] A vendor sees only their own relationships, responds to statements (accept = sign-off; concerns need a justification), and all other vendor actions are requests the buyer approves or rejects.
- [ ] Vendors cannot approve anything.

### Tests to add beyond the sample's 68
- [ ] Force match / partial match: statement still balanced; hidden from open lists; excluded from stages; reversal restores.
- [ ] Annexure classification: each open item falls into exactly one section; sum of annexures equals the difference for every generated workspace.
- [ ] Vendor request approval applies through the engine and records both names; refused requests stay pending with the reason.
- [ ] Vendor acceptance signs off; concerns require a justification; buyer cannot respond for the vendor.
- [ ] Excel pack contains the expected sheets and the Statement sheet's totals equal the screen.

---

*Document generated from the working sample. Section numbers are referenced in code comments and in the acceptance checklist; keep them stable when editing.*
