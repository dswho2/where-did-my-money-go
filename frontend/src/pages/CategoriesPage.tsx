import { useEffect, useRef, useState } from 'react'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../lib/api'
import type { Category } from '../lib/types'

function CategoryRow({
  category,
  onUpdated,
  onDeleted,
}: {
  category: Category
  onUpdated: (updated: Category) => void
  onDeleted: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) { setEditing(false); return }
    setSaving(true)
    setError(null)
    try {
      const updated = await updateCategory(category.id, { name: trimmed })
      onUpdated(updated)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename.')
    } finally {
      setSaving(false)
    }
  }

  async function saveColor(color: string) {
    try {
      const updated = await updateCategory(category.id, { color })
      onUpdated(updated)
    } catch {
      // non-critical, ignore
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') saveName()
    if (e.key === 'Escape') { setName(category.name); setEditing(false) }
  }

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    setSaving(true)
    try {
      await deleteCategory(category.id)
      onDeleted(category.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete.')
      setSaving(false)
      setConfirming(false)
    }
  }

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-neutral-800/50 last:border-0 group">
      {/* Color swatch */}
      <label className="relative shrink-0 cursor-pointer" title="Change color">
        <span
          className="block w-4 h-4 rounded-full border-2 border-neutral-700 hover:border-neutral-500 transition-colors"
          style={{ backgroundColor: category.color }}
        />
        <input
          type="color"
          value={category.color}
          onChange={e => onUpdated({ ...category, color: e.target.value })}
          onBlur={e => saveColor(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </label>

      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={saveName}
          disabled={saving}
          className="flex-1 bg-neutral-800 border border-neutral-600 rounded px-2.5 py-1 text-sm text-neutral-200 focus:outline-none focus:border-neutral-400 transition-colors"
        />
      ) : (
        <span
          className="flex-1 text-sm text-neutral-200 cursor-pointer hover:text-white transition-colors"
          onClick={() => setEditing(true)}
        >
          {category.name}
        </span>
      )}

      {typeof category.usage === 'number' && (
        <span className="text-xs text-neutral-600 tabular-nums shrink-0">
          {category.usage} {category.usage === 1 ? 'txn' : 'txns'}
        </span>
      )}

      {!editing && (
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-neutral-700 hover:text-neutral-400 opacity-0 group-hover:opacity-100 sm:block hidden transition-all"
        >
          rename
        </button>
      )}

      <button
        onClick={handleDelete}
        disabled={saving}
        onBlur={() => setConfirming(false)}
        className={`text-xs shrink-0 transition-colors disabled:opacity-40 ${
          confirming
            ? 'text-red-400 hover:text-red-300'
            : 'text-neutral-700 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100'
        }`}
      >
        {confirming ? 'confirm delete' : 'delete'}
      </button>

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#818cf8')
  const [colorPickerTouched, setColorPickerTouched] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    setCreating(true)
    setCreateError(null)
    try {
      // Only pass color if user explicitly changed it; otherwise let backend auto-assign
      const cat = await createCategory(trimmed, colorPickerTouched ? newColor : undefined)
      setCategories(prev => [cat, ...prev])
      setNewName('')
      setNewColor('#818cf8')
      setColorPickerTouched(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create.')
    } finally {
      setCreating(false)
    }
  }

  function handleUpdated(updated: Category) {
    setCategories(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
  }

  function handleDeleted(id: number) {
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div>
      <h1 className="text-sm font-medium text-neutral-300 mb-4">Categories</h1>

      {/* Add new */}
      <form onSubmit={handleCreate} className="flex gap-2 mb-6">
        <label className="relative shrink-0 cursor-pointer self-center" title="Pick color">
          <span
            className="block w-7 h-7 rounded-full border-2 border-neutral-700 hover:border-neutral-500 transition-colors"
            style={{ backgroundColor: newColor }}
          />
          <input
            type="color"
            value={newColor}
            onChange={e => { setNewColor(e.target.value); setColorPickerTouched(true) }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </label>
        <input
          type="text"
          placeholder="New category name..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          disabled={creating}
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="px-4 py-1.5 bg-white text-neutral-900 text-sm font-medium rounded hover:bg-neutral-100 disabled:opacity-40 transition-colors"
        >
          {creating ? '...' : 'Add'}
        </button>
      </form>
      {createError && <p className="text-red-400 text-xs mb-4">{createError}</p>}

      {loading && <p className="text-neutral-600 text-sm">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && categories.length === 0 && (
        <p className="text-neutral-600 text-sm">No categories yet.</p>
      )}

      <div>
        {categories.map(cat => (
          <CategoryRow
            key={cat.id}
            category={cat}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
    </div>
  )
}
