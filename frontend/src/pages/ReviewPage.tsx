import { useEffect, useState } from 'react'
import { SkipForward } from 'lucide-react'
import { getTransactions, getCategories, updateTransaction, excludeTransaction } from '../lib/api'
import type { Transaction, Category } from '../lib/types'
import CategoryInput from '../components/CategoryInput'

const LAYER_STYLES: React.CSSProperties[] = [
  { transform: 'rotate(2.1deg) translateY(-11px) translateX(-8px) scale(0.98)', zIndex: 2, opacity: 0.8 },
  { transform: 'rotate(-1.9deg) translateY(-12px) scale(0.97)', zIndex: 1, opacity: 0.5 },
]

export default function ReviewPage() {
  const [queue, setQueue] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [animatingCard, setAnimatingCard] = useState<Transaction | null>(null)
  const [exitDir, setExitDir] = useState<'left' | 'right' | 'skip-behind' | 'skip-settle' | null>(null)
  const [saving, setSaving] = useState(false)

  // Queue is kept in review order — oldest first initially, skipped cards move to the end
  const top = queue[0]

  useEffect(() => {
    Promise.all([
      getTransactions({ status: 'unreviewed', limit: '500' }),
      getCategories(),
    ])
      .then(([paginated, cats]) => {
        const inOrder = [...paginated.results].sort((a, b) => a.date.localeCompare(b.date))
        setQueue(inOrder)
        setCategories(cats)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to fetch data'))
      .finally(() => setLoading(false))
  }, [])

  function addCategory(cat: Category) {
    setCategories(prev => prev.some(c => c.id === cat.id) ? prev : [cat, ...prev])
  }

  async function handleSkip() {
    if (saving || !top) return
    const cardToAnimate = top
    setSaving(true)
    setAnimatingCard(cardToAnimate)
    // Move card to the end of the queue so the next card becomes top
    setQueue(q => [...q.filter(t => t.id !== cardToAnimate.id), cardToAnimate])
    // exitDir is null — card mounts at its current position (no transform) first

    // Wait two frames so the card is painted at its start position before transitioning
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    setExitDir('skip-behind')
    await new Promise(r => setTimeout(r, 300))

    setExitDir('skip-settle')
    await new Promise(r => setTimeout(r, 250))

    setAnimatingCard(null)
    setExitDir(null)
    setSaving(false)
  }

  async function dismiss(dir: 'left' | 'right', apiCall: () => Promise<unknown>) {
    if (saving || !top) return
    const cardToAnimate = top
    setSaving(true)
    setAnimatingCard(cardToAnimate)
    setQueue(q => q.filter(t => t.id !== cardToAnimate.id))
    // exitDir null — card renders at starting position before transition fires

    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    setExitDir(dir)
    await new Promise(r => setTimeout(r, 420))

    setAnimatingCard(null)
    setExitDir(null)
    setSaving(false)
    apiCall().catch(e => setError(e instanceof Error ? e.message : 'Request failed.'))
  }

  if (loading) return <p className="text-neutral-600 text-sm">Loading...</p>
  if (error) return <p className="text-red-400 text-sm">{error}</p>
  if (queue.length === 0 && !animatingCard) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-600 text-sm">All caught up — no transactions to review.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-sm font-medium text-neutral-300">Review</h1>
        <span className="text-xs text-neutral-600">{queue.length} remaining</span>
      </div>

      <div className="relative" style={{ paddingBottom: '36px' }}>
        {(() => {
          const visibleCards = queue.slice(0, 3).filter(t => t.id !== animatingCard?.id)
          return [...visibleCards].reverse().map((txn, i) => {
            const stackDepth = visibleCards.length - 1 - i
            const isTop = stackDepth === 0

            const style: React.CSSProperties = isTop
              ? {
                  position: 'relative',
                  zIndex: 10,
                  transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                }
              : {
                  ...LAYER_STYLES[stackDepth - 1],
                  position: 'absolute',
                  inset: 0,
                  transition: 'all 0.4s ease-in-out',
                }

            return (
              <div key={txn.id} style={style}>
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl h-full w-full overflow-hidden">
                  {isTop && (
                    <TransactionReviewCard
                      txn={txn}
                      categories={categories}
                      saving={saving}
                      onConfirm={(catId, desc) =>
                        dismiss('right', () => updateTransaction(txn.id, { category: catId, description: desc, status: 'tracked' }))
                      }
                      onDecline={() => dismiss('left', () => excludeTransaction(txn.id))}
                      onSkip={handleSkip}
                      onCategoryCreated={addCategory}
                    />
                  )}
                </div>
              </div>
            )
          })
        })()}

        {animatingCard && (
          <div className="absolute inset-0" style={{ ...getAnimationStyle(exitDir), pointerEvents: 'none' }}>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl h-full w-full overflow-hidden">
              <TransactionReviewCard
                txn={animatingCard}
                categories={categories}
                saving={true}
                onConfirm={() => {}}
                onDecline={() => {}}
                onSkip={() => {}}
                onCategoryCreated={() => {}}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getAnimationStyle(dir: string | null): React.CSSProperties {
  // Initial position matches the top card exactly — no transform, sits on top
  const base: React.CSSProperties = { position: 'absolute', inset: 0, zIndex: 10 }
  switch (dir) {
    case 'right':
      // Card flies right: lifts slightly, accelerates off screen, stays fully visible
      return { ...base, transform: 'translateX(155%) translateY(-30px) rotate(20deg)', opacity: 1, transition: 'transform 420ms cubic-bezier(0.4, 0, 1, 0.6)' }
    case 'left':
      return { ...base, transform: 'translateX(-155%) translateY(-30px) rotate(-20deg)', opacity: 1, transition: 'transform 420ms cubic-bezier(0.4, 0, 1, 0.6)' }
    case 'skip-behind':
      // Card sweeps down and behind — fully opaque, drops below the background cards
      return { ...base, transform: 'translateY(120%) scale(0.88) rotate(-4deg)', opacity: 1, transition: 'transform 300ms ease-in, opacity 300ms ease-in', zIndex: 0 }
    case 'skip-settle':
      // Rises back up into the back-of-stack position — exactly matches LAYER_STYLES[1]
      return { ...base, transform: 'rotate(-2.2deg) translateY(18px) scale(0.97)', opacity: 0.5, transition: 'transform 250ms ease-out, opacity 250ms ease-out', zIndex: 1 }
    default:
      return base
  }
}

interface CardProps {
  txn: Transaction
  categories: Category[]
  saving: boolean
  onConfirm: (categoryId: number | null, description: string) => void
  onDecline: () => void
  onSkip: () => void
  onCategoryCreated: (cat: Category) => void
}

function TransactionReviewCard({ 
  txn, 
  categories, 
  saving, 
  onConfirm, 
  onDecline, 
  onSkip, 
  onCategoryCreated 
}: CardProps) {
  const [description, setDescription] = useState(txn.description)
  const [categoryId, setCategoryId] = useState<number | null>(txn.category)

  useEffect(() => {
    if (txn.category !== undefined) setCategoryId(txn.category)
  }, [txn.category])

  const amount = parseFloat(txn.amount)
  const isCredit = amount < 0

  return (
    <div className="relative flex flex-col h-full bg-neutral-900">
      <button
        onClick={onSkip}
        disabled={saving}
        className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1.5 text-neutral-600 hover:text-neutral-400 disabled:opacity-40 transition-colors"
      >
        <span className="text-xs">Skip</span>
        <SkipForward size={13} strokeWidth={1.8} />
      </button>
      
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

      <div className="border-t border-neutral-800 mx-6" />

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
            placeholder="Note..." 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && onConfirm(categoryId, description)} 
            className="flex-1 bg-neutral-800 border border-neutral-700/60 rounded px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-neutral-500 transition-colors" 
          />
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onDecline} 
            disabled={saving} 
            className="flex-1 py-2 bg-neutral-800 border border-neutral-700/60 text-neutral-500 text-xs rounded-lg hover:text-red-400 transition-colors"
          >
            Exclude
          </button>
          <button 
            onClick={() => onConfirm(categoryId, description)} 
            disabled={saving} 
            className="flex-1 py-2 bg-white text-neutral-900 text-xs font-semibold rounded-lg hover:bg-neutral-100 disabled:opacity-40 transition-colors"
          >
            {saving ? '...' : 'Track'}
          </button>
        </div>
      </div>
    </div>
  )
}