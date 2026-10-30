"""
Camiones de la terminal:
- Truck_Tractor: tractor de cabina frontal 6×4 (portería y calle de entrega), 3 colores de cabina en el mismo glb.
- Trailer_Skeletal40: semirremolque esqueleto de 3 ejes para un 40' o dos 20', con twistlocks y patas de apoyo.
- Yard_Tractor: tractor de patio (cabina desplazada de un solo asiento, quinta rueda elevable, baliza).
- Yard_Chassis40: chasis de terminal (bomb cart) para el tractor de patio.

Marco (Blender): +X hacia adelante, +Y a la izquierda, Z arriba, origen en el suelo.
- Tractores: origen en el punto medio del eje trasero (referencia del modelo de bicicleta del visor).
  Hitch = centro del perno rey sobre la quinta rueda. Steer_FL/FR: pivote de dirección (eje Z) con su rueda.
- Remolques: origen en el perno rey (se cuelga del Hitch del tractor). Mount_40 / Mount_20A / Mount_20B: centro de la
  base de cada contenedor. Las ruedas Wheel_* giran sobre su eje (pivote calculado desde la geometría).
Animación «Rodar»: una vuelta de todas las ruedas (el visor la escala con la velocidad).
"""
import math

import bpy
from mathutils import Matrix, Vector as V

from kit import nucleo as K
from kit.nucleo import X, Y, Z

R_WHEEL, W_TIRE = 0.52, 0.30


def wheel(t, coll, mats, c, dual=False, side=1, name="Wheel", seg=18):
    """Rueda (o par de ruedas gemelas) centrada en c, eje Y. La llanta (decal) mira hacia afuera (side)."""
    mb = K.MB()
    c = V(c)
    widths = [(-W_TIRE / 2, W_TIRE / 2)] if not dual else [(-W_TIRE - 0.01, -0.01), (0.01, W_TIRE + 0.01)]
    for y0, y1 in widths:
        a, b = c + V((0, y0, 0)), c + V((0, y1, 0))
        K.cylinder(mb, a, b, R_WHEEL, seg, t["rubber"], caps=False)
        # tapas: llanta en la cara exterior, goma en la interior
        for p, out in ((a, -1), (b, 1)):
            ring = [p + V((R_WHEEL * math.cos(2 * math.pi * j / seg), 0, R_WHEEL * math.sin(2 * math.pi * j / seg))) for j in range(seg)]
            # la llanta va en la tapa que mira hacia afuera del vehículo; la otra es goma
            rim = t["rim"] if out == side else K.Decal(*([t["rubber"].uv(0.1, 0.5)[0], t["rubber"].uv(0.1, 0.5)[1]] * 2))
            uvs = [rim.uv(0.5 + 0.5 * math.cos(2 * math.pi * j / seg), 0.5 + 0.5 * math.sin(2 * math.pi * j / seg)) for j in range(seg)]
            if out > 0:
                mb.face(ring[::-1], uvs[::-1], rim.mat)
            else:
                mb.face(ring, uvs, rim.mat)
    ob = mb.to_object(name, coll, materials=mats, sharp_deg=50)
    return ob


def chamfer_box(mb, x0, x1, y0, y1, z0, z1, ch, trims):
    """Caja con el canto superior delantero achaflanado (cabina)."""
    p = [V((x0, y0, z0)), V((x1, y0, z0)), V((x1, y1, z0)), V((x0, y1, z0)),
         V((x0, y0, z1)), V((x1 - ch, y0, z1)), V((x1 - ch, y1, z1)), V((x0, y1, z1)),
         V((x1, y0, z1 - ch)), V((x1, y1, z1 - ch))]
    side = trims["side"]
    # costado derecho (−Y): polígono de 5 lados
    sr = [p[0], p[1], p[8], p[5], p[4]]
    mb.face(sr, [side.uv(q.x - x0, (q.z - z0) / (z1 - z0)) for q in sr], side.mat)
    sl = [p[3], p[7], p[6], p[9], p[2]]
    mb.face(sl, [side.uv(x1 - q.x, (q.z - z0) / (z1 - z0)) for q in sl], side.mat)
    K.quad_trim(mb, p[1], p[2], p[9], p[8], trims["front"])          # frente
    K.quad_trim(mb, p[8], p[9], p[6], p[5], trims["glass"])          # parabrisas (chaflán)
    K.quad_trim(mb, p[4], p[5], p[6], p[7], trims["top"])            # techo
    K.quad_trim(mb, p[3], p[0], p[4], p[7], trims["back"])           # trasera
    K.quad_trim(mb, p[0], p[3], p[2], p[1], trims["top"])            # piso


def tractor_body(t, lod, cab, coll, mats):
    """Chasis + cabina (sin ruedas en LOD0: van en nodos aparte)."""
    mb = K.MB()
    ch, gal, chrome = t["chassis"], t["galvanized"], t["chrome"]
    paint = t[cab]
    # largueros del chasis
    for sy in (-1, 1):
        K.beam(mb, (-1.4, sy * 0.45, 0.95), (5.0, sy * 0.45, 0.95), 0.12, 0.3, ch)
    if lod == 0:
        for x in (-1.2, 0.0, 1.2, 2.6, 4.2):
            K.beam(mb, (x, -0.45, 0.95), (x, 0.45, 0.95), 0.1, 0.2, ch)
        # quinta rueda
        K.box(mb, (0.3, 0, 1.17), (1.1, 1.0, 0.14), ch)
        K.box(mb, (0.3, 0, 1.06), (0.5, 0.9, 0.12), gal)
        # tanques de combustible y caja de baterías, escape vertical, guardabarros
        for sy in (-1, 1):
            K.cylinder(mb, (1.6, sy * 0.95, 0.75), (2.7, sy * 0.95, 0.75), 0.33, 14, chrome)
            K.box(mb, (0.0, sy * 1.05, R_WHEEL * 2 + 0.06), (2.3, 0.62, 0.06), ch)
            K.box(mb, (3.98, sy * 1.06, R_WHEEL * 2 + 0.02), (1.2, 0.36, 0.06), paint)
        K.cylinder(mb, (2.8, 0.8, 1.3), (2.8, 0.8, 3.75), 0.09, 10, chrome)
        K.box(mb, (2.6, -0.85, 1.1), (0.6, 0.5, 0.5), ch)
        # luces traseras
        for sy in (-1, 1):
            K.box(mb, (-1.42, sy * 0.85, 1.05), (0.06, 0.25, 0.12), t["light_red"])
    # cabina frontal (de x 3,0 a 5,35) con parabrisas inclinado
    z0, z1 = 1.05, 3.35
    chamfer_box(mb, 3.0, 5.35, -1.24, 1.24, z0, z1, 0.35, {"side": paint, "front": t["truck_front"], "glass": t["glass"], "top": paint, "back": paint})
    if lod < 2:
        # deflector de techo y paragolpes
        K.box(mb, (4.1, 0, z1 + 0.28), (1.9, 2.3, 0.5), paint)
        K.box(mb, (5.37, 0, 0.75), (0.25, 2.48, 0.5), ch)
    if lod == 0:
        # ventanillas laterales, puertas con logo, espejos, escalones, visera y matrícula
        for sy in (-1, 1):
            y = sy * 1.245
            xs = (4.4, 5.05) if sy > 0 else (5.05, 4.4)
            a, b = V((xs[0], y, 2.25)), V((xs[1], y, 2.25))
            K.quad_trim(mb, a, b, b + V((0, 0, 0.75)), a + V((0, 0, 0.75)), t["glass"])
            xs = (3.55, 4.95) if sy > 0 else (4.95, 3.55)
            a, b = V((xs[0], y, 1.35)), V((xs[1], y, 1.35))
            K.quad_trim(mb, a, b, b + V((0, 0, 0.7)), a + V((0, 0, 0.7)), t["truck_door"])
            K.beam(mb, (5.1, sy * 1.25, 2.6), (5.3, sy * 1.55, 2.7), 0.05, 0.05, ch)
            K.box(mb, (5.25, sy * 1.6, 2.45), (0.1, 0.25, 0.55), ch)
            for z in (0.55, 0.85):
                K.box(mb, (4.75, sy * 1.15, z), (0.4, 0.25, 0.05), gal)
            K.box(mb, (5.36, sy * 1.0, 0.95), (0.04, 0.18, 0.1), t["light_amber"])
        K.box(mb, (5.2, 0, z1 - 0.05), (0.35, 2.3, 0.08), paint)
        p = V((5.505, 0, 0.75))
        K.quad_trim(mb, p + V((0, -0.26, -0.11)), p + V((0, 0.26, -0.11)), p + V((0, 0.26, 0.11)), p + V((0, -0.26, 0.11)), t["plate"])
    if lod > 0:
        for x in (-0.68, 0.68, 3.98):
            for sy in (-1, 1):
                K.cylinder(mb, (x, sy * 0.85, R_WHEEL), (x, sy * 1.25, R_WHEEL), R_WHEEL, 8 if lod == 1 else 6, t["rubber"])
    name = {"cab_white": "Blanco", "cab_red": "Rojo", "cab_blue": "Azul"}[cab]
    return mb.to_object(f"Truck_Tractor_{name}_LOD{lod}", coll, materials=mats)


def add_wheels(t, coll, mats, root, specs, steer=()):
    """specs: [(nombre, centro, gemela, lado)]. Las ruedas delanteras cuelgan de un Steer_* (eje Z)."""
    out = []
    for name, c, dual, side in specs:
        w = wheel(t, coll, mats, c, dual, side, name=name)
        if name in steer:
            st = K.empty(name.replace("Wheel", "Steer"), coll, size=0.4)
            K.set_parent(st, root, Matrix.Translation(V(c)))
            K.freeze_pivot(st, V(c), Z)
            K.attach(w, st)
        else:
            K.attach(w, root)
        K.auto_pivot(w, "wheel")
        out.append(w)
    return out


def build_tractor(t, coll, mats):
    root = K.empty("Truck_Tractor", coll, display="ARROWS", size=2)
    for cab in ("cab_white", "cab_red", "cab_blue"):
        for lod in (0, 1):
            K.attach(tractor_body(t, lod, cab, coll, mats), root)
    specs = [("Wheel_FL", (3.98, 1.02, R_WHEEL), False, 1), ("Wheel_FR", (3.98, -1.02, R_WHEEL), False, -1)]
    for k, x in enumerate((0.68, -0.68)):
        specs += [(f"Wheel_R{k + 1}L", (x, 0.92, R_WHEEL), True, 1), (f"Wheel_R{k + 1}R", (x, -0.92, R_WHEEL), True, -1)]
    wheels = add_wheels(t, coll, mats, root, specs, steer=("Wheel_FL", "Wheel_FR"))
    hitch = K.empty("Hitch", coll, display="SPHERE", size=0.2)
    K.set_parent(hitch, root, Matrix.Translation(V((0.3, 0, 1.25))))
    K.ucx_box("Tractor_Cabina", coll, (4.18, 0, 2.3), (2.4, 2.5, 2.6), parent=root)
    K.ucx_box("Tractor_Chasis", coll, (1.8, 0, 0.75), (6.6, 2.5, 1.5), parent=root)
    root["batalla_m"] = 3.98
    root["giro_max_deg"] = 38
    root["radio_giro_min_m"] = round(3.98 / math.tan(math.radians(38)), 2)
    root["hitch"] = [0.3, 0, 1.25]
    root["cabinas"] = ["Blanco", "Rojo", "Azul"]
    root["lod_distancias_m"] = [0, 120]
    root["solo_lod0"] = ["Wheel_", "Steer_"]
    return root, wheels


def build_trailer(t, coll, mats):
    """Esqueleto de 40' (largo 12,4 m). Origen en el perno rey; el remolque va hacia −X."""
    root = K.empty("Trailer_Skeletal40", coll, display="ARROWS", size=2)
    ch, gal, haz = t["chassis"], t["galvanized"], t["hazard"]
    z_deck = 1.32
    xf, xr = 1.0, -11.4            # frente y cola respecto del perno rey
    axles = (-8.45, -9.76, -11.07)
    for lod in (0, 1):
        mb = K.MB()
        for sy in (-1, 1):
            K.beam(mb, (xf, sy * 0.5, z_deck - 0.25), (xr, sy * 0.5, z_deck - 0.25), 0.14, 0.4 if lod == 0 else 0.3, ch)
        # cuello de cisne delantero y travesaños con los twistlocks
        K.box(mb, (xf - 0.5, 0, z_deck - 0.15), (1.0, 2.44, 0.3), ch)
        for x in (xf - 0.1, xf - 6.06, xf - 6.25, xr + 0.1):
            K.box(mb, (x, 0, z_deck - 0.15), (0.2, 2.44, 0.3), ch)
        if lod == 0:
            for x in (-1.5, -3.5, -7.5, -9.8):
                K.beam(mb, (x, -0.5, z_deck - 0.3), (x, 0.5, z_deck - 0.3), 0.08, 0.16, ch)
            for x in (xf - 0.1, xf - 6.06, xf - 6.25, xr + 0.1):
                for sy in (-1, 1):
                    K.box(mb, (x, sy * 1.13, z_deck + 0.03), (0.16, 0.14, 0.06), gal)
            # patas de apoyo, guardabarros, paragolpes con luces y franjas reflectivas
            for sy in (-1, 1):
                K.beam(mb, (-1.6, sy * 0.95, z_deck - 0.3), (-1.6, sy * 0.95, 0.25), 0.14, 0.14, ch)
                K.box(mb, (-1.6, sy * 0.95, 0.15), (0.3, 0.3, 0.1), ch)
                K.box(mb, ((axles[0] + axles[-1]) / 2, sy * 1.0, R_WHEEL * 2 + 0.08), (4.0, 0.62, 0.05), ch)
                K.box(mb, (xr - 0.1, sy * 0.85, 0.9), (0.08, 0.3, 0.14), t["light_red"])
            K.box(mb, (xr - 0.12, 0, 0.62), (0.12, 2.3, 0.18), haz)
            K.box(mb, (0.0, 0, z_deck - 0.38), (0.25, 0.25, 0.16), gal)        # perno rey
        else:
            for x in axles:
                for sy in (-1, 1):
                    K.cylinder(mb, (x, sy * 0.68, R_WHEEL), (x, sy * 1.25, R_WHEEL), R_WHEEL, 8, t["rubber"])
        K.attach(mb.to_object(f"Trailer_Skeletal40_LOD{lod}", coll, materials=mats), root)
    specs = []
    for k, x in enumerate(axles):
        specs += [(f"Trailer_Wheel_{k + 1}L", (x, 0.92, R_WHEEL), True, 1), (f"Trailer_Wheel_{k + 1}R", (x, -0.92, R_WHEEL), True, -1)]
    wheels = add_wheels(t, coll, mats, root, specs)
    for name, x in (("Mount_40", xf - 6.096 - 0.0), ("Mount_20A", xf - 3.03), ("Mount_20B", xf - 6.25 - 3.03)):
        m = K.empty(name, coll, display="CUBE", size=0.3)
        K.set_parent(m, root, Matrix.Translation(V((x, 0, z_deck + 0.06))))
    K.ucx_box("Trailer_Bed", coll, ((xf + xr) / 2, 0, z_deck - 0.25), (xf - xr, 2.44, 0.5), parent=root)
    K.ucx_box("Trailer_Ruedas", coll, ((axles[0] + axles[-1]) / 2, 0, 0.6), (4.2, 2.5, 1.2), parent=root)
    root["largo_m"] = xf - xr
    root["eje_medio_x"] = sum(axles) / 3
    root["altura_cama_m"] = z_deck
    return root, wheels


def build_yard_tractor(t, coll, mats):
    root = K.empty("Yard_Tractor", coll, display="ARROWS", size=2)
    yel, ch, glass = t["steel_yellow"], t["chassis"], t["glass"]
    for lod in (0, 1):
        mb = K.MB()
        for sy in (-1, 1):
            K.beam(mb, (-0.9, sy * 0.42, 0.85), (3.9, sy * 0.42, 0.85), 0.14, 0.34, ch)
        # cabina desplazada (lado izquierdo), 1 asiento
        K.box(mb, (2.9, 0.5, 2.1), (1.7, 1.4, 1.9), {"+x": glass, "-x": yel, "+y": glass, "-y": glass, "+z": yel, "-z": yel})
        K.box(mb, (2.9, 0.5, 1.12), (1.8, 1.5, 0.3), yel)
        # capó del motor a la derecha, guardabarros, quinta rueda elevable con su rampa
        K.box(mb, (3.3, -0.65, 1.35), (1.4, 1.0, 0.9), yel)
        K.box(mb, (0.15, 0, 1.25), (1.3, 1.6, 0.16), ch)
        K.box(mb, (-0.5, 0, 1.05), (0.4, 1.6, 0.1), t["hazard"])
        if lod == 0:
            K.box(mb, (2.9, 0.5, 3.12), (1.9, 1.6, 0.14), yel)
            K.cylinder(mb, (2.6, 1.0, 3.2), (2.6, 1.0, 3.42), 0.12, 10, t["light_amber"])            # baliza
            K.cylinder(mb, (3.6, -0.95, 1.6), (3.6, -0.95, 3.2), 0.08, 8, t["chrome"])               # escape
            for sy in (-1, 1):
                K.box(mb, (3.98, sy * 0.95, 1.12), (0.9, 0.45, 0.06), yel)
                K.box(mb, (0.0, sy * 1.0, 1.15), (1.4, 0.55, 0.06), ch)
                K.box(mb, (4.0, sy * 0.85, 0.85), (0.06, 0.25, 0.18), t["light_white"])
                K.box(mb, (-0.95, sy * 0.85, 0.85), (0.06, 0.2, 0.15), t["light_red"])
            K.box(mb, (4.0, 0, 0.6), (0.2, 2.2, 0.3), t["hazard"])
            K.beam(mb, (-0.2, -0.3, 1.2), (0.6, -0.3, 0.9), 0.12, 0.12, t["galvanized"])               # cilindro de elevación
        else:
            for x in (0.0, 2.95):
                for sy in (-1, 1):
                    K.cylinder(mb, (x, sy * 0.75, R_WHEEL), (x, sy * 1.2, R_WHEEL), R_WHEEL, 8, t["rubber"])
        K.attach(mb.to_object(f"Yard_Tractor_LOD{lod}", coll, materials=mats), root)
    specs = [("Wheel_FL", (2.95, 0.98, R_WHEEL), False, 1), ("Wheel_FR", (2.95, -0.98, R_WHEEL), False, -1),
             ("Wheel_RL", (0.0, 0.9, R_WHEEL), True, 1), ("Wheel_RR", (0.0, -0.9, R_WHEEL), True, -1)]
    wheels = add_wheels(t, coll, mats, root, specs, steer=("Wheel_FL", "Wheel_FR"))
    hitch = K.empty("Hitch", coll, display="SPHERE", size=0.2)
    K.set_parent(hitch, root, Matrix.Translation(V((0.15, 0, 1.33))))
    K.ucx_box("YardTractor", coll, (1.5, 0, 1.5), (5.0, 2.3, 3.0), parent=root)
    root["batalla_m"] = 2.95
    root["giro_max_deg"] = 45
    root["radio_giro_min_m"] = round(2.95 / math.tan(math.radians(45)), 2)
    root["hitch"] = [0.15, 0, 1.33]
    return root, wheels


def build_yard_chassis(t, coll, mats):
    root = K.empty("Yard_Chassis40", coll, display="ARROWS", size=2)
    ch = t["chassis"]
    z_deck = 1.15
    xf, xr = 0.8, -11.6
    for lod in (0, 1):
        mb = K.MB()
        K.box(mb, ((xf + xr) / 2, 0, z_deck - 0.2), (xf - xr, 2.44, 0.4), ch)
        K.box(mb, (xf - 0.6, 0, z_deck + 0.2), (1.2, 2.44, 0.4), t["steel_yellow"])
        if lod == 0:
            for x in (xf - 0.1, xr + 0.1):
                K.box(mb, (x, 0, z_deck + 0.35), (0.2, 2.6, 0.7), t["steel_yellow"])   # guías de los extremos
            K.box(mb, (xr - 0.05, 0, 0.6), (0.1, 2.3, 0.2), t["hazard"])
        else:
            for sy in (-1, 1):
                K.cylinder(mb, (-10.3, sy * 0.68, 0.42), (-10.3, sy * 1.2, 0.42), 0.42, 8, t["rubber"])
        K.attach(mb.to_object(f"Yard_Chassis40_LOD{lod}", coll, materials=mats), root)
    wheels = add_wheels(t, coll, mats, root, [("Chassis_Wheel_L", (-10.3, 0.92, R_WHEEL), True, 1), ("Chassis_Wheel_R", (-10.3, -0.92, R_WHEEL), True, -1)])
    m = K.empty("Mount_40", coll, display="CUBE", size=0.3)
    K.set_parent(m, root, Matrix.Translation(V(((xf + xr) / 2, 0, z_deck))))
    K.ucx_box("Chassis_Bed", coll, ((xf + xr) / 2, 0, z_deck - 0.2), (xf - xr, 2.44, 0.4), parent=root)
    root["largo_m"] = xf - xr
    root["eje_medio_x"] = -10.3
    root["altura_cama_m"] = z_deck
    return root, wheels


def animate_wheels(wheels, fps=30):
    act = bpy.data.actions.new("Rodar")
    for w in wheels:
        w.animation_data_create()
        w.animation_data.action = act
    for w in wheels:
        for f, a in ((1, 0.0), (1 + fps, 2 * math.pi)):
            w.rotation_euler = (0, 0, a)
            w.keyframe_insert("rotation_euler", frame=f)
    try:
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    except AttributeError:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for kp in fc.keyframe_points:
                            kp.interpolation = "LINEAR"


def build(t, coll, mats, _tex):
    out = {}
    for fn in (build_tractor, build_trailer, build_yard_tractor, build_yard_chassis):
        root, wheels = fn(t, coll, mats)
        animate_wheels(wheels)
        out[root.name] = (root, {"moviles": [w.name for w in wheels] + [o.name for o in K.subtree(root) if o.name.startswith("Steer_")],
                                 "animaciones": ["Rodar"]})
    return out
