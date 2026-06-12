/**
 * Fetches a realtor.com listing via Firecrawl (JS-rendered) and parses
 * the markdown for intake fields: address, list price, realtor estimate,
 * occupancy, year built, and primary photo.
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

function parseAddress(text: string): Pick<RealtorScrapedData, 'address' | 'city' | 'state' | 'zip'> {
  // realtor.com Firecrawl heading is typically:
  //   "# 2106 W Addison St, Chicago, IL 60618"
  // or possibly with extra text after a pipe/dash:
  //   "# 2106 W Addison St, Chicago, IL 60618 | realtor.com®"
  const candidates = [
    text.match(/^#\s+(.+)$/m)?.[1],
    text.match(/^Title:\s*(.+)$/m)?.[1],
    // Some realtor.com pages embed address in og:title style metadata
    text.match(/^address:\s*(.+)$/im)?.[1],
  ].filter(Boolean) as string[]

  for (const raw of candidates) {
    const stripped = raw
      .replace(/\s*[|–—]\s*(realtor\.com|real estate|realestate).*/i, '')
      .replace(/\s*-\s*(realtor\.com).*/i, '')
      .trim()

    // Check multi-space format first (Firecrawl sometimes outputs this)
    const multispace = stripped.match(/^(.+?)\s{2,}(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/)
    if (multispace) {
      return {
        address: multispace[1].trim(),
        city: multispace[2].trim(),
        state: multispace[3],
        zip: multispace[4],
      }
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
    // realtor.com CDN domains
    /!\[[^\]]*\]\((https:\/\/ap\.rdcpix\.com\/[^)]+)\)/,
    /!\[[^\]]*\]\((https:\/\/[^\s)]*rdcpix[^\s)]*\.(?:jpe?g|webp|png)[^)]*)\)/,
    /!\[[^\]]*\]\((https:\/\/[^\s)]*static\.rdc[^\s)]*\.(?:jpe?g|webp|png)[^)]*)\)/,
    // Any https image that looks like a property photo (fallback)
    /!\[[^\]]*\]\((https:\/\/(?!www\.realtor\.com)[^\s)]+\.(?:jpe?g|webp|png)[^)]*)\)/,
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
    body: JSON.stringify({ url, formats: ['markdown'] }),
    signal: AbortSignal.timeout(30_000),
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

  // Guard: must look like a property detail page
  const isListingPage =
    /\bfor\s+sale\b|\bactive\b|\bpending\b/i.test(text.slice(0, 2000)) ||
    /\blist\s+price\b|\blisting\s+price\b/i.test(text) ||
    /\bbeds?\b.*\bbaths?\b/i.test(text.slice(0, 3000)) ||
    /\byear\s+built\b/i.test(text) ||
    /realtor\.com\s+(estimate|home\s+value)/i.test(text)

  if (!isListingPage) {
    throw new Error(
      `This doesn't look like a property detail page. ` +
      `Make sure you're linking directly to the listing (not search results).`
    )
  }

  const result: RealtorScrapedData = {
    ...parseAddress(text),
    photoUrl: parsePhoto(text),
  }

  // List price (what the seller is asking)
  result.listPrice = firstMoney(text, [
    /list(?:ing)?\s+price[\s\S]{0,40}?(\$[\d,]+)/im,
    /asking\s+price[\s\S]{0,30}?(\$[\d,]+)/im,
    // realtor.com sometimes shows price as a big standalone heading
    /^#{1,3}\s+(\$[\d,]{4,})\s*$/m,
    // "Price: $XXX,XXX"
    /\bprice[:\s]+(\$[\d,]+)/im,
  ])

  // Realtor.com estimate / AVM
  result.realtorEstimate = firstMoney(text, [
    /realtor\.com\s+estimate[\s\S]{0,50}?(\$[\d,]+)/im,
    /realtor\s+estimate[\s\S]{0,50}?(\$[\d,]+)/im,
    /estimated?\s+(?:home\s+)?value[\s\S]{0,30}?(\$[\d,]+)/im,
    /home\s+value[\s\S]{0,30}?(\$[\d,]+)/im,
    /avm[\s\S]{0,30}?(\$[\d,]+)/im,
    /zestimate[\s\S]{0,30}?(\$[\d,]+)/im,
  ])

  // Year built
  const yearMatch =
    text.match(/year\s+built[\s\S]{0,15}?(\d{4})/i) ??
    text.match(/built[\s\S]{0,8}?(\d{4})/i)
  if (yearMatch) {
    const yr = parseInt(yearMatch[1])
    if (yr >= 1800 && yr <= new Date().getFullYear() + 1) result.yearBuilt = yr
  }

  // Occupancy — realtor.com doesn't always show this but it can appear
  // in listing descriptions or agent remarks
  if (
    /\bvacant\b/i.test(text) &&
    !/do\s+not\s+disturb/i.test(text)
  ) {
    result.occupancy = 'vacant'
  } else if (
    /\boccupied\b|\bdo\s+not\s+disturb\b|\bowner[\s-]+occupied\b/i.test(text)
  ) {
    result.occupancy = 'occupied'
  }

  return result
}
