export type Condition = 'None' | 'Light' | 'Moderate' | 'Heavy'
export type FinishGrade = 'Rental' | 'Flip-Builder' | 'Premium'
export type Tab = 'funnel' | 'lead' | 'property' | 'quick' | 'sow' | 'summary'

export type PropertySource =
  | 'auction.com'
  | 'mls'
  | 'off-market'
  | 'wholesale'
  | 'direct-mail'
  | 'driving-for-dollars'
  | 'other'

export type FunnelStage =
  | 'lead'
  | 'screening'
  | 'walkthrough'
  | 'offer'
  | 'under-contract'
  | 'rehab'
  | 'listed'
  | 'sold'
  | 'passed'

export type TriState = 'yes' | 'no' | 'unknown' | null

export interface FunnelScreen {
  availableForSale: TriState
  askingPrice: number | null
  arv: number | null
  maxOffer: number | null
  yearBuilt: number | null
  occupancy: 'vacant' | 'occupied' | 'unknown' | null
  titleClear: TriState
  inTargetArea: 'yes' | 'maybe' | 'no' | null
  needsRehab: TriState
  rehabLevel: 'Light' | 'Moderate' | 'Heavy' | null
  sellerMotivated: TriState
  quickNotes: string
  // auction.com-specific fields
  auctionType: 'auction' | 'bank-owned' | null
  startingCreditBid: number | null
}

export interface PropertyField {
  id: string
  label: string
  unit: string
  hint: string
  value: string | number
  section: 'measurements' | 'counts' | 'kitchen' | 'settings'
  options?: string[]
}

export interface QuickSystem {
  id: string
  name: string
  condition: Condition
  unit: string
  qty: number | string
  light: number
  moderate: number
  heavy: number
  description: string
}

export interface SowLine {
  type: 'line'
  id: string
  category: string | null
  name: string
  spec: string
  unit: string
  unitCost: number
  qty: number | string
  bid: number | string
  actual: number | string
  notes: string
}

export interface SowCategory {
  type: 'category'
  name: string
  category: string
}

export interface SowSubtotal {
  type: 'subtotal'
  category: string | null
  name: string
}

export type SowItem = SowLine | SowCategory | SowSubtotal

export interface PropertyInputs {
  livingArea: number
  basementArea: number
  roofArea: number
  sidingArea: number
  ceilingHeight: number
  windows: number
  exteriorDoors: number
  interiorDoors: number
  fullBaths: number
  halfBaths: number
  bedrooms: number
  baseCabinets: number | null
  wallCabinets: number | null
  countertops: number | null
  finishGrade: FinishGrade
  contingency: number
  marketAdj: number
}

export type ReviewStatus = 'pending' | 'reviewed' | 'approved' | 'passed'

export interface HomeFile {
  id: string
  address: string
  city: string
  state: string
  zip: string
  source: PropertySource
  sourceCustom: string
  stage: FunnelStage
  funnel: FunnelScreen
  createdAt: string
  updatedAt: string
  property: PropertyInputs
  quickEstimate: QuickSystem[]
  sowLines: Record<string, { qty: number | string; bid: number | string; actual: number | string; notes: string }>
  notes: string
  submittedBy: 'partner' | 'reviewer'
  reviewStatus: ReviewStatus
  reviewNotes: string
  links: string[]
  photoUrl?: string
}

export interface CategorySummary {
  category: string
  estimate: number
  bid: number
  actual: number
  variance: number
}

export interface IntakeData {
  address: string
  city: string
  state: string
  zip: string
  source: PropertySource
  sourceCustom: string
  funnel: FunnelScreen
  links?: string[]
  submittedBy?: 'partner' | 'reviewer'
  photoUrl?: string
}

export interface FunnelFilters {
  source: PropertySource | 'all'
  stage: FunnelStage | 'all' | 'active'
  availableForSale: TriState | 'all'
  inTargetArea: 'yes' | 'maybe' | 'no' | 'all'
  reviewStatus: ReviewStatus | 'all'
  search: string
}
