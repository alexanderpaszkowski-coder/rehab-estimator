import { useState } from 'react'
import type { FunnelScreen, IntakeData, PropertySource, TriState } from '../types'
import { DEFAULT_FUNNEL, PROPERTY_SOURCES } from '../lib/funnel'
import { AddressAutocomplete } from './AddressAutocomplete'

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

  const updateFunnel = (patch: Partial<FunnelScreen>) =>
    setData((d) => ({ ...d, funnel: { ...d.funnel, ...patch } }))

  const addLink = () => {
    const trimmed = linkInput.trim()
    if (!trimmed) return
    setData((d) => ({ ...d, links: [...(d.links ?? []), trimmed] }))
    setLinkInput('')
  }

  const removeLink = (i: number) => {
    setData((d) => ({ ...d, links: (d.links ?? []).filter((_, idx) => idx !== i) }))
  }

  const canNext = step === 0 ? data.address.trim().length > 0 : true

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
            <div className="field-grid">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Street Address *</label>
                <AddressAutocomplete
                  autoFocus
                  value={data.address}
                  onChange={(street) => setData((d) => ({ ...d, address: street }))}
                  onSelect={(fill) =>
                    setData((d) => ({
                      ...d,
                      address: fill.street || d.address,
                      city: fill.city || d.city,
                      state: fill.state || d.state,
                      zip: fill.zip || d.zip,
                    }))
                  }
                />
                <p className="field-hint">Start typing — suggestions pull from a national address database</p>
              </div>
              <div className="field">
                <label>City</label>
                <input value={data.city} onChange={(e) => setData({ ...data, city: e.target.value })} />
              </div>
              <div className="field">
                <label>State</label>
                <input value={data.state} onChange={(e) => setData({ ...data, state: e.target.value })} maxLength={2} placeholder="IL" />
              </div>
              <div className="field">
                <label>ZIP</label>
                <input value={data.zip} onChange={(e) => setData({ ...data, zip: e.target.value })} placeholder="60601" />
              </div>
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

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Estimated Value (ARV)</label>
                <input
                  type="number"
                  value={data.funnel.arv ?? ''}
                  onChange={(e) => updateFunnel({ arv: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="$0"
                />
              </div>

              <div className="screen-item" style={{ gridColumn: '1 / -1' }}>
                <label>Available for sale?</label>
                <TriToggle value={data.funnel.availableForSale} onChange={(v) => updateFunnel({ availableForSale: v })} />
                {data.funnel.availableForSale === 'yes' && (
                  <input
                    type="number"
                    style={{ marginTop: 10 }}
                    value={data.funnel.askingPrice ?? ''}
                    onChange={(e) => updateFunnel({ askingPrice: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="Asking price"
                    autoFocus
                  />
                )}
              </div>

              <div className="screen-item">
                <label>In your target area?</label>
                <div className="condition-pills">
                  {(['yes', 'maybe', 'no'] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      className={`condition-pill ${data.funnel.inTargetArea === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'moderate'}` : ''}`}
                      onClick={() => updateFunnel({ inTargetArea: data.funnel.inTargetArea === o ? null : o })}
                    >
                      {o.charAt(0).toUpperCase() + o.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="screen-item">
                <label>Title clear?</label>
                <TriToggle value={data.funnel.titleClear} onChange={(v) => updateFunnel({ titleClear: v })} />
              </div>

              <div className="screen-item">
                <label>Seller motivated?</label>
                <TriToggle value={data.funnel.sellerMotivated} onChange={(v) => updateFunnel({ sellerMotivated: v })} />
              </div>

              <div className="screen-item">
                <label>Occupancy</label>
                <div className="condition-pills">
                  {(['vacant', 'occupied', 'unknown'] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      className={`condition-pill ${data.funnel.occupancy === o ? 'active-light' : ''}`}
                      onClick={() => updateFunnel({ occupancy: data.funnel.occupancy === o ? null : o })}
                    >
                      {o.charAt(0).toUpperCase() + o.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="screen-item">
                <label>Rehab level</label>
                <div className="condition-pills">
                  {(['Light', 'Moderate', 'Heavy'] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      className={`condition-pill ${data.funnel.rehabLevel === o ? `active-${o === 'Light' ? 'light' : o === 'Moderate' ? 'moderate' : 'heavy'}` : ''}`}
                      onClick={() => updateFunnel({ rehabLevel: data.funnel.rehabLevel === o ? null : o })}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Year built</label>
                <input type="number" value={data.funnel.yearBuilt ?? ''} onChange={(e) => updateFunnel({ yearBuilt: e.target.value ? parseInt(e.target.value) : null })} placeholder="Optional" />
              </div>

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
            <button type="button" className="btn btn-primary" onClick={() => onSubmit(data)}>
              Create Property File
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
