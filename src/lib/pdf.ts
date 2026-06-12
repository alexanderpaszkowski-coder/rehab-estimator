import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { HomeFile } from '../types'
import { SOW_TEMPLATE } from './defaults'
import { calcLineEstimate, calcQuickEstimate, calcSowTotals, formatCurrency, getSystemQty, num, slugifyAddress } from './calculations'
import { getSourceLabel, getStageMeta } from './funnel'

export function exportHomePdf(home: HomeFile) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const margin = 40
  let y = margin

  const fullAddress = [home.address, home.city, home.state, home.zip].filter(Boolean).join(', ')
  const quick = calcQuickEstimate(home.property, home.quickEstimate)
  const summary = calcSowTotals(home, SOW_TEMPLATE)

  const addHeader = (title: string) => {
    if (y > 700) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(28, 25, 23)
    doc.text(title, margin, y)
    y += 18
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120, 113, 108)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(194, 65, 12)
  doc.text('Rehab Scope of Work', margin, y)
  y += 22

  doc.setFontSize(12)
  doc.setTextColor(28, 25, 23)
  doc.text(fullAddress, margin, y)
  y += 16

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 113, 108)
  doc.text(
    `Source: ${getSourceLabel(home)}  ·  Stage: ${getStageMeta(home.stage).label}  ·  Generated ${new Date().toLocaleDateString()}`,
    margin,
    y,
  )
  y += 24

  addHeader('Property Overview')
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fontStyle: 'bold', fillColor: [244, 242, 238] },
    head: [['Field', 'Value']],
    body: [
      ['Living area', home.property.livingArea ? `${home.property.livingArea.toLocaleString()} SF` : '—'],
      ['Bed / Bath', `${home.property.bedrooms} bed · ${home.property.fullBaths} full · ${home.property.halfBaths} half`],
      ['Finish grade', home.property.finishGrade],
      ['Contingency', `${(home.property.contingency * 100).toFixed(0)}%`],
      ['Available for sale', home.funnel.availableForSale ?? '—'],
      ['Asking price', home.funnel.askingPrice ? formatCurrency(home.funnel.askingPrice) : '—'],
      ['ARV', home.funnel.arv ? formatCurrency(home.funnel.arv) : '—'],
    ],
  })
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20

  addHeader('Quick Estimate')
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [255, 247, 237], textColor: [28, 25, 23] },
    head: [['System', 'Condition', 'Qty', 'Cost']],
    body: home.quickEstimate
      .filter((s) => s.condition !== 'None')
      .map((s) => [
        s.name,
        s.condition,
        String(getSystemQty(s, home.property)),
        formatCurrency(quick.lineCosts.find((l) => l.name === s.name)?.cost ?? 0),
      ]),
    foot: [[
      'Totals',
      '',
      '',
      `${formatCurrency(quick.point)} (+ contingency ${formatCurrency(quick.withContingency)})`,
    ]],
    footStyles: { fontStyle: 'bold', fillColor: [244, 242, 238] },
  })
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20

  addHeader('Budget Summary')
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [244, 242, 238] },
    head: [['Category', 'Estimate', 'Bid', 'Actual']],
    body: summary.categories
      .filter((c) => c.estimate > 0 || c.bid > 0 || c.actual > 0)
      .map((c) => [c.category, formatCurrency(c.estimate), formatCurrency(c.bid), formatCurrency(c.actual)]),
    foot: [[
      'Total',
      formatCurrency(summary.total),
      formatCurrency(summary.bidTotal),
      formatCurrency(summary.actualTotal),
    ]],
    footStyles: { fontStyle: 'bold' },
  })
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20

  const sowLines = SOW_TEMPLATE.filter((item) => {
    if (item.type !== 'line' || !item.id) return false
    return num(home.sowLines[item.id]?.qty) > 0
  }) as Array<Extract<typeof SOW_TEMPLATE[number], { type: 'line' }>>

  if (sowLines.length > 0) {
    doc.addPage()
    y = margin
    addHeader('Scope of Work — Active Line Items')
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [244, 242, 238] },
      head: [['Item', 'Unit', 'Qty', 'Est', 'Bid', 'Actual']],
      body: sowLines.map((item) => {
        const data = home.sowLines[item.id!]
        const est = calcLineEstimate(item.unitCost, data?.qty ?? '', item.category, home.property)
        return [
          item.name,
          item.unit,
          String(num(data?.qty)),
          formatCurrency(est),
          data?.bid ? formatCurrency(num(data.bid)) : '—',
          data?.actual ? formatCurrency(num(data.actual)) : '—',
        ]
      }),
    })
  }

  const slug = slugifyAddress(home) || 'rehab-report'
  doc.save(`${slug}.pdf`)
}
