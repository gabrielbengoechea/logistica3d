"""
Contenedores ISO 668 de 20' y 40' (y 40' High Cube) con esquineros ISO 1161.

- LOD1: caja de 12 triángulos que usa el atlas de libreas (patios y buques: miles de instancias).
- LOD0: caja + 8 esquineros (corner castings) con su hueco, para verlos de cerca (spreader, camión, Estiba).
- Sockets: 8 vacíos Socket_{T|B}{1..4} en el centro de cada esquinero (para encastrar pilas en Estiba).
- UCX_Container: caja convexa exacta.
- High-poly de horneado: corrugado trapezoidal (paso 278 mm, 36 mm de profundidad), rieles, postes, puertas con
  barras de cierre y bisagras. Normal y AO se hornean en Cycles sobre la librea 0 y se copian a las 8 filas del atlas.

Medidas exteriores (m): 20' 6,058 × 2,438 × 2,591 · 40' 12,192 × 2,438 × 2,591 · 40'HC 12,192 × 2,438 × 2,896.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Vector as V

from kit import nucleo as K
from kit import texturas as T

DIMS = {"20": (6.058, 2.438, 2.591), "40": (12.192, 2.438, 2.591), "40HC": (12.192, 2.438, 2.896)}
CAST = (0.178, 0.162, 0.118)    # esquinero: largo × ancho × alto (ISO 1161)


def uvq(d, s0, s1, t0, t1):
    return [d.uv(s0, t0), d.uv(s1, t0), d.uv(s1, t1), d.uv(s0, t1)]


def low_box(mb, L, W, H, R, side_key):
    """Caja con el origen en el centro de la base (apoya en z = 0). Eje largo = X."""
    x0, x1, y0, y1 = -L / 2, L / 2, -W / 2, W / 2
    side, door, front, roof = R[side_key], R["door"], R["front"], R["roof_band"]
    # costado −Y (se lee desde afuera de izquierda a derecha) y +Y (espejado en U para que también se lea)
    mb.face([(x0, y0, 0), (x1, y0, 0), (x1, y0, H), (x0, y0, H)], uvq(side, 0, 1, 0, 1))
    mb.face([(x1, y1, 0), (x0, y1, 0), (x0, y1, H), (x1, y1, H)], uvq(side, 0, 1, 0, 1))
    # puertas en +X, frente en −X
    mb.face([(x1, y0, 0), (x1, y1, 0), (x1, y1, H), (x1, y0, H)], uvq(door, 0, 1, 0, 1))
    mb.face([(x0, y1, 0), (x0, y0, 0), (x0, y0, H), (x0, y1, H)], uvq(front, 0, 1, 0, 1))
    mb.face([(x0, y0, H), (x1, y0, H), (x1, y1, H), (x0, y1, H)], uvq(roof, 0, 1, 0, 1))
    mb.face([(x0, y1, 0), (x1, y1, 0), (x1, y0, 0), (x0, y0, 0)], uvq(roof, 0, 1, 0, 1))


def castings(mb, L, W, H, R):
    """8 esquineros que sobresalen 4 mm de la caja (de cerca se ven y dan el perfil real de la pila)."""
    cl, cw, ch = CAST
    c = R["side40"]
    dark = K.Decal(c.u0 + 0.0005, c.v1 - 0.004, c.u0 + 0.003, c.v1 - 0.001)
    e = 0.004
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z in (ch / 2, H - ch / 2):
                cx = sx * (L / 2 - cl / 2 + e)
                cy = sy * (W / 2 - cw / 2 + e)
                K.box(mb, (cx, cy, z), (cl + 2 * e, cw + 2 * e, ch + 2 * e), dark)


def corrugated(mb, origin, u, v, n, length, height, pitch=0.278, depth=0.036, trim=None):
    """Panel corrugado trapezoidal: crestas y valles a lo largo de u, extruidos en v; la cresta sobresale hacia n."""
    origin, u, v, n = V(origin), V(u), V(v), V(n)
    t = trim or K.Decal(0, 0, 0.01, 0.01)
    k = max(1, round(length / pitch))
    p = length / k
    prof = [(0.0, 0.0), (0.18, 0.0), (0.32, 1.0), (0.68, 1.0), (0.82, 0.0), (1.0, 0.0)]
    pts = []
    for i in range(k):
        for j, (a, d) in enumerate(prof):
            if i > 0 and j == 0:
                continue
            pts.append(((i + a) * p, d * depth))
    for (s0, d0), (s1, d1) in zip(pts, pts[1:]):
        a0 = origin + u * s0 + n * d0
        a1 = origin + u * s1 + n * d1
        mb.face([a0, a1, a1 + v * height, a0 + v * height], [t.uv(0, 0)] * 4)


def high_poly(L, W, H, coll, name):
    """Geometría de horneado (solo se usa para la normal y la AO)."""
    mb = K.MB()
    rail_h, post = 0.16, 0.12
    inset = 0.02     # el corrugado queda hundido respecto de la caja baja; la cresta llega a +0,016
    x0, x1, y0, y1 = -L / 2, L / 2, -W / 2, W / 2
    hp = H - 2 * rail_h
    # costados corrugados
    corrugated(mb, (x0 + post, y0 + inset, rail_h), (1, 0, 0), (0, 0, 1), (0, -1, 0), L - 2 * post, hp)
    corrugated(mb, (x1 - post, y1 - inset, rail_h), (-1, 0, 0), (0, 0, 1), (0, 1, 0), L - 2 * post, hp)
    # frente (−X): corrugado vertical
    corrugated(mb, (x0 + inset, y1 - post, rail_h), (0, -1, 0), (0, 0, 1), (-1, 0, 0), W - 2 * post, hp, pitch=0.22)
    # techo: corrugado suave a lo largo
    corrugated(mb, (x0 + post, y0 + post, H - inset * 0.5), (1, 0, 0), (0, 1, 0), (0, 0, 1), L - 2 * post, W - 2 * post, pitch=0.6, depth=0.012)
    d = K.Decal(0, 0, 0.01, 0.01)
    # rieles superior e inferior, postes de esquina
    for y, s in ((y0, -1), (y1, 1)):
        K.box(mb, (0, y - s * 0.02, rail_h / 2), (L - 0.2, 0.08, rail_h), d)
        K.box(mb, (0, y - s * 0.02, H - rail_h / 2), (L - 0.2, 0.08, rail_h), d)
    for x in (x0, x1):
        K.box(mb, (x, 0, rail_h / 2), (0.08, W - 0.2, rail_h), d)
        K.box(mb, (x, 0, H - rail_h / 2), (0.08, W - 0.2, rail_h), d)
    for sx in (-1, 1):
        for sy in (-1, 1):
            K.box(mb, (sx * (L / 2 - post / 2), sy * (W / 2 - post / 2), H / 2), (post, post, H - 0.24), d)
    # puertas (+X): dos hojas lisas con nervios, 4 barras de cierre con levas y manijas, bisagras
    for sy in (-1, 1):
        K.box(mb, (x1 - 0.01, sy * W / 4, H / 2), (0.02, W / 2 - 0.06, H - 0.34), d)
        for z in (0.6, 1.3, 2.0):
            K.box(mb, (x1 + 0.004, sy * W / 4, z * H / 2.591), (0.012, W / 2 - 0.12, 0.05), d)
    for fy in (-0.83, -0.36, 0.36, 0.83):
        y = fy * W / 2
        K.cylinder(mb, (x1 + 0.03, y, 0.12), (x1 + 0.03, y, H - 0.12), 0.0135, 12, d)
        for z in (0.95, 1.6):
            K.box(mb, (x1 + 0.045, y + 0.05, z), (0.03, 0.14, 0.03), d)
        K.box(mb, (x1 + 0.03, y, 0.18), (0.05, 0.06, 0.08), d)
        K.box(mb, (x1 + 0.03, y, H - 0.18), (0.05, 0.06, 0.08), d)
    for sy in (-1, 1):
        for z in (0.35, 0.95, 1.6, 2.25):
            K.box(mb, (x1 + 0.02, sy * (W / 2 - 0.09), z * H / 2.591), (0.04, 0.06, 0.12), d)
    castings(mb, L, W, H, {"side40": K.Decal(0, 0, 0.1, 0.1)})
    return mb.to_object(name, coll, sharp_deg=30)


def bake_container_maps(lows_highs, tmpdir):
    """Hornea normal y AO (Cycles, selección → activo) de cada high-poly sobre su caja baja. Devuelve arrays."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 24
    img_n = bpy.data.images.new("_BAKE_N", T.S, T.S, alpha=False, float_buffer=False)
    img_n.colorspace_settings.name = "Non-Color"
    img_n.generated_color = (0.5, 0.5, 1.0, 1.0)
    img_ao = bpy.data.images.new("_BAKE_AO", T.S, T.S, alpha=False, float_buffer=False)
    img_ao.colorspace_settings.name = "Non-Color"
    img_ao.generated_color = (1, 1, 1, 1)
    for img, kind in ((img_n, "NORMAL"), (img_ao, "AO")):
        for low, high in lows_highs:
            mat = bpy.data.materials.new("_bake")
            node = mat.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = img
            mat.node_tree.nodes.active = node
            low.data.materials.clear()
            low.data.materials.append(mat)
            K.select_only([high, low])
            bpy.context.view_layer.objects.active = low
            kw = dict(type=kind, use_selected_to_active=True, cage_extrusion=0.05, max_ray_distance=0.12, margin=6,
                      use_clear=False, target="IMAGE_TEXTURES")
            if kind == "NORMAL":
                kw.update(normal_space="TANGENT")
            r = bpy.ops.object.bake(**kw)
            assert r == {"FINISHED"}, r
    def arr(img):
        a = np.array(img.pixels[:], np.float32).reshape(T.S, T.S, 4)[::-1, :, :3]
        return a
    return arr(img_n), arr(img_ao)[..., 0]


def build(out_tex, coll):
    """Atlas + modelos de 20', 40' y 40'HC. Devuelve dict con raíces y material."""
    R = T.container_regions()
    # 1) high-poly y cajas bajas de horneado (solo librea 0)
    bake_pairs = []
    for key, side in (("40", "side40"), ("20", "side20")):
        L, W, H = DIMS[key]
        mb = K.MB()
        low_box(mb, L, W, H, R, side)
        low = mb.to_object(f"_bake_low_{key}", coll, weld=1e-5, sharp_deg=30)
        high = high_poly(L, W, H, coll, f"_bake_high_{key}")
        bake_pairs.append((low, high))
    n_arr, ao_arr = bake_container_maps(bake_pairs, out_tex)
    for low, high in bake_pairs:
        bpy.data.objects.remove(low)
        bpy.data.objects.remove(high)
    # 2) copiar la fila 0 horneada a las 8 libreas
    rows = T.ROW
    nrm = np.zeros((T.S, T.S, 3), np.float32) + np.array([0.5, 0.5, 1.0], np.float32)
    ao = np.ones((T.S, T.S), np.float32)
    for li in range(len(T.LIVERIES)):
        nrm[li * rows:(li + 1) * rows] = n_arr[:rows]
        ao[li * rows:(li + 1) * rows] = ao_arr[:rows]
    regions, paths = T.container_atlas(out_tex, normal_bake=nrm)
    # AO horneada dentro del ORM
    from PIL import Image
    orm = np.asarray(Image.open(paths["ORM"]), np.float32) / 255
    orm[..., 0] = ao
    Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(paths["ORM"], optimize=True)
    mat = K.pbr_material("M_Contenedor", paths, emissive=False)

    roots = {}
    for key in ("20", "40", "40HC"):
        L, W, H = DIMS[key]
        side = "side20" if key == "20" else "side40"
        root = K.empty(f"Container_{key}", coll, display="CUBE", size=0.5)
        for lod in (0, 1):
            mb = K.MB()
            low_box(mb, L, W, H, R, side)
            if lod == 0:
                castings(mb, L, W, H, R)
            ob = mb.to_object(f"Container_{key}_LOD{lod}", coll, sharp_deg=30, materials=[mat])
            K.attach(ob, root)
        # sockets en el centro de cada esquinero (abajo B, arriba T): para encastrar pilas
        cl, cw, ch = CAST
        k = 1
        for sx in (-1, 1):
            for sy in (-1, 1):
                for tag, z in (("B", ch / 2), ("T", H - ch / 2)):
                    s = K.empty(f"Socket_{key}_{tag}{k}", coll, display="SPHERE", size=0.05)
                    K.set_parent(s, root, K.Matrix.Translation(V((sx * (L / 2 - cl / 2), sy * (W / 2 - cw / 2), z))))
                k += 1
        K.ucx_box(f"Container_{key}", coll, (0, 0, H / 2), (L, W, H), parent=root)
        root["iso"] = {"20": "22G1", "40": "42G1", "40HC": "45G1"}[key]
        root["medidas_m"] = [L, W, H]
        root["librea_dv"] = R["row_dv"]
        root["libreas"] = [l[0] for l in T.LIVERIES]
        roots[key] = root
    return roots, mat, paths
