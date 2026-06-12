import { useState } from 'react'
import type { HomeFile, SowLine } from '../types'
import { SOW_TEMPLATE } from '../lib/defaults'
import { calcLineEstimate, formatCurrency, num } from '../lib/calculations'
import { CopyButton } from './CopyButton'
import { copyScopeOfWork } from '../lib/copyContent'

interface Props {
  home: HomeFile
  onChange: (sowLines: HomeFile['sowLines']) => void
}

export function ScopeOfWork({ home, onChange }: Props) {
  const [hideZero, setHideZero] = useState(false)
  const [search, setSearch] = useState('')

  const updateLine = (id: string, field: 'qty' | 'bid' | 'actual' | 'notes', value: string) => {
    const current = home.sowLines[id] ?? { qty: '', bid: '', actual: '', notes: '' }
    const parsed = field === 'notes' ? value : value === '' ? '' : parseFloat(value)
    onChange({
      ...home.sowLines,
      [id]: { ...current, [field]: parsed },
    })
  }

  const visibleItems = SOW_TEMPLATE.filter((item) => {
    if (item.type === 'line') {
      const data = home.sowLines[item.id]
      const qty = num(data?.qty)
      if (hideZero && qty <= 0) return false
      if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !(item.spec ?? '').toLowerCase().includes(search.toLowerCase())) {
        return false
      }
    }
    if (item.type === 'category' && hideZero) {
      const catLines = SOW_TEMPLATE.filter((i) => i.type === 'line' && i.category === item.category)
      return catLines.some((l) => num(home.sowLines[(l as SowLine).id]?.qty) > 0)
    }
    return true
  })

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Scope of Work</h1>
            <p>Build line-item scope for contractor bids. Enter qty to include a line — blank or 0 drops it out.</p>
          </div>
          <CopyButton getText={() => copyScopeOfWork(home)} />
        </div>
      </div>

      <div className="sow-filters">
        <input
          type="search"
          placeholder="Search line items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <label>
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Hide zero-qty lines
        </label>
      </div>

      <div className="sow-scroll">
        <div className="sow-header">
          <span>Line Item</span>
          <span>Spec</span>
          <span>Unit</span>
          <span>$/Unit</span>
          <span>Qty</span>
          <span>Estimate</span>
          <span>Bid</span>
          <span>Actual</span>
          <span>Notes</span>
        </div>

        {visibleItems.map((item, idx) => {
          if (item.type === 'category') {
            return <div key={`cat-${idx}`} className="sow-category">{item.name}</div>
          }

          if (item.type === 'subtotal') {
            const catLines = SOW_TEMPLATE.filter((i) => i.type === 'line' && i.category === item.category)
            const est = catLines.reduce((s, l) => {
              const line = l as SowLine
              const d = home.sowLines[line.id]
              return s + calcLineEstimate(line.unitCost, d?.qty ?? '', line.category, home.property)
            }, 0)
            const bid = catLines.reduce((s, l) => s + num(home.sowLines[(l as SowLine).id]?.bid), 0)
            const actual = catLines.reduce((s, l) => s + num(home.sowLines[(l as SowLine).id]?.actual), 0)
            if (hideZero && est === 0 && bid === 0 && actual === 0) return null

            return (
              <div key={`sub-${idx}`} className="sow-line" style={{ background: 'var(--surface-2)', fontWeight: 600 }}>
                <span className="line-name">{item.name}</span>
                <span />
                <span />
                <span />
                <span />
                <span className="mono">{formatCurrency(est)}</span>
                <span className="mono">{formatCurrency(bid)}</span>
                <span className="mono">{formatCurrency(actual)}</span>
                <span />
              </div>
            )
          }

          if (!item.id) return null

          const data = home.sowLines[item.id] ?? { qty: '', bid: '', actual: '', notes: '' }
          const estimate = calcLineEstimate(item.unitCost, data.qty, item.category, home.property)
          const hasQty = num(data.qty) > 0

          return (
            <div key={item.id} className={`sow-line ${hasQty ? 'has-qty' : ''}`}>
              <span className="line-name">{item.name}</span>
              <span className="line-spec">{item.spec}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{item.unit}</span>
              <span className="mono">${item.unitCost}</span>
              <input
                type="number"
                value={data.qty === '' ? '' : data.qty}
                placeholder="0"
                onChange={(e) => updateLine(item.id, 'qty', e.target.value)}
              />
              <span className="mono">{formatCurrency(estimate)}</span>
              <input
                type="number"
                value={data.bid === '' ? '' : data.bid}
                placeholder="—"
                onChange={(e) => updateLine(item.id, 'bid', e.target.value)}
              />
              <input
                type="number"
                value={data.actual === '' ? '' : data.actual}
                placeholder="—"
                onChange={(e) => updateLine(item.id, 'actual', e.target.value)}
              />
              <input
                type="text"
                value={data.notes}
                placeholder="Walkthrough notes"
                onChange={(e) => updateLine(item.id, 'notes', e.target.value)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
