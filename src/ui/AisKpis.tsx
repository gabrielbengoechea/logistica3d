import { aisPoseAt } from '../ais/tracks'
import { PAD, toTerminal } from '../scene/layout'
import { useStore } from '../store'
import { Kpi } from './Kpis'

/** Indicadores con datos AIS: lo que se ve en el mapa en el instante actual. */
export default function AisKpis() {
  const tracks = useStore((s) => s.aisTracks)
  const t = useStore((s) => s.t)
  let visible = 0
  let moving = 0
  let atTerminal = 0
  for (const tr of tracks) {
    const p = aisPoseAt(tr, t)
    if (!p.visible) continue
    visible++
    if ((p.sog ?? 0) > 1) moving++
    const [tx, tz] = toTerminal(p.x, p.z)
    if (tz > -90 && tz < 15 && tx > PAD[0] - 320 && tx < PAD[1]) atTerminal++
  }
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
      <Kpi label="Buques en la zona" value={String(visible)} hint="con reporte reciente" />
      <Kpi label="Navegando" value={String(moving)} hint="a más de 1 nudo" />
      <Kpi label="Detenidos" value={String(visible - moving)} hint="fondeados o amarrados" />
      <Kpi label="En la terminal" value={String(atTerminal)} hint="junto al muelle" />
    </div>
  )
}
