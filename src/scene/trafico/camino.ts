/**
 * Caminos de la red de tránsito: polilíneas muestreadas cada ~1 m con su largo acumulado, armadas con una "tortuga"
 * de rectas y arcos de radio fijo (así cada curva respeta el radio mínimo de giro de un semirremolque).
 *
 * Marco: el de la terminal (x a lo largo del muelle, z hacia tierra), en metros. Rumbo h: dirección (cos h, sin h)
 * en el plano (x, z). En three.js, un objeto que avanza hacia +x se orienta con rotation.y = −h.
 */
export type P2 = [number, number]

export interface Pose {
  x: number
  z: number
  /** Rumbo (rad). */
  h: number
  /** Curvatura con signo (1/m). */
  k: number
}

export class Camino {
  readonly xs: Float64Array
  readonly zs: Float64Array
  readonly s: Float64Array
  readonly len: number

  constructor(pts: P2[]) {
    // quitar puntos repetidos
    const clean: P2[] = []
    for (const p of pts) if (!clean.length || Math.hypot(p[0] - clean[clean.length - 1][0], p[1] - clean[clean.length - 1][1]) > 1e-6) clean.push(p)
    const n = clean.length
    this.xs = new Float64Array(n)
    this.zs = new Float64Array(n)
    this.s = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      this.xs[i] = clean[i][0]
      this.zs[i] = clean[i][1]
      if (i) this.s[i] = this.s[i - 1] + Math.hypot(clean[i][0] - clean[i - 1][0], clean[i][1] - clean[i - 1][1])
    }
    this.len = n ? this.s[n - 1] : 0
  }

  get n() {
    return this.xs.length
  }

  get start(): P2 {
    return [this.xs[0], this.zs[0]]
  }

  get end(): P2 {
    return [this.xs[this.n - 1], this.zs[this.n - 1]]
  }

  /** Índice del tramo que contiene el largo s (búsqueda binaria). */
  private seg(s: number) {
    let lo = 0
    let hi = this.n - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (this.s[m] <= s) lo = m
      else hi = m
    }
    return lo
  }

  /** Punto, rumbo y curvatura en el largo s (se recorta a [0, len]). */
  at(s: number, out: Pose = { x: 0, z: 0, h: 0, k: 0 }): Pose {
    const n = this.n
    if (n < 2) {
      out.x = this.xs[0] ?? 0
      out.z = this.zs[0] ?? 0
      out.h = 0
      out.k = 0
      return out
    }
    const ss = Math.min(Math.max(s, 0), this.len)
    const i = Math.min(this.seg(ss), n - 2)
    const ds = this.s[i + 1] - this.s[i]
    const u = ds > 0 ? (ss - this.s[i]) / ds : 0
    const dx = this.xs[i + 1] - this.xs[i]
    const dz = this.zs[i + 1] - this.zs[i]
    out.x = this.xs[i] + dx * u
    out.z = this.zs[i] + dz * u
    out.h = Math.atan2(dz, dx)
    // curvatura: cambio de rumbo entre el tramo anterior y el siguiente
    const j0 = Math.max(0, i - 1)
    const j1 = Math.min(n - 2, i + 1)
    const h0 = Math.atan2(this.zs[j0 + 1] - this.zs[j0], this.xs[j0 + 1] - this.xs[j0])
    const h1 = Math.atan2(this.zs[j1 + 1] - this.zs[j1], this.xs[j1 + 1] - this.xs[j1])
    const span = this.s[j1 + 1] - this.s[j0]
    out.k = span > 0 ? angDiff(h1, h0) / (span * 0.5 + 1e-9) / 2 : 0
    return out
  }

  /** Largo s del punto del camino más cercano a (x, z), buscando en [s0 − back, s0 + ahead]. */
  project(x: number, z: number, s0 = 0, back = 6, ahead = 30): number {
    const a = Math.max(0, this.seg(Math.max(0, s0 - back)))
    const b = Math.min(this.n - 2, this.seg(Math.min(this.len, s0 + ahead)) + 1)
    let best = s0
    let bd = Infinity
    for (let i = a; i <= b; i++) {
      const ax = this.xs[i]
      const az = this.zs[i]
      const dx = this.xs[i + 1] - ax
      const dz = this.zs[i + 1] - az
      const L2 = dx * dx + dz * dz
      const u = L2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L2)) : 0
      const px = ax + dx * u
      const pz = az + dz * u
      const d = (px - x) ** 2 + (pz - z) ** 2
      if (d < bd) {
        bd = d
        best = this.s[i] + u * Math.sqrt(L2)
      }
    }
    return best
  }

  /** Camino que sigue a este con otro (deben tocarse). */
  concat(other: Camino): Camino {
    const pts: P2[] = []
    for (let i = 0; i < this.n; i++) pts.push([this.xs[i], this.zs[i]])
    for (let i = 0; i < other.n; i++) pts.push([other.xs[i], other.zs[i]])
    return new Camino(pts)
  }

  points(): P2[] {
    const out: P2[] = []
    for (let i = 0; i < this.n; i++) out.push([this.xs[i], this.zs[i]])
    return out
  }

  /** Radio mínimo de las curvas (m): círculo por tres puntos separados 3 m (no depende del muestreo). */
  minRadius(): number {
    let r = Infinity
    const a: Pose = { x: 0, z: 0, h: 0, k: 0 }
    const b: Pose = { x: 0, z: 0, h: 0, k: 0 }
    const c: Pose = { x: 0, z: 0, h: 0, k: 0 }
    for (let s = 0; s + 6 <= this.len; s += 0.5) {
      this.at(s, a)
      this.at(s + 3, b)
      this.at(s + 6, c)
      const ab = Math.hypot(b.x - a.x, b.z - a.z)
      const bc = Math.hypot(c.x - b.x, c.z - b.z)
      const ca = Math.hypot(a.x - c.x, a.z - c.z)
      const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))
      if (area2 > 1e-6) r = Math.min(r, (ab * bc * ca) / (2 * area2))
    }
    return r
  }
}

export function angDiff(a: number, b: number) {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/** Constructor de caminos: rectas y arcos tangentes. */
export class Tortuga {
  private pts: P2[]
  x: number
  z: number
  h: number

  constructor(x: number, z: number, h: number) {
    this.x = x
    this.z = z
    this.h = h
    this.pts = [[x, z]]
  }

  /** Recta de largo d. */
  recta(d: number, paso = 2) {
    const n = Math.max(1, Math.ceil(d / paso))
    const cx = Math.cos(this.h)
    const sz = Math.sin(this.h)
    for (let i = 1; i <= n; i++) this.pts.push([this.x + (cx * d * i) / n, this.z + (sz * d * i) / n])
    this.x += cx * d
    this.z += sz * d
    return this
  }

  /** Recta hasta que la coordenada `eje` llegue a `valor` (el rumbo tiene que acercarla). */
  hasta(eje: 'x' | 'z', valor: number) {
    const c = eje === 'x' ? Math.cos(this.h) : Math.sin(this.h)
    const d = (valor - (eje === 'x' ? this.x : this.z)) / c
    if (d > 1e-6) this.recta(d)
    return this
  }

  /** Arco de radio r y ángulo a (rad; positivo = el rumbo crece). */
  arco(r: number, a: number) {
    const sg = Math.sign(a)
    // centro a la "izquierda" (rumbo + 90°·signo)
    const cx = this.x + Math.cos(this.h + (sg * Math.PI) / 2) * r
    const cz = this.z + Math.sin(this.h + (sg * Math.PI) / 2) * r
    const a0 = Math.atan2(this.z - cz, this.x - cx)
    const n = Math.max(4, Math.ceil((Math.abs(a) * r) / 1.0))
    for (let i = 1; i <= n; i++) {
      const t = a0 + (a * i) / n
      this.pts.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r])
    }
    this.x = cx + Math.cos(a0 + a) * r
    this.z = cz + Math.sin(a0 + a) * r
    this.h += a
    return this
  }

  /** Cambio de carril en S: desplazamiento lateral `off` (positivo = hacia rumbo+90°) en un largo `d`. */
  ese(off: number, d: number) {
    // dos arcos iguales: ángulo y radio que cubren (d, off)
    const a = 2 * Math.atan2(Math.abs(off), d)
    const r = (d * d + off * off) / (4 * Math.abs(off))
    const sg = Math.sign(off)
    this.arco(r, sg * a)
    this.arco(r, -sg * a)
    return this
  }

  camino() {
    return new Camino(this.pts)
  }
}

/**
 * Redondea las esquinas de una polilínea con arcos tangentes de radio `r` (o menor, si los tramos son cortos).
 * `cerrado`: el último punto se une con el primero.
 */
export function redondear(pts: P2[], r: number, cerrado = false): Camino {
  const P = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6)
  if (cerrado && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-6) P.pop()
  const n = P.length
  const out: P2[] = []
  const corner = (i: number): P2[] => {
    const a = P[(i - 1 + n) % n]
    const b = P[i]
    const c = P[(i + 1) % n]
    const d1: P2 = [b[0] - a[0], b[1] - a[1]]
    const d2: P2 = [c[0] - b[0], c[1] - b[1]]
    const l1 = Math.hypot(...d1)
    const l2 = Math.hypot(...d2)
    const h1 = Math.atan2(d1[1], d1[0])
    const h2 = Math.atan2(d2[1], d2[0])
    const turn = angDiff(h2, h1)
    if (Math.abs(turn) < 1e-3) return [b]
    const tanHalf = Math.tan(Math.abs(turn) / 2)
    const rr = Math.min(r, (Math.min(l1, l2) * 0.49) / tanHalf)
    const cut = rr * tanHalf
    const t = new Tortuga(b[0] - (d1[0] / l1) * cut, b[1] - (d1[1] / l1) * cut, h1)
    t.arco(rr, turn)
    return t.camino().points()
  }
  for (let i = 0; i < n; i++) {
    if (!cerrado && (i === 0 || i === n - 1)) {
      out.push(P[i])
      continue
    }
    for (const p of corner(i)) out.push(p)
  }
  if (cerrado) out.push(out[0])
  // densificar las rectas largas (1 punto cada 2 m) para que el seguimiento y los sensores sean finos
  const dense: P2[] = []
  for (let i = 0; i < out.length; i++) {
    if (i) {
      const [ax, az] = out[i - 1]
      const [bx, bz] = out[i]
      const L = Math.hypot(bx - ax, bz - az)
      const k = Math.floor(L / 2)
      for (let j = 1; j < k; j++) dense.push([ax + ((bx - ax) * j) / k, az + ((bz - az) * j) / k])
    }
    dense.push(out[i])
  }
  return new Camino(dense)
}
