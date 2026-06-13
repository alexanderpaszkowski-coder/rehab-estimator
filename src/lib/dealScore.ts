import type { HomeFile } from '../types'
import { AUCTION_SOURCES } from './funnel'
import { calcQuickEstimate } from './calculations'

export type NextActionKey =
  | 'calculate-arv'
  | 'estimate-rehab'
  | 'check-title'
  | 'verify-occupancy'
  | 'submit-offer'
  | 'review-deal'
  | 'monitor'
  | 'pass'

export type PriorityGroup = 'work-now' | 'needs-review' | 'watchlist' | 'pass'

export interface Tag {
  label: string
  group: 'status' | 'risk' | 'opportunity' | 'action'
  /** Priority within the group — lower = more important */
  priority: number
}

export interface StructuredTags {
  status: Tag[]
  risk: Tag[]
  opportunity: Tag[]
  action: Tag[]
  /** Up to 4 chips for card display, already prioritized */
  cardChips: Tag[]
  /** Count of all tags not shown on card */
  overflow: number
}

export interface DealAnalysis {
  score: number
  scoreLabel: string
  scoreTier: 'strong' | 'good' | 'caution' | 'weak'
  nextAction: string
  nextActionKey: NextActionKey
  priorityGroup: PriorityGroup
  tags: StructuredTags
  isThinMargin: boolean
  spread: number | null
  netMargin: number | null
  rehabEst: number | null
}

// ── Tag helpers ───────────────────────────────────────────────────────────────

function t(label: string, group: Tag['group'], priority: number): Tag {
  return { label, group, priority }
}

function computeStructuredTags(home: HomeFile, analysis: {
  score: number
  rehabEst: number | null
  isThinMargin: boolean
  spread: number | null
  nextAction: string
  nextActionKey: NextActionKey
}): StructuredTags {
  const f = home.funnel
  const isAuction = AUCTION_SOURCES.includes(home.source)

  // ── Status tags ──────────────────────────────────────
  const status: Tag[] = []
  if (home.stage === 'lead' && home.reviewStatus === 'pending') status.push(t('New', 'status', 1))
  if (!f.arv) status.push(t('ARV Needed', 'status', 2))
  if (f.arv && !analysis.rehabEst) status.push(t('Rehab Needed', 'status', 3))
  if (home.stage === 'solid-candidate') status.push(t('Offer Ready', 'status', 0))
  if (home.stage === 'under-contract') status.push(t('Under Contract', 'status', 0))
  if (home.stage === 'rehab') status.push(t('In Rehab', 'status', 0))
  if (home.stage === 'listed') status.push(t('Listed', 'status', 0))
  if (home.stage === 'sold') status.push(t('Sold', 'status', 0))
  if (home.stage === 'passed') status.push(t('Passed', 'status', 0))

  // ── Risk tags ────────────────────────────────────────
  const risk: Tag[] = []
  if (f.titleClear === 'no') risk.push(t('Title Issue', 'risk', 0))
  if (analysis.isThinMargin) risk.push(t('Thin Margin', 'risk', 1))
  if (f.occupancy === 'occupied') risk.push(t('Occupied', 'risk', 2))
  if (!f.arv) risk.push(t('ARV Unknown', 'risk', 3))
  if (!analysis.rehabEst) risk.push(t('Rehab Unknown', 'risk', 4))
  if (f.titleClear === null) risk.push(t('Title Unknown', 'risk', 5))
  if (f.occupancy === null) risk.push(t('Occupancy Unknown', 'risk', 6))
  if (f.inTargetArea === 'no') risk.push(t('Out of Area', 'risk', 7))
  if (isAuction) risk.push(t('Auction', 'risk', 8))
  if (isAuction && f.auctionStartAt) {
    const hoursUntil = (new Date(f.auctionStartAt).getTime() - Date.now()) / 3600_000
    if (hoursUntil > 0 && hoursUntil <= 48) risk.push(t('Deadline Soon', 'risk', 1))
  }

  // ── Opportunity tags ─────────────────────────────────
  const opportunity: Tag[] = []
  if (analysis.spread !== null && analysis.spread > 100_000) opportunity.push(t('Big Spread', 'opportunity', 0))
  if (f.occupancy === 'vacant') opportunity.push(t('Vacant', 'opportunity', 1))
  if (f.sellerMotivated === 'yes') opportunity.push(t('Motivated Seller', 'opportunity', 2))
  if (f.rehabLevel === 'Light') opportunity.push(t('Cosmetic Rehab', 'opportunity', 3))
  if (f.inTargetArea === 'yes') opportunity.push(t('In Target Area', 'opportunity', 4))
  if (analysis.score >= 75) opportunity.push(t('High Score', 'opportunity', 5))
  if (f.titleClear === 'yes') opportunity.push(t('Clear Title', 'opportunity', 6))

  // ── Action tags ──────────────────────────────────────
  const action: Tag[] = []
  action.push(t(analysis.nextAction, 'action', 0))
  if (f.titleClear === null && analysis.nextActionKey !== 'check-title') action.push(t('Check Liens', 'action', 1))
  if (f.occupancy === null && analysis.nextActionKey !== 'verify-occupancy') action.push(t('Drive By', 'action', 2))
  if (home.stage === 'solid-candidate' && analysis.nextActionKey !== 'submit-offer') action.push(t('Submit Offer', 'action', 3))

  // ── Card chips (max 4, priority-ordered across groups) ───────────────────────
  // Priority order: top risk → best opportunity → status context → secondary risk
  const candidates: Tag[] = [
    ...risk.slice(0, 2),
    ...opportunity.slice(0, 1),
    ...status.filter((s) => s.priority === 0).slice(0, 1),   // high-value status (Offer Ready etc.)
    ...risk.slice(2, 3),
    ...opportunity.slice(1, 2),
    ...status.filter((s) => s.priority > 0).slice(0, 1),
  ]
  const seen = new Set<string>()
  const cardChips: Tag[] = []
  for (const tag of candidates) {
    if (cardChips.length >= 4) break
    if (!seen.has(tag.label)) {
      seen.add(tag.label)
      cardChips.push(tag)
    }
  }

  const totalTags = status.length + risk.length + opportunity.length + action.length
  const overflow = Math.max(0, totalTags - cardChips.length - 1) // -1 for the action button shown separately

  return { status, risk, opportunity, action, cardChips, overflow }
}

// ── Main analyzer ─────────────────────────────────────────────────────────────

export function analyzeDeal(home: HomeFile): DealAnalysis {
  const f = home.funnel
  const quick = calcQuickEstimate(home.property, home.quickEstimate)
  const rehabEst = quick.withContingency > 0 ? quick.withContingency : null

  const spread = f.arv && f.askingPrice ? f.arv - f.askingPrice : null
  const netMargin = spread !== null && rehabEst ? spread - rehabEst : null
  const spreadPct = f.arv && spread !== null ? spread / f.arv : null
  const isThinMargin = spreadPct !== null && spreadPct < 0.15

  // ── Scoring (0–100) ──────────────────────────────────────────────────────────
  let score = 42

  if (f.arv) score += 8; else score -= 8

  if (spread !== null) {
    if (spread > 150_000) score += 22
    else if (spread > 100_000) score += 16
    else if (spread > 60_000) score += 10
    else if (spread > 25_000) score += 4
    else if (spread <= 0) score -= 20
    else score -= 3
  }

  if (spreadPct !== null) {
    if (spreadPct > 0.4) score += 8
    else if (spreadPct > 0.25) score += 4
    else if (spreadPct < 0.1) score -= 8
  }

  if (rehabEst) {
    score += 6
    if (netMargin !== null) {
      if (netMargin > 80_000) score += 10
      else if (netMargin > 40_000) score += 5
      else if (netMargin < 0) score -= 18
      else if (netMargin < 15_000) score -= 8
    }
  } else {
    score -= 4
  }

  if (f.inTargetArea === 'yes') score += 5
  else if (f.inTargetArea === 'no') score -= 20
  else if (f.inTargetArea === null) score -= 2

  if (f.occupancy === 'vacant') score += 7
  else if (f.occupancy === 'occupied') score -= 7
  else if (f.occupancy === null) score -= 2

  if (f.titleClear === 'yes') score += 5
  else if (f.titleClear === 'no') score -= 25

  if (f.sellerMotivated === 'yes') score += 4

  if (f.rehabLevel === 'Light') score += 4
  else if (f.rehabLevel === 'Heavy') score -= 4

  score = Math.max(0, Math.min(100, Math.round(score)))

  const scoreTier: DealAnalysis['scoreTier'] =
    score >= 80 ? 'strong' :
    score >= 65 ? 'good' :
    score >= 50 ? 'caution' : 'weak'

  const scoreLabel =
    score >= 80 ? 'Strong' :
    score >= 65 ? 'Worth Reviewing' :
    score >= 50 ? 'Needs Caution' : 'Weak'

  // ── Next action ──────────────────────────────────────────────────────────────
  let nextAction: string
  let nextActionKey: NextActionKey

  if (['sold', 'passed'].includes(home.stage)) {
    nextAction = 'Closed'; nextActionKey = 'pass'
  } else if (['under-contract', 'rehab', 'listed'].includes(home.stage)) {
    nextAction = 'Monitor'; nextActionKey = 'monitor'
  } else if (!f.arv) {
    nextAction = 'Calculate ARV'; nextActionKey = 'calculate-arv'
  } else if (!rehabEst) {
    nextAction = 'Estimate Rehab'; nextActionKey = 'estimate-rehab'
  } else if (f.titleClear === null) {
    nextAction = 'Check Title'; nextActionKey = 'check-title'
  } else if (f.occupancy === null) {
    nextAction = 'Verify Occupancy'; nextActionKey = 'verify-occupancy'
  } else if (home.stage === 'solid-candidate') {
    nextAction = 'Submit Offer'; nextActionKey = 'submit-offer'
  } else if (score < 40) {
    nextAction = 'Likely Pass'; nextActionKey = 'pass'
  } else {
    nextAction = 'Review Deal'; nextActionKey = 'review-deal'
  }

  // ── Priority group ───────────────────────────────────────────────────────────
  let priorityGroup: PriorityGroup
  if (['sold', 'passed'].includes(home.stage)) {
    priorityGroup = 'pass'
  } else if (['under-contract', 'rehab', 'listed'].includes(home.stage)) {
    priorityGroup = 'watchlist'
  } else if (score >= 70 && f.arv && rehabEst) {
    priorityGroup = 'work-now'
  } else if (score >= 45) {
    priorityGroup = 'needs-review'
  } else if (score >= 28) {
    priorityGroup = 'watchlist'
  } else {
    priorityGroup = 'pass'
  }

  // ── Structured tags ──────────────────────────────────────────────────────────
  const tags = computeStructuredTags(home, {
    score, rehabEst, isThinMargin, spread, nextAction, nextActionKey,
  })

  return {
    score, scoreLabel, scoreTier,
    nextAction, nextActionKey,
    priorityGroup,
    tags,
    isThinMargin, spread, netMargin, rehabEst,
  }
}
