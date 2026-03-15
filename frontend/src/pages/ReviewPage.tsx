import { useEffect, useState } from 'react'
import { getTransactions, getCategories, updateTransaction, declineTransaction } from '../lib/api'
import type { Transaction, Category } from '../lib/types'
import CategoryInput from '../components/CategoryInput'

// Each layer behind the top card gets a fixed messy rotation + offset
const LAYER_STYLES: React.CSSProperties[] = [
  { transform: 'rotate(2.8deg) translateY(10px) scale(0.99)', zIndex: 2 },
  { transform: 'rotate(-2.2deg) translateY(18px) scale(0.97)', zIndex: 1 },
]

export default function ReviewPage() {
  const [queue, setQueue] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null)
  const [saving, setSaving] = useState(false)

  // Oldest first for review
  const sorted = [...queue].sort((a, b) => a.date.localeCompare(b.date))
  const visible = sorted.slice(0, 3)
  const top = visible[0]

  useEffect(() => {
    Promise.all([
      getTransactions({ status: 'pending', limit: '500' }),
      getCategories(),
    ])
      .then(([paginated, cats]) => { setQueue(paginated.results); setCategories(cats) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function addCategory(cat: Category) {
    setCategories(prev => prev.some(c => c.id === cat.id) ? prev : [cat, ...prev])
  }

  const ANIM_MS = 200

  async function dismiss(dir: 'left' | 'right', apiCall: () => Promise<unknown>) {
    if (saving || !top) return
    const topId = top.id
    setSaving(true)
    setExitDir(dir)
    // Run animation timer and API call in parallel — card is gone when both finish
    const timer = new Promise(r => setTimeout(r, ANIM_MS))
    try {
      await Promise.all([apiCall(), timer])
    } catch (e) {
      setExitDir(null)
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Request failed.')
      return
    }
    setQueue(q => q.filter(t => t.id !== topId))
    setExitDir(null)
    setSaving(false)
  }

  async function handleConfirm(categoryId: number | null, description: string) {
    const merchant = top?.merchant ?? ''
    await dismiss('right', () =>
      updateTransaction(top!.id, { category: categoryId, description, status: 'confirmed' })
    )
    // Propagate the category to other queue items from the same merchant
    if (categoryId && merchant) {
      setQueue(q => q.map(t =>
        !t.category && t.merchant.toLowerCase() === merchant.toLowerCase()
          ? { ...t, category: categoryId }
          : t
      ))
    }
  }

  function handleDecline() {
    dismiss('left', () => declineTransaction(top!.id))
  }

  if (loading) return <p className="text-neutral-600 text-sm">Loading...</p>
  if (error) return <p className="text-red-400 text-sm">{error}</p>

  if (queue.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-600 text-sm">All caught up — no transactions to review.</p>
      </div>
    )
  }

  const topStyle: React.CSSProperties = exitDir
    ? {
        transform: exitDir === 'right'
          ? 'translateX(140%) rotate(18deg)'
          : 'translateX(-140%) rotate(-18deg)',
        opacity: 0,
        transition: 'transform 0.2s cubic-bezier(0.55, 0, 1, 0.45), opacity 0.2s ease',
        position: 'relative',
        zIndex: 10,
      }
    : { position: 'relative', zIndex: 10 }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-sm font-medium text-neutral-300">Review</h1>
        <span className="text-xs text-neutral-600">{queue.length} remaining</span>
      </div>

      {/* Card stack — extra padding-bottom so rotated background cards can peek below */}
      <div className="relative" style={{ paddingBottom: '36px' }}>

        {/* Background cards — rendered first so they sit behind */}
        {visible.slice(1).map((txn, i) => (
          <div
            key={txn.id}
            className="absolute inset-0 bg-neutral-900 border border-neutral-800 rounded-lg"
            style={LAYER_STYLES[i] ?? LAYER_STYLES[LAYER_STYLES.length - 1]}
          />
        ))}

        {/* Top card */}
        {top && (
          <div style={topStyle}>
            <TransactionReviewCard
              key={top.id}
              txn={top}
              categories={categories}
              saving={saving}
              onConfirm={handleConfirm}
              onDecline={handleDecline}
              onCategoryCreated={addCategory}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function TransactionReviewCard({
  txn,
  categories,
  saving,
  onConfirm,
  onDecline,
  onCategoryCreated,
}: {
  txn: Transaction
  categories: Category[]
  saving: boolean
  onConfirm: (categoryId: number | null, description: string) => void
  onDecline: () => void
  onCategoryCreated: (cat: Category) => void
}) {
  const [description, setDescription] = useState(txn.description)
  const [categoryId, setCategoryId] = useState<number | null>(txn.category)

  // When the queue propagates a category update (e.g. user confirmed same merchant
  // on another card), pull it in — but don't override something the user already set.
  useEffect(() => {
    if (txn.category != null) setCategoryId(txn.category)
  }, [txn.category])

  const amount = parseFloat(txn.amount)
  const isCredit = amount < 0

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col" style={{ minHeight: '260px' }}>
      {/* Top section — merchant + amount */}
      <div className="flex-1 px-6 pt-8 pb-4">
        <p className="text-xs text-neutral-600 mb-3">
          {txn.date}{txn.account_name ? ` · ${txn.account_name}` : ''}
        </p>
        <p className="text-xl font-semibold text-white leading-snug mb-1">
          {txn.merchant || '(no merchant)'}
        </p>
        <p className={`text-3xl font-bold tabular-nums mt-4 ${isCredit ? 'text-emerald-400' : 'text-neutral-100'}`}>
          {isCredit ? '+' : '-'}${Math.abs(amount).toFixed(2)}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-800 mx-6" />

      {/* Bottom section — inputs + actions */}
      <div className="px-6 py-4 space-y-3">
        <div className="flex gap-2">
          <CategoryInput
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCreateAndSelect={onCategoryCreated}
          />
          <input
            type="text"
            placeholder="Add a note..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onConfirm(categoryId, description) }}
            className="flex-1 bg-neutral-800 border border-neutral-700/60 rounded px-2.5 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onDecline}
            disabled={saving}
            className="flex-1 py-2 bg-neutral-800 border border-neutral-700/60 text-neutral-500 text-xs rounded-lg hover:text-red-400 hover:border-red-900/60 disabled:opacity-40 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={() => onConfirm(categoryId, description)}
            disabled={saving}
            className="flex-1 py-2 bg-white text-neutral-900 text-xs font-semibold rounded-lg hover:bg-neutral-100 disabled:opacity-40 transition-colors"
          >
            {saving ? '...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
