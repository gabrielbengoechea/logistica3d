/**
 * Motor de tránsito de la terminal: vehículos que siguen caminos con cinemática real, se ven entre sí y no se
 * atraviesan.
 *
 * - Cinemática de bicicleta referida al eje trasero, con persecución pura (pure pursuit) sobre el camino y límite de
 *   ángulo y velocidad de dirección. El semirremolque se arrastra desde el perno rey (modelo de remolque estándar).
 * - Velocidad con el modelo IDM (Intelligent Driver Model): acelera hasta su máxima y frena según la distancia libre.
 * - Sensor frontal: una esfera que se barre por el camino propio delante del paragolpes; choca contra los rectángulos
 *   (OBB) de los demás vehículos y contra obstáculos fijos (patas de grúa, torres). La distancia libre alimenta al IDM.
 * - Zonas de conflicto (cruces, uniones y separaciones de carriles), calculadas solas a partir de los caminos: un
 *   vehículo entra solo si la zona está libre y hay lugar para salir del otro lado ("no bloquear el cruce").
 *   Se asignan por orden de llegada.
 * - Paradas: portería, bahías de intercambio, puntos de carga: el vehículo frena justo ahí y espera.
 */
import { Camino, angDiff, type P2, type Pose } from './camino'

export interface Tipo {
  nombre: string
  /** Batalla (m): eje delantero ↔ eje trasero. */
  wb: number
  /** Extremo delantero y trasero respecto del eje trasero (m, adelante +). */
  front: number
  rear: number
  width: number
  vmax: number
  amax: number
  /** Frenado cómodo (m/s²). */
  bcomf: number
  steerMax: number
  steerRate: number
  /** Semirremolque: perno rey (x respecto del eje trasero del tractor), distancia perno → eje del remolque, extremos. */
  trailer?: { king: number; len: number; front: number; rear: number }
}

export const TIPOS: Record<string, Tipo> = {
  camion: {
    nombre: 'camion', wb: 3.98, front: 5.5, rear: -1.45, width: 2.5, vmax: 5.6, amax: 0.9, bcomf: 1.6,
    steerMax: (38 * Math.PI) / 180, steerRate: 0.6,
    trailer: { king: 0.3, len: 9.76, front: 1.0, rear: -11.4 },
  },
  straddle: {
    nombre: 'straddle', wb: 6.0, front: 4.8 + 3.0, rear: -4.8 + 3.0, width: 5.0, vmax: 6.0, amax: 0.8, bcomf: 1.5,
    steerMax: (42 * Math.PI) / 180, steerRate: 0.8,
  },
}

export interface Parada {
  s: number
  espera: number
  tipo: string
  id: string
  /** Se llama al terminar la espera (por ejemplo, para cargar o descargar el contenedor). */
  alSalir?: (v: Vehiculo) => void
}

export interface Obstaculo {
  x: number
  z: number
  r: number
}

export interface OBB {
  cx: number
  cz: number
  h: number
  hl: number
  hw: number
}

let nextId = 1

export class Vehiculo {
  readonly id = nextId++
  tipo: Tipo
  camino: Camino
  cerrado: boolean
  s = 0
  x = 0
  z = 0
  h = 0
  v = 0
  delta = 0
  /** Semirremolque (perno rey y rumbo). */
  tr: { x: number; z: number; h: number } | null = null
  paradas: Parada[] = []
  espera = 0
  enParada: Parada | null = null
  activo = true
  terminado = false
  /** Distancia recorrida (para el giro de las ruedas). */
  odo = 0
  libre = Infinity
  zonas = new Set<number>()
  meta: Record<string, unknown> = {}
  /** Vueltas completas (caminos cerrados). */
  vueltas = 0

  constructor(tipo: Tipo, camino: Camino, s0 = 0, cerrado = false) {
    this.tipo = tipo
    this.camino = camino
    this.cerrado = cerrado
    this.s = s0
    const p = camino.at(s0)
    this.x = p.x
    this.z = p.z
    this.h = p.h
    if (tipo.trailer) {
      const kx = this.x + Math.cos(this.h) * tipo.trailer.king
      const kz = this.z + Math.sin(this.h) * tipo.trailer.king
      this.tr = { x: kx, z: kz, h: this.h }
    }
  }

  /** Rectángulos (OBB) del cuerpo y del remolque. */
  obbs(out: OBB[] = []): OBB[] {
    out.length = 0
    const t = this.tipo
    const c = Math.cos(this.h)
    const sn = Math.sin(this.h)
    const mid = (t.front + t.rear) / 2
    out.push({ cx: this.x + c * mid, cz: this.z + sn * mid, h: this.h, hl: (t.front - t.rear) / 2, hw: t.width / 2 })
    if (this.tr && t.trailer) {
      const tc = Math.cos(this.tr.h)
      const ts = Math.sin(this.tr.h)
      const m = (t.trailer.front + t.trailer.rear) / 2
      out.push({ cx: this.tr.x + tc * m, cz: this.tr.z + ts * m, h: this.tr.h, hl: (t.trailer.front - t.trailer.rear) / 2, hw: t.width / 2 })
    }
    return out
  }

  /** Punto más trasero (cola del remolque o del cuerpo). */
  cola(): P2 {
    if (this.tr && this.tipo.trailer) return [this.tr.x + Math.cos(this.tr.h) * this.tipo.trailer.rear, this.tr.z + Math.sin(this.tr.h) * this.tipo.trailer.rear]
    return [this.x + Math.cos(this.h) * this.tipo.rear, this.z + Math.sin(this.h) * this.tipo.rear]
  }

  /** Largo total del conjunto (para "no bloquear el cruce"). */
  largo(): number {
    const t = this.tipo
    return t.trailer ? t.front - (t.trailer.king + t.trailer.rear) : t.front - t.rear
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------------------------------------------------
/** Distancia de un punto a un OBB (0 si está adentro). */
export function distPuntoOBB(px: number, pz: number, o: OBB): number {
  const c = Math.cos(o.h)
  const s = Math.sin(o.h)
  const dx = px - o.cx
  const dz = pz - o.cz
  const lx = Math.abs(dx * c + dz * s) - o.hl
  const lz = Math.abs(-dx * s + dz * c) - o.hw
  const ox = Math.max(lx, 0)
  const oz = Math.max(lz, 0)
  return Math.hypot(ox, oz) + Math.min(Math.max(lx, lz), 0)
}

/** ¿Se superponen dos OBB? (teorema del eje separador). `margen` los agranda. */
export function chocan(a: OBB, b: OBB, margen = 0): boolean {
  const axes = [a.h, a.h + Math.PI / 2, b.h, b.h + Math.PI / 2]
  for (const ang of axes) {
    const ux = Math.cos(ang)
    const uz = Math.sin(ang)
    const proj = (o: OBB) => {
      const c = o.cx * ux + o.cz * uz
      const r = Math.abs(o.hl * (Math.cos(o.h) * ux + Math.sin(o.h) * uz)) + Math.abs(o.hw * (-Math.sin(o.h) * ux + Math.cos(o.h) * uz))
      return [c - r - margen / 2, c + r + margen / 2]
    }
    const [a0, a1] = proj(a)
    const [b0, b1] = proj(b)
    if (a1 < b0 || b1 < a0) return false
  }
  return true
}

// ---------------------------------------------------------------------------------------------------------------------
// Zonas de conflicto
// ---------------------------------------------------------------------------------------------------------------------
export interface Zona {
  id: number
  /** Centro y radio del círculo que la envuelve. */
  x: number
  z: number
  r: number
  /** Círculos que la forman (las zonas que se tocan se juntan en una sola: se toman y se sueltan juntas). */
  circulos: { x: number; z: number; r: number }[]
  duenio: number | null
  pedidos: Map<number, number>
}

function dentroZona(z: Zona, x: number, y: number) {
  if (Math.hypot(x - z.x, y - z.z) > z.r) return false
  for (const c of z.circulos) if (Math.hypot(x - c.x, y - c.z) < c.r) return true
  return false
}

/**
 * Busca dónde se cruzan, se juntan o se separan los caminos: puntos de dos caminos distintos a menos de `cerca` m,
 * salvo los tramos compartidos (mismo carril, mismo sentido). Agrupa los puntos en zonas.
 */
export function detectarZonas(caminos: Camino[], anchos: number[] = [], cerca = 6.5, rmax = 13, margen = 5): Zona[] {
  // 1) muestrear los caminos cada 1 m
  let n = 0
  for (const c of caminos) n += Math.floor(c.len) + 1
  const X = new Float64Array(n)
  const Zs = new Float64Array(n)
  const H = new Float64Array(n)
  const C = new Int32Array(n)
  const pose: Pose = { x: 0, z: 0, h: 0, k: 0 }
  let k = 0
  caminos.forEach((cam, ci) => {
    for (let s = 0; s <= cam.len && k < n; s += 1) {
      cam.at(s, pose)
      X[k] = pose.x
      Zs[k] = pose.z
      H[k] = pose.h
      C[k] = ci
      k++
    }
  })
  n = k
  // 2) grilla y puntos en conflicto
  const cell = cerca
  const grid = new Map<number, number[]>()
  const key = (gx: number, gz: number) => gx * 100003 + gz
  for (let i = 0; i < n; i++) {
    const kk = key(Math.floor(X[i] / cell), Math.floor(Zs[i] / cell))
    const arr = grid.get(kk)
    if (arr) arr.push(i)
    else grid.set(kk, [i])
  }
  const conf: number[] = []
  for (let i = 0; i < n; i++) {
    const gx = Math.floor(X[i] / cell)
    const gz = Math.floor(Zs[i] / cell)
    let hit = false
    for (let dx = -1; dx <= 1 && !hit; dx++)
      for (let dz = -1; dz <= 1 && !hit; dz++) {
        const arr = grid.get(key(gx + dx, gz + dz))
        if (!arr) continue
        for (const j of arr) {
          if (C[j] === C[i]) continue
          const d = Math.hypot(X[j] - X[i], Zs[j] - Zs[i])
          if (d >= cerca) continue
          const dh = Math.abs(angDiff(H[j], H[i]))
          const paralelo = dh < 0.35 || Math.abs(dh - Math.PI) < 0.35
          if (paralelo) {
            // distancia lateral (perpendicular al carril): la longitudinal no importa
            const lat = Math.abs(-(X[j] - X[i]) * Math.sin(H[i]) + (Zs[j] - Zs[i]) * Math.cos(H[i]))
            if (lat < 1.2 && dh < 0.35) continue        // mismo carril, mismo sentido
            const libre = ((anchos[C[i]] ?? 2.5) + (anchos[C[j]] ?? 2.5)) / 2 + 0.5
            if (lat >= libre) continue                    // carriles paralelos: entran lado a lado
          }
          hit = true
          break
        }
      }
    if (hit) conf.push(i)
  }
  // 3) agrupar en zonas de radio ≤ rmax (toma el punto libre más al oeste/norte y junta los cercanos)
  const libre = new Set(conf)
  const zonas: Zona[] = []
  const cg = new Map<number, number[]>()
  const ck = (i: number) => key(Math.floor(X[i] / rmax), Math.floor(Zs[i] / rmax))
  for (const i of conf) {
    const kk = ck(i)
    const a = cg.get(kk)
    if (a) a.push(i)
    else cg.set(kk, [i])
  }
  for (const i of conf) {
    if (!libre.has(i)) continue
    // vecinos dentro de rmax del primer punto
    const gx = Math.floor(X[i] / rmax)
    const gz = Math.floor(Zs[i] / rmax)
    const grupo: number[] = []
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const j of cg.get(key(gx + dx, gz + dz)) ?? []) if (libre.has(j) && Math.hypot(X[j] - X[i], Zs[j] - Zs[i]) <= rmax) grupo.push(j)
    let cx = 0
    let cz = 0
    for (const j of grupo) {
      cx += X[j]
      cz += Zs[j]
      libre.delete(j)
    }
    cx /= grupo.length
    cz /= grupo.length
    let r = 0
    for (const j of grupo) r = Math.max(r, Math.hypot(X[j] - cx, Zs[j] - cz))
    zonas.push({ id: zonas.length, x: cx, z: cz, r: r + margen, circulos: [{ x: cx, z: cz, r: r + margen }], duenio: null, pedidos: new Map() })
  }
  return zonas
}

// ---------------------------------------------------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------------------------------------------------
const MARGEN_SENSOR = 0.7
const S0 = 3.0          // distancia mínima de detención (m)
const T_HEAD = 1.4      // tiempo de seguridad (s)
const PASO = 0.05

export class Trafico {
  vehiculos: Vehiculo[] = []
  zonas: Zona[] = []
  estaticos: Obstaculo[] = []
  /** Obstáculos móviles externos (OBB), por ejemplo una carga colgando o una máquina que no maneja este motor. */
  dinamicos: OBB[] = []
  t = 0
  private _obb: OBB[] = []
  private _pose: Pose = { x: 0, z: 0, h: 0, k: 0 }

  agregar(v: Vehiculo) {
    this.vehiculos.push(v)
    return v
  }

  quitar(v: Vehiculo) {
    this.pedidosDe.delete(v.id)
    for (const z of this.zonas) {
      if (z.duenio === v.id) z.duenio = null
      z.pedidos.delete(v.id)
    }
    this.vehiculos = this.vehiculos.filter((x) => x !== v)
  }

  /** ¿Hay lugar para un vehículo nuevo en el arranque de un camino? */
  libreEn(cam: Camino, s: number, largo: number, ancho = 2.5): boolean {
    const p = cam.at(s)
    const probe: OBB = { cx: p.x - Math.cos(p.h) * largo * 0.4, cz: p.z - Math.sin(p.h) * largo * 0.4, h: p.h, hl: largo * 0.6 + 4, hw: ancho / 2 + 1 }
    for (const v of this.vehiculos) for (const o of v.obbs(this._obb)) if (chocan(probe, o)) return false
    return true
  }

  step(dt: number) {
    let left = dt
    while (left > 1e-6) {
      const h = Math.min(PASO, left)
      this.sub(h)
      left -= h
      this.t += h
    }
  }

  private sub(dt: number) {
    const vs = this.vehiculos
    // 1) sensores y zonas con las posiciones actuales
    const cajas = vs.map((v) => v.obbs([]).map((o) => ({ ...o })))
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i]
      if (v.terminado) continue
      v.libre = this.sensor(v, i, cajas)
      this.zonasDe(v)
    }
    // 2) mover
    for (const v of vs) {
      if (v.terminado) continue
      this.mover(v, dt)
    }
  }

  /** Esfera barrida por el camino propio desde el paragolpes: distancia libre hasta el primer obstáculo. */
  private sensor(v: Vehiculo, idx: number, cajas: OBB[][]): number {
    const t = v.tipo
    const r = t.width / 2 + MARGEN_SENSOR
    const sFront = v.s + t.front
    const look = 10 + v.v * 4 + (v.v * v.v) / (2 * t.bcomf)
    const cam = v.camino
    const pose = this._pose
    // primero, derecho hacia adelante desde el paragolpes (cubre los desvíos del camino en las curvas)
    const fx = v.x + Math.cos(v.h) * t.front
    const fz = v.z + Math.sin(v.h) * t.front
    for (let d = 0; d <= 3; d += 1.5) {
      const px = fx + Math.cos(v.h) * d
      const pz = fz + Math.sin(v.h) * d
      for (let j = 0; j < cajas.length; j++) {
        if (j === idx) continue
        for (const o of cajas[j]) if (distPuntoOBB(px, pz, o) < r) return d
      }
    }
    for (let d = 0; d <= look; d += 1.25) {
      let ss = sFront + d
      if (v.cerrado) ss = ((ss % cam.len) + cam.len) % cam.len
      else if (ss > cam.len) break
      cam.at(ss, pose)
      for (let j = 0; j < cajas.length; j++) {
        if (j === idx) continue
        for (const o of cajas[j]) if (distPuntoOBB(pose.x, pose.z, o) < r) return d
      }
      for (const o of this.dinamicos) if (distPuntoOBB(pose.x, pose.z, o) < r) return d
      for (const o of this.estaticos) if (Math.hypot(pose.x - o.x, pose.z - o.z) < r + o.r) return d
    }
    return Infinity
  }

  /** Tramos [a, b] (en largo de camino) en que cada camino pasa por cada zona. Se calcula una vez por camino. */
  private tramos = new WeakMap<Camino, { z: Zona; a: number; b: number }[]>()

  private tramosDe(cam: Camino) {
    let t = this.tramos.get(cam)
    if (t) return t
    t = []
    // índice espacial de zonas (celdas de 40 m)
    const C = 40
    const idx = new Map<string, Zona[]>()
    for (const z of this.zonas)
      for (let gx = Math.floor((z.x - z.r) / C); gx <= Math.floor((z.x + z.r) / C); gx++)
        for (let gz = Math.floor((z.z - z.r) / C); gz <= Math.floor((z.z + z.r) / C); gz++) {
          const k = `${gx},${gz}`
          const a = idx.get(k)
          if (a) a.push(z)
          else idx.set(k, [z])
        }
    const pose = this._pose
    const abierto = new Map<Zona, number>()
    for (let s = 0; s <= cam.len + 1; s += 1) {
      const ss = Math.min(s, cam.len)
      cam.at(ss, pose)
      const cerca = idx.get(`${Math.floor(pose.x / C)},${Math.floor(pose.z / C)}`) ?? []
      const dentro = new Set<Zona>()
      for (const z of cerca) if (dentroZona(z, pose.x, pose.z)) dentro.add(z)
      for (const z of dentro) if (!abierto.has(z)) abierto.set(z, ss)
      for (const [z, a] of [...abierto]) {
        if (!dentro.has(z) || ss >= cam.len) {
          t.push({ z, a, b: ss })
          abierto.delete(z)
        }
      }
      if (ss >= cam.len) break
    }
    this.tramos.set(cam, t)
    return t
  }

  /** Cambiar las zonas obliga a recalcular los tramos. */
  setZonas(z: Zona[]) {
    this.zonas = z
    this.tramos = new WeakMap()
  }

  private pedidosDe = new Map<number, Zona[]>()

  /** Para cada zona del camino: si el vehículo ya está adentro y a qué distancia entra y sale (la pasada más cercana). */
  private relacion(v: Vehiculo) {
    const cam = v.camino
    const L = cam.len
    const largo = v.largo()
    const sF = v.s + v.tipo.front
    const porZona = new Map<Zona, { ocupa: boolean; dIn: number; dOut: number }>()
    for (const tr of this.tramosDe(cam)) {
      let dIn = tr.a - sF
      if (v.cerrado) {
        dIn = (((tr.a - sF) % L) + L) % L
        if (dIn > L - largo - 6) dIn -= L
      }
      const dOut = dIn + (tr.b - tr.a)
      const ocupa = dIn <= 0 && dOut >= -largo - 2
      if (!ocupa && dIn <= 0) continue
      const prev = porZona.get(tr.z)
      if (!prev) porZona.set(tr.z, { ocupa, dIn, dOut })
      else if (ocupa) prev.ocupa = true
      else if (!prev.ocupa && dIn < prev.dIn) {
        prev.dIn = dIn
        prev.dOut = dOut
      }
    }
    return porZona
  }

  /**
   * Reserva de zonas sin "retener y esperar": el vehículo pide juntas todas las zonas que va a cruzar hasta el primer
   * lugar donde entra entero fuera de toda zona (un lugar seguro para frenar). Las toma solo si están todas libres y
   * nadie que pidió antes necesita alguna; si no, frena antes de la primera. Así no hay bloqueos en ciclo.
   */
  private zonasDe(v: Vehiculo) {
    const pedir = 14 + v.v * 3
    const largo = v.largo()
    const rel = this.relacion(v)
    const necesita = new Set<Zona>()
    for (const [z, e] of rel) if (e.ocupa) necesita.add(z)
    const adelante = [...rel].filter(([, e]) => !e.ocupa).sort((a, b) => a[1].dIn - b[1].dIn)
    let hasta = -Infinity
    if (adelante.length && adelante[0][1].dIn <= pedir) {
      hasta = adelante[0][1].dOut
      necesita.add(adelante[0][0])
      for (let i = 1; i < adelante.length; i++) {
        const [z, e] = adelante[i]
        if (e.dIn < hasta + largo + 3) {
          necesita.add(z)
          hasta = Math.max(hasta, e.dOut)
        } else break
      }
    }
    // soltar lo que ya no necesita
    for (const id of [...v.zonas]) {
      const z = this.zonas[id]
      if (z && !necesita.has(z)) {
        if (z.duenio === v.id) z.duenio = null
        v.zonas.delete(id)
      }
    }
    for (const z of this.zonas) if (!necesita.has(z)) z.pedidos.delete(v.id)
    const faltan = [...necesita].filter((z) => z.duenio !== v.id)
    if (!faltan.length) {
      v.meta.tPedido = undefined
      this.pedidosDe.delete(v.id)
      return
    }
    if (v.meta.tPedido === undefined) v.meta.tPedido = this.t
    const tp = v.meta.tPedido as number
    for (const z of faltan) z.pedidos.set(v.id, tp)
    this.pedidosDe.set(v.id, faltan)
    const adentro = faltan.some((z) => rel.get(z)?.ocupa)
    const libres = faltan.every((z) => z.duenio === null)
    // cede el paso solo a quien pidió antes y además puede pasar ahora (si el otro está trabado, no lo espera)
    let primero = true
    for (const z of faltan)
      for (const [id, t] of z.pedidos) {
        if (id === v.id || !(t < tp || (t === tp && id < v.id))) continue
        const otro = this.pedidosDe.get(id)
        if (otro && otro.every((zz) => zz.duenio === null || zz.duenio === id)) primero = false
      }
    const salida = hasta === -Infinity ? 0 : hasta
    const hayLugar = v.libre === Infinity || v.libre >= salida + largo + 2
    if (libres && (adentro || (primero && hayLugar))) {
      for (const z of faltan) {
        z.duenio = v.id
        z.pedidos.delete(v.id)
        v.zonas.add(z.id)
      }
      v.meta.tPedido = undefined
      this.pedidosDe.delete(v.id)
    } else {
      const antes = Math.min(...faltan.map((z) => rel.get(z)!).filter((e) => !e.ocupa).map((e) => e.dIn))
      if (isFinite(antes)) v.libre = Math.min(v.libre, Math.max(0, antes - 1.0))
    }
  }

  /** Al arrancar: cada vehículo toma las zonas en las que ya está (si otro las tiene, se lo corre por su camino). */
  ocuparIniciales() {
    for (const v of this.vehiculos) {
      for (let k = 0; k < 60; k++) {
        const rel = this.relacion(v)
        const adentro = [...rel].filter(([, e]) => e.ocupa).map(([z]) => z)
        if (adentro.every((z) => z.duenio === null || z.duenio === v.id)) {
          for (const z of adentro) {
            z.duenio = v.id
            v.zonas.add(z.id)
          }
          break
        }
        const s = v.s + 10
        const L = v.camino.len
        const p = v.camino.at(v.cerrado ? ((s % L) + L) % L : Math.min(s, L))
        v.s = s
        v.x = p.x
        v.z = p.z
        v.h = p.h
      }
    }
  }

  private mover(v: Vehiculo, dt: number) {
    const t = v.tipo
    const cam = v.camino
    // parada en curso
    if (v.enParada) {
      v.espera -= dt
      v.v = 0
      if (v.espera <= 0) {
        const p = v.enParada
        v.enParada = null
        p.alSalir?.(v)
      }
      return
    }
    // distancia a la próxima parada
    let gapParada = Infinity
    const prox = v.paradas.find((p) => p.s >= v.s - 0.5)
    if (prox) gapParada = prox.s - v.s
    if (prox && gapParada < 0.6 && v.v < 0.4) {
      v.enParada = prox
      v.espera = prox.espera
      v.paradas = v.paradas.filter((p) => p !== prox)
      v.v = 0
      return
    }
    if (!v.activo) {
      v.v = Math.max(0, v.v - t.bcomf * 2 * dt)
    } else {
      // IDM con el obstáculo más cercano (vehículo, zona o parada)
      const gapVeh = v.libre === Infinity ? Infinity : Math.max(0.01, v.libre - S0 * 0.5)
      const gapStop = gapParada === Infinity ? Infinity : Math.max(0.01, gapParada + 0.3)
      // velocidad máxima por curvatura delante (aceleración lateral ≤ 1,2 m/s²)
      let vcurva = t.vmax
      for (let d = 0; d <= 12 + v.v * 3; d += 2) {
        let ss = v.s + d
        if (v.cerrado) ss = ((ss % cam.len) + cam.len) % cam.len
        const k = Math.abs(cam.at(ss, this._pose).k)
        if (k > 1e-4) vcurva = Math.min(vcurva, Math.sqrt(1.2 / k))
      }
      const v0 = Math.max(0.5, Math.min(t.vmax, vcurva))
      const sStar = (gap: number, vl: number) => S0 + v.v * T_HEAD + (v.v * (v.v - vl)) / (2 * Math.sqrt(t.amax * t.bcomf))
      let acc = t.amax * (1 - (v.v / v0) ** 4)
      if (gapVeh !== Infinity) acc -= t.amax * (sStar(gapVeh, 0) / gapVeh) ** 2
      if (gapStop !== Infinity) acc = Math.min(acc, t.amax * (1 - (v.v / v0) ** 4 - ((0.2 + v.v * 0.9 + (v.v * v.v) / (2 * Math.sqrt(t.amax * t.bcomf))) / gapStop) ** 2))
      acc = Math.max(-6, Math.min(t.amax, acc))
      v.v = Math.max(0, v.v + acc * dt)
      if (gapVeh < 0.3 || (gapStop < 0.05 && v.v < 0.5)) v.v = Math.min(v.v, 0.05)
    }
    // persecución pura sobre el camino (referencia: eje trasero)
    const Ld = Math.max(3.5, 1.4 + v.v * 0.9)
    let sT = v.s + Ld
    if (v.cerrado) sT = ((sT % cam.len) + cam.len) % cam.len
    const p = cam.at(Math.min(sT, cam.len), this._pose)
    let tx = p.x
    let tz = p.z
    if (!v.cerrado && sT > cam.len) {
      // más allá del final: seguir derecho
      tx += Math.cos(p.h) * (sT - cam.len)
      tz += Math.sin(p.h) * (sT - cam.len)
    }
    const alpha = angDiff(Math.atan2(tz - v.z, tx - v.x), v.h)
    const dist = Math.hypot(tx - v.x, tz - v.z)
    const kappa = (2 * Math.sin(alpha)) / Math.max(dist, 0.5)
    const want = Math.max(-t.steerMax, Math.min(t.steerMax, Math.atan(kappa * t.wb)))
    const dmax = t.steerRate * dt
    v.delta += Math.max(-dmax, Math.min(dmax, want - v.delta))
    // integrar
    const ds = v.v * dt
    v.x += Math.cos(v.h) * ds
    v.z += Math.sin(v.h) * ds
    v.h += (ds / t.wb) * Math.tan(v.delta)
    v.odo += ds
    if (v.tr && t.trailer) {
      // perno rey en el tractor; el remolque gira hacia él (sin deslizamiento lateral en su eje)
      const kx = v.x + Math.cos(v.h) * t.trailer.king
      const kz = v.z + Math.sin(v.h) * t.trailer.king
      const ax = v.tr.x - Math.cos(v.tr.h) * t.trailer.len
      const az = v.tr.z - Math.sin(v.tr.h) * t.trailer.len
      v.tr.h = Math.atan2(kz - az, kx - ax)
      v.tr.x = kx
      v.tr.z = kz
    }
    // avance sobre el camino
    const prev = v.s
    if (v.cerrado) {
      const sm = ((prev % cam.len) + cam.len) % cam.len
      let sp = cam.project(v.x, v.z, sm, 6, 20)
      if (sm + 20 > cam.len) {
        // cerca de la costura del circuito: probar también desde el principio
        const sp2 = cam.project(v.x, v.z, 0, 0, sm + 20 - cam.len)
        const a = cam.at(sp, this._pose)
        const da = Math.hypot(a.x - v.x, a.z - v.z)
        const b = cam.at(sp2, this._pose)
        if (Math.hypot(b.x - v.x, b.z - v.z) < da) sp = sp2
      }
      let d = sp - sm
      if (d < -cam.len / 2) d += cam.len
      if (d > cam.len / 2) d -= cam.len
      v.s = prev + Math.max(0, d)
      if (Math.floor(v.s / cam.len) > Math.floor(prev / cam.len)) {
        v.vueltas++
        // las paradas de un camino cerrado se expresan dentro de la vuelta: se reprograman
        v.meta.nuevaVuelta = true
      }
    } else {
      v.s = Math.max(prev, cam.project(v.x, v.z, v.s, 6, 20))
      if (v.s >= cam.len - 0.5) v.terminado = true
    }
  }
}
