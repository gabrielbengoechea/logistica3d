import { useState, type ReactNode } from 'react'
import { TOURS } from '../didactic/tours'
import { ACTIVITIES } from '../didactic/activities'
import { useStore } from '../store'
import ActivityPanel from './ActivityPanel'
import { SectionTitle } from './controls'
import { Icon, type IconName } from './icons'
import InfoCard from './InfoCard'
import Now from './Now'
import { Simulator } from './SimPanel'

type Route = 'inicio' | 'simulador' | 'actividades' | 'recorridos'

const TITLES: Record<Exclude<Route, 'inicio'>, string> = {
  simulador: 'Simulador',
  actividades: 'Actividades',
  recorridos: 'Recorridos guiados',
}

/** Fila de lista que lleva a otra pantalla de la barra lateral. */
function LinkRow({ icon, label, detail, onClick }: { icon: IconName; label: string; detail?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[15px] hover:bg-[#f7f7fa]">
      <span style={{ color: 'var(--icon-link)' }}>
        <Icon name={icon} size={20} />
      </span>
      <span className="flex-1">{label}</span>
      {detail && <span className="text-[14px] text-[var(--ink-3)]">{detail}</span>}
      <span className="text-[18px] leading-none text-[#c7c7cc]">›</span>
    </button>
  )
}

function Tours() {
  const setTour = useStore((s) => s.setTour)
  return (
    <div className="space-y-3">
      <p className="px-1 text-[13.5px] leading-snug text-[var(--ink-2)]">
        La cámara vuela sola de un lugar a otro, con un texto corto en cada paso. Se avanza con las flechas y se sale con Esc.
      </p>
      <div className="inset-list">
        {TOURS.map((t) => (
          <button key={t.key} onClick={() => setTour({ key: t.key, step: 0 })} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#f7f7fa]">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--accent)] text-white">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7 4.5v15l13-7.5z" />
              </svg>
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-medium">{t.title}</span>
              <span className="text-[13px] text-[var(--ink-2)]">{t.steps.length} pasos</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Barra lateral, como la tarjeta de un lugar en un mapa: título del puerto, "Ahora" con los indicadores y
 * "Explorar" para abrir el simulador, las actividades o los recorridos. Lo que se toca en la escena (un buque, una
 * grúa, el patio) muestra su ficha acá mismo.
 */
export default function Sidebar() {
  const [route, setRoute] = useState<Route>('inicio')
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  const selection = useStore((s) => s.selection)

  let body: ReactNode
  if (selection) body = <InfoCard />
  else if (route === 'simulador') body = <Simulator />
  else if (route === 'actividades') body = <ActivityPanel onOpenSimulator={() => setRoute('simulador')} />
  else if (route === 'recorridos') body = <Tours />
  else
    body = (
      <div className="space-y-5">
        <Now />
        <div>
          <SectionTitle>Explorar</SectionTitle>
          <div className="inset-list">
            <LinkRow icon="ajustes" label="Simulador" onClick={() => setRoute('simulador')} />
            <LinkRow icon="tarea" label="Actividades" detail={String(ACTIVITIES.length)} onClick={() => setRoute('actividades')} />
            <LinkRow icon="ruta" label="Recorridos guiados" detail={String(TOURS.length)} onClick={() => setRoute('recorridos')} />
          </div>
        </div>
      </div>
    )

  const home = route === 'inicio' && !selection
  return (
    <aside className="material pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-[22px] sm:w-[340px]">
      <header className="flex items-start gap-2 px-5 pt-4 pb-3">
        {home || collapsed ? (
          <div className="flex flex-1 flex-col">
            <span className="text-[13px] font-medium text-[var(--ink-2)]">Logística 3D</span>
            <span className="text-[26px] leading-tight font-bold tracking-tight">Puerto de Montevideo</span>
            {!collapsed && <span className="text-[13px] text-[var(--ink-2)]">Terminal de contenedores · operación simulada</span>}
          </div>
        ) : selection ? (
          <span className="flex-1 text-[13px] font-medium text-[var(--ink-2)]">Puerto de Montevideo</span>
        ) : (
          <div className="flex flex-1 flex-col items-start">
            <button onClick={() => setRoute('inicio')} className="-ml-1.5 flex items-center gap-0.5 text-[15px] text-[var(--accent)]">
              <Icon name="atras" size={20} stroke={2.4} />
              Puerto
            </button>
            <span className="text-[26px] leading-tight font-bold tracking-tight">{TITLES[route as Exclude<Route, 'inicio'>]}</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Mostrar el panel' : 'Achicar el panel'}
          className="mt-1 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--fill)] text-[var(--ink-2)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: collapsed ? 'rotate(180deg)' : undefined }}>
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
      </header>
      {!collapsed && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{body}</div>
          {home && (
            <p className="px-5 pb-4 text-[11px] leading-snug text-[var(--ink-3)]">
              Relieve: Copernicus DEM · Imagen: Copernicus Sentinel-2 · Edificios y contorno del puerto: Overture Maps / © colaboradores de
              OpenStreetMap (ODbL) · Partes del puerto y datos de TCP: ANP · Operación simulada
            </p>
          )}
        </>
      )}
    </aside>
  )
}
