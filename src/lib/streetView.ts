import { supabase } from './supabase'
import type { HomeFile } from '../types'

export type StreetViewFetchResult =
  | { ok: true; photoUrl: string }
  | { ok: false; error: string }

/** Fetches a Street View photo server-side, uploads to Storage, returns the public URL. */
export async function fetchStreetViewPhoto(home: HomeFile): Promise<StreetViewFetchResult> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-street-view', {
      body: {
        homeId: home.id,
        address: home.address,
        city: home.city,
        state: home.state,
      },
    })

    if (error) {
      console.warn('[streetView] Edge function error:', error.message)
      return { ok: false, error: error.message }
    }

    const result = data as { photoUrl?: string; error?: string } | null
    if (result?.error) {
      console.warn('[streetView] Function returned error:', result.error)
      return { ok: false, error: result.error }
    }
    if (result?.photoUrl) return { ok: true, photoUrl: result.photoUrl }

    return { ok: false, error: 'No photo URL returned' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[streetView] Failed:', message)
    return { ok: false, error: message }
  }
}

/** True when this home should auto-fetch a Street View photo. */
export function needsStreetViewPhoto(home: HomeFile): boolean {
  return home.source === 'driving-for-dollars' && !home.photoUrl
}
