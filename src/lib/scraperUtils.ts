/** auction.com compact row: "4Beds2Baths2,544Sq. Ft." */
export function parseCompactPropertyRow(text: string): { beds?: number; baths?: number; livingArea?: number } {
  const m = text.match(/(\d{1,2})Beds(\d(?:\.\d)?)Baths([\d,]+)Sq\.?\s*Ft\.?/i)
  if (!m) return {}
  const beds = parseInt(m[1], 10)
  const baths = parseFloat(m[2])
  const livingArea = parseInt(m[3].replace(/,/g, ''), 10)
  return {
    beds: !isNaN(beds) && beds >= 1 && beds <= 20 ? beds : undefined,
    baths: !isNaN(baths) && baths >= 0.5 && baths <= 20 ? baths : undefined,
    livingArea: !isNaN(livingArea) && livingArea >= 300 && livingArea <= 50_000 ? livingArea : undefined,
  }
}

/** Parse above-grade living area (sq ft) from scraped markdown. */
export function parseSquareFeet(text: string): number | undefined {
  const compact = parseCompactPropertyRow(text)
  if (compact.livingArea) return compact.livingArea

  const patterns: RegExp[] = [
    // Attached format: "2,544Sq. Ft."
    /([\d,]{3,5})Sq\.?\s*Ft\.?\b/i,
    // Label-before-number: "Living Area: 1,234 sq ft"
    /living\s+area[\s\S]{0,25}?([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|sf|square\s+feet)/i,
    /(?:above[\s-]?grade|finished)\s+(?:living\s+)?area[\s\S]{0,25}?([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|sf)/i,
    // Bold label (Firecrawl/auction.com): "**Sq. Ft.:** 1,234" or "**Living Area:** 1,234"
    /\*\*(?:sq\.?\s*ft\.?|square\s+feet?|living\s+area|home\s+size|size)\*\*[:\s]*([\d,]+)/i,
    // "Square Footage: 1,234" or "Sq. Ft.: 1,234"
    /(?:square\s+footage|sq\.?\s*ft\.?)\s*[:\-]\s*([\d,]+)/i,
    // Table cell: "| Sq Ft | 1,234 |"
    /\|\s*(?:sq\.?\s*ft\.?|square\s+feet|living\s+area)\s*\|\s*([\d,]+)/i,
    // Number before label: "1,234 sq ft"
    /([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|SF)\b/i,
    // Short form: "1,234 sq" (must be 3+ digit number)
    /\b([\d,]{3,5})\s+sq\b/i,
    // Label then bare number (last resort): "Sq. Ft.  1234"
    /(?:sq\.?\s*ft\.?|square\s+feet?)\s+([\d,]{3,5})\b/i,
  ]

  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const n = parseInt(m[1].replace(/,/g, ''), 10)
      if (!isNaN(n) && n >= 300 && n <= 50_000) return n
    }
  }
  return undefined
}

/**
 * Parse bedroom and bathroom counts from scraped markdown.
 * Baths can be fractional (2.5 = 2 full + 1 half).
 */
export function parseBedsBaths(text: string): { beds?: number; baths?: number } {
  const compact = parseCompactPropertyRow(text)
  let beds: number | undefined = compact.beds
  let baths: number | undefined = compact.baths

  // ── Beds ──────────────────────────────────────────────────────────────────
  const bedPatterns: RegExp[] = [
    // Bold label: "**Bedrooms:** 3" or "**Beds:** 3"
    /\*\*(?:bed(?:room)?s?|br|bd)\*\*[:\s]*([\d]+)/i,
    // "Bedrooms: 3" or "Beds: 3"
    /\bbed(?:room)?s?\s*[:\-]\s*([\d]+)/i,
    // "3 bedrooms" or "3 beds" or "3 bed"
    /\b(\d+)\s*bed(?:room)?s?\b/i,
    // "3 BR" or "3 BD"
    /\b(\d+)\s*(?:br|bd)\b/i,
  ]

  if (!beds) {
    for (const re of bedPatterns) {
      const m = text.match(re)
      if (m?.[1]) {
        const n = parseInt(m[1], 10)
        if (!isNaN(n) && n >= 1 && n <= 20) { beds = n; break }
      }
    }
  }

  // ── Baths ─────────────────────────────────────────────────────────────────
  const bathPatterns: RegExp[] = [
    // Bold label: "**Bathrooms:** 2" or "**Baths:** 2.5"
    /\*\*(?:bath(?:room)?s?|ba(?:th)?)\*\*[:\s]*([\d]+(?:\.5)?)/i,
    // "Bathrooms: 2.5" or "Baths: 2"
    /\bbath(?:room)?s?\s*[:\-]\s*([\d]+(?:\.5)?)/i,
    // "Total Baths: 2"
    /total\s+bath(?:room)?s?\s*[:\-]\s*([\d]+(?:\.5)?)/i,
    // "2 bathrooms" or "2.5 baths" or "2 bath"
    /\b([\d]+(?:\.5)?)\s*bath(?:room)?s?\b/i,
    // "2 BA"
    /\b([\d]+(?:\.5)?)\s*\bba\b/i,
    // Table: "| Baths | 2 |"
    /\|\s*bath(?:room)?s?\s*\|\s*([\d]+(?:\.5)?)/i,
  ]

  if (!baths) {
    for (const re of bathPatterns) {
      const m = text.match(re)
      if (m?.[1]) {
        const n = parseFloat(m[1])
        if (!isNaN(n) && n >= 0.5 && n <= 20) { baths = n; break }
      }
    }
  }

  return { beds, baths }
}
