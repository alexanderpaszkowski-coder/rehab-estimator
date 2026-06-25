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
  { id: 'no-answer',      label: 'No Answer',     cls: 'grey'    },
  { id: 'voicemail',      label: 'Voicemail',      cls: 'yellow'  },
  { id: 'reached',        label: 'Reached',        cls: 'green'   },
  { id: 'not-interested', label: 'Not Interested', cls: 'red'     },
  { id: 'interested',     label: 'Interested',     cls: 'success' },
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

export function ownerComplete(c: OffMarketContact)  { return c.ownerName.trim().length > 0 }
export function phonesComplete(c: OffMarketContact) { return c.phones.some(p => p.number.trim().length > 0) }
export function mailerComplete(c: OffMarketContact) { return !!c.mailerSentAt }
export function callsComplete(c: OffMarketContact)  {
  return c.callAttempts.some(a => a.outcome === 'reached' || a.outcome === 'interested')
}

// ── Step header ──────────────────────────────────────────────────────────────

function StepHeader({
  num, title, subtitle, complete, onUndo, onToggle, isExpanded,
}: {
  num: number
  title: string
  subtitle: string
  complete: boolean
  onUndo?: () => void
  onToggle?: () => void
  isExpanded?: boolean
}) {
  return (
    <div className="contact-step-header">
      <span className={`contact-step-badge${complete ? ' contact-step-badge--done' : ''}`}>
        {complete
          ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : num}
      </span>
      <div className="contact-step-header-text">
        <span className="contact-step-title">{title}</span>
        <span className="contact-step-subtitle">{subtitle}</span>
      </div>
      {complete && (
        <div className="contact-step-done-row">
          <span className="contact-step-done-chip">Done</span>
          {onToggle && (
            <button type="button" className="contact-undo-btn" onClick={onToggle}>
              {isExpanded ? 'Collapse' : 'Edit'}
            </button>
          )}
          {onUndo && (
            <button type="button" className="contact-undo-btn" onClick={onUndo} title="Undo">
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Owner Profile Card ───────────────────────────────────────────────────────

function OwnerProfileCard({ home }: { home: HomeFile }) {
  const contact = getContact(home)
  const step1Done = ownerComplete(contact)
  const step2Done = phonesComplete(contact)
  const step3Done = mailerComplete(contact)
  const step4Done = callsComplete(contact)
  const anyDone = step1Done || step2Done || step3Done || step4Done

  const initials = step1Done
    ? contact.ownerName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const mailerLabel = contact.mailerType
    ? MAILER_TYPES.find(m => m.id === contact.mailerType)?.label ?? 'Mailer'
    : 'Mailer'

  const mailerDate = contact.mailerSentAt
    ? new Date(contact.mailerSentAt + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const lastCall = contact.callAttempts.find(a => a.outcome === 'reached' || a.outcome === 'interested') ?? contact.callAttempts[0] ?? null
  const lastCallOpt = lastCall ? CALL_OUTCOME_OPTIONS.find(o => o.id === lastCall.outcome) : null

  if (!anyDone) {
    return (
      <div className="owner-profile-card card owner-profile-card--empty">
        <svg className="owner-profile-empty-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
        <span className="owner-profile-empty-text">Complete the steps below to build the owner profile</span>
      </div>
    )
  }

  return (
    <div className="owner-profile-card card">
      <div className="owner-profile-inner">
        <div className="owner-profile-avatar">
          {initials}
        </div>
        <div className="owner-profile-details">
          {step1Done && (
            <div className="owner-profile-name">
              {contact.ownerName}
              {contact.ownerName2 && (
                <span className="owner-profile-coowner"> &amp; {contact.ownerName2}</span>
              )}
            </div>
          )}
          {step2Done && contact.phones.length > 0 && (
            <div className="owner-profile-phones">
              {contact.phones.map((p, i) => (
                <span key={i} className="owner-profile-phone-entry">
                  <span className="owner-profile-phone-num">{p.number}</span>
                  <span className="owner-profile-phone-type">{p.type}</span>
                </span>
              ))}
            </div>
          )}
          {(step3Done || step4Done) && (
            <div className="owner-profile-badges">
              {step3Done && (
                <span className="owner-profile-badge owner-profile-badge--mailer">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                  {mailerLabel}{mailerDate ? ` · ${mailerDate}` : ''}
                </span>
              )}
              {step4Done && lastCall && (
                <span className={`owner-profile-badge owner-profile-badge--call call-outcome-chip--${lastCallOpt?.cls ?? 'grey'}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  {contact.callAttempts.length} call{contact.callAttempts.length !== 1 ? 's' : ''} · {lastCallOpt?.label ?? lastCall.outcome}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Screening Strip (exported — rendered above the contact funnel) ────────────

export function ScreeningStrip({ home, onChange }: Props) {
  const funnel = home.funnel

  const updateFunnel = (patch: Partial<FunnelScreen>) => {
    onChange({ funnel: { ...funnel, ...patch } })
  }

  return (
    <div className="card ov-screening-top">
      <div className="ov-screening-top-header">
        <span className="ov-screening-top-label">Screening</span>
      </div>
      <div className="contact-screening-grid screen-grid-compact">
        <div className="field">
          <label>ARV</label>
          <input
            type="number"
            value={funnel.arv ?? ''}
            onChange={(e) => updateFunnel({ arv: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="$0"
          />
        </div>
        <div className="field">
          <label>Asking price</label>
          <input
            type="number"
            value={funnel.askingPrice ?? ''}
            onChange={(e) => updateFunnel({ askingPrice: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="$0"
          />
        </div>
        <div className="field">
          <label>Max offer</label>
          <input
            type="number"
            value={funnel.maxOffer ?? ''}
            onChange={(e) => updateFunnel({ maxOffer: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="$0"
          />
        </div>
        <div className="screen-item">
          <label>Available for sale?</label>
          <div className="condition-pills">
            {(['yes', 'no', 'unknown'] as const).map((o) => (
              <button key={o} type="button"
                className={`condition-pill ${funnel.availableForSale === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'none'}` : ''}`}
                onClick={() => updateFunnel({ availableForSale: funnel.availableForSale === o ? null : o })}
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
              <button key={o} type="button"
                className={`condition-pill ${funnel.sellerMotivated === o ? `active-${o === 'yes' ? 'light' : o === 'no' ? 'heavy' : 'none'}` : ''}`}
                onClick={() => updateFunnel({ sellerMotivated: funnel.sellerMotivated === o ? null : o })}
              >
                {o.charAt(0).toUpperCase() + o.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="field screen-notes-field">
          <label>Quick notes</label>
          <textarea
            rows={1}
            value={funnel.quickNotes}
            onChange={(e) => updateFunnel({ quickNotes: e.target.value })}
            style={{ resize: 'none' }}
          />
        </div>
      </div>
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
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

  const toggleExpand = (n: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  const patchContact = (patch: Partial<OffMarketContact>) => {
    onChange({ contact: { ...contact, ...patch } })
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

  const step1Done = ownerComplete(contact)
  const step2Done = phonesComplete(contact)
  const step3Done = mailerComplete(contact)
  const step4Done = callsComplete(contact)

  // Show the step body when: step is not done, OR user has clicked Edit to expand
  const showBody = (done: boolean, n: number) => !done || expandedSteps.has(n)

  return (
    <div className="contact-funnel-wrap">

      {/* ── Owner Profile (auto-populates as steps complete) ────────────── */}
      <OwnerProfileCard home={home} />

      <div className="contact-funnel">

        {/* ── Step 1: Property Owner ─────────────────────────────────────── */}
        <div className={`contact-step card${step1Done ? ' contact-step--done' : ''}`}>
          <StepHeader
            num={1} title="Property Owner" subtitle="Look up via PropStream or county"
            complete={step1Done}
            onToggle={step1Done ? () => toggleExpand(1) : undefined}
            isExpanded={expandedSteps.has(1)}
            onUndo={step1Done ? () => patchContact({ ownerName: '', ownerName2: '' }) : undefined}
          />
          {step1Done && !expandedSteps.has(1) && (
            <div className="contact-step-summary">
              {contact.ownerName}{contact.ownerName2 ? ` & ${contact.ownerName2}` : ''}
            </div>
          )}
          {showBody(step1Done, 1) && (
            <div className="contact-step-body">
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
                <label>Co-owner <span className="contact-optional">(optional)</span></label>
                <input
                  type="text"
                  value={contact.ownerName2}
                  onChange={(e) => patchContact({ ownerName2: e.target.value })}
                  placeholder="First Last"
                />
              </div>
              {home.propstreamUrl && (
                <a
                  className="contact-ext-btn"
                  href={home.propstreamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  PropStream
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── Step 2: Phone Numbers ──────────────────────────────────────── */}
        <div className={`contact-step card${step2Done ? ' contact-step--done' : ''}`}>
          <StepHeader
            num={2} title="Phone Numbers" subtitle="Skip-trace or PropStream (max 3)"
            complete={step2Done}
            onToggle={step2Done ? () => toggleExpand(2) : undefined}
            isExpanded={expandedSteps.has(2)}
            onUndo={step2Done ? () => patchContact({ phones: [] }) : undefined}
          />
          {step2Done && !expandedSteps.has(2) && (
            <div className="contact-step-summary">
              {contact.phones.map((p, i) => (
                <span key={i} className="contact-step-summary-phone">
                  {p.number}
                  <span className="contact-step-summary-phone-type">{p.type}</span>
                </span>
              ))}
            </div>
          )}
          {showBody(step2Done, 2) && (
            <div className="contact-step-body">
              {contact.phones.length === 0 && (
                <p className="contact-empty-hint">No numbers added yet.</p>
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
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))}
              {contact.phones.length < 3 && (
                <button type="button" className="contact-add-btn" onClick={addPhone}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add number
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Step 3: Send Mailer ────────────────────────────────────────── */}
        <div className={`contact-step card${step3Done ? ' contact-step--done' : ''}`}>
          <StepHeader
            num={3} title="Send Mailer" subtitle="Record type and date sent"
            complete={step3Done}
            onToggle={step3Done ? () => toggleExpand(3) : undefined}
            isExpanded={expandedSteps.has(3)}
            onUndo={step3Done ? () => patchContact({ mailerSentAt: null, mailerType: null }) : undefined}
          />
          {step3Done && !expandedSteps.has(3) && (
            <div className="contact-step-summary">
              {MAILER_TYPES.find(m => m.id === contact.mailerType)?.label ?? 'Mailer'}
              {contact.mailerSentAt && (
                <> · {new Date(contact.mailerSentAt + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
              )}
            </div>
          )}
          {showBody(step3Done, 3) && (
            <div className="contact-step-body">
              <div className="contact-step-field-block">
                <label className="contact-field-label">Type</label>
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
              <div className="field">
                <label>Date sent</label>
                <input
                  type="date"
                  value={contact.mailerSentAt ?? ''}
                  onChange={(e) => patchContact({ mailerSentAt: e.target.value || null })}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Step 4: Phone Calls ────────────────────────────────────────── */}
        <div className={`contact-step card${step4Done ? ' contact-step--done' : ''}`}>
          <StepHeader
            num={4} title="Phone Contact" subtitle="Log each call attempt"
            complete={step4Done}
            onToggle={step4Done ? () => toggleExpand(4) : undefined}
            isExpanded={expandedSteps.has(4)}
            onUndo={step4Done ? () => patchContact({ callAttempts: [] }) : undefined}
          />
          {step4Done && !expandedSteps.has(4) && (
            <div className="contact-step-summary">
              {(() => {
                const last = contact.callAttempts.find(a => a.outcome === 'reached' || a.outcome === 'interested') ?? contact.callAttempts[0]
                const opt = last ? CALL_OUTCOME_OPTIONS.find(o => o.id === last.outcome) : null
                return `${contact.callAttempts.length} call${contact.callAttempts.length !== 1 ? 's' : ''}${opt ? ` · ${opt.label}` : ''}`
              })()}
            </div>
          )}
          {showBody(step4Done, 4) && (
            <div className="contact-step-body">
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
                          <span className="call-log-notes" title={attempt.notes}>{attempt.notes}</span>
                        )}
                        <button
                          type="button"
                          className="contact-remove-btn call-log-remove"
                          onClick={() => removeCall(attempt.id)}
                          title="Remove"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {showCallForm ? (
                <div className="call-draft-form">
                  {/* Row 1: outcome pills full width */}
                  <div className="condition-pills call-draft-pills">
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
                  {/* Row 2: date + notes + save inline */}
                  <div className="call-draft-bottom-row">
                    <input
                      type="date"
                      className="call-draft-date-input"
                      value={callDraft.date}
                      onChange={(e) => setCallDraft(d => ({ ...d, date: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="call-draft-notes-input"
                      value={callDraft.notes}
                      onChange={(e) => setCallDraft(d => ({ ...d, notes: e.target.value }))}
                      placeholder="Notes (optional)"
                    />
                    <button type="button" className="btn btn-primary btn-sm call-draft-save-btn" onClick={logCall} disabled={!callDraft.outcome}>
                      Save
                    </button>
                    <button type="button" className="contact-remove-btn" onClick={() => setShowCallForm(false)} title="Cancel">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="contact-add-btn" onClick={() => setShowCallForm(true)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Log a call
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
