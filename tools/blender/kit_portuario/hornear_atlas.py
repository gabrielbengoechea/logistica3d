"""
Re-horneado de un atlas PBR (BaseColor, Normal, Metálico, Rugosidad, AO → ORM) en una sola textura por objeto.

Sirve para dos cosas:
- Juntar en un atlas los materiales de un objeto (menos materiales = menos draw calls).
- Hornear un LOD bajo desde el LOD alto (selección → activo): el LOD bajo queda con su propio atlas, con la
  normal del alto.

    python3 hornear_atlas.py modelo.blend --destino STS_Structure_LOD1 [--origen STS_Structure_LOD0] \
        [--res 2048] [--out texturas] [--muestras 16] [--guardar modelo_horneado.blend]
    blender -b modelo.blend -P hornear_atlas.py -- --destino ... (mismos argumentos)

Pasos: UV nuevas "Atlas" en el destino (Smart UV + empaquetado con margen), horneo en Cycles por pasada (difuso solo
color, rugosidad, metálico con el truco de la emisión, normal tangente, AO), dilatación de bordes (margin), ORM
empaquetado (R = AO, G = rugosidad, B = metálico) y material nuevo M_<destino>_Atlas que usa esas texturas.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402

from kit import nucleo as K  # noqa: E402


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    get = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    return dict(blend=next((x for x in a if x.endswith(".blend")), None), dst=get("--destino"), src=get("--origen"),
                res=int(get("--res", 2048)), out=get("--out", "texturas_horneadas"), samples=int(get("--muestras", 16)),
                save=get("--guardar"))


def nueva_imagen(nombre, res, color, non_color):
    img = bpy.data.images.new(nombre, res, res, alpha=False, float_buffer=False)
    img.generated_color = color
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return img


def uv_atlas(ob, margen):
    """UV nuevas "Atlas" con Smart UV Project y empaquetado; quedan activas para el horneo."""
    me = ob.data
    uv = me.uv_layers.get("Atlas") or me.uv_layers.new(name="Atlas")
    me.uv_layers.active = uv
    K.select_only([ob])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=margen)
    bpy.ops.uv.pack_islands(margin=margen)
    bpy.ops.object.mode_set(mode="OBJECT")
    return uv


def con_nodo_destino(materiales, img):
    """Agrega a cada material un nodo de imagen activo (el destino del horneo)."""
    nodos = []
    for m in materiales:
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        m.node_tree.nodes.active = n
        nodos.append((m, n))
    return nodos


def metalico_a_emision(materiales):
    """Truco para hornear el metálico: lo que entra al Metallic del BSDF pasa a una emisión que va a la salida."""
    cambios = []
    for m in materiales:
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if not bsdf or not out:
            continue
        em = nt.nodes.new("ShaderNodeEmission")
        inp = bsdf.inputs["Metallic"]
        if inp.is_linked:
            nt.links.new(inp.links[0].from_socket, em.inputs["Color"])
        else:
            v = inp.default_value
            em.inputs["Color"].default_value = (v, v, v, 1)
        old = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].is_linked else None
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
        cambios.append((nt, em, out, old))
    return cambios


def deshacer(cambios):
    for nt, em, out, old in cambios:
        if old is not None:
            nt.links.new(old, out.inputs["Surface"])
        nt.nodes.remove(em)


def pixeles(img):
    w, h = img.size
    return np.array(img.pixels[:], np.float32).reshape(h, w, 4)


def main():
    a = args()
    if a["blend"]:
        bpy.ops.wm.open_mainfile(filepath=a["blend"])
    dst = bpy.data.objects[a["dst"]]
    src = bpy.data.objects[a["src"]] if a["src"] else dst
    os.makedirs(a["out"], exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = a["samples"]
    res = a["res"]
    uv_atlas(dst, margen=4 / res * 2)
    # el destino necesita materiales con el nodo de imagen activo; si es otro objeto, se le pone uno temporal
    if src is not dst:
        tmp = bpy.data.materials.new("_horneo")
        dst.data.materials.clear()
        dst.data.materials.append(tmp)
    mats_dst = [m for m in dst.data.materials if m]
    mats_src = [m for m in src.data.materials if m]
    sel = src is not dst
    pasadas = [("BaseColor", "DIFFUSE", False, (0.5, 0.5, 0.5, 1)), ("Roughness", "ROUGHNESS", True, (0.5, 0.5, 0.5, 1)),
               ("Metallic", "EMIT", True, (0, 0, 0, 1)), ("Normal", "NORMAL", True, (0.5, 0.5, 1, 1)), ("AO", "AO", True, (1, 1, 1, 1))]
    salida = {}
    for nombre, tipo, nc, color in pasadas:
        img = nueva_imagen(f"T_{dst.name}_{nombre}", res, color, nc)
        nodos = con_nodo_destino(mats_dst, img)
        cambios = metalico_a_emision(mats_src) if nombre == "Metallic" else []
        K.select_only([src, dst] if sel else [dst])
        bpy.context.view_layer.objects.active = dst
        kw = dict(type=tipo, use_selected_to_active=sel, margin=8, use_clear=True, target="IMAGE_TEXTURES")
        if sel:
            kw.update(cage_extrusion=0.15, max_ray_distance=0.6)
        if tipo == "DIFFUSE":
            kw.update(pass_filter={"COLOR"})
        r = bpy.ops.object.bake(**kw)
        assert r == {"FINISHED"}, r
        deshacer(cambios)
        for m, n in nodos:
            m.node_tree.nodes.remove(n)
        path = os.path.join(a["out"], f"T_{dst.name}_{nombre}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        salida[nombre] = pixeles(img)
    # ORM empaquetado
    from PIL import Image
    orm = np.stack([salida["AO"][..., 0], salida["Roughness"][..., 0], salida["Metallic"][..., 0]], -1)[::-1]
    p_orm = os.path.join(a["out"], f"T_{dst.name}_ORM.png")
    Image.fromarray((np.clip(orm, 0, 1) * 255 + 0.5).astype(np.uint8)).save(p_orm)
    paths = {"BC": os.path.join(a["out"], f"T_{dst.name}_BaseColor.png"), "ORM": p_orm,
             "N": os.path.join(a["out"], f"T_{dst.name}_Normal.png")}
    mat = K.pbr_material(f"M_{dst.name}_Atlas", paths, emissive=False)
    dst.data.materials.clear()
    dst.data.materials.append(mat)
    # el atlas nuevo pasa a ser el canal UV de render (y el que exporta el glTF)
    uv = dst.data.uv_layers["Atlas"]
    uv.active_render = True
    print(f"Horneado {src.name} → {dst.name} ({res}²): " + ", ".join(sorted(os.listdir(a["out"]))))
    if a["save"]:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a["save"]), compress=True)


if __name__ == "__main__":
    main()
