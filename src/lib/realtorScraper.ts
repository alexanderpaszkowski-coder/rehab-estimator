/**
 * Fetches a realtor.com listing via Firecrawl and parses key fields.
 * Address is also extracted from the URL slug as a reliable fallback.
 */

export interface RealtorScrapedData {
  address?: string
  city?: string
  state?: string
  zip?: string
  /** List price → maps to funnel.askingPrice */
  listPrice?: number
  /** Realtor.com Estimate (AVM) → maps to funnel.arv */
  realtorEstimate?: number
  occupancy?: 'vacant' | 'occupied' | 'unknown'
  yearBuilt?: number
  photoUrl?: string
  /** Raw markdown excerpt for debugging if parsing produces nothing */
  _debug?: string
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

/**
 * Parse address from realtor.com URL slug.
 * e.g. ".../2106-W-Addison-St_Chicago_IL_60618_M82479-21566"
 *  → { address: "2106 W Addison St", city: "Chicago", state: "IL", zip: "60618" }
 */
function parseAddressFromUrl(
  url: string,
): Pick<RealtorScrapedData, 'address' | 'city' | 'state' | 'zip'> {
  // Extract the slug after "realestateandhomes-detail/"
  const slugMatch = url.match(/realestateandhomes-detail\/([^/?#]+)/i)
  if (!slugMatch) return {}

  const slug = slugMatch[1]
  // Remove trailing listing ID like "_M12345-6789" or "_M123456789"
  const noId = slug.replace(/_M[\dA-Za-z-]+$/, '')

  // Split on underscore — parts are: [street, city, state, zip]
  const parts = noId.split('_')
  if (parts.length < 4) return {}

  const [streetSlug, citySlug, state, zip] = parts
  const address = streetSlug.replace(/-/g, ' ')
  const city    = citySlug.replace(/-/g, ' ')

  if (!address || !city || !state || !/^\d{5}/.test(zip)) return {}

  // Title-case the address/city
  const titleCase = (s: string) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase())

  return {
    address: titleCase(address),
    city:    titleCase(city),
    state:   state.toUpperCase(),
    zip,
  }
}

/**
 * Parse address from markdown heading as a secondary source.
 */
function parseAddressFromMarkdown(
  text: string,
): Pick<RealtorScrapedData, 'address' | 'city' | 'state' | 'zip'> {
  const candidates = [
    text.match(/^#{1,3}\s+(.+)$/m)?.[1],
    text.match(/^Title:\s*(.+)$/m)?.[1],
  ].filter(Boolean) as string[]

  for (const raw of candidates) {
    const stripped = raw
      .replace(/\s*[|–—]\s*(realtor\.com|real estate).*/i, '')
      .trim()

    // multi-space separator (some Firecrawl outputs)
    const multi = stripped.match(/^(.+?)\s{2,}(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/)
    if (multi) {
      return { address: multi[1].trim(), city: multi[2].trim(), state: multi[3], zip: multi[4] }
    }

    const clean = stripped.replace(/\s+/g, ' ')
    // "Street, City, ST ZIP"
    const withZip = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/)
    if (withZip) {
      return { address: withZip[1].trim(), city: withZip[2].trim(), state: withZip[3], zip: withZip[4] }
    }
    // "Street, City, ST"
    const noZip = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})(?:[,\s]|$)/)
    if (noZip) {
      return { address: noZip[1].trim(), city: noZip[2].trim(), state: noZip[3] }
    }
  }
  return {}
}

function parsePhoto(text: string): string | undefined {
  const patterns = [
    /!\[[^\]]*\]\((https:\/\/ap\.rdcpix\.com\/[^)]+)\)/,
    /!\[[^\]]*\]\((https:\/\/[^\s)]*rdcpix[^\s)]*\.(?:jpe?g|webp|png)[^)]*)\)/,
    /!\[[^\]]*\]\((https:\/\/[^\s)]*\.(?:jpe?g|webp|png)[^)]*)\)/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) return m[1]
  }
  return undefined
}

export async function scrapeRealtorListing(url: string): Promise<RealtorScrapedData> {
  const apiKey = import.meta.env.VITE_FIRECRAWL_KEY as string | undefined
  if (!apiKey) throw new Error('Firecrawl API key not configured (VITE_FIRECRAWL_KEY)')

  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      waitFor: 3000,
      onlyMainContent: false,
    }),
    signal: AbortSignal.timeout(40_000),
  })

  if (!res.ok) throw new Error(`Firecrawl error (HTTP ${res.status})`)

  const json = await res.json() as {
    success: boolean
    data?: { markdown?: string }
    error?: string
  }
  if (!json.success || !json.data?.markdown) {
    throw new Error(json.error ?? 'Firecrawl returned no content')
  }

  const text = json.data.markdown

  // ── Detect bot-block / access-denied pages ──
  const isBlocked =
    /your request could not be processed/i.test(text) ||
    /unblockrequest@realtor\.com/i.test(text) ||
    /reference\s+id.*fc[0-9a-f-]{30,}/i.test(text) ||
    /access denied|403 forbidden|bot detection/i.test(text)

  // Address from URL is always reliable — use it regardless
  const urlAddr = parseAddressFromUrl(url)

  if (isBlocked) {
    // Return address from URL; prices will be filled manually
    return {
      ...urlAddr,
      _debug: 'blocked',
    }
  }

  // ── Not blocked — also try markdown address ──
  const markdownAddr = parseAddressFromMarkdown(text)

  // Block obvious search-results pages
  const isSearchPage =
    /realestateandhomes-search|\/homes-for-sale\//i.test(url) ||
    (/properties?\s+found|results?\s+for/i.test(text.slice(0, 800)) &&
      !/\$[\d,]{4,}|year\s+built/i.test(text.slice(0, 500)))
  if (isSearchPage) {
    throw new Error(
      `This looks like a search results page. ` +
      `Paste a link directly to a single property listing.`
    )
  }

  const result: RealtorScrapedData = {
    address: urlAddr.address || markdownAddr.address,
    city:    urlAddr.city    || markdownAddr.city,
    state:   urlAddr.state   || markdownAddr.state,
    zip:     urlAddr.zip     || markdownAddr.zip,
    photoUrl: parsePhoto(text),
    _debug:  text.slice(0, 500),
  }

  // ── List price ──
  result.listPrice = firstMoney(text, [
    /list(?:ing)?\s+price[\s\S]{0,60}?(\$[\d,]+)/im,
    /asking\s+price[\s\S]{0,40}?(\$[\d,]+)/im,
    /sale\s+price[\s\S]{0,40}?(\$[\d,]+)/im,
    /^#+\s+(\$[\d,]+)\s*$/m,
    /^\*\*(\$[\d,]+)\*\*\s*$/m,
    /^(\$[\d,]+)\s*$/m,
    /(\$[\d,]{4,})/,
  ])

  // ── Realtor.com estimate ──
  result.realtorEstimate = firstMoney(text, [
    /realtor\.com\s+estimate[\s\S]{0,80}?(\$[\d,]+)/im,
    /home\s+value\s+estimate[\s\S]{0,60}?(\$[\d,]+)/im,
    /estimated?\s+(?:home\s+|market\s+)?value[\s\S]{0,60}?(\$[\d,]+)/im,
    /avm[\s\S]{0,40}?(\$[\d,]+)/im,
    /estimate[\s\S]{0,40}?(\$[\d,]+)/im,
  ])

  // ── Year built ──
  const yearMatch =
    text.match(/year\s+built[\s\S]{0,20}?(\d{4})/i) ??
    text.match(/built[\s\S]{0,10}?(\b(?:19|20)\d{2}\b)/i)
  if (yearMatch) {
    const yr = parseInt(yearMatch[1])
    if (yr >= 1800 && yr <= new Date().getFullYear() + 1) result.yearBuilt = yr
  }

  // ── Occupancy ──
  if (/\bvacant\b/i.test(text) && !/do\s+not\s+disturb/i.test(text)) {
    result.occupancy = 'vacant'
  } else if (/\boccupied\b|\bdo\s+not\s+disturb\b|\bowner[\s-]+occupied\b/i.test(text)) {
    result.occupancy = 'occupied'
  }

  return result
}
