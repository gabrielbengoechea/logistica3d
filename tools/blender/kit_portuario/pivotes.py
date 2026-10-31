"""
Calcula y congela los pivotes de las piezas móviles de un .blend según su nombre.

    python3 pivotes.py modelo.blend [--guardar salida.blend]
    blender -b modelo.blend -P pivotes.py -- [--guardar salida.blend]

Reglas (por prefijo del nombre del objeto) → cálculo a partir de la caja de la geometría (o de sus hijos):
  Trolley*         carro: centro en X, eje de las ruedas, cara del riel; eje = el lado largo del recorrido
  Spreader*        centro de la cara superior; eje −Z (baja)
  Twistlock*       centro; eje Z (gira 90° para trabar)
  Steer_*          centro de la rueda; eje Z (dirección)
  *Wheel*          centro; eje = la dimensión más corta (eje de giro de la rueda)
  Bogie_*          centro; eje Z (giro de 90° de los bogies de las RTG)
  Rudder*          mecha del timón: 22 % de la cuerda desde el borde de ataque, arriba; eje Z
  Propeller*       centro del cubo; eje X

Congelar = mover el origen al pivote con el Z local sobre el eje, sin mover la geometría ni a los hijos
(equivale a Set Origin + alinear + Apply Rotation & Scale manteniendo la jerarquía). Imprime un reporte.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

from kit import nucleo as K  # noqa: E402

REGLAS = [
    (r"^Trolley", "trolley"),
    (r"^Spreader$", "spreader"),
    (r"^Twistlock", "twistlock"),
    (r"^Steer_", "steer"),
    (r"Wheel", "wheel"),
    (r"^Bogie_", "steer"),
    (r"^Rudder", "rudder"),
    (r"^Propeller", "propeller"),
]


def caja(ob):
    """Caja de mundo de la geometría del objeto y de sus hijos (para los vacíos que agrupan piezas)."""
    bpy.context.view_layer.update()
    objs = [o for o in K.subtree(ob) if o.type == "MESH" and not o.name.startswith("UCX_")]
    if not objs:
        return None
    los, his = zip(*(K.bbox_world(o) for o in objs))
    lo = K.V((min(p.x for p in los), min(p.y for p in los), min(p.z for p in los)))
    hi = K.V((max(p.x for p in his), max(p.y for p in his), max(p.z for p in his)))
    return lo, hi


def main():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    blend = next((x for x in a if x.endswith(".blend") and (a.index(x) == 0 or a[a.index(x) - 1] != "--guardar")), None)
    if blend:
        bpy.ops.wm.open_mainfile(filepath=blend)
    hechos = []
    for ob in list(bpy.data.objects):
        for patron, kind in REGLAS:
            if not re.search(patron, ob.name):
                continue
            if ob.type == "MESH":
                K.auto_pivot(ob, kind)
            else:
                cj = caja(ob)
                if cj is None:
                    break
                lo, hi = cj
                c = (lo + hi) / 2
                size = hi - lo
                if kind == "trolley":
                    K.freeze_pivot(ob, K.V((c.x, c.y, lo.z)), K.Y if size.y > size.x else K.X)
                elif kind == "spreader":
                    K.freeze_pivot(ob, K.V((c.x, c.y, hi.z)), -K.Z)
                else:
                    K.freeze_pivot(ob, c, K.Z)
            hechos.append((ob.name, kind, tuple(round(v, 3) for v in ob.matrix_world.translation)))
            break
    for n, k, p in hechos:
        print(f"  {n:28s} {k:10s} pivote {p}")
    print(f"{len(hechos)} pivotes congelados")
    if "--guardar" in a:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a[a.index("--guardar") + 1]), compress=True)


if __name__ == "__main__":
    main()
