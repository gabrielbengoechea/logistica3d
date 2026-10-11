import { useStore, type View } from '../store'
import { clock } from './format'
import Panel from './Panel'

const SPEEDS = [1, 4, 12]
const VIEW_LABEL: Record<View, string> = { terminal: 'Terminal', bahia: 'Bahía', escalas: 'Escalas' }

export function Segmented<T extends string | number>({ items, value, onChange, label }: { items: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5">
      {items.map((it) => (
        <button
          key={String(it)}
          onClick={() => onChange(it)}
          className={`flex-1 rounded-md px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${it === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {label(it)}
        </button>
      ))}
    </div>
  )
}

export default function TimeBar() {
  const t = useStore((s) => s.t)
  const days = useStore((s) => s.params.days)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const view = useStore((s) => s.view)
  const { setT, togglePlay, setSpeed, setView } = useStore.getState()

  return (
    <Panel className="flex flex-wrap items-center gap-3 px-3 py-2">
      <button
        onClick={togglePlay}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
        aria-label={playing ? 'Pausar' : 'Reproducir'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <span className="w-[104px] text-[13px] font-semibold tabular-nums text-slate-800">{clock(t)}</span>
      <input
        id="tiempo"
        type="range"
        className="min-w-[160px] flex-1 accent-blue-600"
        min={0}
        max={days * 24}
        step={0.1}
        value={t}
        onChange={(e) => setT(Number(e.target.value))}
        aria-label="Tiempo simulado"
      />
      <Segmented items={SPEEDS} value={speed} onChange={setSpeed} label={(s) => `${s} h/s`} />
      <Segmented items={['terminal', 'bahia', 'escalas'] as const} value={view} onChange={setView} label={(v) => VIEW_LABEL[v]} />
    </Panel>
  )
}
