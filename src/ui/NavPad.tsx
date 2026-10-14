import type { ReactNode } from 'react'
import { holdAxis, releaseAxis, type NavAxis } from '../scene/navInput'
import { Icon } from './icons'

const ARROWS = {
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  turnLeft: 'M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5',
  turnRight: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5',
  rise: 'M5 4h14M12 20V8M7 13l5-5 5 5',
  sink: 'M5 20h14M12 4v12M7 11l5 5 5-5',
}

/** Botón que mueve la cámara mientras se mantiene apretado (mouse o dedo). */
function Hold({ axis, value, label, path, className = '' }: { axis: NavAxis; value: number; label: string; path: string; className?: string }) {
  const stop = () => releaseAxis(axis)
  return (
    <button
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        holdAxis(axis, value)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex h-10 w-10 touch-none items-center justify-center rounded-full text-[var(--ink)] select-none hover:bg-white active:bg-[var(--accent)] active:text-white ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={path} />
      </svg>
    </button>
  )
}

function Pill({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-col rounded-full bg-[var(--fill)] p-0.5">{children}</div>
      <span className="text-[11px] font-medium text-[var(--ink-2)]">{caption}</span>
    </div>
  )
}

/**
 * Panel para mover la cámara con botones. En la pantalla táctil alcanzan los gestos (un dedo gira, dos desplazan y
 * acercan); este panel es para quien prefiera botones. El teclado hace lo mismo.
 */
export default function MovePanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="material pointer-events-auto w-[290px] rounded-[18px] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[17px] font-semibold">Mover la cámara</span>
        <button onClick={onClose} aria-label="Cerrar" className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[var(--fill)] text-[var(--ink-2)]">
          <Icon name="cerrar" size={12} stroke={3} />
        </button>
      </div>
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-[124px] w-[124px] rounded-full bg-[var(--fill)]">
            <Hold axis="forward" value={1} label="Avanzar (W o ↑)" path={ARROWS.up} className="absolute top-1 left-1/2 -translate-x-1/2" />
            <Hold axis="forward" value={-1} label="Retroceder (S o ↓)" path={ARROWS.down} className="absolute bottom-1 left-1/2 -translate-x-1/2" />
            <Hold axis="right" value={-1} label="Izquierda (A o ←)" path={ARROWS.left} className="absolute top-1/2 left-1 -translate-y-1/2" />
            <Hold axis="right" value={1} label="Derecha (D o →)" path={ARROWS.right} className="absolute top-1/2 right-1 -translate-y-1/2" />
            <span className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c7c7cc]" />
          </div>
          <span className="text-[11px] font-medium text-[var(--ink-2)]">Desplazar</span>
        </div>
        <Pill caption="Girar">
          <Hold axis="turn" value={1} label="Girar a la izquierda (Q)" path={ARROWS.turnLeft} />
          <Hold axis="turn" value={-1} label="Girar a la derecha (E)" path={ARROWS.turnRight} />
        </Pill>
        <Pill caption="Altura">
          <Hold axis="up" value={1} label="Subir (R)" path={ARROWS.rise} />
          <Hold axis="up" value={-1} label="Bajar (F)" path={ARROWS.sink} />
        </Pill>
      </div>
      <p className="mt-3 text-[12px] leading-snug text-[var(--ink-2)]">
        Con los dedos: uno gira, dos desplazan y acercan. Doble toque: ir ahí. Teclado: WASD, Q/E, R/F.
      </p>
    </div>
  )
}
