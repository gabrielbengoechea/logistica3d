import type { ReactNode } from 'react'

/** Control segmentado al estilo iOS: riel gris y el segmento elegido en blanco, con sombra. */
export function Segmented<T extends string | number>({
  items,
  value,
  onChange,
  label,
  size = 'md',
}: {
  items: readonly T[]
  value: T
  onChange: (v: T) => void
  label: (v: T) => string
  size?: 'sm' | 'md'
}) {
  return (
    <div className="flex rounded-[10px] p-[3px]" style={{ background: 'var(--fill)' }}>
      {items.map((it) => (
        <button
          key={String(it)}
          onClick={() => onChange(it)}
          className={`flex-1 whitespace-nowrap rounded-[8px] ${size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-4 text-[13px]'} ${it === value ? 'bg-white font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.12)]' : 'text-[var(--ink)]'}`}
        >
          {label(it)}
        </button>
      ))}
    </div>
  )
}

/** Interruptor al estilo iOS. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-[28px] w-[46px] shrink-0 rounded-full transition-colors ${on ? 'bg-[#34c759]' : 'bg-[rgba(120,120,128,0.22)]'}`}>
      <span className={`absolute top-[2px] h-6 w-6 rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.2)] transition-all ${on ? 'left-[20px]' : 'left-[2px]'}`} />
    </button>
  )
}

/** Título de sección de una lista agrupada. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="px-1 pb-1.5 text-[13px] font-semibold text-[var(--ink-2)]">{children}</div>
}
