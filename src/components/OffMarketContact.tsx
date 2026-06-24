import { useState } from 'react'
import type {
  CallAttempt,
  CallOutcome,
  FunnelScreen,
  HomeFile,
  MailerType,
  OffMarketContact,
  PhoneEntry,
  PhoneType,
} from '../types'
import { DEFAULT_CONTACT } from '../lib/defaults'

interface Props {
  home: HomeFile
  onChange: (patch: Partial<HomeFile>) => void
}

function getContact(home: HomeFile): OffMarketContact {
  return home.contact ? { ...DEFAULT_CONTACT, ...home.contact } : { ...DEFAULT_CONTACT }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const CALL_OUTCOME_OPTIONS: { id: CallOutcome; label: string; cls: string }[] = [
  { id: 'no-answer',     label: 'No Answer',     cls: 'grey'    },
  { id: 'voicemail',     label: 'Voicemail',      cls: 'yellow'  },
  { id: 'reached',       label: 'Reached',        cls: 'green'   },
  { id: 'not-interested', label: 'Not Interested', cls: 'red'    },
  { id: 'interested',    label: 'Interested',     cls: 'success' },
]

const MAILER_TYPES: { id: MailerType; label: string }[] = [
  { id: 'yellow-letter', label: 'Yellow Letter' },
  { id: 'postcard',      label: 'Postcard'       },
  { id: 'typed-letter',  label: 'Typed Letter'   },
  { id: 'other',         label: 'Other'           },
]

const PHONE_TYPES: { id: PhoneType; label: string }[] = [
  { id: 'mobile',   label: 'Mobile'   },
  { id: 'landline', label: 'Landline' },
  { id: 'unknown',  label: 'Unknown'  },
]

// ── Step completion helpers ──────────────────────────────────────────────────

function ownerComplete(c: OffMarketContact) { return c.ownerName.trim().length > 0 }
function phonesComplete(c: OffMarketContact) { return c.phones.some(p => p.number.trim().length > 0) }
function mailerComplete(c: OffMarketContact) { return !!c.mailerSentAt }
function callsComplete(c: OffMarketContact) {
  return c.callAttempts.some(a => a.outcome === 'reached' || a.outcome === 'interested')
}

// ── Step header ──────────────────────────────────────────────────────────────

function StepHeader({
  num, title, subtitle, complete,
}: { num: number; title: string; subtitle: string; complete: boolean }) {
  return (
    <div className="contact-step-header">
      <span className={`contact-step-badge${complete ? ' contact-step-badge--done' : ''}`}>
        {complete
          ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : num}
      </span>
      <div className="contact-step-header-text">
        <span className="contact-step-title">{title}</span>
        <span className="contact-step-subtitle">{subtitle}</span>
      </div>
      {complete && <span className="contact-step-done-chip">Done</span>}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function OffMarketContactPanel({ home, onChange }: Props) {
  const contact = getContact(home)
  const [callDraft, setCallDraft] = useState<{ date: string; outcome: CallOutcome | null; notes: string }>({
    date: todayISO(),
    outcome: null,
    notes: '',
  })
  const [showCallForm, setShowCallForm] = useState(false)

  const patchContact = (patch: Partial<OffMarketContact>) => {
    onChange({ contact: { ...contact, ...patch } })
  }

  const updateFunnel = (patch: Partial<FunnelScreen>) => {
    onChange({ funnel: { ...home.funnel, ...patch } })
  }

  // ── Phone helpers ──────────────────────────────────────────────────────────

  const addPhone = () => {
    if (contact.phones.length >= 3) return
    patchContact({ phones: [...contact.phones, { number: '', type: 'unknown' }] })
  }

  const updatePhone = (i: number, patch: Partial<PhoneEntry>) => {
    const phones = contact.phones.map((p, idx) => idx === i ? { ...p, ...patch } : p)
    patchContact({ phones })
  }

  const removePhone = (i: number) => {
    patchContact({ phones: contact.phones.filter((_, idx) => idx !== i) })
  }

  // ── Call helpers ───────────────────────────────────────────────────────────

  const logCall = () => {
    if (!callDraft.outcome) return
    const attempt: CallAttempt = {
      id: crypto.randomUUID(),
      date: callDraft.date,
      outcome: callDraft.outcome,
      notes: callDraft.notes,
    }
    patchContact({ callAttempts: [attempt, ...contact.callAttempts] })
    setCallDraft({ date: todayISO(), outcome: null, notes: '' })
    setShowCallForm(false)
  }

  const removeCall = (id: string) => {
    patchContact({ callAttempts: contact.callAttempts.filter(a => a.id !== id) })
  }

  // ── External link helpers ──────────────────────────────────────────────────

  const countySearchUrl = () => {
    const q = encodeURIComponent(`${home.address} ${home.city} ${home.state} property owner county records`)
    return `https://www.google.com/search?q=${q}`
  }

  const step1Done = ownerComplete(contact)
  const step2Done = phonesComplete(contact)
  const step3Done = mailerComplete(contact)
  const step4Done = callsComplete(contact)

  return (
    <div className="contact-funnel">

      {/* ── Step 1: Property Owner ─────────────────────────────────────── */}
      <div className={`contact-step card${step1Done ? ' contact-step--done' : ''}`}>
        <StepHeader
          num={1}
          title="Determine Property Owner"
          subtitle="Look up owner info via county records or PropStream"
          complete={step1Done}
        />
        <div className="contact-step-body">
          <div className="contact-owner-grid">
            <div className="field">
              <label>Owner name</label>
              <input
                type="text"
                value={contact.ownerName}
                onChange={(e) => patchContact({ ownerName: e.target.value })}
                placeholder="First Last"
              />
            </div>
            <div className="field">
              <label>Co-owner name <span className="contact-optional">(optional)</span></label>
              <input
                type="text"
                value={contact.ownerName2}
                onChange={(e) => patchContact({ ownerName2: e.target.value })}
                placeholder="First Last"
              />
            </div>
          </div>
          <div className="contact-link-row">
            <a
              className="contact-ext-btn"
              href={countySearchUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              County Records
            </a>
            {home.propstreamUrl && (
              <a
                className="contact-ext-btn"
                href={home.propstreamUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                PropStream
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Step 2: Phone Numbers ──────────────────────────────────────── */}
      <div className={`contact-step card${step2Done ? ' contact-step--done' : ''}`}>
        <StepHeader
          num={2}
          title="Find Phone Numbers"
          subtitle="Add up to 3 phone numbers from skip-trace or PropStream"
          complete={step2Done}
        />
        <div className="contact-step-body">
          {contact.phones.length === 0 && (
            <p className="contact-empty-hint">No phone numbers added yet.</p>
          )}
          {contact.phones.map((phone, i) => (
            <div className="phone-entry-row" key={i}>
              <input
                type="tel"
                className="phone-entry-number"
                value={phone.number}
                onChange={(e) => updatePhone(i, { number: e.target.value })}
                placeholder="(555) 555-5555"
              />
              <div className="condition-pills phone-entry-pills">
                {PHONE_TYPES.map((pt) => (
                  <button
                    key={pt.id}
                    type="button"
                    className={`condition-pill ${phone.type === pt.id ? 'active-light' : ''}`}
                    onClick={() => updatePhone(i, { type: pt.id })}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="contact-remove-btn"
                onClick={() => removePhone(i)}
                title="Remove"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          ))}
          {contact.phones.length < 3 && (
            <button type="button" className="contact-add-btn" onClick={addPhone}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add phone number
            </button>
          )}
        </div>
      </div>

      {/* ── Step 3: Send Mailer ────────────────────────────────────────── */}
      <div className={`contact-step card${step3Done ? ' contact-step--done' : ''}`}>
        <StepHeader
          num={3}
          title="Send Mailer"
          subtitle="Choose mailer type and record the date it was sent"
          complete={step3Done}
        />
        <div className="contact-step-body">
          <div className="contact-mailer-grid">
            <div className="contact-step-field-block">
              <label className="contact-field-label">Mailer type</label>
              <div className="condition-pills">
                {MAILER_TYPES.map((mt) => (
                  <button
                    key={mt.id}
                    type="button"
                    className={`condition-pill ${contact.mailerType === mt.id ? 'active-light' : ''}`}
                    onClick={() => patchContact({ mailerType: contact.mailerType === mt.id ? null : mt.id })}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field contact-mailer-date-field">
              <label>Date sent</label>
              <input
                type="date"
                value={contact.mailerSentAt ?? ''}
                onChange={(e) => patchContact({ mailerSentAt: e.target.value || null })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 4: Phone Calls ────────────────────────────────────────── */}
      <div className={`contact-step card${step4Done ? ' contact-step--done' : ''}`}>
        <StepHeader
          num={4}
          title="Make Phone Contact"
          subtitle="Log each call attempt and track outcomes"
          complete={step4Done}
        />
        <div className="contact-step-body">
          {/* Call log */}
          {contact.callAttempts.length > 0 && (
            <div className="call-log">
              {contact.callAttempts.map((attempt) => {
                const opt = CALL_OUTCOME_OPTIONS.find(o => o.id === attempt.outcome)
                return (
                  <div className="call-log-entry" key={attempt.id}>
                    <span className="call-log-date">
                      {new Date(attempt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className={`call-outcome-chip call-outcome-chip--${opt?.cls ?? 'grey'}`}>
                      {opt?.label ?? attempt.outcome}
                    </span>
                    {attempt.notes && (
                      <span className="call-log-notes">{attempt.notes}</span>
                    )}
                    <button
                      type="button"
                      className="contact-remove-btn call-log-remove"
                      onClick={() => removeCall(attempt.id)}
                      title="Remove"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Log call form */}
          {showCallForm ? (
            <div className="call-draft-form">
              <div className="call-draft-row">
                <div className="field call-draft-date">
                  <label>Date</label>
                  <input
                    type="date"
                    value={callDraft.date}
                    onChange={(e) => setCallDraft(d => ({ ...d, date: e.target.value }))}
                  />
                </div>
                <div className="call-draft-outcome">
                  <label className="contact-field-label">Outcome</label>
                  <div className="condition-pills">
                    {CALL_OUTCOME_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`condition-pill ${callDraft.outcome === opt.id ? `active-${opt.cls === 'success' ? 'light' : opt.cls}` : ''}`}
                        onClick={() => setCallDraft(d => ({ ...d, outcome: d.outcome === opt.id ? null : opt.id }))}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="field">
                <label>Notes <span className="contact-optional">(optional)</span></label>
                <textarea
                  rows={2}
                  value={callDraft.notes}
                  onChange={(e) => setCallDraft(d => ({ ...d, notes: e.target.value }))}
                  placeholder="What was discussed…"
                  style={{ resize: 'none' }}
                />
              </div>
              <div className="call-draft-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={logCall}
                  disabled={!callDraft.outcome}
                >
                  Save Call
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowCallForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="contact-add-btn" onClick={() => setShowCallForm(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Log a call
            </button>
          )}
        </div>
      </div>

      {/* ── Compact Screening Card ─────────────────────────────────────── */}
      <div className="card contact-screening-card">
        <div className="contact-screening-header">
          <span className="contact-screening-label">Screening</span>
        </div>
        <div className="screen-grid-compact contact-screening-grid">
          <div className="field">
            <label>ARV</label>
            <input
              type="number"
              value={home.funnel.arv ?? ''}
              onChange={(e) => updateFunnel({ arv: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="$0"
            />
          </div>
          <div className="field">
            <label>Asking price</label>
            <input
              type="number"
              value={home.funnel.askingPrice ?? ''}
              onChange={(e) => updateFunnel({ askingPrice: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="$0"
            />
          </div>
          <div className="field">
            <label>Max offer</label>
            <input
              type="number"
              value={home.funnel.maxOffer ?? ''}
              onChange={(e) => updateFunnel({ maxOffer: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="$0"
            />
          </div>
          <div className="screen-item">
            <label>Available for sale?</label>
            <div className="condition-pills">
              {(['yes', 'no', 'unknown'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`condition-pill ${home.funnel.availableForSale === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'none'}` : ''}`}
                  onClick={() => updateFunnel({ availableForSale: home.funnel.availableForSale === o ? null : o })}
                >
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="screen-item">
            <label>Seller motivated?</label>
            <div className="condition-pills">
              {(['yes', 'no', 'unknown'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`condition-pill ${home.funnel.sellerMotivated === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'none'}` : ''}`}
                  onClick={() => updateFunnel({ sellerMotivated: home.funnel.sellerMotivated === o ? null : o })}
                >
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="field screen-notes-field">
            <label>Quick notes</label>
            <textarea
              rows={2}
              value={home.funnel.quickNotes}
              onChange={(e) => updateFunnel({ quickNotes: e.target.value })}
              style={{ resize: 'none' }}
            />
          </div>
        </div>
      </div>

    </div>
  )
}
