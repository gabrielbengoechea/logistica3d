import { useState, type ReactNode } from 'react'
import { holdAxis, releaseAxis, type NavAxis } from '../scene/navInput'
import { useStore } from '../store'
import Panel from './Panel'

const ICONS = {
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  turnLeft: 'M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5',
  turnRight: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  rise: 'M5 4h14M12 20V8M7 13l5-5 5 5',
  sink: 'M5 20h14M12 4v12M7 11l5 5 5-5',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  close: 'M6 6l12 12M18 6L6 18',
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

/** Botón que mueve la cámara mientras se mantiene apretado (mouse o dedo). */
function Hold({ axis, value, label, icon, className = '' }: { axis: NavAxis; value: number; label: string; icon: string; className?: string }) {
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
      className={`flex h-10 w-10 touch-none select-none items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-white hover:text-slate-900 active:bg-blue-600 active:text-white ${className}`}
    >
      <Icon d={icon} />
    </button>
  )
}

/** Par de botones en una pastilla vertical, con su nombre abajo. */
function Pill({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-col rounded-full bg-slate-100 p-0.5">{children}</div>
      <span className="text-[10px] font-medium text-slate-500">{caption}</span>
    </div>
  )
}

function savedOpen() {
  try {
    return localStorage.getItem('l3-nav-open') === '1'
  } catch {
    return false
  }
}

/**
 * Controles de cámara en pantalla, plegados por defecto: en la pantalla táctil alcanzan los gestos (un dedo
 * gira, dos dedos desplazan y acercan). Se despliegan para quien prefiera botones. El teclado hace lo mismo.
 */
export default function NavPad() {
  const [open, setOpenState] = useState(savedOpen)
  const touring = useStore((s) => s.tour !== null)
  const setOpen = (v: boolean) => {
    setOpenState(v)
    try {
      localStorage.setItem('l3-nav-open', v ? '1' : '0')
    } catch {
      // Sin almacenamiento: se recuerda solo en esta sesión.
    }
  }
  if (touring) return null

  if (!open)
    return (
      <Panel className="self-start">
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-slate-700 hover:text-blue-700" title="Controles para mover la cámara">
          <Icon d={ICONS.move} size={16} />
          Mover
        </button>
      </Panel>
    )

  return (
    <Panel className="self-start px-3 pt-2 pb-2.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-slate-700">Mover la cámara</span>
        <button onClick={() => setOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Plegar los controles">
          <Icon d={ICONS.close} size={14} />
        </button>
      </div>
      <div className="flex items-start gap-2.5">
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-[120px] w-[120px] rounded-full bg-slate-100">
            <Hold axis="forward" value={1} label="Avanzar (W o ↑)" icon={ICONS.up} className="absolute top-0.5 left-1/2 -translate-x-1/2" />
            <Hold axis="forward" value={-1} label="Retroceder (S o ↓)" icon={ICONS.down} className="absolute bottom-0.5 left-1/2 -translate-x-1/2" />
            <Hold axis="right" value={-1} label="Izquierda (A o ←)" icon={ICONS.left} className="absolute top-1/2 left-0.5 -translate-y-1/2" />
            <Hold axis="right" value={1} label="Derecha (D o →)" icon={ICONS.right} className="absolute top-1/2 right-0.5 -translate-y-1/2" />
            <span className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300" />
          </div>
          <span className="text-[10px] font-medium text-slate-500">Desplazar</span>
        </div>
        <Pill caption="Zoom">
          <Hold axis="zoom" value={1} label="Acercar (+)" icon={ICONS.plus} />
          <Hold axis="zoom" value={-1} label="Alejar (−)" icon={ICONS.minus} />
        </Pill>
        <Pill caption="Girar">
          <Hold axis="turn" value={1} label="Girar a la izquierda (Q)" icon={ICONS.turnLeft} />
          <Hold axis="turn" value={-1} label="Girar a la derecha (E)" icon={ICONS.turnRight} />
        </Pill>
        <Pill caption="Altura">
          <Hold axis="up" value={1} label="Subir (R)" icon={ICONS.rise} />
          <Hold axis="up" value={-1} label="Bajar (F)" icon={ICONS.sink} />
        </Pill>
      </div>
      <p className="mt-2 max-w-[260px] text-[10.5px] leading-snug text-slate-500">
        Con los dedos: uno gira, dos desplazan y acercan. Doble toque: ir ahí. Teclado: WASD, Q/E, R/F.
      </p>
    </Panel>
  )
}
