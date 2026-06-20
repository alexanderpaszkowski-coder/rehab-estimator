import { useEffect, useMemo, useRef, useState } from 'react'
import { useLockBodyScroll } from '../lib/useLockBodyScroll'
import type { FunnelStage, HomeFile, IntakeData, PropertyInputs as PropertyInputsType, PropertySource, QuickSystem } from '../types'
import { formatCurrency, calcBlendedRehab, calcAllInCosts } from '../lib/calculations'
import {
  AUCTION_SOURCES, FUNNEL_STAGES, PIPELINE_STAGES, MLS_SOURCES, getSourceLabel, getStageMeta,
  getArvLabel, getBidLabel,
} from '../lib/funnel'
import { analyzeDeal } from '../lib/dealScore'
import type { DealAnalysis, Tag } from '../lib/dealScore'
import { PropertyIntake } from './PropertyIntake'
import { AuctionCountdown } from './AuctionCountdown'
import { getListingUrl, isRefreshable } from '../lib/listingRefresh'
import { generateAiRehabPrompt } from '../lib/copyContent'
import { getAuctionDeadlineMs, getAuctionCountdown } from '../lib/auctionSchedule'
import { FunnelDetails } from './FunnelDetails'
import { PropertyInputs as PropertyInputsView } from './PropertyInputs'
import { QuickEstimate } from './QuickEstimate'
import { ScopeOfWork } from './ScopeOfWork'
import { Summary as BudgetSummary } from './Summary'

interface Props {
  homes: HomeFile[]
  onSelect: (home: HomeFile) => void
  onCreate: (data: IntakeData) => void
  onStageChange: (id: string, stage: FunnelStage) => void
  onDelete: (id: string) => void
  onRefreshHome?: (home: HomeFile) => Promise<void>
  onUpdateHome?: (home: HomeFile) => void
  autoOpenIntake?: boolean
  streetViewStatus?: Record<string, 'fetching' | 'failed'>
  showEnded?: boolean
  onHideEnded?: () => void
}

type SortOption = 'spread' | 'newest' | 'arv' | 'ending-soon'
type ViewMode = 'on-market' | 'off-market'

const OFF_MARKET_SOURCES: PropertySource[] = [
  'driving-for-dollars', 'off-market', 'wholesale', 'direct-mail', 'other',
]
type ActionGroupKey = 'send-mailer' | 'need-arv' | 'need-rehab' | 'need-hml' | 'offer-ready' | 'max-bid' | 'active' | 'closed'

const ACTION_GROUP_ORDER: ActionGroupKey[] = ['send-mailer', 'need-arv', 'need-rehab', 'need-hml', 'offer-ready', 'max-bid', 'active', 'closed']

const ACTION_GROUP_META: Record<ActionGroupKey, { label: string; sub: string; color: string }> = {
  'send-mailer': { label: 'Send Mailer',             sub: 'Off-market / drive-by — send a letter or make contact first', color: '#7c3aed' },
  'need-arv':    { label: 'Need ARV',                sub: 'Run comps to establish value before going further',            color: '#2563eb' },
  'need-rehab':  { label: 'Need Rehab Numbers',      sub: 'Complete the full rehab scope — every system, not just a start', color: '#1e3a5f' },
  'need-hml':    { label: 'Need Hard Money Numbers', sub: 'Run financing scenarios with your lender',                     color: '#0891b2' },
  'offer-ready': { label: 'Offer Ready',             sub: 'All numbers confirmed — move quickly',                         color: '#15803d' },
  'max-bid':     { label: 'Max Bid Needed',          sub: 'Auction — calculate your walk-away number before it opens',    color: '#1e293b' },
  'active':      { label: 'Active',                  sub: 'Under contract, in rehab, or listed',                          color: '#6b7280' },
  'closed':      { label: 'Closed',                  sub: 'Sold or passed on',                                            color: '#9ca3af' },
}

// Off-market / direct-contact sources where you send mail before anything else
const SEND_MAILER_SOURCES: PropertySource[] = [
  'driving-for-dollars', 'off-market', 'wholesale', 'direct-mail', 'other',
]

function getActionGroup(home: HomeFile, _analysis: DealAnalysis): ActionGroupKey {
  if (['sold', 'passed', 'auction-ended'].includes(home.stage)) return 'closed'
  if (['under-contract', 'rehab', 'listed'].includes(home.stage)) return 'active'

  // Offer ready / max bid — only when the user has explicitly promoted to solid-candidate
  if (home.stage === 'solid-candidate') {
    return AUCTION_SOURCES.includes(home.source) ? 'max-bid' : 'offer-ready'
  }

  // Rehab scope confirmed complete — stage rehab-calculated means all systems assessed
  if (home.stage === 'rehab-calculated') return 'need-hml'

  // ARV is done but rehab scope not yet complete
  if (home.stage === 'arv-calculated') return 'need-rehab'

  // New lead (lead stage) — off-market sources need a mailer before anything else
  if (SEND_MAILER_SOURCES.includes(home.source)) return 'send-mailer'

  // Online listing with no further work done
  return 'need-arv'
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
  'driving-for-dollars': 'maps.google.com',
}

// ── Source logo ───────────────────────────────────────────────────────────────

// ── AI Prompt copy buttons ────────────────────────────────────────────────────

export function AiPromptButtons({ home }: { home: HomeFile }) {
  const [copied, setCopied] = useState<'claude' | 'gpt' | null>(null)

  const copy = (ai: 'claude' | 'gpt') => {
    const prompt = generateAiRehabPrompt(home)
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(ai)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="ai-prompt-btns">
      <button
        type="button"
        className={`ai-prompt-btn${copied === 'claude' ? ' ai-prompt-btn--copied' : ''}`}
        title="Copy rehab analysis prompt for Claude"
        onClick={() => copy('claude')}
      >
        <img src="https://www.google.com/s2/favicons?domain=claude.ai&sz=32" width="13" height="13" alt="Claude" />
        {copied === 'claude' ? 'Copied!' : 'Claude'}
      </button>
      <button
        type="button"
        className={`ai-prompt-btn${copied === 'gpt' ? ' ai-prompt-btn--copied' : ''}`}
        title="Copy rehab analysis prompt for ChatGPT"
        onClick={() => copy('gpt')}
      >
        <img src="https://www.google.com/s2/favicons?domain=chat.openai.com&sz=32" width="13" height="13" alt="ChatGPT" />
        {copied === 'gpt' ? 'Copied!' : 'ChatGPT'}
      </button>
    </div>
  )
}

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

// ── Filter pill (custom dropdown, replaces native <select>) ──────────────────

const SOURCE_PILL_OPTIONS = [
  { value: 'all',          label: 'All Sources'  },
  { value: 'auction.com',  label: 'Auction.com'  },
  { value: 'zillow',       label: 'Zillow'        },
  { value: 'redfin',       label: 'Redfin'        },
  { value: 'realtor.com',  label: 'Realtor.com'   },
  { value: 'new-western',  label: 'New Western'   },
  { value: 'mls',          label: 'MLS'           },
  { value: 'off-market',   label: 'Off Market'    },
  { value: 'other',        label: 'Other'         },
]

const SORT_PILL_OPTIONS = [
  { value: 'spread',       label: 'Net Margin',      shortLabel: 'Net'      },
  { value: 'ending-soon',  label: 'Ending Soonest',  shortLabel: 'Soonest'  },
  { value: 'arv',          label: 'ARV',             shortLabel: 'ARV'      },
  { value: 'newest',       label: 'Newest',          shortLabel: 'Newest'   },
]

function FilterPill({
  value,
  options,
  onChange,
  prefix,
}: {
  value: string
  options: { value: string; label: string; shortLabel?: string }[]
  onChange: (v: string) => void
  prefix?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)
  const isActive = value !== options[0].value

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className={`fpill${isActive ? ' fpill--active' : ''}`} ref={ref}>
      <button
        type="button"
        className={`fpill-btn${open ? ' fpill-btn--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {prefix && <span className="fpill-prefix">{prefix}</span>}
        <span className="fpill-value fpill-value--full">{current?.label ?? value}</span>
        <span className="fpill-value fpill-value--short">{current?.shortLabel ?? current?.label ?? value}</span>
        <svg
          className={`fpill-chevron${open ? ' fpill-chevron--up' : ''}`}
          width="11" height="11" viewBox="0 0 11 11" fill="none"
          aria-hidden="true"
        >
          <path d="M2 4l3.5 3.5L9 4" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="fpill-menu">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`fpill-option${o.value === value ? ' fpill-option--selected' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              <span className="fpill-option-check" aria-hidden="true">
                {o.value === value && (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1.5 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Summary modal helpers ─────────────────────────────────────────────────────


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

function isPropstreamUrl(url: string): boolean {
  try {
    return /propstream\.com/i.test(new URL(url).hostname)
  } catch {
    return /propstream\.com/i.test(url)
  }
}

/** Front of card — PropStream only when saved (no refresh). */

/** Summary modal — listing, refresh, propstream editor. */
function SummaryLinkActions({
  home,
  onRefresh,
  refreshing,
  onUpdateHome,
}: {
  home: HomeFile
  onRefresh?: (home: HomeFile) => Promise<void>
  refreshing?: boolean
  onUpdateHome?: (home: HomeFile) => void
}) {
  const [showPropInput, setShowPropInput] = useState(false)
  const [propDraft, setPropDraft] = useState(home.propstreamUrl ?? '')
  const [propError, setPropError] = useState<string | null>(null)

  const listingUrl = getListingUrl(home)
  const canRefreshPhoto = !home.photoUrl
  const hasActions = listingUrl || isRefreshable(home) || canRefreshPhoto || onUpdateHome

  useEffect(() => {
    setPropDraft(home.propstreamUrl ?? '')
  }, [home.propstreamUrl, home.id])

  const savePropstream = () => {
    const trimmed = propDraft.trim()
    if (!trimmed) {
      setPropError('Paste a PropStream URL')
      return
    }
    if (!isPropstreamUrl(trimmed)) {
      setPropError('URL must be from propstream.com')
      return
    }
    onUpdateHome?.({ ...home, propstreamUrl: trimmed })
    setPropError(null)
    setShowPropInput(false)
  }

  const removePropstream = () => {
    onUpdateHome?.({ ...home, propstreamUrl: undefined })
    setPropDraft('')
    setPropError(null)
    setShowPropInput(false)
  }

  if (!hasActions) return null

  return (
    <div className="summary-link-actions" onClick={(e) => e.stopPropagation()}>
      <div className="dcard-actions">
        {listingUrl && (
          <a
            href={listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="dcard-action-btn"
            title="Open listing"
          >
            <svg width="13" height="13" viewBox="-0.5 -0.5 14 14" fill="none" aria-hidden="true">
              <path d="M4.5 2H2.5A1 1 0 001.5 3.5v7A1 1 0 002.5 11.5h7a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M7 1.5h4.5V6M11 2L5.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Listing
          </a>
        )}
        {(isRefreshable(home) || canRefreshPhoto) && onRefresh && (
          <button
            type="button"
            className={`dcard-action-btn${refreshing ? ' dcard-action-btn--loading' : ''}`}
            title={canRefreshPhoto ? 'Fetch Street View photo' : 'Refresh listing data'}
            disabled={refreshing}
            onClick={() => void onRefresh(home)}
          >
            {/* Two-arrow sync icon */}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M13.5 2.5A6.5 6.5 0 0 0 2 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M11.5 2.5h2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2.5 13.5A6.5 6.5 0 0 0 14 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M4.5 13.5h-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {refreshing ? 'Syncing…' : canRefreshPhoto ? 'Fetch Photo' : 'Sync'}
          </button>
        )}
        {home.propstreamUrl && !showPropInput && (
          <a
            href={home.propstreamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="dcard-action-btn dcard-action-btn--propstream"
            title="Open in PropStream"
          >
            PropStream
          </a>
        )}
        {onUpdateHome && (
          <button
            type="button"
            className="dcard-action-btn dcard-action-btn--add"
            onClick={() => {
              setShowPropInput((v) => !v)
              setPropError(null)
            }}
          >
            {home.propstreamUrl ? 'Edit PropStream' : 'Add PropStream link'}
          </button>
        )}

        {/* AI Prompt copy buttons — hidden until prompt is finalized */}
        {/* <AiPromptButtons home={home} /> */}
      </div>

      {showPropInput && onUpdateHome && (
        <div className="propstream-input-row">
          <input
            type="url"
            className="propstream-input"
            placeholder="https://app.propstream.com/search/…"
            value={propDraft}
            onChange={(e) => { setPropDraft(e.target.value); setPropError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') savePropstream() }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={savePropstream}>Save</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
            setShowPropInput(false)
            setPropDraft(home.propstreamUrl ?? '')
            setPropError(null)
          }}>Cancel</button>
          {home.propstreamUrl && (
            <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={removePropstream}>Remove</button>
          )}
        </div>
      )}
      {propError && <p className="propstream-input-error">{propError}</p>}
    </div>
  )
}

// ── Property summary modal ("back of card") ───────────────────────────────────

type EditTab = 'overview' | 'property' | 'estimate' | 'sow' | 'budget' | 'other-costs'

const EDIT_TABS: { id: EditTab; label: string }[] = [
  { id: 'overview',    label: 'Overview'    },
  { id: 'property',    label: 'Property'    },
  { id: 'estimate',    label: 'Estimate'    },
  { id: 'sow',         label: 'SOW'         },
  { id: 'budget',      label: 'Budget'      },
  { id: 'other-costs', label: 'Other Costs' },
]

function getListingStatusPill(home: HomeFile): { label: string; cls: string } | null {
  const { auctionType } = home.funnel
  if (auctionType === 'bank-owned') return { label: 'Bank owned', cls: 'grey' }
  if (auctionType === 'auction') return { label: 'Foreclosure', cls: 'red' }
  if (MLS_SOURCES.includes(home.source) || home.source === 'mls') {
    return { label: 'Active listing', cls: 'green' }
  }
  if (AUCTION_SOURCES.includes(home.source)) return { label: 'Foreclosure', cls: 'red' }
  return null
}

function PropertySummaryModal({ home, onClose, onStageChange, onDelete, onRefresh, refreshing, onUpdateHome }: {
  home: HomeFile
  onClose: () => void
  onStageChange: (s: FunnelStage) => void
  onDelete: () => void
  onRefresh?: (home: HomeFile) => Promise<void>
  refreshing?: boolean
  onUpdateHome?: (home: HomeFile) => void
}) {
  const [editTab, setEditTab] = useState<EditTab>('overview')

  // Reset to overview whenever a different property is opened
  const prevIdRef = useRef(home.id)
  if (prevIdRef.current !== home.id) {
    prevIdRef.current = home.id
    if (editTab !== 'overview') setEditTab('overview')
  }

  const arvLabel = getArvLabel(home.source)
  const bidLabel = getBidLabel(home.source, home.funnel)
  const funnel = home.funnel
  const { arv, askingPrice } = funnel
  const spread = arv && askingPrice ? arv - askingPrice : null
  const quick = calcBlendedRehab(home)
  const rehabEst = quick.withContingency > 0 ? quick.withContingency : null
  const listingStatusPill = getListingStatusPill(home)
  const customLabel = home.source === 'other' ? home.sourceCustom : undefined
  const p = home.property

  const bathLabel = [
    p.fullBaths ? `${p.fullBaths} full` : null,
    p.halfBaths ? `${p.halfBaths} half` : null,
  ].filter(Boolean).join(', ') || null

  const heroSpecChips: { label: string; cls?: string }[] = []
  if (p.livingArea > 0) heroSpecChips.push({ label: `${p.livingArea.toLocaleString()} SF`, cls: 'grey' })
  if (p.bedrooms > 0) heroSpecChips.push({ label: `${p.bedrooms} bed`, cls: 'grey' })
  if (bathLabel) heroSpecChips.push({ label: bathLabel, cls: 'grey' })
  if (funnel.yearBuilt) heroSpecChips.push({ label: `Built ${funnel.yearBuilt}`, cls: 'grey' })

  const handleChange = (patch: Partial<HomeFile>) => {
    onUpdateHome?.({ ...home, ...patch, updatedAt: new Date().toISOString() })
  }

  // Computed once at modal level — used by both Other Costs tab and the persistent sidebar
  const oc = calcAllInCosts(home)
  const fmt = formatCurrency

  // Increment key whenever any dollar figure changes to trigger the flash animation
  const waterfallFlashKey = useMemo(() => JSON.stringify([
    arv, askingPrice, rehabEst,
    oc.closingTotal, oc.financingTotal, oc.trueNet, oc.cashInvested, oc.roi,
  ]), [arv, askingPrice, rehabEst, oc.closingTotal, oc.financingTotal, oc.trueNet, oc.cashInvested, oc.roi])

  useLockBodyScroll()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="summary-modal summary-modal--mls summary-modal--editing" onClick={(e) => e.stopPropagation()}>

        {/* ── Tab strip (stage picker sits outside the scroll container to avoid overflow clipping) ── */}
        <div className="modal-tab-strip-wrap">
          <div className="modal-tab-strip">
            {EDIT_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`modal-tab${editTab === t.id ? ' modal-tab--active' : ''}`}
                onClick={() => setEditTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="modal-tab-strip-stage">
            <StagePicker stage={home.stage} onChange={onStageChange} />
          </div>
        </div>

        {/* ── Mobile-only compact header (sidebar is hidden on mobile) ── */}
        <div className="modal-mobile-header">
          <div className="modal-mobile-header-top">
            <div className="modal-mobile-header-info">
              <div className="dwf-address-row">
                <h2 className="dwf-address">{home.address}</h2>
                {listingStatusPill && (
                  <span className={`screen-chip listing-status-chip ${listingStatusPill.cls}`}>
                    {listingStatusPill.label}
                  </span>
                )}
              </div>
              <p className="dwf-city">{[home.city, home.state, home.zip].filter(Boolean).join(', ')}</p>
              {heroSpecChips.length > 0 && (
                <div className="dwf-spec-chips">
                  {heroSpecChips.map((c) => (
                    <span key={c.label} className={`screen-chip ${c.cls ?? 'grey'}`}>{c.label}</span>
                  ))}
                </div>
              )}
              <div className="dwf-meta-row" style={{ marginTop: 4 }}>
                <SourceLogo source={home.source} customLabel={customLabel} size={12} />
                <span>{getSourceLabel(home)}</span>
                <span className="dwf-meta-dot">·</span>
                <span>{formatShortDate(home.createdAt)}</span>
                {home.addedByName && (
                  <>
                    <span className="dwf-meta-dot">·</span>
                    <span>Added by <strong>{home.addedByName}</strong></span>
                  </>
                )}
              </div>
            </div>
            {home.photoUrl && (
              <img className="modal-mobile-thumb" src={home.photoUrl} alt={home.address} />
            )}
          </div>
        </div>

        {/* ── Persistent left sidebar (address + deal waterfall) + tab content ── */}
        <div className="modal-body-with-sidebar">

        {/* Left sidebar: all tabs */}
        <div className="deal-waterfall-sidebar">
          {/* ── Property photo ── */}
          {home.photoUrl ? (
            <div className="dwf-photo">
              <img src={home.photoUrl} alt={home.address} />
            </div>
          ) : (
            <div className="dwf-photo dwf-photo--empty">
              <SourceLogo source={home.source} customLabel={customLabel} size={28} />
            </div>
          )}

          {/* ── Property identity block ── */}
          <div className="dwf-property-block">
            <div className="dwf-address-row">
              <h2 className="dwf-address">{home.address}</h2>
              {listingStatusPill && (
                <span className={`screen-chip listing-status-chip ${listingStatusPill.cls}`}>
                  {listingStatusPill.label}
                </span>
              )}
            </div>
            <p className="dwf-city">{[home.city, home.state, home.zip].filter(Boolean).join(', ')}</p>
            {heroSpecChips.length > 0 && (
              <div className="dwf-spec-chips">
                {heroSpecChips.map((c) => (
                  <span key={c.label} className={`screen-chip ${c.cls ?? 'grey'}`}>{c.label}</span>
                ))}
              </div>
            )}
            <div className="dwf-meta-row">
              <SourceLogo source={home.source} customLabel={customLabel} size={12} />
              <span>{getSourceLabel(home)}</span>
              <span className="dwf-meta-dot">·</span>
              <span>{formatShortDate(home.createdAt)}</span>
            </div>
            {home.addedByName && (
              <div className="dwf-added-by">Added by <strong>{home.addedByName}</strong></div>
            )}
          </div>

          {/* ── Listing links and tags (moved from Overview panel) ── */}
          <div className="dwf-sidebar-meta">
            <SummaryLinkActions
              home={home}
              onRefresh={onRefresh}
              refreshing={refreshing}
              onUpdateHome={onUpdateHome}
            />
            <TagGroups home={home} />
          </div>

          <>
              <div className="dwf-section-divider" />
              <div className="dwf-label">Deal Waterfall</div>
              <div className="dwf-rows" key={waterfallFlashKey}>
                <div className="dwf-row">
                  <span className="dwf-row-label">{arvLabel}</span>
                  <span className="dwf-row-value dwf-row-value--pos">{arv ? fmt(arv) : '—'}</span>
                </div>
                <div className="dwf-row">
                  <span className="dwf-row-label">− {bidLabel}</span>
                  <span className="dwf-row-value">{askingPrice ? fmt(askingPrice) : '—'}</span>
                </div>
                {spread !== null && (
                  <div className="dwf-row">
                    <span className="dwf-row-label">= Gross spread</span>
                    <span className="dwf-row-value dwf-row-value--pos">{fmt(spread)}</span>
                  </div>
                )}
                <div className="dwf-row">
                  <span className="dwf-row-label">− Est. rehab</span>
                  <span className="dwf-row-value">{rehabEst ? fmt(rehabEst) : '—'}</span>
                </div>
                <div className="dwf-row">
                  <span className="dwf-row-label">− Transaction costs</span>
                  <span className="dwf-row-value">{(askingPrice || arv) ? fmt(oc.closingTotal) : '—'}</span>
                </div>
                {oc.costs.loanType !== 'cash' && (
                  <div className="dwf-row">
                    <span className="dwf-row-label">− Financing ({oc.costs.loanType.toUpperCase()})</span>
                    <span className="dwf-row-value">{askingPrice ? fmt(oc.financingTotal) : '—'}</span>
                  </div>
                )}
              </div>

              <div className="dwf-divider" />

              <div className="dwf-net-row" key={`net-${waterfallFlashKey}`}>
                <span className="dwf-net-label">True net profit</span>
                <span className={`dwf-net-value${oc.trueNet !== null && oc.trueNet >= 0 ? ' dwf-net-value--pos' : ' dwf-net-value--neg'}`}>
                  {oc.trueNet !== null ? fmt(oc.trueNet) : '—'}
                </span>
              </div>

              <div className="dwf-stats" key={`stats-${waterfallFlashKey}`}>
                <div className="dwf-stat">
                  <span className="dwf-stat-label">Cash invested</span>
                  <span className="dwf-stat-value">{(askingPrice || arv) ? fmt(oc.cashInvested) : '—'}</span>
                </div>
                <div className="dwf-stat">
                  <span className="dwf-stat-label">Cash-on-cash</span>
                  <span className={`dwf-stat-value${oc.roi !== null ? ' dwf-stat-value--roi' : ''}`}>
                    {oc.roi !== null ? `${(oc.roi * 100).toFixed(0)}%` : '—'}
                    {oc.annualizedRoi !== null && <span className="dwf-stat-annual"> · {(oc.annualizedRoi * 100).toFixed(0)}%/yr</span>}
                  </span>
                </div>
              </div>
          </>
        </div>

        <div className={`modal-tab-body${editTab === 'overview' ? ' modal-tab-body--overview' : ''}`}>

          {editTab === 'overview' && (
            <div className="ov-layout">
              {home.source === 'auction.com' && (
                <div className="ov-auction-row">
                  <AuctionCountdown home={home} compact />
                </div>
              )}
              {onUpdateHome && (
                <div className="modal-edit-panel modal-edit-panel--screen ov-screen-panel">
                  <FunnelDetails
                    home={home}
                    onChange={(patch) => handleChange(patch)}
                  />
                </div>
              )}
            </div>
          )}

          {editTab === 'property' && onUpdateHome && (
            <div className="modal-edit-panel modal-edit-panel--property">
              <PropertyInputsView
                home={home}
                onChange={(property: PropertyInputsType) => handleChange({ property })}
              />
            </div>
          )}

          {editTab === 'estimate' && onUpdateHome && (
            <div className="modal-edit-panel modal-edit-panel--estimate">
              <QuickEstimate
                home={home}
                onChange={(quickEstimate: QuickSystem[]) => handleChange({ quickEstimate })}
              />
            </div>
          )}

          {editTab === 'sow' && onUpdateHome && (
            <div className="modal-edit-panel modal-edit-panel--sow">
              <ScopeOfWork
                home={home}
                onChange={(patch) => handleChange(patch)}
                compact
              />
            </div>
          )}

          {editTab === 'budget' && (
            <div className="modal-edit-panel modal-edit-panel--budget">
              <BudgetSummary home={home} />
            </div>
          )}

          {editTab === 'other-costs' && (() => {
            const c = oc.costs

            const patchCosts = (patch: Partial<typeof c>) =>
              handleChange({ dealCosts: { ...home.dealCosts, ...patch } })
            const pctInput = (
              value: number,
              onChange: (v: number) => void,
              step = 0.1,
            ) => (
              <input
                type="number"
                className="ocost-pct-input"
                value={(value * 100).toFixed(step < 0.1 ? 2 : 1)}
                step={step}
                min={0}
                max={100}
                onChange={(e) => onChange(parseFloat(e.target.value || '0') / 100)}
              />
            )
            const numInput = (
              value: number,
              onChange: (v: number) => void,
              min = 0,
              max = 999,
            ) => (
              <input
                type="number"
                className="ocost-pct-input ocost-num-input"
                value={value}
                step={1}
                min={min}
                max={max}
                onChange={(e) => onChange(parseInt(e.target.value || '0', 10))}
              />
            )

            const loanTypes: { id: typeof c.loanType; label: string }[] = [
              { id: 'hml',          label: 'Hard Money' },
              { id: 'heloc',        label: 'HELOC'       },
              { id: 'conventional', label: 'Conventional'},
              { id: 'cash',         label: 'Cash'        },
            ]

            return (
              <div className="modal-edit-panel other-costs-panel other-costs-panel--2col">

                {/* ── Financing ── */}
                <div className="ocost-section ocost-section--financing">
                  <div className="ocost-section-header">
                    <span className="ocost-section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                        <line x1="12" y1="12" x2="12" y2="16"/>
                        <line x1="10" y1="14" x2="14" y2="14"/>
                      </svg>
                    </span>
                    <div className="ocost-section-header-text">
                      <div className="ocost-section-title">Financing</div>
                      <div className="ocost-section-sub">Loan type, points &amp; interest carry</div>
                    </div>
                  </div>

                  {/* Loan type toggle */}
                  <div className="ocost-loan-types">
                    {loanTypes.map((lt) => (
                      <button
                        key={lt.id}
                        type="button"
                        className={`ocost-loan-btn${c.loanType === lt.id ? ' ocost-loan-btn--active' : ''}`}
                        onClick={() => patchCosts({ loanType: lt.id })}
                      >
                        {lt.label}
                      </button>
                    ))}
                  </div>

                  {c.loanType !== 'cash' && (() => {
                    const basisLabel =
                      c.loanBasis === 'purchase'       ? '% of purchase' :
                      c.loanBasis === 'purchase-rehab' ? '% of purch.+rehab' :
                      '% of ARV'
                    const loanBases: { id: typeof c.loanBasis; label: string }[] = [
                      { id: 'purchase',       label: 'Purchase' },
                      { id: 'purchase-rehab', label: 'Purch. + Rehab' },
                      { id: 'arv',            label: 'ARV' },
                    ]
                    return (
                    <div className="ocost-fields">
                      {/* Loan basis selector */}
                      <div className="ocost-field-row ocost-field-row--basis">
                        <span className="ocost-field-label">Loan sized on</span>
                        <div className="ocost-basis-toggle">
                          {loanBases.map((lb) => (
                            <button
                              key={lb.id}
                              type="button"
                              className={`ocost-basis-btn${c.loanBasis === lb.id ? ' ocost-basis-btn--active' : ''}`}
                              onClick={() => patchCosts({ loanBasis: lb.id })}
                            >
                              {lb.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="ocost-field-row">
                        <span className="ocost-field-label">
                          {c.loanBasis === 'purchase-rehab' ? 'Loan to cost (LTC)' : 'Loan to value (LTV)'}
                        </span>
                        <span className="ocost-field-inputs">
                          {pctInput(c.loanAmountPct, (v) => patchCosts({ loanAmountPct: v }))}
                          <span className="ocost-field-unit">{basisLabel}</span>
                        </span>
                      </div>
                      <div className="ocost-field-row">
                        <span className="ocost-field-label">Max loan (ARV cap)</span>
                        <span className="ocost-field-inputs">
                          {pctInput(c.arvCapPct, (v) => patchCosts({ arvCapPct: v }))}
                          <span className="ocost-field-unit">% of ARV</span>
                        </span>
                      </div>
                      <div className="ocost-field-row ocost-field-row--derived">
                        <span className="ocost-field-label">
                          Loan amount
                          {oc.loanCappedByArv && <span className="ocost-cap-flag" title="Reduced by the ARV cap">ARV-capped</span>}
                        </span>
                        <span className="ocost-field-result ocost-field-result--total">{(askingPrice || arv) ? fmt(oc.loanAmount) : '—'}</span>
                      </div>
                      {c.loanType === 'hml' && (
                        <div className="ocost-field-row">
                          <span className="ocost-field-label">Points (origination)</span>
                          <span className="ocost-field-inputs">
                            {pctInput(c.pointsPct, (v) => patchCosts({ pointsPct: v }), 0.25)}
                            <span className="ocost-field-unit">% of loan</span>
                            {(askingPrice || arv) ? <span className="ocost-field-result">{fmt(oc.points)}</span> : null}
                          </span>
                        </div>
                      )}
                      <div className="ocost-field-row">
                        <span className="ocost-field-label">Interest rate</span>
                        <span className="ocost-field-inputs">
                          {pctInput(c.interestRatePct, (v) => patchCosts({ interestRatePct: v }), 0.25)}
                          <span className="ocost-field-unit">% / yr</span>
                        </span>
                      </div>
                      <div className="ocost-field-row">
                        <span className="ocost-field-label">Hold period</span>
                        <span className="ocost-field-inputs">
                          {numInput(c.holdMonths, (v) => patchCosts({ holdMonths: v }), 1, 36)}
                          <span className="ocost-field-unit">months</span>
                          {(askingPrice || arv) ? <span className="ocost-field-result ocost-field-result--carry">{fmt(oc.interestCarry)}</span> : null}
                        </span>
                      </div>
                      <div className="ocost-field-row ocost-field-row--total">
                        <span className="ocost-field-label">Financing total</span>
                        <span className="ocost-field-result ocost-field-result--total">{(askingPrice || arv) ? fmt(oc.financingTotal) : '—'}</span>
                      </div>
                    </div>
                    )
                  })()}
                  {c.loanType === 'cash' && (
                    <div className="ocost-fields">
                      <div className="ocost-field-row ocost-field-row--total">
                        <span className="ocost-field-label">Financing total</span>
                        <span className="ocost-field-result ocost-field-result--total">$0</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Transaction & Holding Costs ── */}
                <div className="ocost-section ocost-section--transaction">
                  <div className="ocost-section-header">
                    <span className="ocost-section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                    </span>
                    <div className="ocost-section-header-text">
                      <div className="ocost-section-title">Transaction &amp; Holding</div>
                      <div className="ocost-section-sub">Closing, agent commissions &amp; carry</div>
                    </div>
                  </div>
                  <div className="ocost-fields">
                    <div className="ocost-field-row">
                      <span className="ocost-field-label">Buy-side closing</span>
                      <span className="ocost-field-inputs">
                        {pctInput(c.buySideClosingPct, (v) => patchCosts({ buySideClosingPct: v }))}
                        <span className="ocost-field-unit">% of ask</span>
                        {askingPrice ? <span className="ocost-field-result">{fmt(oc.buySideClosing)}</span> : null}
                      </span>
                    </div>
                    <div className="ocost-field-row">
                      <span className="ocost-field-label">Agent commission</span>
                      <span className="ocost-field-inputs">
                        {pctInput(c.agentCommissionPct, (v) => patchCosts({ agentCommissionPct: v }))}
                        <span className="ocost-field-unit">% of ARV</span>
                        {arv ? <span className="ocost-field-result">{fmt(oc.agentCommission)}</span> : null}
                      </span>
                    </div>
                    <div className="ocost-field-row">
                      <span className="ocost-field-label">Sell-side closing</span>
                      <span className="ocost-field-inputs">
                        {pctInput(c.sellSideClosingPct, (v) => patchCosts({ sellSideClosingPct: v }))}
                        <span className="ocost-field-unit">% of ARV</span>
                        {arv ? <span className="ocost-field-result">{fmt(oc.sellSideClosing)}</span> : null}
                      </span>
                    </div>
                    <div className="ocost-field-row">
                      <span className="ocost-field-label">Holding (tax, ins.) — {c.holdMonths}mo</span>
                      <span className="ocost-field-inputs">
                        {pctInput(c.holdingAnnualPct, (v) => patchCosts({ holdingAnnualPct: v }))}
                        <span className="ocost-field-unit">% / yr</span>
                        {arv ? <span className="ocost-field-result">{fmt(oc.holdingCosts)}</span> : null}
                      </span>
                    </div>
                    <div className="ocost-field-row ocost-field-row--total">
                      <span className="ocost-field-label">Transaction total</span>
                      <span className="ocost-field-result ocost-field-result--total">{(askingPrice || arv) ? fmt(oc.closingTotal) : '—'}</span>
                    </div>
                  </div>
                </div>

              </div>
            )
          })()}

        </div>{/* end modal-tab-body */}

        </div>{/* end modal-body-with-sidebar */}

        {/* ── Mobile-only sticky deal bar (always visible, above footer) ── */}
        <div className="modal-mobile-deal-bar">
          {arv && (
            <div className="mmdb-item">
              <span className="mmdb-label">{arvLabel}</span>
              <span className="mmdb-value">{fmt(arv)}</span>
            </div>
          )}
          {askingPrice && (
            <div className="mmdb-item">
              <span className="mmdb-label">{bidLabel}</span>
              <span className="mmdb-value">{fmt(askingPrice)}</span>
            </div>
          )}
          <div className="mmdb-item mmdb-item--net">
            <span className="mmdb-label">True Net</span>
            <span className={`mmdb-value${oc.trueNet !== null && oc.trueNet >= 0 ? ' mmdb-value--pos' : ' mmdb-value--neg'}`}>
              {oc.trueNet !== null ? fmt(oc.trueNet) : '—'}
            </span>
          </div>
          {oc.roi !== null && (
            <div className="mmdb-item">
              <span className="mmdb-label">CoC</span>
              <span className="mmdb-value mmdb-value--pos">{(oc.roi * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="summary-actions">
          <button type="button" className="btn btn-ghost btn-danger btn-sm" onClick={onDelete}>Delete</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {editTab !== 'overview' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditTab('overview')}>
                ← Overview
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Deal card (compact, data-rich) ────────────────────────────────────────────

function DealsListHeader({ arvLabel, bidLabel }: { arvLabel: string; bidLabel: string }) {
  return (
    <div className="deals-list-header" aria-hidden="true">
      <span className="deals-list-col deals-list-col--photo" />
      <span className="deals-list-col deals-list-col--addr">Address</span>
      <span className="deals-list-col deals-list-col--fin deals-list-col--arv">{arvLabel}</span>
      <span className="deals-list-col deals-list-col--fin deals-list-col--ask">{bidLabel}</span>
      <span className="deals-list-col deals-list-col--fin deals-list-col--rehab">All-in Cost</span>
      <span className="deals-list-col deals-list-col--fin deals-list-col--net">True Net</span>
      <span className="deals-list-col deals-list-col--go" />
    </div>
  )
}

function DealCard({
  home,
  analysis,
  onSummary,
  streetViewStatus,
  layout = 'grid',
}: {
  home: HomeFile
  analysis: DealAnalysis
  onSummary: () => void
  streetViewStatus?: Record<string, 'fetching' | 'failed'>
  layout?: 'grid' | 'list'
}) {
  const [flipping, setFlipping] = useState(false)
  const arvLabel = getArvLabel(home.source)
  const bidLabel = getBidLabel(home.source, home.funnel)
  const customLabel = home.source === 'other' ? home.sourceCustom : undefined
  const photoPending = !home.photoUrl
  const photoFetchStatus = streetViewStatus?.[home.id]

  const actionBg: Record<string, string> = {
    'calculate-arv':    '#eff6ff',
    'estimate-rehab':   '#faf5ff',
    'check-title':      '#f1f5f9',
    'verify-occupancy': '#eef2f8',
    'submit-offer':     '#f0fdf4',
    'review-deal':      '#f8fafc',
    'monitor':          '#f8fafc',
    'pass':             '#fef2f2',
  }
  const actionColor: Record<string, string> = {
    'calculate-arv':    '#2563eb',
    'estimate-rehab':   '#7c3aed',
    'check-title':      '#475569',
    'verify-occupancy': '#1e293b',
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

  // Grid card: show net margin (spread − rehab) when we have rehab numbers; raw spread otherwise
  const displayProfit = analysis.netMargin !== null
    ? { raw: analysis.netMargin, label: 'Net' }
    : analysis.spread !== null
    ? { raw: analysis.spread, label: 'Spread' }
    : null

  if (layout === 'list') {
    const netColor = analysis.netMargin !== null
      ? analysis.netMargin > 75_000 ? 'var(--success)' : analysis.netMargin > 25_000 ? 'var(--warning)' : 'var(--danger)'
      : analysis.spread !== null
      ? analysis.spread > 75_000 ? 'var(--success)' : analysis.spread > 25_000 ? 'var(--warning)' : 'var(--danger)'
      : 'var(--text-muted)'
    const netVal = analysis.netMargin ?? analysis.spread
    return (
      <div
        className={`dcard dcard--list-row${flipping ? ' dcard--flip' : ''}`}
        onClick={handleClick}
      >
        <div className={`dcard-list-thumb${photoPending ? ' dcard-list-thumb--pending' : ''}`}>
          {home.photoUrl ? (
            <img src={home.photoUrl} alt="" loading="lazy" />
          ) : photoPending && photoFetchStatus === 'fetching' ? (
            <span className="dcard-list-thumb-skeleton" aria-hidden="true" />
          ) : (
            <span className="dcard-list-thumb-empty" aria-hidden="true">🏠</span>
          )}
          <span className="dcard-list-source">
            <SourceLogo source={home.source} customLabel={customLabel} size={12} />
          </span>
        </div>
        <div className="dcard-list-addr">
          <span className="dcard-list-street">
            {home.address}
            {analysis.isThinMargin && <span className="dcard-list-warn" title="Thin margin">!</span>}
          </span>
          <span className="dcard-list-city">
            {[home.city, home.state].filter(Boolean).join(', ') || 'No location'}
          </span>
        </div>
        {/* ARV */}
        <div className="dcard-list-fin dcard-list-fin--arv">
          {home.funnel.arv ? formatCurrency(home.funnel.arv) : <span className="dcard-list-dash">—</span>}
        </div>
        {/* Ask / Starting Bid */}
        <div className="dcard-list-fin dcard-list-fin--ask">
          {home.funnel.askingPrice ? formatCurrency(home.funnel.askingPrice) : <span className="dcard-list-dash">—</span>}
        </div>
        {/* All-in cost (rehab + transaction costs + financing) */}
        <div className="dcard-list-fin dcard-list-fin--rehab">
          {analysis.rehabPlusCosts !== null
            ? <span style={{ color: 'var(--warning)' }}>{formatCurrency(analysis.rehabPlusCosts + (analysis.financingCost ?? 0))}</span>
            : <span className="dcard-list-dash">—</span>}
        </div>
        {/* True net */}
        <div className="dcard-list-fin dcard-list-fin--net">
          {netVal !== null ? <span style={{ color: netColor, fontWeight: 700 }}>{formatCurrency(netVal)}</span> : <span className="dcard-list-dash">—</span>}
        </div>
        <svg className="dcard-list-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M3 2.5 6.5 5 3 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  return (
    <div
      className={`dcard${flipping ? ' dcard--flip' : ''}`}
      onClick={handleClick}
    >
      {/* Photo / no-photo header */}
      {home.photoUrl || photoPending ? (
        <div className={`dcard-photo${photoPending ? ' dcard-photo--pending' : ''}`}>
          {home.photoUrl ? (
            <img src={home.photoUrl} alt={home.address} loading="lazy" />
          ) : (
            <div className="dcard-photo-skeleton" aria-hidden="true" />
          )}
          <div className="dcard-photo-overlay">
            <SourceLogo source={home.source} customLabel={customLabel} size={26} />
          </div>
          {photoPending && photoFetchStatus === 'fetching' && (
            <div className="dcard-photo-loading" aria-label="Loading street view photo">
              <span className="dcard-photo-spinner" />
            </div>
          )}
          {photoPending && photoFetchStatus === 'failed' && (
            <div className="dcard-photo-loading dcard-photo-loading--failed" aria-label="Street view photo unavailable">
              <span>No photo</span>
            </div>
          )}
        </div>
      ) : (
        <div className="dcard-no-photo">
          <SourceLogo source={home.source} customLabel={customLabel} size={26} />
        </div>
      )}

      {/* Body */}
      <div className="dcard-body">

        {/* Address + auction mini badge */}
        <div className="dcard-addr-row">
          <div className="dcard-address">
            <div className="dcard-street">{home.address}</div>
            <div className="dcard-city">{[home.city, home.state].filter(Boolean).join(', ') || <em>No location</em>}</div>
          </div>
          {home.source === 'auction.com' && (
            <AuctionCountdown home={home} mini />
          )}
        </div>

        {analysis.isThinMargin && <span className="dcard-warn-chip">Thin Margin</span>}

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
            {analysis.rehabPlusCosts !== null && (
              <div className="dcard-fin-row">
                <span className="dcard-fin-label">Rehab + Costs</span>
                <span className="dcard-fin-value" style={{ color: 'var(--warning)' }}>{formatCurrency(analysis.rehabPlusCosts)}</span>
              </div>
            )}
            {(analysis.financingCost ?? 0) > 0 && (
              <div className="dcard-fin-row">
                <span className="dcard-fin-label">Financing</span>
                <span className="dcard-fin-value" style={{ color: 'var(--warning)' }}>{formatCurrency(analysis.financingCost!)}</span>
              </div>
            )}
            {displayProfit !== null && (
              <div className={`dcard-fin-row${analysis.rehabPlusCosts !== null ? ' dcard-fin-row--net' : ''}`}>
                <span className="dcard-fin-label">{displayProfit.label}</span>
                <span
                  className="dcard-fin-value"
                  style={{
                    color: displayProfit.raw > 75_000 ? 'var(--success)'
                      : displayProfit.raw > 25_000 ? 'var(--warning)' : 'var(--danger)',
                    fontWeight: 700,
                  }}
                >
                  {formatCurrency(displayProfit.raw)}
                </span>
              </div>
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
          <span className="dcard-action-text">{analysis.nextAction}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="dcard-action-arrow">
            <path d="M2.5 6h7m0 0L6.5 3m3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

      </div>
    </div>
  )
}

// ── Action group section ──────────────────────────────────────────────────────

// ── Command bar ───────────────────────────────────────────────────────────────

function CommandBar({
  search, setSearch,
  sourceFilter, setSourceFilter,
  sortBy, setSortBy,
  viewMode, setViewMode,
  cardLayout, setCardLayout,
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
  cardLayout: 'grid' | 'list'
  setCardLayout: (v: 'grid' | 'list') => void
  totalShown: number
  onAdd: () => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const openSearch = () => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 30)
  }
  const closeSearch = () => {
    setSearchOpen(false)
    setSearch('')
  }

  return (
    <div className="cmd-bar">
      {/* Mobile: collapsible search row */}
      {searchOpen && (
        <div className="cmd-bar-search-row">
          <div className="cmd-bar-search cmd-bar-search--open">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search address, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="cmd-search-input"
            />
            <button className="cmd-search-clear" onClick={closeSearch} aria-label="Close search">✕</button>
          </div>
        </div>
      )}

      <div className="cmd-bar-main">
        <div className="cmd-bar-filters">
          {/* Desktop: always-visible inline search */}
          <div className="cmd-bar-search cmd-bar-search--inline">
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

          {/* Mobile: search icon toggle */}
          <button
            type="button"
            className={`cmd-search-icon-btn${(searchOpen || search) ? ' cmd-search-icon-btn--active' : ''}`}
            onClick={searchOpen ? closeSearch : openSearch}
            aria-label="Search"
          >
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          <FilterPill
            value={sourceFilter}
            options={SOURCE_PILL_OPTIONS}
            onChange={(v) => setSourceFilter(v as PropertySource | 'all')}
          />

          <FilterPill
            value={sortBy}
            options={SORT_PILL_OPTIONS}
            prefix="Sort:"
            onChange={(v) => setSortBy(v as SortOption)}
          />

          <div className="cmd-bar-right cmd-bar-right--mobile">
            <button className="cmd-add-icon-btn btn btn-primary" onClick={onAdd} aria-label="Add property" title="Add property">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="cmd-bar-controls">
          <div className="cmd-sep" aria-hidden="true" />

          <div className="cmd-view-toggle">
            <button
              type="button"
              className={`cmd-view-btn${viewMode === 'on-market' ? ' cmd-view-btn--active' : ''}`}
              onClick={() => setViewMode('on-market')}
              title="Show on-market listings (MLS, auction, etc.)"
            >
              On-Market
            </button>
            <button
              type="button"
              className={`cmd-view-btn${viewMode === 'off-market' ? ' cmd-view-btn--active' : ''}`}
              onClick={() => setViewMode('off-market')}
              title="Show off-market leads (D4D, wholesale, direct mail, etc.)"
            >
              Off-Market
            </button>
          </div>

          <div className="pipeline-view-layout-toggle cmd-layout-toggle">
            <button
              className={`pvlt-btn${cardLayout === 'grid' ? ' pvlt-btn--active' : ''}`}
              onClick={() => setCardLayout('grid')}
              title="Grid view"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="6" height="6" rx="1" fill="currentColor"/><rect x="8" y="0" width="6" height="6" rx="1" fill="currentColor"/><rect x="0" y="8" width="6" height="6" rx="1" fill="currentColor"/><rect x="8" y="8" width="6" height="6" rx="1" fill="currentColor"/></svg>
            </button>
            <button
              className={`pvlt-btn${cardLayout === 'list' ? ' pvlt-btn--active' : ''}`}
              onClick={() => setCardLayout('list')}
              title="List view"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="0" y="1" width="14" height="2" rx="1" fill="currentColor"/><rect x="0" y="6" width="14" height="2" rx="1" fill="currentColor"/><rect x="0" y="11" width="14" height="2" rx="1" fill="currentColor"/></svg>
            </button>
          </div>

          <div className="cmd-bar-right cmd-bar-right--desktop">
            <span className="cmd-count">{totalShown} shown</span>
            <button className="btn btn-primary btn-sm" onClick={onAdd}>+ Add Property</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionGroupSection({
  groupKey,
  homes,
  analyses,
  onSummary,
  streetViewStatus,
  cardLayout,
}: {
  groupKey: ActionGroupKey
  homes: HomeFile[]
  analyses: Map<string, DealAnalysis>
  onSummary: (h: HomeFile) => void
  streetViewStatus?: Record<string, 'fetching' | 'failed'>
  cardLayout: 'grid' | 'list'
}) {
  if (homes.length === 0) return null
  const meta = ACTION_GROUP_META[groupKey]

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
      <div className={`deals-list-wrap${cardLayout === 'list' ? ' deals-list-wrap--active' : ''}`}>
        {cardLayout === 'list' && (
          <DealsListHeader
            arvLabel={homes[0] ? getArvLabel(homes[0].source) : 'ARV'}
            bidLabel={homes[0] ? getBidLabel(homes[0].source, homes[0].funnel) : 'Ask'}
          />
        )}
        <div className={`deals-grid${cardLayout === 'list' ? ' deals-grid--list' : ''}`}>
          {homes.map((h) => (
            <DealCard
              key={h.id}
              home={h}
              analysis={analyses.get(h.id)!}
              onSummary={() => onSummary(h)}
              streetViewStatus={streetViewStatus}
              layout={cardLayout}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Auction alert bar (live + starting soon) ──────────────────────────────────

function AuctionAlertBar({ homes, onOpen }: { homes: HomeFile[]; onOpen: (h: HomeFile) => void }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  void tick

  const now = Date.now()

  // Only auction.com homes with a scheduled start
  const auctionHomes = homes.filter(
    (h) => h.source === 'auction.com' && h.funnel.auctionStartAt
  )

  const live: HomeFile[]    = []
  const upcoming: HomeFile[] = []

  for (const h of auctionHomes) {
    const { auctionStartAt, auctionEndAt, auctionFormat } = h.funnel
    const start = new Date(auctionStartAt!).getTime()
    const end = auctionEndAt
      ? new Date(auctionEndAt).getTime()
      : start + (auctionFormat === 'in-person' ? 2 : 48) * 3600_000

    if (now >= start && now < end) {
      live.push(h)
    } else if (now < start) {
      upcoming.push(h)
    }
  }

  // Sort upcoming by start time ascending
  upcoming.sort((a, b) =>
    new Date(a.funnel.auctionStartAt!).getTime() - new Date(b.funnel.auctionStartAt!).getTime()
  )

  if (live.length === 0 && upcoming.length === 0) return null

  const fmtCountdown = (startAt: string, endAt: string | null, format: string | null, isLive: boolean) => {
    const state = getAuctionCountdown(startAt, endAt, format as 'online' | 'in-person' | null)
    if (!state) return '—'
    return isLive ? `Ends in ${state.countdown}` : `Starts in ${state.countdown}`
  }

  return (
    <section className="auction-alert-bar">
      {live.length > 0 && (
        <div className="aab-group aab-group--live">
          <div className="aab-group-label">
            <span className="aab-pulse" />
            Live Now
          </div>
          <div className="aab-cards">
            {live.map((h) => (
              <button key={h.id} type="button" className="aab-card aab-card--live" onClick={() => onOpen(h)}>
                <span className="aab-addr">{h.address}</span>
                <span className="aab-city">{[h.city, h.state].filter(Boolean).join(', ')}</span>
                <span className="aab-countdown">
                  {fmtCountdown(h.funnel.auctionStartAt!, h.funnel.auctionEndAt, h.funnel.auctionFormat, true)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="aab-group aab-group--upcoming">
          <div className="aab-group-label">AUCTIONS</div>
          <div className="aab-cards">
            {upcoming.slice(0, 5).map((h) => (
              <button key={h.id} type="button" className="aab-card aab-card--upcoming" onClick={() => onOpen(h)}>
                <span className="aab-addr">{h.address}</span>
                <span className="aab-city">{[h.city, h.state].filter(Boolean).join(', ')}</span>
                <div className="aab-card-footer">
                  <span className="aab-countdown">
                    {fmtCountdown(h.funnel.auctionStartAt!, h.funnel.auctionEndAt, h.funnel.auctionFormat, false)}
                  </span>
                  <SourceLogo source="auction.com" size={14} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// Short labels for compact mobile pipeline strip
const STAGE_SHORT_LABELS: Record<FunnelStage, string> = {
  'lead':             'Leads',
  'arv-calculated':   'ARV',
  'rehab-calculated': 'Est.',
  'solid-candidate':  'Solid',
  'under-contract':   'Contract',
  'rehab':            'Active',
  'listed':           'Listed',
  'sold':             'Sold',
  'passed':           'Pass',
  'auction-ended':    'Ended',
}

// ── Ended Auctions view ───────────────────────────────────────────────────────

function EndedAuctionCard({ home, onOpen }: { home: HomeFile; onOpen: () => void }) {
  const arvLabel   = getArvLabel(home.source)
  const bidLabel   = getBidLabel(home.source, home.funnel)
  const customLabel = home.source === 'other' ? home.sourceCustom : undefined
  const { arv, askingPrice, auctionEndAt, auctionStartAt } = home.funnel
  const quick     = calcBlendedRehab(home)
  const rehabEst  = quick.withContingency > 0 ? quick.withContingency : null

  const endDate   = auctionEndAt ?? auctionStartAt
  const endLabel  = endDate
    ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="ended-card" onClick={onOpen}>
      <div className="ended-card-photo">
        {home.photoUrl
          ? <img src={home.photoUrl} alt={home.address} loading="lazy" />
          : <div className="ended-card-no-photo"><SourceLogo source={home.source} customLabel={customLabel} size={22} /></div>
        }
        <span className="ended-card-badge">Ended{endLabel ? ` · ${endLabel}` : ''}</span>
      </div>
      <div className="ended-card-body">
        <div className="ended-card-street">{home.address}</div>
        <div className="ended-card-city">{[home.city, home.state].filter(Boolean).join(', ')}</div>
        {(arv || askingPrice || rehabEst) && (
          <div className="ended-card-fin">
            {arv && <div className="ended-card-fin-row"><span>{arvLabel}</span><span>{formatCurrency(arv)}</span></div>}
            {askingPrice && <div className="ended-card-fin-row"><span>{bidLabel}</span><span>{formatCurrency(askingPrice)}</span></div>}
            {rehabEst && <div className="ended-card-fin-row"><span>Est. Rehab</span><span>{formatCurrency(rehabEst)}</span></div>}
          </div>
        )}
      </div>
    </div>
  )
}

function EndedAuctionsView({
  homes,
  onHideEnded,
  onStageChange,
  onDelete,
  onRefreshHome,
  onUpdateHome,
  refreshingIds,
  handleRefresh,
}: {
  homes: HomeFile[]
  onHideEnded?: () => void
  onStageChange: (id: string, stage: FunnelStage) => void
  onDelete: (id: string) => void
  onRefreshHome?: (home: HomeFile) => Promise<void>
  onUpdateHome?: (home: HomeFile) => void
  refreshingIds: Set<string>
  handleRefresh: (home: HomeFile) => Promise<void>
}) {
  const [summaryHome, setSummaryHome] = useState<HomeFile | null>(null)
  const liveSummaryHome = summaryHome
    ? (homes.find((h) => h.id === summaryHome.id) ?? summaryHome)
    : null

  // Sort by end date descending (most recently ended first)
  const sorted = [...homes].sort((a, b) => {
    const aEnd = a.funnel.auctionEndAt ?? a.funnel.auctionStartAt ?? ''
    const bEnd = b.funnel.auctionEndAt ?? b.funnel.auctionStartAt ?? ''
    return bEnd.localeCompare(aEnd)
  })

  return (
    <div className="ended-view">
      {liveSummaryHome && (
        <PropertySummaryModal
          home={liveSummaryHome}
          onClose={() => setSummaryHome(null)}
          onStageChange={(s) => onStageChange(liveSummaryHome.id, s)}
          onDelete={() => {
            if (confirm(`Delete ${liveSummaryHome.address}?`)) {
              onDelete(liveSummaryHome.id)
              setSummaryHome(null)
            }
          }}
          onRefresh={onRefreshHome ? handleRefresh : undefined}
          refreshing={refreshingIds.has(liveSummaryHome.id)}
          onUpdateHome={onUpdateHome}
        />
      )}

      <div className="ended-header">
        <div className="ended-header-left">
          <button type="button" className="ended-back-btn" onClick={onHideEnded}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Pipeline
          </button>
          <div>
            <h2 className="ended-title">Ended Auctions</h2>
            <p className="ended-sub">{homes.length} {homes.length === 1 ? 'listing' : 'listings'} whose bidding window closed</p>
          </div>
        </div>
      </div>

      {homes.length === 0 ? (
        <div className="ended-empty">No ended auctions yet.</div>
      ) : (
        <div className="ended-grid">
          {sorted.map((home) => (
            <EndedAuctionCard key={home.id} home={home} onOpen={() => setSummaryHome(home)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main board ────────────────────────────────────────────────────────────────

export function FunnelBoard({ homes, onSelect: _onSelect, onCreate, onStageChange, onDelete, onRefreshHome, onUpdateHome, autoOpenIntake, streetViewStatus, showEnded, onHideEnded }: Props) {
  const [showIntake,    setShowIntake]    = useState(() => autoOpenIntake ?? false)
  const [search,        setSearch]        = useState('')
  const [sourceFilter,  setSourceFilter]  = useState<PropertySource | 'all'>('all')
  const [sortBy,        setSortBy]        = useState<SortOption>('ending-soon')
  const [viewMode,      setViewMode]      = useState<ViewMode>('on-market')
  const [cardLayout,    setCardLayout]    = useState<'grid' | 'list'>('grid')
  const [pipelineStage, setPipelineStage] = useState<FunnelStage>('lead')
  const [summaryHome,   setSummaryHome]   = useState<HomeFile | null>(null)
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set())

  const handleRefresh = async (home: HomeFile) => {
    if (!onRefreshHome || refreshingIds.has(home.id)) return
    setRefreshingIds((prev) => new Set(prev).add(home.id))
    try {
      await onRefreshHome(home)
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev)
        next.delete(home.id)
        return next
      })
    }
  }

  // Compute all analyses
  const analyses = useMemo(() => {
    const map = new Map<string, DealAnalysis>()
    for (const h of homes) map.set(h.id, analyzeDeal(h))
    return map
  }, [homes])


  // Filtered + sorted homes
  const filtered = useMemo(() => {
    let result = homes.filter((h) => {
      // Never show auction-ended in the main board — they live in the Ended view
      if (h.stage === 'auction-ended') return false
      // Text search
      if (search.trim()) {
        const q = search.toLowerCase()
        if (![h.address, h.city, h.state, getSourceLabel(h)].join(' ').toLowerCase().includes(q))
          return false
      }
      // On-market / off-market toggle
      const isOffMarket = OFF_MARKET_SOURCES.includes(h.source)
      if (viewMode === 'on-market'  && isOffMarket) return false
      if (viewMode === 'off-market' && !isOffMarket) return false
      // Source filter
      if (sourceFilter !== 'all' && h.source !== sourceFilter) return false
      return true
    })
    // Sort
    result = [...result].sort((a, b) => {
      const da = analyses.get(a.id)!, db = analyses.get(b.id)!
      if (sortBy === 'spread')  return ((db.netMargin ?? db.spread) ?? -Infinity) - ((da.netMargin ?? da.spread) ?? -Infinity)
      if (sortBy === 'newest')  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sortBy === 'arv')     return (b.funnel.arv ?? 0) - (a.funnel.arv ?? 0)
      if (sortBy === 'ending-soon') {
        const aDeadline = getAuctionDeadlineMs(a.funnel.auctionStartAt, a.funnel.auctionEndAt)
        const bDeadline = getAuctionDeadlineMs(b.funnel.auctionStartAt, b.funnel.auctionEndAt)
        if (aDeadline == null && bDeadline == null) return 0
        if (aDeadline == null) return 1
        if (bDeadline == null) return -1
        return aDeadline - bDeadline
      }
      return 0
    })
    return result
  }, [homes, search, sourceFilter, sortBy, viewMode, analyses])

  // Group all filtered homes by action group
  const actionGroups = useMemo(() => {
    const groups = Object.fromEntries(ACTION_GROUP_ORDER.map((k) => [k, [] as HomeFile[]])) as Record<ActionGroupKey, HomeFile[]>
    for (const h of filtered) {
      const ag = getActionGroup(h, analyses.get(h.id)!)
      groups[ag].push(h)
    }
    return groups
  }, [filtered, analyses])

  const liveSummaryHome = summaryHome
    ? (homes.find((h) => h.id === summaryHome.id) ?? summaryHome)
    : null

  const totalCounts    = useMemo(() => {
    const m = new Map<FunnelStage, number>()
    for (const s of FUNNEL_STAGES) m.set(s.id, homes.filter((h) => h.stage === s.id).length)
    return m
  }, [homes])

  if (showEnded) {
    return (
      <div className="funnel-dashboard">
        <EndedAuctionsView
          homes={homes.filter((h) => h.stage === 'auction-ended')}
          onHideEnded={onHideEnded}
          onStageChange={onStageChange}
          onDelete={onDelete}
          onRefreshHome={onRefreshHome}
          onUpdateHome={onUpdateHome}
          refreshingIds={refreshingIds}
          handleRefresh={handleRefresh}
        />
      </div>
    )
  }

  return (
    <div className="funnel-dashboard">

      {/* ── Summary modal ── */}
      {liveSummaryHome && (
        <PropertySummaryModal
          home={liveSummaryHome}
          onClose={() => setSummaryHome(null)}
          onStageChange={(s) => onStageChange(liveSummaryHome.id, s)}
          onDelete={() => {
            if (confirm(`Delete ${liveSummaryHome.address}?`)) {
              onDelete(liveSummaryHome.id)
              setSummaryHome(null)
            }
          }}
          onRefresh={onRefreshHome ? handleRefresh : undefined}
          refreshing={refreshingIds.has(liveSummaryHome.id)}
          onUpdateHome={onUpdateHome}
        />
      )}

      {/* ── 0. Auction alert bar ── */}
      <AuctionAlertBar homes={homes} onOpen={setSummaryHome} />

      {/* ── 1. Compact pipeline strip ── */}
      <section className="cpipeline">
        {PIPELINE_STAGES.map((stage) => {
          const count  = totalCounts.get(stage.id) ?? 0
          const active = stage.id === pipelineStage
          return (
            <button
              key={stage.id}
              className={`cpipe-stage${active ? ' cpipe-stage--active' : ''}${count > 0 ? ' cpipe-stage--has' : ''}`}
              style={{ '--sc': stage.color } as React.CSSProperties}
              onClick={() => {
                setPipelineStage(stage.id)
              }}
            >
              <span className="cpipe-count">{count}</span>
              <span className="cpipe-label cpipe-label--full">{stage.label}</span>
              <span className="cpipe-label cpipe-label--short">{STAGE_SHORT_LABELS[stage.id]}</span>
            </button>
          )
        })}
      </section>

      {/* ── 2. Command bar ── */}
      <CommandBar
        search={search} setSearch={setSearch}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        sortBy={sortBy} setSortBy={setSortBy}
        viewMode={viewMode} setViewMode={setViewMode}
        cardLayout={cardLayout} setCardLayout={setCardLayout}
        totalShown={filtered.length}
        onAdd={() => setShowIntake(true)}
      />

      {/* ── 3. Property grid grouped by action ── */}
      <div className="pipeline-view">

        {/* Action group sections */}
        {filtered.length === 0 ? (
          <div className="board-empty">
            <p>No {viewMode === 'off-market' ? 'off-market' : 'on-market'} properties match your filters.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowIntake(true)}>+ Add Property</button>
          </div>
        ) : (
          ACTION_GROUP_ORDER.map((gk) => (
            <ActionGroupSection
              key={gk}
              groupKey={gk}
              homes={actionGroups[gk]}
              analyses={analyses}
              onSummary={setSummaryHome}
              streetViewStatus={streetViewStatus}
              cardLayout={cardLayout}
            />
          ))
        )}
      </div>

      {showIntake && (
        <PropertyIntake
          onCancel={() => setShowIntake(false)}
          onSubmit={(data) => { onCreate(data); setShowIntake(false) }}
        />
      )}
    </div>
  )
}
