"""
Núcleo del kit portuario: constructor de mallas con UV de trim sheet, pivotes, LOD, colisiones UCX y exportación.

Convenciones (Blender, Z arriba, metros):
- Cada activo tiene un objeto raíz vacío con su nombre (STS_Crane, Ship_Panamax, Truck_Tractor…) en el origen (0,0,0).
- Las mallas visibles terminan en _LOD0, _LOD1 o _LOD2. El visor muestra un solo nivel por instancia según la distancia.
- Las colisiones son UCX_<parte>: convexas, sin material de render (en el glTF quedan marcadas extras.collider = true).
- Las piezas móviles son objetos (vacíos o mallas) cuyo origen es el pivote y cuyo Z local es el eje de giro o de
  traslación. freeze_pivot() lo calcula y hornea la geometría para que los hijos no se muevan.
- Un material por familia (atlas 2048²): M_Industrial (+ M_Industrial_Alpha para barandas y escaleras con recorte),
  M_Buque, M_Contenedor. En glTF: blanco/negro en ORM (R = AO, G = rugosidad, B = metal), normal OpenGL y emisivo.
"""
import json
import math
import os

import bpy  # antes que bmesh
import bmesh
from mathutils import Matrix, Vector

V = Vector
X, Y, Z = V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1))


# ---------------------------------------------------------------------------------------------------------------------
# Escena
# ---------------------------------------------------------------------------------------------------------------------
def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0


def collection(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in (parent or bpy.context.scene.collection).children:
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def empty(name, coll, parent=None, world=None, display="PLAIN_AXES", size=1.0):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = display
    ob.empty_display_size = size
    coll.objects.link(ob)
    if world is not None or parent is not None:
        set_parent(ob, parent, world if world is not None else Matrix.Identity(4))
    return ob


def set_parent(ob, par, world):
    """Emparenta sin matrix_parent_inverse: matrix_basis = inversa(padre) @ mundo."""
    ob.parent = par
    ob.matrix_parent_inverse = Matrix.Identity(4)
    if par is not None:
        bpy.context.view_layer.update()
        ob.matrix_basis = par.matrix_world.inverted() @ world
    else:
        ob.matrix_basis = world


def frame_z(z, x_hint=None):
    """Matriz 3x3 cuyo Z es `z` (normalizado) y cuyo X se acerca a x_hint."""
    z = V(z).normalized()
    x_hint = V(x_hint) if x_hint is not None else (X if abs(z.dot(X)) < 0.9 else Y)
    x = (x_hint - z * z.dot(x_hint)).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


# ---------------------------------------------------------------------------------------------------------------------
# Constructor de mallas
# ---------------------------------------------------------------------------------------------------------------------
class MB:
    """Malla en construcción: caras con UV y material (índice de slot). Todo en coordenadas de mundo."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.ntri = 0

    def face(self, pts, uvs, mat=0, smooth=False):
        vs = [self.bm.verts.new(V(p)) for p in pts]
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.material_index = mat
        f.smooth = smooth
        for loop, uv in zip(f.loops, uvs):
            loop[self.uv].uv = uv
        self.ntri += len(pts) - 2
        return f

    def to_object(self, name, coll, weld=1e-5, sharp_deg=35, materials=()):
        bm = self.bm
        if weld:
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
        ngons = [f for f in bm.faces if len(f.verts) > 4]
        if ngons:
            bmesh.ops.triangulate(bm, faces=ngons)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in materials:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        if sharp_deg:
            me.set_sharp_from_angle(angle=math.radians(sharp_deg))
        return ob


# ---------------------------------------------------------------------------------------------------------------------
# Trim sheet: tiras que se repiten en U (todo el ancho del atlas) y ocupan una franja en V
# ---------------------------------------------------------------------------------------------------------------------
class Trim:
    """Tira del atlas: franja [v0, v1] (UV de Blender) que se repite en U cada `u_m` metros."""

    def __init__(self, v0, v1, u_m=4.0, mat=0):
        self.v0, self.v1, self.u_m, self.mat = v0, v1, u_m, mat
        pad = 3 / 2048
        self.a, self.b = v0 + pad, v1 - pad      # margen interno contra el sangrado de mipmaps

    def uv(self, s_m, t01):
        return (s_m / self.u_m, self.a + (self.b - self.a) * max(0.0, min(1.0, t01)))


class Decal:
    """Rectángulo único del atlas (u0, v0, u1, v1)."""

    def __init__(self, u0, v0, u1, v1, mat=0):
        self.u0, self.v0, self.u1, self.v1, self.mat = u0, v0, u1, v1, mat

    def uv(self, s01, t01):
        return (self.u0 + (self.u1 - self.u0) * s01, self.v0 + (self.v1 - self.v0) * t01)


def quad_trim(mb, p0, p1, p2, p3, trim, along=None, smooth=False):
    """Cuadrilátero p0-p1-p2-p3 (antihorario visto desde afuera) con la tira repetida a lo largo del lado más largo."""
    p0, p1, p2, p3 = V(p0), V(p1), V(p2), V(p3)
    e01, e03 = (p1 - p0).length, (p3 - p0).length
    if isinstance(trim, Decal):
        return mb.face([p0, p1, p2, p3], [trim.uv(0, 0), trim.uv(1, 0), trim.uv(1, 1), trim.uv(0, 1)], trim.mat, smooth)
    long01 = e01 >= e03 if along is None else along == 0
    if long01:
        uvs = [trim.uv(0, 0), trim.uv(e01, 0), trim.uv((p2 - p3).length, 1), trim.uv(0, 1)]
    else:
        uvs = [trim.uv(0, 0), trim.uv(0, 1), trim.uv((p2 - p1).length, 1), trim.uv(e03, 0)]
    return mb.face([p0, p1, p2, p3], uvs, trim.mat, smooth)


def box(mb, c, size, trims, M=None, skip=()):
    """Caja centrada en c con tamaño (sx, sy, sz) en el marco M (3x3). trims: una tira o dict por cara ±x ±y ±z."""
    c = V(c)
    M = M or Matrix.Identity(3)
    sx, sy, sz = (s / 2 for s in size)
    P = lambda x, y, z: c + M @ V((x * sx, y * sy, z * sz))
    faces = {
        "+x": (P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)),
        "-x": (P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1)),
        "+y": (P(1, 1, -1), P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1)),
        "-y": (P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)),
        "+z": (P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)),
        "-z": (P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1)),
    }
    for k, q in faces.items():
        if k in skip:
            continue
        t = trims.get(k, trims.get("*")) if isinstance(trims, dict) else trims
        if t is None:
            continue
        quad_trim(mb, *q, t)


def beam(mb, a, b, w, h, trim, up=Z, caps=True, trim_cap=None):
    """Viga de sección rectangular w (lateral) × h (según `up`) entre los puntos a y b."""
    a, b = V(a), V(b)
    d = b - a
    L = d.length
    if L < 1e-6:
        return
    M = frame_z(d, None)
    # orientar X del marco hacia `up` proyectado
    upp = V(up) - d.normalized() * d.normalized().dot(V(up))
    if upp.length < 1e-6:
        upp = X if abs(d.normalized().dot(X)) < 0.9 else Y
    xh = upp.normalized()
    M = frame_z(d, xh)
    box(mb, (a + b) / 2, (h, w, L), trims={"+x": trim, "-x": trim, "+y": trim, "-y": trim,
                                           "+z": trim_cap or trim if caps else None, "-z": trim_cap or trim if caps else None}, M=M)


def cylinder(mb, a, b, r, seg, trim, caps=True, r2=None, cap_trim=None, smooth=True):
    a, b = V(a), V(b)
    d = b - a
    L = d.length
    M = frame_z(d)
    r2 = r if r2 is None else r2
    circ = 2 * math.pi * r
    A = [a + M @ V((r * math.cos(2 * math.pi * j / seg), r * math.sin(2 * math.pi * j / seg), 0)) for j in range(seg)]
    B = [b + M @ V((r2 * math.cos(2 * math.pi * j / seg), r2 * math.sin(2 * math.pi * j / seg), 0)) for j in range(seg)]
    for j in range(seg):
        j2 = (j + 1) % seg
        s0, s1 = circ * j / seg, circ * (j + 1) / seg
        if isinstance(trim, Decal):
            uvs = [trim.uv(j / seg, 0), trim.uv((j + 1) / seg, 0), trim.uv((j + 1) / seg, 1), trim.uv(j / seg, 1)]
        else:
            # la tira corre a lo largo del eje; el contorno cubre la franja en V
            uvs = [trim.uv(0, j / seg), trim.uv(0, (j + 1) / seg), trim.uv(L, (j + 1) / seg), trim.uv(L, j / seg)]
        mb.face([A[j], A[j2], B[j2], B[j]], uvs, trim.mat, smooth)
    if caps:
        ct = cap_trim or trim
        cu = ct.uv(0.5, 0.5) if isinstance(ct, Decal) else ct.uv(0.2, 0.5)
        mb.face(A[::-1], [cu] * seg, ct.mat)
        mb.face(B, [cu] * seg, ct.mat)


def tube_path(mb, pts, r, seg, trim, caps=True):
    """Tubo por una polilínea (cables, caños), marcos de transporte paralelo."""
    pts = [V(p) for p in pts]
    n = len(pts)
    tang = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = Z if abs(tang[0].z) < 0.9 else X
    nrm = (ref - tang[0] * tang[0].dot(ref)).normalized()
    rings, acc = [], [0.0]
    for i in range(1, n):
        acc.append(acc[-1] + (pts[i] - pts[i - 1]).length)
    for i in range(n):
        if i:
            nrm = (nrm - tang[i] * tang[i].dot(nrm)).normalized()
        bi = tang[i].cross(nrm)
        rings.append([pts[i] + r * (math.cos(2 * math.pi * s / seg) * nrm + math.sin(2 * math.pi * s / seg) * bi) for s in range(seg)])
    for i in range(n - 1):
        for s in range(seg):
            s2 = (s + 1) % seg
            mb.face([rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s]],
                    [trim.uv(acc[i], s / seg), trim.uv(acc[i], (s + 1) / seg), trim.uv(acc[i + 1], (s + 1) / seg), trim.uv(acc[i + 1], s / seg)],
                    trim.mat, True)
    if caps:
        u = trim.uv(0, 0.5)
        mb.face(rings[0][::-1], [u] * seg, trim.mat)
        mb.face(rings[-1], [u] * seg, trim.mat)


def card(mb, a, b, h, trim, up=Z, double=True):
    """Tarjeta vertical (baranda, escalera, rejilla) de a a b y alto h: un quad con recorte alfa (dos caras)."""
    a, b = V(a), V(b)
    u = V(up) * h
    L = (b - a).length
    uvs = [trim.uv(0, 0), trim.uv(L, 0), trim.uv(L, 1), trim.uv(0, 1)]
    mb.face([a, b, b + u, a + u], uvs, trim.mat)
    if double:
        mb.face([b, a, a + u, b + u], [uvs[1], uvs[0], uvs[3], uvs[2]], trim.mat)


def truss(mb, a, b, c, d, n, w, trim, diag=True):
    """Celosía plana entre los cordones a→b y c→d (paralelos), n paños: montantes y diagonales de ancho w."""
    a, b, c, d = V(a), V(b), V(c), V(d)
    up = (c - a).normalized()
    for i in range(n + 1):
        t = i / n
        p, q = a.lerp(b, t), c.lerp(d, t)
        beam(mb, p, q, w, w, trim, up=(b - a).normalized())
        if diag and i < n:
            t2 = (i + 1) / n
            if i % 2 == 0:
                beam(mb, p, c.lerp(d, t2), w * 0.8, w * 0.8, trim, up=(b - a).normalized())
            else:
                beam(mb, q, a.lerp(b, t2), w * 0.8, w * 0.8, trim, up=(b - a).normalized())


# ---------------------------------------------------------------------------------------------------------------------
# Pivotes
# ---------------------------------------------------------------------------------------------------------------------
def bbox_world(ob):
    pts = [ob.matrix_world @ V(c) for c in ob.bound_box]
    lo = V((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = V((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def freeze_pivot(ob, pivot, axis=Z, x_hint=None):
    """Mueve el origen de `ob` a `pivot` (mundo) con su Z local sobre `axis`, sin mover la geometría ni los hijos.
    Equivale a: Set Origin + alinear ejes + Apply Rotation & Scale (escala 1) manteniendo la jerarquía."""
    bpy.context.view_layer.update()
    old = ob.matrix_world.copy()
    new = Matrix.Translation(V(pivot)) @ frame_z(axis, x_hint).to_4x4()
    if ob.type == "MESH":
        ob.data.transform(new.inverted() @ old)
        ob.data.update()
    kids = [(c, c.matrix_world.copy()) for c in ob.children]
    par = ob.parent
    ob.matrix_basis = (par.matrix_world.inverted() if par else Matrix.Identity(4)) @ new
    bpy.context.view_layer.update()
    for c, w in kids:
        c.matrix_basis = ob.matrix_world.inverted() @ w
    bpy.context.view_layer.update()
    ob["pivote"] = [round(v, 4) for v in pivot]
    ob["eje_local"] = "Z (Y en glTF)"


def auto_pivot(ob, kind):
    """Calcula el pivote de una pieza móvil a partir de su geometría y lo congela.
    kind: 'trolley' (centro de ruedas, eje de traslación = eje largo del riel), 'spreader' (centro superior, eje -Z),
    'wheel' (centro, eje = dimensión más corta), 'steer' (centro, eje Z), 'rudder' (mecha: 22 % desde el borde de
    ataque, arriba), 'propeller' (centro, eje X), 'twistlock' (centro, eje Z), 'hinge' (se pasa a mano)."""
    lo, hi = bbox_world(ob)
    c = (lo + hi) / 2
    size = hi - lo
    if kind == "wheel":
        k = min(range(3), key=lambda i: size[i])
        freeze_pivot(ob, c, [X, Y, Z][k])
    elif kind in ("steer", "twistlock"):
        freeze_pivot(ob, c, Z)
    elif kind == "spreader":
        freeze_pivot(ob, V((c.x, c.y, hi.z)), Z)
    elif kind == "trolley":
        freeze_pivot(ob, V((c.x, c.y, lo.z)), Z, x_hint=Y if size.y < size.x else X)
    elif kind == "rudder":
        freeze_pivot(ob, V((lo.x + 0.78 * size.x, c.y, hi.z)), Z)
    elif kind == "propeller":
        freeze_pivot(ob, c, X)
    else:
        freeze_pivot(ob, c, Z)


# ---------------------------------------------------------------------------------------------------------------------
# Colisiones y limpieza
# ---------------------------------------------------------------------------------------------------------------------
def ucx_from_points(name, coll, pts, parent=None):
    """Envolvente convexa de puntos de mundo → UCX_<name>, hija de `parent` sin moverse."""
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(V(p))
    res = bmesh.ops.convex_hull(bm, input=bm.verts)
    for g in res.get("geom_interior", []) + res.get("geom_unused", []):
        if isinstance(g, bmesh.types.BMVert) and g.is_valid and not g.link_faces:
            bm.verts.remove(g)
    me = bpy.data.meshes.new("UCX_" + name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("UCX_" + name, me)
    coll.objects.link(ob)
    ob.display_type = "WIRE"
    ob.hide_render = True
    ob["collider"] = True
    if parent is not None:
        w = ob.matrix_world.copy()
        set_parent(ob, parent, w)
        me.transform(parent.matrix_world.inverted())
        ob.matrix_basis = Matrix.Identity(4)
    return ob


def ucx_box(name, coll, c, size, M=None, parent=None):
    c = V(c)
    M = M or Matrix.Identity(3)
    h = [s / 2 for s in size]
    pts = [c + M @ V((sx * h[0], sy * h[1], sz * h[2])) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    return ucx_from_points(name, coll, pts, parent)


def ucx_beam(name, coll, a, b, w, h, parent=None):
    a, b = V(a), V(b)
    d = b - a
    M = frame_z(d)
    return ucx_box(name, coll, (a + b) / 2, (w, h, d.length), M, parent)


def clean_mesh(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.validate()
    ob.data.update()


def attach(ob, parent):
    """Cuelga una malla construida en coordenadas de mundo de `parent`, horneando la inversa en la geometría."""
    bpy.context.view_layer.update()
    ob.data.transform(parent.matrix_world.inverted())
    ob.parent = parent
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.matrix_basis = Matrix.Identity(4)


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons) if ob.type == "MESH" else 0


def subtree(ob):
    out = [ob]
    for c in ob.children:
        out += subtree(c)
    return out


# ---------------------------------------------------------------------------------------------------------------------
# Materiales
# ---------------------------------------------------------------------------------------------------------------------
def pbr_material(name, paths, alpha=False, emissive=True):
    """Principled con BaseColor (sRGB, alfa opcional), ORM (R=AO, G=rugosidad, B=metal), Normal y Emisivo."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")

    def tex(key, x, y, non_color):
        img = bpy.data.images.get(os.path.basename(paths[key])) or bpy.data.images.load(paths[key], check_existing=True)
        img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
        n = nodes.new("ShaderNodeTexImage")
        n.image = img
        n.location = (x, y)
        return n
    bc = tex("BC", -800, 400, False)
    orm = tex("ORM", -800, 100, True)
    nrm = tex("N", -800, -200, True)
    sep = nodes.new("ShaderNodeSeparateColor")
    sep.location = (-480, 100)
    nm = nodes.new("ShaderNodeNormalMap")
    nm.location = (-480, -200)
    links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(orm.outputs["Color"], sep.inputs["Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    links.new(nrm.outputs["Color"], nm.inputs["Color"])
    links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emissive and "E" in paths:
        em = tex("E", -800, -500, False)
        links.new(em.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
    if alpha:
        links.new(bc.outputs["Alpha"], bsdf.inputs["Alpha"])
        mat.surface_render_method = "DITHERED"
        mat["alpha_mode"] = "MASK"
        try:
            mat.alpha_threshold = 0.5
        except AttributeError:
            pass
    mat.use_backface_culling = not alpha
    grp = bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    if not grp.interface.items_tree:
        grp.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g = nodes.new("ShaderNodeGroup")
    g.node_tree = grp
    g.location = (-200, -600)
    links.new(sep.outputs["Red"], g.inputs["Occlusion"])
    return mat


def flat_material(name, color, rough=0.5, metal=0.0, emission=None):
    mat = bpy.data.materials.new(name)
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1)
        b.inputs["Emission Strength"].default_value = 1.0
    return mat


# ---------------------------------------------------------------------------------------------------------------------
# Exportación
# ---------------------------------------------------------------------------------------------------------------------
def select_only(objs):
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    vl.objects.active = objs[0]


def export_gltf(path, objs, fmt="GLB", image_format="AUTO", animations=True):
    select_only(objs)
    kw = dict(filepath=path, export_format=fmt, use_selection=True, export_extras=True, export_yup=True, export_apply=True,
              export_tangents=False, export_image_format=image_format, export_image_quality=88, export_materials="EXPORT",
              export_cameras=False, export_lights=False, export_animations=animations)
    if animations:
        kw.update(export_animation_mode="ACTIONS", export_force_sampling=False)
    try:
        r = bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        for k in ("export_animation_mode", "export_force_sampling"):
            kw.pop(k, None)
        r = bpy.ops.export_scene.gltf(**kw)
    assert r == {"FINISHED"}, r


def export_usdz(path, objs):
    select_only(objs)
    kw = dict(filepath=path, selected_objects_only=True, export_materials=True, generate_preview_surface=True,
              export_uvmaps=True, export_normals=True, export_animation=True, convert_orientation=True,
              export_global_forward_selection="NEGATIVE_Z", export_global_up_selection="Y")
    try:
        r = bpy.ops.wm.usd_export(**kw)
    except TypeError:
        for k in ("convert_orientation", "export_global_forward_selection", "export_global_up_selection", "export_animation"):
            kw.pop(k, None)
        r = bpy.ops.wm.usd_export(**kw)
    assert r == {"FINISHED"}, r


def glb_summary(path):
    import struct
    with open(path, "rb") as f:
        data = f.read()
    n = struct.unpack_from("<I", data, 12)[0]
    j = json.loads(data[20:20 + n])
    return dict(nodos=len(j.get("nodes", [])), mallas=len(j.get("meshes", [])), materiales=[m.get("name") for m in j.get("materials", [])],
                animaciones=[a.get("name") for a in j.get("animations", [])], kb=round(len(data) / 1024))
