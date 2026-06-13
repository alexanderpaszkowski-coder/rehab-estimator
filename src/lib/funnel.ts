import type { FunnelScreen, FunnelStage, HomeFile, PropertySource } from '../types'

export const PROPERTY_SOURCES: { id: PropertySource; label: string }[] = [
  // ── Online marketplaces (auto-import capable) ──
  { id: 'auction.com',  label: 'Auction.com' },
  { id: 'realtor.com',  label: 'Realtor.com' },
  { id: 'zillow',       label: 'Zillow' },
  { id: 'redfin',       label: 'Redfin' },
  { id: 'new-western',  label: 'New Western' },
  { id: 'zenlist',      label: 'Zenlist' },
  { id: 'homes.com',    label: 'Homes.com' },
  { id: 'homepath',     label: 'Homepath' },
  { id: 'hubzu',        label: 'Hubzu' },
  // ── Manual sources ──
  { id: 'mls',                 label: 'MLS' },
  { id: 'off-market',          label: 'Off Market' },
  { id: 'wholesale',           label: 'Wholesale' },
  { id: 'direct-mail',         label: 'Direct Mail' },
  { id: 'driving-for-dollars', label: 'Driving for Dollars' },
  { id: 'other',               label: 'Other' },
]

// ── Source category helpers ────────────────────────────────────────────────────

/** Sources that behave like auctions (Opening bid / Est. Value labels) */
export const AUCTION_SOURCES: PropertySource[] = ['auction.com', 'hubzu']

/** Sources that behave like MLS listings (List Price / Estimate labels) */
export const MLS_SOURCES: PropertySource[] = [
  'realtor.com', 'zillow', 'redfin', 'zenlist', 'homes.com', 'homepath',
]

export function getArvLabel(source: PropertySource): string {
  if (AUCTION_SOURCES.includes(source)) return 'Est. Value'
  if (MLS_SOURCES.includes(source))     return 'Estimate'
  return 'ARV'
}

export function getBidLabel(source: PropertySource): string {
  if (AUCTION_SOURCES.includes(source)) return 'Starting Bid'
  if (MLS_SOURCES.includes(source))     return 'List Price'
  if (source === 'new-western')          return 'Purchase Price'
  return 'Asking'
}

export const FUNNEL_STAGES: { id: FunnelStage; label: string; color: string }[] = [
  { id: 'lead',             label: 'New Leads',        color: '#78716c' },
  { id: 'arv-calculated',   label: 'ARV Calculated',   color: '#2563eb' },
  { id: 'rehab-calculated', label: 'Rehab Calculated', color: '#7c3aed' },
  { id: 'solid-candidate',  label: 'Solid Candidate',  color: '#c2410c' },
  { id: 'under-contract',   label: 'Under Contract',   color: '#b45309' },
  { id: 'rehab',            label: 'In Rehab',         color: '#15803d' },
  { id: 'listed',           label: 'Listed',           color: '#0891b2' },
  { id: 'sold',             label: 'Sold',             color: '#166534' },
  { id: 'passed',           label: 'Passed',           color: '#b91c1c' },
]

/** Map legacy stage IDs (pre-redesign) to the new funnel. */
export const LEGACY_STAGE_MAP: Record<string, FunnelStage> = {
  screening:   'arv-calculated',
  walkthrough: 'rehab-calculated',
  offer:       'solid-candidate',
}

export const ACTIVE_STAGES: FunnelStage[] = [
  'lead', 'arv-calculated', 'rehab-calculated', 'solid-candidate',
  'under-contract', 'rehab', 'listed',
]

export function normalizeStage(stage: string): FunnelStage {
  if (LEGACY_STAGE_MAP[stage]) return LEGACY_STAGE_MAP[stage]
  const known = FUNNEL_STAGES.find((s) => s.id === stage)
  return known ? known.id : 'lead'
}

export const DEFAULT_FUNNEL: FunnelScreen = {
  availableForSale: null,
  askingPrice: null,
  arv: null,
  maxOffer: null,
  yearBuilt: null,
  occupancy: null,
  titleClear: null,
  inTargetArea: null,
  needsRehab: null,
  rehabLevel: null,
  sellerMotivated: null,
  quickNotes: '',
  auctionType: null,
  startingCreditBid: null,
  auctionFormat: null,
  auctionStartAt: null,
  auctionEndAt: null,
  auctionComingSoon: false,
}

export function getSourceLabel(home: HomeFile): string {
  if (home.source === 'other' && home.sourceCustom) return home.sourceCustom
  return PROPERTY_SOURCES.find((s) => s.id === home.source)?.label ?? home.source
}

export function getStageMeta(stage: FunnelStage) {
  return FUNNEL_STAGES.find((s) => s.id === stage) ?? FUNNEL_STAGES[0]
}

export function passesQuickScreen(funnel: FunnelScreen): boolean {
  if (funnel.availableForSale === 'no') return false
  if (funnel.inTargetArea === 'no') return false
  if (funnel.titleClear === 'no') return false
  return true
}

export function screenScore(funnel: FunnelScreen): number {
  let score = 0
  if (funnel.availableForSale === 'yes') score += 2
  if (funnel.inTargetArea === 'yes') score += 2
  if (funnel.inTargetArea === 'maybe') score += 1
  if (funnel.titleClear === 'yes') score += 2
  if (funnel.sellerMotivated === 'yes') score += 1
  if (funnel.rehabLevel) score += 1
  if (funnel.occupancy === 'vacant') score += 1
  if (funnel.arv && funnel.askingPrice && funnel.arv > funnel.askingPrice) score += 2
  return score
}
