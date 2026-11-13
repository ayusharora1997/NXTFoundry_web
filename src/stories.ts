// Stories (#stories). Add a story by adding an entry here; the first entry gets the large tile on the Stories tab.
// Each story also gets its own page at #stories/<id>. No dates on purpose.
// Wrap a phrase in **double asterisks** to highlight it (lime in the question, bold in body text).
// A paragraph that starts with "- " is shown as a bullet list; separate items with "\n- ".
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
  industry: string;           // Stories filter, e.g. "Automotive", "E-commerce"
  type: 'Consulting project' | 'Tech implementation' | 'Concept';   // Stories filter
  areas: string[];            // tags; also used as filters once there are a few stories
  stats: { value: string; label: string }[];   // first = the problem in a number, last = the result (shown on the tile)
  problem: string[];          // paragraphs; the first number appears after the first paragraph
  journey?: { title: string; steps: JourneyStep[] };   // optional "Where it broke" chapter, followed step by step
  visual?: VisualChapter | VisualChapter[];   // optional picture chapter(s): use instead of, or as well as, a journey
  journeyLabel?: string;      // optional chapter title instead of "Where it broke" (concepts: steps show "Risk signal" / "Response")
  whatIf?: {                  // optional interactive chart chapter: pick two criteria, points reposition on a 0–10 grid
    chapter: string;          // chapter title, e.g. "Try the what-if"
    intro: string;
    dims: string[];           // the criteria (scores in each point follow this order)
    defaultX?: number; defaultY?: number;
    points: { label: string; group: string; s: number[] }[];
    note: string;             // shown under the chart, e.g. "Illustrative data"
  };
  whatWeDid: string[];
  outcome: string[];          // the result number appears before these paragraphs
  meta: string;               // e.g. "E-commerce · Bengaluru, India"
  note?: string;              // e.g. confidentiality line
  changeLabel?: string;       // optional tile label instead of "What changed", e.g. "What we set out to change"
  impactLabel?: string;       // optional last-chapter title instead of "The outcome", e.g. "Intended impact"
  concept?: boolean;          // true = an independently developed concept, not client work: "Concept" tag,
                              // "What it could change" on the tile and "Illustrative impact" as the last chapter
  earlier?: boolean;          // true = shows the "EW" tag (fuller wording to be added once agreed)
};

export type VisualChapter = {
    chapter: string;
    after?: boolean;          // true = show after "What we did" (e.g. results), instead of before it
    blocks: (
      | { kind: 'shift'; title: string; before: { label: string; value: number; display: string }; after: { label: string; value: number; display: string }; change: string; caption: string }
      | { kind: 'lifecycle'; title: string; stages: { name: string; flags?: string[] }[]; caption: string; neutral?: boolean }   // neutral: tags are tools, not problems
      | { kind: 'controls'; title: string; items: { name: string; checks: string }[]; caption?: string }
      | { kind: 'loop'; title: string; nodes: { name: string; gap: string; fix: string }[]; closes: string }
      | { kind: 'points'; title: string; nodes: { name: string; gap: string; fix: string }[]; caption?: string }
      | { kind: 'split'; title: string; parts: { label: string; value: number; display: string }[]; total: string; caption: string }
      | { kind: 'score'; title: string; signals: string[]; tiers: { name: string; route: string }[]; loop: string }
      | { kind: 'venn'; title: string; sets: { name: string; items: string[] }[]; centre: string; caption?: string }
      | { kind: 'stairs'; title: string; start: string; steps: { stuck: string; next: string }[]; end: string; caption?: string }
      | { kind: 'mrp'; title: string; listings: { name: string; mrp: number; price: number }[]; caption: string }
    )[];
};

export const stories: Story[] = [
  {
    id: 'automotive-po-invoice-lifecycle',
    industry: 'Automotive',
    type: 'Tech implementation',
    title: 'Cutting €42 million of unmapped purchase orders to €12.3 million',
    question: 'Which of **€42 million** in purchase orders had nobody mapped?',
    hook: 'PO and invoice data was spread across SAP exports, Excel files and team trackers — with no single view of the lifecycle.',
    did: 'We built a Power BI dashboard that tracks every PO from approval to payment and surfaces the exceptions.',
    areas: ['Procure to Pay', 'Financial Controls', 'IT Operations'],
    stats: [
      { value: '€42M', label: 'sitting in unmapped purchase orders across IT service areas' },
      { value: '−70.7%', label: 'unmapped PO value, down from €42 million to €12.3 million' },
    ],
    problem: [
      'A large automotive organisation’s IT operations spanned several service areas, including Data Centre, Network, SAP, Workplace, Information Security and Service Desk. Keeping control of the full purchase-order lifecycle — from creation through payment — mattered for reconciliation, governance and cash flow.',
      'Purchase order and invoice information was spread across SAP exports, Excel files and stakeholder-maintained trackers, each in its own format. Finance, procurement and delivery teams had no consolidated view, so mismatches and delays between POs and invoices surfaced late. This resulted in:',
      '- **Significant value** sitting in unmapped purchase orders\n- Reconciliation queries taking **3–4 days** on average to answer\n- High manual effort to resolve mismatches\n- Delays in invoice clearance, affecting cash flow and vendor relationships\n- Fragmented engagement across finance, procurement and delivery',
    ],
    visual: [
      {
        chapter: 'Where POs got stuck',
        blocks: [
          { kind: 'stairs', title: 'Every PO has to clear five gates before revenue is recognised', start: 'Total POs', steps: [
            { stuck: 'Pending submission', next: 'Submitted' },
            { stuck: 'Pending approval', next: 'Approved' },
            { stuck: 'Unmapped', next: 'Mapped' },
            { stuck: 'Pending invoice', next: 'Invoice raised' },
            { stuck: 'Unpaid or partially paid', next: 'Completely paid' },
          ], end: 'Total recognised revenue', caption: 'The dashboard shows how much value sits at each gate, so teams can see exactly where a PO has stalled and who needs to move it.' },
        ],
      },
      {
        chapter: 'The exceptions',
        blocks: [
          { kind: 'points', title: 'Four edge cases that broke simple PO-to-invoice matching', nodes: [
            { name: 'AMC contracts', gap: 'A single service spread across several staggered POs.', fix: 'Logic to group POs into families and recognise them together.' },
            { name: 'Multi-service bundles', gap: 'One invoice applied to several service lines.', fix: 'Service-type attribution using keywords.' },
            { name: 'Partial payments', gap: 'One PO linked to split payments.', fix: 'Dynamic tracking of pending versus cleared amounts.' },
            { name: 'Unlinked confirmations', gap: 'Service confirmed, but no invoice raised.', fix: 'Flagged as “Pending billing”, with escalations triggered.' },
          ], caption: 'The rules were codified in Power Query before the data reached the dashboard, so every exception is classified the same way each week.' },
        ],
      },
      {
        chapter: 'How the dashboard works',
        blocks: [
          { kind: 'lifecycle', title: 'From scattered files to one view', stages: [
            { name: 'Excel files and SAP exports', flags: ['Finance', 'Procurement', 'Delivery'] },
            { name: 'Consolidated database', flags: ['Standard field names', 'PO-to-invoice joins'] },
            { name: 'Cleaning and analysis in Power BI', flags: ['Power Query', 'Exception logic'] },
            { name: 'Dashboards', flags: ['Outcomes', 'Exceptions'] },
          ], caption: 'Missing or delayed inputs are flagged rather than dropped, so gaps in the data are visible too.', neutral: true },
          { kind: 'controls', title: 'Five dashboard modules', items: [
            { name: 'PO lifecycle tracker', checks: 'Each PO from creation to payment: submitted → approved → confirmed → invoiced → paid' },
            { name: 'Exception overview', checks: 'Mismatches and unmapped POs, categorised and quantified' },
            { name: 'Aging heatmap', checks: 'How long unmapped POs have been pending, by service type and region' },
            { name: 'Payment reconciliation', checks: 'Invoice against payment, including overdue and partial payments' },
            { name: 'PO drill-down', checks: 'PO-level tracing by service line, region, value bracket, status and exception type' },
          ], caption: 'KPI tiles show total PO value, % mapped versus unmapped and the total pending amount; anything pending for more than 90 days turns red.' },
        ],
      },
      {
        chapter: 'The results',
        after: true,
        blocks: [
          { kind: 'shift', title: 'Unmapped purchase-order value', before: { label: 'Before', value: 42, display: '€42M' }, after: { label: 'After', value: 12.3, display: '€12.3M' }, change: '−70.7%', caption: 'as teams worked through the exceptions the dashboard surfaced.' },
          { kind: 'shift', title: 'Exception-flagged PO value', before: { label: 'Before', value: 23, display: '€23M' }, after: { label: 'After', value: 1.3, display: '€1.3M' }, change: '−94%', caption: 'once exceptions were classified, owned and reviewed every week.' },
          { kind: 'shift', title: 'Time to answer a reconciliation query', before: { label: 'Before', value: 3.5, display: '3–4 days' }, after: { label: 'After', value: 1, display: '<24 hrs' }, change: 'Same-day answers', caption: 'with one source of truth for finance, procurement and delivery.' },
        ],
      },
    ],
    whatWeDid: [
      'We designed and built a Power BI-based PO and invoice lifecycle dashboard — not as a static report, but as an operations layer for reconciliation, escalations and planning. The work ran in four phases:',
      '- **Planning and scoping:** requirements gathered with finance controllers, procurement heads, delivery tower leads, the PMO and business analysts; lifecycle stages, KPIs, a data-mapping matrix and an exception typology defined up front\n- **Data ingestion and exception handling:** an integration pipeline that standardised field names (PO ID, invoice number, confirmation and payment status), joined PO, invoice and confirmation data, and classified edge cases\n- **Dashboard design:** a multi-layered Power BI dashboard with KPI tiles, bar and waterfall charts of PO value by status, and filters by region, service line, PO amount bracket and exception category\n- **Monitoring and adoption:** the dashboard became a core tool for weekly financial and delivery governance, with exception logic and filters refined as new edge cases emerged',
      'A fixed weekly rhythm kept it current and acted on:',
      '- **Monday to Wednesday:** data uploads from stakeholders\n- **Monday and Wednesday:** dashboard refresh and validation\n- **Friday:** PO governance review with finance, delivery and the PMO\n- **As needed:** exception triage, with ad hoc escalations and weekly deep dives',
    ],
    outcome: [
      'Unmapped PO value fell from **€42 million to €12.3 million** — a reduction of about **70.7%** — and exception-flagged PO value from **€23 million to €1.3 million**. Reconciliation queries that took 3–4 days were answered within 24 hours.',
      'The dashboard was used in weekly working-capital and cash-flow calls, helped delivery heads follow up on unbilled services, and let finance controllers spot blockers to invoice clearance. Manual reconciliation dropped, and stakeholder engagement moved from reactive and fragmented to proactive and shared.',
    ],
    meta: 'Automotive · IT operations · Procure to pay',
    note: 'Client identity and confidential operational details have been withheld.',
    earlier: true,
  },
  {
    id: 'fitness-access-controls',
    industry: 'Fitness & wellness',
    type: 'Consulting project',
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
    visual: {
      chapter: 'Where people got in',
      blocks: [
        { kind: 'split', title: 'Revenue leakage exposure found by the audit', parts: [
          { label: 'Membership access misuse', value: 2, display: '₹2 Cr' },
          { label: 'Other access and operational gaps', value: 3, display: '₹3 Cr' },
        ], total: '≈ ₹5 crore', caption: 'in overall exposure across the access and operational control gaps.' },
        { kind: 'points', title: 'Three ways in, outside the membership process', nodes: [
          { name: 'App and biometric entry', gap: 'One membership on several devices, with impossible concurrent entries across distant centres.', fix: 'One registered device and one sign-in method; changes need a CX request and approval.' },
          { name: 'Group classes', gap: 'Managers booked classes on their own logins for unauthorised attendees; unofficial trainers ran paid sessions.', fix: 'New KPIs on access exceptions, so each centre’s unusual activity is visible and accountable.' },
          { name: 'Swing barriers', gap: 'Housekeeping remotes opened gates for non-members, mostly at franchise centres.', fix: 'Gate openings and closures monitored and matched against an actual entry or exit.' },
        ] },
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
    industry: 'E-commerce',
    type: 'Tech implementation',
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
  {
    id: 'wholesale-slow-moving-inventory',
    industry: 'E-commerce',
    type: 'Consulting project',
    title: 'Breaking the cycle of slow and non-moving inventory in B2B wholesale',
    question: 'Why was the business **buying more** of stock it couldn’t sell?',
    hook: 'Aged inventory kept piling up while fresh purchase orders went out. The books were provisioned; the warehouses weren’t cleared.',
    did: 'We reworked how demand, buying and stock connect — from forecasting and PO controls to redistribution between regions.',
    areas: ['Inventory Health', 'Procurement Controls', 'Demand Planning'],
    stats: [
      { value: '30–40%', label: 'forecast accuracy, driving manual overrides and excess buying' },
      { value: '6 fixes', label: 'across forecasting, buying, redistribution and stock visibility' },
    ],
    problem: [
      'A large B2B wholesale e-commerce business was experiencing a growing accumulation of slow and non-moving (SNM) inventory across multiple categories and warehouses.',
      'Despite having inventory provisioning policies and demand-planning processes, aged inventory continued to accumulate while fresh purchase orders were being raised. Financial provisioning was taking place, but the underlying stock was not being cleared. The assessment highlighted four interconnected challenges:',
      '- **Inventory accumulation:** significant working capital remained locked in inventory aged beyond 180 days\n- **Weak procurement controls:** Open-to-Buy (OTB), SKU run-rate limits and unhealthy-item restrictions were not consistently enforced\n- **Forecasting gaps:** forecast accuracy remained around 30–40%, increasing reliance on manual overrides and contributing to excess procurement\n- **Regional inventory imbalance:** stock remained idle in low-demand locations while other regions experienced shortages, with no systematic trigger for redistribution',
    ],
    visual: {
      chapter: 'The broken loop',
      blocks: [
        { kind: 'loop', title: 'Demand, buying and stock weren’t talking to each other', nodes: [
          { name: 'Forecast', gap: 'Around 30–40% accurate, so planners overrode it by hand.', fix: 'Seasonal and regional recalibration, MAPE tracking, overrides only for defined exceptions.' },
          { name: 'Purchase order', gap: 'OTB, run-rate and unhealthy-item limits weren’t consistently enforced.', fix: 'Automated checks, PO restrictions, classification approvals and escalation of breaches.' },
          { name: 'Inventory', gap: 'Stock idled in low-demand regions and aged past 180 days — provisioned, but not cleared.', fix: 'Redistribution before reordering, and a Power BI view of ageing and liquidation.' },
        ], closes: 'ASP–MSP–PO variance monitoring feeds what was actually bought back into the next plan.' },
      ],
    },
    whatWeDid: [
      'We assessed the inventory planning, procurement and replenishment processes and identified opportunities to strengthen the feedback loop between demand, buying and inventory execution. The proposed improvements covered six areas:',
      '- **Inter-warehouse redistribution:** SKU-level inventory ageing and sales-velocity comparisons to identify stock that could be transferred from low-demand to high-demand regions before placing fresh orders\n- **Forecasting improvements:** recalibrating forecasting models using seasonal and regional demand signals, introducing MAPE as a performance measure and restricting manual overrides to defined exceptions\n- **Purchase-order controls:** stronger OTB, SKU run-rate and unhealthy-list controls through automated checks, PO restrictions and escalation of significant policy breaches\n- **Provisioning and liquidation visibility:** a Power BI dashboard to track provisioned inventory, ageing and liquidation opportunities, helping teams distinguish financial provisioning from actual stock clearance\n- **Inventory classification governance:** stronger controls over A/B/C/D/O inventory classification, including approval requirements and purchase restrictions for selected inventory categories\n- **Sales-plan and procurement alignment:** an ASP–MSP–PO variance monitoring approach to identify deviations between sales plans and actual purchasing decisions',
    ],
    outcome: [
      'The interventions were designed to improve inventory health and working-capital efficiency by:',
      '- Reducing avoidable procurement of slow-moving inventory\n- Improving stock availability through regional redistribution\n- Strengthening compliance with purchasing policies\n- Improving visibility into inventory ageing and liquidation requirements\n- Establishing clearer accountability for forecast deviations and procurement decisions',
    ],
    meta: 'B2B wholesale e-commerce · Inventory and procurement',
    note: 'Client identity and confidential engagement details have been withheld. Specific improvement opportunities and control mechanisms are described at a high level.',
    changeLabel: 'What we set out to change',
    impactLabel: 'Intended impact',
    earlier: true,
  },
  {
    id: 'payroll-compliance-framework',
    industry: 'Apparel manufacturing',
    type: 'Concept',
    title: 'Automating 94 payroll checks for apparel manufacturers',
    question: 'What if **90+ payroll checks** didn’t take a week by hand?',
    hook: 'Large workforces, many salary components and statutory deductions — all verified manually before every payroll run.',
    did: 'We built a conceptual Power BI framework that automates 94 payroll validation and audit checks across eight control areas.',
    areas: ['Payroll Controls', 'Automation', 'Internal Audit'],
    stats: [
      { value: '90+', label: 'manual checks before every payroll run, with verification taking up to seven days' },
      { value: '7 → 2 days', label: 'illustrative payroll verification time with the checks automated' },
    ],
    problem: [
      'Apparel manufacturing businesses often manage complex payroll processes involving large workforces, multiple salary components, attendance records and statutory deductions. Manual verification across these areas can create significant operational effort and increase the risk of errors, missed exceptions and delayed payroll processing.',
      'The conceptual assessment identified several common challenges:',
      '- More than **90 manual checks** required before payroll processing\n- Significant HR and payroll manpower involved in routine validation\n- Verification cycles extending up to **seven days**\n- Risk of errors in sensitive employee, banking and salary data\n- Limited visibility into payroll exceptions and control effectiveness',
    ],
    visual: {
      chapter: 'The control map',
      blocks: [
        { kind: 'controls', title: '94 checks across eight control areas', items: [
          { name: 'Employee status', checks: 'Joining and exit dates, status, employee ID' },
          { name: 'Banking details', checks: 'Bank account and IFSC changes, duplicate accounts' },
          { name: 'Payroll processing', checks: 'PAN and Aadhaar changes, salary variances, overtime, leave adjustments' },
          { name: 'Headcount', checks: 'Month-on-month and department-level comparisons' },
          { name: 'Payroll components', checks: 'Basic pay, DA, allowances, deductions, bonuses' },
          { name: 'Leave and attendance', checks: 'Leave balances, absences, leave encashment' },
          { name: 'Tax and statutory', checks: 'TDS, PF, ESI, tax exemptions' },
          { name: 'Internal audit controls', checks: 'Duplicate payments, data integrity, change monitoring, exceptions' },
        ], caption: 'Every area is checked before disbursement, on one dashboard for HR, Finance and Internal Audit.' },
        { kind: 'shift', title: 'Payroll verification time (illustrative)', before: { label: 'Manual', value: 7, display: '7 days' }, after: { label: 'Automated', value: 2, display: '2 days' }, change: '5 days sooner', caption: 'in the illustrative scenario — not a verified client result.' },
      ],
    },
    whatWeDid: [
      'We developed a conceptual Power BI-based payroll compliance framework using Power Query and DAX to automate **94 payroll validation and internal audit checks**, structured across eight control areas:',
      '- **Employee status:** joining and exit dates, employee status and employee ID validation\n- **Banking details:** bank account and IFSC changes, duplicate account identification\n- **Payroll processing:** PAN and Aadhaar changes, salary variances, overtime and leave adjustments\n- **Headcount:** month-on-month and department-level workforce comparisons\n- **Payroll components:** basic pay, DA, allowances, deductions and bonuses\n- **Leave and attendance:** leave balances, absences and leave encashment\n- **Tax and statutory compliance:** TDS, PF, ESI and tax exemption validation\n- **Internal audit controls:** duplicate payments, data integrity, change monitoring and exception reporting',
      'The dashboard was designed to help HR, Finance and Internal Audit teams identify discrepancies before payroll disbursement.',
    ],
    outcome: [
      'The framework demonstrates the potential to:',
      '- Reduce payroll verification time from **seven days to two days**\n- Automate the review of **94 recurring checks**\n- Improve visibility into exceptions and payroll control performance\n- Reduce repetitive manual validation and free up HR resources for higher-value activities\n- Strengthen audit readiness through structured exception reporting',
    ],
    meta: 'Apparel manufacturing · Payroll',
    note: 'This is an independently developed conceptual framework. All examples, figures and business scenarios are illustrative and are not presented as verified client implementation results.',
    concept: true,
  },
  {
    id: 'global-location-strategy',
    industry: 'Banking & financial services',
    type: 'Concept',
    title: 'Choosing where to build: a what-if framework for 17 cities',
    question: 'Where should the next centre go if **talent matters more than cost**?',
    hook: 'Leaders were comparing cities through disconnected reports, so trade-offs were hard to see — and harder to agree on.',
    did: 'We built a conceptual Power BI framework that scores 17 cities on one 0–10 scale and lets leaders test trade-offs live.',
    areas: ['Location Strategy', 'Decision Support', 'Power BI'],
    stats: [
      { value: '17', label: 'cities, including five Indian metros, compared on five strategic dimensions' },
      { value: '10', label: 'what-if pairings of the five criteria, from cost vs talent to security vs cost' },
    ],
    problem: [
      'Organisations evaluating new operational or innovation centres across multiple countries must balance cost, talent availability, regulatory requirements and geopolitical risks.',
      'Comparing locations using disconnected reports and inconsistent data makes it difficult for leadership teams to assess trade-offs and establish a consistent basis for decision-making. The conceptual framework evaluated **17 global cities**, including five major Indian metropolitan cities, across five strategic dimensions:',
      '- Cost attractiveness\n- Data storage and security\n- Political and regulatory environment\n- Talent availability\n- Geopolitical stability',
    ],
    whatWeDid: [
      'We developed an interactive Power BI city evaluation dashboard to consolidate multi-source research into a consistent, comparable decision-support framework. The solution included:',
      '- **Standardised city scoring:** normalised different quantitative and qualitative indicators onto a common 0–10 scoring scale\n- **City comparison scorecards:** side-by-side assessment of cities across all five strategic dimensions\n- **Global and India views:** switch between the international shortlist and Indian city comparisons\n- **Interactive ranking and heatmaps:** relative strengths and weaknesses across the 17 locations\n- **What-if scenario analysis:** select two evaluation criteria and dynamically reposition cities on an interactive scatter plot\n- **Strategic fit matrix:** cities grouped into a 3×3 matrix to highlight strong candidates and locations involving significant trade-offs',
    ],
    whatIf: {
      chapter: 'Try the what-if',
      intro: 'The most useful part isn’t the scorecard — it’s the what-if view. A leadership team can change its priorities and see how the relative attractiveness of cities shifts. Try **cost vs talent**, **data security vs cost**, or **geopolitical stability vs talent**.',
      dims: ['Cost attractiveness', 'Data storage and security', 'Political and regulatory environment', 'Talent availability', 'Geopolitical stability'],
      defaultX: 0,
      defaultY: 3,
      points: [
        { label: 'IN-1', group: 'Indian metro', s: [8.6, 6.1, 6.0, 8.8, 6.8] },
        { label: 'IN-2', group: 'Indian metro', s: [8.9, 5.8, 5.7, 8.1, 6.6] },
        { label: 'IN-3', group: 'Indian metro', s: [9.1, 5.5, 5.9, 7.4, 6.7] },
        { label: 'IN-4', group: 'Indian metro', s: [8.2, 6.4, 6.2, 7.9, 6.9] },
        { label: 'IN-5', group: 'Indian metro', s: [9.3, 5.2, 5.4, 6.6, 6.5] },
        { label: 'G-1', group: 'Global city', s: [3.1, 8.9, 8.7, 9.0, 8.8] },
        { label: 'G-2', group: 'Global city', s: [2.6, 9.2, 9.0, 8.4, 9.1] },
        { label: 'G-3', group: 'Global city', s: [4.2, 8.4, 8.2, 7.6, 8.3] },
        { label: 'G-4', group: 'Global city', s: [5.8, 7.2, 7.0, 6.9, 7.6] },
        { label: 'G-5', group: 'Global city', s: [6.9, 6.6, 6.4, 7.2, 7.0] },
        { label: 'G-6', group: 'Global city', s: [7.6, 5.4, 5.0, 6.3, 5.6] },
        { label: 'G-7', group: 'Global city', s: [3.8, 8.8, 8.9, 6.8, 9.0] },
        { label: 'G-8', group: 'Global city', s: [5.2, 7.8, 7.6, 8.1, 7.9] },
        { label: 'G-9', group: 'Global city', s: [7.2, 4.9, 4.6, 5.8, 4.8] },
        { label: 'G-10', group: 'Global city', s: [6.4, 7.0, 6.9, 5.9, 7.4] },
        { label: 'G-11', group: 'Global city', s: [8.0, 5.0, 4.8, 5.2, 5.4] },
        { label: 'G-12', group: 'Global city', s: [4.8, 8.1, 7.9, 7.1, 8.4] },
      ],
      note: 'Illustrative data: anonymised locations and scores, not real city ratings.',
    },
    outcome: [
      'The framework was designed to help leadership teams:',
      '- Compare global expansion locations using a consistent evaluation methodology\n- Understand trade-offs between cost, talent, security and geopolitical considerations\n- Test different strategic priorities through interactive scenario analysis\n- Shortlist locations for deeper feasibility assessments and business-case development\n- Communicate location-selection rationale through a common visual framework',
    ],
    meta: 'Location strategy · 17 cities · 5 dimensions',
    note: 'This is an independently developed conceptual framework. The cities, scoring methodology and examples are illustrative and do not represent an actual banking institution’s expansion decisions.',
    impactLabel: 'Strategic value',
    concept: true,
  },
  {
    id: 'marketplace-anti-counterfeit',
    industry: 'E-commerce',
    type: 'Concept',
    title: 'Spotting counterfeit risk on a marketplace before customers do',
    question: 'How do you catch a **banned seller** coming back under a new name?',
    hook: 'Listings change constantly, and rule-based checks and customer complaints only flag problems after customers are affected.',
    did: 'We designed a conceptual framework that scores listings and sellers on many signals and routes the riskiest to investigation.',
    areas: ['Brand Protection', 'Risk Analytics', 'Marketplace Trust'],
    stats: [
      { value: '>3', label: 'MRP changes in a month — one of the signals that a listing may be manipulated' },
      { value: '3 tiers', label: 'of risk — under 60, 60–80 and 80+ — each with its own review route' },
    ],
    problem: [
      'Counterfeit products are a growing threat to consumer trust, brand reputation and regulatory compliance in Indian e-commerce. As digital marketplaces reach deeper into Tier 2 and Tier 3 cities, consumers are more exposed to fake goods — especially in high-demand categories such as apparel, footwear, electronics, cosmetics and luxury accessories.',
      'A vast seller ecosystem, combined with light seller verification and listing moderation, gives counterfeiters room to operate:',
      '- **Large, lightly verified seller base:** open marketplaces onboard third-party sellers quickly, often with minimal KYC, so new accounts are easy to create\n- **Dynamic listings:** sellers frequently change titles, MRP, descriptions and images, which helps them slip past listing audits and mimic genuine listings\n- **Rule-based monitoring:** fixed rules miss behaviour-based patterns such as repeated MRP manipulation or seasonal pricing anomalies\n- **Reactive enforcement:** penalties often follow customer complaints, by which time the damage is done',
      'The cost shows up across the platform: more returns and refunds, higher support costs, manual audits and investigations, damage to the reputation of the marketplace and its genuine sellers — and brands that may pull out of marketplaces that don’t protect them.',
    ],
    visual: [
      {
        chapter: 'Spotting a fake listing',
        blocks: [
          { kind: 'venn', title: 'Three lenses on every listing', sets: [
            { name: 'Listing score', items: ['Listing score = listing rating × returns % × seller rating', 'Score below the average for the same vertical'] },
            { name: 'Frequent MRP changes', items: ['More than **3 MRP updates in a month**', 'More than **5 MRP updates in a quarter**'] },
            { name: 'Variance in MRP', items: ['**40%+** price swing during sale periods', '**25%+** gap to the MRP of the best-selling listing', '**40%+** gap to the MRP of an Alpha Seller or other marketplace sellers (min and max)'] },
          ], centre: 'Higher risk', caption: 'Each signal carries a weight. A listing that trips more than one lens has a higher probability of being counterfeit.' },
          { kind: 'mrp', title: 'How an inflated MRP manufactures a bigger “discount”', listings: [
            { name: 'Genuine MRP', mrp: 25000, price: 15000 },
            { name: 'Inflated MRP', mrp: 30000, price: 15000 },
          ], caption: 'Same selling price, a bigger headline discount. Platforms often limit how often a seller can change the selling price, so moving the MRP becomes the lever — and during sales, counterfeit sellers mimic market-wide price drops to avoid suspicion. Illustrative figures.' },
        ],
      },
      {
        chapter: 'Spotting a returning seller',
        blocks: [
          { kind: 'controls', title: 'Eight behavioural fingerprints, matched against previously blacklisted sellers', items: [
            { name: 'Pricing behaviour', checks: 'Frequent MRP changes (more than 3 a month); 30–50% price dips during peak sales' },
            { name: 'Consumer feedback', checks: 'Surge in 1-star ratings; counterfeit complaints on the listing and to CX' },
            { name: 'Category patterns', checks: 'High volume in risky sub-categories; shifts to adjacent ones, like hair oil to hair care' },
            { name: 'Sales and returns', checks: 'High sales velocity with a matching spike in returns' },
            { name: 'Network traits', checks: 'IP addresses and device fingerprints shared with known offenders' },
            { name: 'Address and postal code', checks: 'Similar addresses, postal codes or names to blacklisted sellers' },
            { name: 'SKU lifecycle', checks: 'Short-lived SKUs listed and delisted within 30 days; high churn' },
            { name: 'Seller Protection Fund', checks: 'Multiple SPF claims during flash sales or after negative reviews' },
          ], caption: 'A match is a reason to look closer, not proof. A shared IP or a similar address on its own does not establish that two accounts belong to the same person.' },
        ],
      },
      {
        chapter: 'How a risk is scored',
        blocks: [
          { kind: 'score', title: 'Risk score = Σ (signal weight × signal value)', signals: [
            'MRP and price changes', 'Discount patterns', 'Listing score', 'Ratings and reviews', 'Return rates', 'Counterfeit complaints', 'Seller history', 'Device and address signals',
          ], tiers: [
            { name: 'Under 60', route: 'Routine monitoring' },
            { name: '60–80', route: 'Enhanced monitoring and alerts' },
            { name: '80+', route: 'Flag for manual review and investigation — not automatic removal' },
          ], loop: 'Verified investigation outcomes feed back into the models, so detection improves over time.' },
          { kind: 'lifecycle', title: 'The analytical pipeline', stages: [
            { name: 'Collect and validate', flags: ['8 data sources'] },
            { name: 'Pre-process', flags: ['Normalisation', 'Encoding'] },
            { name: 'Detect anomalies', flags: ['Isolation Forest', 'DBSCAN'] },
            { name: 'Model MRP over time', flags: ['Seasonal ARIMA', 'LSTM'] },
            { name: 'Benchmark listings', flags: ['Vertical scoring', 'Random Forest'] },
            { name: 'Read the reviews', flags: ['Sentiment (BERT)'] },
            { name: 'Integrate and validate', flags: ['Entity resolution'] },
          ], caption: 'From raw listing, seller and customer data to a scored, validated view of risk.', neutral: true },
        ],
      },
    ],
    whatWeDid: [
      'We designed a conceptual anti-counterfeit framework combining listing-level monitoring, seller behaviour analysis and risk-based investigation, built on eight data sources:',
      '- **Listing metadata:** titles, descriptions, category tags, brand and images\n- **Pricing and MRP history:** time-stamped MRP and selling-price logs, including seasonal discounts\n- **Customer feedback:** ratings, review text, return tags and reason codes\n- **Transaction data:** units sold, order frequency and sales velocity by SKU\n- **Complaint and refund logs:** counterfeit claims, refund issues and Seller Protection Fund usage\n- **Network and device logs:** IP addresses, browser fingerprints and device IDs\n- **Seller master data:** registered addresses, KYC, category preferences and ratings\n- **Returns and RTO data:** return and return-to-origin rates by SKU, seller and category',
      'The workflow runs in five steps:',
      '- **Data ingestion:** continuous extraction of listing data and seller updates\n- **Scoring and flagging:** risk scoring applied daily; high-risk listings flagged for review\n- **Alerts:** real-time alerts for sudden MRP changes or abnormal return spikes\n- **Investigation and remediation:** the risk team reviews flagged listings; confirmed counterfeits are removed and sellers penalised\n- **Feedback loop:** verified cases are fed back into the models to improve detection',
      'A pattern-matching engine compares active sellers with blacklisted “fingerprints” using cosine similarity or Euclidean distance on behaviour vectors, K-Means or DBSCAN clustering to find blacklist-like groups, and One-Class SVM or Isolation Forest to isolate outliers. Results surface in Power BI dashboards, with SQL for data extraction and Python for the models.',
      'Three things set it apart:',
      '- **Behavioural seller matching:** going beyond individual listing checks to identify patterns associated with previously flagged sellers\n- **Multi-signal risk scoring:** combining pricing, returns, complaints, listing quality and seller history rather than relying on one indicator\n- **Closed-loop risk management:** feeding verified investigation outcomes back into the detection models',
      'The platform framework sits alongside methods brands can use themselves:',
      '- **Overt:** product serialisation (unique codes, QR) and tamper-evident packaging\n- **Covert:** anti-counterfeit cells, IP registration assistance and brand registry programmes\n- **Digital:** taggants, GTIN and ISBN validation, and track-and-trace platforms\n- **Forensic:** laboratory analysis such as spectroscopy, chromatography and microscopy',
    ],
    outcome: [
      'The framework was designed to help marketplaces:',
      '- Identify suspicious listings and sellers earlier\n- Prioritise investigations based on risk severity\n- Detect repeat offenders and potential seller re-entry\n- Reduce returns, complaints and manual audit effort linked to counterfeits\n- Support regulatory compliance monitoring, with audit trails for MRP changes and enforcement actions\n- Strengthen marketplace trust and brand protection through proactive monitoring',
      'Metrics to track include the share of flagged listings in top categories, return rates on flagged SKUs, time from risk flag to resolution, brand-partner satisfaction and customer repeat rate.',
      'A suspicious price movement or a high return rate is a risk signal, not proof that a product is counterfeit. The framework is built to prioritise human review, not to replace it.',
    ],
    meta: 'E-commerce marketplace · Brand protection',
    note: 'This is an independently developed conceptual framework demonstrating domain knowledge and analytical thinking in e-commerce risk management. It does not reference, replicate or disclose confidential information from any client or employer. All examples, figures, models and thresholds are illustrative and are not verified implementation results.',
    impactLabel: 'Intended impact',
    concept: true,
  },
];

// Major industries shown as filter boxes on the Stories tab. Map each story's industry to one of these;
// a new industry with no entry here shows under its own name.
export const SECTORS: Record<string, string> = {
  'Automotive': 'Manufacturing',
  'Apparel manufacturing': 'Manufacturing',
  'E-commerce': 'Retail & e-commerce',
  'Fitness & wellness': 'Consumer services',
  'Banking & financial services': 'Financial services',
};
export const sectorOf = (s: Story) => SECTORS[s.industry] ?? s.industry;
