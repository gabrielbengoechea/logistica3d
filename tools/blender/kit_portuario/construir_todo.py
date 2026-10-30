"""
Construye el kit portuario completo y lo exporta.

    python3 construir_todo.py --out ../../../public/modelos/kit [--solo sts,contenedores,...]
    blender -b -P construir_todo.py -- --out salida

Salida: <out>/<Activo>.glb (PNG), <Activo>_web.glb (WebP), gltf/<Activo>.gltf, <Activo>.usdz, kit.blend, texturas/,
reporte.json (triángulos por LOD, nodos móviles, colisiones, materiales y animaciones).
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

from kit import nucleo as K  # noqa: E402
from kit import texturas as T  # noqa: E402

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = os.path.abspath(ARGV[ARGV.index("--out") + 1] if "--out" in ARGV else "salida")
SOLO = set(ARGV[ARGV.index("--solo") + 1].split(",")) if "--solo" in ARGV else None
NO_EXPORT = "--sin-exportar" in ARGV


def want(k):
    return SOLO is None or k in SOLO


def lod_report(root):
    out = {}
    for o in K.subtree(root):
        if o.type == "MESH" and not o.name.startswith("UCX_"):
            for k in ("LOD0", "LOD1", "LOD2"):
                if o.name.endswith(k):
                    out[k] = out.get(k, 0) + K.tris(o)
            if not any(o.name.endswith(k) for k in ("LOD0", "LOD1", "LOD2")):
                out["siempre"] = out.get("siempre", 0) + K.tris(o)
    return out


def finish(root):
    for o in K.subtree(root):
        if o.type == "MESH":
            K.clean_mesh(o)


def export(root, name, rep, anims=True):
    objs = K.subtree(root)
    if NO_EXPORT:
        return
    K.export_gltf(os.path.join(OUT, f"{name}.glb"), objs, animations=anims)
    K.export_gltf(os.path.join(OUT, f"{name}_web.glb"), objs, image_format="WEBP", animations=anims)
    os.makedirs(os.path.join(OUT, "gltf"), exist_ok=True)
    K.export_gltf(os.path.join(OUT, "gltf", f"{name}.gltf"), objs, fmt="GLTF_SEPARATE", animations=anims)
    K.export_usdz(os.path.join(OUT, f"{name}.usdz"), [o for o in objs if not o.name.startswith("UCX_")])
    rep["archivos"] = {f: os.path.getsize(os.path.join(OUT, f)) for f in (f"{name}.glb", f"{name}_web.glb", f"{name}.usdz")}
    rep["glb"] = K.glb_summary(os.path.join(OUT, f"{name}.glb"))


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    tex = os.path.join(OUT, "texturas")
    K.clean_scene()
    report = {}
    coll = K.collection("Kit_Portuario")
    need_ind = any(want(k) for k in ("sts", "rtg", "camiones"))
    if need_ind:
        items, paths = T.industrial_atlas(tex)
        m_ind = K.pbr_material("M_Industrial", paths)
        m_ind_a = K.pbr_material("M_Industrial_Alpha", paths, alpha=True)
        mats = [m_ind, m_ind_a]
    if want("contenedores"):
        import contenedores
        c = K.collection("Contenedores", coll)
        roots, mat, _ = contenedores.build(tex, c)
        for k, r in roots.items():
            finish(r)
            rep = {"triangulos": lod_report(r), "colisiones": [o.name for o in K.subtree(r) if o.name.startswith("UCX_")]}
            export(r, f"Container_{k}", rep, anims=False)
            report[f"Container_{k}"] = rep
    if want("sts"):
        import sts
        c = K.collection("STS", coll)
        root, parts = sts.build(items, c, mats)
        sts.animate(parts)
        finish(root)
        rep = {"triangulos": lod_report(root), "moviles": ["Boom_Hinge", "Trolley", "Hoist_Ropes", "Spreader", "Spreader_Tele_A", "Spreader_Tele_B", "Twistlock_*"],
               "colisiones": [o.name for o in K.subtree(root) if o.name.startswith("UCX_")]}
        export(root, "STS_Crane", rep)
        report["STS_Crane"] = rep
    families = {"Kit_Industrial": [], "Kit_Contenedores": [], "Kit_Buques": []}
    if want("contenedores"):
        families["Kit_Contenedores"] += [r for k, r in roots.items()]
    if want("sts"):
        families["Kit_Industrial"].append(root)
    for mod, key in (("rtg", "rtg"), ("buque", "buque"), ("camiones", "camiones")):
        if want(key) and os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), f"{mod}.py")):
            m = __import__(mod)
            c = K.collection(mod.upper(), coll)
            res = m.build(items if mod != "buque" else None, c, mats if mod != "buque" else None, tex)
            for name, (root, extra) in res.items():
                finish(root)
                rep = {"triangulos": lod_report(root), "colisiones": [o.name for o in K.subtree(root) if o.name.startswith("UCX_")], **extra}
                export(root, name, rep)
                report[name] = rep
                families["Kit_Buques" if mod == "buque" else "Kit_Industrial"].append(root)
    # paquetes por familia para la web: un solo juego de texturas WebP por familia (menos descargas y un material)
    if not NO_EXPORT:
        for fam, rs in families.items():
            if rs:
                objs = [o for r in rs for o in K.subtree(r)]
                K.export_gltf(os.path.join(OUT, f"{fam}_web.glb"), objs, image_format="WEBP", animations=True)
                report[fam] = {"activos": [r.name for r in rs], "kb": round(os.path.getsize(os.path.join(OUT, f"{fam}_web.glb")) / 1024)}
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kit.blend"), compress=True)
    report["_segundos"] = round(time.time() - t0, 1)
    with open(os.path.join(OUT, "reporte.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("@@REPORTE@@" + json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
