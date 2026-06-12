import type { FunnelScreen, FunnelStage, HomeFile, PropertySource, ReviewStatus } from '../types'
import { FUNNEL_STAGES, PROPERTY_SOURCES } from '../lib/funnel'
import { CopyButton } from './CopyButton'
import { copyLeadScreen } from '../lib/copyContent'

const REVIEW_STATUS_OPTIONS: { id: ReviewStatus; label: string; activeClass: string }[] = [
  { id: 'pending', label: 'Pending', activeClass: 'active-moderate' },
  { id: 'reviewed', label: 'Reviewed', activeClass: 'active-none' },
  { id: 'approved', label: 'Approved', activeClass: 'active-light' },
  { id: 'passed', label: 'Passed', activeClass: 'active-heavy' },
]

interface Props {
  home: HomeFile
  onChange: (patch: Partial<HomeFile>) => void
}

export function FunnelDetails({ home, onChange }: Props) {
  const updateFunnel = (patch: Partial<FunnelScreen>) => {
    onChange({ funnel: { ...home.funnel, ...patch } })
  }

  const hasSubmission = home.submittedBy === 'partner' && (home.funnel.quickNotes || (home.links ?? []).length > 0)

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Lead & Funnel</h1>
            <p>Source, screening answers, and pipeline stage for this property.</p>
          </div>
          <CopyButton getText={() => copyLeadScreen(home)} />
        </div>
      </div>

      {home.submittedBy === 'partner' && (
        <div className="card submission-card-review">
          <h2>Partner Submission</h2>
          {(home.links ?? []).length > 0 && (
            <div style={{ marginBottom: hasSubmission ? 14 : 0 }}>
              <h3>Links</h3>
              <ul className="link-list link-list-review">
                {(home.links ?? []).map((url, i) => (
                  <li key={i}>
                    <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {home.funnel.quickNotes && (
            <div>
              <h3>Partner Notes</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6 }}>{home.funnel.quickNotes}</p>
            </div>
          )}
          {!hasSubmission && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No notes or links were included with this submission.</p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Review Decision</h2>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 500, marginBottom: 8 }}>Status</label>
          <div className="condition-pills">
            {REVIEW_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`condition-pill ${home.reviewStatus === opt.id ? opt.activeClass : ''}`}
                onClick={() => onChange({ reviewStatus: opt.id })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Reviewer Notes</label>
          <textarea
            rows={3}
            value={home.reviewNotes}
            onChange={(e) => onChange({ reviewNotes: e.target.value })}
            placeholder="Add notes about your decision — visible to your partner"
          />
        </div>
      </div>

      <div className="card">
        <h2>Source & Stage</h2>
        <div className="field-grid">
          <div className="field">
            <label>Source</label>
            <select value={home.source} onChange={(e) => onChange({ source: e.target.value as PropertySource })}>
              {PROPERTY_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {home.source === 'other' && (
            <div className="field">
              <label>Custom label</label>
              <input value={home.sourceCustom} onChange={(e) => onChange({ sourceCustom: e.target.value })} />
            </div>
          )}
          <div className="field">
            <label>Pipeline stage</label>
            <select value={home.stage} onChange={(e) => onChange({ stage: e.target.value as FunnelStage })}>
              {FUNNEL_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Screening Questions</h2>
        <div className="screen-grid">
          <ScreenTri label="Available for sale?" value={home.funnel.availableForSale} onChange={(v) => updateFunnel({ availableForSale: v })} />
          <ScreenTri label="Title clear?" value={home.funnel.titleClear} onChange={(v) => updateFunnel({ titleClear: v })} />
          <ScreenTri label="Seller motivated?" value={home.funnel.sellerMotivated} onChange={(v) => updateFunnel({ sellerMotivated: v })} />
          <div className="screen-item">
            <label>Rehab level</label>
            <div className="condition-pills">
              {(['Light', 'Moderate', 'Heavy'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`condition-pill ${home.funnel.rehabLevel === o ? `active-${o === 'Light' ? 'light' : o === 'Moderate' ? 'moderate' : 'heavy'}` : ''}`}
                  onClick={() => updateFunnel({ rehabLevel: home.funnel.rehabLevel === o ? null : o })}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div className="screen-item">
            <label>In target area?</label>
            <div className="condition-pills">
              {(['yes', 'maybe', 'no'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`condition-pill ${home.funnel.inTargetArea === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'moderate'}` : ''}`}
                  onClick={() => updateFunnel({ inTargetArea: home.funnel.inTargetArea === o ? null : o })}
                >
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="screen-item">
            <label>Occupancy</label>
            <div className="condition-pills">
              {(['vacant', 'occupied', 'unknown'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`condition-pill ${home.funnel.occupancy === o ? 'active-light' : ''}`}
                  onClick={() => updateFunnel({ occupancy: home.funnel.occupancy === o ? null : o })}
                >
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Asking price</label>
            <input type="number" value={home.funnel.askingPrice ?? ''} onChange={(e) => updateFunnel({ askingPrice: e.target.value ? parseFloat(e.target.value) : null })} />
          </div>
          <div className="field">
            <label>ARV</label>
            <input type="number" value={home.funnel.arv ?? ''} onChange={(e) => updateFunnel({ arv: e.target.value ? parseFloat(e.target.value) : null })} />
          </div>
          <div className="field">
            <label>Max offer</label>
            <input type="number" value={home.funnel.maxOffer ?? ''} onChange={(e) => updateFunnel({ maxOffer: e.target.value ? parseFloat(e.target.value) : null })} />
          </div>
          <div className="field">
            <label>Year built</label>
            <input type="number" value={home.funnel.yearBuilt ?? ''} onChange={(e) => updateFunnel({ yearBuilt: e.target.value ? parseInt(e.target.value) : null })} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Quick notes</label>
            <textarea rows={3} value={home.funnel.quickNotes} onChange={(e) => updateFunnel({ quickNotes: e.target.value })} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ScreenTri({
  label,
  value,
  onChange,
}: {
  label: string
  value: 'yes' | 'no' | 'unknown' | null
  onChange: (v: 'yes' | 'no' | 'unknown' | null) => void
}) {
  return (
    <div className="screen-item">
      <label>{label}</label>
      <div className="condition-pills">
        {(['yes', 'no', 'unknown'] as const).map((o) => (
          <button
            key={o}
            type="button"
            className={`condition-pill ${value === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'none'}` : ''}`}
            onClick={() => onChange(value === o ? null : o)}
          >
            {o.charAt(0).toUpperCase() + o.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}
