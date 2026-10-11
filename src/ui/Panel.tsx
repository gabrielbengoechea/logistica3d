import type { ReactNode } from 'react'

export default function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`pointer-events-auto rounded-2xl border border-white/70 bg-white/90 shadow-lg shadow-slate-900/5 backdrop-blur ${className}`}>{children}</div>
}
