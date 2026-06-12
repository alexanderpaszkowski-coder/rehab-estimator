import { useEffect, useMemo, useRef, useState } from 'react'
import type { FunnelStage, HomeFile, IntakeData, PropertySource } from '../types'
import { formatCurrency, calcQuickEstimate } from '../lib/calculations'
import {
  AUCTION_SOURCES, FUNNEL_STAGES, getSourceLabel, getStageMeta,
  passesQuickScreen, screenScore, getArvLabel, getBidLabel,
} from '../lib/funnel'
import { analyzeDeal } from '../lib/dealScore'
import type { DealAnalysis, Tag } from '../lib/dealScore'
import { PropertyIntake } from './PropertyIntake'

interface Props {
  homes: HomeFile[]
  onSelect: (home: HomeFile) => void
  onCreate: (data: IntakeData) => void
  onStageChange: (id: string, stage: FunnelStage) => void
  onDelete: (id: string) => void
  autoOpenIntake?: boolean
}

type SortOption = 'score' | 'spread' | 'newest' | 'arv'
type ViewMode = 'pipeline' | 'priority'
type QueueFilter = 'need-arv' | 'need-rehab' | 'thin-margin' | 'strong' | 'solid' | null

const REVIEW_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'New',      color: '#b45309',        bg: '#fffbeb' },
  reviewed: { label: 'Reviewed', color: '#1d4ed8',        bg: '#eff6ff' },
  approved: { label: 'Approved', color: 'var(--success)', bg: 'var(--success-soft)' },
  passed:   { label: 'Passed',   color: '#6b7280',        bg: '#f9fafb' },
}

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

// ── Source logo ───────────────────────────────────────────────────────────────

function SourceLogo({ source, customLabel, size = 20 }: {
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

function StagePicker({ stage, onChange }: { stage: FunnelStage; onChange: (s: FunnelStage) => void }) {
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

function MetricTile({ label, value, accent }: {
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
  } catch { return '—' }
}

// ── Grouped tags panel (for summary modal) ───────────────────────────────────

const TAG_GROUP_META: Record<Tag['group'], { label: string; cls: string }> = {
  status:      { label: 'Status',      cls: 'status' },
  risk:        { label: 'Risks',       cls: 'risk' },
  opportunity: { label: 'Opportunity', cls: 'opportunity' },
  action:      { label: 'Next Actions', cls: 'action' },
}

function TagGroups({ home }: { home: HomeFile }) {
  const analysis = analyzeDeal(home)
  const { tags } = analysis
  const groups = (['status', 'risk', 'opportunity', 'action'] as Tag['group'][]).filter(
    (g) => tags[g].length > 0
  )
  if (groups.length === 0) return null

  return (
    <div className="summary-tag-groups">
      {groups.map((g) => (
        <div key={g} className="summary-tag-group">
          <span className="summary-tag-group-label">{TAG_GROUP_META[g].label}</span>
          <div className="summary-tag-group-chips">
            {tags[g].map((tag) => (
              <span key={tag.label} className={`stag stag--${g}`}>{tag.label}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Property summary modal ("back of card") ───────────────────────────────────

function PropertySummaryModal({ home, onEdit, onClose, onStageChange, onDelete }: {
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
    : spread > 50_000  ? 'neutral' as const
    : 'negative' as const
  const netAccent = netMargin == null ? undefined
    : netMargin > 50_000 ? 'positive' as const
    : netMargin > 0     ? 'neutral' as const
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
              <span className="lead-badge summary-hero-badge"
                style={{ background: reviewMeta.bg, color: reviewMeta.color }}>
                {reviewMeta.label}
              </span>
            </div>
          </div>
        </div>

        {(arv || askingPrice || spread !== null || netMargin !== null) && (
          <div className="summary-metrics">
            {arv && <MetricTile label={arvLabel} value={formatCurrency(arv)} />}
            {askingPrice && <MetricTile label={bidLabel} value={formatCurrency(askingPrice)} />}
            {spread !== null && <MetricTile label="Spread" value={formatCurrency(spread)} accent={spreadAccent} />}
            {netMargin !== null && <MetricTile label="Net margin" value={formatCurrency(netMargin)} accent={netAccent} />}
          </div>
        )}

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

        {/* ── Structured tags (grouped) ── */}
        <TagGroups home={home} />

        {(detailItems.length > 0 || rehabLines.length > 0) && (
          <div className="summary-columns">
            {detailItems.length > 0 && (
              <div className="summary-col">
                <span className="summary-col-title">Details</span>
                {detailItems.map((d) => (
                  <div key={d.label} className="summary-kv">
                    <span>{d.label}</span><span>{d.value}</span>
                  </div>
                ))}
              </div>
            )}
            {rehabLines.length > 0 && (
              <div className="summary-col">
                <span className="summary-col-title">Top rehab costs</span>
                {rehabLines.map((line) => (
                  <div key={line.name} className="summary-kv">
                    <span>{line.name}</span><span>{formatCurrency(line.cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
          <button type="button" className="btn btn-ghost btn-danger btn-sm" onClick={onDelete}>Delete</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" onClick={onEdit}>Edit →</button>
          </div>
        </div>

        <div className="summary-source-watermark">
          <SourceLogo source={home.source} customLabel={customLabel} size={16} />
          <span>{getSourceLabel(home)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Deal card (compact, data-rich) ────────────────────────────────────────────

const SCORE_META: Record<string, { color: string; border: string; bg: string }> = {
  strong:  { color: '#15803d', border: '#bbf7d0', bg: '#f0fdf4' },
  good:    { color: '#2563eb', border: '#bfdbfe', bg: '#eff6ff' },
  caution: { color: '#b45309', border: '#fde68a', bg: '#fffbeb' },
  weak:    { color: '#9ca3af', border: '#e5e7eb', bg: '#f9fafb' },
}

function DealCard({
  home,
  analysis,
  onSummary,
}: {
  home: HomeFile
  analysis: DealAnalysis
  onSummary: () => void
}) {
  const [flipping, setFlipping] = useState(false)
  const arvLabel = getArvLabel(home.source)
  const bidLabel = getBidLabel(home.source)
  const customLabel = home.source === 'other' ? home.sourceCustom : undefined
  const stageMeta = getStageMeta(home.stage)
  const sm = SCORE_META[analysis.scoreTier]

  const actionBg: Record<string, string> = {
    'calculate-arv':    '#eff6ff',
    'estimate-rehab':   '#faf5ff',
    'check-title':      '#fffbeb',
    'verify-occupancy': '#fff7ed',
    'submit-offer':     '#f0fdf4',
    'review-deal':      '#f8fafc',
    'monitor':          '#f8fafc',
    'pass':             '#fef2f2',
  }
  const actionColor: Record<string, string> = {
    'calculate-arv':    '#2563eb',
    'estimate-rehab':   '#7c3aed',
    'check-title':      '#b45309',
    'verify-occupancy': '#c2410c',
    'submit-offer':     '#15803d',
    'review-deal':      '#475569',
    'monitor':          '#475569',
    'pass':             '#b91c1c',
  }

  const handleClick = () => {
    if (flipping) return
    setFlipping(true)
    setTimeout(() => { setFlipping(false); onSummary() }, 270)
  }

  return (
    <div
      className={`dcard${flipping ? ' dcard--flip' : ''}${analysis.scoreTier === 'weak' ? ' dcard--weak' : ''}${analysis.scoreTier === 'strong' ? ' dcard--strong' : ''}`}
      onClick={handleClick}
    >
      {/* Photo / no-photo header */}
      {home.photoUrl ? (
        <div className="dcard-photo">
          <img src={home.photoUrl} alt={home.address} loading="lazy" />
          <div className="dcard-photo-overlay">
            <SourceLogo source={home.source} customLabel={customLabel} size={26} />
            <span className="dcard-stage-chip" style={{ background: stageMeta.color }}>{stageMeta.label}</span>
          </div>
        </div>
      ) : (
        <div className="dcard-no-photo">
          <SourceLogo source={home.source} customLabel={customLabel} size={26} />
          <span className="dcard-stage-chip" style={{ background: stageMeta.color }}>{stageMeta.label}</span>
        </div>
      )}

      {/* Body */}
      <div className="dcard-body">

        {/* Score row */}
        <div className="dcard-score-row">
          <div
            className="dcard-score"
            style={{ color: sm.color, background: sm.bg, borderColor: sm.border }}
          >
            <span className="dcard-score-num">{analysis.score}</span>
            <span className="dcard-score-label">{analysis.scoreLabel}</span>
          </div>
          {analysis.isThinMargin && <span className="dcard-warn-chip">Thin Margin</span>}
        </div>

        {/* Address */}
        <div className="dcard-address">
          <div className="dcard-street">{home.address}</div>
          <div className="dcard-city">{[home.city, home.state].filter(Boolean).join(', ') || <em>No location</em>}</div>
        </div>

        {/* Financials */}
        {(home.funnel.arv || home.funnel.askingPrice) && (
          <div className="dcard-fin">
            {home.funnel.arv && (
              <div className="dcard-fin-row">
                <span className="dcard-fin-label">{arvLabel}</span>
                <span className="dcard-fin-value">{formatCurrency(home.funnel.arv)}</span>
              </div>
            )}
            {home.funnel.askingPrice && (
              <div className="dcard-fin-row">
                <span className="dcard-fin-label">{bidLabel}</span>
                <span className="dcard-fin-value">{formatCurrency(home.funnel.askingPrice)}</span>
              </div>
            )}
            {analysis.spread !== null && (
              <div className="dcard-fin-row">
                <span className="dcard-fin-label">Spread</span>
                <span
                  className="dcard-fin-value"
                  style={{
                    color: analysis.spread > 100_000 ? 'var(--success)'
                      : analysis.spread > 40_000 ? 'var(--warning)' : 'var(--danger)',
                    fontWeight: 700,
                  }}
                >
                  {formatCurrency(analysis.spread)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Structured chips (max 4 across groups, +X overflow) */}
        {(analysis.tags.cardChips.length > 0 || analysis.tags.overflow > 0) && (
          <div className="dcard-chips">
            {analysis.tags.cardChips.map((chip) => (
              <span key={chip.label} className={`dcard-tag dcard-tag--${chip.group}`}>{chip.label}</span>
            ))}
            {analysis.tags.overflow > 0 && (
              <span className="dcard-tag dcard-tag--overflow">+{analysis.tags.overflow}</span>
            )}
          </div>
        )}

        {/* Next action CTA */}
        <div
          className="dcard-action"
          style={{
            background: actionBg[analysis.nextActionKey] ?? '#f8fafc',
            color: actionColor[analysis.nextActionKey] ?? '#475569',
          }}
          onClick={(e) => { e.stopPropagation(); onSummary() }}
        >
          {analysis.nextAction}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 6h7m0 0L6.5 3m3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

      </div>
    </div>
  )
}

// ── Today's deal queue ────────────────────────────────────────────────────────

interface QueueCardDef {
  key: QueueFilter
  icon: string
  label: string
  count: number
  sub: string
  color: string
  bg: string
}

function DealQueue({
  cards,
  activeFilter,
  onFilter,
}: {
  cards: QueueCardDef[]
  activeFilter: QueueFilter
  onFilter: (f: QueueFilter) => void
}) {
  const hasAny = cards.some((c) => c.count > 0)
  if (!hasAny) return null

  return (
    <section className="deal-queue">
      <div className="deal-queue-label">Today's Deal Queue</div>
      <div className="deal-queue-track">
        {cards.map((card) => (
          <button
            key={card.key}
            className={`queue-card${activeFilter === card.key ? ' queue-card--active' : ''}${card.count === 0 ? ' queue-card--empty' : ''}`}
            onClick={() => onFilter(activeFilter === card.key ? null : card.key)}
            style={{ '--qc': card.color, '--qb': card.bg } as React.CSSProperties}
          >
            <span className="queue-card-icon">{card.icon}</span>
            <span className="queue-card-count" style={{ color: card.count > 0 ? card.color : 'var(--text-muted)' }}>
              {card.count}
            </span>
            <span className="queue-card-label">{card.label}</span>
            <span className="queue-card-sub">{card.sub}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Command bar ───────────────────────────────────────────────────────────────

function CommandBar({
  search, setSearch,
  sourceFilter, setSourceFilter,
  sortBy, setSortBy,
  viewMode, setViewMode,
  totalShown,
  onAdd,
}: {
  search: string
  setSearch: (v: string) => void
  sourceFilter: PropertySource | 'all'
  setSourceFilter: (v: PropertySource | 'all') => void
  sortBy: SortOption
  setSortBy: (v: SortOption) => void
  viewMode: ViewMode
  setViewMode: (v: ViewMode) => void
  totalShown: number
  onAdd: () => void
}) {
  return (
    <div className="cmd-bar">
      <div className="cmd-bar-search">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search address, city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="cmd-search-input"
        />
        {search && (
          <button className="cmd-search-clear" onClick={() => setSearch('')} aria-label="Clear">✕</button>
        )}
      </div>

      <select
        className="cmd-select"
        value={sourceFilter}
        onChange={(e) => setSourceFilter(e.target.value as PropertySource | 'all')}
      >
        <option value="all">All Sources</option>
        <option value="auction.com">Auction.com</option>
        <option value="zillow">Zillow</option>
        <option value="redfin">Redfin</option>
        <option value="realtor.com">Realtor.com</option>
        <option value="new-western">New Western</option>
        <option value="mls">MLS</option>
        <option value="off-market">Off Market</option>
        <option value="other">Other</option>
      </select>

      <select
        className="cmd-select"
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as SortOption)}
      >
        <option value="score">Sort: Deal Score</option>
        <option value="spread">Sort: Spread</option>
        <option value="arv">Sort: ARV</option>
        <option value="newest">Sort: Newest</option>
      </select>

      <div className="cmd-view-toggle">
        <button
          className={`cmd-view-btn${viewMode === 'pipeline' ? ' active' : ''}`}
          onClick={() => setViewMode('pipeline')}
        >
          Pipeline
        </button>
        <button
          className={`cmd-view-btn${viewMode === 'priority' ? ' active' : ''}`}
          onClick={() => setViewMode('priority')}
        >
          Priority
        </button>
      </div>

      <div className="cmd-bar-right">
        <span className="cmd-count">{totalShown} shown</span>
        <button className="btn btn-primary btn-sm" onClick={onAdd}>+ Add Property</button>
      </div>
    </div>
  )
}

// ── Priority group section ────────────────────────────────────────────────────

const PRIORITY_META: Record<string, { label: string; sub: string; color: string }> = {
  'work-now':     { label: 'Work Now',     sub: 'High score, numbers complete — take action today', color: '#15803d' },
  'needs-review': { label: 'Needs Review', sub: 'Missing data or moderate score — investigate further', color: '#2563eb' },
  'watchlist':    { label: 'Watchlist',    sub: 'Active deals in progress or lower priority leads', color: '#b45309' },
  'pass':         { label: 'Likely Pass',  sub: 'Low score or already closed', color: '#9ca3af' },
}

function PriorityGroup({
  groupKey,
  homes,
  analyses,
  onSummary,
}: {
  groupKey: string
  homes: HomeFile[]
  analyses: Map<string, DealAnalysis>
  onSummary: (h: HomeFile) => void
}) {
  const meta = PRIORITY_META[groupKey]
  if (homes.length === 0) return null

  return (
    <div className="priority-group">
      <div className="priority-group-header">
        <span className="priority-group-dot" style={{ background: meta.color }} />
        <div>
          <span className="priority-group-title" style={{ color: meta.color }}>{meta.label}</span>
          <span className="priority-group-sub"> · {homes.length} {homes.length === 1 ? 'property' : 'properties'}</span>
        </div>
        <span className="priority-group-desc">{meta.sub}</span>
      </div>
      <div className="deals-grid">
        {homes.map((h) => (
          <DealCard
            key={h.id}
            home={h}
            analysis={analyses.get(h.id)!}
            onSummary={() => onSummary(h)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main board ────────────────────────────────────────────────────────────────

export function FunnelBoard({ homes, onSelect, onCreate, onStageChange, onDelete, autoOpenIntake }: Props) {
  const [showIntake,    setShowIntake]    = useState(() => autoOpenIntake ?? false)
  const [search,        setSearch]        = useState('')
  const [sourceFilter,  setSourceFilter]  = useState<PropertySource | 'all'>('all')
  const [sortBy,        setSortBy]        = useState<SortOption>('score')
  const [viewMode,      setViewMode]      = useState<ViewMode>('pipeline')
  const [pipelineStage, setPipelineStage] = useState<FunnelStage>('lead')
  const [summaryHome,   setSummaryHome]   = useState<HomeFile | null>(null)
  const [queueFilter,   setQueueFilter]   = useState<QueueFilter>(null)

  // Compute all analyses
  const analyses = useMemo(() => {
    const map = new Map<string, DealAnalysis>()
    for (const h of homes) map.set(h.id, analyzeDeal(h))
    return map
  }, [homes])

  // Queue stats (from all homes, not filtered)
  const activeHomes = useMemo(() =>
    homes.filter((h) => !['sold', 'passed'].includes(h.stage)), [homes])

  const queueCards: QueueCardDef[] = useMemo(() => {
    const needArv    = activeHomes.filter((h) => !h.funnel.arv).length
    const needRehab  = activeHomes.filter((h) => h.funnel.arv && !(analyses.get(h.id)?.rehabEst)).length
    const thinMargin = activeHomes.filter((h) => analyses.get(h.id)?.isThinMargin).length
    const strong     = activeHomes.filter((h) => (analyses.get(h.id)?.score ?? 0) >= 72).length
    const solid      = homes.filter((h) => h.stage === 'solid-candidate').length
    return [
      {
        key: 'need-arv',
        icon: '📐',
        label: 'Need ARV',
        count: needArv,
        sub: needArv > 0 ? 'Start with these first' : 'All properties have ARV',
        color: '#2563eb',
        bg: '#eff6ff',
      },
      {
        key: 'need-rehab',
        icon: '🔨',
        label: 'Need Rehab Est.',
        count: needRehab,
        sub: needRehab > 0 ? 'Calculate rehab costs' : 'Rehab estimates complete',
        color: '#7c3aed',
        bg: '#faf5ff',
      },
      {
        key: 'thin-margin',
        icon: '⚠️',
        label: 'Thin Margin',
        count: thinMargin,
        sub: thinMargin > 0 ? 'Spread may not survive costs' : 'No thin margin deals',
        color: '#b91c1c',
        bg: '#fef2f2',
      },
      {
        key: 'strong',
        icon: '🎯',
        label: 'Strong Deals',
        count: strong,
        sub: strong > 0 ? 'High score — worth prioritizing' : 'No strong deals yet',
        color: '#15803d',
        bg: '#f0fdf4',
      },
      {
        key: 'solid',
        icon: '✅',
        label: 'Ready to Offer',
        count: solid,
        sub: solid > 0 ? 'Move quickly on these' : 'No offers pending',
        color: '#b45309',
        bg: '#fffbeb',
      },
    ]
  }, [activeHomes, analyses, homes])

  // Filtered + sorted homes
  const filtered = useMemo(() => {
    let result = homes.filter((h) => {
      // Text search
      if (search.trim()) {
        const q = search.toLowerCase()
        if (![h.address, h.city, h.state, getSourceLabel(h)].join(' ').toLowerCase().includes(q))
          return false
      }
      // Source filter
      if (sourceFilter !== 'all' && h.source !== sourceFilter) return false
      // Queue filter
      if (queueFilter === 'need-arv')    return !h.funnel.arv && !['sold', 'passed'].includes(h.stage)
      if (queueFilter === 'need-rehab')  return !!h.funnel.arv && !(analyses.get(h.id)?.rehabEst) && !['sold', 'passed'].includes(h.stage)
      if (queueFilter === 'thin-margin') return !!analyses.get(h.id)?.isThinMargin
      if (queueFilter === 'strong')      return (analyses.get(h.id)?.score ?? 0) >= 72
      if (queueFilter === 'solid')       return h.stage === 'solid-candidate'
      return true
    })
    // Sort
    result = [...result].sort((a, b) => {
      const da = analyses.get(a.id)!, db = analyses.get(b.id)!
      if (sortBy === 'score')   return db.score - da.score
      if (sortBy === 'spread')  return (db.spread ?? -Infinity) - (da.spread ?? -Infinity)
      if (sortBy === 'newest')  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sortBy === 'arv')     return (b.funnel.arv ?? 0) - (a.funnel.arv ?? 0)
      return 0
    })
    return result
  }, [homes, search, sourceFilter, sortBy, queueFilter, analyses])

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

  const priorityGroups = useMemo(() => {
    const groups: Record<string, HomeFile[]> = {
      'work-now': [], 'needs-review': [], 'watchlist': [], 'pass': [],
    }
    for (const h of filtered) {
      const pg = analyses.get(h.id)?.priorityGroup ?? 'needs-review'
      groups[pg].push(h)
    }
    return groups
  }, [filtered, analyses])

  const liveSummaryHome = summaryHome
    ? (homes.find((h) => h.id === summaryHome.id) ?? summaryHome)
    : null

  const displayHomes   = queueFilter ? filtered : (byStage.get(pipelineStage) ?? [])
  const currentStageMeta = getStageMeta(pipelineStage)
  const totalCounts    = useMemo(() => {
    const m = new Map<FunnelStage, number>()
    for (const s of FUNNEL_STAGES) m.set(s.id, homes.filter((h) => h.stage === s.id).length)
    return m
  }, [homes])

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

      {/* ── 1. Compact pipeline strip ── */}
      <section className="cpipeline">
        {FUNNEL_STAGES.map((stage) => {
          const count  = totalCounts.get(stage.id) ?? 0
          const active = stage.id === pipelineStage && viewMode === 'pipeline' && !queueFilter
          return (
            <button
              key={stage.id}
              className={`cpipe-stage${active ? ' cpipe-stage--active' : ''}${count > 0 ? ' cpipe-stage--has' : ''}`}
              style={{ '--sc': stage.color } as React.CSSProperties}
              onClick={() => {
                setPipelineStage(stage.id)
                setViewMode('pipeline')
                setQueueFilter(null)
              }}
            >
              <span className="cpipe-count">{count}</span>
              <span className="cpipe-label">{stage.label}</span>
            </button>
          )
        })}
      </section>

      {/* ── 2. Today's deal queue ── */}
      <DealQueue
        cards={queueCards}
        activeFilter={queueFilter}
        onFilter={(f) => {
          setQueueFilter(f)
          if (f) setViewMode('pipeline')
        }}
      />

      {/* ── 3. Command bar ── */}
      <CommandBar
        search={search} setSearch={setSearch}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        sortBy={sortBy} setSortBy={setSortBy}
        viewMode={viewMode} setViewMode={(v) => { setViewMode(v); setQueueFilter(null) }}
        totalShown={viewMode === 'priority' ? filtered.length : displayHomes.length}
        onAdd={() => setShowIntake(true)}
      />

      {/* ── 4. Property grid ── */}
      {viewMode === 'priority' ? (

        /* Priority view — grouped by work-now / needs-review / watchlist / pass */
        <div className="priority-view">
          {(['work-now', 'needs-review', 'watchlist', 'pass'] as const).map((gk) => (
            <PriorityGroup
              key={gk}
              groupKey={gk}
              homes={priorityGroups[gk]}
              analyses={analyses}
              onSummary={setSummaryHome}
            />
          ))}
          {filtered.length === 0 && (
            <div className="board-empty">
              <p>No properties match your filters.</p>
              <button className="btn btn-primary btn-sm" onClick={() => setShowIntake(true)}>+ Add Property</button>
            </div>
          )}
        </div>

      ) : (

        /* Pipeline view — cards for selected stage */
        <div className="pipeline-view">
          {queueFilter ? (
            /* Queue filter active — show matching cards across all stages */
            <>
              <div className="pipeline-view-header">
                <div className="pipeline-view-stage-dot" style={{ background: '#374151' }} />
                <h2 className="pipeline-view-title">
                  {queueCards.find((c) => c.key === queueFilter)?.label ?? 'Filtered'}
                </h2>
                <span className="pipeline-view-count">{filtered.length}</span>
                <button className="pipeline-view-clear" onClick={() => setQueueFilter(null)}>✕ Clear</button>
              </div>
              <div className="deals-grid">
                {filtered.map((h) => (
                  <DealCard key={h.id} home={h} analysis={analyses.get(h.id)!} onSummary={() => setSummaryHome(h)} />
                ))}
              </div>
            </>
          ) : (
            /* Stage selected */
            <>
              <div className="pipeline-view-header">
                <div className="pipeline-view-stage-dot" style={{ background: currentStageMeta.color }} />
                <h2 className="pipeline-view-title">{currentStageMeta.label}</h2>
                <span className="pipeline-view-count">{displayHomes.length}</span>
              </div>

              {displayHomes.length === 0 ? (
                <div className="stage-empty">
                  <div className="stage-empty-icon">
                    {pipelineStage === 'lead' ? '📥' :
                     pipelineStage === 'arv-calculated' ? '📐' :
                     pipelineStage === 'rehab-calculated' ? '🔨' :
                     pipelineStage === 'solid-candidate' ? '🎯' :
                     pipelineStage === 'under-contract' ? '📋' :
                     pipelineStage === 'rehab' ? '🏗️' :
                     pipelineStage === 'listed' ? '🏠' :
                     pipelineStage === 'sold' ? '🏆' : '⏭️'}
                  </div>
                  <h3>No properties in {currentStageMeta.label}</h3>
                  <p>
                    {pipelineStage === 'lead'
                      ? 'Add a property to get started — it will land here as a new lead.'
                      : pipelineStage === 'arv-calculated'
                      ? 'Calculate ARV on a New Lead to move it here.'
                      : pipelineStage === 'rehab-calculated'
                      ? 'Once rehab costs are estimated, move leads here.'
                      : pipelineStage === 'solid-candidate'
                      ? 'Move your best deals here once numbers look solid.'
                      : `Move candidates here once they reach this stage.`}
                  </p>
                  {pipelineStage === 'lead' && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowIntake(true)}>+ Add Property</button>
                  )}
                </div>
              ) : (
                <div className="deals-grid">
                  {displayHomes.map((h) => (
                    <DealCard
                      key={h.id}
                      home={h}
                      analysis={analyses.get(h.id)!}
                      onSummary={() => setSummaryHome(h)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showIntake && (
        <PropertyIntake
          onCancel={() => setShowIntake(false)}
          onSubmit={(data) => { onCreate(data); setShowIntake(false) }}
        />
      )}
    </div>
  )
}
