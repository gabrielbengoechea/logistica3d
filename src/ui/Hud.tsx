import InfoCard from './InfoCard'
import Kpis from './Kpis'
import Panel from './Panel'
import SimPanel from './SimPanel'
import TimeBar from './TimeBar'

/** Capa de interfaz sobre la escena 3D. Solo los paneles reciben clics; el resto pasa a la escena. */
export default function Hud() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Panel className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">L3</div>
            <div>
              <div className="text-sm font-semibold leading-tight text-slate-800">Logística 3D</div>
              <div className="text-[11.5px] leading-tight text-slate-500">Terminal de contenedores · Montevideo</div>
            </div>
            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">Demo · datos simulados</span>
          </Panel>
          <Kpis />
        </div>
        <SimPanel />
      </div>
      <div className="flex flex-col gap-2">
        <div className="absolute bottom-[92px] left-3">
          <InfoCard />
        </div>
        <TimeBar />
        <p className="text-center text-[10.5px] text-slate-500">
          Demo de estilo · buques, llegadas y operación simulados · dimensiones típicas, no las de la terminal real · tocá un buque, una grúa o el patio
        </p>
      </div>
    </div>
  )
}
