/**
 * Movimiento libre de la cámara pedido por el teclado o por los botones de pantalla. Cada eje va de -1 a 1;
 * la escena lo aplica en cada cuadro (ver FreeNav en Scene.tsx). No pasa por el store para no redibujar la UI.
 */
export const nav = {
  forward: 0,
  right: 0,
  up: 0,
  turn: 0,
  tilt: 0,
  zoom: 0,
  fast: false,
}

export type NavAxis = 'forward' | 'right' | 'up' | 'turn' | 'tilt' | 'zoom'

const KEYS: Record<string, [NavAxis, number]> = {
  KeyW: ['forward', 1],
  ArrowUp: ['forward', 1],
  KeyS: ['forward', -1],
  ArrowDown: ['forward', -1],
  KeyA: ['right', -1],
  ArrowLeft: ['right', -1],
  KeyD: ['right', 1],
  ArrowRight: ['right', 1],
  KeyR: ['up', 1],
  KeyF: ['up', -1],
  KeyQ: ['turn', 1],
  KeyE: ['turn', -1],
  KeyT: ['tilt', -1],
  KeyG: ['tilt', 1],
  Equal: ['zoom', 1],
  NumpadAdd: ['zoom', 1],
  Minus: ['zoom', -1],
  NumpadSubtract: ['zoom', -1],
}

const held = new Map<string, [NavAxis, number]>()

function recompute() {
  nav.forward = nav.right = nav.up = nav.turn = nav.tilt = nav.zoom = 0
  for (const [axis, v] of held.values()) nav[axis] = Math.max(-1, Math.min(1, nav[axis] + v))
}

/** Los atajos no se aplican mientras se escribe o se mueve un control (por ejemplo, un deslizador con flechas). */
function typing(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

/** Escucha el teclado. `enabled` permite apagarlo, por ejemplo durante un recorrido guiado. */
export function listenKeyboard(enabled: () => boolean): () => void {
  const down = (e: KeyboardEvent) => {
    nav.fast = e.shiftKey
    const k = KEYS[e.code]
    if (!k || typing(e) || e.ctrlKey || e.metaKey || e.altKey || !enabled()) return
    e.preventDefault()
    held.set(e.code, k)
    recompute()
  }
  const up = (e: KeyboardEvent) => {
    nav.fast = e.shiftKey
    if (held.delete(e.code)) recompute()
  }
  const clear = () => {
    held.clear()
    recompute()
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', clear)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', clear)
    clear()
  }
}

/** Botón de pantalla mantenido apretado (para el pizarrón). */
export function holdAxis(axis: NavAxis, value: number) {
  held.set(`pad-${axis}`, [axis, value])
  recompute()
}

export function releaseAxis(axis: NavAxis) {
  held.delete(`pad-${axis}`)
  recompute()
}
