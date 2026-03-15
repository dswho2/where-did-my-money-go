export default function CategoryPill({ name, color }: { name: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-neutral-800 text-neutral-300 shrink-0">
      {color && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      )}
      {name}
    </span>
  )
}
