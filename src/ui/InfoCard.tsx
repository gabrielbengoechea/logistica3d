import type { ReactNode } from 'react'
import { NAV_STATUS, poseAt } from '../feeds/positions'
import { SHIP_CLASSES, cranesOnShift, sampleAt } from '../sim/terminalSim'
import { PHASE_LABEL, phaseAt } from '../sim/tracks'
import { useStore } from '../store'
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

function FollowButton({ id }: { id: string }) {
  const follow = useStore((s) => s.follow)
  const setFollow = useStore((s) => s.setFollow)
  return (
    <button
      className={`mt-3 w-full rounded-lg px-2 py-1.5 text-[12px] font-medium ${follow === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
      onClick={() => setFollow(follow === id ? null : id)}
    >
      {follow === id ? 'Dejar de seguir' : 'Seguir con la cámara'}
    </button>
  )
}

export default function InfoCard() {
  const selection = useStore((s) => s.selection)
  const tracks = useStore((s) => s.tracks)
  const feedTracks = useStore((s) => s.feedTracks)
  const params = useStore((s) => s.params)
  const result = useStore((s) => s.result)
  const t = useStore((s) => s.t)
  if (!selection) return null
  const rate = params.cranesPerBerth * params.movesPerCraneHour

  if (selection.kind === 'ship') {
    const tr = tracks.find((x) => x.ship.id === selection.id)
    if (!tr) return null
    const { phase, u } = phaseAt(tr, t, params)
    const s = tr.ship
    const cls = SHIP_CLASSES[s.shipClass]
    const waited = tr.berthAt !== undefined ? tr.berthAt - tr.arrive : t > tr.arrive ? t - tr.arrive : 0
    const workH = s.moves / rate
    const paused = phase === 'working' && !cranesOnShift(t, params.craneHoursPerDay)
    const notes: Partial<Record<typeof phase, string>> = {
      anchored: 'Espera porque todos los muelles están ocupados. Cada hora en el fondeadero es tiempo y dinero perdido para la naviera.',
      working: paused
        ? 'Las grúas están fuera de turno: el buque espera amarrado hasta que vuelvan a trabajar.'
        : `Con ${params.cranesPerBerth} grúas a ${params.movesPerCraneHour} movimientos por hora, descargarlo lleva unas ${num(workH)} horas de trabajo.`,
    }
    return (
      <Card
        kicker={`${cls.label} · ${s.id}`}
        title={s.name}
        rows={[
          ['Estado', paused ? 'Amarrado, grúas fuera de turno' : PHASE_LABEL[phase]],
          ['Eslora', `${s.length} m`],
          ['Manga', `${s.beam} m`],
          ['Contenedores a descargar', String(s.moves)],
          ['Llegó al fondeadero', t >= tr.arrive ? clock(Math.max(0, tr.arrive)) : '—'],
          [tr.berthAt !== undefined ? 'Esperó' : 'Lleva esperando', hours(Math.max(0, waited))],
          ['Trabajo de grúas', hours(workH)],
        ]}
        note={notes[phase] ?? `${cls.description} Mide ${num(s.length / PITCH_M)} canchas del Centenario de largo.`}
        action={<FollowButton id={s.id} />}
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

  if (selection.kind === 'feed') {
    const tr = feedTracks.find((x) => x.ship.id === selection.id)
    if (!tr) return null
    const s = tr.ship
    const p = poseAt(tr, t)
    return (
      <Card
        kicker={`${s.type} · datos externos`}
        title={s.name}
        rows={[
          ['Estado', p.status != null ? (NAV_STATUS[p.status] ?? `Código ${p.status}`) : 'Sin dato'],
          ['Velocidad', p.sog != null ? `${num(p.sog)} nudos` : 'Sin dato'],
          ['Eslora', s.length ? `${s.length} m` : 'Sin dato'],
          ['Manga', s.beam ? `${s.beam} m` : 'Sin dato'],
          ['Destino', s.destination ?? 'Sin dato'],
          ['Último reporte', p.visible ? `hace ${Math.round(p.age * 60)} min` : 'sin reportes recientes'],
        ]}
        note={s.length ? `Mide ${num(s.length / PITCH_M)} canchas del Centenario de largo.` : 'La fuente no informa sus dimensiones: se dibuja con un tamaño genérico.'}
        action={<FollowButton id={s.id} />}
      />
    )
  }

  if (selection.kind === 'crane') {
    const onShift = cranesOnShift(t, params.craneHoursPerDay)
    const busy = tracks.some((tr) => tr.berth === selection.berth && phaseAt(tr, t, params).phase === 'working')
    return (
      <Card
        kicker={`Muelle ${selection.berth + 1} · grúa ${selection.index + 1}`}
        title="Grúa pórtico de muelle (STS)"
        rows={[
          ['Estado', !onShift ? 'Fuera de turno' : busy ? 'Descargando un buque' : 'Sin buque'],
          ['Productividad', `${params.movesPerCraneHour} mov/h`],
          ['Turnos', params.craneHoursPerDay === 24 ? '24 h' : params.craneHoursPerDay === 16 ? '6 a 22 h' : '8 a 16 h'],
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
        ['Capacidad', `${result.yardCapacity.toLocaleString('es-UY')} contenedores (${params.yardTiers} de alto)`],
        ['Permanencia media', hours(params.dwellH)],
        ['Retiro máximo en camión', `${params.truckMovesPerHour} cont/h`],
        ['Grúas frenadas por patio lleno', hours(result.kpis.hoursYardFull)],
      ]}
      note="Si el patio se llena, las grúas no tienen dónde dejar la carga y frenan: un problema en tierra demora a los buques en el agua."
    />
  )
}
