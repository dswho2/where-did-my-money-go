import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getEnrollments, createEnrollment, deleteEnrollment, syncTransactions, updateAccount } from '../lib/api'
import type { Enrollment, Account } from '../lib/types'

const TELLER_APP_ID = import.meta.env.VITE_TELLER_APP_ID ?? ''

function formatBalance(value: string | null, type: string): string {
  if (value === null || value === undefined) return '—'
  const n = parseFloat(value)
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))
  if (type === 'credit') return n > 0 ? formatted : n < 0 ? `-${formatted}` : formatted
  return formatted
}

function labelForDays(days: number): string {
  if (days < 60) return `${days} days`
  if (days < 365) return `${Math.round(days / 30)} months`
  return '1 year'
}

export default function AccountsPage() {
  const { accountTier } = useOutletContext<{ accountTier: string }>()
  const isDemo = accountTier === 'demo'
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [editingNicknameId, setEditingNicknameId] = useState<number | null>(null)
  const [nicknameValue, setNicknameValue] = useState('')
  const nicknameInputRef = useRef<HTMLInputElement>(null)

  // Connect dialog
  const [showDialog, setShowDialog] = useState(false)
  const [daysBack, setDaysBack] = useState(90)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    getEnrollments()
      .then(setEnrollments)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function openTellerConnect() {
    if (!TELLER_APP_ID) {
      setError('VITE_TELLER_APP_ID is not set.')
      return
    }
    if (typeof TellerConnect === 'undefined') {
      setError('Teller Connect SDK failed to load.')
      return
    }
    setShowDialog(false)
    setConnecting(true)
    const tc = TellerConnect.setup({
      applicationId: TELLER_APP_ID,
      onSuccess: async (result) => {
        try {
          const enrollment = await createEnrollment(
            result.accessToken,
            result.enrollment.institution.name,
            daysBack,
          )
          setEnrollments(prev => [enrollment, ...prev])
          setSyncResult(`Connected — imported ${(enrollment as any).synced ?? 0} transactions.`)
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Failed to save enrollment.')
        } finally {
          setConnecting(false)
        }
      },
      onExit: () => setConnecting(false),
      onFailure: () => {
        setError('Teller Connect failed.')
        setConnecting(false)
      },
    })
    tc.open()
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncTransactions()
      setSyncResult(`Synced ${result.synced} new transaction${result.synced !== 1 ? 's' : ''}.`)
    } catch (e: unknown) {
      setSyncResult(`Sync failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect(id: number) {
    setDeletingId(id)
    try {
      await deleteEnrollment(id)
      setEnrollments(prev => prev.filter(e => e.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect.')
    } finally {
      setDeletingId(null)
    }
  }

  function startEditingNickname(account: Account) {
    setEditingNicknameId(account.id)
    setNicknameValue(account.nickname)
    setTimeout(() => nicknameInputRef.current?.focus(), 0)
  }

  async function saveNickname(enrollmentId: number, account: Account) {
    const trimmed = nicknameValue.trim()
    setEditingNicknameId(null)
    if (trimmed === account.nickname) return
    try {
      const updated = await updateAccount(account.id, { nickname: trimmed })
      setEnrollments(prev => prev.map(e =>
        e.id !== enrollmentId ? e : {
          ...e,
          accounts: e.accounts.map(a => a.id === account.id ? { ...a, nickname: updated.nickname } : a),
        }
      ))
    } catch {
      // non-critical, ignore
    }
  }

  async function handleToggleTracked(enrollmentId: number, account: Account) {
    setTogglingId(account.id)
    try {
      const updated = await updateAccount(account.id, { tracked: !account.tracked })
      setEnrollments(prev => prev.map(e =>
        e.id !== enrollmentId ? e : {
          ...e,
          accounts: e.accounts.map(a => a.id === account.id ? { ...a, tracked: updated.tracked } : a),
        }
      ))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update account.')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-medium text-neutral-300">Accounts</h1>
        <div className="flex items-center gap-2">
          {enrollments.length > 0 && (
            <button
              onClick={handleSync}
              disabled={syncing || isDemo}
              className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 text-xs text-neutral-400 rounded hover:text-neutral-200 hover:border-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          )}
          <button
            onClick={() => !isDemo && setShowDialog(true)}
            disabled={connecting || isDemo}
            className="px-3 py-1.5 bg-white text-neutral-900 text-xs font-medium rounded hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {connecting ? 'Connecting...' : 'Connect bank'}
          </button>
        </div>
      </div>

      {syncResult && <p className="text-xs text-neutral-500 mb-3">{syncResult}</p>}
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      {loading && <p className="text-neutral-600 text-sm">Loading...</p>}

      {!loading && enrollments.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-neutral-600">No banks connected yet.</p>
          <p className="text-xs text-neutral-700 mt-1">Click "Connect bank" to link your first account.</p>
        </div>
      )}

      <div className="space-y-5">
        {enrollments.map(enrollment => (
          <div key={enrollment.id}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                {enrollment.institution_name}
              </p>
              <button
                onClick={() => !isDemo && handleDisconnect(enrollment.id)}
                disabled={deletingId === enrollment.id || isDemo}
                className="text-xs text-neutral-700 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deletingId === enrollment.id ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>

            <div className="space-y-1">
              {enrollment.accounts.length === 0 ? (
                <p className="text-xs text-neutral-700 px-4 py-2">No accounts found.</p>
              ) : (
                enrollment.accounts.map(account => (
                  <div
                    key={account.id}
                    className={`bg-neutral-900 border rounded-lg px-4 py-3 flex items-center justify-between transition-colors ${
                      account.tracked ? 'border-neutral-800' : 'border-neutral-800/50 opacity-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1 mr-4">
                      {editingNicknameId === account.id ? (
                        <input
                          ref={nicknameInputRef}
                          value={nicknameValue}
                          onChange={e => setNicknameValue(e.target.value)}
                          onBlur={() => saveNickname(enrollment.id, account)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveNickname(enrollment.id, account)
                            if (e.key === 'Escape') setEditingNicknameId(null)
                          }}
                          placeholder={account.name}
                          className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-0.5 text-sm text-neutral-200 focus:outline-none focus:border-neutral-400 transition-colors"
                        />
                      ) : (
                        <button
                          onClick={() => startEditingNickname(account)}
                          className={`text-left text-sm truncate w-full group/name ${account.tracked ? 'text-neutral-200' : 'text-neutral-500'}`}
                          title="Click to set nickname"
                        >
                          {account.nickname || account.name}
                          <span className="ml-1.5 text-neutral-700 opacity-0 group-hover/name:opacity-100 transition-opacity text-xs">rename</span>
                        </button>
                      )}
                      <p className="text-xs text-neutral-600 capitalize mt-0.5">
                        {account.nickname ? account.name + ' · ' : ''}{account.account_type}{account.last_four ? ` - ${account.last_four}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={`text-sm font-medium tabular-nums ${account.tracked ? 'text-neutral-200' : 'text-neutral-600'}`}>
                          {formatBalance(account.balance_ledger, account.account_type)}
                        </p>
                        {account.account_type === 'credit' && account.balance_available !== null && (
                          <p className="text-xs text-neutral-600 mt-0.5">
                            {formatBalance(account.balance_available, 'depository')} available
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => handleToggleTracked(enrollment.id, account)}
                        disabled={togglingId === account.id}
                        title={account.tracked ? 'Stop tracking' : 'Track this account'}
                        className={`relative w-8 h-4.5 rounded-full transition-colors disabled:opacity-50 focus:outline-none ${
                          account.tracked ? 'bg-white' : 'bg-neutral-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full transition-transform ${
                            account.tracked ? 'bg-neutral-900 translate-x-3.5' : 'bg-neutral-400 translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Connect dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDialog(false)} />
          <div className="relative bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-[calc(100vw-2rem)] max-w-sm shadow-2xl">
            <h2 className="text-sm font-semibold text-neutral-100 mb-1">Connect a bank</h2>
            <p className="text-xs text-neutral-500 mb-6">How far back should we import transactions?</p>

            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-neutral-500">History</span>
              <span className="text-xs font-medium text-neutral-200">Last {labelForDays(daysBack)}</span>
            </div>

            <input
              type="range"
              min={30}
              max={365}
              step={30}
              value={daysBack}
              onChange={e => setDaysBack(Number(e.target.value))}
              className="w-full accent-white mb-1"
            />
            <div className="flex justify-between text-xs text-neutral-700 mb-6">
              <span>30d</span>
              <span>6mo</span>
              <span>1yr</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowDialog(false)}
                className="flex-1 py-2 text-xs text-neutral-500 bg-neutral-800 border border-neutral-700 rounded-lg hover:text-neutral-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={openTellerConnect}
                className="flex-1 py-2 text-xs font-semibold text-neutral-900 bg-white rounded-lg hover:bg-neutral-100 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
