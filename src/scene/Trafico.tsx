import { Suspense, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cranesOnShift } from '../sim/terminalSim'
import { phaseAt } from '../sim/tracks'
import { useStore } from '../store'
import { LAND_Y } from './layout'
import { box } from './materials'
import { useGlowMaterial } from './useGlow'
import { KIT_URL, geometriaEn, mallaContenedores, matrizEn, usePaquete } from './kit/kit'
import { Gestor, type Carga } from './trafico/gestor'
import { TIPOS, type Vehiculo } from './trafico/trafico'

/**
 * Tránsito de la terminal: camiones externos (portería → bahía de intercambio → salida) y straddle carriers
 * (grúa ↔ patio), movidos por el motor de tránsito (cinemática de bicicleta, sensores frontales, zonas de conflicto).
 *
 * Todo se dibuja con mallas instanciadas (un draw call por pieza): cabinas en 3 colores, semirremolques, ruedas
 * simples y gemelas (cada una con su giro y la dirección de las delanteras), contenedores con librea y las partes
 * del straddle carrier.
 */
const ESCALA_TIEMPO = 2.5 // segundos de tránsito por segundo real (con el reloj andando)
const R_RUEDA = 0.52
const MAX_CAMIONES = 14
const MAX_STRADDLE = 40

export default function Trafico() {
  return (
    <Suspense fallback={null}>
      <TraficoKit />
    </Suspense>
  )
}

/** Partes del straddle carrier (la máquina de TCP): mismo modelo de siempre, ahora instanciado. */
function straddleGeometrias() {
  const L = 9.6
  const HW = 2.5
  const H = 14
  const merge = (p: THREE.BufferGeometry[]) => mergeGeometries(p.map((g) => (g.index ? g.toNonIndexed() : g)))!
  const frame: THREE.BufferGeometry[] = []
  for (const z of [-HW, HW]) {
    frame.push(box(0, 1.5, z, L, 0.9, 0.7))
    for (const x of [-L / 2 + 0.6, L / 2 - 0.6]) frame.push(box(x, H / 2, z, 0.8, H - 1, 0.8))
    frame.push(box(0, H - 0.4, z, L + 0.4, 1.1, 0.9))
    frame.push(box(0, H * 0.55, z, L - 1.2, 0.5, 0.5))
  }
  for (const x of [-L / 2 + 0.6, L / 2 - 0.6]) frame.push(box(x, H - 0.3, 0, 0.9, 1, 2 * HW + 0.8))
  frame.push(box(-1.2, H + 0.9, 0, 4.6, 1.8, 3.4))
  const wheels: THREE.BufferGeometry[] = []
  for (const z of [-HW, HW]) for (const x of [-3.6, -1.2, 1.2, 3.6]) wheels.push(new THREE.CylinderGeometry(0.75, 0.75, 0.7, 12).rotateX(Math.PI / 2).translate(x, 0.75, z))
  const cab = [box(L / 2 - 0.4, H - 2.2, -HW + 0.4, 2.2, 2.4, 2.2)]
  const beacon = [new THREE.SphereGeometry(0.35, 8, 8).translate(-1.2, H + 2, 0)]
  // el modelo tiene el centro en el medio; el motor usa el eje trasero (3 m detrás del centro)
  const off = (g: THREE.BufferGeometry) => g.translate(3.0, 0, 0)
  return { frame: off(merge(frame)), wheels: off(merge(wheels)), cab: off(merge(cab)), beacon: off(merge(beacon)) }
}

function TraficoKit() {
  const ind = usePaquete(KIT_URL.industrial)
  const cont = usePaquete(KIT_URL.contenedores)
  const gestor = useMemo(() => new Gestor(), [])
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as Record<string, unknown>).__trafico = gestor
  }, [gestor])
  const beaconMat = useGlowMaterial('#ffb020', 0.6, 8)

  const r = useMemo(() => {
    const S = ind.scene
    const inst = (g: THREE.BufferGeometry, m: THREE.Material, n: number) => {
      const im = new THREE.InstancedMesh(g, m, n)
      im.castShadow = true
      im.receiveShadow = true
      im.count = 0
      im.frustumCulled = false
      im.userData.sinColision = true
      return im
    }
    const matDe = (raiz: string, malla: string) => ((S.getObjectByName(raiz)!.getObjectByName(malla) as THREE.Mesh).material as THREE.Material)
    const cabinas = (['Blanco', 'Rojo', 'Azul'] as const).map((c) =>
      inst(geometriaEn(S, 'Truck_Tractor', `Truck_Tractor_${c}_LOD0`), matDe('Truck_Tractor', `Truck_Tractor_${c}_LOD0`), MAX_CAMIONES),
    )
    const remolque = inst(geometriaEn(S, 'Trailer_Skeletal40', 'Trailer_Skeletal40_LOD0'), matDe('Trailer_Skeletal40', 'Trailer_Skeletal40_LOD0'), MAX_CAMIONES)
    const rueda = S.getObjectByName('Wheel_FL') as THREE.Mesh
    const gemela = S.getObjectByName('Wheel_R1L') as THREE.Mesh
    const ruedasS = inst(rueda.geometry, rueda.material as THREE.Material, MAX_CAMIONES * 2)
    const ruedasD = inst(gemela.geometry, gemela.material as THREE.Material, MAX_CAMIONES * 10)
    // ruedas del tractor: matriz de reposo respecto de la raíz (las delanteras cuelgan de su pivote de dirección)
    const del = ['FL', 'FR'].map((k) => {
      const steer = matrizEn(S, 'Truck_Tractor', `Steer_${k}`)
      const rel = steer.clone().invert().multiply(matrizEn(S, 'Truck_Tractor', `Wheel_${k}`))
      return { steer, rel }
    })
    const tras = ['R1L', 'R1R', 'R2L', 'R2R'].map((k) => matrizEn(S, 'Truck_Tractor', `Wheel_${k}`))
    const remRuedas = [1, 2, 3].flatMap((a) => ['L', 'R'].map((sd) => matrizEn(S, 'Trailer_Skeletal40', `Trailer_Wheel_${a}${sd}`)))
    const mounts = {
      m40: matrizEn(S, 'Trailer_Skeletal40', 'Mount_40'),
      a: matrizEn(S, 'Trailer_Skeletal40', 'Mount_20A'),
      b: matrizEn(S, 'Trailer_Skeletal40', 'Mount_20B'),
    }
    const c40 = mallaContenedores(cont.scene, '40', MAX_CAMIONES + MAX_STRADDLE, 0)
    const c20 = mallaContenedores(cont.scene, '20', MAX_CAMIONES * 2, 0)
    for (const m of [c40, c20]) {
      m.count = 0
      m.frustumCulled = false
      m.userData.sinColision = true
    }
    const sg = straddleGeometrias()
    const sMat = new THREE.MeshStandardMaterial({ color: '#e8b23a', roughness: 0.55, metalness: 0.2 })
    const sWheel = new THREE.MeshStandardMaterial({ color: '#15181d', roughness: 0.9 })
    const sCab = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.15, metalness: 0.5 })
    const st = {
      frame: inst(sg.frame, sMat, MAX_STRADDLE),
      wheels: inst(sg.wheels, sWheel, MAX_STRADDLE),
      cab: inst(sg.cab, sCab, MAX_STRADDLE),
      beacon: inst(sg.beacon, beaconMat, MAX_STRADDLE),
    }
    return { cabinas, remolque, ruedasS, ruedasD, del, tras, remRuedas, mounts, c40, c20, st }
  }, [ind.scene, cont.scene, beaconMat])

  useEffect(
    () => () => {
      for (const m of [...r.cabinas, r.remolque, r.ruedasS, r.ruedasD, r.c40, r.c20, r.st.frame, r.st.wheels, r.st.cab]) m.dispose()
    },
    [r],
  )

  const tmp = useMemo(
    () => ({
      root: new THREE.Matrix4(),
      m: new THREE.Matrix4(),
      rot: new THREE.Matrix4(),
      spin: new THREE.Matrix4(),
      cuenta: new Int32Array(3),
    }),
    [],
  )

  useFrame((_, delta) => {
    const { params, playing, tracks, t } = useStore.getState()
    const camiones = Math.max(3, Math.min(MAX_CAMIONES - 2, Math.round(params.truckMovesPerHour / 12)))
    gestor.configurar(params.berths, params.cranesPerBerth, camiones)
    const onShift = cranesOnShift(t, params.craneHoursPerDay)
    const trabaja = (b: number) => onShift && tracks.some((tr) => tr.berth === b && phaseAt(tr, t, params).phase === 'working')
    if (playing) gestor.update(Math.min(delta, 0.1) * ESCALA_TIEMPO, { gruaTrabaja: trabaja })

    const { root, m, rot, spin, cuenta } = tmp
    const pose = (x: number, z: number, h: number) => root.makeRotationY(-h).setPosition(x, LAND_Y, z)
    cuenta.fill(0)
    let nT = 0
    let nS = 0
    let nD = 0
    let n40 = 0
    let n20 = 0
    const lib40 = r.c40.geometry.getAttribute('aLibrea') as THREE.InstancedBufferAttribute
    const lib20 = r.c20.geometry.getAttribute('aLibrea') as THREE.InstancedBufferAttribute
    const ponerCarga = (carga: Carga | null | undefined, base: THREE.Matrix4) => {
      if (!carga) return
      if (carga.size === '40') {
        r.c40.setMatrixAt(n40, m.multiplyMatrices(base, r.mounts.m40))
        lib40.setX(n40++, carga.livery)
      } else {
        r.c20.setMatrixAt(n20, m.multiplyMatrices(base, r.mounts.a))
        lib20.setX(n20++, carga.livery)
        r.c20.setMatrixAt(n20, m.multiplyMatrices(base, r.mounts.b))
        lib20.setX(n20++, (carga.livery + 3) % 8)
      }
    }
    let nSt = 0
    for (const v of gestor.trafico.vehiculos) {
      if (v.tipo === TIPOS.camion) {
        if (nT >= MAX_CAMIONES) continue
        const giro = v.odo / R_RUEDA
        pose(v.x, v.z, v.h)
        const c = (v.meta.cabina as number) ?? 0
        r.cabinas[c].setMatrixAt(cuenta[c]++, root)
        spin.makeRotationY(giro)
        for (const w of r.del) {
          rot.makeRotationY(-v.delta)
          m.multiplyMatrices(root, w.steer).multiply(rot).multiply(w.rel).multiply(spin)
          r.ruedasS.setMatrixAt(nS++, m)
        }
        for (const w of r.tras) r.ruedasD.setMatrixAt(nD++, m.multiplyMatrices(root, w).multiply(spin))
        if (v.tr) {
          const tr = v.tr
          const rootT = new THREE.Matrix4().makeRotationY(-tr.h).setPosition(tr.x, LAND_Y, tr.z)
          r.remolque.setMatrixAt(nT, rootT)
          for (const w of r.remRuedas) r.ruedasD.setMatrixAt(nD++, m.multiplyMatrices(rootT, w).multiply(spin))
          ponerCarga(v.meta.carga as Carga | null, rootT)
        }
        nT++
      } else if (v.tipo === TIPOS.straddle) {
        if (nSt >= MAX_STRADDLE) continue
        pose(v.x, v.z, v.h)
        r.st.frame.setMatrixAt(nSt, root)
        r.st.wheels.setMatrixAt(nSt, root)
        r.st.cab.setMatrixAt(nSt, root)
        r.st.beacon.setMatrixAt(nSt, root)
        if (v.meta.cargado) {
          // contenedor colgando entre las patas (centro del contenedor 3,4 m sobre el piso → base a 2,1 m)
          m.makeTranslation(3.0, 2.1, 0)
          r.c40.setMatrixAt(n40, m.premultiply(root))
          lib40.setX(n40++, circuitoColor(v))
        }
        nSt++
      }
    }
    r.cabinas.forEach((im, i) => {
      im.count = cuenta[i]
      im.instanceMatrix.needsUpdate = true
    })
    for (const [im, n] of [
      [r.remolque, nT],
      [r.ruedasS, nS],
      [r.ruedasD, nD],
      [r.c40, n40],
      [r.c20, n20],
      [r.st.frame, nSt],
      [r.st.wheels, nSt],
      [r.st.cab, nSt],
      [r.st.beacon, nSt],
    ] as const) {
      im.count = n
      im.instanceMatrix.needsUpdate = true
    }
    lib40.needsUpdate = true
    lib20.needsUpdate = true
  })

  return (
    <>
      {[...r.cabinas, r.remolque, r.ruedasS, r.ruedasD, r.c40, r.c20, r.st.frame, r.st.wheels, r.st.cab, r.st.beacon].map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
    </>
  )
}

function circuitoColor(v: Vehiculo) {
  const k = String(v.meta.circuito ?? '')
  let h = 0
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) % 997
  return h % 8
}
