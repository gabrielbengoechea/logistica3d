import { useEffect, useState } from 'react'
import { TOURS, TOUR_STEP_SECONDS } from '../didactic/tours'
import { useStore } from '../store'
import Panel from './Panel'

/** Texto del paso actual del recorrido, con controles. Avanza solo cada unos segundos, salvo que se pause. */
export function TourCaption() {
  const tour = useStore((s) => s.tour)
  const setTour = useStore((s) => s.setTour)
  const [auto, setAuto] = useState(true)
  const def = tour && TOURS.find((t) => t.key === tour.key)
  const last = def ? def.steps.length - 1 : 0

  useEffect(() => {
    if (!tour || !auto || tour.step >= last) return
    const id = setTimeout(() => setTour({ ...tour, step: tour.step + 1 }), TOUR_STEP_SECONDS * 1000)
    return () => clearTimeout(id)
  }, [tour, auto, last, setTour])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (!s.tour) return
      if (e.key === 'Escape') s.setTour(null)
      if (e.key === 'ArrowRight' && s.tour.step < last) s.setTour({ ...s.tour, step: s.tour.step + 1 })
      if (e.key === 'ArrowLeft' && s.tour.step > 0) s.setTour({ ...s.tour, step: s.tour.step - 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last])

  if (!tour || !def) return null
  const step = def.steps[tour.step]
  const go = (i: number) => setTour({ ...tour, step: i })

  return (
    <Panel className="w-full max-w-[580px] px-5 py-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[var(--ink-2)]">
          {def.title} · {tour.step + 1} de {def.steps.length}
        </span>
        <button className="text-[15px] text-[var(--accent)]" onClick={() => setTour(null)}>
          Terminar
        </button>
      </div>
      <h3 className="text-[20px] leading-tight font-bold tracking-tight">{step.title}</h3>
      <p className="mt-1 text-[15px] leading-snug text-[var(--ink-2)]">{step.text}</p>
      <div className="mt-3 flex items-center gap-3">
        <button className="h-9 rounded-[10px] bg-[var(--fill)] px-3 text-[14px] font-semibold text-[var(--accent)] disabled:opacity-40" disabled={tour.step === 0} onClick={() => go(tour.step - 1)}>
          Anterior
        </button>
        <div className="flex flex-1 justify-center gap-1.5">
          {def.steps.map((s, i) => (
            <button
              key={s.title}
              onClick={() => go(i)}
              aria-label={s.title}
              className={`h-2 rounded-full transition-all ${i === tour.step ? 'w-5 bg-[var(--ink)]' : 'w-2 bg-[#c7c7cc]'}`}
            />
          ))}
        </div>
        <button className="h-9 rounded-[10px] px-2 text-[14px] text-[var(--ink-2)]" onClick={() => setAuto(!auto)} aria-pressed={auto}>
          {auto ? 'Pausar' : 'Seguir solo'}
        </button>
        {tour.step < last ? (
          <button className="h-9 rounded-[10px] bg-[var(--accent)] px-4 text-[14px] font-semibold text-white" onClick={() => go(tour.step + 1)}>
            Siguiente
          </button>
        ) : (
          <button className="h-9 rounded-[10px] bg-[var(--accent)] px-4 text-[14px] font-semibold text-white" onClick={() => setTour(null)}>
            Terminar
          </button>
        )}
      </div>
    </Panel>
  )
}
