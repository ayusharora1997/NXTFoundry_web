// Stories page (#stories). Add a story by adding an entry here; the page lays it out, newest first (top of the list).
// No dates on purpose. Wrap a phrase in **double asterisks** to bold it.
// While the list is empty the page shows the "We're building the narrative" placeholder instead.
export type Story = {
  id: string;                 // short, unique, lowercase-with-dashes
  title: string;
  areas: string[];            // shown above the title; also used as filters once there are a few stories
  stats: { value: string; label: string }[];   // one or two headline numbers, shown beside the story
  summary: string;            // one or two sentences shown before "Read the full story"
  problem: string[];          // paragraphs
  whatWeDid: string[];
  outcome: string[];
  meta: string;               // e.g. "E-commerce · Bengaluru, India"
  note?: string;              // e.g. confidentiality line
  earlier?: boolean;          // true = done by our team in an earlier role, before NXT Foundry; shown as "Earlier work"
};

export const stories: Story[] = [
  {
    id: 'warehouse-stock-transfers',
    title: 'Bringing accountability to a ₹76 crore warehouse reconciliation gap',
    areas: ['Warehouse Operations', 'Supply Chain', 'Inventory Controls'],
    stats: [
      { value: '₹76 Cr', label: 'of transferred stock without a verified receipt' },
      { value: '~5%', label: 'of monthly transfers left open in disputes, after the fix' },
    ],
    summary: 'Stock moved between warehouses was being closed on expected quantities and email confirmations, not verified receipts. A reconciliation tool with advance notice, a four-hour window and automatic escalation brought disputed transfers down to about 5%.',
    problem: [
      'A large e-commerce business was struggling to reconcile stock transfers between its warehouses. Dispatching warehouses recorded the quantities sent, while receiving warehouses sometimes recorded different SKUs and quantities. Despite these mismatches, transfer orders were frequently closed based on expected quantities and email confirmations rather than verified receipts.',
      'An audit of six months of stock transfers identified approximately **₹76 crore worth of inventory dispatched under STOs for which the business no longer had clear visibility of the final receipt or whereabouts**. The underlying process also exposed the business to estimated quarterly inventory losses equivalent to approximately 17% of transferred material value.',
      'The root cause was disconnected warehouse systems and a reconciliation process that largely depended on month-end reviews.',
    ],
    whatWeDid: [
      'We supported the development of a separate reconciliation tool that brought greater accountability and visibility to inter-warehouse stock movements.',
      'The solution introduced advance notifications to receiving warehouses, followed by a four-hour reconciliation window after receipt. Unresolved discrepancies triggered automated escalations to warehouse managers and operations leadership, while open transfers remained visible in warehouse performance tracking.',
      'We also introduced transfer-specific SKU identification to strengthen audit traceability and incorporated remaining shelf-life information for perishable inventory, helping receiving warehouses prioritise older stock for fulfilment.',
    ],
    outcome: [
      'The proportion of monthly stock transfers remaining open due to disputes between warehouses reduced to approximately **5%**. The intervention significantly reduced inventory losses and improved the visibility, traceability and accountability of stock movements across warehouse locations.',
    ],
    meta: 'E-commerce · Warehouse Operations · Bengaluru, India',
    note: 'Client identity and engagement details are withheld for confidentiality.',
    earlier: true,
  },
];
