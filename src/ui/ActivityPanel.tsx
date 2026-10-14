import { useState } from 'react'
import { ACTIVITIES, ACTIVITY_DAYS, activityBase, activityParams, correctOption, type Activity } from '../didactic/activities'
import { BASE_PARAMS } from '../sim/terminalSim'
import { useStore } from '../store'

type Step = { key: null } | { key: string; choice: number | null; done: boolean }

const btn = 'rounded-[10px] px-3 h-9 text-[13px] font-medium'

/** Actividades de clase: elegir, predecir, simular y comparar. */
export default function ActivityPanel({ onOpenSimulator }: { onOpenSimulator: () => void }) {
  const [step, setStep] = useState<Step>({ key: null })
  const [seed, setSeed] = useState(BASE_PARAMS.seed)

  if (step.key === null)
    return (
      <div className="space-y-2">
        <p className="text-[13.5px] leading-snug text-[var(--ink-2)]">
          Cada actividad cambia una sola cosa de la terminal. Primero predecí qué va a pasar; después simulá dos semanas y compará con la terminal típica.
        </p>
        {ACTIVITIES.map((a) => (
          <button
            key={a.key}
            onClick={() => setStep({ key: a.key, choice: null, done: false })}
            className="block w-full rounded-xl bg-white px-3 py-2.5 text-left hover:bg-[#f7f7fa]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-semibold text-[var(--ink)]">{a.title}</span>
              <span className="text-[12px] text-[var(--ink-3)]">{a.minutes} min</span>
            </div>
            <div className="text-[13px] leading-snug text-[var(--ink-2)]">{a.question}</div>
          </button>
        ))}
      </div>
    )

  const activity = ACTIVITIES.find((a) => a.key === step.key)!
  const run = (s: number) => useStore.getState().startScenario(activityBase(s), activityParams(activity, s))

  return (
    <div className="space-y-3">
      <button className="text-[13px] text-[var(--ink-2)] hover:text-[var(--ink)]" onClick={() => setStep({ key: null })}>
        ‹ Todas las actividades
      </button>
      <h3 className="text-[20px] font-bold tracking-tight text-[var(--ink)]">{activity.title}</h3>
      <p className="text-[13.5px] leading-snug text-[var(--ink-2)]">{activity.context}</p>
      <p className="rounded-lg bg-[#e8f1ff] px-3 py-2.5 text-[14px] font-medium leading-snug text-[#0b3d91]">{activity.question}</p>

      {!step.done ? (
        <>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-[12px] font-medium uppercase tracking-wide text-[var(--ink-3)]">Tu predicción</legend>
            {activity.options.map((o, i) => (
              <label
                key={o.label}
                className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-[14px] ${step.choice === i ? 'border-[var(--accent)] bg-[#e8f1ff] text-[#0b3d91]' : 'border-transparent bg-white text-[var(--ink)]'}`}
              >
                <input type="radio" name={`pred-${activity.key}`} className="accent-[#007aff]" checked={step.choice === i} onChange={() => setStep({ ...step, choice: i })} />
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
            className={`${btn} w-full bg-[var(--accent)] text-white hover:bg-[#0062cc] disabled:cursor-not-allowed disabled:bg-[var(--fill)] disabled:text-[var(--ink-3)]`}
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
            className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[14px] ${i === right ? 'border-[#34c759] bg-[#e7f8ec] text-[#1e6b35]' : i === choice ? 'border-[#ff9f97] bg-[#ffecea] text-[#a1150c]' : 'border-transparent bg-white text-[var(--ink-2)]'}`}
          >
            <span className="w-4 text-center font-bold">{i === right ? '✓' : i === choice ? '✗' : ''}</span>
            <span className="flex-1">{o.label}</span>
            {i === choice && <span className="text-[12px] font-medium opacity-70">tu predicción</span>}
          </div>
        ))}
      </div>
      <div className={`rounded-xl px-3 py-2.5 text-[14px] leading-snug ${hit ? 'bg-[#e7f8ec] text-[#1e6b35]' : 'bg-[#fff4e0] text-[#7a4a00]'}`}>
        <b>{hit ? '¡Bien predicho!' : 'No era lo que esperabas.'}</b> {activity.describe(value)}.
      </div>
      <p className="text-[13.5px] leading-snug text-[var(--ink)]">{activity.explain(base, now)}</p>
      <div className="rounded-lg bg-white px-3 py-2">
        <div className="mb-0.5 text-[12px] font-medium uppercase tracking-wide text-[var(--ink-3)]">Para llevarse</div>
        <p className="text-[13.5px] leading-snug text-[var(--ink)]">{activity.goal}</p>
      </div>
      <div>
        <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-[var(--ink-3)]">Para discutir</div>
        <ul className="list-disc space-y-1 pl-4 text-[13.5px] leading-snug text-[var(--ink-2)]">
          {activity.discuss.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] leading-snug text-[var(--ink-2)]">
        La escena reproduce la corrida: dale play para ver cómo se forma (o no) la cola. «Otra semana» repite la prueba con otras llegadas.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button className={`${btn} bg-[var(--fill)] text-[var(--accent)] font-semibold`} onClick={onAgain}>
          Ver de nuevo
        </button>
        <button className={`${btn} bg-[var(--fill)] text-[var(--accent)] font-semibold`} onClick={onOtherWeek}>
          Otra semana
        </button>
        <button className={`${btn} bg-[var(--fill)] text-[var(--accent)] font-semibold`} onClick={onOpenSimulator}>
          Seguir probando
        </button>
        <button className={`${btn} bg-[var(--accent)] text-white hover:bg-[#0062cc]`} onClick={onBack}>
          Otra actividad
        </button>
      </div>
    </>
  )
}
