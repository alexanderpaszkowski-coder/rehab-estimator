import type { HomeFile } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type StreetViewFetchResult =
  | { ok: true; photoUrl: string }
  | { ok: false; error: string }

/** Fetches a Street View photo server-side, uploads to Storage, returns the public URL. */
export async function fetchStreetViewPhoto(home: HomeFile): Promise<StreetViewFetchResult> {
  try {
    // Use anon key directly — avoids failures when the user's session JWT is from a different project
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-street-view`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        homeId: home.id,
        address: home.address,
        city: home.city,
        state: home.state,
      }),
    })

    const result = await res.json() as { photoUrl?: string; error?: string }

    if (!res.ok) {
      console.warn('[streetView] HTTP error:', res.status, result.error)
      return { ok: false, error: result.error ?? `HTTP ${res.status}` }
    }
    if (result.error) {
      console.warn('[streetView] Function returned error:', result.error)
      return { ok: false, error: result.error }
    }
    if (result.photoUrl) return { ok: true, photoUrl: result.photoUrl }

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
