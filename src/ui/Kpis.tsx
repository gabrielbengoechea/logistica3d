import { sampleAt } from '../sim/terminalSim'
import { useStore } from '../store'
import { hours, pct } from './format'
import Panel from './Panel'

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <Panel className="min-w-0 px-2.5 py-1.5 sm:min-w-[132px] sm:px-3.5 sm:py-2.5">
      <div className="truncate text-[10px] font-medium text-slate-500 sm:text-[11px]">{label}</div>
      <div className={`text-base font-semibold tabular-nums sm:text-xl ${warn ? 'text-amber-600' : 'text-slate-800'}`}>{value}</div>
      <div className="hidden text-[10.5px] text-slate-400 sm:block">{hint}</div>
    </Panel>
  )
}

export default function Kpis() {
  const result = useStore((s) => s.result)
  const t = useStore((s) => s.t)
  const now = sampleAt(result, t)
  const yard = now.yard / result.yardCapacity
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
      <Kpi label="Buques en muelle" value={`${now.busyBerths} / ${result.params.berths}`} hint="ahora" />
      <Kpi label="En el fondeadero" value={String(now.queue)} hint="esperando muelle" warn={now.queue >= 3} />
      <Kpi label="Patio" value={pct(yard)} hint="ocupación ahora" warn={yard > 0.9} />
      <Kpi label="Espera media" value={hours(result.kpis.avgWaitH)} hint="en la semana" warn={result.kpis.avgWaitH > 12} />
    </div>
  )
}
