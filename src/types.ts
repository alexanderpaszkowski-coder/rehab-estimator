export type Condition = 'None' | 'Light' | 'Moderate' | 'Heavy'
export type FinishGrade = 'Rental' | 'Flip-Builder' | 'Premium'
export type Tab = 'funnel' | 'lead' | 'property' | 'quick' | 'sow' | 'summary'

export type PropertySource =
  | 'auction.com'
  | 'realtor.com'
  | 'zillow'
  | 'redfin'
  | 'new-western'
  | 'zenlist'
  | 'homes.com'
  | 'homepath'
  | 'hubzu'
  | 'mls'
  | 'off-market'
  | 'wholesale'
  | 'direct-mail'
  | 'driving-for-dollars'
  | 'other'

export type FunnelStage =
  | 'lead'              // New Leads — partner uploads listing
  | 'arv-calculated'    // ARV Calculated
  | 'rehab-calculated'  // Rehab Calculated
  | 'solid-candidate'   // Solid Candidate — numbers look good
  | 'under-contract'
  | 'rehab'
  | 'listed'
  | 'sold'
  | 'passed'
  | 'auction-ended'     // Auction.com listing whose bidding window has closed

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
  /** In-person vs online auction format */
  auctionFormat: 'in-person' | 'online' | null
  /** ISO timestamp — auction bidding opens */
  auctionStartAt: string | null
  /** ISO timestamp — auction bidding closes */
  auctionEndAt: string | null
  /** True when auction.com shows "Coming Soon" with no dates */
  auctionComingSoon: boolean
  /** True when a refresh detected an active "current bid" (bidding is live and price has moved) */
  priceIsCurrentBid?: boolean
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

export type LoanType = 'hml' | 'heloc' | 'conventional' | 'cash'

/** How the loan amount is sized */
export type LoanBasis =
  | 'purchase'        // % of purchase price (LTP)
  | 'purchase-rehab'  // % of (purchase + rehab) (LTC) — finances rehab via draws
  | 'arv'             // % of ARV (ARLV)

export interface DealCosts {
  /** Buy-side closing costs as % of purchase price (default 0.02 = 2%) */
  buySideClosingPct: number
  /** Agent commissions as % of ARV (default 0.055 = 5.5%) */
  agentCommissionPct: number
  /** Sell-side closing costs as % of ARV (default 0.01 = 1%) */
  sellSideClosingPct: number
  /** Holding costs (taxes, insurance, utilities) — ANNUAL % of ARV, prorated by hold period (default 0.025 = 2.5%/yr) */
  holdingAnnualPct: number
  /** Financing type */
  loanType: LoanType
  /** How the loan amount is sized (default 'purchase-rehab') */
  loanBasis: LoanBasis
  /** Loan amount as % of the chosen basis (default 0.85) */
  loanAmountPct: number
  /** Maximum loan as % of ARV — lender's ARV cap (default 0.70 = 70%) */
  arvCapPct: number
  /** Origination points as % of loan amount — HML only (default 0.02 = 2 pts) */
  pointsPct: number
  /** Annual interest rate (default 0.11 = 11%) */
  interestRatePct: number
  /** Hold period in months (default 7) */
  holdMonths: number
}

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
  /** SOW categories the user has explicitly locked in — their line-item total replaces the QuickEstimate system cost */
  sowFinalized: Record<string, boolean>
  notes: string
  submittedBy: 'partner' | 'reviewer'
  reviewStatus: ReviewStatus
  reviewNotes: string
  links: string[]
  photoUrl?: string
  /** First name (or email prefix) of the user who added this property */
  addedByName?: string
  /** Original listing URL used to import this property */
  listingUrl?: string
  /** Transaction, holding & financing costs (defaults applied when absent) */
  dealCosts?: Partial<DealCosts>
  /** Manually pasted PropStream search/property URL */
  propstreamUrl?: string
  /** Last time listing data was refreshed from source */
  lastScrapedAt?: string
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
  /** Scraped above-grade living area (sq ft) → property.livingArea */
  livingArea?: number
  /** Scraped bedroom count → property.bedrooms */
  beds?: number
  /** Scraped bathroom count (can be fractional: 2.5 = 2 full + 1 half) → property.fullBaths / halfBaths */
  baths?: number
  /** Original listing URL pasted during intake */
  listingUrl?: string
}

export interface FunnelFilters {
  source: PropertySource | 'all'
  stage: FunnelStage | 'all' | 'active'
  availableForSale: TriState | 'all'
  inTargetArea: 'yes' | 'maybe' | 'no' | 'all'
  reviewStatus: ReviewStatus | 'all'
  search: string
}
