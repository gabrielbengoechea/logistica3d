"""
Buques portacontenedores paramétricos: Feeder, Panamax y Post-Panamax (las tres clases del simulador).

Marco (Blender): origen en la flotación, en el medio de la eslora y en crujía. Proa hacia +X, babor +Y, arriba +Z.
El casco se genera por estaciones: semimanga y(u, z) con pantoque, finos de proa con abanico (flare), bulbo, popa con
espejo y corte para la hélice. Sobre cubierta: brazolas y tapas de bodega por bahía de 40', puentes de trinca,
guías de celda en las bandas, castillo con rompeolas, superestructura con puente y alerones, chimenea, mástil,
bote salvavidas de caída libre, timón y hélice.

Nodos móviles: Rudder (mecha, eje Z), Propeller (eje X). Animación «Navegacion»: hélice girando y timón a la vía.
Materiales: M_Buque (+ M_Buque_Alpha para puentes de trinca y barandas), M_Buque_Banda (franja de la chimenea:
el visor le pone el color de la naviera) y M_Buque_Nombre (nombre en proa y popa: el visor le pone un canvas).
El visor escala X para llevar el modelo a la eslora de cada buque (la manga de cada clase es fija).
"""
import math

import bpy
from mathutils import Matrix, Vector as V

from kit import nucleo as K
from kit import texturas as T

CLASSES = {
    "Feeder":      dict(L=170.0, B=27.0, T=8.5, D=14.5, tiers=6, hull="hull_green"),
    "Panamax":     dict(L=262.0, B=32.2, T=11.5, D=19.5, tiers=8, hull="hull_navy"),
    "PostPanamax": dict(L=300.0, B=46.0, T=13.0, D=24.5, tiers=9, hull="hull_charcoal"),
}
BAY = 13.2          # paso de bahía de 40' sobre cubierta (contenedor + puente de trinca)
ROW = 2.55          # paso de fila (2,438 + holgura de guía)
COAMING, HATCH = 1.8, 0.6
Z_TR = 1.2          # canto inferior del espejo de popa sobre la flotación


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


class Hull:
    def __init__(self, P):
        self.P = P
        L, B, Tt, D = P["L"], P["B"], P["T"], P["D"]
        self.L, self.B, self.T, self.D = L, B, Tt, D
        self.rb = min(0.12 * B, 0.85 * Tt)

    def x_end(self, z):
        L, Tt = self.L, self.T
        if z >= 0:
            return L / 2 + 0.10 * z
        bulb = 0.032 * L * math.sqrt(max(0.0, 1 - ((z + 0.55 * Tt) / (0.38 * Tt)) ** 2))
        return L / 2 - 0.02 * L * (-z / Tt) + bulb

    def x_aft(self, z):
        L, Tt = self.L, self.T
        if z >= Z_TR:
            return -L / 2 + 0.02 * (z - Z_TR)
        return -L / 2 + 0.07 * L * ((Z_TR - z) / (Z_TR + Tt)) ** 1.6

    def y(self, u, z):
        B2, Tt, D, rb = self.B / 2, self.T, self.D, self.rb
        zb = -Tt + rb
        ys = B2 - rb + math.sqrt(max(0.0, rb * rb - (zb - z) ** 2)) if z < zb else B2
        ub = 0.76
        if u > ub:
            t = (u - ub) / (1 - ub)
            low = clamp(-z / Tt)
            bulb = math.exp(-((z + 0.55 * Tt) / (0.3 * Tt)) ** 2)
            p = 1.5 * (1 - 0.4 * low) * (1 + 0.5 * bulb)
            fb = max(0.0, 1 - t ** p) ** (1.15 + 0.8 * low * (1 - bulb))
            fb = fb + (1 - fb) * 0.30 * clamp(z / D) * (1 - t ** 3)        # abanico de proa (se cierra en la roda)
        else:
            fb = 1.0
        us = 0.20
        if u < us:
            w = clamp((Z_TR - z) / (Z_TR + Tt)) ** 0.8
            fs = (1 - w) + w * (u / us) ** 0.75
        else:
            fs = 1.0
        return ys * fb * fs

    def zrows(self, lod):
        Tt, D, rb = self.T, self.D, self.rb
        if lod == 2:
            return [-Tt, -0.6, 0.9, D]
        bil = [-Tt + rb * (1 - math.cos(math.radians(a))) for a in ((0, 30, 60, 90) if lod == 0 else (0, 90))]
        mid = [-0.6 * Tt, -0.6, 0.9, 0.35 * D, 0.7 * D, D] if lod == 0 else [-0.6, 0.9, 0.5 * D, D]
        return sorted(set([round(z, 4) for z in bil + mid]))


def zone(z0, z1, H, t):
    zc = (z0 + z1) / 2
    if zc < -0.6:
        return t["hull_red"], -H.T, -0.6
    if zc < 0.9:
        return t["boot_black"], -0.6, 0.9
    return t[H.P["hull"]], 0.9, H.D


def build_hull(mb, H, t, lod):
    nu = {0: 64, 1: 26, 2: 12}[lod]
    zs = H.zrows(lod)
    us = [(i / nu) ** 1.0 for i in range(nu + 1)]
    # más estaciones en los finos
    us = sorted(set(us + ([0.03, 0.06, 0.1, 0.14, 0.86, 0.9, 0.93, 0.96, 0.98] if lod == 0 else [])))
    P, S = [], []
    for u in us:
        rowp, rows = [], []
        for z in zs:
            x = H.x_aft(z) + u * (H.x_end(z) - H.x_aft(z))
            y = H.y(u, z)
            rowp.append(V((x, y, z)))
            rows.append(V((x, -y, z)))
        P.append(rowp)
        S.append(rows)
    for i in range(len(us) - 1):
        for j in range(len(zs) - 1):
            tr, lo, hi = zone(zs[j], zs[j + 1], H, t)
            tv = lambda z: (z - lo) / (hi - lo)
            a, b, c, d = P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]
            mb.face([a, d, c, b], [tr.uv(a.x, tv(a.z)), tr.uv(d.x, tv(d.z)), tr.uv(c.x, tv(c.z)), tr.uv(b.x, tv(b.z))], tr.mat)
            a, b, c, d = S[i][j], S[i + 1][j], S[i + 1][j + 1], S[i][j + 1]
            mb.face([a, b, c, d], [tr.uv(-a.x, tv(a.z)), tr.uv(-b.x, tv(b.z)), tr.uv(-c.x, tv(c.z)), tr.uv(-d.x, tv(d.z))], tr.mat)
    # fondo plano, cubierta y espejo
    red, deck = t["hull_red"], t["deck"]
    for i in range(len(us) - 1):
        a, b, c, d = P[i][0], P[i + 1][0], S[i + 1][0], S[i][0]
        mb.face([a, b, c, d], [red.uv(a.x, 0), red.uv(b.x, 0), red.uv(c.x, 0.05), red.uv(d.x, 0.05)], red.mat)
        top = len(zs) - 1
        a, b, c, d = S[i][top], S[i + 1][top], P[i + 1][top], P[i][top]
        mb.face([a, b, c, d], [deck.uv(a.x, 0), deck.uv(b.x, 0), deck.uv(c.x, 1), deck.uv(d.x, 1)], deck.mat)
    for j in range(len(zs) - 1):
        tr, lo, hi = zone(zs[j], zs[j + 1], H, t)
        tv = lambda z: (z - lo) / (hi - lo)
        a, b, c, d = S[0][j], S[0][j + 1], P[0][j + 1], P[0][j]
        if (d - a).length < 1e-4 and (c - b).length < 1e-4:
            continue
        mb.face([a, b, c, d], [tr.uv(a.y, tv(a.z)), tr.uv(b.y, tv(b.z)), tr.uv(c.y, tv(c.z)), tr.uv(d.y, tv(d.z))], tr.mat)
    return P, S, us, zs


def deckhouse_x(H):
    """Popa de la superestructura y su largo."""
    L = H.L
    x0 = -L / 2 + 0.055 * L
    return x0, 16.0 + 0.02 * L


def cargo_bays(H):
    x0, ln = deckhouse_x(H)
    xa = x0 + ln + 6.0
    xb = H.L / 2 - 0.15 * H.L
    n = int((xb - xa) // BAY)
    bays = [xa + BAY / 2 + k * BAY for k in range(n)]
    rows = max(3, int((H.B - 2.2) // ROW))
    return bays, rows


def build_topside(mb, H, t, lod):
    """Todo lo que va sobre la cubierta principal (sin el casco)."""
    D, B = H.D, H.B
    bays, rows = cargo_bays(H)
    hw = rows * ROW + 0.6
    zc = D + COAMING
    if lod == 2:
        K.box(mb, ((bays[0] + bays[-1]) / 2, 0, D + COAMING / 2 + 0.3), (bays[-1] - bays[0] + BAY, hw, COAMING + 0.6), t["hatch"])
    else:
        for x in bays:
            K.box(mb, (x, 0, D + COAMING / 2), (BAY - 1.6, hw - 0.4, COAMING), t["deck"], skip=("-z",))
            K.box(mb, (x, 0, zc + HATCH / 2), (BAY - 1.2, hw, HATCH), t["hatch"], skip=("-z",))
    if lod == 0:
        lash, cg, grat = t["lashing"], t["cellguide"], t["railing"]
        for k, x in enumerate(bays + [bays[-1] + BAY]):
            xe = x - BAY / 2
            # puente de trinca: dos niveles, plataformas y postes
            for z in (zc + HATCH, zc + HATCH + 2.6):
                K.box(mb, (xe, 0, z + 0.05), (1.0, hw, 0.1), t["cellguide"])
            for y in (-hw / 2, -hw / 6, hw / 6, hw / 2):
                K.beam(mb, (xe, y, zc + HATCH), (xe, y, zc + HATCH + 5.4), 0.25, 0.25, cg)
            for xx in (xe - 0.5, xe + 0.5):
                mb.face([V((xx, -hw / 2, zc + HATCH)), V((xx, hw / 2, zc + HATCH)), V((xx, hw / 2, zc + HATCH + 5.2)), V((xx, -hw / 2, zc + HATCH + 5.2))],
                        [lash.uv(0, 0), lash.uv(hw, 0), lash.uv(hw, 1), lash.uv(0, 1)], lash.mat)
                mb.face([V((xx, hw / 2, zc + HATCH)), V((xx, -hw / 2, zc + HATCH)), V((xx, -hw / 2, zc + HATCH + 5.2)), V((xx, hw / 2, zc + HATCH + 5.2))],
                        [lash.uv(hw, 0), lash.uv(0, 0), lash.uv(0, 1), lash.uv(hw, 1)], lash.mat)
            # guías de celda en las bandas (ángulos verticales)
            for y in (-hw / 2 - 0.3, hw / 2 + 0.3):
                K.beam(mb, (xe, y, D), (xe, y, zc + HATCH + 3.0), 0.3, 0.3, cg)
        # barandas a lo largo de la borda
        x0, ln = deckhouse_x(H)
        for sy in (-1, 1):
            K.card(mb, (x0, sy * (B / 2 - 0.2), D), (H.L / 2 - 0.15 * H.L, sy * (B / 2 - 0.2), D), 1.1, grat)
    # castillo de proa con rompeolas
    xf = H.L / 2 - 0.15 * H.L
    u_f = 0.9
    zf = D + 2.6
    yf = H.y(0.86, D) * 0.98
    # castillo: prolonga el casco 2,6 m hacia arriba siguiendo su contorno desde u_f hasta la roda
    u_f = (xf - H.x_aft(D)) / (H.x_end(D) - H.x_aft(D))
    n = 12 if lod == 0 else 5
    outline = []
    for k in range(n + 1):
        u = u_f + (1 - u_f) * k / n
        x = H.x_aft(D) + u * (H.x_end(D) - H.x_aft(D)) + 0.10 * 2.6 * (k / n) ** 2
        outline.append(V((x, H.y(u, D) * (1 + 0.02 * k / n), 0)))
    tr = t[H.P["hull"]]
    hz = 2.6
    for a, b in zip(outline, outline[1:]):
        for sy in (1, -1):
            A, B_ = V((a.x, sy * a.y, D)), V((b.x, sy * b.y, D))
            q = [A, B_, B_ + V((0, 0, hz)), A + V((0, 0, hz))]
            uv = [tr.uv(A.x, 0.85), tr.uv(B_.x, 0.85), tr.uv(B_.x, 1), tr.uv(A.x, 1)]
            if sy > 0:
                mb.face([q[0], q[3], q[2], q[1]], [uv[0], uv[3], uv[2], uv[1]], tr.mat)
            else:
                mb.face(q, uv, tr.mat)
    deck = t["deck"]
    top = [V((p.x, p.y, D + hz)) for p in outline] + [V((p.x, -p.y, D + hz)) for p in reversed(outline)]
    mb.face(top[::-1] if False else [V((p.x, -p.y, D + hz)) for p in outline] + [V((p.x, p.y, D + hz)) for p in reversed(outline)],
            [deck.uv(p.x, 0.5 - p.y / H.B) for p in outline] + [deck.uv(p.x, 0.5 + p.y / H.B) for p in reversed(outline)], deck.mat)
    a0 = outline[0]
    mb.face([V((a0.x, -a0.y, D)), V((a0.x, -a0.y, D + hz)), V((a0.x, a0.y, D + hz)), V((a0.x, a0.y, D))],
            [tr.uv(-a0.y, 0.85), tr.uv(-a0.y, 1), tr.uv(a0.y, 1), tr.uv(a0.y, 0.85)], tr.mat)
    if lod < 2:
        # rompeolas en V
        for sy in (-1, 1):
            a = V((xf + 1.0, sy * (yf - 0.5), D))
            b = V((xf + 7.0, 0, D))
            h = 4.5
            if sy > 0:
                mb.face([a, b, b + V((0, 0, h)), a + V((0, 0, h))], [t["super_plain"].uv(0, 0), t["super_plain"].uv(8, 0), t["super_plain"].uv(8, 1), t["super_plain"].uv(0, 1)], 0)
            else:
                mb.face([b, a, a + V((0, 0, h)), b + V((0, 0, h))], [t["super_plain"].uv(8, 0), t["super_plain"].uv(0, 0), t["super_plain"].uv(0, 1), t["super_plain"].uv(8, 1)], 0)
    if lod == 0:
        # molinetes y bitas en proa y popa
        for x in (H.x_end(D) - 14, H.x_end(D) - 20):
            for sy in (-1, 1):
                K.cylinder(mb, (x, sy * 3.2 - 0.8, zf + 0.9), (x, sy * 3.2 + 0.8, zf + 0.9), 0.9, 12, t["machinery"])
                K.box(mb, (x, sy * 3.2, zf + 0.4), (2.6, 2.2, 0.8), t["machinery"])
        xs = H.x_aft(D) + 6
        for sy in (-1, 1):
            K.cylinder(mb, (xs, sy * 4 - 0.8, D + 0.9), (xs, sy * 4 + 0.8, D + 0.9), 0.8, 12, t["machinery"])
    return bays, rows, zc + HATCH


def build_house(mb, H, t, lod):
    """Superestructura: niveles de alojamiento escalonados, puente con alerones, mástil y chimenea."""
    x0, ln = deckhouse_x(H)
    D, B = H.D, H.B
    n = H.P["tiers"]
    win, plain, glass = t["super_windows"], t["super_plain"], t["bridge_glass"]
    hw = 0.70 * B
    if lod == 2:
        K.box(mb, (x0 + ln / 2, 0, D + n * 2.8 / 2 + 1.6), (ln, hw, n * 2.8 + 3.2), win)
        return x0, ln
    z = D
    for k in range(n):
        setback = 0.6 * k if lod == 0 else 0
        K.box(mb, (x0 + ln / 2 - setback / 2, 0, z + 1.4), (ln - setback, hw - 0.2 * k, 2.8),
              {"+x": win, "-x": win, "+y": win, "-y": win, "+z": plain, "-z": plain}, skip=("-z",) if k else ())
        z += 2.8
    # puente: más ancho (alerones hasta la borda) con ventanas inclinadas al frente
    zb = z
    K.box(mb, (x0 + ln / 2 + 0.6, 0, zb + 1.6), (ln - 3.0, hw + 1.0, 3.2),
          {"+x": glass, "-x": plain, "+y": glass, "-y": glass, "+z": plain, "-z": plain})
    for sy in (-1, 1):
        K.box(mb, (x0 + ln - 3.5, sy * (hw / 2 + (B - hw) / 4 + 0.25), zb + 0.2), (4.0, (B - hw) / 2 + 0.5, 0.4), plain)
        if lod == 0:
            K.card(mb, (x0 + ln - 5.5, sy * (B / 2 + 0.2), zb + 0.4), (x0 + ln - 1.5, sy * (B / 2 + 0.2), zb + 0.4), 1.1, t["railing"])
            K.box(mb, (x0 + ln - 3.5, sy * (B / 2 - 0.4), zb + 1.0), (1.2, 0.8, 1.2), plain)          # consola del alerón
            K.box(mb, (x0 + ln - 3.5, sy * (B / 2 + 0.05), zb + 2.0), (0.5, 0.3, 0.5), t["lights"])  # luz de costado
    K.box(mb, (x0 + ln / 2 + 0.6, 0, zb + 3.35), (ln - 2.0, hw + 1.6, 0.3), plain)                   # techo del puente
    if lod == 0:
        # mástil de radares y antenas
        xm = x0 + ln / 2 + 1.0
        K.beam(mb, (xm, 0, zb + 3.5), (xm, 0, zb + 11.0), 0.6, 0.6, plain)
        K.box(mb, (xm, 0, zb + 8.0), (1.0, 7.0, 0.3), plain)
        for sy in (-2.6, 2.6):
            K.box(mb, (xm + 0.4, sy, zb + 8.6), (0.4, 3.6, 0.25), t["machinery"])
        K.box(mb, (xm, 0, zb + 11.2), (0.4, 0.4, 0.4), t["lights"])
        # escaleras exteriores, botes y grúa de provisiones
        xb = x0 - 2.0
        K.box(mb, (xb, 0, D + 6.0), (7.5, 3.2, 3.0), t["lifeboat"])                                   # bote de caída libre
        K.beam(mb, (xb + 3.5, -1.8, D), (xb - 3.5, -1.8, D + 4.5), 0.4, 0.4, t["machinery"])
        K.beam(mb, (xb + 3.5, 1.8, D), (xb - 3.5, 1.8, D + 4.5), 0.4, 0.4, t["machinery"])
        for sy in (-1, 1):
            K.beam(mb, (x0 + ln + 1.5, sy * (hw / 2 + 1.5), D), (x0 + ln + 1.5, sy * (hw / 2 + 1.5), D + 9.0), 0.6, 0.6, plain)
            K.beam(mb, (x0 + ln + 1.5, sy * (hw / 2 + 1.5), D + 8.5), (x0 + ln + 7.0, sy * (hw / 2 + 2.5), D + 7.0), 0.35, 0.35, plain)
        # IMO en la cara de popa
        p = V((x0 - 0.04, 0, D + 3.2))
        K.quad_trim(mb, p + V((0, 4.0, -0.6)), p + V((0, -4.0, -0.6)), p + V((0, -4.0, 0.6)), p + V((0, 4.0, 0.6)), t["imo"])
    # chimenea: casing blanco y tope negro, a popa del puente
    xf = x0 + 3.5
    K.box(mb, (xf, 0, zb - 2.0), (6.0, 7.5, 8.0), plain, skip=("-z",))
    K.box(mb, (xf, 0, zb + 4.6), (6.4, 7.8, 5.2), {"*": t["funnel"]}, skip=("-z",))
    return x0, ln, zb, xf


def build_marks(mb, H, t):
    """Marcas de calado y disco de Plimsoll en el centro de la eslora (las dos bandas)."""
    B2 = H.B / 2 + 0.03
    for sy in (-1, 1):
        x0, x1 = (-3.0, 3.0) if sy < 0 else (3.0, -3.0)
        p = [V((x0, sy * B2, -2.0)), V((x1, sy * B2, -2.0)), V((x1, sy * B2, 2.5)), V((x0, sy * B2, 2.5))]
        K.quad_trim(mb, *p, t["plimsoll"])
        for xd in (H.L * 0.28, -H.L * 0.28):
            yy = H.y(0.5 + xd / H.L, 0.0) + 0.04 if abs(xd) < H.L * 0.3 else None
            xa = xd - sy * 1.2
            xb = xd + sy * 1.2
            # en los finos el casco es curvo: las marcas van en un plano levemente separado (calcomanía corta)
            u = (xd - H.x_aft(0)) / (H.x_end(0) - H.x_aft(0))
            yy = H.y(u, 0.0) + 0.05
            pts = [V((xa, sy * yy, -H.T * 0.8)), V((xb, sy * yy, -H.T * 0.8)), V((xb, sy * yy, 1.0)), V((xa, sy * yy, 1.0))]
            K.quad_trim(mb, *pts, K.Decal(t["draft_marks"].u0, t["draft_marks"].v0, t["draft_marks"].u0 + (t["draft_marks"].u1 - t["draft_marks"].u0) / 3, t["draft_marks"].v1))


def build_name_planes(H, coll, mat_name):
    """Planos del nombre (proa en las dos bandas y popa) con su propio material: el visor les pone un canvas."""
    mb = K.MB()
    d = K.Decal(0, 0, 1, 1)
    for sy in (-1, 1):
        u = 0.9
        x = H.x_aft(H.D - 2) + u * (H.x_end(H.D - 2) - H.x_aft(H.D - 2))
        y = H.y(u, H.D - 2.0) + 0.06
        a, b = (V((x - 6, sy * y, H.D - 3.2)), V((x + 6, sy * y, H.D - 3.2))) if sy < 0 else (V((x + 6, sy * y, H.D - 3.2)), V((x - 6, sy * y, H.D - 3.2)))
        K.quad_trim(mb, a, b, b + V((0, 0, 2.2)), a + V((0, 0, 2.2)), d)
    xs = H.x_aft(H.D - 2) - 0.08
    K.quad_trim(mb, V((xs, 9, H.D - 4.0)), V((xs, -9, H.D - 4.0)), V((xs, -9, H.D - 1.8)), V((xs, 9, H.D - 1.8)), d)
    return mb.to_object("Ship_Name", coll, materials=[mat_name])


def build_band(H, coll, mat_band, xf, zb):
    mb = K.MB()
    d = K.Decal(0, 0, 1, 1)
    K.box(mb, (xf, 0, zb + 4.4), (6.46, 7.86, 1.6), d, skip=("+z", "-z"))
    return mb.to_object("Funnel_Band", coll, materials=[mat_band])


def build_rudder_prop(H, t, coll, mats):
    Tt = H.T
    zp = -Tt + 0.4 * Tt
    xs = H.x_aft(zp)
    dprop = 0.62 * Tt
    xp = xs - 0.6
    chord = 0.032 * H.L
    xr = xp - dprop * 0.18 - chord / 2 - 0.8
    mb = K.MB()
    K.box(mb, (xr, 0, zp), (chord, 0.9, 0.78 * Tt), t["hull_red"])
    K.beam(mb, (xr + chord * 0.28, 0, zp + 0.39 * Tt), (xr + chord * 0.28, 0, Z_TR + 0.5), 0.7, 0.7, t["hull_red"])
    rud = mb.to_object("Rudder_Mesh", coll, materials=mats)
    mb = K.MB()
    K.cylinder(mb, (xp - 0.8, 0, zp), (xp + 0.8, 0, zp), 0.55, 12, t["machinery"])
    for k in range(5):
        a = 2 * math.pi * k / 5
        d = V((0, math.cos(a), math.sin(a)))
        n = V((0, -math.sin(a), math.cos(a)))
        c = V((xp, 0, zp)) + d * (dprop / 4 + 0.3)
        M = Matrix((V((1, 0, 0)) * 0.7 + n * 0.7, n * 0.7 - V((1, 0, 0)) * 0.7, d)).transposed()
        M = K.frame_z(d, V((0.7, 0, 0)) + n)
        K.box(mb, c, (1.6, 0.18, dprop / 2 - 0.6), t["lights"] if False else t["cellguide"], M=M)
    prop = mb.to_object("Propeller_Mesh", coll, materials=mats)
    return rud, prop


def build_variant(name, P, t, coll, mats, m_band, m_name):
    H = Hull(P)
    root = K.empty(f"Ship_{name}", coll, display="ARROWS", size=10)
    info = {}
    for lod in (0, 1, 2):
        mb = K.MB()
        build_hull(mb, H, t, lod)
        bays, rows, cargo_z = build_topside(mb, H, t, lod)
        hres = build_house(mb, H, t, lod)
        if lod == 0:
            build_marks(mb, H, t)
            info = dict(bays=bays, rows=rows, cargo_z=cargo_z, house=hres)
        ob = mb.to_object(f"Ship_{name}_LOD{lod}", coll, materials=mats, sharp_deg=40)
        K.attach(ob, root)
    x0, ln, zb, xf = info["house"]
    K.attach(build_name_planes(H, coll, m_name), root)
    K.attach(build_band(H, coll, m_band, xf, zb), root)
    rud, prop = build_rudder_prop(H, t, coll, mats)
    for ob, nm, kind in ((rud, "Rudder", "rudder"), (prop, "Propeller", "propeller")):
        ob.name = nm
        K.attach(ob, root)
        K.auto_pivot(ob, kind)
    # colisiones: casco en 5 tramos convexos + superestructura + chimenea + bodega
    P_, S_, us, zs = build_hull(K.MB(), H, t, 1)
    cuts = [0.0, 0.12, 0.35, 0.65, 0.85, 1.0]
    for k in range(5):
        pts = [p for i, u in enumerate(us) if cuts[k] - 1e-6 <= u <= cuts[k + 1] + 1e-6 for p in (P_[i] + S_[i])]
        K.ucx_from_points(f"{name}_Casco_{k + 1}", coll, pts, parent=root)
    K.ucx_box(f"{name}_Superestructura", coll, (x0 + ln / 2, 0, (H.D + zb + 3.4) / 2), (ln, 0.7 * H.B + 1.0, zb + 3.4 - H.D), parent=root)
    K.ucx_box(f"{name}_Bodegas", coll, ((bays[0] + bays[-1]) / 2, 0, H.D + (COAMING + HATCH) / 2), (bays[-1] - bays[0] + BAY, rows * ROW + 0.6, COAMING + HATCH), parent=root)
    root["clase"] = name
    root["eslora_m"], root["manga_m"], root["calado_m"], root["puntal_m"] = H.L, H.B, H.T, H.D
    root["bahias_x"] = [round(b, 3) for b in bays]
    root["filas"] = rows
    root["paso_fila_m"] = ROW
    root["carga_z"] = round(cargo_z, 3)
    root["lod_distancias_m"] = [0, 450, 1800]
    root["casa_x0"], root["casa_largo"], root["puente_z"], root["chimenea_x"] = round(x0, 3), round(ln, 3), round(zb, 3), round(xf, 3)
    return root, rud, prop


def animate(rud, prop, fps=30):
    act = bpy.data.actions.new("Navegacion")
    for ob in (rud, prop):
        ob.animation_data_create()
        ob.animation_data.action = act
    for f, a in ((1, 0.0), (1 + 2 * fps, 2 * math.pi)):
        prop.rotation_euler = (0, 0, a)
        prop.keyframe_insert("rotation_euler", frame=f)
    for f, a in ((1, 0.0), (1 + fps, math.radians(4)), (1 + 2 * fps, 0.0)):
        rud.rotation_euler = (0, 0, a)
        rud.keyframe_insert("rotation_euler", frame=f)
    for fc in getattr(act, "fcurves", []):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    return act


def build(_items, coll, _mats, tex):
    items, paths = T.ship_atlas(tex)
    m = K.pbr_material("M_Buque", paths)
    m_a = K.pbr_material("M_Buque_Alpha", paths, alpha=True)
    m_band = K.flat_material("M_Buque_Banda", (0.75, 0.12, 0.10), rough=0.45)
    m_name = K.flat_material("M_Buque_Nombre", (0.95, 0.95, 0.95), rough=0.5)
    out = {}
    for name, P in CLASSES.items():
        root, rud, prop = build_variant(name, P, items, coll, [m, m_a], m_band, m_name)
        animate(rud, prop)
        out[f"Ship_{name}"] = (root, {"moviles": ["Rudder", "Propeller"], "animaciones": ["Navegacion"]})
    return out
