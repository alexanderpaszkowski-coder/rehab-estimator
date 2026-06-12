/** Parse above-grade living area (sq ft) from scraped markdown. */
export function parseSquareFeet(text: string): number | undefined {
  const patterns = [
    /living\s+area[\s\S]{0,25}?([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|sf|square\s+feet)/i,
    /(?:above[\s-]?grade|finished)\s+(?:living\s+)?area[\s\S]{0,25}?([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|sf)/i,
    /(?:sq\.?\s*ft\.?|square\s+feet|sqft)[\s:]*([\d,]+)/i,
    /([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|SF)\b/i,
    /\b([\d,]{3,5})\s+sq\b/i,
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
