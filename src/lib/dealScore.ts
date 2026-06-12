import type { HomeFile } from '../types'
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

export interface DealAnalysis {
  score: number
  scoreLabel: string
  scoreTier: 'strong' | 'good' | 'caution' | 'weak'
  nextAction: string
  nextActionKey: NextActionKey
  priorityGroup: PriorityGroup
  riskChips: string[]
  isThinMargin: boolean
  spread: number | null
  netMargin: number | null
  rehabEst: number | null
}

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

  if (f.arv) score += 8
  else score -= 8

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

  // ── Risk chips (priority-ordered) ────────────────────────────────────────────
  const risks: string[] = []
  if (f.titleClear === 'no') risks.push('Title Issue')
  if (isThinMargin) risks.push('Thin Margin')
  if (f.occupancy === 'occupied') risks.push('Occupied')
  if (!f.arv) risks.push('ARV Unknown')
  if (!rehabEst) risks.push('Rehab Unknown')
  if (f.titleClear === null) risks.push('Title Unknown')
  if (f.occupancy === null && f.occupancy !== 'occupied') risks.push('Occupancy Unknown')
  if (f.inTargetArea === 'no') risks.push('Out of Area')

  return {
    score, scoreLabel, scoreTier,
    nextAction, nextActionKey,
    priorityGroup,
    riskChips: risks.slice(0, 3),
    isThinMargin, spread, netMargin, rehabEst,
  }
}
