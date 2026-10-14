import { useState, type ReactNode } from 'react'
import { PRESETS, presetParams } from '../sim/presets'
import { SHIP_CLASSES, type Kpis, type ShipClassKey, type SimParams } from '../sim/terminalSim'
import { useStore } from '../store'
import { hours, num, pct } from './format'
import { Segmented } from './controls'
import WeekChart from './WeekChart'

/** Control deslizante con su explicación, que se abre con "?". */
function Slider({
  id,
  label,
  help,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  id: string
  label: string
  help: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[14px]">
        <label htmlFor={id} className="flex items-center gap-1.5">
          {label}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--fill)] text-[11px] font-semibold text-[var(--ink-2)]"
            aria-label={`Qué es: ${label}`}
            aria-expanded={open}
          >
            ?
          </button>
        </label>
        <span className="font-semibold tabular-nums">{format(value)}</span>
      </div>
      {open && <p className="my-1.5 rounded-lg bg-[#f2f2f7] px-2.5 py-2 text-[12.5px] leading-snug text-[var(--ink-2)]">{help}</p>}
      <input
        id={id}
        type="range"
        className="ios-range w-full"
        style={{ ['--fill-to' as string]: `${((value - min) / (max - min)) * 100}%` }}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function Section({ title, summary, children, open = false }: { title: string; summary: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="ml-auto truncate text-[13px] text-[var(--ink-2)]">{summary}</span>
        <span className="text-[17px] text-[#c7c7cc] transition group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-4 border-t border-[var(--separator)] px-3 pt-3 pb-4">{children}</div>
    </details>
  )
}

const ROWS: { label: string; get: (k: Kpis) => number; fmt: (x: number) => string; better: 'low' | 'high' }[] = [
  { label: 'Espera media en fondeadero', get: (k) => k.avgWaitH, fmt: hours, better: 'low' },
  { label: 'Máximo de buques esperando', get: (k) => k.maxQueue, fmt: String, better: 'low' },
  { label: 'Estadía media en muelle', get: (k) => k.avgBerthH, fmt: hours, better: 'low' },
  { label: 'Buques atendidos', get: (k) => k.shipsServed, fmt: String, better: 'high' },
  { label: 'Contenedores descargados', get: (k) => k.movesDone, fmt: (x) => x.toLocaleString('es-UY'), better: 'high' },
  { label: 'Ocupación de muelles', get: (k) => k.berthOccupancy, fmt: pct, better: 'high' },
  { label: 'Horas con grúas frenadas por patio lleno', get: (k) => k.hoursYardFull, fmt: hours, better: 'low' },
]

const SHIFT_LABEL: Record<SimParams['craneHoursPerDay'], string> = { 8: '1 turno', 16: '2 turnos', 24: '3 turnos' }

function sameParams(a: SimParams, b: SimParams) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Simulador: escenarios, parámetros por grupo, gráfico de la semana y comparación con la base. */
export function Simulator() {
  const params = useStore((s) => s.params)
  const result = useStore((s) => s.result)
  const base = useStore((s) => s.base)
  const setParam = useStore((s) => s.setParam)
  const setParams = useStore((s) => s.setParams)
  const saveBase = useStore((s) => s.saveBase)
  const resetToBase = useStore((s) => s.resetToBase)

  const active = PRESETS.find((p) => sameParams(presetParams(p), { ...params, seed: presetParams(p).seed, days: presetParams(p).days }))
  const mixTotal = Object.values(params.mix).reduce((a, b) => a + b, 0) || 1
  const setMix = (k: ShipClassKey, v: number) => setParam('mix', { ...params.mix, [k]: v })

  return (
    <>
      <div className="px-1 pb-1.5 text-[13px] font-semibold text-[var(--ink-2)]">Escenarios</div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setParams({ ...presetParams(p), seed: params.seed, days: params.days })}
            className={`h-8 rounded-full px-3 text-[13px] font-medium ${active?.key === p.key ? 'bg-[var(--accent)] text-white' : 'bg-white text-[var(--ink)] hover:bg-[#f2f2f7]'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mb-4 rounded-xl bg-[#e8f1ff] px-3 py-2.5 text-[13px] leading-snug text-[#0b3d91]">
        {active ? active.question : 'Escenario propio.'} <b>Antes de mirar los resultados, predecí qué va a pasar.</b>
      </p>

      <div className="space-y-2.5">
        <Section title="Llegadas" summary={`${num(params.shipsPerDay)} por día · ${params.arrivals === 'random' ? 'al azar' : 'programadas'}`} open>
          <Slider
            id="p-ships"
            label="Buques que llegan por día"
            help="Promedio de llegadas. La terminal real recibe del orden de 2 a 3 portacontenedores por día."
            value={params.shipsPerDay}
            min={0.5}
            max={6}
            step={0.5}
            format={(v) => num(v)}
            onChange={(v) => setParam('shipsPerDay', v)}
          />
          <div>
            <div className="mb-1 text-[12px] text-[var(--ink-2)]">Cómo llegan</div>
            <Segmented
              items={['random', 'scheduled'] as const}
              value={params.arrivals}
              onChange={(v) => setParam('arrivals', v)}
              label={(v) => (v === 'random' ? 'Al azar' : 'Con itinerario')}
            />
            <p className="mt-1 text-[11px] leading-snug text-[var(--ink-2)]">
              {params.arrivals === 'random'
                ? 'Llegadas independientes: a veces se juntan varios buques y a veces no viene ninguno.'
                : 'Servicios regulares con horario fijo y hasta 3 h de atraso o adelanto.'}
            </p>
          </div>
          <div>
            <div className="mb-1 text-[12px] text-[var(--ink-2)]">Mezcla de buques</div>
            <div className="space-y-2">
              {(Object.keys(SHIP_CLASSES) as ShipClassKey[]).map((k) => {
                const c = SHIP_CLASSES[k]
                return (
                  <Slider
                    key={k}
                    id={`p-mix-${k}`}
                    label={`${c.label} · ${c.length[0]}–${c.length[1]} m`}
                    help={`${c.description} Descarga entre ${c.moves[0]} y ${c.moves[1]} contenedores por escala.`}
                    value={params.mix[k]}
                    min={0}
                    max={100}
                    step={5}
                    format={() => pct(params.mix[k] / mixTotal)}
                    onChange={(v) => setMix(k, v)}
                  />
                )
              })}
            </div>
          </div>
        </Section>

        <Section title="Muelle y grúas" summary={`${params.berths} muelles · ${params.cranesPerBerth} grúas · ${SHIFT_LABEL[params.craneHoursPerDay]}`}>
          <Slider
            id="p-berths"
            label="Muelles habilitados"
            help="Puestos de atraque de TCP. El Muelle de Escala (638 m) tiene dos; el tercero es la ampliación de la cara oeste, un muelle de 730 m que hoy está en construcción."
            value={params.berths}
            min={1}
            max={3}
            step={1}
            format={String}
            onChange={(v) => setParam('berths', v)}
          />
          <Slider
            id="p-cranes"
            label="Grúas por muelle"
            help="Grúas pórtico (STS) que trabajan a la vez sobre un buque. Más grúas acortan la estadía, pero no entran más de cuatro por buque."
            value={params.cranesPerBerth}
            min={1}
            max={4}
            step={1}
            format={String}
            onChange={(v) => setParam('cranesPerBerth', v)}
          />
          <Slider
            id="p-rate"
            label="Productividad por grúa"
            help="Contenedores que una grúa mueve por hora. Entre 20 y 30 es habitual; las más modernas superan los 35."
            value={params.movesPerCraneHour}
            min={15}
            max={40}
            step={1}
            format={(v) => `${v} mov/h`}
            onChange={(v) => setParam('movesPerCraneHour', v)}
          />
          <div>
            <div className="mb-1 text-[12px] text-[var(--ink-2)]">Turnos de trabajo</div>
            <Segmented items={[8, 16, 24] as const} value={params.craneHoursPerDay} onChange={(v) => setParam('craneHoursPerDay', v)} label={(v) => SHIFT_LABEL[v]} />
            <p className="mt-1 text-[11px] leading-snug text-[var(--ink-2)]">
              {params.craneHoursPerDay === 24 ? 'Las grúas trabajan las 24 horas.' : params.craneHoursPerDay === 16 ? 'Las grúas trabajan de 6 a 22 h.' : 'Las grúas trabajan de 8 a 16 h.'} Fuera de turno, el buque espera amarrado.
            </p>
          </div>
          <Slider
            id="p-berthing"
            label="Tiempo para atracar"
            help="Desde que el buque deja el fondeadero hasta que las grúas pueden empezar: práctico, remolcadores y amarre."
            value={params.berthingH}
            min={0.5}
            max={4}
            step={0.25}
            format={hours}
            onChange={(v) => setParam('berthingH', v)}
          />
          <Slider
            id="p-unberthing"
            label="Tiempo para desatracar"
            help="Desde que termina la descarga hasta que el muelle queda libre para el siguiente buque."
            value={params.unberthingH}
            min={0.5}
            max={3}
            step={0.25}
            format={hours}
            onChange={(v) => setParam('unberthingH', v)}
          />
        </Section>

        <Section title="Patio y camiones" summary={`${params.yardTiers} de alto · ${params.truckMovesPerHour} cont/h`}>
          <Slider
            id="p-tiers"
            label="Altura de apilado"
            help="Cuántos contenedores se apilan uno sobre otro. Más altura da más capacidad, pero en la realidad hace más lento sacar el de abajo."
            value={params.yardTiers}
            min={3}
            max={5}
            step={1}
            format={(v) => `${v} (${(v * 720).toLocaleString('es-UY')} cont.)`}
            onChange={(v) => setParam('yardTiers', v)}
          />
          <Slider
            id="p-dwell"
            label="Permanencia en el patio"
            help="Horas que pasa un contenedor en el patio en promedio hasta que lo retiran (trámites, aduana, coordinación con el cliente)."
            value={params.dwellH}
            min={8}
            max={72}
            step={4}
            format={hours}
            onChange={(v) => setParam('dwellH', v)}
          />
          <Slider
            id="p-trucks"
            label="Retiro máximo en camión"
            help="Tope de contenedores por hora que pueden salir por la portería. Si es bajo, el patio se llena aunque los contenedores estén listos."
            value={params.truckMovesPerHour}
            min={40}
            max={200}
            step={10}
            format={(v) => `${v} cont/h`}
            onChange={(v) => setParam('truckMovesPerHour', v)}
          />
          <Slider
            id="p-initial"
            label="Patio al empezar"
            help="Ocupación del patio al inicio del escenario."
            value={Math.round(params.initialYard * 100)}
            min={0}
            max={90}
            step={5}
            format={(v) => `${v} %`}
            onChange={(v) => setParam('initialYard', v / 100)}
          />
        </Section>

        <Section title="Escenario" summary={`${params.days} días · semana n.º ${params.seed}`}>
          <Slider
            id="p-days"
            label="Duración"
            help="Días simulados. Más días muestran mejor las tendencias; menos días se recorren más rápido en clase."
            value={params.days}
            min={3}
            max={14}
            step={1}
            format={(v) => `${v} días`}
            onChange={(v) => setParam('days', v)}
          />
          <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--ink-2)]">
            <span>Semana n.º {params.seed}</span>
            <button
              className="rounded-[10px] bg-[var(--fill)] px-3 py-1.5 text-[13px] font-semibold text-[var(--accent)]"
              onClick={() => setParam('seed', 1 + Math.floor(Math.random() * 999))}
            >
              Otra semana al azar
            </button>
          </div>
          <p className="text-[11px] leading-snug text-[var(--ink-2)]">
            Misma configuración, otras llegadas. Sirve para ver cuánto cambia el resultado solo por azar.
          </p>
        </Section>
      </div>

      <div className="mt-4 rounded-xl bg-white p-3">
        <WeekChart />
      </div>

      <div className="mt-4 rounded-xl bg-white p-3">
        <div className="mb-1.5 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[12px] font-semibold text-[var(--ink-2)]">
          <span>Resultado del período</span>
          <span className="text-right">Base</span>
          <span className="text-right">Ahora</span>
        </div>
        {ROWS.map((r) => {
          const a = r.get(base.kpis)
          const b = r.get(result.kpis)
          const diff = Math.abs(b - a) > 1e-6
          const good = r.better === 'low' ? b < a : b > a
          return (
            <div key={r.label} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-t border-[var(--separator)] py-1.5 text-[13px]">
              <span className="text-[var(--ink-2)]">{r.label}</span>
              <span className="text-right tabular-nums text-[var(--ink-3)]">{r.fmt(a)}</span>
              <span className={`text-right font-semibold tabular-nums ${!diff ? 'text-[var(--ink)]' : good ? 'text-[#248a3d]' : 'text-[#d70015]'}`}>
                {diff ? (good ? '▲ ' : '▼ ') : ''}
                {r.fmt(b)}
              </span>
            </div>
          )
        })}
        <p className="mt-1 text-[10.5px] text-[var(--ink-3)]">▲ mejor que la base · ▼ peor que la base</p>
        <div className="mt-3 flex gap-2">
          <button className="h-9 flex-1 rounded-[10px] bg-[var(--fill)] px-2 text-[13px] font-semibold text-[var(--accent)]" onClick={resetToBase}>
            Volver a la base
          </button>
          <button className="h-9 flex-1 rounded-[10px] bg-[var(--accent)] px-2 text-[13px] font-semibold text-white" onClick={saveBase}>
            Fijar como base
          </button>
        </div>
      </div>
    </>
  )
}
