import type { HomeFile } from '../types'
import { SOW_TEMPLATE } from './defaults'
import { calcQuickEstimate, calcSowTotals, formatCurrency, getSystemQty, num } from './calculations'
import { getSourceLabel, getStageMeta } from './funnel'

function header(home: HomeFile): string {
  const addr = [home.address, home.city, home.state, home.zip].filter(Boolean).join(', ')
  return `Property: ${addr}\nGenerated: ${new Date().toLocaleString()}\n`
}

function tri(v: string | null | undefined): string {
  if (!v || v === 'unknown') return 'Unknown'
  return v.charAt(0).toUpperCase() + v.slice(1)
}

export function copyLeadScreen(home: HomeFile): string {
  const f = home.funnel
  const stage = getStageMeta(home.stage)
  const lines: string[] = [
    header(home),
    '=== LEAD & SCREEN ===',
    `Source: ${getSourceLabel(home)}`,
    `Stage: ${stage?.label ?? home.stage}`,
    `Review status: ${home.reviewStatus}`,
    '',
    '-- Screening --',
    `Available for sale: ${tri(f.availableForSale)}`,
    `In target area:     ${tri(f.inTargetArea)}`,
    `Title clear:        ${tri(f.titleClear)}`,
    `Seller motivated:   ${tri(f.sellerMotivated)}`,
    `Rehab level:        ${f.rehabLevel ?? 'Not set'}`,
    `Occupancy:          ${tri(f.occupancy)}`,
    '',
    '-- Financials --',
    `Asking price: ${f.askingPrice ? formatCurrency(f.askingPrice) : '—'}`,
    `ARV:          ${f.arv ? formatCurrency(f.arv) : '—'}`,
    `Max offer:    ${f.maxOffer ? formatCurrency(f.maxOffer) : '—'}`,
    `Year built:   ${f.yearBuilt ?? '—'}`,
  ]
  if (f.quickNotes) lines.push('', `Notes: ${f.quickNotes}`)
  if (home.links?.length) {
    lines.push('', '-- Links --')
    home.links.forEach((l) => lines.push(l))
  }
  if (home.reviewNotes) lines.push('', `Reviewer notes: ${home.reviewNotes}`)
  return lines.join('\n')
}

export function copyPropertyInputs(home: HomeFile): string {
  const p = home.property
  const lines: string[] = [
    header(home),
    '=== PROPERTY INPUTS ===',
    '',
    '-- Measurements --',
    `Above-grade living area:  ${p.livingArea || '—'} SF`,
    `Finished basement area:   ${p.basementArea || '—'} SF`,
    `Roof area:                ${p.roofArea || '—'} SQ`,
    `Siding / exterior walls:  ${p.sidingArea || '—'} SF`,
    `Ceiling height:           ${p.ceilingHeight || '—'} FT`,
    '',
    '-- Counts --',
    `Windows:        ${p.windows || '—'}`,
    `Exterior doors: ${p.exteriorDoors || '—'}`,
    `Interior doors: ${p.interiorDoors || '—'}`,
    `Full baths:     ${p.fullBaths || '—'}`,
    `Half baths:     ${p.halfBaths || '—'}`,
    `Bedrooms:       ${p.bedrooms || '—'}`,
    '',
    '-- Kitchen --',
    `Base cabinets:  ${p.baseCabinets ?? 'auto'} LF`,
    `Wall cabinets:  ${p.wallCabinets ?? 'auto'} LF`,
    `Countertops:    ${p.countertops ?? 'auto'} LF`,
    '',
    '-- Project Settings --',
    `Finish grade:       ${p.finishGrade}`,
    `Contingency:        ${(p.contingency * 100).toFixed(0)}%`,
    `Labor market adj:   ${p.marketAdj}×`,
  ]
  return lines.join('\n')
}

export function copyQuickEstimate(home: HomeFile): string {
  const totals = calcQuickEstimate(home.property, home.quickEstimate)
  const lines: string[] = [
    header(home),
    '=== QUICK ESTIMATE ===',
    '',
    `Point estimate:   ${formatCurrency(totals.point)}`,
    `Range:            ${formatCurrency(totals.low)} – ${formatCurrency(totals.high)}`,
    `With contingency: ${formatCurrency(totals.withContingency)}`,
    `Per SF:           ${totals.perSf ? `$${totals.perSf.toFixed(0)}` : '—'}`,
    '',
    '-- By System --',
  ]
  for (const s of home.quickEstimate) {
    if (s.condition === 'None') continue
    const qty = getSystemQty(s, home.property)
    const line = totals.lineCosts.find((l) => l.name === s.name)
    const cost = line ? formatCurrency(line.cost) : '—'
    lines.push(`${s.name.padEnd(30)} ${s.condition.padEnd(10)} qty:${String(qty).padStart(5)}  ${cost}`)
  }
  return lines.join('\n')
}

export function copyScopeOfWork(home: HomeFile): string {
  const totals = calcSowTotals(home, SOW_TEMPLATE)
  const lines: string[] = [
    header(home),
    '=== SCOPE OF WORK ===',
    '',
    `Total budget: ${formatCurrency(totals.total)}`,
    `Hard costs:   ${formatCurrency(totals.hardSubtotal)}`,
    `Contingency:  ${formatCurrency(totals.contingency)}`,
    '',
    '-- Active Line Items --',
  ]
  for (const item of SOW_TEMPLATE) {
    if (item.type !== 'line') continue
    const saved = home.sowLines[item.id]
    if (!saved) continue
    const qty = num(saved.qty)
    const bid = num(saved.bid)
    const actual = num(saved.actual)
    if (qty === 0 && bid === 0 && actual === 0) continue
    const name = `${item.category ? item.category + ' — ' : ''}${item.name}`
    lines.push(
      `${name.substring(0, 40).padEnd(42)} qty:${String(qty).padStart(5)} ${item.unit.padEnd(5)}  bid:${formatCurrency(bid).padStart(10)}  actual:${formatCurrency(actual).padStart(10)}`
    )
    if (saved.notes) lines.push(`  → ${saved.notes}`)
  }
  if (totals.categories.some((c) => c.bid > 0)) {
    lines.push('', '-- Category Totals --')
    for (const c of totals.categories.filter((x) => x.bid > 0)) {
      lines.push(`${c.category.padEnd(30)} bid: ${formatCurrency(c.bid).padStart(10)}  actual: ${formatCurrency(c.actual).padStart(10)}`)
    }
  }
  return lines.join('\n')
}

export function copySummary(home: HomeFile): string {
  const s = calcSowTotals(home, SOW_TEMPLATE)
  const qTotals = calcQuickEstimate(home.property, home.quickEstimate)
  const lines: string[] = [
    header(home),
    '=== BUDGET SUMMARY ===',
    '',
    `Total rehab budget:  ${formatCurrency(s.total)}`,
    `Hard costs:          ${formatCurrency(s.hardSubtotal)}`,
    `Contingency:         ${formatCurrency(s.contingency)}`,
    `$/SF:                ${s.perSf ? `$${s.perSf.toFixed(0)}` : '—'}`,
    '',
    `Quick estimate total: ${formatCurrency(qTotals.withContingency)}`,
    `Variance vs SOW:      ${formatCurrency(s.total - qTotals.withContingency)}`,
    '',
    '-- By Trade Category --',
  ]
  for (const c of s.categories.filter((x) => x.estimate > 0 || x.bid > 0)) {
    const variance = c.bid - c.estimate
    const flag = variance > c.estimate * 0.15 ? ' ⚠' : ''
    lines.push(
      `${c.category.padEnd(30)}  est: ${formatCurrency(c.estimate).padStart(10)}  bid: ${formatCurrency(c.bid).padStart(10)}  actual: ${formatCurrency(c.actual).padStart(10)}${flag}`
    )
  }
  return lines.join('\n')
}
