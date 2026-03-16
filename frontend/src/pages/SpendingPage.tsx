import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, ReferenceLine,
} from 'recharts'
import { getSpending, getAccounts, getCategories, getTransactions } from '../lib/api'
import type { SpendingSummary, Account, Category, Transaction } from '../lib/types'

const COLORS = [
  '#818cf8', '#34d399', '#fb923c', '#f472b6',
  '#60a5fa', '#a78bfa', '#facc15', '#2dd4bf',
  '#f87171', '#4ade80',
]

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtExact = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

function today() { return new Date().toISOString().split('T')[0] }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

// Start of a month N months before the current month
function monthsAgoStart(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().split('T')[0]
}

// End of the current month
function endOfCurrentMonth(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1, 0)
  return d.toISOString().split('T')[0]
}

type Preset = '3m' | '6m' | 'ytd' | '1y' | 'all' | 'custom'
type ViewMode = 'stacked' | 'total'

const PRESETS: { key: Preset; label: string }[] = [
  { key: '3m', label: '3M' }, { key: '6m', label: '6M' },
  { key: 'ytd', label: 'YTD' }, { key: '1y', label: '1Y' },
  { key: 'all', label: 'All' }, { key: 'custom', label: 'Custom' },
]

function presetRange(p: Preset): { from: string; to: string } {
  const eom = endOfCurrentMonth()
  switch (p) {
    case '3m':  return { from: monthsAgoStart(3),  to: eom }
    case '6m':  return { from: monthsAgoStart(6),  to: eom }
    case 'ytd': return { from: `${new Date().getFullYear()}-01-01`, to: eom }
    case '1y':  return { from: monthsAgoStart(12), to: eom }
    default:    return { from: '', to: '' }
  }
}

// Custom recharts tooltip
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const items = payload.filter((p: any) => p.value > 0)
  const total = items.reduce((s: number, p: any) => s + (p.value || 0), 0)
  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-xs shadow-xl min-w-36">
      <p className="text-neutral-400 mb-2 font-medium">{label}</p>
      {[...items].reverse().map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-6 mb-1">
          <span style={{ color: p.fill || p.color }}>{p.dataKey === 'total' ? 'Total' : p.dataKey}</span>
          <span className="text-neutral-200 tabular-nums">{fmtExact(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-neutral-700 my-2" />
      <div className="flex justify-between gap-6">
        <span className="text-neutral-400">Total</span>
        <span className="text-neutral-100 font-semibold tabular-nums">{fmtExact(total)}</span>
      </div>
    </div>
  )
}

type Drilldown = { month: string; label: string; category: string | null }

function AvgRefLabel({ viewBox, avg, hovered, onMouseEnter, onMouseLeave }: {
  viewBox?: { x: number; y: number; width: number; height: number }
  avg: number; hovered: boolean
  onMouseEnter: () => void; onMouseLeave: () => void
}) {
  if (!viewBox) return null
  const { x, y, width } = viewBox
  return (
    <g>
      {/* Full-width hit area over the line */}
      <rect x={x} y={y - 10} width={width} height={20} fill="transparent"
        onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={{ cursor: 'default' }} />
      {/* Always-visible subtle label at left end */}
      <text x={x + 4} y={y - 4} fontSize={10} fill={hovered ? '#a3a3a3' : '#525252'}
        onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        avg
      </text>
      {/* Tooltip popup on hover */}
      {hovered && (
        <g transform={`translate(${x + 4}, ${y + 14})`}>
          <rect x={0} y={0} width={130} height={44} rx={6}
            fill="#171717" stroke="#404040" strokeWidth={1} />
          <text x={10} y={15} fontSize={10} fill="#737373">Monthly average</text>
          <text x={10} y={33} fontSize={13} fontWeight="600" fill="#f5f5f5">
            {fmtExact(avg)}
          </text>
        </g>
      )}
    </g>
  )
}

function DrilldownBreakdown({ txns, colorMap }: {
  txns: Transaction[]
  colorMap: Record<string, string>
}) {
  // Group by category name
  const groups: Record<string, Transaction[]> = {}
  for (const txn of txns) {
    const key = txn.category_name ?? 'Uncategorized'
    if (!groups[key]) groups[key] = []
    groups[key].push(txn)
  }

  // Sort groups by total descending
  const sorted = Object.entries(groups).sort(
    ([, a], [, b]) =>
      b.reduce((s, t) => s + parseFloat(t.amount), 0) -
      a.reduce((s, t) => s + parseFloat(t.amount), 0)
  )

  const grandTotal = txns.reduce((s, t) => s + Math.max(0, parseFloat(t.amount)), 0)

  return (
    <div>
      {sorted.map(([catName, catTxns]) => {
        const total = catTxns.reduce((s, t) => s + parseFloat(t.amount), 0)
        const color = colorMap[catName] ?? '#737373'
        return (
          <div key={catName}>
            {/* Category header */}
            <div className="flex items-center justify-between px-4 py-2 bg-neutral-800/50 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs font-medium text-neutral-300">{catName}</span>
                <span className="text-xs text-neutral-600">{catTxns.length}</span>
              </div>
              <span className="text-xs font-semibold text-neutral-200 tabular-nums">{fmtExact(total)}</span>
            </div>
            {/* Transactions */}
            {catTxns.map(txn => {
              const amt = parseFloat(txn.amount)
              return (
                <div key={txn.id} className="flex items-center justify-between px-4 py-2 border-b border-neutral-800/40 last:border-0 hover:bg-neutral-800/20 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm text-neutral-300 truncate">{txn.merchant || '(no merchant)'}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      {txn.date}{txn.account_name ? ` · ${txn.account_name}` : ''}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums ml-4 shrink-0 text-neutral-300">
                    {fmtExact(Math.abs(amt))}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}
      <div className="flex justify-between items-center px-4 py-2.5 bg-neutral-800/40">
        <span className="text-xs text-neutral-500">{txns.length} transactions</span>
        <span className="text-xs font-semibold text-neutral-200 tabular-nums">{fmtExact(grandTotal)}</span>
      </div>
    </div>
  )
}

export default function SpendingPage() {
  const [summary, setSummary]       = useState<SpendingSummary | null>(null)
  const [accounts, setAccounts]     = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [preset, setPreset]                   = useState<Preset>('6m')
  const [customFrom, setCustomFrom]           = useState(daysAgo(180))
  const [customTo, setCustomTo]               = useState(today())
  const [viewMode, setViewMode]               = useState<ViewMode>('stacked')
  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [selectedAccounts, setSelectedAccounts]     = useState<number[]>([])

  const [categoriesExpanded, setCategoriesExpanded] = useState(false)
  const [accountsExpanded, setAccountsExpanded] = useState(false)
  const CATEGORY_FILTER_LIMIT = 5
  const ACCOUNT_FILTER_LIMIT = 3

  const [avgHovered, setAvgHovered] = useState(false)
  const [barHovered, setBarHovered] = useState(false)
  const barHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function onBarEnter() {
    if (barHoverTimer.current) clearTimeout(barHoverTimer.current)
    setBarHovered(true)
  }
  function onBarLeave() {
    barHoverTimer.current = setTimeout(() => setBarHovered(false), 50)
  }

  const [drilldown, setDrilldown]         = useState<Drilldown | null>(null)
  const [drilldownTxns, setDrilldownTxns] = useState<Transaction[]>([])
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  const { from, to } = preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset)

  // Load filter options once
  useEffect(() => {
    Promise.all([getAccounts(), getCategories()])
      .then(([a, c]) => { setAccounts(a); setCategories(c) })
      .catch(e => setError(e.message))
  }, [])

  // Load chart data whenever filters change
  useEffect(() => {
    setLoading(true)
    setDrilldown(null)
    const p: Record<string, string> = {}
    if (from) p.from = from
    if (to)   p.to   = to
    if (selectedCategories.length) p.categories = selectedCategories.join(',')
    if (selectedAccounts.length)   p.accounts   = selectedAccounts.join(',')
    getSpending(p)
      .then(setSummary)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [from, to, selectedCategories.join(','), selectedAccounts.join(',')])

  // Load drilldown transactions when a bar is clicked
  useEffect(() => {
    if (!drilldown) { setDrilldownTxns([]); return }
    setDrilldownLoading(true)
    const p: Record<string, string> = { month: drilldown.month }
    if (selectedAccounts.length === 1) p.account = String(selectedAccounts[0])
    getTransactions({ ...p, limit: '500' })
      .then(paginated => {
        setDrilldownTxns(paginated.results.filter(t => parseFloat(t.amount) > 0))
      })
      .catch(e => setError(e.message))
      .finally(() => setDrilldownLoading(false))
  }, [drilldown])

  const allCategories = summary?.categories ?? []

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {}
    categories.forEach(c => { map[c.name] = c.color })
    return map
  }, [categories])

  const chartData = useMemo(() => {
    if (!summary) return []
    return summary.months.map(m => ({ label: m.label, month: m.month, total: m.total, ...m.by_category }))
  }, [summary])

  function handleBarClick(data: any, category?: string) {
    if (!data?.month) return
    setDrilldown(prev =>
      prev?.month === data.month && prev?.category === (category ?? null) ? null
        : { month: data.month, label: data.label, category: category ?? null }
    )
  }

  function toggleCategory(id: number) {
    setSelectedCategories(p => p.includes(id) ? p.filter(c => c !== id) : [...p, id])
  }
  function toggleAccount(id: number) {
    setSelectedAccounts(p => p.includes(id) ? p.filter(a => a !== id) : [...p, id])
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-sm font-medium text-neutral-300">Spending</h1>
        {summary && (
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <span>Total <span className="text-neutral-200 font-medium">{fmt(summary.grand_total)}</span></span>
            <span>Avg/mo <span className="text-neutral-200 font-medium">{fmt(summary.monthly_avg)}</span></span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Presets */}
          <div className="flex gap-1 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => setPreset(p.key)}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors ${
                  preset === p.key ? 'bg-white text-neutral-900 font-medium'
                    : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* View mode */}
          <div className="ml-auto flex gap-1">
            {(['stacked', 'total'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1.5 text-xs rounded capitalize transition-colors ${
                  viewMode === mode ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-600 hover:text-neutral-300'
                }`}>
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date pickers */}
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-neutral-500" />
            <span className="text-neutral-600 text-xs shrink-0">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-neutral-500" />
          </div>
        )}

        {/* Category pills */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-neutral-600 mr-1">Categories</span>
            {(categoriesExpanded ? categories : categories.slice(0, CATEGORY_FILTER_LIMIT)).map(cat => {
              const active = selectedCategories.includes(cat.id)
              return (
                <button key={cat.id} onClick={() => toggleCategory(cat.id)}
                  style={active ? { backgroundColor: cat.color } : {}}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    active ? 'border-transparent text-neutral-900 font-medium'
                      : 'border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600'
                  }`}>
                  {cat.name}
                </button>
              )
            })}
            {categories.length > CATEGORY_FILTER_LIMIT && (
              <button onClick={() => setCategoriesExpanded(e => !e)}
                className="text-xs text-neutral-600 hover:text-neutral-400">
                {categoriesExpanded ? 'less' : `+${categories.length - CATEGORY_FILTER_LIMIT} more`}
              </button>
            )}
            {selectedCategories.length > 0 && (
              <button onClick={() => setSelectedCategories([])} className="text-xs text-neutral-600 hover:text-neutral-400 ml-1">Clear</button>
            )}
          </div>
        )}

        {/* Account pills */}
        {accounts.length > 1 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-neutral-600 mr-1">Accounts</span>
            {(accountsExpanded ? accounts : accounts.slice(0, ACCOUNT_FILTER_LIMIT)).map(acct => {
              const active = selectedAccounts.includes(acct.id)
              return (
                <button key={acct.id} onClick={() => toggleAccount(acct.id)}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    active ? 'bg-neutral-300 border-transparent text-neutral-900 font-medium'
                      : 'border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600'
                  }`}>
                  {acct.name}{acct.last_four ? ` - ${acct.last_four}` : ''}
                </button>
              )
            })}
            {accounts.length > ACCOUNT_FILTER_LIMIT && (
              <button onClick={() => setAccountsExpanded(e => !e)}
                className="text-xs text-neutral-600 hover:text-neutral-400">
                {accountsExpanded ? 'less' : `+${accounts.length - ACCOUNT_FILTER_LIMIT} more`}
              </button>
            )}
            {selectedAccounts.length > 0 && (
              <button onClick={() => setSelectedAccounts([])} className="text-xs text-neutral-600 hover:text-neutral-400 ml-1">Clear</button>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {loading && <p className="text-neutral-600 text-sm">Loading...</p>}

      {!loading && summary && chartData.length === 0 && (
        <p className="text-neutral-600 text-sm text-center py-12">No expenses in this range.</p>
      )}

      {/* Chart */}
      {!loading && chartData.length > 0 && (
        <div className="
          bg-neutral-900 border border-neutral-800 rounded-xl p-4
          [&_.recharts-surface]:outline-none
          [&_.recharts-layer]:outline-none
          [&_.recharts-layer:focus]:outline-none
          [&_.recharts-bar-rectangle:focus]:outline-none
          [&_svg_*:focus]:outline-none
        ">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 8, bottom: 4 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="#262626" />
              <XAxis dataKey="label" tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} width={48}
                tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
              <Tooltip content={<CustomTooltip />} cursor={false} wrapperStyle={{ visibility: barHovered ? 'visible' : 'hidden' }} />
              {summary && summary.monthly_avg > 0 && (
                <ReferenceLine
                  y={summary.monthly_avg}
                  stroke={avgHovered ? '#737373' : '#3a3a3a'}
                  strokeDasharray="4 4"
                  label={(props: any) => (
                    <AvgRefLabel
                      {...props}
                      avg={summary.monthly_avg}
                      hovered={avgHovered}
                      onMouseEnter={() => setAvgHovered(true)}
                      onMouseLeave={() => setAvgHovered(false)}
                    />
                  )}
                />
              )}
              {viewMode === 'stacked' && allCategories.length > 1 && (
                <Legend wrapperStyle={{ fontSize: 11, color: '#737373', paddingTop: 12 }} iconType="circle" iconSize={8} />
              )}

              {viewMode === 'total' || allCategories.length === 0 ? (
                <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={48}
                  activeBar={false}
                  onMouseEnter={onBarEnter} onMouseLeave={onBarLeave}
                  onClick={(data) => handleBarClick(data)} style={{ cursor: 'pointer' }}>
                  {chartData.map((entry, i) => (
                    <Cell key={i}
                      fill={COLORS[i % COLORS.length]}
                      fillOpacity={drilldown && drilldown.month !== entry.month ? 0.35 : 0.85} />
                  ))}
                </Bar>
              ) : (
                allCategories.map((cat, i) => (
                  <Bar key={cat} dataKey={cat} stackId="a" maxBarSize={48}
                    fill={colorMap[cat] ?? COLORS[i % COLORS.length]} fillOpacity={0.85}
                    radius={i === allCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    activeBar={false}
                    onMouseEnter={onBarEnter} onMouseLeave={onBarLeave}
                    onClick={(data) => handleBarClick(data)}
                    style={{ cursor: 'pointer' }} />
                ))
              )}
            </BarChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-neutral-700 mt-1">Click a bar to see transactions</p>
        </div>
      )}

      {/* Drilldown */}
      {drilldown && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <p className="text-xs font-medium text-neutral-300">{drilldown.label}</p>
            <button onClick={() => setDrilldown(null)} className="text-neutral-600 hover:text-neutral-300 text-xs transition-colors">
              Close
            </button>
          </div>

          {drilldownLoading && <p className="text-neutral-600 text-xs px-4 py-4">Loading...</p>}

          {!drilldownLoading && drilldownTxns.length === 0 && (
            <p className="text-neutral-600 text-xs px-4 py-4">No transactions found.</p>
          )}

          {!drilldownLoading && drilldownTxns.length > 0 && (
            <DrilldownBreakdown txns={drilldownTxns} colorMap={colorMap} />
          )}
        </div>
      )}
    </div>
  )
}
