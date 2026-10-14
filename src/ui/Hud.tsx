import { useEffect } from 'react'
import { useStore } from '../store'
import { BottomControls, TopControls, ViewSwitcher } from './MapControls'
import Player from './Player'
import Sidebar from './Sidebar'
import { TourCaption } from './Tours'

function Loading() {
  const ready = useStore((s) => s.zoneReady)
  if (ready) return null
  return (
    <div className="material absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-5 py-2.5 text-[15px] font-medium text-[var(--ink-2)]">
      Cargando el mapa de Montevideo…
    </div>
  )
}

/** En modo presentación la interfaz se agranda para leerse desde el fondo del aula. */
const PRESENT_ZOOM = 1.3

/**
 * Capa de interfaz sobre la escena 3D, al estilo de un mapa: barra lateral a la izquierda, vistas arriba, controles
 * del mapa a la derecha y el reproductor abajo. Solo los paneles reciben clics; el resto pasa a la escena.
 */
export default function Hud() {
  const presenting = useStore((s) => s.presenting)
  const touring = useStore((s) => s.tour !== null)
  const iconTint = useStore((s) => s.iconTint)
  useEffect(() => {
    document.documentElement.dataset.icons = iconTint
  }, [iconTint])
  const zoom = presenting ? { zoom: PRESENT_ZOOM } : undefined

  return (
    <div className="pointer-events-none absolute inset-0 z-30" style={zoom}>
      <Loading />
      {!touring && (
        <div className="absolute top-2 right-[60px] left-2 flex max-h-[52%] sm:top-4 sm:right-auto sm:bottom-4 sm:left-4 sm:max-h-none">
          <Sidebar />
        </div>
      )}
      <div className={`absolute top-4 hidden justify-center sm:flex ${touring ? 'right-20 left-4' : 'right-20 left-[372px]'}`}>
        <ViewSwitcher />
      </div>
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4">
        <TopControls />
      </div>
      <div className="absolute right-2 bottom-[84px] sm:right-4 sm:bottom-4">
        <BottomControls />
      </div>
      <div className={`absolute right-2 bottom-2 left-2 flex flex-col items-center gap-3 sm:right-[76px] sm:bottom-4 ${touring ? 'sm:left-4' : 'sm:left-[372px]'}`}>
        <TourCaption />
        <div className="sm:hidden">
          <ViewSwitcher />
        </div>
        <div className="pointer-events-none w-full">
          <Player />
        </div>
      </div>
    </div>
  )
}
