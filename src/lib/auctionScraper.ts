/**
 * Fetches an auction.com listing URL via Jina AI Reader (free, no API key needed)
 * and parses the markdown output for intake-form fields.
 *
 * Jina Reader URL: https://r.jina.ai/{target-url}
 * CORS: Jina sets access-control-allow-origin so browser fetch works directly.
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
  const clean = s.replace(/[$,\s]/g, '')
  const n = parseFloat(clean)
  return isNaN(n) || n <= 0 ? undefined : n
}

function firstMoney(text: string, patterns: RegExp[]): number | undefined {
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const v = parseMoney(m[1] ?? m[0])
      if (v) return v
    }
  }
  return undefined
}

function parseAddress(text: string): Pick<AuctionScrapedData, 'address' | 'city' | 'state' | 'zip'> {
  // Auction.com page titles: "1234 Main St, Chicago, IL 60601 | Auction.com"
  // Jina markdown Title line: "Title: 1234 Main St, Chicago, IL 60601 | Auction.com"
  const titleLine = text.match(/^Title:\s*(.+)$/m)?.[1] ?? ''
  const clean = titleLine.replace(/\s*\|\s*auction\.com.*/i, '').trim()

  // Full address with zip: "Street, City, ST 00000"
  const full = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/)
  if (full) {
    return { address: full[1].trim(), city: full[2].trim(), state: full[3], zip: full[4] }
  }

  // Address without zip: "Street, City, ST"
  const noZip = clean.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})$/)
  if (noZip) {
    return { address: noZip[1].trim(), city: noZip[2].trim(), state: noZip[3] }
  }

  // Try finding an address anywhere in the text (common heading pattern on listing pages)
  const inline = text.match(/^#+\s*(.+?,\s*.+?,\s*[A-Z]{2}\s+\d{5})/m)
  if (inline) {
    const inner = inline[1].match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5})$/)
    if (inner) return { address: inner[1].trim(), city: inner[2].trim(), state: inner[3], zip: inner[4] }
  }

  return {}
}

function parseListingType(text: string): AuctionScrapedData['listingType'] {
  // REO / bank-owned indicators
  if (/\b(reo|bank[- ]owned|real estate owned)\b/i.test(text)) return 'bank-owned'
  // Explicit "Auction" badge text (appearing before other content)
  // Use positive match but not if it's just the site name
  if (/\bforeclosure auction\b|\bauction listing\b|\blive auction\b|\bonline auction\b/i.test(text)) return 'auction'
  // Fallback: look for "Auction" as a property type near the top
  const top500 = text.slice(0, 500)
  if (/\bauction\b/i.test(top500) && !/\breo\b|\bbank.?owned\b/i.test(top500)) return 'auction'
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

  // Guard: if Jina returned a search/redirect page instead of a property detail
  const isListingPage =
    /opening\s+bid|starting\s+bid|bpo|broker.?price/i.test(text) ||
    /\bbed(?:room)?s?\b.*\bbath/i.test(text) ||
    /year\s+built/i.test(text)

  if (!isListingPage) {
    throw new Error(
      `This URL doesn't appear to be a property detail page. ` +
        `Make sure you're linking directly to the listing on auction.com.`,
    )
  }

  const result: AuctionScrapedData = {
    ...parseAddress(text),
    listingType: parseListingType(text),
  }

  // Opening bid / Starting bid
  result.openingBid = firstMoney(text, [
    /opening\s+bid[:\s*$]+(\$[\d,]+)/im,
    /starting\s+bid[:\s*$]+(\$[\d,]+)/im,
    /current\s+bid[:\s*$]+(\$[\d,]+)/im,
    /minimum\s+bid[:\s*$]+(\$[\d,]+)/im,
  ])

  // BPO / Estimate price
  result.estimatePrice = firstMoney(text, [
    /\bbpo[:\s*$]+(\$[\d,]+)/im,
    /broker.?price.?opinion[:\s*$]+(\$[\d,]+)/im,
    /estimated?\s+value[:\s*$]+(\$[\d,]+)/im,
    /home\s+value[:\s*$]+(\$[\d,]+)/im,
    /assessed\s+value[:\s*$]+(\$[\d,]+)/im,
  ])

  // Starting credit bid (sometimes shown on auction pages as "Credit Bid")
  if (result.listingType === 'auction') {
    result.startingCreditBid = firstMoney(text, [
      /credit\s+bid[:\s*$]+(\$[\d,]+)/im,
      /opening\s+credit\s+bid[:\s*$]+(\$[\d,]+)/im,
    ])
  }

  // Occupancy
  if (/\bvacant\b/i.test(text)) result.occupancy = 'vacant'
  else if (/\boccupied\b/i.test(text)) result.occupancy = 'occupied'

  // Year built
  const yearMatch = text.match(/year\s+built[:\s]+(\d{4})/i) ?? text.match(/built\s+in\s+(\d{4})/i)
  if (yearMatch) result.yearBuilt = parseInt(yearMatch[1])

  return result
}
