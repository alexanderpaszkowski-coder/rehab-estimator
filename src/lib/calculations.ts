import { DEFAULT_DEAL_COSTS, FINISH_CATEGORIES, FINISH_FACTORS, SOW_TEMPLATE } from './defaults'
import type {
  CategorySummary,
  Condition,
  DealCosts,
  HomeFile,
  PropertyInputs,
  QuickSystem,
  SowItem,
  SowLine,
} from '../types'

export function num(v: number | string | null | undefined): number {
  if (v === '' || v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function getFinishFactor(grade: string): number {
  return FINISH_FACTORS[grade] ?? 1
}

export function autoKitchenLf(gla: number, per1000: number): number {
  if (!gla) return 0
  return Math.round((gla / 1000) * per1000 * 10) / 10
}

export function getAutoQty(systemName: string, property: PropertyInputs): number {
  const gla = property.livingArea
  switch (systemName) {
    case 'Demo & dumpsters':
      return gla
    case 'Roof':
      return property.roofArea
    case 'Siding & exterior paint':
      return property.sidingArea
    case 'Windows':
      return property.windows
    case 'Exterior doors':
      return property.exteriorDoors
    case 'Interior doors & trim':
      return property.interiorDoors
    case 'Drywall / plaster':
      return gla
    case 'Interior paint':
      return gla
    case 'Flooring':
      return gla
    case 'Insulation':
      return gla
    case 'Bathrooms (full)':
      return property.fullBaths
    case 'Bathrooms (half)':
      return property.halfBaths
    default:
      return 1
  }
}

export function getSystemQty(system: QuickSystem, property: PropertyInputs): number {
  const manual = num(system.qty)
  if (manual > 0) return manual
  return getAutoQty(system.name, property)
}

export function getConditionRate(system: QuickSystem): number {
  const map: Record<Condition, number> = {
    None: 0,
    Light: num(system.light),
    Moderate: num(system.moderate),
    Heavy: num(system.heavy),
  }
  return map[system.condition] ?? 0
}

export function calcQuickSystemCost(system: QuickSystem, property: PropertyInputs): number {
  if (system.condition === 'None') return 0
  const qty = getSystemQty(system, property)
  const rate = getConditionRate(system)
  const base = qty * rate

  const finishSystems = ['Kitchen', 'Bathrooms (full)', 'Bathrooms (half)', 'Flooring', 'Interior paint', 'Interior doors & trim', 'Siding & exterior paint']
  const factor = finishSystems.some((s) => system.name.includes(s.split(' ')[0]) || system.name === s)
    ? getFinishFactor(property.finishGrade)
    : 1

  return base * factor * property.marketAdj
}

export function calcQuickEstimate(property: PropertyInputs, systems: QuickSystem[]) {
  const lineCosts = systems.map((s) => ({
    name: s.name,
    cost: calcQuickSystemCost(s, property),
  }))
  const point = lineCosts.reduce((sum, l) => sum + l.cost, 0)
  const low = point * 0.9
  const high = point * 1.2
  const withContingency = point * (1 + property.contingency)
  const perSf = property.livingArea ? withContingency / property.livingArea : 0

  return { lineCosts, point, low, high, withContingency, perSf }
}

export function calcLineEstimate(
  unitCost: number,
  qty: number | string,
  category: string | null,
  property: PropertyInputs,
): number {
  const q = num(qty)
  if (q <= 0) return 0
  let cost = q * unitCost
  if (category && FINISH_CATEGORIES.has(category)) {
    cost *= getFinishFactor(property.finishGrade)
  }
  cost *= property.marketAdj
  return cost
}

export function calcSowTotals(home: HomeFile, sowItems: SowItem[]) {
  const byCategory: Record<string, CategorySummary> = {}

  for (const item of sowItems) {
    if (item.type !== 'line') continue
    const cat = item.category ?? 'Other'
    const data = home.sowLines[item.id] ?? { qty: '', bid: '', actual: '', notes: '' }
    const estimate = calcLineEstimate(item.unitCost, data.qty, cat, home.property)
    const bid = num(data.bid)
    const actual = num(data.actual)

    if (!byCategory[cat]) {
      byCategory[cat] = { category: cat, estimate: 0, bid: 0, actual: 0, variance: 0 }
    }
    byCategory[cat].estimate += estimate
    byCategory[cat].bid += bid
    byCategory[cat].actual += actual
  }

  const categories = Object.values(byCategory).map((c) => ({
    ...c,
    variance: c.actual - c.estimate,
  }))

  const hardSubtotal = categories.reduce((s, c) => s + c.estimate, 0)
  const bidTotal = categories.reduce((s, c) => s + c.bid, 0)
  const actualTotal = categories.reduce((s, c) => s + c.actual, 0)
  const contingency = hardSubtotal * home.property.contingency
  const total = hardSubtotal + contingency
  const perSf = home.property.livingArea ? total / home.property.livingArea : 0

  const quick = calcQuickEstimate(home.property, home.quickEstimate)

  return {
    categories,
    hardSubtotal,
    bidTotal,
    actualTotal,
    contingency,
    total,
    perSf,
    quickWithContingency: quick.withContingency,
    quickGap: total - quick.withContingency,
    quickGapFlag: quick.withContingency > 0 && Math.abs(total - quick.withContingency) / quick.withContingency > 0.2,
    benchmark: getBenchmark(perSf),
  }
}

export function getBenchmark(perSf: number): string {
  if (perSf <= 0) return '—'
  if (perSf < 15) return 'Below cosmetic ($15–25/SF)'
  if (perSf <= 25) return 'Cosmetic ($15–25/SF)'
  if (perSf <= 45) return 'Moderate ($25–45/SF)'
  if (perSf <= 75) return 'Full gut ($45–75/SF)'
  return 'Gut + structural ($75+/SF)'
}

// ── SOW ↔ QuickEstimate bridge ────────────────────────────────────────────────

/**
 * Maps each QuickEstimate system ID to the SOW category it conceptually covers.
 * When a SOW category is finalized by the user, every QE system pointing to it
 * is replaced by the SOW line-item subtotal for that category.
 *
 * Multi-system categories (e.g. ROOF & GUTTERS covers both qe-6 and qe-7):
 * the SOW total replaces the combined QE cost for those systems.
 */
export const QE_TO_SOW_CATEGORY: Record<string, string> = {
  'qe-5':  'DEMOLITION & SITE PREP',
  'qe-6':  'ROOF & GUTTERS',
  'qe-7':  'ROOF & GUTTERS',
  'qe-8':  'EXTERIOR & CURB APPEAL',
  'qe-9':  'WINDOWS',
  'qe-10': 'EXTERIOR & CURB APPEAL',
  'qe-11': 'EXTERIOR & CURB APPEAL',
  'qe-12': 'EXTERIOR & CURB APPEAL',
  'qe-13': 'EXTERIOR & CURB APPEAL',
  'qe-14': 'FOUNDATION & WATERPROOFING',
  'qe-15': 'FRAMING & STRUCTURAL',
  'qe-16': 'INSULATION & DRYWALL',
  'qe-17': 'INSULATION & DRYWALL',
  'qe-18': 'INTERIOR PAINT',
  'qe-19': 'FLOORING',
  'qe-20': 'INTERIOR DOORS, TRIM & CLOSETS',
  'qe-21': 'KITCHEN',
  'qe-22': 'BATHROOMS',
  'qe-23': 'BATHROOMS',
  'qe-24': 'PLUMBING',
  'qe-25': 'ELECTRICAL',
  'qe-26': 'HVAC',
  'qe-27': 'BASEMENT FINISH',
  'qe-28': 'DEMOLITION & SITE PREP',
  'qe-29': 'PERMITS, FEES & GENERAL CONDITIONS',
}

/**
 * When multiple QE systems share a SOW category, this maps each QE system ID
 * to the specific SOW line item IDs it is responsible for within that category.
 * Systems not listed here are the sole owner of their mapped category.
 *
 * DEMOLITION & SITE PREP:  qe-5 (demo) | qe-28 (hazmat)
 * ROOF & GUTTERS:          qe-6 (roof) | qe-7 (gutters/soffit/fascia)
 * EXTERIOR & CURB APPEAL:  qe-8 (siding) | qe-10 (ext doors) | qe-11 (garage)
 *                          | qe-12 (landscaping) | qe-13 (concrete/driveway)
 * INSULATION & DRYWALL:    qe-16 (insulation) | qe-17 (drywall)
 */
export const QE_SOW_ITEM_IDS: Record<string, string[]> = {
  // DEMOLITION & SITE PREP
  'qe-5':  ['sow-5', 'sow-6', 'sow-7', 'sow-8', 'sow-9', 'sow-10', 'sow-11'],
  'qe-28': ['sow-12', 'sow-13'],
  // ROOF & GUTTERS
  'qe-6':  ['sow-17', 'sow-18', 'sow-19', 'sow-20', 'sow-21'],
  'qe-7':  ['sow-22', 'sow-23'],
  // EXTERIOR & CURB APPEAL
  'qe-8':  ['sow-27', 'sow-28', 'sow-29', 'sow-30'],
  'qe-10': ['sow-31', 'sow-32', 'sow-33'],
  'qe-11': ['sow-34', 'sow-35'],
  'qe-12': ['sow-36', 'sow-39', 'sow-40', 'sow-41', 'sow-42'],
  'qe-13': ['sow-37', 'sow-38'],
  // INSULATION & DRYWALL
  'qe-16': ['sow-69', 'sow-70'],
  'qe-17': ['sow-71', 'sow-72', 'sow-73'],
}

/** Compute the raw SOW line-item estimate total for one category (no contingency). */
export function calcSowCategoryRaw(home: HomeFile, category: string): number {
  let total = 0
  for (const item of SOW_TEMPLATE) {
    if (item.type !== 'line') continue
    if ((item as SowLine).category !== category) continue
    const data = home.sowLines[(item as SowLine).id] ?? { qty: '', bid: '', actual: '', notes: '' }
    total += calcLineEstimate((item as SowLine).unitCost, data.qty, category, home.property)
  }
  return total
}

/** Compute the raw SOW estimate total for a specific set of line item IDs. */
export function calcSowItemsTotal(home: HomeFile, itemIds: string[]): number {
  const idSet = new Set(itemIds)
  let total = 0
  for (const item of SOW_TEMPLATE) {
    if (item.type !== 'line') continue
    const line = item as SowLine
    if (!idSet.has(line.id)) continue
    const data = home.sowLines[line.id] ?? { qty: '', bid: '', actual: '', notes: '' }
    total += calcLineEstimate(line.unitCost, data.qty, line.category ?? '', home.property)
  }
  return total
}

export interface BlendedRehabResult {
  /** Per-system cost breakdown — source tells you which side provided the number */
  lineCosts: { name: string; cost: number; source: 'estimate' | 'sow' }[]
  point: number
  low: number
  high: number
  withContingency: number
  perSf: number
  /** SOW categories that are finalized and currently overriding QE systems */
  sowOverrideCategories: Set<string>
}

/**
 * Blended rehab estimate.
 *
 * For each QuickEstimate system, use the QuickEstimate cost UNLESS the SOW
 * category it belongs to has been finalized by the user — in that case use
 * the SOW line-item subtotal for that category instead (added once, even when
 * multiple QE systems share the same SOW category).
 *
 * SOW categories that have no corresponding QE system (e.g. CLEANING, STAGING
 * & MISC) are added on top when finalized.
 */
export function calcBlendedRehab(home: HomeFile): BlendedRehabResult {
  const finalized = home.sowFinalized ?? {}

  // Pre-compute SOW totals for every finalized category (computed once each)
  const sowCategoryTotals = new Map<string, number>()
  const sowOverrideCategories = new Set<string>()
  for (const [cat, isFinalized] of Object.entries(finalized)) {
    if (isFinalized) {
      sowCategoryTotals.set(cat, calcSowCategoryRaw(home, cat))
      sowOverrideCategories.add(cat)
    }
  }

  // Which QE systems are overridden? Track which SOW categories (without item
  // splits) have already contributed their total so we don't double-count.
  const sowCategoryContributed = new Set<string>()
  const lineCosts: BlendedRehabResult['lineCosts'] = []

  for (const system of home.quickEstimate) {
    const sowCat = QE_TO_SOW_CATEGORY[system.id]
    if (sowCat && sowOverrideCategories.has(sowCat)) {
      const itemIds = QE_SOW_ITEM_IDS[system.id]
      if (itemIds) {
        // System owns a specific slice of the category — always add its portion
        lineCosts.push({ name: system.name, cost: calcSowItemsTotal(home, itemIds), source: 'sow' })
      } else if (!sowCategoryContributed.has(sowCat)) {
        // No item split — first (or only) system for this category gets the full total
        lineCosts.push({ name: system.name, cost: sowCategoryTotals.get(sowCat) ?? 0, source: 'sow' })
        sowCategoryContributed.add(sowCat)
      }
      // else: secondary system sharing a non-split category (e.g. Bathrooms half) — skip to avoid double-count
    } else {
      lineCosts.push({ name: system.name, cost: calcQuickSystemCost(system, home.property), source: 'estimate' })
    }
  }

  // Add finalized SOW categories that have no QE counterpart (e.g. CLEANING, STAGING & MISC)
  const qeMappedCategories = new Set(Object.values(QE_TO_SOW_CATEGORY))
  for (const [cat, total] of sowCategoryTotals.entries()) {
    if (!qeMappedCategories.has(cat) && !sowCategoryContributed.has(cat)) {
      lineCosts.push({ name: cat, cost: total, source: 'sow' })
    }
  }

  const point = lineCosts.reduce((s, l) => s + l.cost, 0)
  const withContingency = point * (1 + home.property.contingency)
  const perSf = home.property.livingArea ? withContingency / home.property.livingArea : 0

  return {
    lineCosts,
    point,
    low: point * 0.9,
    high: point * 1.2,
    withContingency,
    perSf,
    sowOverrideCategories,
  }
}

export interface AllInCostResult {
  costs: DealCosts
  rehab: number
  // Transaction & holding
  buySideClosing: number
  agentCommission: number
  sellSideClosing: number
  holdingCosts: number
  closingTotal: number
  // Financing
  loanAmount: number
  /** True when the requested loan was reduced by the ARV cap */
  loanCappedByArv: boolean
  /** Portion of the loan used for the purchase */
  purchasePortion: number
  /** Portion of the loan financing rehab (draws) */
  rehabFinanced: number
  points: number
  interestCarry: number
  financingTotal: number
  // Capital / returns
  downPayment: number
  /** Out-of-pocket cash to acquire + carry (capital, NOT a profit deduction) */
  cashInvested: number
  /** Cash-on-cash return = trueNet / cashInvested */
  roi: number | null
  /** Annualized cash-on-cash return */
  annualizedRoi: number | null
  // Summary
  rehabPlusCosts: number   // rehab + closingTotal
  allIn: number            // rehabPlusCosts + financingTotal
  trueNet: number | null   // ARV − ask − allIn  (null if ARV or ask missing)
}

/**
 * Full all-in cost + returns model.
 *
 * Loan sizing (hard money / financed deals):
 *   basis = purchase | purchase+rehab | ARV  → × loanAmountPct
 *   then capped at ARV × arvCapPct (the lender's max exposure).
 *
 * Interest carry is interest-only. The purchase portion is assumed drawn at
 * close (full-term interest); the rehab portion funds via draws over the
 * project, approximated as half-term interest.
 *
 * Holding costs are time-based: ARV × holdingAnnualPct × (holdMonths / 12).
 */
export function calcAllInCosts(home: HomeFile): AllInCostResult {
  const c: DealCosts = { ...DEFAULT_DEAL_COSTS, ...home.dealCosts }
  const ask = home.funnel.askingPrice ?? 0
  const arv = home.funnel.arv ?? 0
  const rehab = calcBlendedRehab(home).withContingency
  const months = Math.max(0, c.holdMonths)

  // ── Transaction & holding costs ──
  const buySideClosing  = Math.round(ask * c.buySideClosingPct)
  const agentCommission = Math.round(arv * c.agentCommissionPct)
  const sellSideClosing = Math.round(arv * c.sellSideClosingPct)
  const holdingCosts    = Math.round(arv * c.holdingAnnualPct * (months / 12))
  const closingTotal    = buySideClosing + agentCommission + sellSideClosing + holdingCosts

  // ── Financing ──
  let loanAmount = 0, points = 0, interestCarry = 0, financingTotal = 0
  let loanCappedByArv = false
  let purchasePortion = 0, rehabFinanced = 0
  if (c.loanType !== 'cash') {
    const basisAmount =
      c.loanBasis === 'purchase'       ? ask :
      c.loanBasis === 'purchase-rehab' ? ask + rehab :
      /* arv */                          arv
    const requestedLoan = basisAmount * c.loanAmountPct
    const arvCap = arv > 0 ? arv * c.arvCapPct : Infinity
    loanAmount = Math.round(Math.min(requestedLoan, arvCap))
    loanCappedByArv = arv > 0 && requestedLoan > arvCap

    // Split loan: purchase first, then rehab via draws
    purchasePortion = Math.min(loanAmount, ask)
    rehabFinanced   = Math.min(rehab, Math.max(0, loanAmount - ask))

    points = c.loanType === 'hml' ? Math.round(loanAmount * c.pointsPct) : 0
    // Interest-only: purchase full term, rehab draws ≈ half term
    const purchaseInterest = purchasePortion * c.interestRatePct * (months / 12)
    const rehabInterest    = rehabFinanced   * c.interestRatePct * (months / 12) * 0.5
    interestCarry = Math.round(purchaseInterest + rehabInterest)
    financingTotal = points + interestCarry
  }

  const rehabPlusCosts = Math.round(rehab + closingTotal)
  const allIn = rehabPlusCosts + financingTotal

  const hasArv = arv > 0
  const hasAsk = ask > 0
  const spread = hasArv && hasAsk ? arv - ask : null
  const trueNet = spread !== null && rehab > 0 ? spread - allIn : null

  // ── Capital required (out of pocket) ──
  const downPayment = Math.max(0, ask - loanAmount)
  const rehabOutOfPocket = rehab - rehabFinanced
  const cashInvested = Math.round(
    downPayment + points + buySideClosing + rehabOutOfPocket + holdingCosts,
  )
  const roi = trueNet !== null && cashInvested > 0 ? trueNet / cashInvested : null
  const annualizedRoi = roi !== null && months > 0 ? roi * (12 / months) : null

  return {
    costs: c,
    rehab,
    buySideClosing, agentCommission, sellSideClosing, holdingCosts, closingTotal,
    loanAmount, loanCappedByArv, purchasePortion, rehabFinanced,
    points, interestCarry, financingTotal,
    downPayment, cashInvested, roi, annualizedRoi,
    rehabPlusCosts, allIn, trueNet,
  }
}

export function slugifyAddress(home: HomeFile): string {
  const parts = [home.address, home.city, home.state, home.zip].filter(Boolean)
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
