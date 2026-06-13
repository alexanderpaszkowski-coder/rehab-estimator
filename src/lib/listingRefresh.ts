import type { HomeFile, PropertySource } from '../types'
import { scrapeAuctionListing } from './auctionScraper'
import { scrapeListingUrl } from './listingScraper'
import { MLS_SOURCES } from './funnel'

/** Sources that support automated re-scrape from listing URL */
export const REFRESHABLE_SOURCES: PropertySource[] = [
  'auction.com',
  'realtor.com',
  'zillow',
  'redfin',
  'new-western',
  'zenlist',
  'homes.com',
  'homepath',
  'hubzu',
  ...MLS_SOURCES.filter((s) => s !== 'mls'),
]

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

export function getListingUrl(home: HomeFile): string | undefined {
  return home.listingUrl ?? home.links?.[0]
}

export function isRefreshable(home: HomeFile): boolean {
  if (!getListingUrl(home)) return false
  if (!REFRESHABLE_SOURCES.includes(home.source)) return false
  if (['sold', 'passed'].includes(home.stage)) return false
  return true
}

export function shouldAutoRefresh(home: HomeFile, now = Date.now()): boolean {
  if (!isRefreshable(home)) return false
  if (!home.lastScrapedAt) return true
  return now - new Date(home.lastScrapedAt).getTime() >= REFRESH_INTERVAL_MS
}

/** Re-scrape listing URL and return merged home updates. */
export async function refreshListingHome(home: HomeFile): Promise<HomeFile> {
  const url = getListingUrl(home)
  if (!url) throw new Error('No listing URL saved for this property')

  const now = new Date().toISOString()
  const updates: Partial<HomeFile> = { lastScrapedAt: now, updatedAt: now }

  if (home.source === 'auction.com' || /auction\.com/i.test(url)) {
    const scraped = await scrapeAuctionListing(url)
    updates.photoUrl = scraped.photoUrl ?? home.photoUrl
    updates.funnel = {
      ...home.funnel,
      ...(scraped.estimatePrice ? { arv: scraped.estimatePrice } : {}),
      ...(scraped.openingBid ? { askingPrice: scraped.openingBid } : {}),
      ...(scraped.listingType ? { auctionType: scraped.listingType } : {}),
      ...(scraped.startingCreditBid ? { startingCreditBid: scraped.startingCreditBid } : {}),
      ...(scraped.occupancy ? { occupancy: scraped.occupancy } : {}),
      ...(scraped.yearBuilt ? { yearBuilt: scraped.yearBuilt } : {}),
      ...(scraped.auctionFormat ? { auctionFormat: scraped.auctionFormat } : {}),
      ...(scraped.auctionStartAt ? { auctionStartAt: scraped.auctionStartAt } : {}),
      ...(scraped.auctionEndAt ? { auctionEndAt: scraped.auctionEndAt } : {}),
      auctionComingSoon: scraped.auctionComingSoon ?? false,
    }
    if (scraped.livingArea || scraped.beds || scraped.baths) {
      updates.property = {
        ...home.property,
        ...(scraped.livingArea ? { livingArea: scraped.livingArea } : {}),
        ...(scraped.beds ? { bedrooms: scraped.beds } : {}),
        ...(scraped.baths != null ? {
          fullBaths: Math.floor(scraped.baths),
          halfBaths: scraped.baths % 1 >= 0.5 ? 1 : 0,
        } : {}),
      }
    }
  } else {
    const scraped = await scrapeListingUrl(url)
    if (scraped.blocked) throw new Error('Listing site blocked the refresh — try again later')

    updates.photoUrl = scraped.photoUrl ?? home.photoUrl
    updates.funnel = {
      ...home.funnel,
      ...(scraped.listPrice ? { askingPrice: scraped.listPrice } : {}),
      ...(scraped.estimatePrice ? { arv: scraped.estimatePrice } : {}),
      ...(scraped.occupancy ? { occupancy: scraped.occupancy } : {}),
      ...(scraped.yearBuilt ? { yearBuilt: scraped.yearBuilt } : {}),
    }
    if (scraped.livingArea || scraped.beds || scraped.baths) {
      updates.property = {
        ...home.property,
        ...(scraped.livingArea ? { livingArea: scraped.livingArea } : {}),
        ...(scraped.beds ? { bedrooms: scraped.beds } : {}),
        ...(scraped.baths != null ? {
          fullBaths: Math.floor(scraped.baths),
          halfBaths: scraped.baths % 1 >= 0.5 ? 1 : 0,
        } : {}),
      }
    }
  }

  return { ...home, ...updates }
}
