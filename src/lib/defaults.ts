import templateData from '../data/template.json'
import { DEFAULT_FUNNEL, normalizeStage } from './funnel'
import type { FunnelScreen, HomeFile, IntakeData, PropertyInputs, QuickSystem, SowItem } from '../types'

const template = templateData as {
  quickEstimateSystems: QuickSystem[]
  sowItems: SowItem[]
}

export const FINISH_FACTORS: Record<string, number> = {
  Rental: 0.85,
  'Flip-Builder': 1.0,
  Premium: 1.25,
}

export const FINISH_CATEGORIES = new Set([
  'Kitchen',
  'Bathrooms',
  'Flooring',
  'Interior Paint',
  'Interior Doors, Trim & Closets',
  'Exterior & Curb Appeal',
])

export const DEFAULT_PROPERTY: PropertyInputs = {
  livingArea: 0,
  basementArea: 0,
  roofArea: 0,
  sidingArea: 0,
  ceilingHeight: 8,
  windows: 0,
  exteriorDoors: 0,
  interiorDoors: 0,
  fullBaths: 0,
  halfBaths: 0,
  bedrooms: 0,
  baseCabinets: null,
  wallCabinets: null,
  countertops: null,
  finishGrade: 'Flip-Builder',
  contingency: 0.15,
  marketAdj: 1,
}

export function createDefaultQuickEstimate(rehabLevel?: 'Light' | 'Moderate' | 'Heavy' | null): QuickSystem[] {
  return template.quickEstimateSystems.map((s) => ({
    ...s,
    condition: (rehabLevel ?? s.condition) as QuickSystem['condition'],
    qty: s.qty ?? '',
  }))
}

export function createEmptySowLines() {
  const lines: HomeFile['sowLines'] = {}
  for (const item of template.sowItems) {
    if (item.type === 'line' && item.id) {
      lines[item.id] = { qty: '', bid: '', actual: '', notes: '' }
    }
  }
  return lines
}

export function createHomeFile(address: string, intake?: Partial<IntakeData>): HomeFile {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    address: (intake?.address ?? address).trim(),
    city: intake?.city ?? '',
    state: intake?.state ?? '',
    zip: intake?.zip ?? '',
    source: intake?.source ?? 'other',
    sourceCustom: intake?.sourceCustom ?? '',
    stage: 'lead',
    funnel: { ...DEFAULT_FUNNEL, ...intake?.funnel },
    createdAt: now,
    updatedAt: now,
    property: {
      ...DEFAULT_PROPERTY,
      ...(intake?.livingArea ? { livingArea: intake.livingArea } : {}),
    },
    quickEstimate: createDefaultQuickEstimate(intake?.funnel?.rehabLevel),
    sowLines: createEmptySowLines(),
    notes: '',
    submittedBy: intake?.submittedBy ?? 'reviewer',
    reviewStatus: 'pending',
    reviewNotes: '',
    links: intake?.links ?? [],
    photoUrl: intake?.photoUrl,
  }
}

export function migrateHome(raw: Partial<HomeFile> & { address: string }): HomeFile {
  const base = createHomeFile(raw.address)
  const merged: HomeFile = {
    ...base,
    ...raw,
    funnel: { ...DEFAULT_FUNNEL, ...(raw.funnel as FunnelScreen | undefined) },
    source: raw.source ?? 'other',
    sourceCustom: raw.sourceCustom ?? '',
    stage: normalizeStage(raw.stage ?? 'lead'),
    property: { ...DEFAULT_PROPERTY, ...raw.property },
    quickEstimate: raw.quickEstimate ?? base.quickEstimate,
    sowLines: { ...base.sowLines, ...raw.sowLines },
    submittedBy: raw.submittedBy ?? 'reviewer',
    reviewStatus: raw.reviewStatus ?? 'pending',
    reviewNotes: raw.reviewNotes ?? '',
    links: raw.links ?? [],
  }
  return merged
}

export const SOW_TEMPLATE = template.sowItems
export const QUICK_TEMPLATE = template.quickEstimateSystems
