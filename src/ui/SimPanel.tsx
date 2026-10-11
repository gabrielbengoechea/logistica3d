import { useState } from 'react'
import type { Kpis, SimParams } from '../sim/terminalSim'
import { aisApiBase } from '../ais/api'
import { useStore, type Source } from '../store'
import DataPanel from './DataPanel'
import { hours, num, pct } from './format'
import Panel from './Panel'

const CONTROLS: { key: keyof SimParams; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'shipsPerDay', label: 'Buques que llegan por día', min: 1, max: 5, step: 0.5, unit: '' },
  { key: 'berths', label: 'Muelles habilitados', min: 1, max: 3, step: 1, unit: '' },
  { key: 'cranesPerBerth', label: 'Grúas por muelle', min: 1, max: 4, step: 1, unit: '' },
  { key: 'movesPerCraneHour', label: 'Productividad por grúa', min: 15, max: 35, step: 5, unit: 'mov/h' },
  { key: 'truckMovesPerHour', label: 'Retiro del patio en camión', min: 40, max: 160, step: 10, unit: 'cont/h' },
]

const ROWS: { label: string; get: (k: Kpis) => number; fmt: (x: number) => string; better: 'low' | 'high' }[] = [
  { label: 'Espera media en fondeadero', get: (k) => k.avgWaitH, fmt: hours, better: 'low' },
  { label: 'Máximo de buques esperando', get: (k) => k.maxQueue, fmt: String, better: 'low' },
  { label: 'Buques atendidos', get: (k) => k.shipsServed, fmt: String, better: 'high' },
  { label: 'Ocupación de muelles', get: (k) => k.berthOccupancy, fmt: pct, better: 'high' },
  { label: 'Horas con grúas frenadas por patio lleno', get: (k) => k.hoursYardFull, fmt: hours, better: 'low' },
]

export default function SimPanel() {
  const [open, setOpen] = useState(() => window.innerWidth >= 900)
  const params = useStore((s) => s.params)
  const result = useStore((s) => s.result)
  const base = useStore((s) => s.base)
  const setParam = useStore((s) => s.setParam)
  const saveBase = useStore((s) => s.saveBase)
  const resetToBase = useStore((s) => s.resetToBase)
  const source = useStore((s) => s.source)
  const setSource = useStore((s) => s.setSource)
  const hasAis = aisApiBase() !== null

  if (!open)
    return (
      <Panel className="px-3 py-2">
        <button className="text-sm font-semibold text-blue-700" onClick={() => setOpen(true)}>
          Simulador ▸
        </button>
      </Panel>
    )

  return (
    <Panel className="max-h-[48vh] w-full overflow-y-auto p-4 sm:max-h-[calc(100vh-190px)] sm:w-[320px]">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">{source === 'sim' ? 'Simulador' : 'Datos AIS'}</h2>
        <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>
          ocultar
        </button>
      </div>
      {hasAis && (
        <div className="mb-3 flex rounded-lg bg-slate-100 p-0.5">
          {(
            [
              ['sim', 'Simulación'],
              ['replay', 'AIS · día'],
              ['live', 'AIS · vivo'],
            ] as [Source, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSource(k)}
              className={`flex-1 rounded-md px-2 py-1 text-[12px] font-medium ${source === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {source !== 'sim' ? (
        <DataPanel />
      ) : (
        <>
      <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-[12px] leading-snug text-blue-900">
        <b>Antes de mover un control, predecí:</b> si llegan 3,5 buques por día en vez de 2,5, ¿cuánto crece la espera? ¿Y si sumás un muelle?
      </p>
      <div className="space-y-3">
        {CONTROLS.map((c) => (
          <label key={c.key} className="block">
            <div className="flex justify-between text-[12px] text-slate-600">
              <span>{c.label}</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {num(params[c.key], c.step < 1 ? 1 : 0)} {c.unit}
              </span>
            </div>
            <input
              type="range"
              className="w-full accent-blue-600"
              min={c.min}
              max={c.max}
              step={c.step}
              value={params[c.key]}
              onChange={(e) => setParam(c.key, Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="mb-1.5 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
          <span>Resultado de la semana</span>
          <span className="text-right">Base</span>
          <span className="text-right">Ahora</span>
        </div>
        {ROWS.map((r) => {
          const a = r.get(base.kpis)
          const b = r.get(result.kpis)
          const diff = Math.abs(b - a) > 1e-6
          const good = r.better === 'low' ? b < a : b > a
          return (
            <div key={r.label} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 py-0.5 text-[12px]">
              <span className="text-slate-600">{r.label}</span>
              <span className="text-right tabular-nums text-slate-400">{r.fmt(a)}</span>
              <span className={`text-right font-semibold tabular-nums ${!diff ? 'text-slate-800' : good ? 'text-emerald-600' : 'text-rose-600'}`}>{r.fmt(b)}</span>
            </div>
          )
        })}
        <div className="mt-3 flex gap-2">
          <button className="flex-1 rounded-lg bg-slate-100 px-2 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-200" onClick={resetToBase}>
            Volver a la base
          </button>
          <button className="flex-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700" onClick={saveBase}>
            Fijar como base
          </button>
        </div>
      </div>
        </>
      )}
    </Panel>
  )
}
