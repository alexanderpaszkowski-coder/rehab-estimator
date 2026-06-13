import { useEffect, useState } from 'react'
import type { HomeFile } from '../types'
import { getAuctionCountdown } from '../lib/auctionSchedule'

interface Props {
  home: HomeFile
  compact?: boolean
}

export function AuctionCountdown({ home, compact = false }: Props) {
  const { auctionFormat, auctionStartAt, auctionEndAt, auctionComingSoon } = home.funnel
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  void tick

  if (home.source !== 'auction.com') return null

  const state = getAuctionCountdown(
    auctionStartAt,
    auctionEndAt,
    auctionFormat,
    auctionComingSoon,
  )
  if (!state) return null

  const phaseCls = `auction-countdown--${state.phase}`

  if (compact) {
    return (
      <div className={`auction-countdown auction-countdown--compact ${phaseCls}`}>
        <div className="auction-countdown-top">
          <span className="auction-countdown-format">{state.formatLabel}</span>
          <span className="auction-countdown-phase">{state.label}</span>
        </div>
        <div className="auction-countdown-timer">{state.countdown}</div>
        <div className="auction-countdown-date">{state.scheduleLine}</div>
      </div>
    )
  }

  return (
    <div className={`auction-countdown ${phaseCls}`}>
      <div className="auction-countdown-header">
        <span className="auction-countdown-format">{state.formatLabel} Auction</span>
        <span className={`auction-countdown-badge auction-countdown-badge--${state.phase}`}>
          {state.phase === 'live' ? 'Live' : state.label}
        </span>
      </div>
      {state.phase !== 'coming-soon' && state.phase !== 'ended' && (
        <div className="auction-countdown-timer">{state.countdown}</div>
      )}
      <div className="auction-countdown-date">{state.scheduleLine}</div>
    </div>
  )
}
