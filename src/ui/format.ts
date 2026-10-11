export function clock(t: number): string {
  const day = Math.floor(t / 24) + 1
  const mins = Math.floor((t % 24) * 60)
  return `Día ${day} · ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

const WALL = new Intl.DateTimeFormat('es-UY', { timeZone: 'America/Montevideo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

/** Fecha y hora de Montevideo de un instante Unix (segundos). */
export const wallClock = (unix: number) => WALL.format(new Date(unix * 1000)).replace(',', ' ·')

export const hours = (h: number) => `${h.toFixed(1).replace('.', ',')} h`
export const pct = (x: number) => `${Math.round(x * 100)}%`
export const num = (x: number, digits = 1) => x.toFixed(digits).replace('.', ',')
