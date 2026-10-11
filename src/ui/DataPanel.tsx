import { useEffect, useState } from 'react'
import { fetchDays, fetchStats, type AisCalibration } from '../ais/api'
import { useStore } from '../store'
import { hours, num, pct } from './format'

/** Panel de datos AIS: elegir un día guardado, ver las estadísticas medidas y pasarlas al simulador. */
export default function DataPanel() {
  const source = useStore((s) => s.source)
  const replay = useStore((s) => s.replay)
  const tracks = useStore((s) => s.aisTracks)
  const error = useStore((s) => s.aisError)
  const loadReplay = useStore((s) => s.loadReplay)
  const setParam = useStore((s) => s.setParam)
  const setSource = useStore((s) => s.setSource)
  const [days, setDays] = useState<{ date: string; positions: number }[] | null>(null)
  const [stats, setStats] = useState<AisCalibration | null>(null)

  useEffect(() => {
    if (source !== 'replay') return
    fetchDays()
      .then((d) => {
        setDays(d)
        if (d.length && !useStore.getState().replay) loadReplay(d[d.length - 1].date)
        if (d.length) fetchStats(d[0].date, d[d.length - 1].date).then(setStats).catch(() => setStats(null))
      })
      .catch(() => setDays([]))
  }, [source, loadReplay])

  if (source === 'live')
    return (
      <div className="space-y-2 text-[12px] text-slate-600">
        <p>Posiciones que llegan ahora desde aisstream.io a través del servicio AIS.</p>
        <p>
          <b className="tabular-nums text-slate-800">{tracks.length}</b> buques con reporte desde que se abrió la conexión o en los últimos 20 minutos.
        </p>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
      </div>
    )

  const calls = stats ? Math.min(5, Math.max(1, Math.round(stats.callsPerDay * 2) / 2)) : null
  return (
    <div className="space-y-3 text-[12px] text-slate-600">
      <label className="block">
        <span className="mb-1 block">Día guardado</span>
        <select
          id="ais-day"
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800"
          value={replay?.date ?? ''}
          onChange={(e) => loadReplay(e.target.value)}
        >
          {!days?.length && <option value="">{days ? 'No hay días guardados' : 'Cargando…'}</option>}
          {days?.map((d) => (
            <option key={d.date} value={d.date}>
              {d.date} · {d.positions} posiciones
            </option>
          ))}
        </select>
      </label>
      {replay?.synthetic && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">
          Estos datos son <b>sintéticos</b>: sirven para probar el sistema, no son buques reales.
        </p>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
      {stats && (
        <div className="border-t border-slate-200 pt-3">
          <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
            Medido en la terminal · {num(stats.days, 0)} {stats.days === 1 ? 'día' : 'días'}
          </div>
          {(
            [
              ['Atraques por día', num(stats.callsPerDay)],
              ['Estadía media en muelle', stats.avgBerthH != null ? hours(stats.avgBerthH) : '—'],
              ['Espera media en fondeadero', stats.avgWaitH != null ? hours(stats.avgWaitH) : '—'],
              ['Buques que fondearon antes', stats.shareAnchored != null ? pct(stats.shareAnchored) : '—'],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span>{k}</span>
              <span className="font-semibold tabular-nums text-slate-800">{v}</span>
            </div>
          ))}
          {calls != null && (
            <button
              className="mt-3 w-full rounded-lg bg-blue-600 px-2 py-1.5 font-medium text-white hover:bg-blue-700"
              onClick={() => {
                setParam('shipsPerDay', calls)
                setSource('sim')
              }}
            >
              Usar {num(calls)} buques por día en el simulador
            </button>
          )}
        </div>
      )}
    </div>
  )
}
