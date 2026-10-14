import InfoCard from './InfoCard'
import Kpis from './Kpis'
import NavPad from './NavPad'
import Panel from './Panel'
import SimPanel from './SimPanel'
import TimeBar from './TimeBar'
import { TourButtons, TourCaption } from './Tours'
import { useStore } from '../store'

function Loading() {
  const ready = useStore((s) => s.zoneReady)
  if (ready) return null
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow">
      Cargando el mapa de Montevideo…
    </div>
  )
}

/** En modo presentación la interfaz se agranda para leerse desde el fondo del aula. */
const PRESENT_ZOOM = 1.3

/** Capa de interfaz sobre la escena 3D. Solo los paneles reciben clics; el resto pasa a la escena. */
export default function Hud() {
  const presenting = useStore((s) => s.presenting)
  const touring = useStore((s) => s.tour !== null)
  const zoom = presenting ? { zoom: PRESENT_ZOOM } : undefined
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between gap-3 p-3" style={zoom}>
      <Loading />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Panel className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">L3</div>
            <div>
              <div className="text-sm font-semibold leading-tight text-slate-800">Logística 3D</div>
              <div className="text-[11.5px] leading-tight text-slate-500">Puerto de Montevideo</div>
            </div>
            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">Mapa real · operación simulada</span>
          </Panel>
          <TourButtons />
          {!touring && <Kpis />}
          <NavPad />
        </div>
        {/* Durante un recorrido el panel se oculta para despejar la vista, sin perder lo que estaba abierto. */}
        <div className={touring ? 'hidden' : 'contents'}>
          <SimPanel />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="absolute bottom-[150px] left-3 right-3 sm:right-auto sm:bottom-[92px]">
          <InfoCard />
        </div>
        <div className="flex justify-center">
          <TourCaption />
        </div>
        <TimeBar />
        <p className="pointer-events-auto mx-auto rounded-md bg-white/75 px-2 py-0.5 text-center text-[9.5px] text-slate-600 backdrop-blur sm:text-[10.5px]">
          Relieve: Copernicus DEM · Imagen: Copernicus Sentinel-2 (feb 2026) · Edificios y contorno del puerto: Overture Maps / © colaboradores de OpenStreetMap (ODbL) ·
          Partes del puerto y datos de TCP: ANP · Operación simulada · tocá un buque, una grúa o el patio
        </p>
      </div>
    </div>
  )
}
