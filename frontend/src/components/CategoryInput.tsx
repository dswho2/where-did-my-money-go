import { useEffect, useRef, useState } from 'react'
import { createCategory } from '../lib/api'
import type { Category } from '../lib/types'

export default function CategoryInput({
  categories,
  value,
  onChange,
  onCreateAndSelect,
  inputClassName,
}: {
  categories: Category[]
  value: number | null
  onChange: (id: number | null) => void
  onCreateAndSelect: (cat: Category) => void
  inputClassName?: string
}) {
  const current = categories.find(c => c.id === value)
  const [text, setText] = useState(current?.name ?? '')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Sync text when value changes externally (e.g. pre-filled by auto-categorizer)
  useEffect(() => {
    const cat = categories.find(c => c.id === value)
    setText(cat?.name ?? '')
  }, [value, categories])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = text.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(text.toLowerCase()))
    : categories.slice(0, 10)

  const exactMatch = categories.some(c => c.name.toLowerCase() === text.trim().toLowerCase())
  const showCreate = text.trim().length > 0 && !exactMatch

  function select(cat: Category) {
    setText(cat.name)
    onChange(cat.id)
    setOpen(false)
  }

  function clear() {
    setText('')
    onChange(null)
  }

  async function handleCreate() {
    const name = text.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const cat = await createCategory(name)
      onCreateAndSelect(cat)
      select(cat)
    } finally {
      setCreating(false)
    }
  }

  const cls = inputClassName ??
    'w-36 bg-neutral-800 border border-neutral-700/60 rounded px-2.5 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors pr-6'

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          placeholder="Category..."
          value={text}
          onChange={e => { setText(e.target.value); onChange(null); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className={cls}
        />
        {text && (
          <button
            onMouseDown={e => { e.preventDefault(); clear() }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 text-sm leading-none"
          >
            ×
          </button>
        )}
      </div>

      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-20 top-full mt-1 left-0 w-48 bg-neutral-800 border border-neutral-700 rounded-md shadow-xl overflow-hidden">
          {filtered.map(cat => (
            <button
              key={cat.id}
              onMouseDown={e => { e.preventDefault(); select(cat) }}
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors flex items-center gap-2"
            >
              {cat.color && (
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              )}
              {cat.name}
            </button>
          ))}
          {showCreate && (
            <button
              onMouseDown={e => { e.preventDefault(); handleCreate() }}
              disabled={creating}
              className="w-full text-left px-3 py-1.5 text-xs text-emerald-400 hover:bg-neutral-700 transition-colors border-t border-neutral-700/60 disabled:opacity-50"
            >
              {creating ? 'Creating...' : `Create "${text.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
