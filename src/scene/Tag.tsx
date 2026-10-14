import type { ReactNode } from 'react'

/** Etiqueta flotante sobre la escena (se usa dentro de <Html> de drei), como los marcadores de un mapa. */
export default function Tag({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'accent' | 'muted' }) {
  const tones = {
    plain: 'bg-white text-[#1d1d1f] shadow-[0_3px_10px_rgba(0,0,0,0.16)]',
    accent: 'bg-[#007aff] text-white shadow-[0_3px_10px_rgba(0,122,255,0.35)]',
    muted: 'bg-white/75 text-[#3a3a3c] shadow-[0_2px_6px_rgba(0,0,0,0.1)] backdrop-blur',
  }
  return <div className={`pointer-events-none rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</div>
}
