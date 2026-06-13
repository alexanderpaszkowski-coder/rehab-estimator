/**
 * Unified listing scraper for all supported real estate sites except auction.com
 * (which has its own dedicated scraper).
 *
 * Strategy:
 *  1. Detect site from URL.
 *  2. Parse address from the URL slug — always reliable regardless of bot-blocks.
 *  3. Try Firecrawl for price / estimate / photo / year built / occupancy.
 *  4. If Firecrawl is blocked or returns nothing useful, fall back to URL-only data.
 */

import type { PropertySource } from '../types'
import { parseSquareFeet, parseBedsBaths } from './scraperUtils'

export type ScrapableSite = Exclude<
  PropertySource,
  'auction.com' | 'mls' | 'off-market' | 'wholesale' | 'direct-mail' | 'driving-for-dollars' | 'other'
>

export interface ListingScrapedData {
  source: ScrapableSite
  address?: string
  city?: string
  state?: string
  zip?: string
  /** Asking / list / opening-bid price → funnel.askingPrice */
  listPrice?: number
  /** AVM / estimate / ARV → funnel.arv */
  estimatePrice?: number
  occupancy?: 'vacant' | 'occupied' | 'unknown'
  yearBuilt?: number
  /** Above-grade living area (sq ft) → property.livingArea */
  livingArea?: number
  /** Bedroom count → property.bedrooms */
  beds?: number
  /** Bathroom count (can be fractional: 2.5 = 2 full + 1 half) → property.fullBaths / halfBaths */
  baths?: number
  photoUrl?: string
  /** true when the site returned a bot-block page */
  blocked?: boolean
  /** Raw snippet for in-app debug when prices can't be parsed */
  _debug?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
])

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
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

type AddressParts = Pick<ListingScrapedData, 'address' | 'city' | 'state' | 'zip'>

/**
 * Parse a hyphen-separated address slug like "1234-N-Maple-Dr-Chicago-IL-60601".
 * Finds ZIP and state as anchors, then splits city/street.
 */
function parseHyphenSlug(slug: string): AddressParts {
  // Strip trailing listing IDs
  const clean = slug
    .replace(/_zpid.*$/i, '')
    .replace(/-[A-Z0-9]{6,}$/i, '')  // Hubzu-style trailing ID
    .replace(/-\d{5,}$/, '')          // numeric trailing ID

  const parts = clean.split('-').filter(Boolean)
  if (parts.length < 4) return {}

  // Find ZIP (5 digits)
  let zipIdx = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d{5}$/.test(parts[i])) { zipIdx = i; break }
  }

  // Find state abbreviation (immediately before ZIP, or scan backwards)
  let stateIdx = zipIdx > 0 ? zipIdx - 1 : -1
  if (stateIdx < 0 || !US_STATES.has(parts[stateIdx]?.toUpperCase())) {
    for (let i = parts.length - 1; i >= 1; i--) {
      if (US_STATES.has(parts[i]?.toUpperCase())) {
        stateIdx = i
        if (zipIdx === -1 && /^\d{5}$/.test(parts[i + 1] ?? '')) zipIdx = i + 1
        break
      }
    }
  }
  if (stateIdx < 1) return {}

  const state = parts[stateIdx].toUpperCase()
  const zip   = zipIdx > -1 ? parts[zipIdx] : undefined

  // City: segment(s) immediately before state.
  // Try 1-word city first; if that leaves address < 2 parts, try 2-word city.
  const cityEnd = stateIdx - 1
  let city: string
  let addressParts: string[]

  if (cityEnd >= 2) {
    city         = titleCase(parts[cityEnd])
    addressParts = parts.slice(0, cityEnd)
  } else {
    return {}
  }

  const address = titleCase(addressParts.join(' '))
  if (!address || !city) return {}
  return { address, city, state, zip }
}

// ── Site-specific URL address parsers ─────────────────────────────────────────

function parseZillowUrl(url: string): AddressParts {
  // https://www.zillow.com/homedetails/1234-N-Maple-Dr-Chicago-IL-60601/123456_zpid/
  const m = url.match(/homedetails\/([^/]+)/i)
  return m ? parseHyphenSlug(m[1]) : {}
}

function parseRedfinUrl(url: string): AddressParts {
  // https://www.redfin.com/IL/Chicago/1234-Main-St-60601/home/12345
  const m = url.match(/redfin\.com\/([A-Z]{2})\/([^/]+)\/([^/]+)\/home/i)
  if (!m) return {}
  const state         = m[1].toUpperCase()
  const city          = titleCase(m[2].replace(/-/g, ' '))
  const streetWithZip = m[3]
  const zipM          = streetWithZip.match(/-(\d{5})$/)
  const zip           = zipM?.[1]
  const address       = titleCase(streetWithZip.replace(/-\d{5}$/, '').replace(/-/g, ' '))
  return { address, city, state, zip }
}

function parseRealtorUrl(url: string): AddressParts {
  // https://www.realtor.com/realestateandhomes-detail/STREET_CITY_ST_ZIP_MID
  const m = url.match(/realestateandhomes-detail\/([^/?#]+)/i)
  if (!m) return {}
  const slug  = m[1].replace(/_M[\dA-Za-z-]+$/, '')
  const parts = slug.split('_')
  if (parts.length < 4) return {}
  const [streetSlug, citySlug, state, zip] = parts
  return {
    address: titleCase(streetSlug.replace(/-/g, ' ')),
    city:    titleCase(citySlug.replace(/-/g, ' ')),
    state:   state.toUpperCase(),
    zip,
  }
}

function parseHomesUrl(url: string): AddressParts {
  // https://www.homes.com/property/1234-main-st-chicago-il-60601/id
  const m = url.match(/homes\.com\/property\/([^/?#]+)/i)
  if (!m) return {}
  // Remove trailing path segments
  const slug = m[1].split('/')[0]
  return parseHyphenSlug(slug)
}

function parseHomepathUrl(url: string): AddressParts {
  // https://www.homepath.com/listing/1234-main-st_chicago_il_60601/12345
  const m = url.match(/homepath\.com\/listing\/([^/?#]+)/i)
  if (!m) return {}
  const slug = m[1].split('/')[0]
  if (slug.includes('_')) {
    // underscore-separated: STREET_CITY_ST_ZIP
    const parts = slug.split('_').map((p) => p.replace(/-/g, ' ').trim())
    if (parts.length >= 4) {
      return {
        address: titleCase(parts[0]),
        city:    titleCase(parts[1]),
        state:   parts[2].toUpperCase(),
        zip:     parts[3],
      }
    }
  }
  return parseHyphenSlug(slug)
}

function parseHubzuUrl(url: string): AddressParts {
  // https://www.hubzu.com/property-detail/1234-Main-St-Chicago-IL-60601-123456/
  const m = url.match(/property-detail\/([^/?#]+)/i)
  return m ? parseHyphenSlug(m[1]) : {}
}

function parseNewWesternUrl(url: string): AddressParts {
  // https://newwestern.com/properties/tx/dallas/1234-main-st/12345
  const m = url.match(/newwestern\.com\/properties?\/[A-Za-z]{2}\/([^/]+)\/([^/]+)/i)
  if (!m) return {}
  return {
    city:    titleCase(m[1].replace(/-/g, ' ')),
    address: titleCase(m[2].replace(/-/g, ' ')),
  }
}

// ── Site configs ──────────────────────────────────────────────────────────────

interface SiteConfig {
  source: ScrapableSite
  urlPattern: RegExp
  parseUrlAddress: (url: string) => AddressParts
  pricePatterns: RegExp[]
  estimatePatterns: RegExp[]
}

const COMMON_LIST_PRICE: RegExp[] = [
  /list(?:ing)?\s+price[\s\S]{0,60}?(\$[\d,]+)/im,
  /asking\s+price[\s\S]{0,40}?(\$[\d,]+)/im,
  /sale\s+price[\s\S]{0,40}?(\$[\d,]+)/im,
  /^#+\s+(\$[\d,]+)\s*$/m,
  /^\*\*(\$[\d,]+)\*\*\s*$/m,
  /^(\$[\d,]+)\s*$/m,
  /price[:\s]+(\$[\d,]+)/im,
  /(\$[\d,]{4,})/,
]

const COMMON_ESTIMATE: RegExp[] = [
  /estimated?\s+(?:home\s+|market\s+)?value[\s\S]{0,60}?(\$[\d,]+)/im,
  /home\s+value[\s\S]{0,40}?(\$[\d,]+)/im,
  /avm[\s\S]{0,30}?(\$[\d,]+)/im,
  /estimate[\s\S]{0,40}?(\$[\d,]+)/im,
]

const SITE_CONFIGS: SiteConfig[] = [
  {
    source: 'zillow',
    urlPattern: /zillow\.com/i,
    parseUrlAddress: parseZillowUrl,
    pricePatterns: COMMON_LIST_PRICE,
    estimatePatterns: [
      /zestimate[\s\S]{0,60}?(\$[\d,]+)/im,
      /zillow\s+estimate[\s\S]{0,60}?(\$[\d,]+)/im,
      ...COMMON_ESTIMATE,
    ],
  },
  {
    source: 'redfin',
    urlPattern: /redfin\.com/i,
    parseUrlAddress: parseRedfinUrl,
    pricePatterns: COMMON_LIST_PRICE,
    estimatePatterns: [
      /redfin\s+estimate[\s\S]{0,60}?(\$[\d,]+)/im,
      ...COMMON_ESTIMATE,
    ],
  },
  {
    source: 'realtor.com',
    urlPattern: /realtor\.com/i,
    parseUrlAddress: parseRealtorUrl,
    pricePatterns: COMMON_LIST_PRICE,
    estimatePatterns: [
      /realtor\.com\s+estimate[\s\S]{0,80}?(\$[\d,]+)/im,
      ...COMMON_ESTIMATE,
    ],
  },
  {
    source: 'new-western',
    urlPattern: /newwestern\.com/i,
    parseUrlAddress: parseNewWesternUrl,
    pricePatterns: [
      /purchase\s+price[\s\S]{0,40}?(\$[\d,]+)/im,
      /wholesale\s+price[\s\S]{0,40}?(\$[\d,]+)/im,
      ...COMMON_LIST_PRICE,
    ],
    estimatePatterns: [
      /\barv[\s\S]{0,30}?(\$[\d,]+)/im,
      /after[\s-]repair[\s\S]{0,30}?(\$[\d,]+)/im,
      ...COMMON_ESTIMATE,
    ],
  },
  {
    source: 'zenlist',
    urlPattern: /zenlist\.com/i,
    parseUrlAddress: () => ({}),
    pricePatterns: COMMON_LIST_PRICE,
    estimatePatterns: COMMON_ESTIMATE,
  },
  {
    source: 'homes.com',
    urlPattern: /(?:^|\.)homes\.com/i,
    parseUrlAddress: parseHomesUrl,
    pricePatterns: COMMON_LIST_PRICE,
    estimatePatterns: [
      /homes?\.com\s+estimate[\s\S]{0,60}?(\$[\d,]+)/im,
      ...COMMON_ESTIMATE,
    ],
  },
  {
    source: 'homepath',
    urlPattern: /homepath\.com/i,
    parseUrlAddress: parseHomepathUrl,
    pricePatterns: COMMON_LIST_PRICE,
    estimatePatterns: COMMON_ESTIMATE,
  },
  {
    source: 'hubzu',
    urlPattern: /hubzu\.com/i,
    parseUrlAddress: parseHubzuUrl,
    pricePatterns: [
      /opening\s+bid[\s\S]{0,30}?(\$[\d,]+)/im,
      /starting\s+bid[\s\S]{0,30}?(\$[\d,]+)/im,
      /current\s+bid[\s\S]{0,30}?(\$[\d,]+)/im,
      /minimum\s+bid[\s\S]{0,30}?(\$[\d,]+)/im,
      /(\$[\d,]{4,})/,
    ],
    estimatePatterns: [
      /est\.?\s+market\s*value[\s\S]{0,30}?(\$[\d,]+)/im,
      /\barv[\s\S]{0,30}?(\$[\d,]+)/im,
      ...COMMON_ESTIMATE,
    ],
  },
]

// ── Firecrawl shared fetch ────────────────────────────────────────────────────

async function fetchMarkdown(url: string): Promise<string | null> {
  const apiKey = import.meta.env.VITE_FIRECRAWL_KEY as string | undefined
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], waitFor: 3000, onlyMainContent: false }),
      signal: AbortSignal.timeout(40_000),
    })
    if (!res.ok) return null
    const json = await res.json() as { success: boolean; data?: { markdown?: string } }
    return json.success && json.data?.markdown ? json.data.markdown : null
  } catch {
    return null
  }
}

function isBlockedResponse(text: string): boolean {
  return (
    /your request could not be processed/i.test(text) ||
    /unblockrequest@/i.test(text) ||
    /access\s+denied|403\s+forbidden/i.test(text) ||
    /bot\s+detection|captcha|verify\s+you\s+are\s+human/i.test(text) ||
    /sign\s+in\s+to\s+continue|log\s+in\s+to\s+view/i.test(text) ||
    /enable\s+javascript/i.test(text)
  )
}

function parsePhoto(text: string): string | undefined {
  const m = text.match(/!\[[^\]]*\]\((https:\/\/[^\s)]+\.(?:jpe?g|webp|png)[^)]*)\)/)
  return m?.[1]
}

function parseYearBuilt(text: string): number | undefined {
  const m =
    text.match(/year\s+built[\s\S]{0,20}?(\d{4})/i) ??
    text.match(/built[\s\S]{0,10}?(\b(?:19|20)\d{2}\b)/i)
  if (!m) return undefined
  const yr = parseInt(m[1])
  return yr >= 1800 && yr <= new Date().getFullYear() + 1 ? yr : undefined
}

function parseOccupancy(text: string): ListingScrapedData['occupancy'] {
  if (/\*\*Occupied\*\*:|\bdo\s+not\s+disturb\b|\bowner[\s-]+occupied\b/i.test(text))
    return 'occupied'
  if (/\bvacant\b/i.test(text) && !/do\s+not\s+disturb/i.test(text))
    return 'vacant'
  const m = text.match(/occupancy(?:\s+status)?\s*[:\-]\s*(\w+)/i)
  if (m) {
    const v = m[1].toLowerCase()
    if (v === 'vacant')   return 'vacant'
    if (v === 'occupied') return 'occupied'
  }
  return undefined
}

function parseAddressFromMarkdown(text: string): AddressParts {
  const candidates = [
    text.match(/^#{1,3}\s+(.+)$/m)?.[1],
    text.match(/^Title:\s*(.+)$/m)?.[1],
  ].filter(Boolean) as string[]

  for (const raw of candidates) {
    const stripped = raw.replace(/\s*[|–—]\s*\S+.*/i, '').trim()

    const multi = stripped.match(/^(.+?)\s{2,}(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/)
    if (multi) return { address: multi[1].trim(), city: multi[2].trim(), state: multi[3], zip: multi[4] }

    const clean = stripped.replace(/\s+/g, ' ')
    const withZip = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/)
    if (withZip) return { address: withZip[1].trim(), city: withZip[2].trim(), state: withZip[3], zip: withZip[4] }

    const noZip = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})(?:[,\s]|$)/)
    if (noZip) return { address: noZip[1].trim(), city: noZip[2].trim(), state: noZip[3] }
  }
  return {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the detected site config for a given URL, or null if unsupported. */
export function detectListingSite(url: string): ScrapableSite | null {
  return SITE_CONFIGS.find((c) => c.urlPattern.test(url))?.source ?? null
}

/** Scrape a listing URL. Always returns at minimum address-from-URL; prices are best-effort. */
export async function scrapeListingUrl(url: string): Promise<ListingScrapedData> {
  const config = SITE_CONFIGS.find((c) => c.urlPattern.test(url))
  if (!config) throw new Error('Unsupported listing site. Paste a link from a supported platform.')

  // ── Address from URL — always reliable ──
  const urlAddr = config.parseUrlAddress(url)

  // ── Firecrawl — best effort ──
  const text = await fetchMarkdown(url)

  if (!text || isBlockedResponse(text)) {
    return { source: config.source, ...urlAddr, blocked: true }
  }

  const mdAddr = parseAddressFromMarkdown(text)

  const result: ListingScrapedData = {
    source:   config.source,
    address:  urlAddr.address  || mdAddr.address,
    city:     urlAddr.city     || mdAddr.city,
    state:    urlAddr.state    || mdAddr.state,
    zip:      urlAddr.zip      || mdAddr.zip,
    photoUrl: parsePhoto(text),
    occupancy: parseOccupancy(text),
    yearBuilt: parseYearBuilt(text),
    livingArea: parseSquareFeet(text),
    ...parseBedsBaths(text),
  }

  result.listPrice     = firstMoney(text, config.pricePatterns)
  result.estimatePrice = firstMoney(text, config.estimatePatterns)

  // Don't assign the same number to both fields
  if (
    result.listPrice &&
    result.estimatePrice &&
    result.listPrice === result.estimatePrice
  ) {
    result.estimatePrice = undefined
  }

  if (!result.listPrice && !result.estimatePrice) {
    result._debug = text.slice(0, 500)
  }

  return result
}
