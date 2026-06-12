import type { HomeFile } from '../types'
import { migrateHome } from './defaults'
import { slugifyAddress } from './calculations'

export function exportHomeFile(home: HomeFile): void {
  const slug = slugifyAddress(home) || 'rehab-project'
  const blob = new Blob([JSON.stringify(home, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importHomeFile(file: File): Promise<HomeFile> {
  const text = await file.text()
  const parsed = JSON.parse(text) as HomeFile
  if (!parsed.address) {
    throw new Error('Invalid home file — missing address')
  }
  return migrateHome({
    ...parsed,
    id: parsed.id || crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  })
}
