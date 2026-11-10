// Content for the Insights and Resources pages.
//
// HOW TO ADD SOMETHING
// - Insights: add an entry to `posts`. Set status to 'published' and fill `body` (one string per paragraph; a string
//   starting with "## " becomes a sub-heading). It then gets its own page at #insights/<slug>.
// - Case studies: kind 'case'. Keep clients anonymous (sector, size, region only) and publish only with their consent.
//   Put the real outcome in `outcome` once it is agreed with the client; never estimate it.
// - Resources: add an entry to `resources`. `href` can point to a file in /public/resources, a page on this site, or an
//   external link. Leave href empty and status 'soon' for something still being prepared.

export type PostKind = 'article' | 'case';
export interface Post {
  slug: string; kind: PostKind; title: string; summary: string; topic: string; status: 'published' | 'soon';
  date?: string; readMins?: number; client?: { sector: string; size: string; region?: string }; outcome?: string; body?: string[];
}
export const TOPICS = ['Business Operations', 'Finance & Controls', 'Supply Chain', 'Technology & Innovation'];

export const posts: Post[] = [
  { slug: 'why-vendor-balances-drift', kind: 'article', topic: 'Finance & Controls', status: 'soon', title: 'Why vendor balances drift apart, and how to stop it',
    summary: 'Late postings, short payments, TDS and one-sided credit notes: the quiet causes of a vendor difference nobody can explain at year-end.' },
  { slug: 'month-end-close-that-holds', kind: 'article', topic: 'Finance & Controls', status: 'soon', title: 'A month-end close that holds up',
    summary: 'What a close checklist needs beyond a list of tasks: owners, evidence, and the reconciliations that prove the numbers.' },
  { slug: 'stock-on-system-vs-floor', kind: 'article', topic: 'Supply Chain', status: 'soon', title: 'When stock on the system does not match stock on the floor',
    summary: 'Where inventory variances really come from, and the controls that keep margin from drifting.' },
  { slug: 'automate-after-you-understand', kind: 'article', topic: 'Technology & Innovation', status: 'soon', title: 'Automate after you understand the process, not before',
    summary: 'Why the tools we build start from the problem, and what goes wrong when software is bought before the process is fixed.' },
  { slug: 'case-vendor-reconciliation', kind: 'case', topic: 'Finance & Controls', status: 'soon', title: 'Bringing vendor balances back under control',
    summary: 'A reconciliation case study: opening balances that did not continue, differences carried for months, and how they were cleared.',
    client: { sector: 'Manufacturing', size: 'Mid-sized, owner-led' } },
  { slug: 'case-operating-reset', kind: 'case', topic: 'Business Operations', status: 'soon', title: 'An operating reset for a business that outgrew its systems',
    summary: 'A Reset engagement case study: approvals, discounts and month-end, rebuilt around how the business actually runs.',
    client: { sector: 'Distribution', size: 'Growing, multi-location' } },
  { slug: 'case-inventory-margin', kind: 'case', topic: 'Supply Chain', status: 'soon', title: 'Finding the margin hidden in inventory',
    summary: 'A case study on stock, shrinkage and costing, from a business where margin moved without a clear reason.',
    client: { sector: 'Consumer goods', size: 'Owner-led' } },
];

export type ResourceKind = 'Template' | 'Checklist' | 'Guide' | 'Tool';
export interface Resource { title: string; kind: ResourceKind; summary: string; format: string; href?: string; status: 'available' | 'soon'; external?: boolean }
export const RESOURCE_KINDS: ResourceKind[] = ['Template', 'Checklist', 'Guide', 'Tool'];

export const resources: Resource[] = [
  { title: 'Vendor Payable Reconciliation: live demo', kind: 'Tool', status: 'available', format: 'Runs in your browser', href: '#reconciliation-lab', external: true,
    summary: 'Try the full reconciliation cycle on synthetic data: upload, opening check, matching, statement and sign-off.' },
  { title: 'Standard ledger template', kind: 'Template', status: 'available', format: 'CSV', href: '/resources/standard-ledger-template.csv',
    summary: 'The column layout our reconciliation tools read directly. Useful for asking vendors and customers for a clean ledger.' },
  { title: 'Vendor reconciliation checklist', kind: 'Checklist', status: 'soon', format: 'PDF',
    summary: 'What to check before, during and after a vendor reconciliation, from opening balances to sign-off.' },
  { title: 'Month-end close checklist', kind: 'Checklist', status: 'soon', format: 'Spreadsheet',
    summary: 'A close checklist with owners, due days and the evidence each step should leave behind.' },
  { title: 'Balance confirmation letter', kind: 'Template', status: 'soon', format: 'Document',
    summary: 'A confirmation request for vendors and customers, with the annexure format they can reply against.' },
  { title: 'A practical guide to GST input credit reconciliation', kind: 'Guide', status: 'soon', format: 'Guide',
    summary: 'Purchase register against GSTR-2B: what mismatches mean and which ones put credit at risk.' },
  { title: 'Approval matrix template', kind: 'Template', status: 'soon', format: 'Spreadsheet',
    summary: 'Who approves purchases, discounts and credit notes, and up to what value. A starting point for most growing businesses.' },
];
