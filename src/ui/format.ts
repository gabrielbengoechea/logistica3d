export function clock(t: number): string {
  const day = Math.floor(t / 24) + 1
  const mins = Math.floor((t % 24) * 60)
  return `Día ${day} · ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export const hours = (h: number) => `${h.toFixed(1).replace('.', ',')} h`
export const pct = (x: number) => `${Math.round(x * 100)}%`
export const num = (x: number, digits = 1) => x.toFixed(digits).replace('.', ',')
