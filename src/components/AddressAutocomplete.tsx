import { useEffect, useRef, useState } from 'react'

interface NominatimResult {
  place_id: number
  display_name: string
  address: {
    house_number?: string
    road?: string
    neighbourhood?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    municipality?: string
    county?: string
    state?: string
    postcode?: string
    country_code?: string
  }
}

export interface AddressFill {
  street: string
  city: string
  state: string
  zip: string
}

interface Props {
  value: string
  onChange: (raw: string) => void
  onSelect: (fill: AddressFill) => void
  onBlur?: () => void
  placeholder?: string
  autoFocus?: boolean
}

const STATE_ABBREV: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN',
  Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'District of Columbia': 'DC',
}

function parseResult(r: NominatimResult): AddressFill {
  const a = r.address
  const houseNum = a.house_number ?? ''
  const road = a.road ?? ''
  const street = [houseNum, road].filter(Boolean).join(' ')
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? ''
  const stateFull = a.state ?? ''
  const state = STATE_ABBREV[stateFull] ?? stateFull.slice(0, 2).toUpperCase()
  const zip = a.postcode?.split('-')[0] ?? ''
  return { street, city, state, zip }
}

function formatSuggestion(r: NominatimResult): string {
  const fill = parseResult(r)
  const parts = [fill.street, fill.city, fill.state, fill.zip].filter(Boolean)
  return parts.length >= 2 ? parts.join(', ') : r.display_name
}

export function AddressAutocomplete({ value, onChange, onSelect, onBlur, placeholder, autoFocus }: Props) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const ignoreNext = useRef(false)

  useEffect(() => {
    const q = value.trim()
    if (ignoreNext.current) { ignoreNext.current = false; return }
    if (q.length < 4) { setSuggestions([]); setOpen(false); return }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url = new URL('https://nominatim.openstreetmap.org/search')
        url.searchParams.set('q', q)
        url.searchParams.set('format', 'jsonv2')
        url.searchParams.set('addressdetails', '1')
        url.searchParams.set('limit', '7')
        url.searchParams.set('countrycodes', 'us')
        url.searchParams.set('featuretype', 'house')

        const res = await fetch(url.toString(), {
          headers: { 'Accept-Language': 'en-US', 'User-Agent': 'RehabEstimator/1.0' },
        })
        if (!res.ok) return
        const data: NominatimResult[] = await res.json()

        // filter to results that have a road (actual addresses, not just cities)
        const withStreet = data.filter((r) => r.address.road)
        setSuggestions(withStreet.slice(0, 6))
        setOpen(withStreet.length > 0)
        setActive(-1)
      } catch {
        // silently ignore network errors
      } finally {
        setLoading(false)
      }
    }, 320)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value])

  const commit = (r: NominatimResult) => {
    const fill = parseResult(r)
    ignoreNext.current = true
    onChange(fill.street)
    onSelect(fill)
    setSuggestions([])
    setOpen(false)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, -1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      commit(suggestions[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  // close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.closest('.ac-wrap')?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="ac-wrap">
      <div className="ac-input-row">
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          type="text"
          value={value}
          placeholder={placeholder ?? '123 Main St'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={onBlur}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <span className="ac-spinner" />}
      </div>
      {open && suggestions.length > 0 && (
        <ul ref={listRef} className="ac-dropdown" role="listbox">
          {suggestions.map((r, i) => (
            <li
              key={r.place_id}
              role="option"
              aria-selected={i === active}
              className={`ac-item ${i === active ? 'ac-active' : ''}`}
              onMouseDown={() => commit(r)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="ac-street">{formatSuggestion(r)}</span>
            </li>
          ))}
          <li className="ac-footer">Powered by OpenStreetMap</li>
        </ul>
      )}
    </div>
  )
}
