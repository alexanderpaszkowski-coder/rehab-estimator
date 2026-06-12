import { FINISH_CATEGORIES, FINISH_FACTORS } from './defaults'
import type {
  CategorySummary,
  Condition,
  HomeFile,
  PropertyInputs,
  QuickSystem,
  SowItem,
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

export function slugifyAddress(home: HomeFile): string {
  const parts = [home.address, home.city, home.state, home.zip].filter(Boolean)
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
