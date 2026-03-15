import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getTransactions, getCategories, getAccounts, updateTransaction } from '../lib/api'
import type { Transaction, Category, Account } from '../lib/types'
import CategoryPill from '../components/CategoryPill'
import CategoryInput from '../components/CategoryInput'

function monthOptions() {
  const months: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
    months.push({ value, label })
  }
  return months
}

const selectCls =
  'bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-neutral-600 transition-colors'

// ---------------------------------------------------------------------------
// Inline row editor
// ---------------------------------------------------------------------------

function EditableRow({
  txn,
  categories,
  onSaved,
  onCategoryCreated,
}: {
  txn: Transaction
  categories: Category[]
  onSaved: (updated: Transaction) => void
  onCategoryCreated: (cat: Category) => void
}) {
  const [editing, setEditing] = useState(false)
  const [description, setDescription] = useState(txn.description)
  const [categoryId, setCategoryId] = useState<number | null>(txn.category)
  const [status, setStatus] = useState(txn.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseFloat(txn.amount)
  const isCredit = amount < 0

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateTransaction(txn.id, { category: categoryId, description, status })
      onSaved(updated)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDescription(txn.description)
    setCategoryId(txn.category)
    setStatus(txn.status)
    setEditing(false)
    setError(null)
  }

  if (editing) {
    return (
      <div className="py-2.5 border-b border-neutral-800/50 last:border-0 space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-600 tabular-nums shrink-0 w-20">{txn.date}</span>
          <p className="text-sm text-neutral-200 flex-1 truncate">{txn.merchant || '—'}</p>
          <span className={`text-sm font-medium tabular-nums shrink-0 ${isCredit ? 'text-emerald-400' : 'text-neutral-300'}`}>
            {isCredit ? '+' : '-'}${Math.abs(amount).toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:pl-[88px] flex-wrap">
          <select
            value={status}
            onChange={e => setStatus(e.target.value as Transaction['status'])}
            className="bg-neutral-800 border border-neutral-700/60 rounded px-2 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-neutral-500 transition-colors"
          >
            <option value="unreviewed">Unreviewed</option>
            <option value="tracked">Tracked</option>
            <option value="excluded">Excluded</option>
          </select>
          <CategoryInput
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCreateAndSelect={cat => { onCategoryCreated(cat); setCategoryId(cat.id) }}
          />
          <input
            type="text"
            placeholder="Add a note..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            className="flex-1 bg-neutral-800 border border-neutral-700/60 rounded px-2.5 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
          />
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 bg-white text-neutral-900 text-xs font-semibold rounded hover:bg-neutral-100 disabled:opacity-40 transition-colors shrink-0"
          >
            {saving ? '...' : 'Save'}
          </button>
          <button
            onClick={cancel}
            className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-red-400 text-xs pl-[88px]">{error}</p>}
      </div>
    )
  }

  return (
    <div
      className="py-3 sm:py-2 border-b border-neutral-800/50 last:border-0 group cursor-pointer hover:bg-neutral-900/40 rounded-sm -mx-1 px-2 sm:px-1 transition-colors"
      onClick={() => setEditing(true)}
    >
      <div className="flex items-start gap-2 sm:items-center sm:gap-3">
        {/* Date — desktop only column */}
        <span className="hidden sm:block text-xs text-neutral-600 tabular-nums shrink-0 w-20">{txn.date}</span>

        {/* Merchant + sub-row on mobile */}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-200 truncate leading-tight">{txn.merchant || '—'}</p>
          {txn.description && (
            <p className="text-xs text-neutral-500 truncate leading-tight">{txn.description}</p>
          )}
          {/* Mobile sub-row: date · account · status · category */}
          <div className="flex items-center gap-2 mt-1 sm:hidden flex-wrap">
            <span className="text-xs text-neutral-600 tabular-nums">{txn.date}</span>
            {txn.account_name && (
              <span className="text-xs text-neutral-600 truncate">· {txn.account_name}</span>
            )}
            {txn.status !== 'tracked' && (
              <span className="text-xs text-neutral-500">{txn.status}</span>
            )}
            {txn.category_name && (
              <CategoryPill name={txn.category_name} color={txn.category_color} />
            )}
          </div>
          {/* Desktop: account name */}
          {txn.account_name && (
            <p className="hidden sm:block text-xs text-neutral-600 truncate leading-tight">{txn.account_name}</p>
          )}
        </div>

        {/* Status — desktop only */}
        <span className="hidden sm:block text-xs text-neutral-700 shrink-0 w-14 text-right">
          {txn.status !== 'tracked' ? txn.status : ''}
        </span>

        {/* Category — desktop only */}
        <div className="hidden sm:flex w-24 shrink-0 justify-end">
          {txn.category_name
            ? <CategoryPill name={txn.category_name} color={txn.category_color} />
            : <span className="text-xs text-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity">edit</span>}
        </div>

        {/* Amount — always shown */}
        <span className={`text-sm font-medium tabular-nums shrink-0 pr-1 sm:pr-0 sm:w-24 text-right ${isCredit ? 'text-emerald-400' : 'text-neutral-300'}`}>
          {isCredit ? '+' : '-'}${Math.abs(amount).toFixed(2)}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TransactionsPage() {
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [month, setMonth] = useState<string>(location.state?.month ?? '')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unreviewed' | 'tracked' | 'excluded'>('all')

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [count, setCount] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [month, categoryFilter, accountFilter, statusFilter, debouncedSearch])

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string> = { page: String(page), limit: '20' }
    if (debouncedSearch) params.search = debouncedSearch
    if (month) params.month = month
    if (categoryFilter) params.category = categoryFilter
    if (accountFilter) params.account = accountFilter
    if (statusFilter !== 'all') params.status = statusFilter

    Promise.all([getTransactions(params), getCategories(), getAccounts()])
      .then(([paginated, cats, accts]) => {
        setTransactions(paginated.results)
        setTotalPages(paginated.total_pages)
        setCount(paginated.count)
        setTotalAmount(paginated.total_amount)
        setCategories(cats)
        setAccounts(accts.filter(a => a.tracked))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [month, categoryFilter, accountFilter, statusFilter, debouncedSearch, page])

  function addCategory(cat: Category) {
    setCategories(prev => prev.some(c => c.id === cat.id) ? prev : [cat, ...prev])
  }

  function handleSaved(updated: Transaction) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t))
  }


  const months = monthOptions()

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-sm font-medium text-neutral-300 mr-auto">Transactions</h1>
        {accounts.length > 1 && (
          <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} className={selectCls + ' max-w-[10rem]'}>
            <option value="">All accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={String(a.id)}>
                {a.name}{a.last_four ? ` ···· ${a.last_four}` : ''}
              </option>
            ))}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className={selectCls}>
          <option value="all">All</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="tracked">Tracked</option>
          <option value="excluded">Excluded</option>
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)} className={selectCls}>
          <option value="">All dates</option>
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={selectCls}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search merchant or notes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={selectCls + ' w-full sm:w-72'}
        />
      </div>

      {/* Summary bar */}
      {(
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 mb-4 flex items-baseline justify-between">
          <span className="text-xs text-neutral-500 flex items-center gap-1.5 flex-wrap">
            <span>{count} transactions</span>
            {[
              month ? months.find(m => m.value === month)?.label : null,
              categoryFilter ? categories.find(c => String(c.id) === categoryFilter)?.name : null,
              accountFilter ? accounts.find(a => String(a.id) === accountFilter)?.name : null,
              statusFilter !== 'all' ? statusFilter : null,
              debouncedSearch ? `"${debouncedSearch}"` : null,
            ].filter(Boolean).map((label, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400">{label}</span>
            ))}
          </span>
          <span className="text-base font-semibold tabular-nums">${totalAmount.toFixed(2)}</span>
        </div>
      )}

      {loading && <p className="text-neutral-600 text-sm">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {!loading && !error && transactions.length === 0 && (
        <p className="text-neutral-600 text-sm">No transactions found.</p>
      )}

      {/* Transaction rows */}
      <div>
        {transactions.map(txn => (
          <EditableRow
            key={txn.id}
            txn={txn}
            categories={categories}
            onSaved={handleSaved}
            onCategoryCreated={addCategory}
          />
        ))}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-800">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-30 transition-colors"
          >
            ← Previous
          </button>
          <span className="text-xs text-neutral-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-30 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
