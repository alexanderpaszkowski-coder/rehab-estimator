import type { HomeFile } from '../types'
import { SOW_TEMPLATE } from '../lib/defaults'
import { calcSowTotals, formatCurrency } from '../lib/calculations'
import { CopyButton } from './CopyButton'
import { copySummary } from '../lib/copyContent'

interface Props {
  home: HomeFile
}

export function Summary({ home }: Props) {
  const s = calcSowTotals(home, SOW_TEMPLATE)

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Budget Summary</h1>
            <p>Estimate vs bids vs actuals — cross-checked against your quick estimate.</p>
          </div>
          <CopyButton getText={() => copySummary(home)} />
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-tile highlight">
          <div className="label">Total Rehab Budget</div>
          <div className="value">{formatCurrency(s.total)}</div>
        </div>
        <div className="summary-tile">
          <div className="label">Hard Costs</div>
          <div className="value">{formatCurrency(s.hardSubtotal)}</div>
        </div>
        <div className="summary-tile">
          <div className="label">Contingency</div>
          <div className="value">{formatCurrency(s.contingency)}</div>
        </div>
        <div className="summary-tile">
          <div className="label">$/SF</div>
          <div className="value">{s.perSf ? `$${s.perSf.toFixed(0)}` : '—'}</div>
        </div>
      </div>

      <div className="card">
        <h2>By Trade Category</h2>
        <table className="summary-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Estimate</th>
              <th>Bid</th>
              <th>Actual</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {s.categories
              .filter((c) => c.estimate > 0 || c.bid > 0 || c.actual > 0)
              .map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td className="mono">{formatCurrency(c.estimate)}</td>
                  <td className="mono">{formatCurrency(c.bid)}</td>
                  <td className="mono">{formatCurrency(c.actual)}</td>
                  <td className="mono" style={{ color: c.variance > 0 ? 'var(--danger)' : c.variance < 0 ? 'var(--success)' : undefined }}>
                    {formatCurrency(c.variance)}
                  </td>
                </tr>
              ))}
            <tr className="total-row">
              <td>Hard Costs Subtotal</td>
              <td className="mono">{formatCurrency(s.hardSubtotal)}</td>
              <td className="mono">{formatCurrency(s.bidTotal)}</td>
              <td className="mono">{formatCurrency(s.actualTotal)}</td>
              <td className="mono">{formatCurrency(s.actualTotal - s.hardSubtotal)}</td>
            </tr>
            <tr className="total-row">
              <td>Contingency</td>
              <td className="mono">{formatCurrency(s.contingency)}</td>
              <td />
              <td />
              <td />
            </tr>
            <tr className="total-row">
              <td>Total Rehab Budget</td>
              <td className="mono">{formatCurrency(s.total)}</td>
              <td />
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Cross-Checks</h2>
        <table className="summary-table">
          <tbody>
            <tr>
              <td>Quick Estimate (with contingency)</td>
              <td className="mono">{formatCurrency(s.quickWithContingency)}</td>
            </tr>
            <tr>
              <td>Detailed vs Quick — gap</td>
              <td className="mono">{formatCurrency(s.quickGap)}</td>
            </tr>
            <tr>
              <td>Gap flag (&gt;20% apart)</td>
              <td>
                <span className={`flag-badge ${s.quickGapFlag ? 'warning' : 'ok'}`}>
                  {s.quickGapFlag ? '⚠ Re-walk the property' : '✓ Within range'}
                </span>
              </td>
            </tr>
            <tr>
              <td>Detailed $/SF</td>
              <td className="mono">{s.perSf ? `$${s.perSf.toFixed(0)}` : '—'}</td>
            </tr>
            <tr>
              <td>Benchmark band</td>
              <td>{s.benchmark}</td>
            </tr>
            <tr>
              <td>Bid vs Estimate gap</td>
              <td className="mono">{formatCurrency(s.bidTotal - s.hardSubtotal)}</td>
            </tr>
            <tr>
              <td>Actual vs Estimate gap</td>
              <td className="mono">{formatCurrency(s.actualTotal - s.hardSubtotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
