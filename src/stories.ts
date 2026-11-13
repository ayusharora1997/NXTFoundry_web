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
  did: string;                // one sentence on the tile, under "What changed": what we did
  areas: string[];            // tags; also used as filters once there are a few stories
  stats: { value: string; label: string }[];   // first = the problem in a number, last = the result (shown on the tile)
  problem: string[];          // paragraphs; the first number appears after the first paragraph
  journey?: { title: string; steps: JourneyStep[] };   // optional "Where it broke" chapter, followed step by step
  whatWeDid: string[];
  outcome: string[];          // the result number appears before these paragraphs
  meta: string;               // e.g. "E-commerce · Bengaluru, India"
  note?: string;              // e.g. confidentiality line
  earlier?: boolean;          // true = shows the "EW" tag (fuller wording to be added once agreed)
};

export const stories: Story[] = [
  {
    id: 'fitness-access-controls',
    title: 'Closing ₹5 crore of revenue leakage in a fitness chain’s access controls',
    question: 'How was one member checking in at **two centres at once**?',
    hook: 'Shared devices, managers’ logins and housekeeping gate remotes were letting people in outside the membership process.',
    did: 'We limited each membership to one device and one sign-in method, and put gate barriers under monitoring.',
    areas: ['Revenue Leakage', 'Access Controls', 'Internal Audit'],
    stats: [
      { value: '₹5 Cr', label: 'in revenue leakage exposure across access and operational control gaps' },
      { value: '1 device', label: 'per membership, with any change approved through Customer Experience' },
    ],
    problem: [
      'A leading fitness and wellness chain had a streamlined membership and access model, but weaknesses in its operational controls were creating opportunities for revenue leakage. Our audit identified three key vulnerabilities.',
      '**Membership access misuse.** Members were accessing multiple centres simultaneously using QR codes, fingerprints and multiple devices. Attendance records showed impossible concurrent entries across geographically distant locations. Our investigation identified approximately **₹2 crore in potential revenue leakage** associated with such access misuse.',
      '**Unauthorised group-class access.** Certain centre managers were booking classes under their own credentials for unauthorised attendees. In some instances, unofficial trainers were also using gym facilities to offer paid training independently.',
      '**Manual gate access misuse.** Centre managers could operate swing barriers using separate remotes intended for housekeeping access. These were sometimes misused to admit non-members outside the standard membership process, particularly at franchise-operated centres.',
    ],
    journey: {
      title: 'Follow a member through the gate',
      steps: [
        { title: 'A member signs up', text: 'Gets QR and fingerprint access to every centre in the chain.' },
        { title: 'One membership, many devices — and two centres at once', text: 'The same access was used on several devices, with impossible concurrent entries across distant centres.', fix: 'One registered device per membership. Device changes need a CX request and approval; repeated changes trigger temporary restrictions and investigation.' },
        { title: 'QR or fingerprint, whichever is handy', text: 'Either method worked at any time, which made shared access easy.', fix: 'Single-mode authentication: switching between QR and fingerprint needs a CX ticket and approval.' },
        { title: 'Classes booked on a manager’s login', text: 'Unauthorised attendees joined group classes; unofficial trainers ran paid sessions on the premises.', fix: 'New KPIs on access exceptions, so each centre’s unusual activity is visible and accountable.' },
        { title: 'The barrier opened with a housekeeping remote', text: 'Non-members were let in outside the membership process, mostly at franchise centres.', fix: 'Swing-barrier openings and closures are now monitored and matched against an actual entry or exit.' },
      ],
    },
    whatWeDid: [
      'We conducted a revenue and access-control audit, working with the IT and revenue teams to assess vulnerabilities and strengthen controls across the membership journey.',
      '**Device-level access controls.** Membership access was restricted to one registered device. Device changes required a Customer Experience (CX) request and approval. Repeated changes triggered temporary restrictions and further investigation.',
      '**Single-mode authentication.** Members could access facilities through either QR authentication or fingerprint verification. Switching the access method required a CX ticket and appropriate approval.',
      '**Gate-level accountability.** Swing-barrier operations were brought under monitoring, tracking gate openings, closures and whether an actual entry or exit occurred.',
      '**Operational monitoring.** Additional KPIs were introduced to improve visibility into access exceptions and strengthen centre-level accountability.',
    ],
    outcome: [
      'The audit identified approximately **₹5 crore in overall revenue leakage exposure** across the access and operational control gaps, including approximately ₹2 crore associated with membership access misuse.',
      'The resulting control improvements strengthened membership authentication, reduced opportunities for unauthorised access and improved accountability over physical entry points.',
    ],
    meta: 'Fitness and wellness · Multi-centre chain',
    note: 'Client identity and operational details have been withheld for confidentiality.',
    earlier: true,
  },
  {
    id: 'warehouse-stock-transfers',
    title: 'Bringing accountability to a ₹76 crore warehouse reconciliation gap',
    question: 'Where did **₹76 crore** of stock go between two warehouses?',
    hook: 'Transfers were closed on expected quantities and email confirmations — not on what actually arrived.',
    did: 'We helped build a reconciliation tool with advance notice, a four-hour window and automatic escalation.',
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
