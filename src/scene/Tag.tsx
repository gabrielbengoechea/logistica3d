import type { ReactNode } from 'react'

/** Etiqueta flotante sobre la escena (se usa dentro de <Html> de drei). */
export default function Tag({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'accent' | 'muted' }) {
  const tones = {
    plain: 'bg-white/95 text-slate-700',
    accent: 'bg-blue-600 text-white',
    muted: 'bg-white/70 text-slate-500',
  }
  return (
    <div className={`pointer-events-none whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium shadow-sm ${tones[tone]}`}>
      {children}
    </div>
  )
}
