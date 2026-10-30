"""
Grúa pórtico de muelle (STS, ship-to-shore), clase post-Panamax. Medidas compatibles con la terminal de Logística 3D.

Marco (Blender, Z arriba, m): origen en el borde del muelle, a nivel del piso y centrado entre las patas.
  X: a lo largo del muelle (traslación del pórtico) · −Y: hacia tierra · +Y: sobre el agua.
  Patas: X = ±9 · Y = −6 (lado agua) y −34 (lado tierra): trocha de 28 m. Viga portal a 44 m.
  Pluma: vigas cajón en X = ±2,7, eje a 47,6 m, de Y = −54 (contrapluma) a +60 (alcance sobre el agua).
  Pórtico en A con ápice a 72 m sobre Y = −28.

Nodos que se mueven (origen = pivote, Z local = eje; en glTF el eje pasa a ser Y local):
  Boom_Hinge     giro de la pluma (eje X). 0 = horizontal; la pluma se levanta para el paso de los buques.
  Trolley        carro: se traslada a lo largo de la pluma (eje +Y de Blender = hacia el agua).
  Hoist_Ropes    cables de izaje: malla de 1 m hacia abajo; el visor escala su eje local según la altura del spreader.
  Spreader       spreader con su cabezal: baja por su eje local (Z local = −Z de mundo).
  Spreader_Tele_A/B  brazos telescópicos 20'/40' (eje X).
  Twistlock_1..4 conos de traba: giran 90° para trabar los esquineros.
"""
import math

import bpy
from mathutils import Matrix, Vector as V

from kit import nucleo as K
from kit.nucleo import X, Y, Z

LEG_X = 9.0
Y_SEA, Y_LAND = -6.0, -34.0
Z_PORTAL = 44.0
Z_BOOM = 47.6
GX = 2.7                    # semiseparación de las vigas de la pluma
GW, GH = 1.3, 2.8           # sección de la viga cajón
Y_BACK, Y_TIP = -54.0, 60.0
HINGE = V((0, -2.0, Z_BOOM))
APEX = (6.3, -28.0, 72.0)
Z_RAIL = Z_BOOM + GH / 2    # cara superior de las vigas (rieles del carro)
TROLLEY_PARK = -20.0        # el carro en reposo: sobre la calle de transferencia, entre las patas
SPREADER_REST = 40.0        # altura del spreader en reposo (cara superior del cabezal)
SPAN40 = 12.192 - 0.178     # distancia entre centros de esquineros (40')
SPAN20 = 6.058 - 0.178
GAUGE_W = 2.438 - 0.162


def build_structure(t, lod, coll, mats):
    """Estructura fija. lod 0 = detalle completo; 1 = cajas; 2 = siluetas."""
    mb = K.MB()
    blue, white, grey, yel = t["steel_blue"], t["steel_white"], t["steel_grey"], t["steel_yellow"]
    grat, rail, lad, gal, haz = t["grating"], t["railing"], t["ladder"], t["galvanized"], t["hazard"]
    # ---- patas (sección cajón, más ancha abajo) ----
    for sx in (-1, 1):
        for y in (Y_SEA, Y_LAND):
            if lod == 0:
                # tramo inferior más ancho y tramo superior
                K.beam(mb, (sx * LEG_X, y, 3.4), (sx * LEG_X, y, 14), 2.3, 2.3, blue)
                K.beam(mb, (sx * LEG_X, y, 14), (sx * LEG_X, y, Z_PORTAL - 1.4), 2.0, 2.0, blue)
                # placa base sobre el bogie
                K.box(mb, (sx * LEG_X, y, 3.2), (3.2, 3.0, 0.4), grey)
            else:
                K.beam(mb, (sx * LEG_X, y, 2.5 if lod == 1 else 0), (sx * LEG_X, y, Z_PORTAL - 1.4), 2.1, 2.1, blue, caps=lod == 1)
        # viga baja (sill) y diagonal entre pata de agua y de tierra
        K.beam(mb, (sx * LEG_X, Y_SEA - 1, 11), (sx * LEG_X, Y_LAND + 1, 11), 1.6, 2.2, blue)
        if lod < 2:
            K.beam(mb, (sx * LEG_X, Y_SEA - 1, 13), (sx * LEG_X, Y_LAND + 1, Z_PORTAL - 2.5), 1.0, 1.0, blue)
        # viga portal lateral (arriba, a lo largo de Y)
        K.beam(mb, (sx * LEG_X, Y_SEA + 2, Z_PORTAL), (sx * LEG_X, Y_LAND - 2, Z_PORTAL), 2.4, 3.0, blue)
    # vigas portal (a lo largo de X) del lado agua y del lado tierra
    for y in (Y_SEA, Y_LAND):
        K.box(mb, (0, y, Z_PORTAL), (2 * LEG_X + 2.3, 2.38, 2.96), blue)
        if lod == 0:
            # cartelas (knee braces) en las esquinas del pórtico
            for sx in (-1, 1):
                K.beam(mb, (sx * LEG_X, y, Z_PORTAL - 7), (sx * (LEG_X - 5), y, Z_PORTAL - 1.4), 0.8, 0.8, blue)
    # ---- pórtico en A y tensores ----
    ax, ay, az = APEX
    for sx in (-1, 1):
        top = V((sx * ax, ay, az))
        K.beam(mb, (sx * LEG_X, Y_LAND, Z_PORTAL + 1.5), top, 1.7, 1.7, blue)
        K.beam(mb, (sx * LEG_X, -12.0, Z_PORTAL + 1.5), top, 1.4, 1.4, blue)
        if lod == 0:
            # celosía entre las dos patas del pórtico en A
            K.truss(mb, (sx * LEG_X, Y_LAND, Z_PORTAL + 1.5), top, (sx * LEG_X, -12.0, Z_PORTAL + 1.5), top, 5, 0.45, blue)
        # tensores al extremo de la contrapluma (el de la pluma va en el nodo de la pluma)
        K.beam(mb, top + V((0, 0, -0.6)), (sx * GX, Y_BACK + 2, Z_RAIL), 0.55, 0.55, blue if lod < 2 else blue)
    K.box(mb, (0, ay, az), (2 * ax + 1.6, 1.6, 1.6), blue)
    if lod == 0:
        # casa de poleas del ápice y luz de balizamiento
        K.box(mb, (0, ay, az + 1.4), (4.0, 2.4, 1.4), white)
        for sx in (-1.2, 1.2):
            K.cylinder(mb, (sx - 0.15, ay + 1.2, az + 1.2), (sx + 0.15, ay + 1.2, az + 1.2), 0.9, 16, gal)
        K.box(mb, (0, ay, az + 2.4), (0.5, 0.5, 0.6), t["light_red"])
        # escalera y barandas del ápice
        K.card(mb, (-ax, ay - 0.9, az + 0.8), (ax, ay - 0.9, az + 0.8), 1.1, rail)
    # ---- contrapluma (fija): de Y_BACK a la bisagra ----
    for sx in (-1, 1):
        K.beam(mb, (sx * GX, Y_BACK, Z_BOOM), (sx * GX, HINGE.y - 0.4, Z_BOOM), GW, GH, blue)
        if lod == 0:
            K.box(mb, (sx * GX, (Y_BACK + HINGE.y) / 2, Z_RAIL + 0.08), (0.16, HINGE.y - Y_BACK, 0.16), gal)
    if lod < 2:
        for y in range(int(Y_BACK) + 3, int(HINGE.y) - 1, 6):
            K.beam(mb, (-GX + GW / 2, y, Z_BOOM - GH / 2 + 0.3), (GX - GW / 2, y, Z_BOOM - GH / 2 + 0.3), 0.5, 0.6, blue)
            if lod == 0 and y + 6 < HINGE.y - 1:
                K.beam(mb, (-GX + GW / 2, y, Z_BOOM - GH / 2 + 0.3), (GX - GW / 2, y + 6, Z_BOOM - GH / 2 + 0.3), 0.35, 0.35, blue)
    # ---- sala de máquinas sobre la contrapluma ----
    hy0, hy1, hz0, hz1, hw = -51.5, -36.5, Z_RAIL + 0.2, Z_RAIL + 6.2, 14.0
    hc = V((0, (hy0 + hy1) / 2, (hz0 + hz1) / 2))
    K.box(mb, hc, (hw, hy1 - hy0, hz1 - hz0), {"+x": t["louver"], "-x": t["louver"], "+y": t["louver"], "-y": t["louver"],
                                             "+z": grey, "-z": grey})
    if lod == 0:
        # rótulo en los costados, puerta, equipos de aire en el techo, baranda perimetral
        for sx in (-1, 1):
            p = V((sx * (hw / 2 + 0.03), hc.y, hz0 + 4.2))
            a, b = p + V((0, -sx * 6.6, -0.75)), p + V((0, sx * 6.6, -0.75))
            K.quad_trim(mb, a, b, b + V((0, 0, 1.5)), a + V((0, 0, 1.5)), t["house_side"])
        K.box(mb, (hw / 2 + 0.05, hy1 - 2.5, hz0 + 1.2), (0.1, 1.2, 2.2), grey)
        for k, y in enumerate((-49.5, -46.0, -42.5)):
            K.box(mb, (3.0, y, hz1 + 0.6), (2.2, 2.6, 1.2), grey)
        for (a, b) in (((-hw / 2, hy0, hz1), (hw / 2, hy0, hz1)), ((hw / 2, hy0, hz1), (hw / 2, hy1, hz1)),
                       ((hw / 2, hy1, hz1), (-hw / 2, hy1, hz1)), ((-hw / 2, hy1, hz1), (-hw / 2, hy0, hz1))):
            K.card(mb, a, b, 1.1, rail)
    # ---- pasarelas a lo largo de la contrapluma ----
    if lod == 0:
        for sx in (-1, 1):
            x = sx * (GX + GW / 2 + 0.55)
            K.box(mb, (x, (Y_BACK + HINGE.y) / 2, Z_BOOM - 0.6), (1.0, HINGE.y - Y_BACK, 0.08), grat)
            K.card(mb, (x + sx * 0.5, Y_BACK, Z_BOOM - 0.56), (x + sx * 0.5, HINGE.y, Z_BOOM - 0.56), 1.1, rail)
        # escaleras marineras en dos patas del lado tierra y descansos
        for sx in (-1, 1):
            p0 = V((sx * (LEG_X + 1.02), Y_LAND, 4.0))
            for z0 in range(4, int(Z_PORTAL) - 4, 10):
                a = V((sx * (LEG_X + 1.06), Y_LAND - 0.45, z0))
                b = V((sx * (LEG_X + 1.06), Y_LAND - 0.45, min(z0 + 10, Z_PORTAL - 1.6)))
                # tarjeta vertical de 0,9 m de ancho: U a lo largo de la escalera
                w = V((0, 0.9, 0))
                mb.face([a, b, b + w, a + w], [lad.uv(0, 0), lad.uv((b - a).length, 0), lad.uv((b - a).length, 1), lad.uv(0, 1)], lad.mat)
                mb.face([a + w, b + w, b, a], [lad.uv(0, 1), lad.uv((b - a).length, 1), lad.uv((b - a).length, 0), lad.uv(0, 0)], lad.mat)
                K.box(mb, (sx * (LEG_X + 1.9), Y_LAND, z0 + 10), (1.6, 2.4, 0.08), grat)
                K.card(mb, (sx * (LEG_X + 2.7), Y_LAND - 1.2, z0 + 10), (sx * (LEG_X + 2.7), Y_LAND + 1.2, z0 + 10), 1.1, rail)
        # pasarela sobre las vigas portal
        for y in (Y_SEA, Y_LAND):
            K.card(mb, (-LEG_X - 1.2, y - 1.2, Z_PORTAL + 1.5), (LEG_X + 1.2, y - 1.2, Z_PORTAL + 1.5), 1.1, rail)
            K.card(mb, (-LEG_X - 1.2, y + 1.2, Z_PORTAL + 1.5), (LEG_X + 1.2, y + 1.2, Z_PORTAL + 1.5), 1.1, rail)
        # tablero con el número de grúa (lado tierra) y cartel de la terminal (lado agua)
        b = t["board_01"]
        p = V((0, Y_LAND - 1.22, Z_PORTAL - 0.2))
        K.quad_trim(mb, p + V((-2.5, 0, -1.5)), p + V((2.5, 0, -1.5)), p + V((2.5, 0, 1.5)), p + V((-2.5, 0, 1.5)), b)
        p = V((0, Y_SEA + 1.22, Z_PORTAL - 0.2))
        K.quad_trim(mb, p + V((LEG_X - 1.4, 0, -1.2)), p + V((-LEG_X + 1.4, 0, -1.2)), p + V((-LEG_X + 1.4, 0, 1.2)), p + V((LEG_X - 1.4, 0, 1.2)), t["banner"])
        # reflectores bajo la viga portal y franjas de peligro en las patas
        for y in (Y_SEA, Y_LAND):
            for x in (-5, 0, 5):
                K.box(mb, (x, y, Z_PORTAL - 1.62), (1.6, 0.7, 0.25), t["light_white"])
        for sx in (-1, 1):
            for y in (Y_SEA, Y_LAND):
                K.box(mb, (sx * LEG_X, y, 5.5), (2.36, 2.36, 1.2), haz)
        # carrete del cable de alimentación (lado tierra) y bandeja
        K.cylinder(mb, (LEG_X + 1.5, Y_LAND - 1.6, 8.0), (LEG_X + 3.0, Y_LAND - 1.6, 8.0), 2.6, 24, t["steel_grey"])
        K.cylinder(mb, (LEG_X + 1.3, Y_LAND - 1.6, 8.0), (LEG_X + 3.2, Y_LAND - 1.6, 8.0), 0.5, 10, gal)
    # ---- bogies: 8 ruedas por esquina sobre el riel ----
    for sx in (-1, 1):
        for y in (Y_SEA, Y_LAND):
            cx = sx * LEG_X
            if lod == 2:
                K.box(mb, (cx, y, 1.5), (9.5, 1.6, 3.0), grey)
                continue
            K.box(mb, (cx, y, 2.55), (9.6, 1.4, 1.1), yel)          # balancín principal
            if lod == 0:
                for k in (-1, 1):
                    K.box(mb, (cx + k * 2.4, y, 1.55), (4.6, 1.2, 0.8), yel)
                    K.box(mb, (cx + k * 2.4, y, 2.05), (0.6, 0.8, 0.4), grey)
                for k in range(8):
                    wx = cx - 4.2 + k * 1.2
                    K.cylinder(mb, (wx, y - 0.18, 0.48), (wx, y + 0.18, 0.48), 0.45, 14, grey)
                for k in (-1, 1):
                    K.box(mb, (cx + k * 5.0, y, 1.3), (0.5, 1.0, 0.8), t["rubber"])   # topes
                K.box(mb, (cx, y, 1.55 + 0.75), (0.5, 1.5, 0.4), t["steel_grey"])     # perno de tormenta
            else:
                K.box(mb, (cx, y, 1.0), (9.4, 1.1, 1.6), grey)
    return mb.to_object(f"STS_Structure_LOD{lod}", coll, materials=mats)


def build_boom(t, lod, coll, mats):
    """Pluma (lado agua) desde la bisagra hasta la punta, con su pasarela, luces y tensores delanteros."""
    mb = K.MB()
    blue, gal, grat, rail = t["steel_blue"], t["galvanized"], t["grating"], t["railing"]
    y0 = HINGE.y + 0.4
    for sx in (-1, 1):
        if lod == 0:
            K.beam(mb, (sx * GX, y0, Z_BOOM), (sx * GX, Y_TIP - 6, Z_BOOM), GW, GH, blue)
            # punta ahusada
            mb_pts = None
            K.beam(mb, (sx * GX, Y_TIP - 6, Z_BOOM + 0.3), (sx * GX, Y_TIP, Z_BOOM + 0.6), GW, GH * 0.55, blue)
            K.box(mb, (sx * GX, (y0 + Y_TIP) / 2, Z_RAIL + 0.08), (0.16, Y_TIP - y0, 0.16), gal)
            x = sx * (GX + GW / 2 + 0.55)
            K.box(mb, (x, (y0 + Y_TIP - 4) / 2, Z_BOOM - 0.6), (1.0, Y_TIP - 4 - y0, 0.08), grat)
            K.card(mb, (x + sx * 0.5, y0, Z_BOOM - 0.56), (x + sx * 0.5, Y_TIP - 4, Z_BOOM - 0.56), 1.1, rail)
        else:
            K.beam(mb, (sx * GX, y0, Z_BOOM), (sx * GX, Y_TIP, Z_BOOM + 0.3), GW, GH, blue)
    if lod < 2:
        # arriostramiento inferior en planta (celosía)
        for y in range(int(y0) + 3, int(Y_TIP) - 2, 6):
            K.beam(mb, (-GX + GW / 2, y, Z_BOOM - GH / 2 + 0.3), (GX - GW / 2, y, Z_BOOM - GH / 2 + 0.3), 0.5, 0.6, blue)
            if lod == 0 and y + 6 < Y_TIP - 2:
                K.beam(mb, (-GX + GW / 2, y, Z_BOOM - GH / 2 + 0.3), (GX - GW / 2, y + 6, Z_BOOM - GH / 2 + 0.3), 0.35, 0.35, blue)
    if lod == 0:
        # poleas de la punta, luz roja y reflectores bajo la pluma
        for sx in (-1.0, 1.0):
            K.cylinder(mb, (sx - 0.12, Y_TIP - 1.0, Z_RAIL + 0.6), (sx + 0.12, Y_TIP - 1.0, Z_RAIL + 0.6), 0.7, 16, gal)
        K.box(mb, (0, Y_TIP - 0.5, Z_RAIL + 1.2), (2.6, 1.2, 0.3), blue)
        K.box(mb, (0, Y_TIP - 0.5, Z_RAIL + 1.6), (0.4, 0.4, 0.5), t["light_red"])
        for y in (12, 26, 40, 54):
            K.box(mb, (0, y, Z_BOOM - GH / 2 - 0.1), (1.8, 0.8, 0.25), t["light_white"])
        # cables del carro (tracción) a lo largo de las vigas
        for sx in (-1, 1):
            K.tube_path(mb, [(sx * (GX - 0.4), y0, Z_RAIL + 0.35), (sx * (GX - 0.4), Y_TIP - 1.0, Z_RAIL + 0.35)], 0.03, 4, t["rope"], caps=False)
    return mb.to_object(f"STS_Boom_LOD{lod}", coll, materials=mats)


def build_forestays(t, lod, coll, mats):
    mb = K.MB()
    ax, ay, az = APEX
    for sx in (-1, 1):
        top = V((sx * ax, ay, az - 0.6))
        K.beam(mb, top, (sx * GX, Y_TIP - 2, Z_RAIL), 0.6, 0.6, t["steel_blue"])
        if lod < 2:
            K.beam(mb, top, (sx * GX, 22.0, Z_RAIL), 0.5, 0.5, t["steel_blue"])
    return mb.to_object(f"STS_Forestays_LOD{lod}", coll, materials=mats)


def build_trolley(t, lod, coll, mats, y=TROLLEY_PARK):
    """Carro sobre los rieles de la pluma, con poleas y la cabina del operador colgando hacia el agua."""
    mb = K.MB()
    yel, grey, gal, glass = t["steel_yellow"], t["steel_grey"], t["galvanized"], t["glass"]
    z0 = Z_RAIL + 0.2
    K.box(mb, (0, y, z0 + 1.1), (2 * GX + 1.6, 7.0, 1.6), yel)
    if lod == 0:
        for sx in (-1, 1):
            for dy in (-2.6, -0.9, 0.9, 2.6):
                K.cylinder(mb, (sx * GX - 0.2, y + dy, z0 + 0.3), (sx * GX + 0.2, y + dy, z0 + 0.3), 0.32, 12, grey)
            K.box(mb, (sx * GX, y, z0 + 0.55), (0.9, 6.6, 0.5), yel)
        # poleas del izaje (4) y del carro
        for sx in (-0.7, 0.7):
            for dy in (-1.1, 1.1):
                K.cylinder(mb, (sx - 0.12, y + dy, z0 + 2.2), (sx + 0.12, y + dy, z0 + 2.2), 0.55, 16, gal)
        K.box(mb, (0, y, z0 + 1.95), (1.8, 3.2, 0.3), grey)
        # baranda y escalerita de acceso a la cabina
        K.card(mb, (-GX - 0.8, y - 3.5, z0 + 1.9), (GX + 0.8, y - 3.5, z0 + 1.9), 1.0, t["railing"])
    # cabina del operador: cuelga bajo las vigas, hacia el agua
    cy, cz = y + 3.4, Z_BOOM - GH / 2 - 1.5
    K.beam(mb, (0.0, y + 2.6, z0), (0.0, cy - 0.6, cz + 1.2), 0.35, 0.35, grey)
    K.box(mb, (0, cy, cz), (2.6, 2.4, 2.6), {"+y": glass, "-z": glass, "+x": glass, "-x": glass, "-y": t["steel_white"], "+z": t["steel_white"]})
    if lod == 0:
        K.box(mb, (0, cy, cz + 1.4), (2.8, 2.6, 0.2), t["steel_white"])
        K.box(mb, (0, cy + 1.25, cz - 0.6), (2.0, 0.1, 0.25), t["light_white"])
    return mb.to_object(f"STS_Trolley_LOD{lod}", coll, materials=mats)


def build_ropes(t, coll, mats):
    """4 cables de 1 m (de z = 0 a z = −1 en el marco del nodo): el visor los escala con la altura del spreader."""
    mb = K.MB()
    for sx in (-0.7, 0.7):
        for dy in (-1.1, 1.1):
            K.tube_path(mb, [(sx, dy, 0.0), (sx, dy, -1.0)], 0.035, 5, t["rope"], caps=False)
    return mb.to_object("STS_Hoist_Ropes", coll, materials=mats, sharp_deg=None)


def build_spreader(t, lod, coll, mats, z_top, y=TROLLEY_PARK):
    """Cabezal + spreader telescópico (cuerpo central). Los brazos y twistlocks van en nodos aparte."""
    mb = K.MB()
    yel, grey, gal = t["steel_yellow"], t["steel_grey"], t["galvanized"]
    # cabezal con 4 poleas
    K.box(mb, (0, y, z_top - 0.45), (2.0, 3.0, 0.9), yel)
    if lod == 0:
        for sx in (-0.7, 0.7):
            for dy in (-1.1, 1.1):
                K.cylinder(mb, (sx - 0.1, y + dy, z_top - 0.1), (sx + 0.1, y + dy, z_top - 0.1), 0.45, 12, gal)
    K.box(mb, (0, y, z_top - 1.25), (6.2, 2.3, 0.7), yel)              # cuerpo central
    if lod == 0:
        K.box(mb, (0, y, z_top - 0.8), (2.2, 1.6, 0.25), grey)         # bomba hidráulica
        K.box(mb, (2.5, y + 1.25, z_top - 1.25), (0.8, 0.12, 0.4), t["hazard"])
        K.box(mb, (-2.5, y - 1.25, z_top - 1.25), (0.8, 0.12, 0.4), t["hazard"])
    return mb.to_object(f"STS_Spreader_LOD{lod}", coll, materials=mats)


def build_tele(t, coll, mats, sx, z_top, y=TROLLEY_PARK):
    """Brazo telescópico (se desliza en X) con el travesaño de punta; extendido a 40'."""
    mb = K.MB()
    yel = t["steel_yellow"]
    xe = sx * SPAN40 / 2
    K.beam(mb, (sx * 2.6, y - 0.55, z_top - 1.25), (xe, y - 0.55, z_top - 1.25), 0.5, 0.45, yel)
    K.beam(mb, (sx * 2.6, y + 0.55, z_top - 1.25), (xe, y + 0.55, z_top - 1.25), 0.5, 0.45, yel)
    K.box(mb, (xe, y, z_top - 1.3), (0.55, GAUGE_W + 0.5, 0.6), yel)
    # flippers (guías) en las esquinas
    for dy in (-1, 1):
        K.box(mb, (xe + sx * 0.25, y + dy * (GAUGE_W / 2 + 0.25), z_top - 1.9), (0.08, 0.5, 0.9), t["steel_grey"])
    return mb.to_object(f"STS_Spreader_Tele_{'A' if sx > 0 else 'B'}", coll, materials=mats)


def build_twistlock(t, coll, mats, p):
    mb = K.MB()
    p = V(p)
    K.cylinder(mb, p + V((0, 0, 0.0)), p + V((0, 0, -0.12)), 0.05, 8, t["galvanized"])
    # cono de traba (forma de ojo de cerradura, aquí una caja girada) bajo la placa
    K.box(mb, p + V((0, 0, -0.17)), (0.12, 0.06, 0.08), t["chrome"])
    return mb.to_object("STS_Twistlock", coll, materials=mats, sharp_deg=None)


def build(t, coll, mats):
    root = K.empty("STS_Crane", coll, display="ARROWS", size=6)
    # estructura fija con 3 LOD
    for lod in (0, 1, 2):
        K.attach(build_structure(t, lod, coll, mats), root)
    # bisagra de la pluma
    hinge = K.empty("Boom_Hinge", coll, size=2)
    K.set_parent(hinge, root, Matrix.Translation(HINGE))
    K.freeze_pivot(hinge, HINGE, X)
    for lod in (0, 1, 2):
        K.attach(build_boom(t, lod, coll, mats), hinge)
    stays = K.empty("Forestays", coll, size=2)
    K.set_parent(stays, root, Matrix.Identity(4))
    for lod in (0, 1, 2):
        K.attach(build_forestays(t, lod, coll, mats), stays)
    # carro → cables, spreader → brazos → twistlocks
    trolley = K.empty("Trolley", coll, display="CUBE", size=1.5)
    K.set_parent(trolley, root, Matrix.Translation(V((0, TROLLEY_PARK, Z_RAIL))))
    for lod in (0, 1):
        K.attach(build_trolley(t, lod, coll, mats), trolley)
    # pivote calculado desde la geometría del carro: centro en X, eje de las ruedas en Y, cara del riel en Z
    lo, hi = K.bbox_world(trolley.children[0])
    K.freeze_pivot(trolley, V(((lo.x + hi.x) / 2, TROLLEY_PARK, Z_RAIL)), Y)
    z_sheave = Z_RAIL + 2.2
    ropes = build_ropes(t, coll, mats)
    ropes.location = (0, TROLLEY_PARK, z_sheave)
    K.set_parent(ropes, trolley, Matrix.Translation(V((0, TROLLEY_PARK, z_sheave))))
    ropes["escala_eje"] = "Y local en glTF = largo del cable (m)"
    ropes.scale = (1, 1, z_sheave - SPREADER_REST)
    spreader = K.empty("Spreader", coll, display="CUBE", size=1.0)
    K.set_parent(spreader, trolley, Matrix.Translation(V((0, TROLLEY_PARK, SPREADER_REST))))
    for lod in (0, 1):
        K.attach(build_spreader(t, lod, coll, mats, SPREADER_REST), spreader)
    K.freeze_pivot(spreader, V((0, TROLLEY_PARK, SPREADER_REST)), -Z, x_hint=X)
    for sx in (1, -1):
        tele = build_tele(t, coll, mats, sx, SPREADER_REST)
        K.set_parent(tele, spreader, tele.matrix_world.copy())
        tele.data.transform(Matrix.Identity(4))
        K.freeze_pivot(tele, V((sx * 2.6, TROLLEY_PARK, SPREADER_REST - 1.25)), V((sx, 0, 0)))
        for dy in (-1, 1):
            p = V((sx * SPAN40 / 2, TROLLEY_PARK + dy * GAUGE_W / 2, SPREADER_REST - 1.55))
            tw = build_twistlock(t, coll, mats, p)
            tw.name = f"Twistlock_{'A' if sx > 0 else 'B'}{1 if dy < 0 else 2}"
            K.set_parent(tw, tele, Matrix.Identity(4))
            K.auto_pivot(tw, "twistlock")
    # colisiones (convexas): patas, vigas, pórtico en A, sala de máquinas, bogies, carro y spreader
    cc = coll
    for sx in (-1, 1):
        for y, n in ((Y_SEA, "Mar"), (Y_LAND, "Tierra")):
            K.ucx_box(f"Pata_{n}_{'D' if sx > 0 else 'I'}", cc, (sx * LEG_X, y, Z_PORTAL / 2), (2.3, 2.3, Z_PORTAL), parent=root)
            K.ucx_box(f"Bogie_{n}_{'D' if sx > 0 else 'I'}", cc, (sx * LEG_X, y, 1.5), (10.0, 1.6, 3.0), parent=root)
        K.ucx_box(f"Viga_Baja_{'D' if sx > 0 else 'I'}", cc, (sx * LEG_X, (Y_SEA + Y_LAND) / 2, 11), (1.6, 30, 2.2), parent=root)
        K.ucx_box(f"Contrapluma_{'D' if sx > 0 else 'I'}", cc, (sx * GX, (Y_BACK + HINGE.y) / 2, Z_BOOM), (GW, HINGE.y - Y_BACK, GH), parent=root)
        K.ucx_box(f"Pluma_{'D' if sx > 0 else 'I'}", cc, (sx * GX, (HINGE.y + Y_TIP) / 2, Z_BOOM), (GW, Y_TIP - HINGE.y, GH), parent=hinge)
    for y, n in ((Y_SEA, "Mar"), (Y_LAND, "Tierra")):
        K.ucx_box(f"Portal_{n}", cc, (0, y, Z_PORTAL), (2 * LEG_X + 2.4, 2.4, 3.0), parent=root)
    K.ucx_box("Sala_Maquinas", cc, (0, -44.0, Z_RAIL + 3.2), (14, 15, 6), parent=root)
    K.ucx_box("Carro", cc, (0, TROLLEY_PARK, Z_RAIL + 1.3), (2 * GX + 1.6, 7.0, 2.2), parent=trolley)
    K.ucx_box("Spreader", cc, (0, TROLLEY_PARK, SPREADER_REST - 1.0), (SPAN40 + 0.5, GAUGE_W + 0.6, 1.6), parent=spreader)
    # datos para el visor
    root["trocha_m"] = 28.0
    root["altura_portal_m"] = Z_PORTAL
    root["alcance_m"] = Y_TIP
    root["contrapluma_m"] = -Y_BACK
    root["carro"] = {"reposo_y": TROLLEY_PARK, "min_y": Y_BACK + 10, "max_y": Y_TIP - 4, "riel_z": Z_RAIL}
    root["spreader"] = {"reposo_z": SPREADER_REST, "min_z": 2.0, "polea_z": z_sheave}
    root["tablero"] = {"columnas": 6, "du": 168 / 2048, "dv": 100 / 2048, "numeros": 12}
    root["lod_distancias_m"] = [0, 180, 700]
    return root, {"trolley": trolley, "spreader": spreader, "ropes": ropes, "hinge": hinge, "stays": stays}


def animate(parts, fps=30):
    """Ciclo de descarga (24 s): baja sobre el buque, traba, sube, viaja a tierra, baja, destraba, sube y vuelve."""
    trolley, spreader, ropes = parts["trolley"], parts["spreader"], parts["ropes"]
    tw = [o for o in K.subtree(spreader) if o.name.startswith("Twistlock_")]
    act = bpy.data.actions.new("Ciclo_Descarga")
    sc = bpy.context.scene
    sc.render.fps = fps
    rest_t = trolley.location.copy()
    rest_s = spreader.location.copy()
    # keys: (segundo, posición del carro en Y de mundo, altura de la cara superior del cabezal, traba)
    keys = [(0, TROLLEY_PARK, SPREADER_REST, 0), (4, 38.0, 36.0, 0), (7, 38.0, 18.0, 0), (8, 38.0, 18.0, 1),
            (11, 38.0, 36.0, 1), (15, -20.0, 36.0, 1), (18, -20.0, 7.0, 1), (19, -20.0, 7.0, 0), (21, -20.0, 30.0, 0),
            (24, TROLLEY_PARK, SPREADER_REST, 0)]
    z_sheave = Z_RAIL + 2.2
    inv_t = trolley.matrix_world.to_3x3().inverted()
    for ob in [trolley, spreader, ropes] + tw:
        ob.animation_data_create()
        ob.animation_data.action = act
    for sec, ty, sz, lock in keys:
        f = 1 + sec * fps
        # el carro: su Z local apunta a +Y de mundo
        trolley.location = rest_t + V((0, ty - TROLLEY_PARK, 0))          # el padre (raíz) no está girado
        trolley.keyframe_insert("location", frame=f)
        spreader.location = rest_s + inv_t @ V((0, 0, sz - SPREADER_REST))   # en el marco (girado) del carro
        spreader.keyframe_insert("location", frame=f)
        ropes.scale = (1, 1, max(0.05, z_sheave - sz))
        ropes.keyframe_insert("scale", frame=f)
        for o in tw:
            o.rotation_euler = (0, 0, math.pi / 2 * lock)
            o.keyframe_insert("rotation_euler", frame=f)
    sc.frame_start, sc.frame_end = 1, 1 + 24 * fps
    sc.frame_set(1)
    return act
