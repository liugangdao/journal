import { useState, useEffect, useCallback, useMemo } from 'react'
import Layout from './components/Layout'
import TradeForm, { emptyTrade } from './components/TradeForm'
import TradeTable from './components/TradeTable'
import Dashboard from './components/Dashboard'
import WeeklyNotes from './components/WeeklyNotes'
import MonthlyNotes from './components/MonthlyNotes'
import OpenPositions from './components/OpenPositions'
import TradingViewChart from './components/TradingViewChart'
import PsychologyPanel from './components/PsychologyPanel'
import ExportBar from './components/ExportBar'
import TradeFilter from './components/TradeFilter'
import Settings from './components/Settings'
import Policies from './components/Policies'
import NotesTab from './components/NotesTab'
import MoreTab from './components/MoreTab'
import PwaPrompt from './components/PwaPrompt'
import { useStore } from './hooks/useStore'
import { useStoreAdapter } from './hooks/useStoreAdapter'
import { useMigrationTrigger } from './hooks/useMigrationTrigger'
import SignInButton from './components/SignInButton'
import { en } from './i18n/en'
import { useTheme } from './hooks/useTheme'
import { ToastProvider, useToast } from './components/ui/Toast'
import { SkeletonKpi, SkeletonCard, SkeletonChart } from './components/ui/Skeleton'
import ConfirmDialog from './components/ui/ConfirmDialog'
import { SAMPLE_TRADES } from './lib/sampleTrades'


function AppContent() {
  const [allTrades, setAllTrades] = useState([])
  const [pagedTrades, setPagedTrades] = useState([])
  const [tradePagination, setTradePagination] = useState({ total: 0, limit: 20, offset: 0 })
  const [tradeFilter, setTradeFilter] = useState({ date_from: null, date_to: null, pair: null, direction: null })
  const [notes, setNotes] = useState([])
  const [monthlyNotes, setMonthlyNotes] = useState([])
  const [tab, setTab] = useState("stats")
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [closingId, setClosingId] = useState(null)
  const [editViolations, setEditViolations] = useState([])
  const [pairs, setPairs] = useState([])
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const toast = useToast()
  const [confirmState, setConfirmState] = useState({ open: false, id: null, type: null })

  const { store, isAuthenticated, userEmail, loading: storeLoading } = useStore()
  const storeAdapter = useStoreAdapter(store)
  const [migrationStatus, setMigrationStatus] = useState('idle')
  useMigrationTrigger(setMigrationStatus)

  // Load data when authenticated
  const fetchPagedTrades = useCallback((filter, offset = 0) => {
    const params = { limit: 20, offset, sort: 'open_time', order: 'desc' }
    if (filter.date_from) params.date_from = filter.date_from
    if (filter.date_to) params.date_to = filter.date_to
    if (filter.pair) params.pair = filter.pair
    if (filter.direction) params.direction = filter.direction
    return storeAdapter.getTrades(params).then(result => {
      setPagedTrades(result.trades)
      setTradePagination({ total: result.total, limit: result.limit, offset: result.offset })
    })
  }, [storeAdapter])

  const reloadData = useCallback(() => {
    return Promise.all([
      storeAdapter.getTrades(),
      storeAdapter.getNotes(), storeAdapter.getMonthlyNotes(), storeAdapter.getPairs(), storeAdapter.getPolicies()
    ]).then(([allResult, n, mn, p, pol]) => {
      setAllTrades(allResult.trades)
      setNotes(n); setMonthlyNotes(mn); setPairs(p); setPolicies(pol)
    }).catch(console.error)
  }, [storeAdapter])

  useEffect(() => {
    if (storeLoading) return
    setLoading(true)
    Promise.all([reloadData(), fetchPagedTrades(tradeFilter)]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoading, isAuthenticated, migrationStatus])

  const handleLogout = useCallback(async () => {
    try {
      await storeAdapter.logout()
    } catch (err) {
      console.error(err)
    }
    setAllTrades([])
    setPagedTrades([])
    setTradePagination({ total: 0, limit: 20, offset: 0 })
    setTradeFilter({ date_from: null, date_to: null, pair: null, direction: null })
    setNotes([])
    setMonthlyNotes([])
    setPairs([])
    setPolicies([])
    window.location.reload()
  }, [storeAdapter])

  const handleFilterChange = useCallback((newFilter) => {
    setTradeFilter(newFilter)
    fetchPagedTrades(newFilter, 0)
  }, [fetchPagedTrades])

  const handlePageChange = useCallback((newOffset) => {
    fetchPagedTrades(tradeFilter, newOffset)
  }, [tradeFilter, fetchPagedTrades])

  // Derived data
  const openTrades = useMemo(() => allTrades.filter(t => t.status === 'open'), [allTrades])
  const closedTrades = useMemo(() => allTrades.filter(t => t.status === 'closed'), [allTrades])
  const pairNames = useMemo(() => pairs.map(p => p.name), [pairs])
  const pairsByName = useMemo(() => new Map(pairs.map((p) => [p.name, p])), [pairs])

  // Sample-mode: when the user has zero trades of their own, the Stats tab
  // shows hardcoded sample trades so the dashboard isn't an empty shell on
  // first visit. Switches off the moment the user logs a real trade.
  const isSampleMode = allTrades.length === 0
  const dashboardTrades = isSampleMode ? SAMPLE_TRADES : closedTrades

  // Trade CRUD — all IDs are external_id strings (stable across LocalStore/ApiStore)
  const handleAddTrade = useCallback(async (form) => {
    try {
      const { violations, ...tradeData } = form
      if (editing) {
        await storeAdapter.updateTrade(editing, tradeData)
        await storeAdapter.updateTradeViolations(editing, violations || [])
        setEditing(null)
      } else {
        const created = await storeAdapter.createTrade(tradeData)
        if (violations && violations.length > 0) {
          await storeAdapter.updateTradeViolations(created.external_id, violations)
        }
      }
      setShowForm(false)
      setEditViolations([])
      reloadData()
      fetchPagedTrades(tradeFilter, tradePagination.offset)
      toast.success(editing ? en.toasts.tradeUpdated : en.toasts.tradeCreated)
    } catch (err) {
      console.error(err)
      toast.error(en.toasts.opFailed)
    }
  }, [editing, toast, storeAdapter])

  const handleCloseTrade = useCallback((trade) => {
    setClosingId(trade.external_id)
    setEditing(null)
    setShowForm(true)
  }, [])

  const handleCloseSubmit = useCallback(async (form) => {
    try {
      const { violations, ...tradeData } = form
      await storeAdapter.updateTrade(closingId, { ...tradeData, status: 'closed' })
      await storeAdapter.updateTradeViolations(closingId, violations || [])
      setClosingId(null)
      setShowForm(false)
      reloadData()
      fetchPagedTrades(tradeFilter, tradePagination.offset)
      toast.success(en.toasts.tradeClosed)
    } catch (err) {
      console.error(err)
      toast.error(en.toasts.closeFailed)
    }
  }, [closingId, toast, storeAdapter])

  const handleEditTrade = useCallback(async (trade) => {
    setEditing(trade.external_id)
    setClosingId(null)
    setTab("record")
    try {
      const violations = await storeAdapter.getTradeViolations(trade.external_id)
      setEditViolations(violations.map(v => v.policy_external_id))
    } catch (err) {
      console.error(err)
      setEditViolations([])
    }
    setShowForm(true)
  }, [storeAdapter])

  const handleDeleteTrade = useCallback(async (id) => {
    try {
      await storeAdapter.deleteTrade(id)
      reloadData()
      fetchPagedTrades(tradeFilter, tradePagination.offset)
      toast.success(en.toasts.tradeDeleted)
    } catch (err) {
      console.error(err)
      toast.error(en.toasts.deleteFailed)
    }
  }, [toast, storeAdapter])

  const handleCancelForm = useCallback(() => {
    setShowForm(false)
    setEditing(null)
    setClosingId(null)
    setEditViolations([])
  }, [])

  const handleNewTrade = useCallback(() => {
    setEditing(null)
    setClosingId(null)
    setEditViolations([])
    setShowForm(true)
  }, [])

  const handleAddMissed = useCallback(async (form) => {
    try {
      await storeAdapter.createTrade(form)
      reloadData()
      fetchPagedTrades(tradeFilter, tradePagination.offset)
      toast.success(en.toasts.missedAdded)
    } catch (err) {
      console.error(err)
      toast.error(en.toasts.opFailed)
    }
  }, [toast, storeAdapter])

  // Notes CRUD
  const handleAddNote = useCallback(async (form) => {
    try {
      const created = await storeAdapter.createNote(form)
      setNotes(prev => [created, ...prev])
      toast.success(en.toasts.noteSaved)
    } catch (err) {
      console.error(err)
      toast.error(en.toasts.saveFailed)
    }
  }, [toast, storeAdapter])

  const handleDeleteNote = useCallback(async (externalId) => {
    try {
      await storeAdapter.deleteNote(externalId)
      setNotes(prev => prev.filter(n => n.external_id !== externalId))
      toast.success(en.toasts.tradeDeleted)
    } catch (err) {
      console.error(err)
      toast.error(en.toasts.deleteFailed)
    }
  }, [toast, storeAdapter])

  // Monthly Notes CRUD
  const handleAddMonthlyNote = useCallback(async (form) => {
    try {
      const created = await storeAdapter.createMonthlyNote(form)
      setMonthlyNotes(prev => [created, ...prev])
      toast.success(en.toasts.noteSaved)
    } catch (err) {
      console.error(err)
      toast.error(en.toasts.saveFailed)
    }
  }, [toast, storeAdapter])

  const handleDeleteMonthlyNote = useCallback(async (externalId) => {
    try {
      await storeAdapter.deleteMonthlyNote(externalId)
      setMonthlyNotes(prev => prev.filter(n => n.external_id !== externalId))
      toast.success(en.toasts.tradeDeleted)
    } catch (err) {
      console.error(err)
      toast.error(en.toasts.deleteFailed)
    }
  }, [toast, storeAdapter])

  // Delete confirmation
  const requestDelete = useCallback((id, type) => {
    setConfirmState({ open: true, id, type })
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    const { id, type } = confirmState
    setConfirmState({ open: false, id: null, type: null })
    if (type === 'trade') await handleDeleteTrade(id)
    else if (type === 'note') await handleDeleteNote(id)
    else if (type === 'monthlyNote') await handleDeleteMonthlyNote(id)
  }, [confirmState, handleDeleteTrade, handleDeleteNote, handleDeleteMonthlyNote])

  const cancelDelete = useCallback(() => {
    setConfirmState({ open: false, id: null, type: null })
  }, [])

  const confirmDeleteTrade = useCallback((id) => requestDelete(id, 'trade'), [requestDelete])
  const confirmDeleteNote = useCallback((id) => requestDelete(id, 'note'), [requestDelete])
  const confirmDeleteMonthlyNote = useCallback((id) => requestDelete(id, 'monthlyNote'), [requestDelete])

  // Determine form mode and initial data. closingId/editing are external_id strings.
  const formMode = closingId ? "close" : editing ? "edit" : "new"
  const formInitial = closingId
    ? allTrades.find(t => t.external_id === closingId)
    : editing
      ? allTrades.find(t => t.external_id === editing)
      : emptyTrade(pairNames)

  // Loading auth check
  if (storeLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-muted">
        {en.common.loading}
      </div>
    )
  }

  // Logged in - loading data
  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text font-sans">
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="h-5 w-24 bg-border/60 rounded animate-pulse mb-1" />
            <div className="h-3 w-48 bg-border/40 rounded animate-pulse" />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <div className="flex gap-3 flex-wrap mb-6">
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonChart />
            <SkeletonChart />
          </div>
        </div>
      </div>
    )
  }

  // Mobile tab content renderer
  const mobileTabContent = (() => {
    switch (tab) {
      case 'record': return (
        <div>
          <TradeFilter filter={tradeFilter} onChange={handleFilterChange} pairs={pairNames} />
          <PsychologyPanel
            trades={allTrades}
            pairs={pairNames}
            pairsByName={pairsByName}
            onAddMissed={handleAddMissed}
            onDeleteTrade={confirmDeleteTrade}
          />
          <OpenPositions openTrades={openTrades} onClose={handleCloseTrade} onDelete={confirmDeleteTrade} />
          <TradeTable trades={pagedTrades.filter(t => t.status === 'closed')} onEdit={handleEditTrade} onDelete={confirmDeleteTrade} pairsByName={pairsByName} pagination={tradePagination} onPageChange={handlePageChange} />
        </div>
      )
      case 'stats': return <Dashboard trades={dashboardTrades} pairs={pairs} theme={theme} isSampleMode={isSampleMode} onRecordCta={() => setTab('record')} />
      case 'notes': return (
        <NotesTab
          notes={notes} monthlyNotes={monthlyNotes}
          onAddNote={handleAddNote} onDeleteNote={confirmDeleteNote}
          onAddMonthlyNote={handleAddMonthlyNote} onDeleteMonthlyNote={confirmDeleteMonthlyNote}
        />
      )
      case 'more': return (
        <MoreTab
          pairs={pairs} onPairsChange={setPairs}
          policies={policies} setPolicies={setPolicies} storeAdapter={storeAdapter}
          onImported={reloadData}
          theme={theme} onToggleTheme={toggleTheme} user={isAuthenticated ? { email: userEmail } : null} onLogout={handleLogout}
        />
      )
      default: return null
    }
  })()

  return (
    <Layout
      tab={tab} setTab={setTab} tradeCount={closedTrades.length} openCount={openTrades.length}
      theme={theme} onToggleTheme={toggleTheme} user={isAuthenticated ? { email: userEmail } : null} signInSlot={!isAuthenticated ? <SignInButton /> : null} onLogout={handleLogout}
      // Mobile sheet props
      showForm={showForm} formMode={formMode} formInitial={formInitial}
      onNewTrade={handleNewTrade} onFormSubmit={closingId ? handleCloseSubmit : handleAddTrade}
      onFormCancel={handleCancelForm}
      pairs={pairNames} pairsByName={pairsByName} policies={policies} editViolations={editViolations}
      editing={editing} closingId={closingId}
      mobileTabContent={mobileTabContent}
      overlays={
        <>
          <PwaPrompt />
          <ConfirmDialog
            open={confirmState.open}
            title={en.confirm.deleteTitle}
            message={en.confirm.deleteMessage}
            onConfirm={handleConfirmDelete}
            onCancel={cancelDelete}
          />
        </>
      }
    >
      {/* Desktop tab content */}
      {migrationStatus === 'running' && (
        <div className="bg-amber-500 text-neutral-950 px-4 py-2 text-sm rounded mb-4">{en.migration.running}</div>
      )}
      {migrationStatus === 'error' && (
        <div className="bg-red-500 text-white px-4 py-2 text-sm rounded mb-4">{en.migration.error}</div>
      )}
      <div key={tab} className="tab-enter">
        {tab === "record" && (
          <div>
            <TradeFilter filter={tradeFilter} onChange={handleFilterChange} pairs={pairNames} />
            <ExportBar storeAdapter={storeAdapter} onImported={reloadData} />
            <PsychologyPanel
              trades={allTrades}
              pairs={pairNames}
              pairsByName={pairsByName}
              onAddMissed={handleAddMissed}
              onDeleteTrade={confirmDeleteTrade}
            />
            <TradingViewChart key={theme} theme={theme} />
            <OpenPositions openTrades={openTrades} onClose={handleCloseTrade} onDelete={confirmDeleteTrade} />
            {!showForm && (
              <button
                onClick={() => { setEditing(null); setClosingId(null); setShowForm(true) }}
                className="bg-accent text-white px-6 py-3 rounded-xl text-sm font-semibold cursor-pointer
                  hover:brightness-110 transition-all duration-200 mb-5">
                + {en.trade.recordTitle}
              </button>
            )}
            {showForm && (
              <TradeForm
                key={editing || closingId || 'new'}
                initial={formInitial}
                editing={!!editing}
                mode={formMode}
                pairs={pairNames}
                pairsByName={pairsByName}
                policies={policies}
                initialViolations={editing ? editViolations : []}
                onSubmit={closingId ? handleCloseSubmit : handleAddTrade}
                onCancel={handleCancelForm}
              />
            )}
            <TradeTable trades={pagedTrades.filter(t => t.status === 'closed')} onEdit={handleEditTrade} onDelete={confirmDeleteTrade} pairsByName={pairsByName} pagination={tradePagination} onPageChange={handlePageChange} />
          </div>
        )}
        {tab === "stats" && <Dashboard trades={dashboardTrades} pairs={pairs} theme={theme} isSampleMode={isSampleMode} onRecordCta={() => setTab('record')} />}
        {tab === "weekly" && <WeeklyNotes notes={notes} onAdd={handleAddNote} onDelete={confirmDeleteNote} />}
        {tab === "monthly" && <MonthlyNotes notes={monthlyNotes} onAdd={handleAddMonthlyNote} onDelete={confirmDeleteMonthlyNote} />}
        {tab === "policy" && <Policies policies={policies} setPolicies={setPolicies} storeAdapter={storeAdapter} />}
        {tab === "settings" && <Settings pairs={pairs} onPairsChange={setPairs} storeAdapter={storeAdapter} />}
      </div>
    </Layout>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
