import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getTransactions, getCategories, getAccounts, updateTransaction, createTransaction, deleteTransaction } from '../lib/api'
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
  isEditing,
  onStartEdit,
  onClose,
  onSaved,
  onDeleted,
  onCategoryCreated,
}: {
  txn: Transaction
  categories: Category[]
  isEditing: boolean
  onStartEdit: () => void
  onClose: () => void
  onSaved: (updated: Transaction) => void
  onDeleted: (id: number) => void
  onCategoryCreated: (cat: Category) => void
}) {
  const [description, setDescription] = useState(txn.description)
  const [categoryId, setCategoryId] = useState<number | null>(txn.category)
  const [status, setStatus] = useState(txn.status)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const amount = parseFloat(txn.amount)
  const isCredit = amount < 0

  // Reset local state when editing opens/closes
  useEffect(() => {
    if (isEditing) {
      setDescription(txn.description)
      setCategoryId(txn.category)
      setStatus(txn.status)
      setError(null)
      setConfirmDelete(false)
    }
  }, [isEditing])

  // Close on outside click — use pointerdown on the row itself to stop propagation,
  // so the document listener only sees clicks that originate outside.
  useEffect(() => {
    if (!isEditing) return
    function handlePointerDown(e: PointerEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        cancel()
      }
    }
    // Use capture phase so we see the event before React's bubble-phase handlers,
    // meaning e.target is still attached to the DOM when we check it.
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [isEditing])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateTransaction(txn.id, { category: categoryId, description, status })
      onSaved(updated)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await deleteTransaction(txn.id)
      onDeleted(txn.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  function cancel() {
    onClose()
  }

  if (isEditing) {
    return (
      <div ref={rowRef} className="py-2.5 border-b border-neutral-800/50 last:border-0 space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-600 tabular-nums shrink-0 w-20">{txn.date}</span>
          <p className="text-sm text-neutral-200 flex-1 truncate">{txn.merchant || '—'}</p>
          <span className={`text-sm font-medium tabular-nums shrink-0 ${isCredit ? 'text-emerald-400' : 'text-neutral-300'}`}>
            {isCredit ? '+' : '-'}${Math.abs(amount).toFixed(2)}
          </span>
        </div>
        <div className="sm:pl-[88px] space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
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
              className="flex-1 min-w-[8rem] bg-neutral-800 border border-neutral-700/60 rounded px-2.5 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`px-3 py-1.5 text-xs disabled:opacity-40 transition-colors min-w-[4.5rem] text-center ${confirmDelete ? 'text-red-400 font-semibold' : 'text-neutral-600 hover:text-red-400'}`}
            >
              {deleting ? '...' : confirmDelete ? 'Confirm?' : 'Delete'}
            </button>
            <button onClick={cancel} className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-300 transition-colors">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 bg-white text-neutral-900 text-xs font-semibold rounded hover:bg-neutral-100 disabled:opacity-40 transition-colors"
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div
      className="py-3 sm:py-2 border-b border-neutral-800/50 last:border-0 group cursor-pointer hover:bg-neutral-900/40 rounded-sm -mx-1 px-2 sm:px-1 transition-colors"
      onClick={onStartEdit}
    >
      {/* Mobile layout: 2-column grid, 4 cells so col 2 aligns amount + category */}
      <div className="sm:hidden grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        {/* Row 1 */}
        <p className="text-sm text-neutral-200 truncate leading-tight">{txn.merchant || '—'}</p>
        <span className={`text-sm font-medium tabular-nums text-right ${isCredit ? 'text-emerald-400' : 'text-neutral-300'}`}>
          {isCredit ? '+' : '-'}${Math.abs(amount).toFixed(2)}
        </span>
        {/* Row 2 */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className="text-xs text-neutral-600 tabular-nums shrink-0">{txn.date}</span>
          {txn.account_name && (
            <span className="text-xs text-neutral-600 truncate">· {txn.account_name}</span>
          )}
        </div>
        <div className="flex justify-end items-center">
          {txn.category_name
            ? <CategoryPill name={txn.category_name} color={txn.category_color} />
            : txn.status !== 'tracked'
              ? <span className="text-xs text-neutral-500">{txn.status}</span>
              : null}
        </div>
        {/* Description — full width if present */}
        {txn.description && (
          <p className="text-xs text-neutral-500 truncate leading-tight col-span-2">{txn.description}</p>
        )}
      </div>

      {/* Desktop layout: flex row */}
      <div className="hidden sm:flex items-center gap-3">
        <span className="text-xs text-neutral-600 tabular-nums shrink-0 w-20">{txn.date}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-200 truncate leading-tight">{txn.merchant || '—'}</p>
          {txn.description && (
            <p className="text-xs text-neutral-500 truncate leading-tight">{txn.description}</p>
          )}
          {txn.account_name && (
            <p className="text-xs text-neutral-600 truncate leading-tight">{txn.account_name}</p>
          )}
        </div>
        <span className="text-xs text-neutral-700 shrink-0 w-14 text-right">
          {txn.status !== 'tracked' ? txn.status : ''}
        </span>
        <div className="w-24 shrink-0 flex justify-end">
          {txn.category_name
            ? <CategoryPill name={txn.category_name} color={txn.category_color} />
            : <span className="text-xs text-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity">edit</span>}
        </div>
        <span className={`text-sm font-medium tabular-nums shrink-0 w-24 text-right ${isCredit ? 'text-emerald-400' : 'text-neutral-300'}`}>
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
  const [categoryFilter, setCategoryFilter] = useState<string>(location.state?.category ?? '')
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

  const [editingId, setEditingId] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ date: new Date().toISOString().slice(0, 10), merchant: '', amount: '', account: '', category: '', description: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function handleSaved(updated: Transaction) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  async function handleAddSubmit() {
    setAddSaving(true)
    setAddError(null)
    try {
      const txn = await createTransaction({
        account: Number(addForm.account),
        date: addForm.date,
        amount: parseFloat(addForm.amount),
        merchant: addForm.merchant,
        description: addForm.description,
        category: addForm.category ? Number(addForm.category) : null,
        status: 'tracked',
      })
      setTransactions(prev => [txn, ...prev])
      setShowAddModal(false)
      setAddForm({ date: new Date().toISOString().slice(0, 10), merchant: '', amount: '', account: '', category: '', description: '' })
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to create transaction.')
    } finally {
      setAddSaving(false)
    }
  }

  const months = monthOptions()

  const activeFilters = [
    month        ? { label: months.find(m => m.value === month)?.label ?? month, clear: () => setMonth('') } : null,
    categoryFilter ? { label: categories.find(c => String(c.id) === categoryFilter)?.name ?? 'Category', clear: () => setCategoryFilter('') } : null,
    accountFilter  ? { label: (accounts.find(a => String(a.id) === accountFilter)?.nickname || accounts.find(a => String(a.id) === accountFilter)?.name) ?? 'Account', clear: () => setAccountFilter('') } : null,
    statusFilter !== 'all' ? { label: statusFilter[0].toUpperCase() + statusFilter.slice(1), clear: () => setStatusFilter('all') } : null,
    debouncedSearch ? { label: `"${debouncedSearch}"`, clear: () => setSearch('') } : null,
  ].filter(Boolean) as { label: string; clear: () => void }[]

  return (
    <div>
      {/* Filters row 1: title + dropdowns */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <h1 className="text-sm font-medium text-neutral-300 mr-auto">Transactions</h1>
        {accounts.length > 1 && (
          <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} className={selectCls + ' max-w-[10rem]'}>
            <option value="">All accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={String(a.id)}>
                {a.nickname || a.name}{a.last_four ? ` ···${a.last_four}` : ''}
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
      </div>

      {/* Filters row 2: search + add button (always own line) */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Search merchant or notes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={selectCls + ' flex-1'}
        />
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-white text-neutral-900 text-xs font-semibold rounded hover:bg-neutral-100 transition-colors shrink-0"
        >
          + Add
        </button>
      </div>

      {/* Add transaction modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-neutral-900 border border-neutral-800 rounded-xl p-5 w-full max-w-md space-y-3 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-neutral-200">Add Transaction</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">Date</label>
                <input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
                  className={selectCls + ' w-full'} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">Amount ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={addForm.amount}
                  onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                  className={selectCls + ' w-full'} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Merchant</label>
              <input type="text" placeholder="e.g. Venmo, Cash" value={addForm.merchant}
                onChange={e => setAddForm(f => ({ ...f, merchant: e.target.value }))}
                className={selectCls + ' w-full'} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">Account</label>
                <select value={addForm.account} onChange={e => setAddForm(f => ({ ...f, account: e.target.value }))} className={selectCls + ' w-full'}>
                  <option value="">Cash &amp; Other</option>
                  {accounts.filter(a => a.account_type !== 'manual').map(a => (
                    <option key={a.id} value={String(a.id)}>{a.nickname || a.name}{a.last_four ? ` ···${a.last_four}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">Category</label>
                <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} className={selectCls + ' w-full'}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Note (optional)</label>
              <input type="text" placeholder="Add a note..." value={addForm.description}
                onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSubmit() }}
                className={selectCls + ' w-full'} />
            </div>

            {addError && <p className="text-red-400 text-xs">{addError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowAddModal(false)} className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAddSubmit}
                disabled={addSaving || !addForm.merchant || !addForm.amount}
                className="px-4 py-1.5 bg-white text-neutral-900 text-xs font-semibold rounded hover:bg-neutral-100 disabled:opacity-40 transition-colors"
              >
                {addSaving ? '...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Summary bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2 justify-between">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-xs text-neutral-500 shrink-0">{count} transactions</span>
          {activeFilters.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-800 border border-neutral-700/60 rounded-full text-xs text-neutral-300">
              {f.label}
              <button onClick={f.clear} className="text-neutral-500 hover:text-red-400 transition-colors leading-none ml-0.5">✕</button>
            </span>
          ))}
          {activeFilters.length > 1 && (
            <button
              onClick={() => { setMonth(''); setCategoryFilter(''); setAccountFilter(''); setStatusFilter('all'); setSearch('') }}
              className="text-xs text-neutral-600 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        <span className="text-base font-semibold tabular-nums shrink-0">${totalAmount.toFixed(2)}</span>
      </div>

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
            isEditing={editingId === txn.id}
            onStartEdit={() => setEditingId(txn.id)}
            onClose={() => setEditingId(null)}
            onSaved={handleSaved}
            onDeleted={id => setTransactions(prev => prev.filter(t => t.id !== id))}
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
