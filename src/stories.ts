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
      'A large automotive organisation’s IT operations involved multiple service areas, including Data Centre, Network, SAP, Workplace, Information Security and Service Desk.',
      'Purchase order and invoice information was distributed across SAP exports, Excel files and stakeholder-maintained trackers. Finance, procurement and delivery teams lacked a consolidated view of the PO lifecycle, making it difficult to identify unmapped purchase orders, reconcile invoices and resolve outstanding exceptions. This resulted in:',
      '- **Significant value** sitting in unmapped purchase orders\n- Manual reconciliation across fragmented data sources\n- Delays in identifying invoice and service-confirmation mismatches\n- Limited ownership and visibility of outstanding financial exceptions',
    ],
    journey: {
      title: 'Follow one purchase order',
      steps: [
        { title: 'A PO is raised and approved', text: 'For one of several IT service areas — Data Centre, Network, SAP, Workplace and more.' },
        { title: 'It never gets mapped to a service', text: 'PO data sits in SAP exports and spreadsheets, so nobody sees it’s unmapped.', fix: 'One lifecycle view, from PO creation and approval through service confirmation, invoicing and payment.' },
        { title: 'Invoice and service confirmation don’t match', text: 'Partial payments, multi-service contracts and unlinked confirmations go unnoticed.', fix: 'Exception flags, plus reconciliation of PO value, invoiced amount and payment to show what’s outstanding.' },
        { title: 'The exception ages without an owner', text: 'Long-pending values build up across service areas.', fix: 'Aging analysis, filters by service line, region, value and status, and recurring reviews with finance, procurement, delivery and PMO.' },
      ],
    },
    whatWeDid: [
      'We developed a Power BI-based PO and invoice lifecycle dashboard to bring together information from finance, procurement and delivery teams. The solution included:',
      '- **PO lifecycle tracking:** consolidated visibility from PO creation and approval through service confirmation, invoicing and payment\n- **Exception management:** identified unmapped POs, partial payments, multi-service contracts and unlinked service confirmations\n- **Financial reconciliation:** compared PO values, invoiced amounts and payments to identify outstanding balances and discrepancies\n- **Aging analysis:** highlighted long-pending and unresolved PO values across service areas\n- **Stakeholder-level reporting:** enabled teams to filter and investigate exceptions by service line, region, PO value and status\n- **Governance and monitoring:** supported recurring reviews with finance, procurement, delivery and PMO stakeholders',
    ],
    outcome: [
      'The dashboard improved financial visibility and helped teams systematically investigate and resolve outstanding PO mapping issues.',
      'Unmapped PO value reduced from **€42 million to €12.3 million**, a reduction of approximately **70.7%**.',
      'The initiative also established a more structured approach to PO tracking, invoice reconciliation and cross-functional exception management.',
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
    journey: {
      title: 'Follow one purchase decision',
      steps: [
        { title: 'The forecast comes in', text: 'At 30–40% accuracy, planners override it by hand.', fix: 'Models recalibrated with seasonal and regional signals, MAPE tracked, and overrides limited to defined exceptions.' },
        { title: 'A fresh PO goes out', text: 'OTB, run-rate and unhealthy-item limits aren’t consistently enforced.', fix: 'Automated checks, PO restrictions and escalation of significant policy breaches.' },
        { title: 'Stock lands where demand is low', text: 'Other regions run short, and nothing triggers a transfer.', fix: 'SKU-level ageing and sales-velocity comparisons to move stock before ordering more.' },
        { title: 'It ages past 180 days', text: 'Provisioned in the books, but still sitting in the warehouse.', fix: 'A Power BI view of provisioned stock, ageing and liquidation opportunities.' },
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
    journey: {
      title: 'Follow one payroll run',
      steps: [
        { title: 'Attendance and salary inputs arrive', text: 'A large workforce, many salary components and statutory deductions to process.' },
        { title: 'More than 90 checks, done by hand', text: 'HR and payroll teams validate each area manually before processing.', fix: '94 validation and audit checks automated in Power BI with Power Query and DAX, across eight control areas.' },
        { title: 'Bank and identity changes are easy to miss', text: 'Changed bank accounts, IFSC codes, PAN or Aadhaar sit inside sensitive data.', fix: 'Flags for bank and IFSC changes, duplicate accounts, and PAN or Aadhaar changes.' },
        { title: 'Verification stretches to seven days', text: 'Exceptions surface late, if at all, and payroll is delayed.', fix: 'One dashboard for HR, Finance and Internal Audit to clear exceptions before disbursement.' },
        { title: 'Little proof the controls are working', text: 'Control effectiveness is hard to show at audit time.', fix: 'Structured exception reporting that strengthens audit readiness.' },
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
      { value: '5', label: 'risk areas, from listing manipulation to seller re-entry' },
      { value: '3 tiers', label: 'of risk — low, medium and high — each with its own review route' },
    ],
    problem: [
      'Large e-commerce marketplaces operate across extensive seller networks, product categories and constantly changing listings. Traditional rule-based monitoring and reactive customer complaints can make it difficult to identify suspicious sellers and potentially counterfeit products before they affect customers.',
      'The conceptual assessment identified several risk areas:',
      '- **Listing manipulation:** frequent changes to product descriptions, MRP and listing attributes could help suspicious sellers evade conventional monitoring\n- **Seller re-entry:** previously delisted sellers could attempt to return through alternate accounts, devices or addresses\n- **Unusual pricing behaviour:** abnormal MRP fluctuations and discount patterns could indicate deceptive pricing or suspicious listing activity\n- **Returns and complaint anomalies:** unusually high return rates, negative feedback and counterfeit complaints could signal potentially problematic products or sellers\n- **Fragmented risk intelligence:** seller, listing, transaction, customer feedback and device data were not being considered together in a unified risk assessment',
    ],
    journeyLabel: 'How a risk is caught',
    journey: {
      title: 'Follow one suspicious listing',
      steps: [
        { title: 'A seller lists a product', text: 'Descriptions, MRP and attributes can change at any time.' },
        { title: 'The listing keeps shifting', text: 'Frequent changes to descriptions, MRP and discounts help it slip past fixed rules.', fix: 'Listing monitoring tracks MRP changes, pricing volatility, listing quality, ratings and returns over time.' },
        { title: 'Returns and complaints start to rise', text: 'High returns, negative reviews and counterfeit complaints build up — risk signals, not proof.', fix: 'Review sentiment analysis and anomaly detection feed a composite score that places the listing in a low, medium or high risk tier.' },
        { title: 'The seller looks familiar', text: 'A delisted seller may try to return through new accounts, devices or addresses.', fix: 'Behavioural matching against previously flagged sellers. A shared IP or similar address prompts investigation — on its own it doesn’t prove two accounts are linked.' },
        { title: 'High risk triggers a review, not removal', text: 'A person decides what happens next.', fix: 'Alerts go to manual investigation and enforcement, and verified outcomes feed back into the detection models.' },
      ],
    },
    whatWeDid: [
      'We designed a conceptual anti-counterfeit intelligence framework combining listing-level monitoring, seller behaviour analysis and risk-based investigation. It covered four capabilities:',
      '- **Listing risk identification:** monitored listing quality, MRP changes, pricing volatility, customer ratings and return patterns to identify suspicious product listings\n- **Seller behaviour intelligence:** compared active seller profiles against previously flagged seller patterns using pricing behaviour, category activity, complaint history, addresses and device-level signals\n- **Composite risk scoring:** combined multiple risk indicators into a structured scoring model to classify listings and sellers into low-, medium- and high-risk categories\n- **Investigation and feedback:** a workflow for risk alerts, manual investigation, enforcement actions and feeding verified outcomes back into the detection framework',
      'The proposed architecture combined:',
      '- SQL-based data extraction and integration\n- Python-based anomaly detection using techniques such as Isolation Forest and DBSCAN\n- Similarity analysis to identify seller behaviour patterns\n- Time-series analysis of pricing and MRP movements\n- NLP-based customer review and sentiment analysis\n- Power BI dashboards for risk monitoring, exception tracking and investigation prioritisation',
      'Three things set it apart:',
      '- **Behavioural seller matching:** going beyond individual listing checks to identify patterns associated with previously flagged sellers\n- **Multi-signal risk scoring:** combining pricing, returns, complaints, listing quality and seller history rather than relying on one indicator\n- **Closed-loop risk management:** feeding verified investigation outcomes back into the detection models to improve future identification',
    ],
    outcome: [
      'The framework was designed to help marketplaces:',
      '- Identify suspicious listings and sellers earlier\n- Prioritise investigations based on risk severity\n- Detect repeat offenders and potential seller re-entry\n- Improve visibility into counterfeit-related returns and complaints\n- Support regulatory compliance monitoring\n- Strengthen marketplace trust and brand protection through proactive monitoring',
      'A suspicious price movement or a high return rate is a risk signal, not proof that a product is counterfeit. The framework is built to prioritise human review, not to replace it.',
    ],
    meta: 'E-commerce marketplace · Brand protection',
    note: 'This is an independently developed conceptual framework. The models, thresholds, expected improvements and examples are illustrative and are not verified implementation results.',
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
