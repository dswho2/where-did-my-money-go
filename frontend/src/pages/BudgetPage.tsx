import { useEffect, useRef, useState } from 'react'
import { getCategories, getSpending, getBudgetConfig, saveBudgetConfig } from '../lib/api'
import type { Category } from '../lib/types'

// ---------------------------------------------------------------------------
// Types & persistence
// ---------------------------------------------------------------------------

type PayFrequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly'

const PAY_FREQ_OPTIONS: { value: PayFrequency; label: string; periods: number }[] = [
  { value: 'weekly',       label: 'Weekly',        periods: 52 },
  { value: 'biweekly',     label: 'Every 2 weeks', periods: 26 },
  { value: 'semi_monthly', label: 'Twice a month', periods: 24 },
  { value: 'monthly',      label: 'Monthly',       periods: 12 },
]

interface LineItem { id: string; name: string; amount: number }

interface BudgetConfig {
  salary_annual:    number
  pay_frequency:    PayFrequency
  tax_rate:         number
  pre_tax:          LineItem[]   // per-paycheck
  post_tax:         LineItem[]   // per-paycheck
  fixed:            LineItem[]   // monthly
  category_budgets: Record<number, number>  // monthly
}

const DEFAULTS: BudgetConfig = {
  salary_annual: 0, pay_frequency: 'biweekly', tax_rate: 0,
  pre_tax: [], post_tax: [], fixed: [], category_budgets: {},
}


// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

interface Paycheck {
  periods: number
  gross: number; preTax: number; taxable: number
  taxes: number; postTax: number; net: number; monthlyNet: number
}

function calc(cfg: BudgetConfig): Paycheck {
  const freq    = PAY_FREQ_OPTIONS.find(f => f.value === cfg.pay_frequency) ?? PAY_FREQ_OPTIONS[1]
  const periods = freq.periods
  const gross   = cfg.salary_annual / periods
  const preTax  = cfg.pre_tax.reduce((s, i) => s + i.amount, 0)
  const taxable = Math.max(0, gross - preTax)
  const taxes   = taxable * (cfg.tax_rate / 100)
  const postTax = cfg.post_tax.reduce((s, i) => s + i.amount, 0)
  const net     = Math.max(0, taxable - taxes - postTax)
  return { periods, gross, preTax, taxable, taxes, postTax, net, monthlyNet: net * (periods / 12) }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid() { return Math.random().toString(36).slice(2, 9) }
const fmtExact = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmt      = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
function parseDollar(s: string) { const n = parseFloat(s.replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }
function parsePct(s: string)    { const n = parseFloat(s.replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : Math.min(100, n) }

function monthBounds(year: number, month: number) {
  const last = new Date(year, month, 0).getDate()
  const p = (n: number) => String(n).padStart(2, '0')
  return { from: `${year}-${p(month)}-01`, to: `${year}-${p(month)}-${p(last)}` }
}
function monthLabel(y: number, m: number) {
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}
function addMonths(y: number, m: number, d: number): [number, number] {
  let nm = m + d, ny = y
  while (nm > 12) { nm -= 12; ny++ }
  while (nm < 1)  { nm += 12; ny-- }
  return [ny, nm]
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Collapsible({
  title, badge, badgeRed, defaultOpen = false, children, icon,
}: {
  title: string
  badge?: string
  badgeRed?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-neutral-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {badge && (
            <span className={`text-sm font-semibold tabular-nums ${badgeRed ? 'text-red-400' : 'text-neutral-300'}`}>
              {badge}
            </span>
          )}
          <span className="text-neutral-600 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && <div className="px-5 pb-4 pt-1 border-t border-neutral-800">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InlineNumber
// ---------------------------------------------------------------------------

function InlineNumber({ value, onChange, placeholder, suffix, className }: {
  value: number; onChange: (v: number) => void
  placeholder?: string; suffix?: string; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.select() }, [editing])
  function commit() { onChange(suffix === '%' ? parsePct(raw) : parseDollar(raw)); setEditing(false) }

  if (editing) return (
    <input ref={ref} value={raw} onChange={e => setRaw(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className={`bg-neutral-800 border border-neutral-600 rounded px-2 py-0.5 text-sm tabular-nums focus:outline-none focus:border-neutral-400 ${className ?? 'w-28 text-right text-neutral-200'}`}
    />
  )
  return (
    <button onClick={() => { setRaw(value ? String(value) : ''); setEditing(true) }}
      className={`text-sm tabular-nums rounded px-2 py-0.5 border transition-colors ${
        value ? `border-transparent hover:border-neutral-700 text-neutral-200 ${className ?? ''}`
              : `border-dashed border-neutral-700 text-neutral-600 hover:border-neutral-500 hover:text-neutral-400 ${className ?? ''}`
      }`}
    >
      {value ? (suffix === '%' ? `${value}%` : fmtExact(value)) : (placeholder ?? 'Set')}
    </button>
  )
}

// ---------------------------------------------------------------------------
// LineItemRow
// ---------------------------------------------------------------------------

function LineItemRow({ item, onUpdate, onDelete, hint }: {
  item: LineItem
  onUpdate: (id: string, c: Partial<LineItem>) => void
  onDelete: (id: string) => void
  hint?: string
}) {
  const [editName, setEditName] = useState(false)
  const [nameVal, setNameVal]   = useState(item.name)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editName) nameRef.current?.focus() }, [editName])
  function commitName() {
    const t = nameVal.trim()
    if (t && t !== item.name) onUpdate(item.id, { name: t })
    else setNameVal(item.name)
    setEditName(false)
  }
  return (
    <div className="flex items-center gap-2 py-2 border-b border-neutral-800/40 last:border-0 group">
      {editName ? (
        <input ref={nameRef} value={nameVal} onChange={e => setNameVal(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(item.name); setEditName(false) } }}
          className="flex-1 bg-neutral-800 border border-neutral-600 rounded px-2 py-0.5 text-sm text-neutral-200 focus:outline-none focus:border-neutral-400"
        />
      ) : (
        <span className="flex-1 text-sm text-neutral-300 cursor-pointer hover:text-white transition-colors truncate"
          onClick={() => setEditName(true)}>{item.name}</span>
      )}
      {hint && <span className="text-xs text-neutral-700 tabular-nums shrink-0 hidden sm:block">{hint}</span>}
      <InlineNumber value={item.amount} onChange={v => onUpdate(item.id, { amount: v })}
        className="w-24 text-right text-neutral-300" />
      <button onClick={() => onDelete(item.id)}
        className="text-neutral-700 hover:text-red-400 text-sm opacity-0 group-hover:opacity-100 transition-all shrink-0 w-4">×</button>
    </div>
  )
}

function AddItemRow({ placeholder, onAdd }: { placeholder: string; onAdd: (n: string, a: number) => void }) {
  const [name, setName] = useState(''); const [amount, setAmount] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  function submit(e: React.SyntheticEvent) {
    e.preventDefault(); const t = name.trim(); if (!t) return
    onAdd(t, parseDollar(amount)); setName(''); setAmount(''); ref.current?.focus()
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2 pt-2.5">
      <input ref={ref} value={name} onChange={e => setName(e.target.value)} placeholder={placeholder}
        className="flex-1 bg-transparent border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-400 placeholder-neutral-700 focus:outline-none focus:border-neutral-600 focus:text-neutral-200 transition-colors" />
      <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="$0"
        className="w-24 bg-transparent border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-right text-neutral-400 placeholder-neutral-700 tabular-nums focus:outline-none focus:border-neutral-600 focus:text-neutral-200 transition-colors" />
      <button type="submit" disabled={!name.trim()}
        className="text-xs text-neutral-600 hover:text-neutral-300 disabled:opacity-30 transition-colors shrink-0">+ add</button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function monthOptions() {
  const opts: { value: string; label: string; year: number; month: number }[] = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    })
  }
  return opts
}

export default function BudgetPage() {
  const now   = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [cfg, setCfg]         = useState<BudgetConfig>(DEFAULTS)
  const [cfgLoaded, setCfgLoaded] = useState(false)
  const [categories, setCategories]         = useState<Category[]>([])
  const [actuals, setActuals]               = useState<Record<string, number>>({})
  const [loadingActuals, setLoadingActuals] = useState(false)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const monthPickerRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!monthPickerOpen) return
    function handleClick(e: MouseEvent) {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node))
        setMonthPickerOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [monthPickerOpen])

  // Load from API on mount
  useEffect(() => {
    getBudgetConfig()
      .then(remote => {
        setCfg({ ...DEFAULTS, ...(remote as Partial<BudgetConfig>) })
        setCfgLoaded(true)
      })
      .catch(() => setCfgLoaded(true))
  }, [])

  // Debounced save to API whenever config changes
  useEffect(() => {
    if (!cfgLoaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveBudgetConfig(cfg as unknown as Record<string, unknown>).catch(() => {})
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [cfg, cfgLoaded])
  useEffect(() => { getCategories().then(setCategories).catch(() => {}) }, [])
  useEffect(() => {
    setLoadingActuals(true)
    const { from, to } = monthBounds(year, month)
    getSpending({ from, to })
      .then(s => {
        const map: Record<string, number> = {}
        for (const m of s.months)
          for (const [cat, amt] of Object.entries(m.by_category))
            map[cat] = (map[cat] ?? 0) + amt
        setActuals(map)
      })
      .catch(() => setActuals({}))
      .finally(() => setLoadingActuals(false))
  }, [year, month])

  const currentYear = now.getFullYear(), currentMonth = now.getMonth() + 1
  const isCurrentMonth = year === currentYear && month === currentMonth

  function goMonth(delta: number) {
    const [y, m] = addMonths(year, month, delta)
    if (y > currentYear || (y === currentYear && m > currentMonth)) return
    setYear(y); setMonth(m)
  }

  function update(patch: Partial<BudgetConfig>) { setCfg(prev => ({ ...prev, ...patch })) }
  function addItem(sec: 'pre_tax'|'post_tax'|'fixed', name: string, amount: number) {
    update({ [sec]: [...cfg[sec], { id: uid(), name, amount }] })
  }
  function updateItem(sec: 'pre_tax'|'post_tax'|'fixed', id: string, changes: Partial<LineItem>) {
    update({ [sec]: cfg[sec].map(i => i.id === id ? { ...i, ...changes } : i) })
  }
  function deleteItem(sec: 'pre_tax'|'post_tax'|'fixed', id: string) {
    update({ [sec]: cfg[sec].filter(i => i.id !== id) })
  }
  function setCatBudget(id: number, amt: number) {
    update({ category_budgets: { ...cfg.category_budgets, [id]: amt } })
  }

  const pc              = calc(cfg)
  const fixedTotal      = cfg.fixed.reduce((s, i) => s + i.amount, 0)
  const catBudgetTotal  = categories.reduce((s, c) => s + (cfg.category_budgets[c.id] ?? 0), 0)
  const catActualTotal  = categories.reduce((s, c) => s + (actuals[c.name] ?? 0), 0)
  const remaining       = pc.monthlyNet - fixedTotal - catActualTotal
  const remainingBudget = pc.monthlyNet - fixedTotal - catBudgetTotal
  const hasIncome       = cfg.salary_annual > 0

  // Variable rows: show anything with a budget or actual spend
  const varRows = categories.map(c => ({
    id: c.id, name: c.name, color: c.color,
    budget: cfg.category_budgets[c.id] ?? 0,
    actual: actuals[c.name] ?? 0,
  })).filter(r => r.budget > 0 || r.actual > 0)
    .sort((a, b) => b.actual - a.actual)

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium text-neutral-300">Budget</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => goMonth(-1)} className="text-neutral-600 hover:text-neutral-300 transition-colors px-1">←</button>
          <div ref={monthPickerRef} className="relative">
            <button
              onClick={() => setMonthPickerOpen(o => !o)}
              className="text-xs font-medium text-neutral-300 w-28 text-center hover:text-white transition-colors"
            >
              {monthLabel(year, month)} ▾
            </button>
            {monthPickerOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-10 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl py-1 w-44 max-h-64 overflow-y-auto">
                {monthOptions().map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setYear(opt.year); setMonth(opt.month); setMonthPickerOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${opt.year === year && opt.month === month ? 'text-white bg-neutral-800' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => goMonth(1)} disabled={isCurrentMonth}
            className="text-neutral-600 hover:text-neutral-300 px-1 disabled:opacity-30 disabled:cursor-default transition-colors">→</button>
        </div>
      </div>

      {/* ── Top summary equation ── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-4">
        {/* grid: 4 equal value cols with 3 narrow operator cols between them */}
        <div className="grid grid-cols-[1fr_1.5rem_1fr_1.5rem_1fr_1.5rem_1fr] items-center">

          <div className="text-center">
            <p className="text-xs text-neutral-600 mb-0.5">Take-home</p>
            <p className="text-xl font-bold tabular-nums text-neutral-200">
              {hasIncome ? fmt(pc.monthlyNet) : '—'}
            </p>
            <p className="text-xs mt-0.5 invisible">·</p>
          </div>

          <p className="text-neutral-700 text-base text-center">−</p>

          <div className="text-center">
            <p className="text-xs text-neutral-600 mb-0.5">Fixed</p>
            <p className="text-xl font-bold tabular-nums text-neutral-200">
              {fixedTotal > 0 ? fmt(fixedTotal) : '—'}
            </p>
            <p className="text-xs mt-0.5 invisible">·</p>
          </div>

          <p className="text-neutral-700 text-base text-center">−</p>

          <div className={`text-center transition-opacity ${loadingActuals ? 'opacity-40' : ''}`}>
            <p className="text-xs text-neutral-600 mb-0.5">Variable</p>
            <p className="text-xl font-bold tabular-nums text-red-400">
              {catActualTotal > 0 ? fmt(catActualTotal) : '—'}
            </p>
            <p className={`text-xs text-neutral-700 tabular-nums mt-0.5 ${catBudgetTotal === 0 ? 'invisible' : ''}`}>
              of {catBudgetTotal > 0 ? fmt(catBudgetTotal) : '·'} budgeted
            </p>
          </div>

          <p className="text-neutral-700 text-base text-center">=</p>

          <div className={`text-center transition-opacity ${loadingActuals && catActualTotal === 0 ? 'opacity-40' : ''}`}>
            <p className="text-xs text-neutral-600 mb-0.5">Remaining</p>
            <p className={`text-xl font-bold tabular-nums ${
              !hasIncome ? 'text-neutral-600' :
              remaining >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {hasIncome ? fmt(remaining) : '—'}
            </p>
            <p className={`text-xs tabular-nums mt-0.5 ${!(hasIncome && catBudgetTotal > 0) ? 'invisible' : remainingBudget >= 0 ? 'text-neutral-700' : 'text-red-900'}`}>
              {hasIncome && catBudgetTotal > 0 ? `${fmt(remainingBudget)} expected` : '·'}
            </p>
          </div>

        </div>
      </div>

      {/* ── Variable spending (main section) ── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Variable Spending</span>
          <span className={`text-sm tabular-nums text-right transition-opacity ${loadingActuals ? 'opacity-40' : ''}`}>
            <span className={catActualTotal > catBudgetTotal && catBudgetTotal > 0 ? 'text-red-400 font-semibold' : catActualTotal > 0 ? 'text-neutral-400 font-semibold' : 'text-neutral-600'}>
              {catActualTotal > 0 ? fmt(catActualTotal) : '—'}
            </span>
            {catBudgetTotal > 0 && (
              <span className={`font-normal ${catActualTotal > catBudgetTotal ? 'text-red-400' : 'text-neutral-400'}`}> / {fmt(catBudgetTotal)} budgeted</span>
            )}
          </span>
        </div>

        {varRows.length === 0 ? (
          <p className="text-xs text-neutral-700 py-2">
            No spending this month yet, or no category budgets set.
            {categories.length === 0 && ' Create categories first.'}
          </p>
        ) : (
          <div className="space-y-4">
            {varRows.map(r => {
              const pct     = r.budget > 0 ? Math.min(r.actual / r.budget, 1) : 0
              const over    = r.budget > 0 && r.actual > r.budget
              const overAmt = r.actual - r.budget
              return (
                <div key={r.id}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-semibold text-neutral-200 uppercase tracking-wide">{r.name}</span>
                    <span className="text-xs tabular-nums text-right">
                      {r.budget > 0 ? (
                        over
                          ? <span className="text-red-400">{fmt(r.actual)} spent / {fmt(r.budget)} budgeted <span className="font-semibold">(+{fmt(overAmt)})</span></span>
                          : <span className="text-neutral-500">{fmt(r.actual)} spent / {fmt(r.budget)} budgeted</span>
                      ) : (
                        <span className="text-neutral-500">{fmt(r.actual)} spent</span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: r.budget > 0 ? `${pct * 100}%` : '100%',
                        backgroundColor: over ? '#f87171' : r.color,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* ── Income breakdown (collapsible) ── */}
      {hasIncome && (
        <Collapsible
          title="Income Breakdown"
          badge={`${fmtExact(pc.monthlyNet)}/mo`}
          defaultOpen
        >
          <div className="space-y-1 pt-2">
            <BdRow label="NET TAKE-HOME" value={pc.monthlyNet} big />
            <div className="pt-1 space-y-0.5">
              <BdRow label={`Gross (${pc.periods}×/yr)`} value={pc.gross} sub label2="per paycheck" />
              {cfg.tax_rate > 0 && (
                <BdRow label={`Taxes (${cfg.tax_rate}%)`} value={pc.taxes} negative sub />
              )}
              {cfg.pre_tax.length > 0 && (
                <>
                  <BdRow label="Pre-tax deductions" value={pc.preTax} negative sub />
                  {cfg.pre_tax.map(i => (
                    <BdRow key={i.id} label={i.name} value={i.amount} negative sub indent />
                  ))}
                </>
              )}
              {cfg.post_tax.length > 0 && (
                <>
                  <BdRow label="Post-tax deductions" value={pc.postTax} negative sub />
                  {cfg.post_tax.map(i => (
                    <BdRow key={i.id} label={i.name} value={i.amount} negative sub indent />
                  ))}
                </>
              )}
            </div>
            <div className="border-t border-neutral-800 mt-2 pt-2 space-y-0.5">
              <BdRow label="Net per paycheck" value={pc.net} />
              <BdRow label="Monthly take-home" value={pc.monthlyNet} />
            </div>
          </div>
        </Collapsible>
      )}

      {/* ── Fixed expenses (collapsible) ── */}
      <Collapsible
        title="Fixed Expenses"
        badge={fixedTotal > 0 ? `−${fmtExact(fixedTotal)}/mo` : undefined}
        badgeRed={fixedTotal > 0}
        defaultOpen
      >
        <div className="pt-1">
          {cfg.fixed.length === 0 && (
            <p className="text-xs text-neutral-700 pb-2">Recurring monthly bills — rent, car, subscriptions, etc.</p>
          )}
          {cfg.fixed.map(item => (
            <LineItemRow key={item.id} item={item}
              onUpdate={(id, c) => updateItem('fixed', id, c)}
              onDelete={id => deleteItem('fixed', id)} />
          ))}
          <AddItemRow placeholder="e.g. Rent" onAdd={(n, a) => addItem('fixed', n, a)} />
        </div>
      </Collapsible>

      {/* ── Setup & Inputs (collapsible) ── */}
      <Collapsible
        title="Setup & Inputs"
        icon={<span className="text-neutral-600 text-xs">⚙</span>}
      >
        <div className="space-y-5 pt-2">

          {/* Income inputs */}
          <div className="space-y-3">
            <p className="text-xs text-neutral-600 font-medium">Income</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400 shrink-0">Annual salary</span>
              <InlineNumber value={cfg.salary_annual} onChange={v => update({ salary_annual: v })}
                placeholder="Enter salary" className="w-36 text-right text-neutral-200" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400 shrink-0">Pay frequency</span>
              <div className="flex gap-1 flex-wrap justify-end">
                {PAY_FREQ_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => update({ pay_frequency: opt.value })}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      cfg.pay_frequency === opt.value
                        ? 'bg-neutral-700 text-neutral-100 font-medium'
                        : 'text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400 shrink-0">Effective tax rate</span>
              <InlineNumber value={cfg.tax_rate} onChange={v => update({ tax_rate: v })}
                placeholder="e.g. 22%" suffix="%" className="w-20 text-right text-neutral-200" />
            </div>
          </div>

          {/* Pre-tax deductions */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-neutral-600 font-medium">Pre-tax deductions <span className="font-normal text-neutral-700">· per paycheck</span></p>
              {cfg.pre_tax.length > 0 && (
                <span className="text-xs tabular-nums text-neutral-600">
                  −{fmtExact(pc.preTax)}/check
                </span>
              )}
            </div>
            {cfg.pre_tax.map(item => (
              <LineItemRow key={item.id} item={item}
                onUpdate={(id, c) => updateItem('pre_tax', id, c)}
                onDelete={id => deleteItem('pre_tax', id)}
                hint={fmtExact(item.amount * pc.periods / 12) + '/mo'} />
            ))}
            <AddItemRow placeholder="e.g. 401(k), HSA" onAdd={(n, a) => addItem('pre_tax', n, a)} />
          </div>

          {/* Post-tax deductions */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-neutral-600 font-medium">Post-tax deductions <span className="font-normal text-neutral-700">· per paycheck</span></p>
              {cfg.post_tax.length > 0 && (
                <span className="text-xs tabular-nums text-neutral-600">
                  −{fmtExact(pc.postTax)}/check
                </span>
              )}
            </div>
            {cfg.post_tax.map(item => (
              <LineItemRow key={item.id} item={item}
                onUpdate={(id, c) => updateItem('post_tax', id, c)}
                onDelete={id => deleteItem('post_tax', id)}
                hint={fmtExact(item.amount * pc.periods / 12) + '/mo'} />
            ))}
            <AddItemRow placeholder="e.g. Health insurance, dental" onAdd={(n, a) => addItem('post_tax', n, a)} />
          </div>

          {/* Category budgets */}
          <div>
            <p className="text-xs text-neutral-600 font-medium mb-2">Monthly category budgets</p>
            {categories.length === 0 ? (
              <p className="text-xs text-neutral-700">No categories yet.</p>
            ) : (
              <div className="space-y-0.5">
                {categories.map(cat => {
                  const budget = cfg.category_budgets[cat.id] ?? 0
                  return (
                    <div key={cat.id} className="flex items-center gap-3 py-1.5 border-b border-neutral-800/40 last:border-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="flex-1 text-sm text-neutral-400 truncate">{cat.name}</span>
                      <InlineBudgetEdit
                        value={budget}
                        onChange={v => setCatBudget(cat.id, v)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </Collapsible>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------


function BdRow({ label, label2, value, negative, big, sub, indent }: {
  label: string; label2?: string; value: number
  negative?: boolean; big?: boolean; sub?: boolean; indent?: boolean
}) {
  const labelCls = big
    ? 'text-sm font-semibold text-neutral-200'
    : sub ? 'text-xs text-neutral-600'
    : 'text-xs text-neutral-500'
  const valueCls = big
    ? 'text-sm font-bold text-neutral-100'
    : indent && negative ? 'text-xs text-neutral-600'
    : negative ? 'text-xs text-red-400/70'
    : sub ? 'text-xs text-neutral-400'
    : 'text-xs text-neutral-400'
  const dotCls = big
    ? 'border-neutral-700'
    : sub ? 'border-neutral-800'
    : 'border-neutral-800'

  return (
    <div className={`flex items-baseline gap-1.5 ${indent ? 'pl-4' : ''} ${sub ? 'py-0.5' : 'py-1'}`}>
      <span className={`shrink-0 ${labelCls}`}>{label}</span>
      {label2 && <span className="text-xs text-neutral-700 shrink-0">{label2}</span>}
      {!indent && <span className={`flex-1 border-b border-dotted mb-[3px] ${dotCls}`} />}
      {indent && <span className="flex-1" />}
      <span className={`shrink-0 tabular-nums ${valueCls}`}>
        {negative ? '−' : ''}{fmtExact(value)}
      </span>
    </div>
  )
}

function InlineBudgetEdit({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.select() }, [editing])
  function commit() { onChange(parseDollar(raw)); setEditing(false) }

  if (editing) return (
    <input ref={ref} value={raw} onChange={e => setRaw(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-24 bg-neutral-800 border border-neutral-600 rounded px-2 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:border-neutral-400"
    />
  )
  return (
    <button onClick={() => { setRaw(value ? String(value) : ''); setEditing(true) }}
      className={`text-xs tabular-nums w-24 text-right rounded px-2 py-0.5 transition-colors ${
        value ? 'text-neutral-400 hover:text-white' : 'text-neutral-700 hover:text-neutral-500'
      }`}>
      {value ? fmt(value) + '/mo' : 'set budget'}
    </button>
  )
}
