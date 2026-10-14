/** Íconos de trazo, en una grilla de 24: se dibujan con el color del texto. */
const PATHS = {
  buque: 'M3 14h18l-2.5 6h-13zM7 14V8h4v6M11 10h5v4',
  ancla: 'M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 7v13M5 13a7 7 0 0 0 14 0M8 11h8',
  patio: 'M3 12h8v8H3zM13 12h8v8h-8zM8 3h8v8H8z',
  reloj: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7v5l3 2',
  ajustes: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  tarea: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  ruta: 'M6 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5',
  grua: 'M5 21V5h3v16M5 8h15l-3 3M8 5l6 3M17 11v4',
  pantalla: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  sol: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  luna: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  mas: 'M5 12h.01M12 12h.01M19 12h.01',
  mover: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  atras: 'M15 5l-7 7 7 7',
  cerrar: 'M6 6l12 12M18 6L6 18',
  seguir: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'mas' ? 3.2 : stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Ícono en un cuadrado de color, como en las listas de Ajustes. El color sale de las variables --icon-*. */
export function IconTile({ name, slot, alert = false }: { name: IconName; slot: 1 | 2 | 3 | 4; alert?: boolean }) {
  return (
    <span
      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]"
      style={{ background: alert ? 'var(--icon-alert-bg)' : `var(--icon-${slot})`, color: alert ? 'var(--icon-alert-fg)' : 'var(--icon-fg)' }}
    >
      <Icon name={name} size={17} stroke={2.2} />
    </span>
  )
}
