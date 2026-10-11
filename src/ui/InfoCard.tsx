import type { ReactNode } from 'react'
import { sampleAt } from '../sim/terminalSim'
import { PHASE_LABEL, phaseAt } from '../sim/tracks'
import { NAV_STATUS, aisPoseAt } from '../ais/tracks'
import { craneRate, useStore } from '../store'
import { clock, hours, num, pct } from './format'
import Panel from './Panel'

const PITCH_M = 105

function Card({ kicker, title, rows, note, children, action }: { kicker: string; title: string; rows: [string, string][]; note: string; children?: ReactNode; action?: ReactNode }) {
  const select = useStore((s) => s.select)
  return (
    <Panel className="w-full p-4 sm:w-[300px]">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-blue-600">{kicker}</div>
          <div className="text-base font-semibold text-slate-800">{title}</div>
        </div>
        <button className="text-slate-400 hover:text-slate-600" onClick={() => select(null)} aria-label="Cerrar">
          ✕
        </button>
      </div>
      {children}
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-[12px]">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900">{note}</p>
      {action}
    </Panel>
  )
}

export default function InfoCard() {
  const selection = useStore((s) => s.selection)
  const tracks = useStore((s) => s.tracks)
  const params = useStore((s) => s.params)
  const result = useStore((s) => s.result)
  const t = useStore((s) => s.t)
  const follow = useStore((s) => s.follow)
  const aisTracks = useStore((s) => s.aisTracks)
  const source = useStore((s) => s.source)
  const replay = useStore((s) => s.replay)
  const setFollow = useStore((s) => s.setFollow)
  if (!selection) return null
  const rate = craneRate(params)

  if (selection.kind === 'ship') {
    const tr = tracks.find((x) => x.ship.id === selection.id)
    if (!tr) return null
    const { phase, u } = phaseAt(tr, t, rate)
    const s = tr.ship
    const waited = tr.berthAt !== undefined ? tr.berthAt - tr.arrive : t > tr.arrive ? t - tr.arrive : 0
    const stay = s.moves / rate + 2.5
    const notes: Partial<Record<typeof phase, string>> = {
      anchored: 'Espera porque todos los muelles están ocupados. Cada hora en el fondeadero es tiempo y dinero perdido para la naviera.',
      working: `Con ${params.cranesPerBerth} grúas a ${params.movesPerCraneHour} movimientos por hora, descargarlo lleva unas ${num(s.moves / rate)} horas.`,
    }
    return (
      <Card
        kicker={`Portacontenedores · ${s.id}`}
        title={s.name}
        rows={[
          ['Estado', PHASE_LABEL[phase]],
          ['Eslora', `${s.length} m`],
          ['Manga', `${s.beam} m`],
          ['Contenedores a descargar', String(s.moves)],
          ['Llegó al fondeadero', t >= tr.arrive ? clock(tr.arrive) : '—'],
          [tr.berthAt !== undefined ? 'Esperó' : 'Lleva esperando', hours(waited)],
          ['Estadía en muelle estimada', hours(stay)],
        ]}
        note={notes[phase] ?? `Mide ${num(s.length / PITCH_M)} canchas del Centenario de largo.`}
        action={
          <button
            className={`mt-3 w-full rounded-lg px-2 py-1.5 text-[12px] font-medium ${follow === s.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            onClick={() => setFollow(follow === s.id ? null : s.id)}
          >
            {follow === s.id ? 'Dejar de seguir' : 'Seguir con la cámara'}
          </button>
        }
      >
        {phase === 'working' && (
          <div className="mt-2">
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Descarga</span>
              <span className="tabular-nums">{pct(u)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: pct(u) }} />
            </div>
          </div>
        )}
      </Card>
    )
  }

  if (selection.kind === 'ais') {
    const tr = aisTracks.find((x) => x.ship.id === selection.id)
    if (!tr) return null
    const s = tr.ship
    const p = aisPoseAt(tr, t)
    const synthetic = source === 'replay' && replay?.synthetic
    return (
      <Card
        kicker={`${s.type} · MMSI ${s.mmsi}`}
        title={s.name}
        rows={[
          ['Estado AIS', p.status != null ? (NAV_STATUS[p.status] ?? `Código ${p.status}`) : 'Sin dato'],
          ['Velocidad', p.sog != null ? `${num(p.sog)} nudos` : 'Sin dato'],
          ['Eslora', s.length ? `${s.length} m` : 'Sin dato'],
          ['Manga', s.beam ? `${s.beam} m` : 'Sin dato'],
          ['Destino declarado', s.destination ?? 'Sin dato'],
          ['Último reporte', p.visible ? `hace ${Math.round(p.age * 60)} min` : 'sin reportes recientes'],
        ]}
        note={
          synthetic
            ? 'Buque sintético de prueba: no existe. Sirve para verificar el sistema antes de tener datos reales.'
            : s.length
              ? `Mide ${num(s.length / PITCH_M)} canchas del Centenario de largo, según lo que informa su propio equipo AIS.`
              : 'Este buque no informa sus dimensiones por AIS: se dibuja con un tamaño genérico.'
        }
        action={
          <button
            className={`mt-3 w-full rounded-lg px-2 py-1.5 text-[12px] font-medium ${follow === s.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            onClick={() => setFollow(follow === s.id ? null : s.id)}
          >
            {follow === s.id ? 'Dejar de seguir' : 'Seguir con la cámara'}
          </button>
        }
      />
    )
  }

  if (selection.kind === 'crane') {
    const working = tracks.some((tr) => tr.berth === selection.berth && phaseAt(tr, t, rate).phase === 'working')
    return (
      <Card
        kicker={`Muelle ${selection.berth + 1} · grúa ${selection.index + 1}`}
        title="Grúa pórtico de muelle (STS)"
        rows={[
          ['Estado', working ? 'Descargando un buque' : 'Sin buque'],
          ['Productividad', `${params.movesPerCraneHour} mov/h`],
          ['Altura (típica)', '≈ 50 m'],
          ['Alcance sobre el agua (típico)', '≈ 55 m'],
        ]}
        note={`Mueve un contenedor cada ${num(60 / params.movesPerCraneHour)} minutos. Más grúas por buque acortan la estadía, pero si el patio no da abasto, frenan igual.`}
      />
    )
  }

  const now = sampleAt(result, t)
  return (
    <Card
      kicker="Terminal"
      title="Patio de contenedores"
      rows={[
        ['Ocupación ahora', pct(now.yard / result.yardCapacity)],
        ['Capacidad en esta maqueta', `${result.yardCapacity} contenedores`],
        ['Retiro en camión', `${params.truckMovesPerHour} cont/h`],
        ['Grúas frenadas por patio lleno', hours(result.kpis.hoursYardFull)],
      ]}
      note="Si el patio se llena, las grúas no tienen dónde dejar la carga y frenan: un problema en tierra demora a los buques en el agua."
    />
  )
}
