import { sampleAt } from '../sim/terminalSim'
import { useStore } from '../store'
import { hours, pct } from './format'
import Panel from './Panel'

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <Panel className="min-w-[132px] px-3.5 py-2.5">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${warn ? 'text-amber-600' : 'text-slate-800'}`}>{value}</div>
      <div className="text-[10.5px] text-slate-400">{hint}</div>
    </Panel>
  )
}

export default function Kpis() {
  const result = useStore((s) => s.result)
  const t = useStore((s) => s.t)
  const now = sampleAt(result, t)
  const yard = now.yard / result.yardCapacity
  return (
    <div className="flex flex-wrap gap-2">
      <Kpi label="Buques en muelle" value={`${now.busyBerths} / ${result.params.berths}`} hint="ahora" />
      <Kpi label="En el fondeadero" value={String(now.queue)} hint="esperando muelle" warn={now.queue >= 3} />
      <Kpi label="Patio" value={pct(yard)} hint="ocupación ahora" warn={yard > 0.9} />
      <Kpi label="Espera media" value={hours(result.kpis.avgWaitH)} hint="en la semana" warn={result.kpis.avgWaitH > 12} />
    </div>
  )
}
