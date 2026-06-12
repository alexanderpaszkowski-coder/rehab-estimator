import { useEffect, useRef, useState } from 'react'
import type { FunnelScreen, IntakeData, PropertySource, TriState } from '../types'
import { DEFAULT_FUNNEL, PROPERTY_SOURCES } from '../lib/funnel'
import { AddressAutocomplete } from './AddressAutocomplete'
import { scrapeAuctionListing } from '../lib/auctionScraper'
import { scrapeListingUrl, detectListingSite } from '../lib/listingScraper'
import { AUCTION_SOURCES, MLS_SOURCES } from '../lib/funnel'

interface Props {
  onSubmit: (data: IntakeData) => void
  onCancel: () => void
}

const STEPS = ['Address', 'Source', 'Screen', 'Notes']

function TriToggle({
  value,
  onChange,
  labels = ['Yes', 'No', 'Unknown'] as [string, string, string],
}: {
  value: TriState
  onChange: (v: TriState) => void
  labels?: [string, string, string]
}) {
  const opts: TriState[] = ['yes', 'no', 'unknown']
  return (
    <div className="condition-pills">
      {opts.map((o, i) => (
        <button
          key={o ?? 'null'}
          type="button"
          className={`condition-pill ${value === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'none'}` : ''}`}
          onClick={() => onChange(value === o ? null : o)}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  )
}

function OccupancyPills({
  value,
  onChange,
}: {
  value: FunnelScreen['occupancy']
  onChange: (v: FunnelScreen['occupancy']) => void
}) {
  return (
    <div className="condition-pills">
      {(['vacant', 'occupied', 'unknown'] as const).map((o) => (
        <button
          key={o}
          type="button"
          className={`condition-pill ${value === o ? 'active-light' : ''}`}
          onClick={() => onChange(value === o ? null : o)}
        >
          {o.charAt(0).toUpperCase() + o.slice(1)}
        </button>
      ))}
    </div>
  )
}

function TargetAreaPills({
  value,
  onChange,
}: {
  value: FunnelScreen['inTargetArea']
  onChange: (v: FunnelScreen['inTargetArea']) => void
}) {
  return (
    <div className="condition-pills">
      {(['yes', 'maybe', 'no'] as const).map((o) => (
        <button
          key={o}
          type="button"
          className={`condition-pill ${value === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'moderate'}` : ''}`}
          onClick={() => onChange(value === o ? null : o)}
        >
          {o.charAt(0).toUpperCase() + o.slice(1)}
        </button>
      ))}
    </div>
  )
}

function RehabLevelPills({
  value,
  onChange,
}: {
  value: FunnelScreen['rehabLevel']
  onChange: (v: FunnelScreen['rehabLevel']) => void
}) {
  return (
    <div className="condition-pills">
      {(['Light', 'Moderate', 'Heavy'] as const).map((o) => (
        <button
          key={o}
          type="button"
          className={`condition-pill ${value === o ? `active-${o === 'Light' ? 'light' : o === 'Moderate' ? 'moderate' : 'heavy'}` : ''}`}
          onClick={() => onChange(value === o ? null : o)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function AuctionScreen({
  funnel,
  onChange,
}: {
  funnel: FunnelScreen
  onChange: (patch: Partial<FunnelScreen>) => void
}) {
  return (
    <>
      <div className="screen-item" style={{ gridColumn: '1 / -1' }}>
        <label>Listing type</label>
        <div className="condition-pills">
          <button
            type="button"
            className={`condition-pill ${funnel.auctionType === 'auction' ? 'active-light' : ''}`}
            onClick={() => onChange({ auctionType: funnel.auctionType === 'auction' ? null : 'auction' })}
          >
            Auction
          </button>
          <button
            type="button"
            className={`condition-pill ${funnel.auctionType === 'bank-owned' ? 'active-light' : ''}`}
            onClick={() => onChange({ auctionType: funnel.auctionType === 'bank-owned' ? null : 'bank-owned', startingCreditBid: null })}
          >
            Bank Owned
          </button>
        </div>

        {funnel.auctionType === 'auction' && (
          <div className="auction-credit-bid">
            <label>Starting credit bid</label>
            <input
              type="number"
              value={funnel.startingCreditBid ?? ''}
              onChange={(e) => onChange({ startingCreditBid: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="$0"
              autoFocus
            />
          </div>
        )}
      </div>

      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>Auction.com estimate price</label>
        <input
          type="number"
          value={funnel.arv ?? ''}
          onChange={(e) => onChange({ arv: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="$0"
        />
      </div>

      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>Starting bid</label>
        <input
          type="number"
          value={funnel.askingPrice ?? ''}
          onChange={(e) => onChange({ askingPrice: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="$0"
        />
      </div>

      <div className="screen-item">
        <label>Occupancy</label>
        <OccupancyPills value={funnel.occupancy} onChange={(v) => onChange({ occupancy: v })} />
      </div>

      <div className="screen-item">
        <label>In your target area?</label>
        <TargetAreaPills value={funnel.inTargetArea} onChange={(v) => onChange({ inTargetArea: v })} />
      </div>

      <div className="screen-item">
        <label>Title clear?</label>
        <TriToggle value={funnel.titleClear} onChange={(v) => onChange({ titleClear: v })} />
      </div>

      <div className="screen-item">
        <label>Rehab level</label>
        <RehabLevelPills value={funnel.rehabLevel} onChange={(v) => onChange({ rehabLevel: v })} />
      </div>

      <div className="field">
        <label>Year built</label>
        <input
          type="number"
          value={funnel.yearBuilt ?? ''}
          onChange={(e) => onChange({ yearBuilt: e.target.value ? parseInt(e.target.value) : null })}
          placeholder="Optional"
        />
      </div>
    </>
  )
}

const ESTIMATE_LABELS: Partial<Record<PropertySource, string>> = {
  'zillow':      'Zestimate',
  'redfin':      'Redfin Estimate',
  'realtor.com': 'Realtor.com Estimate',
  'homes.com':   'Homes.com Estimate',
}

function RealtorScreen({
  funnel,
  onChange,
  source,
}: {
  funnel: FunnelScreen
  onChange: (patch: Partial<FunnelScreen>) => void
  source?: PropertySource
}) {
  const estimateLabel = source ? (ESTIMATE_LABELS[source] ?? 'Estimated Value') : 'Estimated Value'
  return (
    <>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>List Price</label>
        <input
          type="number"
          value={funnel.askingPrice ?? ''}
          onChange={(e) => onChange({ askingPrice: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="$0"
        />
      </div>

      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>{estimateLabel}</label>
        <input
          type="number"
          value={funnel.arv ?? ''}
          onChange={(e) => onChange({ arv: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="$0"
        />
      </div>

      <div className="screen-item">
        <label>Occupancy</label>
        <OccupancyPills value={funnel.occupancy} onChange={(v) => onChange({ occupancy: v })} />
      </div>

      <div className="screen-item">
        <label>In your target area?</label>
        <TargetAreaPills value={funnel.inTargetArea} onChange={(v) => onChange({ inTargetArea: v })} />
      </div>

      <div className="screen-item">
        <label>Title clear?</label>
        <TriToggle value={funnel.titleClear} onChange={(v) => onChange({ titleClear: v })} />
      </div>

      <div className="screen-item">
        <label>Seller motivated?</label>
        <TriToggle value={funnel.sellerMotivated} onChange={(v) => onChange({ sellerMotivated: v })} />
      </div>

      <div className="screen-item">
        <label>Rehab level</label>
        <RehabLevelPills value={funnel.rehabLevel} onChange={(v) => onChange({ rehabLevel: v })} />
      </div>

      <div className="field">
        <label>Year built</label>
        <input
          type="number"
          value={funnel.yearBuilt ?? ''}
          onChange={(e) => onChange({ yearBuilt: e.target.value ? parseInt(e.target.value) : null })}
          placeholder="Optional"
        />
      </div>
    </>
  )
}

function StandardScreen({
  funnel,
  onChange,
}: {
  funnel: FunnelScreen
  onChange: (patch: Partial<FunnelScreen>) => void
}) {
  return (
    <>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>Estimated Value (ARV)</label>
        <input
          type="number"
          value={funnel.arv ?? ''}
          onChange={(e) => onChange({ arv: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="$0"
        />
      </div>

      <div className="screen-item" style={{ gridColumn: '1 / -1' }}>
        <label>Available for sale?</label>
        <TriToggle value={funnel.availableForSale} onChange={(v) => onChange({ availableForSale: v })} />
        {funnel.availableForSale === 'yes' && (
          <input
            type="number"
            style={{ marginTop: 10 }}
            value={funnel.askingPrice ?? ''}
            onChange={(e) => onChange({ askingPrice: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="Asking price"
            autoFocus
          />
        )}
      </div>

      <div className="screen-item">
        <label>In your target area?</label>
        <TargetAreaPills value={funnel.inTargetArea} onChange={(v) => onChange({ inTargetArea: v })} />
      </div>

      <div className="screen-item">
        <label>Title clear?</label>
        <TriToggle value={funnel.titleClear} onChange={(v) => onChange({ titleClear: v })} />
      </div>

      <div className="screen-item">
        <label>Seller motivated?</label>
        <TriToggle value={funnel.sellerMotivated} onChange={(v) => onChange({ sellerMotivated: v })} />
      </div>

      <div className="screen-item">
        <label>Occupancy</label>
        <OccupancyPills value={funnel.occupancy} onChange={(v) => onChange({ occupancy: v })} />
      </div>

      <div className="screen-item">
        <label>Rehab level</label>
        <RehabLevelPills value={funnel.rehabLevel} onChange={(v) => onChange({ rehabLevel: v })} />
      </div>

      <div className="field">
        <label>Year built</label>
        <input
          type="number"
          value={funnel.yearBuilt ?? ''}
          onChange={(e) => onChange({ yearBuilt: e.target.value ? parseInt(e.target.value) : null })}
          placeholder="Optional"
        />
      </div>
    </>
  )
}

export function PropertyIntake({ onSubmit, onCancel }: Props) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<IntakeData>({
    address: '',
    city: '',
    state: '',
    zip: '',
    source: 'mls',
    sourceCustom: '',
    funnel: { ...DEFAULT_FUNNEL },
    links: [],
  })
  const [listingUrl, setListingUrl] = useState('')
  // 'idle' | 'loading' | 'processing' | 'revealing'
  const [fetchPhase, setFetchPhase] = useState<'idle' | 'loading' | 'processing' | 'revealing'>('idle')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [debugSnippet, setDebugSnippet] = useState<string | null>(null)
  const [addressBlurred, setAddressBlurred] = useState(false)
  const [addressAnimated, setAddressAnimated] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up timer on unmount
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  const updateFunnel = (patch: Partial<FunnelScreen>) =>
    setData((d) => ({ ...d, funnel: { ...d.funnel, ...patch } }))

  const handleListingFetch = async () => {
    const url = listingUrl.trim()
    if (!url) return

    // auction.com has its own dedicated scraper
    const isAuction = /auction\.com/i.test(url)
    const listingSite = isAuction ? null : detectListingSite(url)

    if (!isAuction && !listingSite) {
      setFetchError(
        'Auto-import supports: auction.com, realtor.com, zillow, redfin, new western, zenlist, homes.com, homepath, hubzu.'
      )
      return
    }

    setFetchPhase('loading')
    setFetchError(null)
    try {
      let photo: string | undefined
      let addressPatch: { address?: string; city?: string; state?: string; zip?: string } = {}
      let funnelPatch: Partial<FunnelScreen> = {}
      let source: PropertySource

      if (isAuction) {
        source = 'auction.com'
        const scraped = await scrapeAuctionListing(url)
        photo = scraped.photoUrl
        addressPatch = { address: scraped.address, city: scraped.city, state: scraped.state, zip: scraped.zip }
        if (scraped.estimatePrice)     funnelPatch.arv              = scraped.estimatePrice
        if (scraped.openingBid)        funnelPatch.askingPrice      = scraped.openingBid
        if (scraped.listingType)       funnelPatch.auctionType      = scraped.listingType
        if (scraped.startingCreditBid) funnelPatch.startingCreditBid = scraped.startingCreditBid
        if (scraped.occupancy)         funnelPatch.occupancy        = scraped.occupancy
        if (scraped.yearBuilt)         funnelPatch.yearBuilt        = scraped.yearBuilt
      } else {
        const scraped = await scrapeListingUrl(url)
        source = scraped.source
        photo  = scraped.photoUrl
        addressPatch = { address: scraped.address, city: scraped.city, state: scraped.state, zip: scraped.zip }
        if (scraped.listPrice)     funnelPatch.askingPrice = scraped.listPrice
        if (scraped.estimatePrice) funnelPatch.arv         = scraped.estimatePrice
        if (scraped.occupancy)     funnelPatch.occupancy   = scraped.occupancy
        if (scraped.yearBuilt)     funnelPatch.yearBuilt   = scraped.yearBuilt
        if (!scraped.listPrice && !scraped.estimatePrice) {
          setDebugSnippet(scraped.blocked ? 'blocked' : scraped._debug ?? null)
        }
      }

      // Phase 1: processing spinner
      setFetchPhase('processing')

      advanceTimer.current = setTimeout(() => {
        // Phase 2: populate data + animate address in
        if (photo) setPhotoUrl(photo)

        setData((prev) => {
          const next = { ...prev, source }
          if (addressPatch.address) next.address = addressPatch.address
          if (addressPatch.city)    next.city    = addressPatch.city
          if (addressPatch.state)   next.state   = addressPatch.state
          if (addressPatch.zip)     next.zip     = addressPatch.zip
          next.funnel = { ...prev.funnel, ...funnelPatch }
          return next
        })

        setAddressBlurred(true)
        setAddressAnimated(true)
        setFetchPhase('revealing')

        // Phase 3: after address pops in, advance to Screen
        advanceTimer.current = setTimeout(() => setStep(2), 900)
      }, 1500)

    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch listing')
      setFetchPhase('idle')
    }
  }

  const canNext = step === 0
    ? (data.address.trim().length > 0 && fetchPhase !== 'loading' && fetchPhase !== 'processing')
    : true

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>Add Property</h2>
          <button type="button" className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <div className="progress-bar">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`progress-step ${i < step ? 'done' : i === step ? 'current' : ''}`}
              onClick={() => i < step && setStep(i)}
            >
              <div className="progress-dot">{i < step ? '✓' : i + 1}</div>
              <span>{s}</span>
            </div>
          ))}
        </div>

        <div className="modal-body">

          {/* ── Step 0: Address ── */}
          {step === 0 && (
            <div>
              <div className="intake-url-section">

                {/* Processing overlay — shows after fetch completes, before revealing */}
                {fetchPhase === 'processing' ? (
                  <div className="intake-processing">
                    <div className="intake-processing-ring" />
                    <span>Importing property data…</span>
                  </div>
                ) : (
                  <div className="intake-url-row">
                    <input
                      type="url"
                      autoFocus
                      value={listingUrl}
                      onChange={(e) => { setListingUrl(e.target.value); setFetchError(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleListingFetch() } }}
                      placeholder="Paste listing link…"
                      disabled={fetchPhase === 'loading'}
                      className="intake-url-input"
                    />
                    <button
                      type="button"
                      className="intake-fetch-btn"
                      onClick={() => void handleListingFetch()}
                      disabled={!listingUrl.trim() || fetchPhase === 'loading'}
                      title="Fetch listing"
                    >
                      {fetchPhase === 'loading'
                        ? <span className="intake-spinner" />
                        : (
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                            <path d="M3.5 9h11M10 4.5l4.5 4.5L10 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                    </button>
                  </div>
                )}

                {fetchError && (
                  <p className="auction-autofill-error" style={{ marginTop: 8 }}>{fetchError}</p>
                )}
                {debugSnippet && (
                  debugSnippet === 'blocked' ? (
                    <p style={{
                      marginTop: 8,
                      fontSize: '0.78rem',
                      color: 'var(--text-muted)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}>
                      Address imported from URL. Realtor.com blocked price scraping — fill in List Price &amp; Estimate on the next screen.
                    </p>
                  ) : (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        ⚠ Price/estimate not found — tap to see raw page text
                      </summary>
                      <pre style={{
                        fontSize: '0.65rem',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: 10,
                        marginTop: 6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: 200,
                        overflowY: 'auto',
                        color: 'var(--text-muted)',
                      }}>
                        {debugSnippet}
                      </pre>
                    </details>
                  )
                )}
              </div>

              {/* OR divider — hide during processing */}
              {fetchPhase !== 'processing' && (
                <div className="intake-or-divider">
                  <span>or enter address manually</span>
                </div>
              )}

              {/* Address field — animates in when revealed */}
              <div className={addressAnimated ? 'address-reveal' : ''}>
                <AddressAutocomplete
                  value={data.address}
                  onChange={(street) => setData((d) => ({ ...d, address: street }))}
                  onSelect={(fill) => {
                    setData((d) => ({
                      ...d,
                      address: fill.street || d.address,
                      city: fill.city || d.city,
                      state: fill.state || d.state,
                      zip: fill.zip || d.zip,
                    }))
                    setAddressBlurred(true)
                  }}
                  onBlur={() => { if (data.address.trim()) setAddressBlurred(true) }}
                />

                {(addressBlurred || data.city || data.state || data.zip) && (
                  <div className={`address-pills-row ${addressAnimated ? 'pills-reveal' : ''}`}>
                    <input
                      className="address-pill address-pill-city"
                      value={data.city}
                      onChange={(e) => setData((d) => ({ ...d, city: e.target.value }))}
                      placeholder="City"
                    />
                    <input
                      className="address-pill address-pill-state"
                      value={data.state}
                      onChange={(e) => setData((d) => ({ ...d, state: e.target.value }))}
                      placeholder="ST"
                      maxLength={2}
                    />
                    <input
                      className="address-pill address-pill-zip"
                      value={data.zip}
                      onChange={(e) => setData((d) => ({ ...d, zip: e.target.value }))}
                      placeholder="ZIP"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 1: Source ── */}
          {step === 1 && (
            <div>
              <p className="modal-hint">Where did this lead come from?</p>
              <div className="source-grid">
                {PROPERTY_SOURCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`source-card ${data.source === s.id ? 'selected' : ''}`}
                    onClick={() => {
                      setData((d) => ({ ...d, source: s.id as PropertySource }))
                      if (s.id !== 'other') setTimeout(() => setStep(2), 180)
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {data.source === 'other' && (
                <div className="field" style={{ marginTop: 16 }}>
                  <label>Custom source label</label>
                  <input
                    autoFocus
                    value={data.sourceCustom}
                    onChange={(e) => setData({ ...data, sourceCustom: e.target.value })}
                    placeholder="e.g. Facebook group, referral"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Screen ── */}
          {step === 2 && (
            <div className="screen-grid">
              {AUCTION_SOURCES.includes(data.source) ? (
                <AuctionScreen funnel={data.funnel} onChange={updateFunnel} />
              ) : MLS_SOURCES.includes(data.source) ? (
                <RealtorScreen funnel={data.funnel} onChange={updateFunnel} source={data.source} />
              ) : (
                <StandardScreen funnel={data.funnel} onChange={updateFunnel} />
              )}
            </div>
          )}

          {/* ── Step 3: Notes ── */}
          {step === 3 && (
            <div className="field">
              <label>Quick notes</label>
              <textarea
                rows={6}
                autoFocus
                value={data.funnel.quickNotes}
                onChange={(e) => updateFunnel({ quickNotes: e.target.value })}
                placeholder="Anything notable about this property — condition, seller situation, access notes, etc."
              />
            </div>
          )}

        </div>

        <div className="modal-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>← Back</button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next →
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => onSubmit({ ...data, photoUrl })}>
              Create Property File
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
