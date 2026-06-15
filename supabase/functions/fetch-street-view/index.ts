import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function hasStreetViewImagery(location: string, key: string): Promise<boolean> {
  const params = new URLSearchParams({ location, key })
  const res = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?${params}`)
  if (!res.ok) return false
  const meta = await res.json() as { status?: string }
  return meta.status === 'OK'
}

async function fetchGoogleImage(url: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const imgRes = await fetch(url)
  if (!imgRes.ok) return null
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
  const imageBytes = await imgRes.arrayBuffer()
  if (imageBytes.byteLength < 2000) return null
  return { bytes: imageBytes, contentType }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { homeId, address, city, state } = await req.json() as {
      homeId: string
      address: string
      city?: string
      state?: string
    }

    if (!homeId || !address) {
      return new Response(JSON.stringify({ error: 'homeId and address are required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    if (!googleKey) {
      return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY secret not set' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const fullAddress = [address, city, state].filter(Boolean).join(', ')
    let image: { bytes: ArrayBuffer; contentType: string } | null = null
    let ext = 'jpg'

    // Prefer Street View when available
    if (await hasStreetViewImagery(fullAddress, googleKey)) {
      const svParams = new URLSearchParams({
        size: '640x480',
        location: fullAddress,
        fov: '90',
        pitch: '5',
        key: googleKey,
      })
      image = await fetchGoogleImage(`https://maps.googleapis.com/maps/api/streetview?${svParams}`)
    }

    // Fall back to satellite/aerial when no street-level imagery
    if (!image) {
      const mapParams = new URLSearchParams({
        center: fullAddress,
        zoom: '19',
        size: '640x480',
        maptype: 'satellite',
        markers: `color:red|${fullAddress}`,
        key: googleKey,
      })
      image = await fetchGoogleImage(`https://maps.googleapis.com/maps/api/staticmap?${mapParams}`)
    }

    if (!image) {
      return new Response(JSON.stringify({ error: 'No map imagery available for this address' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (image.contentType.includes('png')) ext = 'png'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, supabaseKey)

    const path = `street-view/${homeId}.${ext}`

    const { error: uploadErr } = await sb.storage
      .from('property-photos')
      .upload(path, image.bytes, {
        contentType: image.contentType,
        upsert: true,
      })

    if (uploadErr) {
      return new Response(JSON.stringify({ error: uploadErr.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data: { publicUrl } } = sb.storage
      .from('property-photos')
      .getPublicUrl(path)

    return new Response(JSON.stringify({ photoUrl: publicUrl }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
