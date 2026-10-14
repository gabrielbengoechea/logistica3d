import { useEffect, useState, type ReactNode } from 'react'
import { holdAxis, releaseAxis, type NavAxis } from '../scene/navInput'
import { UI_SCALES, useStore, type IconTint, type Quality, type UiScale, type View } from '../store'
import { Segmented, Toggle } from './controls'
import { Icon, type IconName } from './icons'
import MovePanel from './NavPad'

const VIEW_LABEL: Record<View, string> = { terminal: 'Terminal', bahia: 'Bahía', escalas: 'Tamaños' }

/** Vistas de la cámara, como control segmentado. */
export function ViewSwitcher() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  return (
    <div className="material pointer-events-auto rounded-[13px]">
      <Segmented items={['terminal', 'bahia', 'escalas'] as const} value={view} onChange={setView} label={(v) => VIEW_LABEL[v]} />
    </div>
  )
}

/** Grupo de botones de ícono apilados, separados por una línea fina. */
function Stack({ children }: { children: ReactNode }) {
  return <div className="material pointer-events-auto flex flex-col overflow-hidden rounded-[13px] [&>*+*]:border-t [&>*+*]:border-[var(--separator)]">{children}</div>
}

function IconButton({ icon, label, onClick, active = false }: { icon: IconName; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`flex h-11 w-11 items-center justify-center ${active ? 'text-[var(--accent)]' : 'text-[var(--ink)]'} hover:bg-white/60`}>
      <Icon name={icon} size={19} />
    </button>
  )
}

/** Botón que mueve la cámara mientras se mantiene apretado. */
function HoldButton({ axis, value, label, children }: { axis: NavAxis; value: number; label: string; children: ReactNode }) {
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
      className="flex h-11 w-11 touch-none items-center justify-center text-[22px] font-light text-[var(--ink)] select-none hover:bg-white/60"
    >
      {children}
    </button>
  )
}

const SCALE_LABEL: Record<UiScale, string> = { 0.85: 'Chica', 1: 'Normal', 1.15: 'Grande', 1.3: 'Muy grande' }

const TINTS: { key: IconTint; label: string; swatch: string; ring?: boolean }[] = [
  { key: 'sistema', label: 'Sistema', swatch: 'conic-gradient(#007aff 0 25%, #ff9500 0 50%, #34c759 0 75%, #af52de 0)' },
  { key: 'azul', label: 'Azul', swatch: '#0a6cff' },
  { key: 'grafito', label: 'Grafito', swatch: '#2c2c2e' },
  { key: 'puerto', label: 'Puerto', swatch: 'conic-gradient(#1f3557 0 50%, #3a6fd8 0 75%, #7c838c 0)' },
  { key: 'trazo', label: 'Trazo', swatch: '#ffffff', ring: true },
]

/** Ajustes de la escena: calidad gráfica, comparación de tamaños y color de los íconos. */
function Settings({ onClose }: { onClose: () => void }) {
  const quality = useStore((s) => s.quality)
  const showScale = useStore((s) => s.showScale)
  const iconTint = useStore((s) => s.iconTint)
  const uiScale = useStore((s) => s.uiScale)
  const { setQuality, setShowScale, setIconTint, setUiScale } = useStore.getState()
  return (
    <div className="material pointer-events-auto w-[300px] space-y-4 rounded-[18px] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[17px] font-semibold">Ajustes</span>
        <button onClick={onClose} aria-label="Cerrar ajustes" className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[var(--fill)] text-[var(--ink-2)]">
          <Icon name="cerrar" size={12} stroke={3} />
        </button>
      </div>
      <div className="space-y-1.5">
        <span className="px-1 text-[13px] font-semibold text-[var(--ink-2)]">Tamaño de la interfaz</span>
        <Segmented items={UI_SCALES} value={uiScale} onChange={(v: UiScale) => setUiScale(v)} label={(v) => SCALE_LABEL[v]} size="sm" />
      </div>
      <div className="space-y-1.5">
        <span className="px-1 text-[13px] font-semibold text-[var(--ink-2)]">Calidad gráfica</span>
        <Segmented items={['alta', 'media', 'baja'] as Quality[]} value={quality} onChange={(q) => setQuality(q, true)} label={(q) => q[0].toUpperCase() + q.slice(1)} />
        <p className="px-1 text-[12px] leading-snug text-[var(--ink-3)]">Si la animación va a tirones, bajala.</p>
      </div>
      <div className="inset-list">
        <label className="flex items-center justify-between gap-3 px-3 py-2.5 text-[15px]">
          Comparar tamaños
          <Toggle on={showScale} onChange={setShowScale} label="Comparar tamaños" />
        </label>
      </div>
      <div className="space-y-1.5">
        <span className="px-1 text-[13px] font-semibold text-[var(--ink-2)]">Color de los íconos</span>
        <div className="flex justify-between px-1">
          {TINTS.map((t) => (
            <button key={t.key} onClick={() => setIconTint(t.key)} className="flex flex-col items-center gap-1 text-[11.5px]" aria-pressed={iconTint === t.key}>
              <span
                className={`h-8 w-8 rounded-full ${iconTint === t.key ? 'ring-2 ring-[var(--accent)] ring-offset-2' : ''}`}
                style={{ background: t.swatch, boxShadow: t.ring ? 'inset 0 0 0 1.5px #c7c7cc' : undefined }}
              />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Controles de arriba a la derecha: presentar, luz y ajustes. */
export function TopControls() {
  const presenting = useStore((s) => s.presenting)
  const dayNight = useStore((s) => s.dayNight)
  const { setPresenting, setDayNight } = useStore.getState()
  const [settings, setSettings] = useState(false)

  // Si se sale de pantalla completa con Esc, también se sale del modo presentación.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) useStore.getState().setPresenting(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return (
    <div className="flex flex-col items-end gap-2.5">
      <Stack>
        <IconButton
          icon="pantalla"
          label={presenting ? 'Salir de la presentación' : 'Presentar: interfaz grande y pantalla completa'}
          active={presenting}
          onClick={() => {
            if (!presenting) document.documentElement.requestFullscreen?.().catch(() => {})
            else if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
            setPresenting(!presenting)
          }}
        />
        <IconButton icon={dayNight ? 'luna' : 'sol'} label={dayNight ? 'La luz sigue la hora (tocar para dejarla siempre de día)' : 'Siempre de día (tocar para que siga la hora)'} onClick={() => setDayNight(!dayNight)} />
        <IconButton icon="mas" label="Ajustes" active={settings} onClick={() => setSettings(!settings)} />
      </Stack>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  )
}

/** Controles de abajo a la derecha: acercar, alejar y el panel para mover la cámara. */
export function BottomControls() {
  const [move, setMove] = useState(false)
  return (
    <div className="flex flex-col items-end gap-2.5">
      {move && <MovePanel onClose={() => setMove(false)} />}
      <Stack>
        <IconButton icon="mover" label="Mover la cámara" active={move} onClick={() => setMove(!move)} />
        <HoldButton axis="zoom" value={1} label="Acercar">
          +
        </HoldButton>
        <HoldButton axis="zoom" value={-1} label="Alejar">
          −
        </HoldButton>
      </Stack>
    </div>
  )
}
