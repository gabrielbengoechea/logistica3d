import { sampleAt } from '../sim/terminalSim'
import { useStore } from '../store'
import { SectionTitle } from './controls'
import { hours, pct } from './format'
import { IconTile } from './icons'

/** "Ahora": los cuatro indicadores del momento, como lista agrupada con ícono por fila. */
export default function Now() {
  const result = useStore((s) => s.result)
  const t = useStore((s) => s.t)
  const now = sampleAt(result, t)
  const yard = now.yard / result.yardCapacity
  const waiting = now.queue
  return (
    <div>
      <SectionTitle>Ahora</SectionTitle>
      <div className="inset-list">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <IconTile name="buque" slot={1} />
          <span className="flex-1 text-[15px]">Buques en muelle</span>
          <span className="text-[15px] font-semibold tabular-nums">
            {now.busyBerths} de {result.params.berths}
          </span>
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <IconTile name="ancla" slot={2} alert={waiting > 0} />
          <span className="flex-1 text-[15px]">En el fondeadero</span>
          <span className="text-[15px] font-semibold tabular-nums" style={{ color: waiting > 0 ? 'var(--alert)' : undefined }}>
            {waiting === 0 ? 'ninguno' : waiting === 1 ? '1 espera' : `${waiting} esperan`}
          </span>
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <IconTile name="patio" slot={3} alert={yard > 0.9} />
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-[15px]">Patio</span>
            <span className="block h-1 rounded-full bg-[rgba(120,120,128,0.2)]">
              <span className="block h-1 rounded-full" style={{ width: `${Math.round(yard * 100)}%`, background: yard > 0.9 ? 'var(--alert)' : 'var(--accent)' }} />
            </span>
          </div>
          <span className="w-12 text-right text-[15px] font-semibold tabular-nums">{pct(yard)}</span>
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <IconTile name="reloj" slot={4} />
          <span className="flex-1 text-[15px]">Espera media</span>
          <span className="text-[15px] font-semibold tabular-nums">{hours(result.kpis.avgWaitH)}</span>
        </div>
      </div>
    </div>
  )
}
