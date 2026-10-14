import { useEffect, useState } from 'react'
import { TOURS, TOUR_STEP_SECONDS } from '../didactic/tours'
import { useStore } from '../store'
import Panel from './Panel'

/** Botones para empezar un recorrido guiado y para el modo presentación. */
export function TourButtons() {
  const tour = useStore((s) => s.tour)
  const presenting = useStore((s) => s.presenting)
  const { setTour, setPresenting } = useStore.getState()
  // Si se sale de pantalla completa con Esc, también se sale del modo presentación.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) useStore.getState().setPresenting(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  return (
    <Panel className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
      <span className="px-1 text-[11px] text-slate-500">Recorridos</span>
      {TOURS.map((t) => (
        <button
          key={t.key}
          onClick={() => setTour(tour?.key === t.key ? null : { key: t.key, step: 0 })}
          className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${tour?.key === t.key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
        >
          {t.title}
        </button>
      ))}
      <button
        onClick={() => {
          // Pantalla completa si el navegador lo permite; si no, igual se agranda la interfaz.
          if (!presenting) document.documentElement.requestFullscreen?.().catch(() => {})
          else if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
          setPresenting(!presenting)
        }}
        className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${presenting ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
        title="Agranda la interfaz para proyectar en el pizarrón"
      >
        {presenting ? 'Salir de presentación' : 'Presentar'}
      </button>
    </Panel>
  )
}

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
    <Panel className="w-full max-w-[560px] px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
        <span>
          {def.title} · {tour.step + 1} de {def.steps.length}
        </span>
        <button className="normal-case tracking-normal text-slate-400 hover:text-slate-600" onClick={() => setTour(null)}>
          terminar ✕
        </button>
      </div>
      <h3 className="text-[15px] font-semibold text-slate-800">{step.title}</h3>
      <p className="mt-0.5 text-[13px] leading-snug text-slate-600">{step.text}</p>
      <div className="mt-2 flex items-center gap-2">
        <button
          className="rounded-lg bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
          disabled={tour.step === 0}
          onClick={() => go(tour.step - 1)}
        >
          ‹ Anterior
        </button>
        <div className="flex flex-1 justify-center gap-1">
          {def.steps.map((s, i) => (
            <button
              key={s.title}
              onClick={() => go(i)}
              aria-label={s.title}
              className={`h-1.5 rounded-full transition-all ${i === tour.step ? 'w-5 bg-blue-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400'}`}
            />
          ))}
        </div>
        <button className="rounded-lg px-2 py-1 text-[12px] text-slate-500 hover:text-slate-700" onClick={() => setAuto(!auto)}>
          {auto ? '❚❚ Auto' : '▶ Auto'}
        </button>
        {tour.step < last ? (
          <button className="rounded-lg bg-blue-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-blue-700" onClick={() => go(tour.step + 1)}>
            Siguiente ›
          </button>
        ) : (
          <button className="rounded-lg bg-blue-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-blue-700" onClick={() => setTour(null)}>
            Terminar
          </button>
        )}
      </div>
    </Panel>
  )
}
