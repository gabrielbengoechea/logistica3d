import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cranesOnShift } from '../sim/terminalSim'
import { phaseAt } from '../sim/tracks'
import { useStore } from '../store'
import { BERTHS, LAND_Y, craneLocalX } from './layout'
import { getHaloTexture } from './materials'
import { useHaloMaterial } from './useGlow'
import { KIT_URL, LIBREAS, LIBREA_DV, Lods, clonar, ejeLocal, usePaquete } from './kit/kit'

/**
 * Grúas pórtico de muelle (STS) del kit portuario, en el marco de su puesto: x a lo largo del muelle, z hacia tierra,
 * z < 0 sobre el agua. Patas a 6 y 34 m del borde (trocha de 28 m), viga portal a 44 m, pluma con 60 m de alcance.
 *
 * Cada grúa es una copia del activo STS_Crane con su número en el tablero (atlas: STS 01…12), LOD por distancia
 * (estructura de 5.000 / 700 / 300 triángulos) y el ciclo de descarga sobre sus nodos reales: el carro (Trolley) se
 * traslada por la pluma, el spreader baja con los cables, los twistlocks giran para trabar el contenedor.
 */
export default function Cranes() {
  const berths = useStore((s) => s.params.berths)
  const n = useStore((s) => s.params.cranesPerBerth)
  return (
    <Suspense fallback={null}>
      {BERTHS.slice(0, berths).map((b, bi) => (
        <group key={bi} position={[b.x, 0, b.z]} rotation-y={b.a}>
          {Array.from({ length: n }, (_, i) => (
            <Crane key={i} berth={bi} index={i} x={craneLocalX(i, n)} numero={bi * 4 + i + 1} />
          ))}
        </group>
      ))}
    </Suspense>
  )
}

/** Tablero del número de grúa: corre las UV del rectángulo "STS 01" del atlas a la casilla del número pedido. */
function numerar(raiz: THREE.Object3D, numero: number) {
  const k = (numero - 1) % 12
  const du = (k % 6) * (168 / 2048)
  const dv = Math.floor(k / 6) * (100 / 2048)
  if (!du && !dv) return
  raiz.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !/^STS_Structure_LOD0/.test(m.name)) return
    const g = m.geometry.clone()
    const uv = g.attributes.uv as THREE.BufferAttribute
    const v0 = 1624 / 2048
    const v1 = 1720 / 2048
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      if (u >= -1e-4 && u <= 160 / 2048 + 1e-4 && v >= v0 - 1e-4 && v <= v1 + 1e-4) uv.setXY(i, u + du, v + dv)
    }
    uv.needsUpdate = true
    m.geometry = g
  })
}

function Crane({ berth, index, x, numero }: { berth: number; index: number; x: number; numero: number }) {
  const ind = usePaquete(KIT_URL.industrial)
  const cont = usePaquete(KIT_URL.contenedores)
  const { camera } = useThree()
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selection?.kind === 'crane' && s.selection.berth === berth && s.selection.index === index)
  const halo = useHaloMaterial(getHaloTexture(), 0.65)

  const rig = useMemo(() => {
    const raiz = clonar(ind.scene, 'STS_Crane')
    numerar(raiz, numero)
    const trolley = raiz.getObjectByName('Trolley')!
    const spreader = raiz.getObjectByName('Spreader')!
    let ropes: THREE.Object3D = raiz
    raiz.traverse((o) => {
      if (/Hoist_Ropes/.test(o.name)) ropes = o
    })
    const twist = [...'AB'].flatMap((s) => [1, 2].map((k) => raiz.getObjectByName(`Twistlock_${s}${k}`)!)).filter(Boolean)
    const ex = (raiz.userData ?? {}) as { carro?: { reposo_y: number }; spreader?: { reposo_z: number; polea_z: number }; lod_distancias_m?: number[] }
    // el contenedor que lleva: 40' del kit, colgado de los twistlocks
    const carga = clonar(cont.scene, 'Container_40')
    carga.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (/LOD1$/.test(m.name) || m.name.startsWith('UCX_')) m.visible = false
      else {
        // librea: corre las UV a una fila del atlas
        const g = m.geometry.clone()
        const uv = g.attributes.uv as THREE.BufferAttribute
        const dv = ((numero * 3) % LIBREAS) * LIBREA_DV
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + dv)
        m.geometry = g
      }
    })
    const restZ = ex.spreader?.reposo_z ?? 40
    // en el marco de la grúa: centro bajo el spreader en reposo, la cara superior contra los twistlocks
    carga.position.set(0, restZ - 1.57 - 2.591, -(ex.carro?.reposo_y ?? -20))
    raiz.add(carga)
    raiz.updateMatrixWorld(true)
    spreader.attach(carga)
    return {
      raiz,
      trolley,
      spreader,
      ropes,
      twist,
      carga,
      lods: new Lods(raiz, ex.lod_distancias_m ?? [0, 180, 700]),
      tRest: trolley.position.clone(),
      tAxis: ejeLocal(trolley),
      sRest: spreader.position.clone(),
      sAxis: ejeLocal(spreader),
      restZ,
      polea: ex.spreader?.polea_z ?? 51.6,
      parkZ: -(ex.carro?.reposo_y ?? -20),
    }
  }, [ind.scene, cont.scene, numero])

  // capa 1: entra en el reflejo del agua
  useEffect(() => {
    rig.raiz.traverse((o) => o.layers.enable(1))
  }, [rig])

  const clock = useRef(index * 0.37)
  useFrame((_, delta) => {
    const { tracks, t, params, playing } = useStore.getState()
    const working = cranesOnShift(t, params.craneHoursPerDay) && tracks.some((tr) => tr.berth === berth && phaseAt(tr, t, params).phase === 'working')
    if (playing && working) clock.current += delta * 0.22
    rig.lods.actualizar(camera)
    // ciclo: baja en el buque, traba, sube, viaja a tierra, baja, destraba, sube y vuelve
    const c = clock.current % 1
    const travel = c < 0.5 ? (c < 0.15 ? 0 : (c - 0.15) / 0.35) : c < 0.65 ? 1 : 1 - (c - 0.65) / 0.35
    const smooth = travel * travel * (3 - 2 * travel)
    // posición del carro (marco de la grúa, z hacia tierra): sobre el buque −38, sobre la calle de transferencia +20
    const zCarro = working ? -38 + smooth * 58 : rig.parkZ
    rig.trolley.position.copy(rig.tRest).addScaledVector(rig.tAxis, rig.parkZ - zCarro)
    // altura de la cara superior del spreader: baja hasta la bodega (18 m) o hasta la calle (4,2 m)
    const drop = working ? Math.max(0, 1 - Math.abs((c % 0.5) - 0.07) / 0.07) : 0
    const fondo = c < 0.5 ? 18 : 4.2
    const zSp = working ? 34 - drop * (34 - fondo) : rig.restZ
    rig.spreader.position.copy(rig.sRest).addScaledVector(rig.sAxis, rig.restZ - zSp)
    rig.ropes.scale.y = Math.max(0.1, rig.polea - zSp)
    // traba en el fondo del primer descenso, destraba en el fondo del segundo
    const trabado = working && c > 0.07 && c < 0.57
    const ang = trabado ? Math.PI / 2 : 0
    for (const tw of rig.twist) tw.rotation.y += (ang - tw.rotation.y) * Math.min(1, delta * 8)
    rig.carga.visible = trabado
  })

  return (
    <group
      position={[x, LAND_Y, 0]}
      onClick={(e) => {
        e.stopPropagation()
        select({ kind: 'crane', berth, index })
      }}
    >
      <primitive object={rig.raiz} />
      {selected && (
        <mesh position={[0, 36, 0]}>
          <boxGeometry args={[24, 76, 120]} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.06} depthWrite={false} />
        </mesh>
      )}
      <mesh rotation-x={-Math.PI / 2} position={[0, -2.3, -24]} material={halo}>
        <planeGeometry args={[70, 70]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.26, 18]} material={halo}>
        <planeGeometry args={[60, 50]} />
      </mesh>
    </group>
  )
}
