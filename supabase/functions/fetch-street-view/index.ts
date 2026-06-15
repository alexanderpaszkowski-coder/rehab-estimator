import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Build full address string
    const fullAddress = [address, city, state].filter(Boolean).join(', ')
    const params = new URLSearchParams({
      size: '640x480',
      location: fullAddress,
      fov: '90',
      pitch: '5',
      key: googleKey,
    })

    const svUrl = `https://maps.googleapis.com/maps/api/streetview?${params}`
    const imgRes = await fetch(svUrl)

    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: `Street View fetch failed: ${imgRes.status}` }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Check if Google returned the "no imagery" grey placeholder (it's a specific small PNG)
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const imageBytes = await imgRes.arrayBuffer()

    // Google's "no imagery available" image is always exactly 8267 bytes
    if (imageBytes.byteLength < 2000) {
      return new Response(JSON.stringify({ error: 'No Street View imagery available for this address' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Upload to Supabase Storage
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, supabaseKey)

    const ext = contentType.includes('png') ? 'png' : 'jpg'
    const path = `street-view/${homeId}.${ext}`

    const { error: uploadErr } = await sb.storage
      .from('property-photos')
      .upload(path, imageBytes, {
        contentType,
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
