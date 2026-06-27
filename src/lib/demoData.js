// ─── Hardcoded demo data for BidClear "Try Demo" mode ─────────────────────────
// 3 subcontractors bidding on an electrical trade package

export const DEMO_PROJECT = {
  id: 'demo-project-001',
  project_name: 'Grandview Medical Office — Demo',
  trade_package: 'Electrical',
  client_name: 'Grandview Health Systems',
  status: 'ready',
  created_at: new Date().toISOString(),
}

export const DEMO_BIDS = [
  {
    id: 'demo-bid-1',
    project_id: 'demo-project-001',
    company_name: 'Apex Electrical Co.',
    base_total: 1245000,
    adjusted_total: 1282500,
    risk_level: 'low',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-bid-2',
    project_id: 'demo-project-001',
    company_name: 'Volta Power Systems',
    base_total: 1178000,
    adjusted_total: 1210000,
    risk_level: 'medium',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-bid-3',
    project_id: 'demo-project-001',
    company_name: 'Conduit Electric LLC',
    base_total: 1320000,
    adjusted_total: 1355000,
    risk_level: 'high',
    created_at: new Date().toISOString(),
  },
]

// Scope line items — the comparison matrix rows
const SCOPE_ITEMS = [
  'Main Distribution Panels',
  'Branch Wiring — Floors 1-4',
  'Emergency Generator & ATS',
  'Fire Alarm System',
  'Low Voltage / Data Cabling',
  'Lighting Fixtures & Controls',
  'Electrical Service Entrance',
  'Grounding & Bonding',
  'Conduit & Raceways',
  'Permits & Inspections',
]

// amount, status pairs per bid per item
const bidValues = {
  'demo-bid-1': [
    [185000, 'included'], [210000, 'included'], [145000, 'included'],
    [92000, 'included'], [78000, 'included'], [195000, 'included'],
    [115000, 'included'], [42000, 'included'], [135000, 'included'],
    [48000, 'included'],
  ],
  'demo-bid-2': [
    [178000, 'included'], [195000, 'included'], [null, 'excluded'],
    [88000, 'included'], [72000, 'included'], [205000, 'included'],
    [108000, 'included'], [38000, 'included'], [148000, 'included'],
    [46000, 'included'],
  ],
  'demo-bid-3': [
    [192000, 'included'], [225000, 'included'], [155000, 'included'],
    [95000, 'included'], [null, 'excluded'], [215000, 'included'],
    [120000, 'included'], [45000, 'included'], [null, 'excluded'],
    [52000, 'included'],
  ],
}

export const DEMO_SCOPE_ITEMS = SCOPE_ITEMS.flatMap((item, idx) =>
  DEMO_BIDS.map(bid => ({
    id: `demo-scope-${bid.id}-${idx}`,
    project_id: 'demo-project-001',
    bid_id: bid.id,
    item_name: item,
    amount: bidValues[bid.id][idx][0],
    status: bidValues[bid.id][idx][1],
  }))
)

export const DEMO_FLAGS = [
  {
    id: 'demo-flag-1',
    project_id: 'demo-project-001',
    bid_id: 'demo-bid-2',
    item_name: 'Emergency Generator & ATS',
    flag_type: 'scope_gap',
    extracted_text: 'Generator and automatic transfer switch not included in our scope of work. Owner to provide separate contract for emergency power systems.',
    gap_low: 120000,
    gap_high: 160000,
    recommendation: 'Request a separate quote from Volta Power Systems for the generator and ATS, or add the average gap value ($140,000) to their adjusted total for accurate comparison.',
    is_reviewed: false,
    note: null,
  },
  {
    id: 'demo-flag-2',
    project_id: 'demo-project-001',
    bid_id: 'demo-bid-3',
    item_name: 'Low Voltage / Data Cabling',
    flag_type: 'scope_gap',
    extracted_text: 'Data cabling excluded',
    gap_low: 60000,
    gap_high: 90000,
    recommendation: 'Conduit Electric excluded data cabling entirely. This is a significant scope gap — obtain a supplemental bid or include the midpoint ($75,000) in their adjusted total.',
    is_reviewed: false,
    note: null,
  },
  {
    id: 'demo-flag-3',
    project_id: 'demo-project-001',
    bid_id: 'demo-bid-3',
    item_name: 'Conduit & Raceways',
    flag_type: 'scope_gap',
    extracted_text: 'Conduit allowance only — final quantities to be determined at rough-in. Excludes surface-mount raceways for open-ceiling areas.',
    gap_low: 25000,
    gap_high: 50000,
    recommendation: 'The conduit scope from Conduit Electric is vague and incomplete. Clarify with the subcontractor whether the allowance covers all conduit runs shown on drawings.',
    is_reviewed: true,
    note: null,
  },
]

// ─── Helper: build the comparison matrix from demo data ────────────────────────
export function buildDemoMatrix() {
  const items = [...new Set(DEMO_SCOPE_ITEMS.map(s => s.item_name))].sort()
  return items.map(item => {
    const row = { item }
    DEMO_BIDS.forEach(bid => {
      const si = DEMO_SCOPE_ITEMS.find(s => s.bid_id === bid.id && s.item_name === item)
      const flag = DEMO_FLAGS.find(f => f.bid_id === bid.id && f.item_name === item)
      row[bid.id] = {
        amount: si?.amount ?? null,
        status: si?.status || (si ? 'included' : 'missing'),
        flag: flag || null,
      }
    })
    return row
  })
}

// ─── Dashboard-level summary for the demo project ──────────────────────────────
export const DEMO_DASHBOARD_PROJECTS = [
  {
    id: 'demo-project-001',
    name: 'Grandview Medical Office — Demo',
    trade: 'Electrical',
    bids: 3,
    gaps: DEMO_FLAGS.length,
    status: 'ready',
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  },
]
