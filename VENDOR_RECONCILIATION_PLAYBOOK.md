# Vendor Reconciliation Playbook

## Purpose

This document records the design and implementation decisions behind the NXT Foundry Vendor Payable Reconciliation demo. It is intended to be reused as a working specification for building the production Ledger Reconciliation tool.

The current implementation is a deterministic, browser-based prototype. It uses synthetic data, in-memory state, and a controlled set of generated ledger files. It demonstrates the operating model, reconciliation rules, workflow controls, audit trail, user roles, and exception handling that a production system should preserve.

The main implementation lives under `src/recon/`.

## What we built

The product reconciles two views of the same payable relationship:

- The buyer's AP / ERP ledger.
- The vendor's AR / statement ledger.

The system does not simply compare closing balances. It creates a period-by-period audit trail of:

1. The files received from each side.
2. The transactions imported and normalised.
3. Opening-balance continuity.
4. Intra-ledger reversals and contra entries.
5. Cross-ledger matches.
6. Probable matches requiring human review.
7. Unreconciled transactions and their owners.
8. Adjustments, evidence, and approvals.
9. The reconciliation statement and annexures.
10. Vendor review, acceptance or dispute.
11. Final sign-off, closure, and carry-forward into the next period.

The core principle is that a match is not enough by itself. The system must explain why the ledgers agree, show what remains open, prevent unsupported closure, and preserve the bridge from each period to the next.

## Product scope and boundaries

### Included in the prototype

- Multiple buyer legal entities.
- Multiple business units.
- Multiple vendors.
- Multiple currencies.
- Monthly and quarterly relationships.
- Buyer and vendor ledger imports.
- Historical onboarding items.
- Back-dated vendor entries.
- Duplicate detection.
- Ledger integrity checks.
- Opening continuity gates.
- Rule-based matching.
- Probable-match suggestions.
- Manual matching and reversal.
- Credit/debit note mapping.
- TDS matching.
- Payment and receipt matching, including one-to-many cases.
- Exception ownership and investigation notes.
- Accounting adjustments with segregation of duties.
- Rounding approval within currency tolerance.
- Statement generation with period-based annexures.
- Vendor response and dispute flow.
- Versioning, sign-off, reopening, and period closure.
- Carry-forward of unresolved items.
- Audit records.
- Buyer and vendor views.

### Not production-ready yet

- There is no database or server-side persistence.
- The generated files are synthetic and deterministic.
- There is no authentication provider; the user switcher simulates users and permissions.
- There is no real ERP, SFTP, email, vendor portal, or banking connector.
- File parsing currently uses the known ledger columns and browser-side utilities.
- Attachments are represented as evidence names rather than stored files.
- The current audit trail is application state, not an immutable server-side log.
- Approval notifications, reminders, SLA timers, and escalation jobs are not implemented.

These are deliberate prototype boundaries. The workflow and invariants should be retained when replacing the demo plumbing.

## Repository map

| File | Responsibility |
|---|---|
| `src/recon/cycle.ts` | Core domain model, import pipeline, opening gate, matching engine, open items, adjustments, statement, sign-off, closure, carry-forward |
| `src/recon/engine.ts` | Date, amount, document-reference and name normalisation; CSV export |
| `src/recon/csv.ts` | RFC 4180 CSV parser and CSV conversion helpers |
| `src/recon/xlsx.ts` | Minimal dependency-free XLSX writer and browser download helper |
| `src/recon/ledger.ts` | Synthetic buyer, vendor, relationship, period and ledger-file generator |
| `src/recon/store.ts` | Workspace initialisation, demo history, simulated user roles, automation and vendor-request state |
| `src/recon/annex.ts` | Shared annexure classification used by unreconciled items and statements |
| `src/recon/App.tsx` | Application shell, navigation, user switcher, route state and role-aware actions |
| `src/recon/Dashboard.tsx` | Relationship-level dashboard and status overview |
| `src/recon/LedgerUpload.tsx` | File selection, preview, validation and import experience |
| `src/recon/Reconcile.tsx` | Matching stage runner, candidate review and manual match actions |
| `src/recon/OpenItems.tsx` | Open transactions, exception status, owner, priority, notes and evidence |
| `src/recon/Balance.tsx` | Statement and balance bridge view |
| `src/recon/History.tsx` | Period history, sign-offs, reversals, adjustments and audit trail |
| `src/recon/PairTable.tsx` | Reusable transaction-pair/table presentation |
| `src/recon/ui.tsx` | Shared UI primitives and formatting |
| `scripts/recon-check.ts` | Lifecycle and invariant test suite |

## Relationship model

The fundamental reconciliation boundary is not merely `vendorId`. It is a relationship:

```text
buyer legal entity + business unit + vendor + currency + frequency
```

This is represented by `Relationship` in `cycle.ts`:

```text
id, buyerId, entityId, bu, vendorId, vendorCode,
currency, frequency, owner, status
```

Every transaction, ledger file, match, adjustment, period and audit event carries or resolves back to a relationship. Matching is blocked across relationship boundaries. This prevents a vendor's Foods ledger from matching its Home Care ledger, or an INR relationship from matching a USD relationship.

For the production system, this boundary should be enforced in the database and API, not only in the browser.

## Ledger input contract

The prototype uses these canonical columns:

```text
Line ID
Document No
Document Date
Posting Date
Type
Debit
Credit
Reference
Against Doc
Narration
Period Tag
```

The buyer and vendor files use the same physical shape, but the signed interpretation is different:

- Buyer/AP: payable perspective; invoice is positive, payment is negative.
- Vendor/AR: receivable perspective; invoice is positive, receipt is negative after normalisation.

The import layer never overwrites the source row. It stores the raw row and derives a normalised transaction beside it.

### Accepted transaction types

The engine maps incoming labels to these internal types:

```text
INV      Invoice
INVREV   Invoice reversal
DN       Debit note
DNREV    Debit note reversal
CN       Credit note
CNREV    Credit note reversal
PAY      Payment / receipt
PAYREV   Payment / receipt reversal
TDS      TDS / TDS receivable
TDSREV   TDS reversal
```

### Sign convention

The internal sign convention is:

```text
Invoices       +
Debit notes    +
Credit notes  -
Payments      -
TDS           -
Reversals     opposite sign of the original family
```

Amounts are rounded to two decimals at the domain boundary. A row whose derived amount is effectively zero is rejected.

## Import and normalisation process

The import process is intentionally two-step:

1. `previewFile()` reads and validates a file without changing reconciliation state.
2. `importFile()` commits only the accepted transactions and records an audit event.

Preview performs the following checks:

- File belongs to the selected relationship.
- Transaction type is recognised.
- Document date is valid.
- Debit and credit are numeric.
- Derived amount is non-zero.
- Duplicate source lines are not already imported.
- A transaction with the same side, type, normalised document, date, amount and reference is not already present.
- Sign convention issues are surfaced as warnings rather than silently corrected.
- Period-file integrity is calculated as `closing - (opening + imported period lines)`.

The import result exposes accepted transactions, rejected rows, duplicates, warnings, integrity and counts by type. The user can understand what will happen before committing the file.

### Normalisation rules

`normRef()` uppercases a reference, removes separators, splits letters and digits, and removes leading zeroes from numeric tokens. For example:

```text
KPL/26-27/0045 -> KPL262745
INV-0007       -> INV7
```

This allows formatting differences to be treated as rule-based matches while retaining the original document number for display and audit.

Dates accept the formats implemented in `engine.ts`, including `02-Jun-2026`, `2026-06-02` and `02/06/2026`.

Amounts accept commas, rupee/INR markers, spaces and accounting parentheses.

## Opening-balance gate

Matching cannot start until the opening position is trustworthy.

For every non-first period and each side separately:

```text
expected opening = previous closing + back-dated entries imported in this period
variance         = reported opening - expected opening
```

The side is:

- `PASSED` when variance is zero.
- `FAILED` when variance is unexplained.
- `APPROVED` when an authorised approver records an explanation and evidence.
- `PENDING` when the ledger has not arrived.
- `FIRST PERIOD` for the first period, where continuity does not exist.

For the first period, historical onboarding items are removed from the reported opening to derive buyer and vendor base positions. The two base positions must agree, or an approved opening-position adjustment is required.

The gate passes only when both sides pass or are approved, and the first-period position is agreed or approved.

This is a major design decision: the engine stops matching at the first unexplained opening difference. It does not allow a later matching success to conceal a broken opening.

## Matching workflow

Stages run in a fixed order. A later stage cannot run until the previous stage has recorded completion.

### 1. Contra in buyer ledger

Finds invoice/payment/debit-note reversals inside the buyer ledger.

Priority of evidence:

1. Reversal explicitly references the original.
2. Reversal document number has the original plus `R` or `REV`.
3. Equal and opposite amounts are near in time, but without a link they become a candidate only.

Exact and rule-based contra pairs close internally because they net to zero. Unlinked equal-and-opposite entries are proposed for review and remain open.

### 2. Contra in vendor ledger

Applies the same logic to the vendor ledger. This handles vendor-side cancellations, receipt reversals and other internal reversals before cross-ledger matching.

### 3. Invoices and debit notes

Groups buyer and vendor transactions by:

```text
transaction family/type + normalised document number
```

A group closes only when the signed totals agree exactly. The confidence is:

- `Exact` when the raw document numbers agree.
- `Rule-based` when the normalised key agrees but formatting differs.

An amount mismatch remains open, even if the document number is the same.

### 4. Credit notes

Credit notes are matched first by credit-note number and amount. If their numbers differ, the engine uses the mapped original invoice and amount.

Credit/debit notes are mapped during import when `Against Doc` is present. The mapping screen also supports:

- A suggestion based on an equivalent note on the other ledger naming the invoice.
- A suggestion based on the most recent earlier invoice large enough to carry the note.
- Manual mapping by a user.

The mapping is recorded with method, actor and timestamp. A note cannot be mapped to an invoice outside the same relationship and side.

### 5. Payments

Payments and receipts match by normalised UTR/bank reference. The stage allows one-to-many and many-to-one groups as long as the signed totals agree exactly.

This handles a buyer payment split across several vendor receipts, or several buyer payments represented by one vendor receipt.

### 6. TDS

TDS matches by the invoice reference in `Against Doc` and exact amount. It is optional through settings, but enabled by default.

### 7. Payment plus TDS

The engine can match:

```text
buyer payment + buyer TDS = one vendor receipt
```

or the reverse. It requires both:

- Same invoice reference.
- Same UTR between the payment and receipt.
- Exact amount equality after adding payment and TDS.

### 8. Other candidates

This is the least certain stage. It never closes an item automatically. It proposes a candidate using a score made up of:

- Same amount: 40 points.
- Amount within 1%: 20 points.
- Dates within 3 days: 20 points.
- Dates within the configured date window: 10 points.
- Same last three numeric digits: 25 points.
- Similar document references: 15 points.
- Previously confirmed prefix pattern: 15 points.

The default probable threshold is 60. Candidates above the threshold are sent for reviewer confirmation or rejection.

Confirmed probable matches are recorded with `Probable` confidence. Rejected candidates do not close the transactions.

## Match safety rules

The engine enforces these invariants:

- A transaction cannot sit in two active matches.
- Matching never crosses relationships.
- A manual match must net to zero unless it is explicitly forced as a partial match.
- A forced partial match remains visible as an amount difference; it is a link, not a clean reconciliation.
- A reversed match reopens its transactions and records who reversed it, when and why.
- A candidate that is overtaken by a deterministic match is marked superseded.
- Match records retain engine version, rule, confidence, explanation, dates and actor.

## Open items and exception management

Anything not closed by an active exact, rule-based, confirmed probable, manual or approved-adjustment record becomes an open item.

The engine classifies open items by family and side, for example:

- Not booked by buyer.
- Not booked by vendor.
- Amount mismatch.
- Payment not credited by vendor.
- Receipt not recorded by buyer.
- TDS not recognised by vendor.
- Credit/debit note not booked by the other side.

It also calculates:

- Timing status.
- Age in days.
- Linked transaction IDs.
- Originating period.
- Periods carried forward.
- Candidate ID, where applicable.

Every open item has an exception record with:

```text
status
owner
priority
action
resolution reference
notes
evidence names
```

Manual status changes are intentionally limited to investigative states such as `Open`, `Under Investigation`, `Awaiting Buyer`, `Awaiting Vendor` and `Awaiting Supporting Documents`.

Resolved and closed statuses cannot be typed in by hand. They are created by a match or approved adjustment so the exception state cannot drift away from the ledger state.

## Adjustments and segregation of duties

There are four adjustment families:

- `opening-continuity`
- `opening-position`
- `rounding`
- `accounting`

Accounting adjustments follow a two-person flow:

1. A preparer proposes the adjustment with a reason and evidence.
2. The affected items move to `Awaiting Internal Approval`.
3. An approver reviews and approves or rejects it.
4. The proposer cannot approve their own adjustment.
5. On approval, the adjustment creates a settlement match and closes the affected items.
6. On rejection, the items return to investigation.

Rounding is stricter:

- Only an approver may record it.
- It is allowed only when the unexplained difference is within the currency tolerance.
- A reason is mandatory.
- A difference above tolerance remains an investigation item.

Default tolerances are INR 500 and USD 10. These are demo defaults and should become configurable policy by entity, currency, vendor class or materiality threshold in production.

## Statement and bridge

The statement is the central control output.

The bridge is:

```text
buyer closing - vendor closing
  = open buyer items - open vendor items
  + approved adjustment effects
  + unexplained difference
```

The statement includes:

- Buyer and vendor opening balances.
- Buyer and vendor closing balances.
- Closing difference.
- Open buyer and vendor totals.
- Net open position.
- Approved adjustments and their effect.
- Unexplained difference.
- Currency tolerance.
- Whether the difference is within tolerance.
- Whether the statement is fully balanced.
- Match and contra counts.
- Pending candidate count.
- Annexure rows.

The system distinguishes `within tolerance` from `balanced`. A difference inside tolerance is still not reconciled until an approver records the rounding adjustment.

## Annexures and originating-period logic

An unresolved item is reported under the period in which it originated, even when it is being reviewed months later. This is essential for auditability and for explaining aged unresolved balances.

The shared classification in `annex.ts` assigns items to sections such as:

- Invoices subsequently accounted by buyer.
- Invoices not accounted by buyer.
- Invoices partially matched.
- Invoices not accounted by vendor.
- Credit notes by side and partial status.
- Payments by side and partial status.
- TDS by side and partial status.

The statement groups rows by origin tag and the Unreconciled screen uses the same classification code. This prevents the statement and detail view from disagreeing.

## Period lifecycle

The lifecycle is:

```text
Awaiting ledgers
  -> Opening check
  -> Matching
  -> In review
  -> Statement prepared
  -> With vendor
  -> Vendor accepted / Vendor disputed
  -> Signed off
  -> Closed
```

Important controls:

- Both period ledgers must be imported before matching.
- Opening continuity must pass or be approved.
- All configured matching stages must run before preparation.
- The statement must be balanced before preparation.
- Vendor representative is required for a response.
- A dispute requires comments.
- Final sign-off requires an approver.
- Only the latest signed-off period can be closed.
- Only an approver can reopen or close a period.
- Reopening increments the period version and returns it to working state.
- A prepared or signed period is locked against normal changes.

When a period closes, all unresolved items are carried to the next period with a carry record. Closed matches and contras are not carried. The original transaction keeps its originating period tag.

## Vendor collaboration model

The prototype includes vendor users with relationship-scoped visibility. A vendor can:

- View their own relationship.
- See the statement and open items.
- Accept or dispute the statement.
- Request a match, reversal or confirmation.

Vendor requests do not mutate reconciliation state immediately. They are stored as pending requests and sent to the buyer for review. Only buyer approval applies the requested action.

This is the correct production pattern: vendor collaboration should be collaborative but not self-authorising.

## Demo data and scenarios

`ledger.ts` generates eight relationships across two entities, three business units and two currencies. It deliberately seeds scenarios that are useful for testing:

- Exact invoice matches.
- Formatting differences in invoice numbers.
- Invoice amount differences.
- Debit notes.
- Credit notes with different note numbers.
- Payments split across multiple vendor rows.
- TDS booked by one side only.
- Payment plus TDS against one receipt.
- Reversals with and without references.
- Back-dated vendor entries.
- Historical open items for a new vendor.
- Cross-period carry-forward.
- A USD rounding difference.
- A disputed vendor statement.
- Pattern-assisted probable suggestions.
- Relationships in multiple business units and currencies for one vendor.

`store.ts` builds the demo workspace by driving the same domain functions used by the UI. It does not hard-code final screens; it imports, gates, matches, reviews, prepares, shares, accepts/disputes, signs and closes through the engine.

That approach is important for the production tool: seeded or migrated history should pass through the same business rules as live activity wherever possible.

## UI workflow

The application is organised into these navigation areas:

### Dashboard

Relationship-level view of:

- Vendor relationships.
- Ledgers awaited.
- Opening checks failing.
- Statements with vendor.
- Open items.
- Partially reconciled items.
- Vendor requests.
- Vendor concerns.

Each relationship has a status and a next action.

### Vendor Ledger Upload

The upload screen should show the preview before commit:

- File and source.
- Period and side.
- Accepted lines.
- Rejected lines and reasons.
- Duplicates skipped.
- Warnings.
- Ledger integrity.
- Transaction-type counts.

### Reconciled Transactions

Shows active match records with confidence, stage, rule, explanation, amount difference, date difference, actors and period.

### Unreconciled Transactions

Shows open items with the exception record, classification, owner, priority, action, timing, age, notes, evidence and carry history.

### Reconciliation Statement

Shows the balance bridge, statement version, unexplained difference, tolerance, annexures, review status and vendor response.

### History

Shows every period, version, sign-off event, reversal, adjustment, carried item and audit event.

### Settings

Controls tolerance, probable-match threshold, date window, timing window and optional matching stages such as TDS and payment-plus-TDS.

## Audit model

The audit record captures:

```text
id
timestamp
actor
period
action
detail
before
after
reason
```

Audit entries are created for imports, stage runs, candidate decisions, exception updates, mappings, adjustments, rounding, preparation, sharing, vendor response, sign-off, reopening and closure.

For production, move audit persistence to an append-only server-side table with:

- Request ID / correlation ID.
- Source system and IP/device context where appropriate.
- Before/after JSON or a structured diff.
- Immutable event hash or equivalent tamper evidence.
- Role and permission snapshot.

## Test coverage

Run:

```bash
npm run test:recon
```

The current suite completed with 68 passing checks and 0 failures. It validates:

- Import prerequisites and duplicate prevention.
- First-period opening agreement.
- Stage ordering.
- Contra logic.
- Exact and normalised invoice matching.
- Amount mismatches remaining open.
- Debit and credit note handling.
- One-to-many payment matching.
- TDS and payment-plus-TDS.
- Probable suggestions requiring review.
- No transaction in two active matches.
- Relationship isolation.
- Manual match refusal when totals do not net.
- Bridge balance.
- Reversal and reopening behaviour.
- Exception status protections.
- Segregation of duties.
- Adjustment settlement.
- Locked periods.
- Vendor disputes.
- Reopen and close permissions.
- Carry-forward.
- Continuity failures and back-dated fixes.
- Original period tags.
- Annexure grouping.
- Tolerance and rounding approval.
- Re-upload protection.
- New-vendor opening position.
- Multi-entity, multi-currency and multi-business-unit isolation.
- Deterministic data generation.

The test file is `scripts/recon-check.ts` and should be extended before adding production connectors or changing matching rules.

## Production ledger reconciliation roadmap

### Phase 1: Domain and persistence

- Create server-side entities for relationships, periods, files, transactions, matches, candidates, exceptions, adjustments, statements, sign-offs and audit events.
- Add database constraints for relationship scoping and transaction uniqueness.
- Store raw source files immutably with checksum, uploader, source and received timestamp.
- Store normalised transactions separately from raw rows.
- Use decimal arithmetic or integer minor units rather than floating-point numbers.

### Phase 2: Ingestion

- Add CSV/XLSX parsers with configurable column mappings.
- Add ERP and vendor portal connectors.
- Add file schema versioning.
- Add row-level import errors and downloadable error reports.
- Make imports idempotent using source-file hash and source-line identity.
- Add asynchronous jobs for large files.

### Phase 3: Matching platform

- Move matching stages to a server-side job with progress and resumability.
- Make matching rules versioned and configurable.
- Persist candidate explanations and feature values.
- Add approval queues for probable matches, contras and manual matches.
- Add rule simulation so a new rule can be tested without mutating live state.

### Phase 4: Controls and collaboration

- Add SSO and role-based access control.
- Enforce buyer/vendor/entity/BU scope server-side.
- Add maker-checker approval for opening adjustments, rounding, accounting adjustments, reopening and sign-off.
- Add vendor portal links, notifications, reminders and dispute SLAs.
- Store evidence documents in object storage with retention policy.

### Phase 5: Reporting and operations

- Add ageing and trend reporting.
- Add materiality and escalation rules.
- Add exception dashboards by owner, vendor, BU, currency and root cause.
- Add statement PDF/XLSX generation from a fixed snapshot.
- Add operational monitoring for failed imports, stale periods and unmatched vendor responses.

## Recommended production invariants

These should become automated database/API tests and not remain only UI behaviour:

1. A transaction belongs to exactly one relationship.
2. Active matches cannot overlap on a transaction.
3. Closed periods are immutable except through an approved reopen event.
4. A statement snapshot is reproducible from its version and inputs.
5. A vendor cannot approve its own request into buyer ledger state.
6. A preparer cannot approve their own adjustment.
7. No period can be prepared while the bridge is unexplained.
8. Within-tolerance does not mean balanced until approved rounding exists.
9. Unresolved items retain their original period tag across carry-forward.
10. Every state-changing action creates an audit event.
11. Every match has an explanation, confidence, rule/stage and engine version.
12. Every adjustment has a reason, evidence and approver where required.
13. Reversing a match reopens its transactions without deleting history.
14. Matching behaviour is deterministic for the same inputs, settings and rule version.

## Practical build guidance for the actual Ledger Recon tool

Start with the domain and invariants, not the dashboard. The order that worked here was:

1. Define relationship scope and ledger sign conventions.
2. Define the canonical transaction model.
3. Build preview-before-commit ingestion.
4. Build opening continuity and first-period position checks.
5. Implement deterministic matching stages in explicit order.
6. Make uncertain matches candidates, never silent closures.
7. Build open-item ownership and evidence before statement formatting.
8. Implement the bridge and prevent preparation when unexplained.
9. Add approvals and segregation of duties.
10. Add vendor collaboration as request/response, not direct mutation.
11. Add versioning, sign-off, closure and carry-forward.
12. Build the UI screens around the domain state.
13. Add connectors and persistence only after the lifecycle tests are green.

The central lesson from this implementation is that reconciliation is a controlled operating process, not a one-time comparison. The production ledger tool should make every conclusion explainable, every exception actionable, and every period traceable to the next.

