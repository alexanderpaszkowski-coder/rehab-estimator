import { useState } from 'react'
import type { FunnelScreen, IntakeData, PropertySource, TriState } from '../types'
import { DEFAULT_FUNNEL, PROPERTY_SOURCES } from '../lib/funnel'
import { AddressAutocomplete } from './AddressAutocomplete'
import { scrapeAuctionListing } from '../lib/auctionScraper'

interface Props {
  onSubmit: (data: IntakeData) => void
  onCancel: () => void
}

const STEPS = ['Address', 'Source', 'Links & Notes', 'Screen']

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
      {/* Listing type — early, drives what follows */}
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

      {/* Auction.com estimate price — same data as ARV, different label */}
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>Auction.com estimate price</label>
        <input
          type="number"
          value={funnel.arv ?? ''}
          onChange={(e) => onChange({ arv: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="$0"
        />
      </div>

      {/* Starting bid — same data as askingPrice, different label */}
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

type FetchState = 'idle' | 'loading' | 'success' | 'error'

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
  const [linkInput, setLinkInput] = useState('')
  const [auctionUrl, setAuctionUrl] = useState('')
  const [fetchState, setFetchState] = useState<FetchState>('idle')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetchedFields, setFetchedFields] = useState<string[]>([])
  const [addressBlurred, setAddressBlurred] = useState(false)

  const updateFunnel = (patch: Partial<FunnelScreen>) =>
    setData((d) => ({ ...d, funnel: { ...d.funnel, ...patch } }))

  const handleAuctionFetch = async () => {
    const url = auctionUrl.trim()
    if (!url) return
    setFetchState('loading')
    setFetchError(null)
    setFetchedFields([])
    try {
      const scraped = await scrapeAuctionListing(url)
      const filled: string[] = []

      setData((prev) => {
        const next = { ...prev, source: 'auction.com' as const }

        if (scraped.address) { next.address = scraped.address; filled.push('Address') }
        if (scraped.city) { next.city = scraped.city; filled.push('City') }
        if (scraped.state) next.state = scraped.state
        if (scraped.zip) next.zip = scraped.zip

        next.funnel = { ...prev.funnel }
        if (scraped.estimatePrice) { next.funnel.arv = scraped.estimatePrice; filled.push('Estimate price') }
        if (scraped.openingBid) { next.funnel.askingPrice = scraped.openingBid; filled.push('Starting bid') }
        if (scraped.listingType) { next.funnel.auctionType = scraped.listingType; filled.push('Listing type') }
        if (scraped.startingCreditBid) { next.funnel.startingCreditBid = scraped.startingCreditBid; filled.push('Credit bid') }
        if (scraped.occupancy) { next.funnel.occupancy = scraped.occupancy; filled.push('Occupancy') }
        if (scraped.yearBuilt) { next.funnel.yearBuilt = scraped.yearBuilt; filled.push('Year built') }

        if (!prev.links?.includes(url)) next.links = [...(prev.links ?? []), url]

        return next
      })

      setFetchedFields(filled)
      setFetchState('success')
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch listing')
      setFetchState('error')
    }
  }

  const addLink = () => {
    const trimmed = linkInput.trim()
    if (!trimmed) return
    setData((d) => ({ ...d, links: [...(d.links ?? []), trimmed] }))
    setLinkInput('')
  }

  const removeLink = (i: number) => {
    setData((d) => ({ ...d, links: (d.links ?? []).filter((_, idx) => idx !== i) }))
  }

  const canNext = step === 0 ? (data.address.trim().length > 0 || fetchState === 'success') : true

  // After a URL fetch, skip the source-selection step (source is already set)
  const handleNext = () => {
    if (step === 0 && fetchState === 'success') {
      setStep(2)
    } else {
      setStep(step + 1)
    }
  }

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
          {step === 0 && (
            <div>
              {/* ── Primary: auction.com URL paste ── */}
              <div className="intake-url-section">
                <div className="intake-url-row">
                  <input
                    type="url"
                    autoFocus
                    value={auctionUrl}
                    onChange={(e) => { setAuctionUrl(e.target.value); setFetchState('idle') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAuctionFetch() } }}
                    placeholder="https://www.auction.com/details/…"
                    disabled={fetchState === 'loading'}
                    className="intake-url-input"
                  />
                  <button
                    type="button"
                    className="intake-fetch-btn"
                    onClick={() => void handleAuctionFetch()}
                    disabled={!auctionUrl.trim() || fetchState === 'loading'}
                    title="Fetch listing"
                  >
                    {fetchState === 'loading'
                      ? <span className="intake-spinner" />
                      : (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                          <path d="M3.5 9h11M10 4.5l4.5 4.5L10 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                  </button>
                </div>

                {fetchState === 'success' && fetchedFields.length > 0 && (
                  <div className="auction-autofill-success" style={{ marginTop: 10 }}>
                    <span>✓ Filled: {fetchedFields.join(', ')}</span>
                  </div>
                )}
                {fetchState === 'success' && fetchedFields.length === 0 && (
                  <p className="auction-autofill-error" style={{ marginTop: 10 }}>
                    Fetched, but no data parsed — check the address below and fill manually.
                  </p>
                )}
                {fetchState === 'error' && (
                  <p className="auction-autofill-error" style={{ marginTop: 10 }}>{fetchError}</p>
                )}
              </div>

              {/* ── OR divider ── */}
              <div className="intake-or-divider">
                <span>or enter address manually</span>
              </div>

              {/* ── Secondary: single address input ── */}
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
                <div className="address-pills-row">
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
          )}

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

          {step === 2 && (
            <div>
              <p className="modal-hint">Paste any relevant links — Zillow, Redfin, Google Maps, photos, etc.</p>
              <div className="link-input-row">
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                  placeholder="https://www.zillow.com/homedetails/…"
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={addLink}>Add</button>
              </div>
              {(data.links ?? []).length > 0 && (
                <ul className="link-list">
                  {(data.links ?? []).map((url, i) => (
                    <li key={i}>
                      <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                      <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => removeLink(i)}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="field" style={{ marginTop: 20 }}>
                <label>Quick notes</label>
                <textarea rows={3} value={data.funnel.quickNotes} onChange={(e) => updateFunnel({ quickNotes: e.target.value })} placeholder="Anything notable about this property" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="screen-grid">
              {data.source === 'auction.com' ? (
                <AuctionScreen funnel={data.funnel} onChange={updateFunnel} />
              ) : (
                <StandardScreen funnel={data.funnel} onChange={updateFunnel} />
              )}
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
            <button type="button" className="btn btn-primary" disabled={!canNext} onClick={handleNext}>
              Next →
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => onSubmit(data)}>
              Create Property File
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
