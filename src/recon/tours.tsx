import React from 'react';
import { card, clickTab, type TourStep } from './tour';
import type { Screen } from './App';

// The guided tour for each Reconciliation screen, worded for the person using it (buyer team or vendor).
// Ten steps at most; a step whose area is not on screen right now is skipped automatically.
const HELP: TourStep = { target: '.rx-help', title: 'Need it again?', body: 'Click Help anytime to replay the tutorial for the screen you are on.' };

export function toursFor(screen: Screen, vendor: boolean): TourStep[] {
  switch (screen) {
    case 'dash': return [
      { target: '.rx-nav', title: 'Welcome to the platform', body: vendor ? 'You see every screen for your own account. Reconciliation is where your ledger is matched with your customer’s; Balance Confirmation is where you confirm balances.' : 'Credit Mapping, Reconciliation, Balance Confirmation and Admin Settings. This tour covers the Reconciliation dashboard; every screen has its own Help.' },
      { target: '.rx-subnav', title: 'The reconciliation, in order', body: <>Dashboard, then <b>Vendor Ledger Upload</b>, <b>Reconciled</b> and <b>Unreconciled Transactions</b>, then the <b>Reconciliation Statement</b>. Each tab is one step of the cycle.</> },
      { target: '.rd-head-actions', title: 'Narrow the view', body: 'Filter by legal entity and business unit. Tiles and the vendor table follow.' },
      { target: '.rx-tiles', title: 'The cycle at a glance', body: 'Ledgers awaited, opening checks failing, open items, unmatched value, suggestions and requests waiting for review. Values only; collapse it if you need room.' },
      { target: card('Vendors'), title: vendor ? 'Your account' : 'Every vendor relationship', body: <>Status, open items and the next step per relationship, plus the value sitting in each annexure (<b>A1–A9</b>). Click a vendor to open it.</> },
      { target: '.rx-legend', title: 'Reading the table', body: 'What each annexure column means. Together they explain the whole difference between the two closing balances.' },
      { target: '.rd-act', title: 'Nothing happens silently', body: 'The audit log records every import, match, reversal, approval and sign-off: who, when and why.' },
      { target: '.rx-user', title: 'Switch roles (demo)', body: 'Stands in for sign-in. Try the preparer, the approver, or a vendor to see what each one can do.' },
      HELP,
    ];
    case 'upload': return [
      { target: '.rw-picker', title: 'Choose the relationship', body: 'One vendor, entity, business unit and currency. Search by name or code.' },
      { target: '.rx-pp', title: 'Choose the period', body: 'A calendar of months (or quarters). Upcoming periods are greyed out until they end.' },
      { target: '.rx-context', title: 'What you are looking at', body: 'The vendor, entity, business unit and currency, with where this period stands.' },
      { target: '.rd-head-actions', title: vendor ? 'Upload your ledger' : 'Upload the vendor’s ledger', body: <>In <b>your own format</b> (AI reads the layout and maps the columns) or in the <b>standard format</b>. You review what was read before anything is pushed.</> },
      { target: card('Balance for'), title: 'Both closing balances', body: 'The entity’s and the vendor’s closing balance for the period, and the difference the reconciliation has to explain.' },
      { target: card('Opening and closing balance check'), title: 'The opening check comes first', body: 'Each opening must equal that party’s previous closing. Nothing is matched until both continue, or a difference is explained and approved.' },
      { target: '.rx-up-run', title: 'Then it runs by itself', body: 'Our ledger is fetched from the ERP, openings are checked and the matching runs automatically, with AI and rule-based matching. You only step in for what needs judgement.' },
      { target: card('All uploaded ledgers'), title: 'Every ledger, every period', body: 'Download any earlier ledger, see when it arrived and whether its opening matched.' },
      HELP,
    ];
    case 'matched': return [
      { target: '.rx-cues', title: 'What has been reconciled', body: 'Value reconciled by type: invoices and debit notes, credit notes, payments, TDS and contra. Hover for the number of buyer and vendor entries; click a card to show only that type.' },
      { target: '.rw-main .rx-q', title: 'Find a document', body: 'Search by document number or reference across both sides.' },
      { target: card('Reconciled transactions'), title: 'Both sides, row by row', body: <>Buyer and vendor entries side by side with the match type (one to one, one to many, many to many, contra). <b>Matched</b> is automatic, <b>Manual match</b> was paired by a person, <b>Suggested match</b> was confirmed from a suggestion.</> },
      { target: '.rw-main td.rx-act', title: 'Undo a match', body: vendor ? 'Reverse asks the buyer to undo a match, with your reason. Nothing changes until they approve.' : 'Reverse sends a match back to Unreconciled, with a reason on record. Locked once the statement is prepared.' },
      { target: '.rd-head-actions', title: 'Next', body: 'Jump to what is still open, or to the statement.' },
      HELP,
    ];
    case 'open': return [
      { target: '.rw-main .rw-tabs', title: 'Three kinds of open items', body: <><b>Suggested match</b>: likely pairs waiting for a decision. <b>Partially reconciled</b>: matched with a difference left. <b>Open items</b>: everything not matched yet.</>, before: clickTab('Suggested') },
      { target: '.rx-cues', title: 'Where they sit', body: 'Value by type. Hover for the count on each side.' },
      { target: card('Suggested matches'), title: 'Confirm or reject', body: vendor ? 'The platform never closes a guess. Your decision goes to the buyer for review.' : 'The platform never closes a guess: a confirmed suggestion becomes a Suggested match, a rejected one stays open. Each shows why it was suggested.' },
      { target: '.rx-mxs', title: 'Buyer and vendor, side by side', body: 'Buyer entries on the left, vendor entries on the right, each tagged with the annexure it falls into on the statement.', before: clickTab('Open items') },
      { target: '.rx-matchbar', title: 'Select, then match', body: <>Pick entries on either or both sides; the totals and difference update as you go. Same-side picks become a <b>contra</b>. A zero difference goes to Reconciled; <b>Force match</b> keeps a difference as partially reconciled.{vendor ? ' Your matches go to the buyer for review.' : ''}</>, before: clickTab('Open items') },
      { target: card('Partially reconciled'), title: 'Matches with a difference', body: 'Forced matches stay here, still counted on the statement, until the difference is cleared.', before: clickTab('Partially') },
      { target: () => [...document.querySelectorAll('.rw-main .rw-card')].find(c => /requests/i.test(c.querySelector('h2')?.textContent ?? '')) ?? null, title: vendor ? 'Your requests' : 'Requests from vendors', body: vendor ? 'Everything you asked for, and whether the buyer approved it.' : 'Matches, reversals and decisions a vendor proposed. Approve to apply, or reject.' },
      { target: '.rd-head-actions', title: 'Next', body: 'Back to what is reconciled, or on to the statement.', before: clickTab('Suggested') },
      HELP,
    ];
    case 'statement': return [
      { target: '.rx-balance', title: 'Two closing balances', body: 'Ours and the vendor’s for the period, and the difference between them.' },
      { target: '.rx-bridge', title: 'From one balance to the other', body: <>Closing per buyer, then each annexure that explains part of the gap, ending at the closing per vendor. Annexures with nothing in them are hidden. Click one to open it.</> },
      { target: '.rx-sumchk', title: 'It always adds up', body: 'The annexures together equal the difference to the rupee. Anything left over shows as unexplained and must be cleared.' },
      { target: card('Annexures'), title: 'The items behind each line', body: 'One tab per annexure, listing every unreconciled entry with its document, date, amount and status.' },
      { target: card('Where the difference sits'), title: 'Which annexure matters most', body: 'How far each annexure moves the balance, so the biggest gaps are obvious.' },
      { target: card('Review and sign-off'), title: vendor ? 'Accept or raise a concern' : 'Prepare, share, sign off', body: vendor ? 'Once the statement is shared, accept it (your sign-off) or raise a concern with a justification.' : 'Prepare the statement, share it with the vendor, record their response and give the final sign-off. Changes after that need the period reopened as a new version.' },
      { target: '.rd-head-actions', title: 'Take it with you', body: 'Excel downloads the full pack: both ledgers, every annexure and the reconciled transactions. PDF prints the statement.' },
      HELP,
    ];
    default: return [];
  }
}
