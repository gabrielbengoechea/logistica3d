import { useStore } from '../store'

const SPEEDS = [1, 4, 12]

const twoDigits = (n: number) => String(n).padStart(2, '0')

/** Reproductor flotante: reproducir o pausar, hora simulada, línea de tiempo y velocidad. */
export default function Player() {
  const t = useStore((s) => s.t)
  const days = useStore((s) => s.params.days)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const { setT, togglePlay, setSpeed } = useStore.getState()
  const day = Math.floor(t / 24) + 1
  const minutes = Math.floor((t % 24) * 60)
  const max = days * 24
  const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]

  return (
    <div className="material pointer-events-auto flex h-16 items-center gap-3 rounded-[20px] pr-3 pl-2.5 sm:gap-4 sm:pr-4">
      <button
        onClick={togglePlay}
        aria-label={playing ? 'Pausar' : 'Reproducir'}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-white"
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="4" width="4" height="16" rx="1.5" />
            <rect x="14" y="4" width="4" height="16" rx="1.5" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7 4.5v15l13-7.5z" />
          </svg>
        )}
      </button>
      <div className="flex w-[96px] shrink-0 flex-col leading-tight">
        <span className="text-[15px] font-semibold tabular-nums">
          Día {day}, {twoDigits(Math.floor(minutes / 60))}:{twoDigits(minutes % 60)}
        </span>
        <span className="text-[12px] text-[var(--ink-2)]">de {days} días</span>
      </div>
      <input
        id="tiempo"
        type="range"
        className="ios-range min-w-0 flex-1"
        style={{ ['--fill-to' as string]: `${(t / max) * 100}%` }}
        min={0}
        max={max}
        step={0.1}
        value={t}
        onChange={(e) => setT(Number(e.target.value))}
        aria-label="Tiempo simulado"
      />
      <button
        onClick={() => setSpeed(next)}
        title="Velocidad: horas simuladas por segundo"
        aria-label={`Velocidad ${speed} horas por segundo; cambiar a ${next}`}
        className="h-8 shrink-0 rounded-[9px] bg-[var(--fill)] px-3 text-[13px] font-semibold tabular-nums"
      >
        {speed} h/s
      </button>
    </div>
  )
}
