/**
 * Parse auction.com schedule from Firecrawl markdown/HTML text and
 * compute live countdown state for property cards.
 */

export type AuctionFormat = 'in-person' | 'online'
export type AuctionPhase = 'coming-soon' | 'upcoming' | 'live' | 'ended'

export interface ParsedAuctionSchedule {
  format?: AuctionFormat
  startAt?: string
  endAt?: string
  timezone?: string
  comingSoon?: boolean
}

export interface AuctionCountdownState {
  phase: AuctionPhase
  /** Human label: "Starts in", "Ends in", "Coming soon", "Ended" */
  label: string
  /** Compact countdown: "2d 4h 12m" */
  countdown: string
  /** Formatted schedule line for display */
  scheduleLine: string
  formatLabel: string
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/** UTC offset in hours for US timezone abbreviations (simplified). */
const TZ_OFFSET_HOURS: Record<string, number> = {
  EST: -5, EDT: -4, ET: -4,
  CST: -6, CDT: -5, CT: -5,
  MST: -7, MDT: -6, MT: -6,
  PST: -8, PDT: -7, PT: -7,
}

function parseDateTimeToken(
  token: string,
  fallbackMonth?: number,
): { y: number; m: number; d: number; hour: number; minute: number } | null {
  const full = token.trim().match(
    /^(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(\d{1,2}),\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i,
  )
  if (!full) return null

  let month = full[1] ? MONTHS[full[1].slice(0, 3).toLowerCase()] : fallbackMonth
  const day = parseInt(full[2], 10)
  const year = parseInt(full[3], 10)
  if (month === undefined) month = fallbackMonth ?? 0

  let hour = 23
  let minute = 59
  if (full[4]) {
    hour = parseInt(full[4], 10)
    minute = parseInt(full[5], 10)
    const ampm = full[6].toUpperCase()
    if (ampm === 'PM' && hour < 12) hour += 12
    if (ampm === 'AM' && hour === 12) hour = 0
  }

  if (isNaN(day) || isNaN(year)) return null
  return { y: year, m: month, d: day, hour, minute }
}

function partsToISO(
  parts: { y: number; m: number; d: number; hour: number; minute: number },
  tz?: string,
): string {
  const offsetH = tz ? (TZ_OFFSET_HOURS[tz.toUpperCase()] ?? -5) : -5
  const utcMs = Date.UTC(parts.y, parts.m, parts.d, parts.hour, parts.minute) - offsetH * 3600_000
  return new Date(utcMs).toISOString()
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0m'
  const totalMin = Math.floor(ms / 60_000)
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins = totalMin % 60
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function formatShortDate(iso: string, tz?: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZoneName: 'short',
      ...(tz ? {} : {}),
    })
  } catch {
    return '—'
  }
}

/** Parse auction format, dates, and timezone from scraped page text. */
export function parseAuctionSchedule(text: string): ParsedAuctionSchedule {
  const result: ParsedAuctionSchedule = {}

  // ── Format: online vs in-person ───────────────────────────────────────────
  if (/\bonline\s+auction\b/i.test(text)) {
    result.format = 'online'
  } else if (/\b(?:in[-\s]?person|live\s+on[-\s]?site|on[-\s]?site)\s+auction\b/i.test(text)) {
    result.format = 'in-person'
  }

  // ── Date range: "Jun 15, 2026 8:00 AM - Jun 17, 2026 EDT" ────────────────
  const rangeRe =
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{1,2},\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?)\s*(CT|ET|PT|MT|EDT|EST|CST|CDT|PST|PDT)?/i

  const rangeMatch = text.match(rangeRe)
  if (rangeMatch) {
    const startParts = parseDateTimeToken(rangeMatch[1])
    const startMonth = rangeMatch[1].match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)
    const fallbackMonth = startMonth ? MONTHS[startMonth[1].slice(0, 3).toLowerCase()] : undefined
    const endParts = parseDateTimeToken(rangeMatch[2], fallbackMonth)
    const tz = rangeMatch[3]?.toUpperCase()
    if (startParts) result.startAt = partsToISO(startParts, tz)
    if (endParts) result.endAt = partsToISO(endParts, tz)
    if (tz) result.timezone = tz
    return result
  }

  // ── Single start datetime near "Auction Starts" ───────────────────────────
  const singleRe =
    /(?:auction\s+starts?(?:\s+in)?|bidding\s+opens?|sale\s+date)[\s\S]{0,80}?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM))\s*(CT|ET|PT|MT|EDT|EST|CST|CDT|PST|PDT)?/i
  const singleMatch = text.match(singleRe)
  if (singleMatch) {
    const startParts = parseDateTimeToken(singleMatch[1])
    const tz = singleMatch[2]?.toUpperCase()
    if (startParts) {
      result.startAt = partsToISO(startParts, tz)
      if (tz) result.timezone = tz
      const durationH = result.format === 'online' ? 48 : 2
      result.endAt = new Date(new Date(result.startAt).getTime() + durationH * 3600_000).toISOString()
    }
    return result
  }

  // ── Coming soon (no scheduled dates yet) ────────────────────────────────
  const header = text.slice(0, 4000)
  const hasScheduleHint = /auction\s+starts?\s+in|register\s+to\s+bid/i.test(header)
  if (/coming\s+soon/i.test(header) && !hasScheduleHint) {
    result.comingSoon = true
  }

  return result
}

/** Compute countdown display state from stored schedule fields. */
export function getAuctionCountdown(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  format: AuctionFormat | null | undefined,
  comingSoon?: boolean,
  now = Date.now(),
): AuctionCountdownState | null {
  const formatLabel =
    format === 'online' ? 'Online'
    : format === 'in-person' ? 'In-Person'
    : 'Auction'

  if (comingSoon && !startAt) {
    return {
      phase: 'coming-soon',
      label: 'Coming soon',
      countdown: '—',
      scheduleLine: 'Auction dates not posted yet',
      formatLabel,
    }
  }

  if (!startAt) return null

  const start = new Date(startAt).getTime()
  const end = endAt ? new Date(endAt).getTime() : start + (format === 'online' ? 48 : 2) * 3600_000

  let phase: AuctionPhase
  let label: string
  let remaining: number

  if (now < start) {
    phase = 'upcoming'
    label = 'Starts in'
    remaining = start - now
  } else if (now < end) {
    phase = 'live'
    label = 'Ends in'
    remaining = end - now
  } else {
    phase = 'ended'
    label = 'Ended'
    remaining = 0
  }

  const scheduleLine = endAt
    ? `${formatShortDate(startAt)} → ${formatShortDate(endAt)}`
    : formatShortDate(startAt)

  return {
    phase,
    label,
    countdown: phase === 'ended' ? '—' : formatDuration(remaining),
    scheduleLine,
    formatLabel,
  }
}
