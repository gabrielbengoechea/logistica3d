"""Render de control: python3 render_kit.py archivo.blend salida.png az,el,dist,tx,ty,tz[,lens] [muestras] [ocultar_prefijos]"""
import math
import sys

import bpy
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = int(sys.argv[4]) if len(sys.argv) > 4 else 24
sc.cycles.device = "CPU"
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1100, 700
hide = sys.argv[5].split(",") if len(sys.argv) > 5 else []
import os as _os
_solo = _os.environ.get("SOLO")
_keep = set()
if _solo:
    def _sub(o):
        _keep.add(o.name)
        [_sub(c) for c in o.children]
    _sub(bpy.data.objects[_solo])
for o in sc.objects:
    if o.name.startswith("UCX_") or "_LOD1" in o.name or "_LOD2" in o.name or o.name.startswith("_") or any(o.name.startswith(h) for h in hide if h) or (_solo and o.name not in _keep and o.type != "LIGHT"):
        o.hide_render = True
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
bg = w.node_tree.nodes["Background"]
sky = w.node_tree.nodes.new("ShaderNodeTexSky")
try:
    sky.sky_type = "NISHITA"
except Exception:
    pass
w.node_tree.links.new(sky.outputs[0], bg.inputs[0])
bg.inputs[1].default_value = 0.12
sc.view_settings.view_transform = "AgX"
sc.view_settings.exposure = -0.3
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sc.collection.objects.link(sun)
sun.data.energy = 3.2
sun.data.angle = math.radians(2)
sun.rotation_euler = (math.radians(50), 0, math.radians(35))
g = bpy.data.objects.new("ground", bpy.data.meshes.new("g"))
import bmesh
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=float(__import__("os").environ.get("SUELO", 400)))
import os as _o
_gz = float(_o.environ.get("SUELO_Z", 0))
bm.to_mesh(g.data)
g.data.materials.append(bpy.data.materials.new("gm"))
gb = g.data.materials[0].node_tree.nodes["Principled BSDF"]
gb.inputs["Base Color"].default_value = (0.42, 0.42, 0.40, 1)
gb.inputs["Roughness"].default_value = 0.9
sc.collection.objects.link(g)
g.location.z = _gz
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
v = [float(x) for x in sys.argv[3].split(",")]
az, el, dist, tx, ty, tz = v[:6]
cam.data.lens = v[6] if len(v) > 6 else 35
cam.data.clip_end = 5000
t = Vector((tx, ty, tz))
d = Vector((math.sin(math.radians(az)) * math.cos(math.radians(el)), -math.cos(math.radians(az)) * math.cos(math.radians(el)), math.sin(math.radians(el))))
cam.location = t + d * dist
cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = sys.argv[2]
bpy.ops.render.render(write_still=True)
