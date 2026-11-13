// Stories (#stories). Add a story by adding an entry here; the first entry gets the large tile on the Stories tab.
// Each story also gets its own page at #stories/<id>. No dates on purpose.
// Wrap a phrase in **double asterisks** to highlight it (lime in the question, bold in body text).
// While the list is empty the Stories tab shows the "We're building the narrative" placeholder instead.
export type JourneyStep = {
  title: string;              // what happened at this step
  text: string;               // one line of detail
  fix?: string;               // set this if the step is where it broke: what was put in place (shown as a FIX box)
};
export type Story = {
  id: string;                 // short, unique, lowercase-with-dashes; also the page address (#stories/<id>)
  title: string;              // story page heading
  question: string;           // the tile headline on the Stories tab, phrased as the client's question
  hook: string;               // one or two lines under the question on the tile
  areas: string[];            // tags; also used as filters once there are a few stories
  stats: { value: string; label: string }[];   // first = the problem in a number, last = the result (shown on the tile)
  problem: string[];          // paragraphs; the first number appears after the first paragraph
  journey?: { title: string; steps: JourneyStep[] };   // optional "Where it broke" chapter, followed step by step
  whatWeDid: string[];
  outcome: string[];          // the result number appears before these paragraphs
  meta: string;               // e.g. "E-commerce · Bengaluru, India"
  note?: string;              // e.g. confidentiality line
  earlier?: boolean;          // true = done by our team in an earlier role, before NXT Foundry; shown as "Earlier work"
};

export const stories: Story[] = [
  {
    id: 'warehouse-stock-transfers',
    title: 'Bringing accountability to a ₹76 crore warehouse reconciliation gap',
    question: 'Where did **₹76 crore** of stock go between two warehouses?',
    hook: 'Transfers were closed on expected quantities and email confirmations — not on what actually arrived.',
    areas: ['Warehouse Operations', 'Supply Chain', 'Inventory Controls'],
    stats: [
      { value: '₹76 Cr', label: 'of stock dispatched between warehouses in six months, with no verified receipt' },
      { value: '~5%', label: 'of monthly stock transfers still open in disputes, after the fix' },
    ],
    problem: [
      'A large e-commerce business was struggling to reconcile stock transfers between its warehouses. Dispatching warehouses recorded the quantities sent, while receiving warehouses sometimes recorded different SKUs and quantities. Despite these mismatches, transfer orders were frequently closed based on expected quantities and email confirmations rather than verified receipts.',
      'An audit of six months of stock transfers identified approximately **₹76 crore worth of inventory dispatched under STOs for which the business no longer had clear visibility of the final receipt or whereabouts**. The underlying process also exposed the business to estimated quarterly inventory losses equivalent to approximately 17% of transferred material value.',
      'The root cause was disconnected warehouse systems and a reconciliation process that largely depended on month-end reviews.',
    ],
    journey: {
      title: 'Follow one stock transfer',
      steps: [
        { title: 'Warehouse A dispatches', text: 'Records the SKUs and quantities sent under a stock transfer order.' },
        { title: 'Warehouse B receives — different SKUs, different count', text: 'Nobody is told to expect it, so mismatches aren’t caught at the dock.', fix: 'Advance notice to the receiving warehouse, with transfer-specific SKU IDs and shelf-life data.' },
        { title: 'Transfer closed on an email', text: 'Closed on the expected quantity, not the verified receipt.', fix: 'A four-hour reconciliation window after receipt; unresolved gaps escalate automatically.' },
        { title: 'Found at month-end — if at all', text: 'By then, stock and accountability are hard to trace.', fix: 'Open transfers stay visible in each warehouse’s performance tracking.' },
      ],
    },
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
