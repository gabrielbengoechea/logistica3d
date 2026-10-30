"""
Grúa pórtico sobre neumáticos (RTG) 6+1, apilado 1 sobre 5 (altura bajo spreader 18,1 m).

Marco (Blender): origen en el suelo, en el centro del pórtico. X = traslación del pórtico (a lo largo del bloque),
Y = a lo ancho del vano (traslación del carro), Z arriba. Trocha entre ruedas: 23,47 m. Batalla: 6,4 m.

Nodos móviles: Trolley (eje +Y), Hoist_Ropes (escala), Spreader (baja), Spreader_Tele_A/B, Twistlock_*,
Bogie_FL/FR/RL/RR (giran 90° para cambiar de bloque, eje Z), RTG_Wheel_* (ruedan, eje Y).
Animación «Ciclo_Patio»: el carro cruza el vano, baja, traba, sube y vuelve.
"""
import math

import bpy
from mathutils import Matrix, Vector as V

from kit import nucleo as K
from kit.nucleo import X, Y, Z
import sts as S

GAUGE = 23.47
WB = 6.4
Z_GIRDER = 20.6
R_T = 0.8           # neumático 1,6 m de diámetro
TROLLEY_REST = -6.0
SPREADER_REST = 17.5


def build_structure(t, lod, coll, mats):
    mb = K.MB()
    w, g, y_, gr = t["steel_white"], t["steel_grey"], t["steel_yellow"], t["grating"]
    hy = GAUGE / 2
    for sy in (-1, 1):
        y = sy * hy
        # viga inferior (sill) a lo largo de X, con las patas que suben a las vigas principales
        K.beam(mb, (-WB / 2 - 1.2, y, 2.3), (WB / 2 + 1.2, y, 2.3), 1.2, 1.4, w)
        for sx in (-1, 1):
            K.beam(mb, (sx * WB / 2, y, 2.6), (sx * 2.6, y, Z_GIRDER - 1.0), 1.2, 1.2, w)
        if lod < 2:
            K.beam(mb, (-WB / 2, y, 6.0), (WB / 2, y, 6.0), 0.6, 0.6, w)                    # tirante intermedio
            K.box(mb, (0, y, Z_GIRDER), (6.6, 1.6, 1.6), w)                                  # cabezal superior
        if lod == 0:
            K.truss(mb, (-WB / 2 + 0.6, y, 6.0), (WB / 2 - 0.6, y, 6.0), (-2.4, y, Z_GIRDER - 1.4), (2.4, y, Z_GIRDER - 1.4), 3, 0.3, w)
            K.box(mb, (0, y, Z_GIRDER - 1.9), (2.0, 0.8, 0.5), t["light_white"])
            # escalera hasta las vigas
            a, b = V((WB / 2 + 0.9, y - sy * 0.2, 2.9)), V((2.9 + 0.9, y - sy * 0.2, Z_GIRDER - 1.2))
            wv = V((0, -sy * 0.8, 0))
            lad = t["ladder"]
            L_ = (b - a).length
            mb.face([a, b, b + wv, a + wv], [lad.uv(0, 0), lad.uv(L_, 0), lad.uv(L_, 1), lad.uv(0, 1)], lad.mat)
            mb.face([a + wv, b + wv, b, a], [lad.uv(0, 1), lad.uv(L_, 1), lad.uv(L_, 0), lad.uv(0, 0)], lad.mat)
    # vigas principales (a lo largo de Y) con su pasarela y baranda
    for sx in (-1, 1):
        K.beam(mb, (sx * 2.6, -hy - 0.74, Z_GIRDER), (sx * 2.6, hy + 0.74, Z_GIRDER), 0.98, 1.56, w)
        if lod == 0:
            K.box(mb, (sx * 2.6, 0, Z_GIRDER + 0.88), (0.14, GAUGE, 0.14), t["galvanized"])
            K.box(mb, (sx * 3.6, 0, Z_GIRDER - 0.3), (0.9, GAUGE, 0.06), gr)
            K.card(mb, (sx * 4.05, -hy, Z_GIRDER - 0.27), (sx * 4.05, hy, Z_GIRDER - 0.27), 1.1, t["railing"])
    # sala de máquinas (generador / E-house) sobre la viga inferior del lado −Y y tanque
    hy0 = -hy - 1.9
    K.box(mb, (0, hy0, 4.4), (5.6, 2.4, 2.6), {"*": t["louver"], "+z": g, "-z": g})
    if lod == 0:
        K.cylinder(mb, (-3.6, hy0, 3.6), (-2.6, hy0, 3.6), 0.8, 14, g)
        K.quad_trim(mb, V((-2.6, hy0 - 1.22, 3.6)), V((2.6, hy0 - 1.22, 3.6)), V((2.6, hy0 - 1.22, 4.6)), V((-2.6, hy0 - 1.22, 4.6)), t["banner"])
    return mb.to_object(f"RTG_Structure_LOD{lod}", coll, materials=mats)


def bogie(t, coll, mats, root, name, c):
    """Bogie de esquina: horquilla que gira 90° (eje Z) con dos ruedas que ruedan (eje Y)."""
    c = V(c)
    st = K.empty(name, coll, size=0.6)
    K.set_parent(st, root, Matrix.Translation(c))
    K.freeze_pivot(st, c, Z)
    mb = K.MB()
    K.box(mb, c + V((0, 0, 1.75)), (3.4, 1.1, 0.5), t["steel_yellow"])
    for sx in (-1, 1):
        K.box(mb, c + V((sx * 0.85, 0, 1.0)), (0.3, 1.1, 1.2), t["steel_yellow"])
    K.attach(mb.to_object(f"{name}_Horquilla", coll, materials=mats), st)
    wheels = []
    for k, dx in enumerate((-0.85, 0.85)):
        mb = K.MB()
        p = c + V((dx, 0, R_T))
        K.cylinder(mb, p + V((0, -0.33, 0)), p + V((0, 0.33, 0)), R_T, 20, t["rubber"], cap_trim=t["rim"])
        w = mb.to_object(f"RTG_Wheel_{name[-2:]}{k + 1}", coll, materials=mats, sharp_deg=50)
        K.attach(w, st)
        K.auto_pivot(w, "wheel")
        wheels.append(w)
    return st, wheels


def build(t, coll, mats, _tex):
    root = K.empty("RTG_Crane", coll, display="ARROWS", size=4)
    for lod in (0, 1, 2):
        K.attach(build_structure(t, lod, coll, mats), root)
    wheels = []
    hy = GAUGE / 2
    for nm, sx, sy in (("Bogie_FL", 1, 1), ("Bogie_FR", 1, -1), ("Bogie_RL", -1, 1), ("Bogie_RR", -1, -1)):
        _, ws = bogie(t, coll, mats, root, nm, (sx * WB / 2, sy * hy, 0))
        wheels += ws
    # carro (se traslada en Y)
    trolley = K.empty("Trolley", coll, display="CUBE", size=1.2)
    K.set_parent(trolley, root, Matrix.Translation(V((0, TROLLEY_REST, Z_GIRDER + 0.95))))
    for lod in (0, 1):
        mb = K.MB()
        z0 = Z_GIRDER + 0.95
        K.box(mb, (0, TROLLEY_REST, z0 + 0.9), (6.4, 4.2, 1.6), t["steel_white"])
        if lod == 0:
            for sx in (-1, 1):
                for dy in (-1.6, 1.6):
                    K.cylinder(mb, (sx * 2.6 - 0.15, TROLLEY_REST + dy, z0 + 0.25), (sx * 2.6 + 0.15, TROLLEY_REST + dy, z0 + 0.25), 0.3, 10, t["steel_grey"])
            for sx in (-0.7, 0.7):
                K.cylinder(mb, (sx - 0.1, TROLLEY_REST, z0 + 0.1), (sx + 0.1, TROLLEY_REST, z0 + 0.1), 0.5, 14, t["galvanized"])
        # cabina del operador colgada del carro, a un costado
        K.beam(mb, (3.3, TROLLEY_REST + 1.6, z0 + 0.2), (3.3, TROLLEY_REST + 1.6, z0 - 2.2), 0.3, 0.3, t["steel_grey"])
        K.box(mb, (3.3, TROLLEY_REST + 1.6, z0 - 3.4), (2.0, 2.2, 2.4), {"+x": t["glass"], "-z": t["glass"], "+y": t["glass"], "-y": t["glass"], "-x": t["steel_white"], "+z": t["steel_white"]})
        K.attach(mb.to_object(f"RTG_Trolley_LOD{lod}", coll, materials=mats), trolley)
    K.freeze_pivot(trolley, V((0, TROLLEY_REST, Z_GIRDER + 0.95)), Y)
    z_sheave = Z_GIRDER + 1.05
    ropes = S.build_ropes(t, coll, mats)
    ropes.name = "Hoist_Ropes"
    K.set_parent(ropes, trolley, Matrix.Translation(V((0, TROLLEY_REST, z_sheave))))
    ropes.scale = (1, 1, z_sheave - SPREADER_REST)
    spreader = K.empty("Spreader", coll, display="CUBE", size=1.0)
    K.set_parent(spreader, trolley, Matrix.Translation(V((0, TROLLEY_REST, SPREADER_REST))))
    for lod in (0, 1):
        K.attach(S.build_spreader(t, lod, coll, mats, SPREADER_REST, y=TROLLEY_REST), spreader)
    K.freeze_pivot(spreader, V((0, TROLLEY_REST, SPREADER_REST)), -Z, x_hint=X)
    for sx in (1, -1):
        tele = S.build_tele(t, coll, mats, sx, SPREADER_REST, y=TROLLEY_REST)
        K.set_parent(tele, spreader, Matrix.Identity(4))
        K.freeze_pivot(tele, V((sx * 2.6, TROLLEY_REST, SPREADER_REST - 1.25)), V((sx, 0, 0)))
        for dy in (-1, 1):
            p = V((sx * S.SPAN40 / 2, TROLLEY_REST + dy * S.GAUGE_W / 2, SPREADER_REST - 1.55))
            tw = S.build_twistlock(t, coll, mats, p)
            tw.name = f"Twistlock_{'A' if sx > 0 else 'B'}{1 if dy < 0 else 2}"
            K.set_parent(tw, tele, Matrix.Identity(4))
            K.auto_pivot(tw, "twistlock")
    # colisiones
    for sy in (-1, 1):
        K.ucx_box(f"RTG_Viga_Inferior_{'I' if sy > 0 else 'D'}", coll, (0, sy * hy, 1.6), (WB + 3.6, 1.6, 3.2), parent=root)
        for sx in (-1, 1):
            K.ucx_beam(f"RTG_Pata_{'I' if sy > 0 else 'D'}{'A' if sx > 0 else 'B'}", coll, (sx * WB / 2, sy * hy, 2.6), (sx * 2.6, sy * hy, Z_GIRDER - 1.0), 1.3, 1.3, parent=root)
    for sx in (-1, 1):
        K.ucx_box(f"RTG_Viga_{'A' if sx > 0 else 'B'}", coll, (sx * 2.6, 0, Z_GIRDER), (1.0, GAUGE + 1.6, 1.6), parent=root)
    K.ucx_box("RTG_Sala", coll, (0, -hy - 1.9, 4.4), (5.6, 2.4, 2.6), parent=root)
    K.ucx_box("RTG_Spreader", coll, (0, TROLLEY_REST, SPREADER_REST - 1.0), (S.SPAN40 + 0.5, S.GAUGE_W + 0.6, 1.6), parent=spreader)
    root["trocha_m"] = GAUGE
    root["batalla_m"] = WB
    root["carro"] = {"reposo_y": TROLLEY_REST, "min_y": -GAUGE / 2 + 2.5, "max_y": GAUGE / 2 - 2.5}
    root["spreader"] = {"reposo_z": SPREADER_REST, "min_z": 2.0, "polea_z": z_sheave}
    root["filas"] = 6
    root["niveles"] = 5
    root["lod_distancias_m"] = [0, 150, 600]
    # animación
    act = bpy.data.actions.new("Ciclo_Patio")
    tw = [o for o in K.subtree(spreader) if o.name.startswith("Twistlock_")]
    for ob in [trolley, spreader, ropes] + tw + wheels:
        ob.animation_data_create()
        ob.animation_data.action = act
    inv_t = trolley.matrix_world.to_3x3().inverted()
    rt, rs = trolley.location.copy(), spreader.location.copy()
    fps = 30
    for sec, ty, sz, lock in ((0, TROLLEY_REST, SPREADER_REST, 0), (3, 7.0, SPREADER_REST, 0), (6, 7.0, 5.4, 0), (7, 7.0, 5.4, 1),
                              (10, 7.0, 15.0, 1), (13, -6.0, 15.0, 1), (16, -6.0, 2.8, 1), (17, -6.0, 2.8, 0), (20, TROLLEY_REST, SPREADER_REST, 0)):
        f = 1 + sec * fps
        trolley.location = rt + V((0, ty - TROLLEY_REST, 0))
        trolley.keyframe_insert("location", frame=f)
        spreader.location = rs + inv_t @ V((0, 0, sz - SPREADER_REST))
        spreader.keyframe_insert("location", frame=f)
        ropes.scale = (1, 1, max(0.05, z_sheave - sz))
        ropes.keyframe_insert("scale", frame=f)
        for o in tw:
            o.rotation_euler = (0, 0, math.pi / 2 * lock)
            o.keyframe_insert("rotation_euler", frame=f)
    return {"RTG_Crane": (root, {"moviles": ["Trolley", "Hoist_Ropes", "Spreader", "Spreader_Tele_A", "Spreader_Tele_B", "Twistlock_*",
                                             "Bogie_FL", "Bogie_FR", "Bogie_RL", "Bogie_RR", "RTG_Wheel_*"], "animaciones": ["Ciclo_Patio"]})}
