/**
 * Fetches a listing URL via Firecrawl (JS-rendered, free tier 500/mo)
 * and parses the markdown for intake-form fields including occupancy + photo.
 */

import { parseSquareFeet, parseBedsBaths } from './scraperUtils'
import { parseAuctionSchedule } from './auctionSchedule'
import type { AuctionFormat } from './auctionSchedule'

export interface AuctionScrapedData {
  address?: string
  city?: string
  state?: string
  zip?: string
  /** Auction.com Estimate Price — maps to funnel.arv */
  estimatePrice?: number
  /** Starting Bid — maps to funnel.askingPrice */
  openingBid?: number
  /** Only present when listingType === 'auction' */
  startingCreditBid?: number
  listingType?: 'auction' | 'bank-owned'
  occupancy?: 'vacant' | 'occupied' | 'unknown'
  yearBuilt?: number
  /** Above-grade living area (sq ft) → property.livingArea */
  livingArea?: number
  /** Bedroom count → property.bedrooms */
  beds?: number
  /** Bathroom count (can be fractional: 2.5 = 2 full + 1 half) → property.fullBaths / halfBaths */
  baths?: number
  photoUrl?: string
  auctionFormat?: AuctionFormat
  auctionStartAt?: string
  auctionEndAt?: string
  auctionComingSoon?: boolean
}

function parseMoney(s: string): number | undefined {
  const n = parseFloat(s.replace(/[$,\s]/g, ''))
  return isNaN(n) || n <= 0 ? undefined : n
}

function firstMoney(text: string, patterns: RegExp[]): number | undefined {
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const v = parseMoney(m[1])
      if (v) return v
    }
  }
  return undefined
}

function parseAddress(text: string): Pick<AuctionScrapedData, 'address' | 'city' | 'state' | 'zip'> {
  // Firecrawl heading: "# 39747 N State Park Rd    Spring Grove, IL 60081, McHenry County"
  // (multiple spaces between street and city — no comma)
  // Also try the Jina-style metadata title line as fallback.
  const candidates = [
    text.match(/^#\s+(.+)$/m)?.[1],
    text.match(/^Title:\s*(.+)$/m)?.[1],
  ].filter(Boolean) as string[]

  for (const raw of candidates) {
    // Strip trailing site name suffix, but keep internal whitespace intact for now
    const stripped = raw.replace(/\s*\|\s*auction\.com.*/i, '').trim()

    // ── Pattern 1: multi-space separator (Firecrawl heading format) ──
    // "Street   City, ST ZIP"  (2+ spaces between street and city, no comma)
    // Must run on the raw string BEFORE whitespace normalisation
    const multispace = stripped.match(/^(.+?)\s{2,}(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/)
    if (multispace) {
      return {
        address: multispace[1].trim(),
        city: multispace[2].trim(),
        state: multispace[3],
        zip: multispace[4],
      }
    }

    // Normalise for remaining patterns
    const clean = stripped.replace(/\s+/g, ' ')

    // ── Pattern 2: comma-separated "Street, City, ST ZIP" ──
    const withZip = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/)
    if (withZip) {
      return { address: withZip[1].trim(), city: withZip[2].trim(), state: withZip[3], zip: withZip[4] }
    }

    // ── Pattern 3: no zip ──
    const noZip = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})(?:[,\s]|$)/)
    if (noZip) {
      return { address: noZip[1].trim(), city: noZip[2].trim(), state: noZip[3] }
    }
  }

  return {}
}

function parseListingType(text: string): AuctionScrapedData['listingType'] {
  if (/\b(reo|bank[\s-]owned|real estate owned)\b/i.test(text)) return 'bank-owned'
  if (/\b(foreclosure auction|live auction|online auction)\b/i.test(text)) return 'auction'
  const top500 = text.slice(0, 500)
  if (/\bauction\b/i.test(top500) && !/\bbank[\s-]owned\b|\breo\b/i.test(top500)) return 'auction'
  return undefined
}

function parsePhoto(text: string): string | undefined {
  // Firecrawl renders property images as markdown image links with real CDN URLs
  // e.g. ![39747 N State Park Rd ...](https://adc-tenbox-prod.imgix.net/resi/propertyImages/...)
  const patterns = [
    // imgix CDN (auction.com primary)
    /!\[[^\]]*\]\((https:\/\/adc-tenbox-prod\.imgix\.net\/[^)]+)\)/,
    // Any other https image in the listing content (jpg/jpeg/webp/png)
    /!\[[^\]]*\]\((https:\/\/(?!cdn\.auction\.com\/details\/page-assets)[^\s)]+\.(?:jpe?g|webp|png)[^)]*)\)/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) return m[1]
  }
  return undefined
}

export async function scrapeAuctionListing(url: string): Promise<AuctionScrapedData> {
  const apiKey = import.meta.env.VITE_FIRECRAWL_KEY as string | undefined
  if (!apiKey) throw new Error('Firecrawl API key not configured (VITE_FIRECRAWL_KEY)')

  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['markdown'] }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) throw new Error(`Firecrawl error (HTTP ${res.status})`)

  const json = await res.json() as { success: boolean; data?: { markdown?: string }; error?: string }
  if (!json.success || !json.data?.markdown) {
    throw new Error(json.error ?? 'Firecrawl returned no content')
  }

  const text = json.data.markdown

  // Guard: must look like a single property page
  const isListingPage =
    /opening\s+bid|starting\s+bid/i.test(text) ||
    /est\.?\s+market\s+value|bpo|broker.?price/i.test(text) ||
    /year\s+built/i.test(text)

  if (!isListingPage) {
    throw new Error(
      `This doesn't look like a property detail page. ` +
      `Make sure you're linking directly to the listing (not a search result).`
    )
  }

  const result: AuctionScrapedData = {
    ...parseAddress(text),
    listingType: parseListingType(text),
    photoUrl: parsePhoto(text),
  }

  // Opening bid / Starting bid
  result.openingBid = firstMoney(text, [
    /opening\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
    /starting\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
    /minimum\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
    /current\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
  ])

  // Estimate price — "Est. MarketValue" (no space) or "Est. Market Value"
  result.estimatePrice = firstMoney(text, [
    /est\.?\s+market\s*value[\s\S]{0,20}?(\$[\d,]+)/im,
    /est\.?\s+retail\s*value[\s\S]{0,20}?(\$[\d,]+)/im,
    /estimated?\s+value[\s\S]{0,15}?(\$[\d,]+)/im,
    /\bbpo[\s\S]{0,10}?(\$[\d,]+)/im,
    /broker.?price.?opinion[\s\S]{0,10}?(\$[\d,]+)/im,
    /home\s+value[\s\S]{0,10}?(\$[\d,]+)/im,
  ])

  // Starting credit bid (auction pages only)
  if (result.listingType === 'auction') {
    result.startingCreditBid = firstMoney(text, [
      /credit\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
      /opening\s+credit\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
    ])
  }

  // Occupancy — Firecrawl renders the full page so we can see the actual notice
  // Patterns: "**Occupied:** Do not disturb..." or "**Vacant:**..."
  if (
    /\*\*Occupied\*\*:/i.test(text) ||
    /do\s+not\s+disturb\s+occupants/i.test(text)
  ) {
    result.occupancy = 'occupied'
  } else if (
    /\*\*Vacant\*\*:/i.test(text) ||
    /property\s+is\s+vacant/i.test(text) ||
    /occupancy\s*[:\-]\s*vacant/i.test(text)
  ) {
    result.occupancy = 'vacant'
  } else {
    const occupancyField = text.match(/occupancy(?:\s+status)?\s*[:\-]\s*(\w+)/i)
    if (occupancyField) {
      const val = occupancyField[1].toLowerCase()
      if (val === 'vacant') result.occupancy = 'vacant'
      else if (val === 'occupied') result.occupancy = 'occupied'
    }
  }

  // Year built
  const yearMatch =
    text.match(/year\s+built[\s\S]{0,10}?(\d{4})/i) ??
    text.match(/built\s+in\s+(\d{4})/i)
  if (yearMatch) result.yearBuilt = parseInt(yearMatch[1])

  result.livingArea = parseSquareFeet(text)

  const { beds, baths } = parseBedsBaths(text)
  if (beds)  result.beds  = beds
  if (baths) result.baths = baths

  const schedule = parseAuctionSchedule(text)
  if (schedule.format)       result.auctionFormat    = schedule.format
  if (schedule.startAt)      result.auctionStartAt   = schedule.startAt
  if (schedule.endAt)        result.auctionEndAt     = schedule.endAt
  if (schedule.comingSoon)   result.auctionComingSoon = true

  return result
}
