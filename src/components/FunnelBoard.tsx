import { useEffect, useMemo, useRef, useState } from 'react'
import type { FunnelStage, HomeFile, IntakeData, PropertySource } from '../types'
import { formatCurrency, calcQuickEstimate } from '../lib/calculations'
import { AUCTION_SOURCES, FUNNEL_STAGES, getSourceLabel, getStageMeta, passesQuickScreen, screenScore, getArvLabel, getBidLabel } from '../lib/funnel'
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
  pending:  { label: 'New',      color: '#b45309',        bg: '#fffbeb' },
  reviewed: { label: 'Reviewed', color: '#1d4ed8',        bg: '#eff6ff' },
  approved: { label: 'Approved', color: 'var(--success)', bg: 'var(--success-soft)' },
  passed:   { label: 'Passed',   color: '#6b7280',        bg: '#f9fafb' },
}

// ── Source logo ───────────────────────────────────────────────────────────────

const SOURCE_DOMAIN: Partial<Record<PropertySource, string>> = {
  'auction.com':  'auction.com',
  'realtor.com':  'realtor.com',
  'zillow':       'zillow.com',
  'redfin':       'redfin.com',
  'new-western':  'newwestern.com',
  'zenlist':      'zenlist.com',
  'homes.com':    'homes.com',
  'homepath':     'homepath.com',
  'hubzu':        'hubzu.com',
  'mls':          'mls.com',
}

function SourceLogo({
  source,
  customLabel,
  size = 20,
}: {
  source: PropertySource
  customLabel?: string
  size?: number
}) {
  const domain = SOURCE_DOMAIN[source]
  const label  = customLabel || source
  if (domain) {
    return (
      <img
        className="source-logo"
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt={label}
        title={label}
        style={{ width: size, height: size }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return <span className="source-logo-text" title={label}>{label}</span>
}

// ── Stage picker popover ──────────────────────────────────────────────────────

function StagePicker({
  stage,
  onChange,
}: {
  stage: FunnelStage
  onChange: (s: FunnelStage) => void
}) {
  const [open, setOpen] = useState(false)
  const ref  = useRef<HTMLDivElement>(null)
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
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        title="Change stage"
      >
        <span className="stage-picker-dot" />
        <span>{meta.label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5 }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="stage-picker-menu">
          {FUNNEL_STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`stage-picker-option ${s.id === stage ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onChange(s.id); setOpen(false) }}
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

// ── Summary modal helpers ─────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'positive' | 'negative' | 'neutral' | 'muted'
}) {
  const color =
    accent === 'positive' ? 'var(--success)'
    : accent === 'negative' ? 'var(--danger)'
    : accent === 'muted' ? 'var(--text-muted)'
    : undefined
  return (
    <div className="summary-metric">
      <span className="summary-metric-value" style={color ? { color } : undefined}>{value}</span>
      <span className="summary-metric-label">{label}</span>
    </div>
  )
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

// ── Property summary modal ("back of card") ───────────────────────────────────

function PropertySummaryModal({
  home,
  onEdit,
  onClose,
  onStageChange,
  onDelete,
}: {
  home: HomeFile
  onEdit: () => void
  onClose: () => void
  onStageChange: (s: FunnelStage) => void
  onDelete: () => void
}) {
  const arvLabel = getArvLabel(home.source)
  const bidLabel = getBidLabel(home.source)
  const isAuction = AUCTION_SOURCES.includes(home.source)
  const funnel = home.funnel
  const { arv, askingPrice, maxOffer, occupancy, rehabLevel, inTargetArea, auctionType, startingCreditBid, quickNotes } = funnel
  const spread = arv && askingPrice ? arv - askingPrice : null
  const quick = calcQuickEstimate(home.property, home.quickEstimate)
  const rehabEst = quick.withContingency > 0 ? quick.withContingency : null
  const netMargin = spread !== null && rehabEst ? spread - rehabEst : null
  const passes = passesQuickScreen(funnel)
  const score = screenScore(funnel)
  const stageMeta = getStageMeta(home.stage)
  const reviewMeta = REVIEW_META[home.reviewStatus] ?? REVIEW_META.pending
  const customLabel = home.source === 'other' ? home.sourceCustom : undefined
  const p = home.property

  const bathLabel = [
    p.fullBaths ? `${p.fullBaths} full` : null,
    p.halfBaths ? `${p.halfBaths} half` : null,
  ].filter(Boolean).join(', ') || null

  const rehabLines = quick.lineCosts
    .filter((l) => l.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 3)

  const spreadAccent = spread == null ? undefined
    : spread > 100_000 ? 'positive' as const
    : spread > 50_000 ? 'neutral' as const
    : 'negative' as const
  const netAccent = netMargin == null ? undefined
    : netMargin > 50_000 ? 'positive' as const
    : netMargin > 0 ? 'neutral' as const
    : 'negative' as const

  const notesText = [quickNotes, home.notes].filter(Boolean).join('\n\n') || null

  const specChips: { label: string; cls?: string }[] = []
  if (p.livingArea > 0) specChips.push({ label: `${p.livingArea.toLocaleString()} SF`, cls: 'grey' })
  if (p.bedrooms > 0) specChips.push({ label: `${p.bedrooms} bed`, cls: 'grey' })
  if (bathLabel) specChips.push({ label: bathLabel, cls: 'grey' })
  if (funnel.yearBuilt) specChips.push({ label: `Built ${funnel.yearBuilt}`, cls: 'grey' })
  if (occupancy === 'vacant') specChips.push({ label: 'Vacant', cls: 'green' })
  if (occupancy === 'occupied') specChips.push({ label: 'Occupied', cls: 'red' })
  if (inTargetArea === 'yes') specChips.push({ label: 'In area', cls: 'green' })
  if (inTargetArea === 'maybe') specChips.push({ label: 'Maybe area', cls: 'yellow' })
  if (inTargetArea === 'no') specChips.push({ label: 'Out of area', cls: 'red' })
  if (rehabLevel) specChips.push({ label: `${rehabLevel} rehab`, cls: 'grey' })
  if (isAuction && auctionType) {
    specChips.push({ label: auctionType === 'bank-owned' ? 'Bank owned' : 'Auction', cls: 'grey' })
  }

  const detailItems: { label: string; value: string }[] = []
  if (rehabEst) detailItems.push({ label: 'Est. rehab', value: formatCurrency(rehabEst) })
  if (maxOffer) detailItems.push({ label: 'Max offer', value: formatCurrency(maxOffer) })
  if (rehabEst && p.livingArea > 0) detailItems.push({ label: 'Rehab $/SF', value: formatCurrency(quick.perSf) })
  if (isAuction && startingCreditBid) detailItems.push({ label: 'Credit bid', value: formatCurrency(startingCreditBid) })
  if (funnel.titleClear === 'yes') detailItems.push({ label: 'Title', value: 'Clear' })
  if (funnel.sellerMotivated === 'yes') detailItems.push({ label: 'Seller', value: 'Motivated' })
  if (p.finishGrade) detailItems.push({ label: 'Finish', value: p.finishGrade })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="summary-modal summary-modal--compact" onClick={(e) => e.stopPropagation()}>

        {/* ── Hero: thumbnail + identity ── */}
        <div className="summary-hero">
          {home.photoUrl ? (
            <div className="summary-thumb">
              <img src={home.photoUrl} alt={home.address} />
            </div>
          ) : (
            <div className="summary-thumb summary-thumb--empty">
              <SourceLogo source={home.source} customLabel={customLabel} size={28} />
            </div>
          )}
          <div className="summary-hero-info">
            <div className="summary-hero-top">
              <div>
                <h2 className="summary-address">{home.address}</h2>
                <p className="summary-city">{[home.city, home.state, home.zip].filter(Boolean).join(', ')}</p>
              </div>
              <StagePicker stage={home.stage} onChange={onStageChange} />
            </div>
            <div className="summary-hero-meta">
              <SourceLogo source={home.source} customLabel={customLabel} size={14} />
              <span>{getSourceLabel(home)}</span>
              <span className="summary-hero-dot">·</span>
              <span className="summary-meta-dot" style={{ background: stageMeta.color }} />
              <span>{stageMeta.label}</span>
              <span className="summary-hero-dot">·</span>
              <span>{formatShortDate(home.createdAt)}</span>
              <span
                className="lead-badge summary-hero-badge"
                style={{ background: reviewMeta.bg, color: reviewMeta.color }}
              >
                {reviewMeta.label}
              </span>
            </div>
          </div>
        </div>

        {/* ── Key metrics strip ── */}
        {(arv || askingPrice || spread !== null || netMargin !== null) && (
          <div className="summary-metrics">
            {arv && <MetricTile label={arvLabel} value={formatCurrency(arv)} />}
            {askingPrice && <MetricTile label={bidLabel} value={formatCurrency(askingPrice)} />}
            {spread !== null && <MetricTile label="Spread" value={formatCurrency(spread)} accent={spreadAccent} />}
            {netMargin !== null && <MetricTile label="Net margin" value={formatCurrency(netMargin)} accent={netAccent} />}
          </div>
        )}

        {/* ── Spec chips + screen score ── */}
        {(specChips.length > 0 || score > 0) && (
          <div className="summary-specs">
            <div className="summary-spec-chips">
              {specChips.map((c) => (
                <span key={c.label} className={`screen-chip ${c.cls ?? 'grey'}`}>{c.label}</span>
              ))}
            </div>
            {score > 0 && (
              <span className={`screen-chip score-chip ${passes ? 'green' : 'red'}`}>
                {passes ? `✓ ${score} pts` : `✗ ${score} pts`}
              </span>
            )}
          </div>
        )}

        {/* ── Two-column details ── */}
        {(detailItems.length > 0 || rehabLines.length > 0) && (
          <div className="summary-columns">
            {detailItems.length > 0 && (
              <div className="summary-col">
                <span className="summary-col-title">Details</span>
                {detailItems.map((d) => (
                  <div key={d.label} className="summary-kv">
                    <span>{d.label}</span>
                    <span>{d.value}</span>
                  </div>
                ))}
              </div>
            )}
            {rehabLines.length > 0 && (
              <div className="summary-col">
                <span className="summary-col-title">Top rehab costs</span>
                {rehabLines.map((line) => (
                  <div key={line.name} className="summary-kv">
                    <span>{line.name}</span>
                    <span>{formatCurrency(line.cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Notes (always visible) ── */}
        <div className="summary-notes-block">
          <span className="summary-col-title">Notes</span>
          {notesText ? (
            <p className="summary-note-text">{notesText}</p>
          ) : (
            <p className="summary-note-empty">No notes yet — add them when editing this property.</p>
          )}
        </div>

        {(home.links ?? []).length > 0 && (
          <div className="summary-links-row">
            {(home.links ?? []).slice(0, 2).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="lead-link-chip">
                Link {i + 1}
              </a>
            ))}
          </div>
        )}

        <div className="summary-actions">
          <button type="button" className="btn btn-ghost btn-danger btn-sm" onClick={onDelete}>
            Delete
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" onClick={onEdit}>Edit →</button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Main board ────────────────────────────────────────────────────────────────

export function FunnelBoard({ homes, onSelect, onCreate, onStageChange, onDelete, autoOpenIntake }: Props) {
  const [showIntake,    setShowIntake]    = useState(() => autoOpenIntake ?? false)
  const [search,        setSearch]        = useState('')
  const [selectedStage, setSelectedStage] = useState<FunnelStage | null>(null)
  const [summaryHome,   setSummaryHome]   = useState<HomeFile | null>(null)

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

  const pipelineStages = FUNNEL_STAGES

  // Keep summaryHome in sync with latest home data (e.g. after stage change)
  const liveSummaryHome = summaryHome
    ? (homes.find((h) => h.id === summaryHome.id) ?? summaryHome)
    : null

  if (selectedStage) {
    const stageMeta  = getStageMeta(selectedStage)
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
      {liveSummaryHome && (
        <PropertySummaryModal
          home={liveSummaryHome}
          onEdit={() => { setSummaryHome(null); onSelect(liveSummaryHome) }}
          onClose={() => setSummaryHome(null)}
          onStageChange={(s) => onStageChange(liveSummaryHome.id, s)}
          onDelete={() => {
            if (confirm(`Delete ${liveSummaryHome.address}?`)) {
              onDelete(liveSummaryHome.id)
              setSummaryHome(null)
            }
          }}
        />
      )}

      {/* ── Pipeline (top) ── */}
      <section className="pipeline-section">
        <div className="pipeline-track">
          {pipelineStages.map((stage, i) => {
            const count = byStage.get(stage.id)?.length ?? 0
            return (
              <div key={stage.id} className="pipeline-step">
                <button
                  type="button"
                  className={`pipeline-card${count > 0 ? ' pipeline-card--active' : ''}`}
                  onClick={() => setSelectedStage(stage.id)}
                  style={{ '--stage-color': stage.color } as React.CSSProperties}
                >
                  <span className="pipeline-dot" />
                  <span className="pipeline-count">{count}</span>
                  <span className="pipeline-label">{stage.label}</span>
                </button>
                {i < pipelineStages.length - 1 && (
                  <span className="pipeline-connector" aria-hidden="true">
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
                      <path d="M1.5 1l4.5 5-4.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Header ── */}
      <div className="funnel-page-header">
        <div>
          <h1>Property Funnel</h1>
          <p>
            {homes.length} {homes.length === 1 ? 'property' : 'properties'}
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

      {/* ── Leads ── */}
      <section className="leads-section">
        <div className="leads-section-header">
          <h2>New Leads <span className="section-count">{leads.length}</span></h2>
          <p>Fresh listings uploaded — start by calculating ARV</p>
        </div>

        {leads.length === 0 ? (
          <div className="empty-state card" style={{ padding: '40px 24px' }}>
            <h3>No new leads yet</h3>
            <p>Add a property to get started — it will land here as a new lead.</p>
          </div>
        ) : (
          <div className="leads-grid">
            {leads.map((home) => (
              <LeadCard
                key={home.id}
                home={home}
                onSummary={() => setSummaryHome(home)}
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

// ── Lead card (front face — read only) ───────────────────────────────────────

function LeadCard({ home, onSummary }: { home: HomeFile; onSummary: () => void }) {
  const [flipping, setFlipping] = useState(false)

  const arvLabel = getArvLabel(home.source)
  const bidLabel = getBidLabel(home.source)
  const { arv, askingPrice, occupancy, rehabLevel, inTargetArea } = home.funnel
  const spread      = arv && askingPrice ? arv - askingPrice : null
  const spreadColor = spread == null ? 'var(--text)'
    : spread > 100_000 ? 'var(--success)'
    : spread > 50_000  ? 'var(--warning)'
    : 'var(--danger)'

  const passes    = passesQuickScreen(home.funnel)
  const score     = screenScore(home.funnel)
  const hasScore  = score > 0 || home.funnel.availableForSale !== null
  const reviewMeta = REVIEW_META[home.reviewStatus] ?? REVIEW_META.pending
  const customLabel = home.source === 'other' ? home.sourceCustom : undefined

  const handleClick = () => {
    if (flipping) return
    setFlipping(true)
    setTimeout(() => { setFlipping(false); onSummary() }, 300)
  }

  return (
    <div
      className={`lead-card${flipping ? ' lead-card-flipping' : ''}`}
      onClick={handleClick}
    >
      {/* ── Photo with overlay ── */}
      {home.photoUrl ? (
        <div className="lead-card-photo">
          <img src={home.photoUrl} alt={home.address} loading="lazy" />
          {/* Gradient overlay with source + status badges */}
          <div className="lead-card-photo-overlay">
            <SourceLogo source={home.source} customLabel={customLabel} size={53} />
            <span
              className="lead-card-status-badge"
              style={{ background: reviewMeta.bg, color: reviewMeta.color }}
            >
              {reviewMeta.label}
            </span>
          </div>
        </div>
      ) : (
        /* No photo: compact source/status bar at top */
        <div className="lead-card-topbar">
          <SourceLogo source={home.source} customLabel={customLabel} size={53} />
          <span
            className="lead-badge"
            style={{ background: reviewMeta.bg, color: reviewMeta.color }}
          >
            {reviewMeta.label}
          </span>
        </div>
      )}

      {/* ── Content ── */}
      <div className="lead-card-inner">

        {/* Address */}
        <div className="lead-card-address">
          <h3>{home.address}</h3>
          <p>{[home.city, home.state].filter(Boolean).join(', ') || <em>No location</em>}</p>
        </div>

        {/* Financials — spread is hero number */}
        {(arv || askingPrice) && (
          <div className="lead-card-financials">
            {spread !== null && (
              <div className="lead-fin-item lead-fin-item--spread">
                <span className="lead-fin-label">Spread</span>
                <span className="lead-fin-value" style={{ color: spreadColor }}>
                  {formatCurrency(spread)}
                </span>
              </div>
            )}
            {arv && (
              <div className="lead-fin-item">
                <span className="lead-fin-label">{arvLabel}</span>
                <span className="lead-fin-value">{formatCurrency(arv)}</span>
              </div>
            )}
            {askingPrice && (
              <div className="lead-fin-item">
                <span className="lead-fin-label">{bidLabel}</span>
                <span className="lead-fin-value">{formatCurrency(askingPrice)}</span>
              </div>
            )}
          </div>
        )}

        {/* Screening chips — max 4 most informative */}
        {hasScore && (
          <div className="lead-card-screen">
            {occupancy === 'vacant'   && <span className="screen-chip green">Vacant</span>}
            {occupancy === 'occupied' && <span className="screen-chip red">Occupied</span>}
            {inTargetArea === 'yes'   && <span className="screen-chip green">In area</span>}
            {inTargetArea === 'maybe' && <span className="screen-chip yellow">Maybe area</span>}
            {inTargetArea === 'no'    && <span className="screen-chip red">Out of area</span>}
            {rehabLevel && (
              <span className="screen-chip" style={{ background: REHAB_BG[rehabLevel], color: REHAB_COLORS[rehabLevel] }}>
                {rehabLevel}
              </span>
            )}
            <span
              className={`screen-chip score-chip ${passes ? 'green' : 'red'}`}
              style={{ marginLeft: 'auto' }}
            >
              {passes ? `✓ ${score}` : `✗ ${score}`}
            </span>
          </div>
        )}

      </div>

      {/* ── "Tap to expand" hint ── */}
      <div className="lead-card-hint">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 5l2 2 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Tap for details</span>
      </div>
    </div>
  )
}

// ── Stage detail drill-down ───────────────────────────────────────────────────

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
          <p>Move a lead here using the stage selector when viewing a property.</p>
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
                  {home.funnel.arv      && <span>ARV {formatCurrency(home.funnel.arv)}</span>}
                  {home.funnel.askingPrice && <span>Ask {formatCurrency(home.funnel.askingPrice)}</span>}
                </div>
                <div className="stage-list-actions" onClick={(e) => e.stopPropagation()}>
                  <StagePicker stage={home.stage} onChange={(s) => onStageChange(home.id, s)} />
                  <button
                    className="btn btn-ghost btn-danger btn-sm"
                    onClick={() => { if (confirm(`Delete ${home.address}?`)) onDelete(home.id) }}
                  >
                    Delete
                  </button>
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
