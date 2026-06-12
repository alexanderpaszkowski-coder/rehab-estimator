import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { FunnelStage, HomeFile, IntakeData, PropertyInputs, QuickSystem, Tab } from './types'
import { FunnelBoard } from './components/FunnelBoard'
import { FunnelDetails } from './components/FunnelDetails'
import { PropertyInputs as PropertyInputsView } from './components/PropertyInputs'
import { QuickEstimate } from './components/QuickEstimate'
import { ScopeOfWork } from './components/ScopeOfWork'
import { Summary } from './components/Summary'
import { Auth } from './components/Auth'
import { createHomeFile } from './lib/defaults'
import { migrateHome } from './lib/defaults'
import { exportHomeFile } from './lib/storage'
import { supabase } from './lib/supabase'
import { calcQuickEstimate, calcSowTotals, formatCurrency } from './lib/calculations'
import { SOW_TEMPLATE } from './lib/defaults'
import { exportHomePdf } from './lib/pdf'
import { getSourceLabel, getStageMeta } from './lib/funnel'

const WORKFLOW: { id: Tab; label: string; step: number }[] = [
  { id: 'lead', label: 'Lead & Screen', step: 1 },
  { id: 'property', label: 'Property Inputs', step: 2 },
  { id: 'quick', label: 'Quick Estimate', step: 3 },
  { id: 'sow', label: 'Scope of Work', step: 4 },
  { id: 'summary', label: 'Summary', step: 5 },
]

function upsertInState(homes: HomeFile[], home: HomeFile): HomeFile[] {
  const idx = homes.findIndex((h) => h.id === home.id)
  if (idx >= 0) {
    const next = [...homes]
    next[idx] = home
    return next
  }
  return [...homes, home]
}

async function dbUpsert(home: HomeFile): Promise<void> {
  const { error } = await supabase
    .from('homes')
    .upsert({ id: home.id, data: home, updated_at: home.updatedAt })
  if (error) console.error('Save failed:', error.message)
}

async function dbDelete(id: string): Promise<void> {
  const { error } = await supabase.from('homes').delete().eq('id', id)
  if (error) console.error('Delete failed:', error.message)
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [homes, setHomes] = useState<HomeFile[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('funnel')
  const [saved, setSaved] = useState(false)

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setSessionLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load homes + real-time subscription when authenticated
  useEffect(() => {
    if (!session) return

    supabase
      .from('homes')
      .select('data')
      .then(({ data, error }) => {
        if (error) { console.error('Load failed:', error.message); return }
        setHomes((data ?? []).map((row) => migrateHome(row.data as Partial<HomeFile> & { address: string })))
      })

    const channel = supabase
      .channel('homes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'homes' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const home = migrateHome(payload.new.data as Partial<HomeFile> & { address: string })
            setHomes((prev) => upsertInState(prev, home))
          } else if (payload.eventType === 'DELETE') {
            setHomes((prev) => prev.filter((h) => h.id !== (payload.old as { id: string }).id))
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session])

  const current = homes.find((h) => h.id === currentId) ?? null

  const flashSaved = useCallback(() => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  const updateHome = useCallback(
    (home: HomeFile) => {
      const updated = { ...home, updatedAt: new Date().toISOString() }
      setHomes((prev) => upsertInState(prev, updated))
      flashSaved()
      void dbUpsert(updated)
    },
    [flashSaved],
  )

  const updateCurrent = useCallback(
    (patch: Partial<HomeFile>) => {
      if (!current) return
      updateHome({ ...current, ...patch })
    },
    [current, updateHome],
  )

  const handleCreate = useCallback(
    (data: IntakeData) => {
      const home = createHomeFile(data.address, data)
      const withTs = { ...home, updatedAt: new Date().toISOString() }
      setHomes((prev) => [...prev, withTs])
      flashSaved()
      void dbUpsert(withTs)
    },
    [flashSaved],
  )

  const handleSelect = (home: HomeFile) => {
    setCurrentId(home.id)
    setTab('lead')
  }

  const handleStageChange = (id: string, stage: FunnelStage) => {
    const home = homes.find((h) => h.id === id)
    if (home) updateHome({ ...home, stage })
  }

  const handleDelete = (id: string) => {
    setHomes((prev) => prev.filter((h) => h.id !== id))
    if (currentId === id) {
      setCurrentId(null)
      setTab('funnel')
    }
    void dbDelete(id)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setHomes([])
    setCurrentId(null)
    setTab('funnel')
  }

  const quickTotals = current ? calcQuickEstimate(current.property, current.quickEstimate) : null
  const sowTotals = current ? calcSowTotals(current, SOW_TEMPLATE) : null
  const stageMeta = current ? getStageMeta(current.stage) : null

  if (sessionLoading) {
    return (
      <div className="role-selector-overlay">
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</div>
      </div>
    )
  }

  if (!session) {
    return <Auth onAuthenticated={() => {}} />
  }

  const pendingCount = homes.filter((h) => h.reviewStatus === 'pending').length

  return (
    <div className="app-layout">

      <header className="topnav">
        <div
          className="topnav-logo"
          onClick={() => { setTab('funnel'); setCurrentId(null) }}
        >
          Deal<span>Flow</span>
        </div>

        <nav className="topnav-nav">
          <button
            className={`topnav-item ${tab === 'funnel' ? 'active' : ''}`}
            onClick={() => setTab('funnel')}
          >
            Properties
            {pendingCount > 0 && <span className="topnav-count">{pendingCount}</span>}
          </button>

          {current && (
            <>
              <span className="topnav-sep" />
              {WORKFLOW.map((item) => (
                <button
                  key={item.id}
                  className={`topnav-item topnav-step-item ${tab === item.id ? 'active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  <span className="topnav-step-num">{item.step}</span>
                  {item.label}
                </button>
              ))}
            </>
          )}
        </nav>

        <div className="topnav-end">
          {saved && <span className="save-indicator">✓ Saved</span>}
          <span className="topnav-user">{session.user.email}</span>
          <button className="topnav-home" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="main">
        {current && tab !== 'funnel' && (
          <div className="address-bar">
            <div className="address-bar-left">
              <div className="address-text">
                {[current.address, current.city, current.state, current.zip].filter(Boolean).join(', ')}
              </div>
              <div className="address-tags">
                <span className="source-badge">{getSourceLabel(current)}</span>
                <span className="stage-pill" style={{ background: `${stageMeta?.color}18`, color: stageMeta?.color }}>
                  {stageMeta?.label}
                </span>
                {current.funnel.availableForSale === 'yes' && <span className="avail-tag avail-yes">For sale</span>}
                {current.funnel.availableForSale === 'no' && <span className="avail-tag avail-no">Not for sale</span>}
              </div>
            </div>
            <div className="address-bar-right">
              {quickTotals && quickTotals.withContingency > 0 && (
                <span className="bar-stat">
                  Quick <strong>{formatCurrency(quickTotals.withContingency)}</strong>
                </span>
              )}
              {sowTotals && sowTotals.total > 0 && (
                <span className="bar-stat">
                  SOW <strong>{formatCurrency(sowTotals.total)}</strong>
                </span>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => exportHomeFile(current)}>JSON</button>
              <button className="btn btn-primary btn-sm" onClick={() => exportHomePdf(current)}>PDF</button>
            </div>
          </div>
        )}

        {tab === 'funnel' && (
          <FunnelBoard
            homes={homes}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onStageChange={handleStageChange}
            onDelete={handleDelete}
          />
        )}
        {tab === 'lead' && current && <FunnelDetails home={current} onChange={updateCurrent} />}
        {tab === 'property' && current && (
          <PropertyInputsView home={current} onChange={(p: PropertyInputs) => updateCurrent({ property: p })} />
        )}
        {tab === 'quick' && current && (
          <QuickEstimate home={current} onChange={(q: QuickSystem[]) => updateCurrent({ quickEstimate: q })} />
        )}
        {tab === 'sow' && current && (
          <ScopeOfWork home={current} onChange={(lines) => updateCurrent({ sowLines: lines })} />
        )}
        {tab === 'summary' && current && <Summary home={current} />}
      </main>
    </div>
  )
}
