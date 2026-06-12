import { useEffect, useMemo, useRef, useState } from 'react'
import type { FunnelStage, HomeFile, IntakeData, PropertySource } from '../types'
import { formatCurrency, calcQuickEstimate } from '../lib/calculations'
import { FUNNEL_STAGES, getSourceLabel, getStageMeta, passesQuickScreen, screenScore } from '../lib/funnel'
import { PropertyIntake } from './PropertyIntake'

interface Props {
  homes: HomeFile[]
  onSelect: (home: HomeFile) => void
  onCreate: (data: IntakeData) => void
  onStageChange: (id: string, stage: FunnelStage) => void
  onDelete: (id: string) => void
  autoOpenIntake?: boolean
}

const REHAB_COLORS: Record<string, string> = {
  Light: 'var(--success)',
  Moderate: 'var(--warning)',
  Heavy: 'var(--danger)',
}
const REHAB_BG: Record<string, string> = {
  Light: 'var(--success-soft)',
  Moderate: 'var(--warning-soft)',
  Heavy: '#fef2f2',
}

const REVIEW_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'New', color: '#b45309', bg: '#fffbeb' },
  reviewed: { label: 'Reviewed', color: '#1d4ed8', bg: '#eff6ff' },
  approved: { label: 'Approved', color: 'var(--success)', bg: 'var(--success-soft)' },
  passed: { label: 'Passed', color: '#6b7280', bg: '#f9fafb' },
}

// ── Source logo ─────────────────────────────────────────────────────────────

const SOURCE_DOMAIN: Partial<Record<PropertySource, string>> = {
  'auction.com': 'auction.com',
  'mls': 'mls.com',
}

function SourceLogo({ source, customLabel }: { source: PropertySource; customLabel?: string }) {
  const domain = SOURCE_DOMAIN[source]
  const label = customLabel || source
  if (domain) {
    return (
      <img
        className="source-logo"
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt={label}
        title={label}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  // Fallback: styled text pill
  return <span className="source-logo-text" title={label}>{label}</span>
}

// ── Stage picker popover ─────────────────────────────────────────────────────

function StagePicker({ stage, onChange }: { stage: FunnelStage; onChange: (s: FunnelStage) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const meta = getStageMeta(stage)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="stage-picker" ref={ref}>
      <button
        type="button"
        className="stage-picker-btn"
        style={{ '--stage-color': meta.color } as React.CSSProperties}
        onClick={() => setOpen((o) => !o)}
        title="Change stage"
      >
        <span className="stage-picker-dot" />
        <span>{meta.label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5 }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="stage-picker-menu">
          {FUNNEL_STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`stage-picker-option ${s.id === stage ? 'active' : ''}`}
              onClick={() => { onChange(s.id); setOpen(false) }}
            >
              <span className="stage-picker-dot" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Property Summary Modal ───────────────────────────────────────────────────

function PropertySummaryModal({
  home,
  onEdit,
  onClose,
}: {
  home: HomeFile
  onEdit: () => void
  onClose: () => void
}) {
  const isAuction = home.source === 'auction.com'
  const { arv, askingPrice, occupancy, rehabLevel, inTargetArea, auctionType, quickNotes } = home.funnel
  const spread = arv && askingPrice ? arv - askingPrice : null
  const stageMeta = getStageMeta(home.stage)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="summary-modal" onClick={(e) => e.stopPropagation()}>

        {/* Photo */}
        {home.photoUrl && (
          <div className="summary-photo">
            <img src={home.photoUrl} alt={home.address} />
          </div>
        )}

        {/* Header */}
        <div className="summary-header">
          <div className="summary-badges">
            <SourceLogo source={home.source} customLabel={home.source === 'other' ? home.sourceCustom : undefined} />
            <span className="source-badge">{getSourceLabel(home)}</span>
            {auctionType && (
              <span className="lead-badge" style={{ background: '#f0f9ff', color: '#0369a1' }}>
                {auctionType === 'bank-owned' ? 'Bank Owned' : 'Auction'}
              </span>
            )}
            <span
              className="summary-stage-pill"
              style={{ background: stageMeta.color + '18', color: stageMeta.color, borderColor: stageMeta.color + '40' }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: stageMeta.color, display: 'inline-block', marginRight: 5 }} />
              {stageMeta.label}
            </span>
          </div>
          <h2 className="summary-address">{home.address}</h2>
          <p className="summary-city">{[home.city, home.state].filter(Boolean).join(', ')}</p>
        </div>

        {/* Financials */}
        {(arv || askingPrice) && (
          <div className="summary-financials">
            {arv && (
              <div className="summary-fin-item">
                <span className="summary-fin-label">{isAuction ? 'Est. Value' : 'ARV'}</span>
                <span className="summary-fin-value">{formatCurrency(arv)}</span>
              </div>
            )}
            {askingPrice && (
              <div className="summary-fin-item">
                <span className="summary-fin-label">{isAuction ? 'Starting Bid' : 'Asking'}</span>
                <span className="summary-fin-value">{formatCurrency(askingPrice)}</span>
              </div>
            )}
            {spread !== null && (
              <div className="summary-fin-item">
                <span className="summary-fin-label">Spread</span>
                <span
                  className="summary-fin-value"
                  style={{ color: spread > 100_000 ? 'var(--success)' : spread > 50_000 ? 'var(--warning)' : 'var(--danger)' }}
                >
                  {formatCurrency(spread)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Screening chips */}
        <div className="summary-chips">
          {occupancy === 'vacant'   && <span className="screen-chip green">Vacant</span>}
          {occupancy === 'occupied' && <span className="screen-chip red">Occupied</span>}
          {inTargetArea === 'yes'   && <span className="screen-chip green">In Area</span>}
          {inTargetArea === 'maybe' && <span className="screen-chip yellow">Maybe Area</span>}
          {inTargetArea === 'no'    && <span className="screen-chip red">Out of Area</span>}
          {rehabLevel && (
            <span className="screen-chip" style={{
              background: REHAB_BG[rehabLevel],
              color: REHAB_COLORS[rehabLevel],
            }}>
              {rehabLevel} Rehab
            </span>
          )}
          {home.funnel.titleClear === 'yes'       && <span className="screen-chip green">Title Clear</span>}
          {home.funnel.yearBuilt                  && <span className="screen-chip grey">Built {home.funnel.yearBuilt}</span>}
        </div>

        {/* Notes */}
        {quickNotes && (
          <p className="summary-notes">{quickNotes}</p>
        )}

        {/* Actions */}
        <div className="summary-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={onEdit}>Edit Property →</button>
        </div>
      </div>
    </div>
  )
}

// ── Main board ──────────────────────────────────────────────────────────────

export function FunnelBoard({ homes, onSelect, onCreate, onStageChange, onDelete, autoOpenIntake }: Props) {
  const [showIntake, setShowIntake] = useState(() => autoOpenIntake ?? false)
  const [search, setSearch] = useState('')
  const [selectedStage, setSelectedStage] = useState<FunnelStage | null>(null)
  const [summaryHome, setSummaryHome] = useState<HomeFile | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return homes
    const q = search.toLowerCase()
    return homes.filter((h) =>
      [h.address, h.city, h.state, getSourceLabel(h)].join(' ').toLowerCase().includes(q)
    )
  }, [homes, search])

  const leads = useMemo(() => filtered.filter((h) => h.stage === 'lead'), [filtered])

  const byStage = useMemo(() => {
    const map = new Map<FunnelStage, HomeFile[]>()
    for (const s of FUNNEL_STAGES) map.set(s.id, [])
    for (const h of filtered) {
      const list = map.get(h.stage) ?? []
      list.push(h)
      map.set(h.stage, list)
    }
    return map
  }, [filtered])

  const pipelineStages = FUNNEL_STAGES.filter((s) => s.id !== 'lead')
  const pendingCount = homes.filter((h) => h.reviewStatus === 'pending').length

  // Stage detail drill-down
  if (selectedStage) {
    const stageMeta = getStageMeta(selectedStage)
    const stageHomes = byStage.get(selectedStage) ?? []
    return (
      <StageDetail
        stageMeta={stageMeta!}
        homes={stageHomes}
        onBack={() => setSelectedStage(null)}
        onSelect={onSelect}
        onStageChange={onStageChange}
        onDelete={onDelete}
      />
    )
  }

  return (
    <div className="funnel-dashboard">

      {/* ── Summary modal ── */}
      {summaryHome && (
        <PropertySummaryModal
          home={summaryHome}
          onEdit={() => { setSummaryHome(null); onSelect(summaryHome) }}
          onClose={() => setSummaryHome(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="funnel-page-header">
        <div>
          <h1>Property Funnel</h1>
          <p>
            {homes.length} {homes.length === 1 ? 'property' : 'properties'}
            {pendingCount > 0 && <span className="needs-review-tag">{pendingCount} need review</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="search"
            className="funnel-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => setShowIntake(true)}>+ Add Property</button>
        </div>
      </div>

      {/* ── Pipeline section (top third) ── */}
      <section className="pipeline-section">
        <div className="leads-section-header">
          <h2>Pipeline</h2>
          <p>Click a stage to see all properties in it</p>
        </div>
        <div className="pipeline-grid">
          {pipelineStages.map((stage) => {
            const count = byStage.get(stage.id)?.length ?? 0
            return (
              <button
                key={stage.id}
                className="pipeline-card"
                onClick={() => setSelectedStage(stage.id)}
                style={{ '--stage-color': stage.color } as React.CSSProperties}
              >
                <div className="pipeline-count">{count}</div>
                <div className="pipeline-label">{stage.label}</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Leads section (bottom two-thirds) ── */}
      <section className="leads-section">
        <div className="leads-section-header">
          <h2>Leads <span className="section-count">{leads.length}</span></h2>
          <p>New properties awaiting your review</p>
        </div>

        {leads.length === 0 ? (
          <div className="empty-state card" style={{ padding: '40px 24px' }}>
            <h3>No leads yet</h3>
            <p>Add a property to get started — it will appear here as a lead.</p>
          </div>
        ) : (
          <div className="leads-grid">
            {leads.map((home) => (
              <LeadCard
                key={home.id}
                home={home}
                onSummary={() => setSummaryHome(home)}
                onStageChange={(s) => onStageChange(home.id, s)}
                onDelete={() => { if (confirm(`Delete ${home.address}?`)) onDelete(home.id) }}
              />
            ))}
          </div>
        )}
      </section>

      {showIntake && (
        <PropertyIntake
          onCancel={() => setShowIntake(false)}
          onSubmit={(data) => { onCreate(data); setShowIntake(false) }}
        />
      )}
    </div>
  )
}

// ── Lead card (large) ───────────────────────────────────────────────────────

function LeadCard({ home, onSummary, onStageChange, onDelete }: {
  home: HomeFile
  onSummary: () => void
  onStageChange: (s: FunnelStage) => void
  onDelete: () => void
}) {
  const [flipping, setFlipping] = useState(false)
  const quick = calcQuickEstimate(home.property, home.quickEstimate)
  const passes = passesQuickScreen(home.funnel)
  const score = screenScore(home.funnel)
  const hasScore = score > 0 || home.funnel.availableForSale !== null
  const reviewMeta = REVIEW_META[home.reviewStatus] ?? REVIEW_META.pending

  const handleCardClick = () => {
    if (flipping) return
    setFlipping(true)
    setTimeout(() => {
      setFlipping(false)
      onSummary()
    }, 320)
  }

  return (
    <div
      className={`lead-card ${flipping ? 'lead-card-flipping' : ''}`}
      onClick={handleCardClick}
      style={{ cursor: 'pointer' }}
    >
      {/* property photo */}
      {home.photoUrl && (
        <div className="lead-card-photo">
          <img src={home.photoUrl} alt={home.address} loading="lazy" />
        </div>
      )}

      <div className="lead-card-inner">
        {/* badges row */}
        <div className="lead-card-badges">
          <span className="source-badge">{getSourceLabel(home)}</span>
          {home.funnel.rehabLevel && (
            <span className="lead-badge" style={{ background: REHAB_BG[home.funnel.rehabLevel], color: REHAB_COLORS[home.funnel.rehabLevel] }}>
              {home.funnel.rehabLevel} rehab
            </span>
          )}
          <span className="lead-badge" style={{ background: reviewMeta.bg, color: reviewMeta.color, marginLeft: 'auto' }}>
            {reviewMeta.label}
          </span>
        </div>

        {/* address */}
        <div className="lead-card-address">
          <h3>{home.address}</h3>
          <p>{[home.city, home.state].filter(Boolean).join(', ') || <em>No location</em>}</p>
        </div>

        {/* financials */}
        {(home.funnel.arv || home.funnel.askingPrice) && (
          <div className="lead-card-financials">
            {home.funnel.arv && (
              <div className="lead-fin-item">
                <span className="lead-fin-label">ARV</span>
                <span className="lead-fin-value">{formatCurrency(home.funnel.arv)}</span>
              </div>
            )}
            {home.funnel.askingPrice && (
              <div className="lead-fin-item">
                <span className="lead-fin-label">Asking</span>
                <span className="lead-fin-value">{formatCurrency(home.funnel.askingPrice)}</span>
              </div>
            )}
            {quick.withContingency > 0 && (
              <div className="lead-fin-item">
                <span className="lead-fin-label">Est. rehab</span>
                <span className="lead-fin-value">{formatCurrency(quick.withContingency)}</span>
              </div>
            )}
          </div>
        )}

        {/* screening chips */}
        {hasScore && (
          <div className="lead-card-screen">
            {home.funnel.inTargetArea === 'yes' && <span className="screen-chip green">In area</span>}
            {home.funnel.inTargetArea === 'maybe' && <span className="screen-chip yellow">Maybe area</span>}
            {home.funnel.inTargetArea === 'no' && <span className="screen-chip red">Out of area</span>}
            {home.funnel.availableForSale === 'yes' && <span className="screen-chip green">For sale</span>}
            {home.funnel.availableForSale === 'no' && <span className="screen-chip red">Not for sale</span>}
            {home.funnel.titleClear === 'yes' && <span className="screen-chip green">Title clear</span>}
            {home.funnel.sellerMotivated === 'yes' && <span className="screen-chip green">Motivated seller</span>}
            {home.funnel.occupancy === 'vacant' && <span className="screen-chip green">Vacant</span>}
            {home.funnel.occupancy === 'occupied' && <span className="screen-chip red">Occupied</span>}
            {hasScore && (
              <span className={`screen-chip ${passes ? 'green' : 'red'}`} style={{ marginLeft: 'auto' }}>
                {passes ? `✓ ${score} pts` : `✗ ${score} pts`}
              </span>
            )}
          </div>
        )}

        {/* notes snippet */}
        {home.funnel.quickNotes && (
          <p className="lead-card-notes">{home.funnel.quickNotes}</p>
        )}

        {/* links */}
        {(home.links ?? []).length > 0 && (
          <div className="lead-card-links" onClick={(e) => e.stopPropagation()}>
            {(home.links ?? []).slice(0, 3).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="lead-link-chip">
                Link {i + 1}
              </a>
            ))}
            {(home.links ?? []).length > 3 && (
              <span className="lead-link-chip muted">+{(home.links ?? []).length - 3} more</span>
            )}
          </div>
        )}

        {/* actions */}
        <div className="lead-card-actions" onClick={(e) => e.stopPropagation()}>
          <SourceLogo source={home.source} customLabel={home.source === 'other' ? home.sourceCustom : undefined} />
          <StagePicker stage={home.stage} onChange={onStageChange} />
          <button className="btn btn-ghost btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); onDelete() }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Stage detail (drill-down list) ──────────────────────────────────────────

function StageDetail({ stageMeta, homes, onBack, onSelect, onStageChange, onDelete }: {
  stageMeta: { id: FunnelStage; label: string; color: string }
  homes: HomeFile[]
  onBack: () => void
  onSelect: (h: HomeFile) => void
  onStageChange: (id: string, stage: FunnelStage) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="stage-detail">
      <button className="stage-detail-back" onClick={onBack}>← Back to Pipeline</button>

      <div className="funnel-page-header" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="stage-detail-dot" style={{ background: stageMeta.color }} />
          <div>
            <h1>{stageMeta.label}</h1>
            <p>{homes.length} {homes.length === 1 ? 'property' : 'properties'}</p>
          </div>
        </div>
      </div>

      {homes.length === 0 ? (
        <div className="empty-state card">
          <h3>No properties in {stageMeta.label}</h3>
          <p>Move a lead here using the stage selector on its card.</p>
        </div>
      ) : (
        <div className="stage-list">
          {homes.map((home) => {
            const reviewMeta = REVIEW_META[home.reviewStatus] ?? REVIEW_META.pending
            return (
              <div key={home.id} className="stage-list-row" onClick={() => onSelect(home)}>
                <div className="stage-list-main">
                  <div className="stage-list-address">
                    <span>{home.address}</span>
                    <span className="stage-list-city">{[home.city, home.state].filter(Boolean).join(', ')}</span>
                  </div>
                  <div className="stage-list-badges">
                    <span className="source-badge">{getSourceLabel(home)}</span>
                    {home.funnel.rehabLevel && (
                      <span className="lead-badge" style={{ background: REHAB_BG[home.funnel.rehabLevel], color: REHAB_COLORS[home.funnel.rehabLevel] }}>
                        {home.funnel.rehabLevel}
                      </span>
                    )}
                    <span className="lead-badge" style={{ background: reviewMeta.bg, color: reviewMeta.color }}>
                      {reviewMeta.label}
                    </span>
                  </div>
                </div>
                <div className="stage-list-financials">
                  {home.funnel.arv && <span>ARV {formatCurrency(home.funnel.arv)}</span>}
                  {home.funnel.askingPrice && <span>Ask {formatCurrency(home.funnel.askingPrice)}</span>}
                </div>
                <div className="stage-list-actions" onClick={(e) => e.stopPropagation()}>
                  <StagePicker stage={home.stage} onChange={(s) => onStageChange(home.id, s)} />
                  <button className="btn btn-ghost btn-danger btn-sm" onClick={() => { if (confirm(`Delete ${home.address}?`)) onDelete(home.id) }}>Delete</button>
                  <button className="btn btn-primary btn-sm" onClick={() => onSelect(home)}>Open →</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
