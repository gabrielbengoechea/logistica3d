import type { ReactNode } from 'react'

/** Tarjeta flotante de material translúcido. */
export default function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`material pointer-events-auto rounded-[22px] ${className}`}>{children}</div>
}
