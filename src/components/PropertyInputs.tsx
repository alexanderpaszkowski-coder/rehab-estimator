import type { HomeFile, PropertyInputs as PropertyInputsType } from '../types'
import { autoKitchenLf } from '../lib/calculations'
import { CopyButton } from './CopyButton'
import { copyPropertyInputs } from '../lib/copyContent'

interface Props {
  home: HomeFile
  onChange: (property: PropertyInputsType) => void
}

const SECTIONS = [
  { key: 'measurements', title: 'Measurements' },
  { key: 'counts', title: 'Counts' },
  { key: 'kitchen', title: 'Kitchen (auto if blank)' },
  { key: 'settings', title: 'Project Settings' },
] as const

export function PropertyInputs({ home, onChange }: Props) {
  const p = home.property

  const update = (key: keyof PropertyInputsType, value: string | number) => {
    onChange({ ...p, [key]: value })
  }

  const fields: {
    key: keyof PropertyInputsType
    label: string
    unit: string
    hint: string
    section: string
    type?: 'select'
    options?: string[]
  }[] = [
    { key: 'livingArea', label: 'Above-grade living area', unit: 'SF', hint: 'Finished sqft, excludes basement & garage', section: 'measurements' },
    { key: 'basementArea', label: 'Finished basement area', unit: 'SF', hint: 'Area you will finish/refinish', section: 'measurements' },
    { key: 'roofArea', label: 'Roof area', unit: 'SQ', hint: '1 SQ = 100 sqft', section: 'measurements' },
    { key: 'sidingArea', label: 'Exterior wall / siding area', unit: 'SF', hint: 'Wall area minus openings', section: 'measurements' },
    { key: 'ceilingHeight', label: 'Ceiling height', unit: 'FT', hint: 'Typical 8', section: 'measurements' },
    { key: 'windows', label: 'Windows', unit: 'EA', hint: 'Count every opening', section: 'counts' },
    { key: 'exteriorDoors', label: 'Exterior doors', unit: 'EA', hint: 'Entry + back + service', section: 'counts' },
    { key: 'interiorDoors', label: 'Interior doors', unit: 'EA', hint: 'Bedrooms, baths, closets', section: 'counts' },
    { key: 'fullBaths', label: 'Full bathrooms', unit: 'EA', hint: '', section: 'counts' },
    { key: 'halfBaths', label: 'Half bathrooms', unit: 'EA', hint: '', section: 'counts' },
    { key: 'bedrooms', label: 'Bedrooms', unit: 'EA', hint: '', section: 'counts' },
    { key: 'baseCabinets', label: 'Base cabinet run', unit: 'LF', hint: `Auto: ${autoKitchenLf(p.livingArea, 7)} LF`, section: 'kitchen' },
    { key: 'wallCabinets', label: 'Wall cabinet run', unit: 'LF', hint: `Auto: ${autoKitchenLf(p.livingArea, 6)} LF`, section: 'kitchen' },
    { key: 'countertops', label: 'Countertop run', unit: 'LF', hint: `Auto: ${autoKitchenLf(p.livingArea, 8)} LF`, section: 'kitchen' },
    { key: 'finishGrade', label: 'Finish grade', unit: '', hint: 'Scales finish categories', section: 'settings', type: 'select', options: ['Rental', 'Flip-Builder', 'Premium'] },
    { key: 'contingency', label: 'Contingency', unit: '%', hint: '10–25% depending on unknowns', section: 'settings' },
    { key: 'marketAdj', label: 'Labor market adjustment', unit: '×', hint: '1.00 national; Chicago ~1.10', section: 'settings' },
  ]

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Property Inputs</h1>
            <p>Fill these once per property. Both estimate tabs feed from here.</p>
          </div>
          <CopyButton getText={() => copyPropertyInputs(home)} />
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.key} className="card">
          <h2>{section.title}</h2>
          <div className="field-grid">
            {fields
              .filter((f) => f.section === section.key)
              .map((f) => (
                <div key={f.key} className="field">
                  <label>
                    {f.label} {f.unit && <span className="unit">({f.unit})</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select
                      value={String(p[f.key])}
                      onChange={(e) => update(f.key, e.target.value)}
                    >
                      {f.options!.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      step={f.key === 'contingency' || f.key === 'marketAdj' ? '0.01' : '1'}
                      value={p[f.key] == null ? '' : String(p[f.key])}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '') {
                          if (f.key === 'baseCabinets' || f.key === 'wallCabinets' || f.key === 'countertops') {
                            update(f.key, null as unknown as number)
                          } else {
                            update(f.key, 0)
                          }
                        } else {
                          update(f.key, parseFloat(val))
                        }
                      }}
                      placeholder={f.key.includes('Cabinets') || f.key === 'countertops' ? 'Auto' : '0'}
                    />
                  )}
                  {f.hint && <p className="hint">{f.hint}</p>}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
