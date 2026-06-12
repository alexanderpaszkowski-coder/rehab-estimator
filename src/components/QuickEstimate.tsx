import type { Condition, HomeFile, QuickSystem } from '../types'
import { calcQuickEstimate, formatCurrency, getSystemQty } from '../lib/calculations'
import { CopyButton } from './CopyButton'
import { copyQuickEstimate } from '../lib/copyContent'

interface Props {
  home: HomeFile
  onChange: (systems: QuickSystem[]) => void
}

const CONDITIONS: Condition[] = ['None', 'Light', 'Moderate', 'Heavy']

export function QuickEstimate({ home, onChange }: Props) {
  const totals = calcQuickEstimate(home.property, home.quickEstimate)

  const updateSystem = (id: string, patch: Partial<QuickSystem>) => {
    onChange(home.quickEstimate.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Quick Estimate</h1>
            <p>Rate each system during the walkthrough. Five minutes, then go offer.</p>
          </div>
          <CopyButton getText={() => copyQuickEstimate(home)} />
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-tile highlight">
          <div className="label">Point Estimate</div>
          <div className="value">{formatCurrency(totals.point)}</div>
        </div>
        <div className="summary-tile">
          <div className="label">Range (−10% / +20%)</div>
          <div className="value">{formatCurrency(totals.low)} – {formatCurrency(totals.high)}</div>
        </div>
        <div className="summary-tile">
          <div className="label">With Contingency</div>
          <div className="value">{formatCurrency(totals.withContingency)}</div>
        </div>
        <div className="summary-tile">
          <div className="label">$/SF</div>
          <div className="value">{totals.perSf ? `$${totals.perSf.toFixed(0)}` : '—'}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="qe-table">
          <thead>
            <tr>
              <th>System</th>
              <th>Condition</th>
              <th>Qty</th>
              <th>Unit</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {home.quickEstimate.map((system) => {
              const autoQty = getSystemQty(system, home.property)
              const line = totals.lineCosts.find((l) => l.name === system.name)

              return (
                <tr key={system.id}>
                  <td>
                    <div className="system-name">{system.name}</div>
                    {system.description && <div className="system-desc">{system.description}</div>}
                  </td>
                  <td>
                    <div className="condition-pills">
                      {CONDITIONS.map((c) => (
                        <button
                          key={c}
                          className={`condition-pill ${system.condition === c ? `active-${c.toLowerCase()}` : ''}`}
                          onClick={() => updateSystem(system.id, { condition: c })}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={system.qty === '' || system.qty === 0 ? '' : system.qty}
                      placeholder={String(autoQty)}
                      onChange={(e) =>
                        updateSystem(system.id, { qty: e.target.value === '' ? '' : parseFloat(e.target.value) })
                      }
                    />
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{system.unit}</td>
                  <td className="cost">{formatCurrency(line?.cost ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
