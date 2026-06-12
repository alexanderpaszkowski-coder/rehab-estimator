/**
 * Fetches a listing URL via Jina AI Reader (free, no API key, CORS-enabled)
 * and parses the markdown for intake-form fields.
 *
 * Tested against real auction.com listing format (Jina output).
 */

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
  // Jina returns: "Title: 123 Main St, Chicago, IL 60601, Cook County"
  const titleLine = text.match(/^Title:\s*(.+)$/m)?.[1] ?? ''
  const clean = titleLine.replace(/\s*\|\s*auction\.com.*/i, '').trim()

  // Match "Street, City, ST ZIP" — trailing county or other text is fine (no $ anchor)
  const withZip = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/)
  if (withZip) {
    return { address: withZip[1].trim(), city: withZip[2].trim(), state: withZip[3], zip: withZip[4] }
  }

  // Without zip
  const noZip = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})(?:[,\s]|$)/)
  if (noZip) {
    return { address: noZip[1].trim(), city: noZip[2].trim(), state: noZip[3] }
  }

  return {}
}

function parseListingType(text: string): AuctionScrapedData['listingType'] {
  // "Bank Owned" badge appears near top of auction.com pages
  if (/\b(reo|bank[\s-]owned|real estate owned)\b/i.test(text)) return 'bank-owned'
  if (/\b(foreclosure auction|live auction|online auction)\b/i.test(text)) return 'auction'
  // If "Auction" appears prominently but not alongside bank-owned
  const top300 = text.slice(0, 300)
  if (/\bauction\b/i.test(top300) && !/\bbank[\s-]owned\b|\breo\b/i.test(top300)) return 'auction'
  return undefined
}

export async function scrapeAuctionListing(url: string): Promise<AuctionScrapedData> {
  const jinaUrl = `https://r.jina.ai/${url}`

  const res = await fetch(jinaUrl, {
    headers: { Accept: 'text/plain' },
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) throw new Error(`Could not fetch listing (HTTP ${res.status})`)

  const text = await res.text()

  // Guard: must look like a single property page, not a search results page
  const isListingPage =
    /opening\s+bid|starting\s+bid/i.test(text) ||
    /est\.?\s+market\s+value|bpo|broker.?price/i.test(text) ||
    /year\s+built/i.test(text)

  if (!isListingPage) {
    throw new Error(
      `This doesn't look like a property detail page. ` +
        `Make sure you're linking directly to the listing (not a search result).`,
    )
  }

  const result: AuctionScrapedData = {
    ...parseAddress(text),
    listingType: parseListingType(text),
  }

  // Opening bid / Starting bid
  result.openingBid = firstMoney(text, [
    /opening\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
    /starting\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
    /minimum\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
    /current\s+bid[\s\S]{0,10}?(\$[\d,]+)/im,
  ])

  // Estimate price — auction.com uses "Est. Market Value" or "Est. Retail Value"
  result.estimatePrice = firstMoney(text, [
    /est\.?\s+market\s+value[\s\S]{0,10}?(\$[\d,]+)/im,
    /est\.?\s+retail\s+value[\s\S]{0,10}?(\$[\d,]+)/im,
    /estimated?\s+value[\s\S]{0,10}?(\$[\d,]+)/im,
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

  // Occupancy detection — several patterns auction.com uses
  if (
    /do\s+not\s+disturb\s+occupants/i.test(text) ||        // "Do not disturb occupants" notice
    /occupied\s*:\s*do\s+not\s+disturb/i.test(text) ||     // "Occupied: Do not disturb..."
    /^occupied[\s:]/im.test(text)                           // "Occupied" as a line-start label
  ) {
    result.occupancy = 'occupied'
  } else if (
    /^vacant[\s:]/im.test(text) ||
    /property\s+is\s+vacant/i.test(text) ||
    /occupancy\s*[:\-]\s*vacant/i.test(text)
  ) {
    result.occupancy = 'vacant'
  } else {
    // Fall back to explicit "occupancy: <value>" field
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

  return result
}
