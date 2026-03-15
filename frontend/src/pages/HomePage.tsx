import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard, getAccounts } from '../lib/api'
import type { DashboardData, Account } from '../lib/types'

function monthOptions() {
  const months: { value: string; label: string; year: number; month: number }[] = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    })
  }
  return months
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtExact = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

function formatBalance(val: string | null) {
  if (val == null) return '—'
  const n = parseFloat(val)
  return isNaN(n) ? '—' : fmtExact(Math.abs(n))
}

function addMonths(year: number, month: number, delta: number): [number, number] {
  let m = month + delta
  let y = year
  while (m > 12) { m -= 12; y++ }
  while (m < 1) { m += 12; y-- }
  return [y, m]
}

function toMonthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export default function HomePage() {
  const now = new Date()
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<Omit<DashboardData, 'accounts'> | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const monthPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!monthPickerOpen) return
    function handleClick(e: MouseEvent) {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) {
        setMonthPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [monthPickerOpen])

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const isCurrentMonth = selYear === currentYear && selMonth === currentMonth
  const monthParam = toMonthParam(selYear, selMonth)

  useEffect(() => {
    getAccounts().then(accts => setAccounts(accts.filter(a => a.tracked))).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    getDashboard(monthParam)
      .then(d => setData({ review_count: d.review_count, month: d.month, avg_6m: d.avg_6m }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [monthParam])

  function goMonth(delta: number) {
    const [y, m] = addMonths(selYear, selMonth, delta)
    // Don't navigate into the future
    if (y > currentYear || (y === currentYear && m > currentMonth)) return
    setSelYear(y)
    setSelMonth(m)
  }

  const { review_count, month, avg_6m } = data ?? {}
  const maxCatTotal = month?.top_categories[0]?.total ?? 1
  const pctVsAvg = avg_6m && avg_6m > 0 && month
    ? ((month.total - avg_6m) / avg_6m) * 100
    : null

  return (
    <div className="space-y-4">

      {/* Review queue banner */}
      {(
        <Link to="/review" className="block bg-neutral-900 border border-neutral-700 rounded-xl px-5 py-4 hover:border-neutral-500 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {review_count ? `${review_count} transaction${review_count !== 1 ? 's' : ''} need review` : 'No transactions need review'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">Tap to categorize</p>
            </div>
            <span className="text-neutral-500 group-hover:text-neutral-300 transition-colors text-lg">→</span>
          </div>
        </Link>
      )}

      {/* Month snapshot */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goMonth(-1)}
              className="text-neutral-600 hover:text-neutral-300 transition-colors px-1"
            >
              ←
            </button>
            <div ref={monthPickerRef} className="relative">
              <button
                onClick={() => setMonthPickerOpen(o => !o)}
                className="text-xs font-medium text-neutral-300 w-28 text-center hover:text-white transition-colors"
              >
                {month?.label ?? '—'} ▾
              </button>
              {monthPickerOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-10 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl py-1 w-44 max-h-64 overflow-y-auto">
                  {monthOptions().map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setSelYear(opt.year); setSelMonth(opt.month); setMonthPickerOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${opt.year === selYear && opt.month === selMonth ? 'text-white bg-neutral-800' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => goMonth(1)}
              disabled={isCurrentMonth}
              className="text-neutral-600 hover:text-neutral-300 transition-colors px-1 disabled:opacity-30 disabled:cursor-default"
            >
              →
            </button>
          </div>
          <Link
            to="/transactions"
            state={{ month: monthParam }}
            className="text-xs text-neutral-600 hover:text-neutral-300 transition-colors"
          >
            View transactions →
          </Link>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {month && (
          <div className={loading ? 'opacity-40 pointer-events-none transition-opacity' : 'transition-opacity'}>
            {/* Total + comparisons */}
            <div className="mb-5">
              <p className="text-3xl font-bold tabular-nums text-white mb-2">{fmt(month.total)}</p>
              <div className="flex items-center gap-3 flex-wrap">
                {pctVsAvg !== null && (
                  <span className={`text-xs font-medium ${pctVsAvg > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {pctVsAvg > 0 ? '↑' : '↓'} {Math.abs(pctVsAvg).toFixed(0)}% vs 6-mo avg
                  </span>
                )}
                {avg_6m != null && avg_6m > 0 && (
                  <span className="text-xs text-neutral-600">
                    avg {fmt(avg_6m)}/mo
                  </span>
                )}
                {month.is_current && month.days_remaining > 0 && (
                  <span className="text-xs text-neutral-600">
                    {month.days_remaining}d remaining
                  </span>
                )}
              </div>
            </div>

            {/* Category breakdown */}
            {month.top_categories.length > 0 ? (
              <div className="space-y-2.5">
                {month.top_categories.map(cat => (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-xs text-neutral-400 w-28 truncate shrink-0">{cat.name}</span>
                    <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(cat.total / maxCatTotal) * 100}%`, backgroundColor: cat.color, opacity: 0.7 }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-neutral-300 w-16 text-right shrink-0">{fmtExact(cat.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-600">No confirmed transactions this month yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Account balances */}
      {accounts.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-neutral-400">Accounts</p>
            <Link to="/accounts" className="text-xs text-neutral-600 hover:text-neutral-300 transition-colors">Manage →</Link>
          </div>
          <div className="space-y-2.5">
            {accounts.map(acct => (
              <div key={acct.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-200">{acct.name}{acct.last_four ? ` ···· ${acct.last_four}` : ''}</p>
                  <p className="text-xs text-neutral-600">{acct.institution_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums text-neutral-200">
                    {formatBalance(acct.balance_ledger)}
                  </p>
                  <p className="text-xs text-neutral-600">Current balance</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
