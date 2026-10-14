import { useState } from 'react'
import { ACTIVITIES, ACTIVITY_DAYS, activityBase, activityParams, correctOption, type Activity } from '../didactic/activities'
import { BASE_PARAMS } from '../sim/terminalSim'
import { useStore } from '../store'

type Step = { key: null } | { key: string; choice: number | null; done: boolean }

const btn = 'rounded-lg px-2.5 py-1.5 text-[12px] font-medium'

/** Actividades de clase: elegir, predecir, simular y comparar. */
export default function ActivityPanel({ onOpenSimulator }: { onOpenSimulator: () => void }) {
  const [step, setStep] = useState<Step>({ key: null })
  const [seed, setSeed] = useState(BASE_PARAMS.seed)

  if (step.key === null)
    return (
      <div className="space-y-2">
        <p className="text-[12px] leading-snug text-slate-600">
          Cada actividad cambia una sola cosa de la terminal. Primero predecí qué va a pasar; después simulá dos semanas y compará con la terminal típica.
        </p>
        {ACTIVITIES.map((a) => (
          <button
            key={a.key}
            onClick={() => setStep({ key: a.key, choice: null, done: false })}
            className="block w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50/60"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-slate-800">{a.title}</span>
              <span className="text-[10.5px] text-slate-400">{a.minutes} min</span>
            </div>
            <div className="text-[11.5px] leading-snug text-slate-500">{a.question}</div>
          </button>
        ))}
      </div>
    )

  const activity = ACTIVITIES.find((a) => a.key === step.key)!
  const run = (s: number) => useStore.getState().startScenario(activityBase(s), activityParams(activity, s))

  return (
    <div className="space-y-3">
      <button className="text-[11.5px] text-slate-500 hover:text-slate-700" onClick={() => setStep({ key: null })}>
        ‹ Todas las actividades
      </button>
      <h3 className="text-[14px] font-semibold text-slate-800">{activity.title}</h3>
      <p className="text-[12px] leading-snug text-slate-600">{activity.context}</p>
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-[12.5px] font-medium leading-snug text-blue-900">{activity.question}</p>

      {!step.done ? (
        <>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-slate-400">Tu predicción</legend>
            {activity.options.map((o, i) => (
              <label
                key={o.label}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] ${step.choice === i ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
              >
                <input type="radio" name={`pred-${activity.key}`} className="accent-blue-600" checked={step.choice === i} onChange={() => setStep({ ...step, choice: i })} />
                {o.label}
              </label>
            ))}
          </fieldset>
          <button
            disabled={step.choice === null}
            onClick={() => {
              run(seed)
              setStep({ ...step, done: true })
            }}
            className={`${btn} w-full bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400`}
          >
            {step.choice === null ? 'Elegí una opción para simular' : `Simular ${ACTIVITY_DAYS} días`}
          </button>
        </>
      ) : (
        <Result
          activity={activity}
          choice={step.choice}
          onAgain={() => run(seed)}
          onOtherWeek={() => {
            const s = 1 + Math.floor(Math.random() * 999)
            setSeed(s)
            run(s)
          }}
          onBack={() => setStep({ key: null })}
          onOpenSimulator={onOpenSimulator}
        />
      )}
    </div>
  )
}

function Result({
  activity,
  choice,
  onAgain,
  onOtherWeek,
  onBack,
  onOpenSimulator,
}: {
  activity: Activity
  choice: number | null
  onAgain: () => void
  onOtherWeek: () => void
  onBack: () => void
  onOpenSimulator: () => void
}) {
  const base = useStore((s) => s.base)
  const now = useStore((s) => s.result)
  const value = activity.measure(base, now)
  const right = correctOption(activity, value)
  const hit = choice === right

  return (
    <>
      <div className="space-y-1.5">
        {activity.options.map((o, i) => (
          <div
            key={o.label}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] ${i === right ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : i === choice ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-slate-200 bg-white text-slate-500'}`}
          >
            <span className="w-4 text-center font-bold">{i === right ? '✓' : i === choice ? '✗' : ''}</span>
            <span className="flex-1">{o.label}</span>
            {i === choice && <span className="text-[10.5px] font-medium opacity-70">tu predicción</span>}
          </div>
        ))}
      </div>
      <div className={`rounded-lg px-3 py-2 text-[12.5px] leading-snug ${hit ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
        <b>{hit ? '¡Bien predicho!' : 'No era lo que esperabas.'}</b> {activity.describe(value)}.
      </div>
      <p className="text-[12px] leading-snug text-slate-700">{activity.explain(base, now)}</p>
      <div className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
        <div className="mb-0.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-400">Para llevarse</div>
        <p className="text-[12px] leading-snug text-slate-700">{activity.goal}</p>
      </div>
      <div>
        <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-slate-400">Para discutir</div>
        <ul className="list-disc space-y-1 pl-4 text-[12px] leading-snug text-slate-600">
          {activity.discuss.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        La escena reproduce la corrida: dale play para ver cómo se forma (o no) la cola. «Otra semana» repite la prueba con otras llegadas.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={onAgain}>
          Ver de nuevo
        </button>
        <button className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={onOtherWeek}>
          Otra semana
        </button>
        <button className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={onOpenSimulator}>
          Seguir probando
        </button>
        <button className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} onClick={onBack}>
          Otra actividad
        </button>
      </div>
    </>
  )
}
