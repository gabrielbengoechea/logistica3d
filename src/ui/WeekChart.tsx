import { useState } from 'react'
import type { Sample, SimResult } from '../sim/terminalSim'
import { useStore } from '../store'
import { num } from './format'

/** Serie 1 (este escenario) y serie 2 (base): primeras dos posiciones de la paleta categórica validada. */
const NOW = '#2a78d6'
const BASE = '#eb6834'
const W = 300
const H = 92
const PAD = { l: 28, r: 8, t: 8, b: 18 }

interface Metric {
  title: string
  value: (s: Sample, r: SimResult) => number
  fmt: (v: number) => string
  /** Máximo del eje: fijo (porcentaje) o según los datos. */
  max?: number
}

const METRICS: Metric[] = [
  { title: 'Buques esperando en el fondeadero', value: (s) => s.queue, fmt: (v) => String(Math.round(v)) },
  { title: 'Ocupación del patio', value: (s, r) => (s.yard / r.yardCapacity) * 100, fmt: (v) => `${Math.round(v)} %`, max: 100 },
]

function niceMax(v: number) {
  if (v <= 4) return 4
  const step = v <= 10 ? 2 : 5
  return Math.ceil(v / step) * step
}

function Small({ metric, now, base, t, hover, setHover }: { metric: Metric; now: SimResult; base: SimResult; t: number; hover: number | null; setHover: (h: number | null) => void }) {
  const hours = now.params.days * 24
  const a = now.samples.map((s) => metric.value(s, now))
  const b = base.samples.map((s) => metric.value(s, base))
  const top = metric.max ?? niceMax(Math.max(1, ...a, ...b))
  const x = (h: number) => PAD.l + (h / hours) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b)
  // Escalones: la cola cambia de a un buque.
  const path = (vals: number[], len: number) =>
    vals
      .slice(0, len)
      .map((v, i) => `${i === 0 ? 'M' : 'H'}${x(i).toFixed(1)}${i === 0 ? ` ${y(v).toFixed(1)}` : ` V${y(v).toFixed(1)}`}`)
      .join(' ')
  const baseLen = Math.min(b.length, Math.floor(hours) + 1)
  const hi = hover ?? null
  const idx = hi != null ? Math.min(a.length - 1, Math.max(0, Math.round(hi))) : null

  return (
    <figure className="m-0">
      <figcaption className="mb-0.5 text-[11px] font-medium text-slate-600">{metric.title}</figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none"
          role="img"
          aria-label={`${metric.title} hora por hora: este escenario y base`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const px = ((e.clientX - r.left) / r.width) * W
            setHover(Math.max(0, Math.min(hours, ((px - PAD.l) / (W - PAD.l - PAD.r)) * hours)))
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[0, top / 2, top].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e7e9ee" strokeWidth={1} />
              <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#64748b">
                {metric.fmt(v)}
              </text>
            </g>
          ))}
          {Array.from({ length: now.params.days }, (_, d) => (
            <text key={d} x={x(d * 24 + 12)} y={H - 4} textAnchor="middle" fontSize={9} fill="#64748b">
              D{d + 1}
            </text>
          ))}
          <path d={path(b, baseLen)} fill="none" stroke={BASE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path(a, a.length)} fill="none" stroke={NOW} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} stroke="#0f172a" strokeOpacity={0.35} strokeWidth={1} />
          {idx != null && (
            <>
              <line x1={x(idx)} x2={x(idx)} y1={PAD.t} y2={H - PAD.b} stroke="#0f172a" strokeOpacity={0.6} strokeWidth={1} />
              {idx < baseLen && <circle cx={x(idx)} cy={y(b[idx])} r={4} fill={BASE} stroke="#fff" strokeWidth={2} />}
              <circle cx={x(idx)} cy={y(a[idx])} r={4} fill={NOW} stroke="#fff" strokeWidth={2} />
            </>
          )}
        </svg>
        {idx != null && (
          <div
            className="pointer-events-none absolute top-0 rounded-md bg-slate-900/90 px-2 py-1 text-[10.5px] leading-tight text-white"
            style={{ left: `${(x(idx) / W) * 100}%`, transform: `translateX(${idx > hours / 2 ? '-105%' : '5%'})` }}
          >
            <div className="font-semibold">
              Día {Math.floor(idx / 24) + 1} · {String(idx % 24).padStart(2, '0')}:00
            </div>
            <div>Este escenario: {metric.fmt(a[idx])}</div>
            {idx < baseLen && <div>Base: {metric.fmt(b[idx])}</div>}
          </div>
        )}
      </div>
    </figure>
  )
}

/** La semana hora por hora, este escenario contra la base. Un gráfico por medida (cada uno con su eje). */
export default function WeekChart() {
  const now = useStore((s) => s.result)
  const base = useStore((s) => s.base)
  const t = useStore((s) => s.t)
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: NOW }} /> Este escenario
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: BASE }} /> Base
        </span>
        <button className="ml-auto text-[11px] text-blue-700 hover:underline" onClick={() => setTable(!table)}>
          {table ? 'Ver gráfico' : 'Ver datos'}
        </button>
      </div>
      {table ? (
        <DayTable now={now} base={base} />
      ) : (
        METRICS.map((m) => <Small key={m.title} metric={m} now={now} base={base} t={t} hover={hover} setHover={setHover} />)
      )}
    </div>
  )
}

/** Vista de tabla: resumen por día de las mismas dos medidas. */
function DayTable({ now, base }: { now: SimResult; base: SimResult }) {
  const byDay = (r: SimResult, d: number) => {
    const day = r.samples.filter((s) => Math.floor(s.t / 24) === d)
    if (!day.length) return null
    return { queue: Math.max(...day.map((s) => s.queue)), yard: (day.reduce((a, s) => a + s.yard, 0) / day.length / r.yardCapacity) * 100 }
  }
  return (
    <table className="w-full text-[11px] tabular-nums">
      <thead className="text-slate-500">
        <tr>
          <th className="text-left font-medium">Día</th>
          <th className="text-right font-medium">Máx. en espera</th>
          <th className="text-right font-medium">Patio medio</th>
        </tr>
      </thead>
      <tbody className="text-slate-700">
        {Array.from({ length: now.params.days }, (_, d) => {
          const a = byDay(now, d)
          const b = byDay(base, d)
          return (
            <tr key={d} className="border-t border-slate-100">
              <td>D{d + 1}</td>
              <td className="text-right">
                {a?.queue ?? '—'} <span className="text-slate-400">({b?.queue ?? '—'})</span>
              </td>
              <td className="text-right">
                {a ? `${num(a.yard, 0)} %` : '—'} <span className="text-slate-400">({b ? `${num(b.yard, 0)} %` : '—'})</span>
              </td>
            </tr>
          )
        })}
      </tbody>
      <caption className="caption-bottom pt-1 text-left text-[10.5px] text-slate-400">Entre paréntesis, la base.</caption>
    </table>
  )
}
