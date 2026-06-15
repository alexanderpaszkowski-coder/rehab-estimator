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

  const hasLinks = (home.links ?? []).length > 0
  const hasPartnerNotes = !!home.funnel.quickNotes
  const hasSubmission = home.submittedBy === 'partner' && (hasPartnerNotes || hasLinks)

  return (
    <div className="screen-layout">

      {/* ── 1. Screening Questions — primary, top ─────────── */}
      <div className="card screen-questions-card">
        <div className="screen-questions-header">
          <h2>Screening Questions</h2>
          <CopyButton getText={() => copyLeadScreen(home)} />
        </div>

        <div className="screen-grid-compact">
          {home.source === 'auction.com' ? (
            <>
              <div className="screen-item" style={{ gridColumn: '1 / -1' }}>
                <label>Listing type</label>
                <div className="condition-pills">
                  {(['auction', 'bank-owned'] as const).map((o) => (
                    <button key={o} type="button"
                      className={`condition-pill ${home.funnel.auctionType === o ? 'active-light' : ''}`}
                      onClick={() => updateFunnel({
                        auctionType: home.funnel.auctionType === o ? null : o,
                        ...(o === 'bank-owned' ? { startingCreditBid: null } : {}),
                      })}
                    >
                      {o === 'auction' ? 'Auction' : 'Bank Owned'}
                    </button>
                  ))}
                </div>
                {home.funnel.auctionType === 'auction' && (
                  <div className="field" style={{ marginTop: 8 }}>
                    <label>Starting credit bid</label>
                    <input type="number" value={home.funnel.startingCreditBid ?? ''}
                      onChange={(e) => updateFunnel({ startingCreditBid: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="$0" />
                  </div>
                )}
              </div>
              <div className="field">
                <label>Auction.com estimate</label>
                <input type="number" value={home.funnel.arv ?? ''} onChange={(e) => updateFunnel({ arv: e.target.value ? parseFloat(e.target.value) : null })} placeholder="$0" />
              </div>
              <div className="field">
                <label>Starting bid</label>
                <input type="number" value={home.funnel.askingPrice ?? ''} onChange={(e) => updateFunnel({ askingPrice: e.target.value ? parseFloat(e.target.value) : null })} placeholder="$0" />
              </div>
              <div className="field">
                <label>Max offer</label>
                <input type="number" value={home.funnel.maxOffer ?? ''} onChange={(e) => updateFunnel({ maxOffer: e.target.value ? parseFloat(e.target.value) : null })} />
              </div>
            </>
          ) : (
            <>
              <ScreenTri label="Available for sale?" value={home.funnel.availableForSale} onChange={(v) => updateFunnel({ availableForSale: v })} />
              <ScreenTri label="Seller motivated?" value={home.funnel.sellerMotivated} onChange={(v) => updateFunnel({ sellerMotivated: v })} />
              <ScreenTri label="Title clear?" value={home.funnel.titleClear} onChange={(v) => updateFunnel({ titleClear: v })} />
              <div className="screen-item">
                <label>Rehab level</label>
                <div className="condition-pills">
                  {(['Light', 'Moderate', 'Heavy'] as const).map((o) => (
                    <button key={o} type="button"
                      className={`condition-pill ${home.funnel.rehabLevel === o ? `active-${o === 'Light' ? 'light' : o === 'Moderate' ? 'moderate' : 'heavy'}` : ''}`}
                      onClick={() => updateFunnel({ rehabLevel: home.funnel.rehabLevel === o ? null : o })}
                    >{o}</button>
                  ))}
                </div>
              </div>
              <div className="screen-item">
                <label>In target area?</label>
                <div className="condition-pills">
                  {(['yes', 'maybe', 'no'] as const).map((o) => (
                    <button key={o} type="button"
                      className={`condition-pill ${home.funnel.inTargetArea === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'moderate'}` : ''}`}
                      onClick={() => updateFunnel({ inTargetArea: home.funnel.inTargetArea === o ? null : o })}
                    >{o.charAt(0).toUpperCase() + o.slice(1)}</button>
                  ))}
                </div>
              </div>
              <div className="screen-item">
                <label>Occupancy</label>
                <div className="condition-pills">
                  {(['vacant', 'occupied', 'unknown'] as const).map((o) => (
                    <button key={o} type="button"
                      className={`condition-pill ${home.funnel.occupancy === o ? 'active-light' : ''}`}
                      onClick={() => updateFunnel({ occupancy: home.funnel.occupancy === o ? null : o })}
                    >{o.charAt(0).toUpperCase() + o.slice(1)}</button>
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
            </>
          )}

          <div className="field screen-notes-field">
            <label>Quick notes</label>
            <textarea rows={2} value={home.funnel.quickNotes} onChange={(e) => updateFunnel({ quickNotes: e.target.value })} />
          </div>
        </div>
      </div>

      {/* ── 2. Meta strip — source, stage, review ────────── */}
      <div className="screen-meta-strip card">
        <div className="screen-meta-left">
          <div className="field">
            <label>Source</label>
            <select value={home.source} onChange={(e) => onChange({ source: e.target.value as PropertySource })}>
              {PROPERTY_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {home.source === 'other' && (
            <div className="field">
              <label>Custom</label>
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

        <div className="screen-meta-divider" />

        <div className="screen-meta-right">
          <div className="screen-meta-review-row">
            <label>Review status</label>
            <div className="condition-pills">
              {REVIEW_STATUS_OPTIONS.map((opt) => (
                <button key={opt.id} type="button"
                  className={`condition-pill ${home.reviewStatus === opt.id ? opt.activeClass : ''}`}
                  onClick={() => onChange({ reviewStatus: opt.id })}
                >{opt.label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Reviewer notes</label>
            <textarea rows={2} value={home.reviewNotes}
              onChange={(e) => onChange({ reviewNotes: e.target.value })}
              placeholder="Visible to partner…"
            />
          </div>
        </div>
      </div>

      {/* ── 3. Partner submission — compact, conditional ─── */}
      {hasSubmission && (
        <div className="card screen-partner-card">
          <span className="screen-partner-label">Partner submission</span>
          {hasLinks && (
            <ul className="link-list link-list-review screen-partner-links">
              {(home.links ?? []).map((url, i) => (
                <li key={i}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>
              ))}
            </ul>
          )}
          {hasPartnerNotes && (
            <p className="screen-partner-notes">{home.funnel.quickNotes}</p>
          )}
        </div>
      )}

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
