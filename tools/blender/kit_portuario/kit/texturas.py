"""
Atlas PBR 2048² del kit portuario, pintados por procedimiento (numpy + PIL).

- Industrial: trim sheet de acero pintado (azul, blanco, amarillo, gris), persianas, rejilla, barandas y escaleras con
  recorte alfa, franjas de peligro, vidrio, goma, galvanizado, cabinas de camión, chasis, cromo, luces y cable de acero.
  Abajo, una zona de calcomanías únicas (números de grúa, carteles, frente del camión, matrícula…).
- Buque: costado (3 colores), obra viva, línea de flotación, cubierta, tapas de bodega, superestructura con ventanas,
  puente, chimenea, trincas, guías de celda, barandas y calcomanías (marcas de calado, IMO, disco de Plimsoll).
- Contenedor: 8 libreas de navieras inventadas; cada una ocupa una fila de 200 px con costado 40', costado 20',
  puertas y frente. La normal y la AO del corrugado se hornean aparte desde el high-poly (contenedores.py).

Cada tira se repite en U sin costuras (ruido periódico por FFT). Coordenadas: filas de PIL desde arriba;
v de Blender = 1 − fila/2048.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .nucleo import Decal, Trim

S = 2048
FONT_BLACK = "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf"
FONT_BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
FONT_MED = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ---------------------------------------------------------------------------------------------------------------------
# Ruido periódico
# ---------------------------------------------------------------------------------------------------------------------
def tnoise(rng, h, w, sx, sy=None):
    """Ruido gaussiano filtrado (periódico en X e Y), media 0 y desvío 1. sx, sy: tamaño de grano en píxeles."""
    sy = sx if sy is None else sy
    n = rng.normal(0, 1, (h, w))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    k = np.exp(-((fx * sx) ** 2 + (fy * sy) ** 2) * 2 * math.pi ** 2)
    out = np.real(np.fft.ifft2(np.fft.fft2(n) * k))
    return ((out - out.mean()) / (out.std() + 1e-8)).astype(np.float32)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


class Canvas:
    """Capas del atlas: color (sRGB 0-1), alfa, rugosidad, metal, AO, altura y emisivo."""

    def __init__(self, seed=1):
        self.bc = np.full((S, S, 3), 0.5, np.float32)
        self.a = np.ones((S, S), np.float32)
        self.r = np.full((S, S), 0.6, np.float32)
        self.m = np.zeros((S, S), np.float32)
        self.ao = np.ones((S, S), np.float32)
        self.h = np.zeros((S, S), np.float32)
        self.e = np.zeros((S, S, 3), np.float32)
        self.rng = np.random.default_rng(seed)
        self.items = {}

    # ----- reserva de zonas -----
    def strip(self, key, r0, r1, u_m, mat=0):
        self.items[key] = Trim(1 - r1 / S, 1 - r0 / S, u_m, mat)
        return slice(r0, r1)

    def decal(self, key, x, y, w, h, mat=0):
        self.items[key] = Decal(x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S, mat)
        return slice(y, y + h), slice(x, x + w)

    # ----- guardar -----
    def normal(self, strength=6.0):
        hh = self.h
        gx = (np.roll(hh, -1, 1) - np.roll(hh, 1, 1)) * 0.5
        gy = (np.roll(hh, -1, 0) - np.roll(hh, 1, 0)) * 0.5
        nx, ny = -gx * strength, gy * strength
        nz = np.ones_like(nx)
        ln = np.sqrt(nx * nx + ny * ny + nz * nz)
        return np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5

    def save(self, outdir, name, alpha=False, normal=None):
        os.makedirs(outdir, exist_ok=True)
        q = lambda a: (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
        paths = {}
        bc = np.concatenate([self.bc, self.a[..., None]], -1) if alpha else self.bc
        paths["BC"] = os.path.join(outdir, f"T_{name}_BaseColor.png")
        Image.fromarray(q(bc), "RGBA" if alpha else "RGB").save(paths["BC"], optimize=True)
        paths["ORM"] = os.path.join(outdir, f"T_{name}_ORM.png")
        Image.fromarray(q(np.stack([self.ao, np.clip(self.r, 0.04, 1), self.m], -1))).save(paths["ORM"], optimize=True)
        paths["N"] = os.path.join(outdir, f"T_{name}_Normal.png")
        Image.fromarray(q(self.normal() if normal is None else normal)).save(paths["N"], optimize=True)
        paths["E"] = os.path.join(outdir, f"T_{name}_Emissive.png")
        Image.fromarray(q(self.e)).save(paths["E"], optimize=True)
        # mapas sueltos que pidió la especificación (los mismos datos que el ORM)
        Image.fromarray(q(self.r)).save(os.path.join(outdir, f"T_{name}_Roughness.png"), optimize=True)
        Image.fromarray(q(self.m)).save(os.path.join(outdir, f"T_{name}_Metallic.png"), optimize=True)
        return paths


# ---------------------------------------------------------------------------------------------------------------------
# Pinceles por tira
# ---------------------------------------------------------------------------------------------------------------------
def paint_steel(cv, rows, color, wear=1.0, rust=1.0, bevel=True, rough=0.48):
    rng = cv.rng
    h = rows.stop - rows.start
    w = S
    c = hexc(color)
    v = np.linspace(0, 1, h)[:, None] * np.ones((1, w), np.float32)
    mott = tnoise(rng, h, w, 60, 18) * 0.035 + tnoise(rng, h, w, 6) * 0.018
    # chorreaduras verticales (en V) de suciedad y óxido
    streak = np.clip(tnoise(rng, h, w, 3, 90), 0, None)
    streak = smooth(1.2, 2.6, streak) * smooth(0.0, 0.7, 1 - v) * 0.6 * rust
    dirt = smooth(0.55, 1.0, v) * 0.10 + smooth(0.45, 0.0, v) * 0.06
    col = c[None, None, :] * (1 + mott[..., None]) * (1 - dirt[..., None])
    rustc = hexc("#7a3f1d")
    col = col * (1 - streak[..., None] * 0.55) + rustc * streak[..., None] * 0.55
    # cantos gastados: pintura saltada en los bordes del miembro (bordes de la franja)
    edge = np.maximum(smooth(0.07, 0.0, v), smooth(0.93, 1.0, v))
    chip = smooth(0.6, 1.4, tnoise(rng, h, w, 4) + edge * 1.6) * edge * wear
    primer = hexc("#8e8a84")
    col = col * (1 - chip[..., None]) + primer * chip[..., None]
    spots = smooth(2.1, 2.8, tnoise(rng, h, w, 9)) * rust
    col = col * (1 - spots[..., None] * 0.8) + rustc * 0.8 * spots[..., None] * 0.8
    cv.bc[rows] = np.clip(col, 0, 1)
    cv.r[rows] = rough + mott * 0.4 + streak * 0.25 + spots * 0.35 - chip * 0.05
    cv.m[rows] = chip * 0.85
    hh = tnoise(rng, h, w, 2) * 0.03 - spots * 0.25
    if bevel:
        hh += smooth(0.0, 0.06, v) * smooth(1.0, 0.94, v) * 1.0
    cv.h[rows] = hh
    cv.ao[rows] = 1 - 0.18 * np.maximum(smooth(0.05, 0.0, v), smooth(0.95, 1.0, v))


def paint_louver(cv, rows, color="#e9edf0"):
    paint_steel(cv, rows, color, wear=0.4, rust=0.6, bevel=False, rough=0.5)
    h = rows.stop - rows.start
    v = (np.arange(h) / h)[:, None]
    lam = (v * 10) % 1.0
    prof = smooth(0.0, 0.7, lam) * smooth(1.0, 0.85, lam)
    cv.h[rows] += np.broadcast_to(prof * 1.2, (h, S))
    shade = 1 - 0.35 * smooth(0.75, 1.0, lam)
    cv.bc[rows] *= np.broadcast_to(shade, (h, S))[..., None]
    # paneles: juntas verticales cada 1,5 m (u_m = 3 → 2 paneles por tile)
    u = (np.arange(S) / S)[None, :]
    joint = np.exp(-(((u * 2) % 1.0) - 0.0) ** 2 / 0.00002) + np.exp(-(((u * 2) % 1.0) - 1.0) ** 2 / 0.00002)
    cv.h[rows] -= np.broadcast_to(joint * 1.5, (h, S))
    cv.bc[rows] *= (1 - 0.25 * np.broadcast_to(joint, (h, S)))[..., None]


def paint_grating(cv, rows):
    h = rows.stop - rows.start
    rng = cv.rng
    u = np.arange(S)[None, :] / S * 4.0 / 0.04           # celdas de 4 cm (u_m = 4)
    v = np.arange(h)[:, None] / h * 1.0 / 0.04           # franja ≈ 1 m
    bars = np.maximum(smooth(0.80, 0.9, (u % 1.0)), smooth(0.80, 0.9, (v % 1.0) * np.ones((1, S))))
    base = hexc("#8f969c")
    hole = hexc("#1c1f22")
    col = base * bars[..., None] + hole * (1 - bars[..., None])
    col *= (1 + 0.06 * tnoise(rng, h, S, 30))[..., None]
    cv.bc[rows] = col
    cv.r[rows] = 0.55
    cv.m[rows] = 0.8 * bars
    cv.h[rows] = bars * 0.8
    cv.ao[rows] = 0.6 + 0.4 * bars


def paint_railing(cv, rows, color="#f2c230", u_m=2.0):
    """Baranda de 1,1 m: pasamanos, travesaño medio, zócalo y postes cada 1 m. Fuera de los caños, alfa 0."""
    h = rows.stop - rows.start
    v = 1 - np.arange(h)[:, None] / h          # 0 abajo, 1 arriba (en la imagen arriba es v alto)
    u = np.arange(S)[None, :] / S * u_m
    one = np.ones((h, S), np.float32)
    rail = lambda c, t: smooth(t, 0, np.abs(v - c)) * one
    m = np.maximum.reduce([rail(0.95, 0.04), rail(0.5, 0.025), smooth(0.12, 0.10, v) * one,
                           smooth(0.04, 0.025, np.abs((u % 1.0) - 0.5)) * one])
    m = (m > 0.5).astype(np.float32)
    c = hexc(color)
    cv.bc[rows] = c * (0.9 + 0.1 * np.broadcast_to(v, (h, S)))[..., None]
    cv.a[rows] = m
    cv.r[rows] = 0.45
    cv.m[rows] = 0.0
    cv.h[rows] = m * 0.5


def paint_ladder(cv, rows, color="#c9ced3", u_m=3.0):
    """Escalera marinera: U a lo largo de la escalera (peldaños cada 0,3 m), V a lo ancho (largueros en los bordes)."""
    h = rows.stop - rows.start
    v = np.arange(h)[:, None] / h
    u = np.arange(S)[None, :] / S * u_m
    rung = smooth(0.06, 0.03, np.abs(((u / 0.3) % 1.0) - 0.5)) * np.ones_like(v)
    side = np.maximum(smooth(0.1, 0.06, v), smooth(0.9, 0.94, v)) * np.ones_like(u)
    m = (np.maximum(rung * smooth(0.06, 0.1, v) * smooth(0.94, 0.9, v), side) > 0.5).astype(np.float32)
    cv.bc[rows] = hexc(color)
    cv.a[rows] = m
    cv.r[rows] = 0.5
    cv.m[rows] = 0.6
    cv.h[rows] = m * 0.5


def paint_hazard(cv, rows):
    h = rows.stop - rows.start
    u = np.arange(S)[None, :]
    v = np.arange(h)[:, None]
    k = ((u + v) // 64) % 2          # período 128 px: 16 franjas por tile, sin costura
    col = np.where(k[..., None] == 0, hexc("#f2c230"), hexc("#16181b"))
    cv.bc[rows] = col * (1 + 0.05 * tnoise(cv.rng, h, S, 12))[..., None]
    cv.r[rows] = 0.55
    cv.h[rows] = tnoise(cv.rng, h, S, 2) * 0.03


def paint_glass(cv, rows, tint="#1d2a35"):
    h = rows.stop - rows.start
    v = np.arange(h)[:, None] / h
    grad = 0.75 + 0.45 * v
    cv.bc[rows] = hexc(tint) * np.broadcast_to(grad, (h, S))[..., None]
    cv.r[rows] = 0.06
    cv.m[rows] = 0.3
    u = np.arange(S)[None, :] / S
    frame = np.maximum(smooth(0.05, 0.0, v), smooth(0.95, 1.0, v)) + smooth(0.006, 0.0, np.abs(((u * 4) % 1.0) - 0.5) - 0.494)
    frame = np.clip(frame, 0, 1) * np.ones((h, S))
    cv.bc[rows] = cv.bc[rows] * (1 - frame[..., None]) + hexc("#2b3036") * frame[..., None]
    cv.r[rows] = cv.r[rows] * (1 - frame) + 0.4 * frame
    cv.h[rows] = frame * 0.6


def paint_rubber(cv, rows):
    h = rows.stop - rows.start
    v = np.arange(h)[:, None] / h
    u = np.arange(S)[None, :] / S
    groove = smooth(0.12, 0.05, np.abs(((v * 24) % 1.0) - 0.5) - 0.3) * smooth(0.15, 0.2, u * 0 + 0.5)
    lug = ((np.floor(v * 24) + np.floor(u * 8 * 1.0)) % 2) * 0.0
    col = hexc("#1b1c1e") * (1 + 0.08 * tnoise(cv.rng, h, S, 3))[..., None]
    cv.bc[rows] = col
    cv.r[rows] = 0.88
    cv.h[rows] = -groove * 1.0 + lug


def paint_flat(cv, rows, color, rough=0.5, metal=0.0, noise=0.03, emissive=None):
    h = rows.stop - rows.start
    cv.bc[rows] = hexc(color) * (1 + noise * tnoise(cv.rng, h, S, 20))[..., None]
    cv.r[rows] = rough
    cv.m[rows] = metal
    cv.h[rows] = 0
    if emissive is not None:
        cv.e[rows] = hexc(emissive)


def paint_rope(cv, rows):
    h = rows.stop - rows.start
    v = np.arange(h)[:, None] / h
    u = np.arange(S)[None, :] / S * 40
    strand = 0.5 + 0.5 * np.sin((u + v * 6) * 2 * math.pi)
    cv.bc[rows] = hexc("#5c6166") * (0.75 + 0.35 * strand)[..., None]
    cv.r[rows] = 0.4
    cv.m[rows] = 0.9
    cv.h[rows] = strand * 0.5


def text_img(w, h, lines, font=FONT_BLACK, fill=(255, 255, 255, 255), bg=(0, 0, 0, 0), sizes=None, align="center", pad=0.08):
    S2 = 3
    img = Image.new("RGBA", (w * S2, h * S2), bg)
    d = ImageDraw.Draw(img)
    lines = [lines] if isinstance(lines, str) else lines
    n = len(lines)
    sizes = sizes or [1.0 / n] * n
    y = h * S2 * pad
    for line, frac in zip(lines, sizes):
        fs = int(h * S2 * (1 - 2 * pad) * frac * 0.86)
        f = ImageFont.truetype(font, max(6, fs))
        while d.textlength(line, font=f) > w * S2 * (1 - 2 * pad) and fs > 6:
            fs = int(fs * 0.92)
            f = ImageFont.truetype(font, fs)
        bb = d.textbbox((0, 0), line, font=f)
        x = (w * S2 - (bb[2] - bb[0])) / 2 - bb[0] if align == "center" else w * S2 * pad - bb[0]
        d.text((x, y - bb[1] + (h * S2 * (1 - 2 * pad) * frac - (bb[3] - bb[1])) / 2), line, font=f, fill=fill)
        y += h * S2 * (1 - 2 * pad) * frac
    return img.resize((w, h), Image.LANCZOS)


def blit(cv, ys, xs, img, rough=None, metal=None, emboss=0.0, emissive=None):
    a = np.asarray(img, np.float32) / 255
    rgb, al = a[..., :3], a[..., 3]
    cv.bc[ys, xs] = cv.bc[ys, xs] * (1 - al[..., None]) + rgb * al[..., None]
    if rough is not None:
        cv.r[ys, xs] = cv.r[ys, xs] * (1 - al) + rough * al
    if metal is not None:
        cv.m[ys, xs] = cv.m[ys, xs] * (1 - al) + metal * al
    if emboss:
        cv.h[ys, xs] += al * emboss
    if emissive is not None:
        cv.e[ys, xs] = cv.e[ys, xs] * (1 - al[..., None]) + np.asarray(emissive, np.float32) * al[..., None] * rgb


# ---------------------------------------------------------------------------------------------------------------------
# Atlas industrial
# ---------------------------------------------------------------------------------------------------------------------
INDUSTRIAL_STRIPS = [
    ("steel_blue", 128, 4.0, lambda cv, r: paint_steel(cv, r, "#2f6bc4")),
    ("steel_white", 128, 4.0, lambda cv, r: paint_steel(cv, r, "#e6e9ec", wear=0.7, rust=0.8)),
    ("steel_yellow", 128, 4.0, lambda cv, r: paint_steel(cv, r, "#f0b81c", wear=1.2)),
    ("steel_grey", 128, 4.0, lambda cv, r: paint_steel(cv, r, "#4d555e", wear=0.8, rust=0.6, rough=0.55)),
    ("louver", 128, 3.0, lambda cv, r: paint_louver(cv, r)),
    ("grating", 96, 4.0, lambda cv, r: paint_grating(cv, r)),
    ("railing", 96, 2.0, lambda cv, r: paint_railing(cv, r)),
    ("ladder", 96, 3.0, lambda cv, r: paint_ladder(cv, r)),
    ("hazard", 48, 2.0, lambda cv, r: paint_hazard(cv, r)),
    ("glass", 64, 4.0, lambda cv, r: paint_glass(cv, r)),
    ("rubber", 96, 1.0, lambda cv, r: paint_rubber(cv, r)),
    ("galvanized", 64, 4.0, lambda cv, r: paint_steel(cv, r, "#a7adb2", wear=0.0, rust=0.3, rough=0.38)),
    ("cab_white", 64, 4.0, lambda cv, r: paint_steel(cv, r, "#eef0f2", wear=0.15, rust=0.15, rough=0.3)),
    ("cab_red", 64, 4.0, lambda cv, r: paint_steel(cv, r, "#b3261e", wear=0.15, rust=0.15, rough=0.3)),
    ("cab_blue", 64, 4.0, lambda cv, r: paint_steel(cv, r, "#1e4f9a", wear=0.15, rust=0.15, rough=0.3)),
    ("chassis", 64, 4.0, lambda cv, r: paint_steel(cv, r, "#1c1e21", wear=0.5, rust=0.7, rough=0.6)),
    ("chrome", 32, 2.0, lambda cv, r: paint_flat(cv, r, "#d9dde1", 0.12, 1.0, 0.02)),
    ("light_white", 32, 1.0, lambda cv, r: paint_flat(cv, r, "#fff6dc", 0.1, 0.0, 0.0, emissive="#fff3d0")),
    ("light_red", 32, 1.0, lambda cv, r: paint_flat(cv, r, "#ff3b30", 0.2, 0.0, 0.0, emissive="#ff2a1f")),
    ("light_amber", 32, 1.0, lambda cv, r: paint_flat(cv, r, "#ffb020", 0.2, 0.0, 0.0, emissive="#ff9a10")),
    ("rope", 32, 1.0, lambda cv, r: paint_rope(cv, r)),
]
ALPHA_KEYS = {"railing", "ladder"}


def industrial_atlas(outdir):
    cv = Canvas(seed=11)
    r = 0
    for key, hpx, u_m, fn in INDUSTRIAL_STRIPS:
        rows = cv.strip(key, r, r + hpx, u_m, mat=1 if key in ALPHA_KEYS else 0)
        fn(cv, rows)
        r += hpx
    assert r <= 1616, r
    y0 = r + 8
    # ----- calcomanías -----
    # tableros de número de grúa: 12 de 160×96 (fondo blanco, número negro, borde azul)
    for i in range(12):
        ys, xs = cv.decal(f"board_{i + 1:02d}", (i % 6) * 168, y0 + (i // 6) * 100, 160, 96)
        cv.bc[ys, xs] = hexc("#f4f6f8")
        cv.r[ys, xs] = 0.45
        cv.m[ys, xs] = 0
        cv.h[ys, xs] = 0
        blit(cv, ys, xs, text_img(160, 96, [f"STS {i + 1:02d}"], fill=(18, 40, 90, 255)), emboss=0.2)
        cv.bc[ys, xs][:6] = hexc("#2f6bc4")
        cv.bc[ys, xs][-6:] = hexc("#2f6bc4")
    # cartel de la terminal
    ys, xs = cv.decal("banner", 0, y0 + 204, 1016, 88)
    cv.bc[ys, xs] = hexc("#2f6bc4")
    cv.r[ys, xs] = 0.45
    cv.h[ys, xs] = 0
    blit(cv, ys, xs, text_img(1016, 88, ["TERMINAL DE CONTENEDORES · MONTEVIDEO"], font=FONT_BOLD), emboss=0.1)
    ys, xs = cv.decal("house_side", 0, y0 + 300, 1016, 112)
    cv.bc[ys, xs] = hexc("#e6e9ec")
    cv.r[ys, xs] = 0.5
    cv.h[ys, xs] = 0
    blit(cv, ys, xs, text_img(1016, 112, ["TERMINAL · MONTEVIDEO"], font=FONT_BLACK, fill=(47, 107, 196, 255)), emboss=0.1)
    # señales de seguridad 96×96
    signs = [("PELIGRO", "CARGA SUSPENDIDA", "#f2c230", (20, 20, 20, 255)),
             ("USO", "OBLIGATORIO CASCO", "#1e63c6", (255, 255, 255, 255)),
             ("20", "km/h", "#ffffff", (200, 30, 30, 255)),
             ("NO", "PASAR", "#c62828", (255, 255, 255, 255))]
    for i, (a, b, bg, fg) in enumerate(signs):
        ys, xs = cv.decal(f"sign_{i}", 1024 + i * 104, y0, 96, 96)
        cv.bc[ys, xs] = hexc(bg)
        cv.r[ys, xs] = 0.4
        cv.h[ys, xs] = 0
        blit(cv, ys, xs, text_img(96, 96, [a, b], font=FONT_BOLD, fill=fg, sizes=[0.55, 0.45]))
    # frente de camión: parrilla y faros (320×192), con emisivo en los faros
    ys, xs = cv.decal("truck_front", 1440, y0, 320, 192)
    img = Image.new("RGBA", (320 * 3, 192 * 3), (36, 38, 42, 255))
    d = ImageDraw.Draw(img)
    for k in range(9):
        d.rectangle([180, 120 + k * 36, 780, 120 + k * 36 + 18], fill=(70, 74, 80, 255))
    for x0 in (30, 790):
        d.rounded_rectangle([x0, 430, x0 + 140, 540], 18, fill=(250, 246, 230, 255))
        d.rounded_rectangle([x0 + 10, 440, x0 + 60, 530], 10, fill=(255, 190, 60, 255))
    d.rounded_rectangle([330, 40, 630, 100], 12, fill=(200, 205, 210, 255))
    img = img.resize((320, 192), Image.LANCZOS)
    blit(cv, ys, xs, img, rough=0.35, metal=0.3)
    lamp = np.zeros((192, 320, 3), np.float32)
    for x0 in (10, 263):
        lamp[143:180, x0:x0 + 47] = hexc("#fff3d0")
    cv.e[ys, xs] = lamp
    # logo de puerta del camión
    ys, xs = cv.decal("truck_door", 1440, y0 + 200, 256, 128)
    cv.bc[ys, xs] = hexc("#eef0f2")
    cv.r[ys, xs] = 0.3
    cv.h[ys, xs] = 0
    blit(cv, ys, xs, text_img(256, 128, ["TRANSPORTE", "CELESTE"], font=FONT_BLACK, fill=(30, 79, 154, 255)))
    # matrícula genérica (no reproduce el diseño oficial)
    ys, xs = cv.decal("plate", 1704, y0 + 200, 128, 48)
    cv.bc[ys, xs] = hexc("#f8f8f2")
    cv.r[ys, xs] = 0.35
    cv.h[ys, xs] = 0
    blit(cv, ys, xs, text_img(128, 48, ["STP 4821"], font=FONT_BOLD, fill=(15, 15, 15, 255)), emboss=0.3)
    # llanta (vista lateral) 160×160
    ys, xs = cv.decal("rim", 1840, y0 + 200, 160, 160)
    img = Image.new("RGBA", (480, 480), (24, 25, 27, 255))
    d = ImageDraw.Draw(img)
    d.ellipse([60, 60, 420, 420], fill=(176, 182, 188, 255))
    d.ellipse([170, 170, 310, 310], fill=(120, 126, 132, 255))
    for k in range(10):
        a = 2 * math.pi * k / 10
        x, y = 240 + 95 * math.cos(a), 240 + 95 * math.sin(a)
        d.ellipse([x - 12, y - 12, x + 12, y + 12], fill=(60, 62, 66, 255))
    img = img.resize((160, 160), Image.LANCZOS)
    blit(cv, ys, xs, img, rough=0.35, metal=0.8, emboss=0.2)
    paths = cv.save(outdir, "Industrial", alpha=True)
    return cv.items, paths


# ---------------------------------------------------------------------------------------------------------------------
# Atlas del buque
# ---------------------------------------------------------------------------------------------------------------------
def paint_hull(cv, rows, color, plates=True):
    paint_steel(cv, rows, color, wear=0.25, rust=1.4, bevel=False, rough=0.55)
    h = rows.stop - rows.start
    v = np.arange(h)[:, None] / h
    u = np.arange(S)[None, :] / S
    if plates:
        seam = smooth(0.004, 0.0, np.abs(((u * 4) % 1.0) - 0.5) - 0.496) + smooth(0.01, 0.0, np.abs(((v * 3) % 1.0) - 0.5) - 0.49)
        cv.h[rows] -= np.clip(seam, 0, 1) * 0.6
        # abolladuras suaves entre cuadernas
        cv.h[rows] += tnoise(cv.rng, h, S, 40, 30) * 0.15


def paint_windows(cv, rows, wall="#f1f3f5", rows_n=1, u_m=7.2):
    paint_steel(cv, rows, wall, wear=0.3, rust=0.7, bevel=False, rough=0.5)
    h = rows.stop - rows.start
    v = np.arange(h)[:, None] / h
    u = np.arange(S)[None, :] / S * u_m
    win = (smooth(0.31, 0.29, np.abs(((u / 2.4) % 1.0) - 0.5)) > 0.5) & (smooth(0.27, 0.25, np.abs(((v * rows_n) % 1.0) - 0.55)) > 0.5)
    win = win.astype(np.float32)
    cv.bc[rows] = cv.bc[rows] * (1 - win[..., None]) + hexc("#22303c") * win[..., None]
    cv.r[rows] = cv.r[rows] * (1 - win) + 0.08 * win
    cv.m[rows] = cv.m[rows] * (1 - win) + 0.3 * win
    cv.h[rows] -= win * 0.6
    # algunas ventanas encendidas de noche
    lit = (tnoise(cv.rng, h, S, 2, 2) > 1.0).astype(np.float32) * win
    cv.e[rows] = hexc("#ffd79a")[None, None, :] * lit[..., None] * 0.6


def paint_hatch(cv, rows):
    paint_steel(cv, rows, "#7d858d", wear=0.6, rust=1.2, bevel=False, rough=0.6)
    h = rows.stop - rows.start
    v = np.arange(h)[:, None] / h
    u = np.arange(S)[None, :] / S * 8
    ribs = smooth(0.08, 0.0, np.abs((u % 1.0) - 0.5) - 0.42) * np.ones_like(v)
    cv.h[rows] += ribs * 0.9
    cv.bc[rows] *= (1 + 0.1 * ribs)[..., None]


def ship_atlas(outdir):
    cv = Canvas(seed=23)
    layout = [
        ("hull_navy", 192, 16.0, lambda r: paint_hull(cv, r, "#1d2f4f")),
        ("hull_green", 192, 16.0, lambda r: paint_hull(cv, r, "#2a4a3a")),
        ("hull_charcoal", 192, 16.0, lambda r: paint_hull(cv, r, "#2c2f33")),
        ("hull_red", 160, 16.0, lambda r: paint_hull(cv, r, "#8e2d22")),
        ("boot_black", 48, 16.0, lambda r: paint_hull(cv, r, "#17191c", plates=False)),
        ("deck", 128, 8.0, lambda r: paint_steel(cv, r, "#5f7a68", wear=0.4, rust=1.2, bevel=False, rough=0.75)),
        ("hatch", 160, 8.0, lambda r: paint_hatch(cv, r)),
        ("super_windows", 192, 7.2, lambda r: paint_windows(cv, r)),
        ("super_plain", 96, 6.0, lambda r: paint_steel(cv, r, "#eef1f4", wear=0.3, rust=0.8, rough=0.5)),
        ("bridge_glass", 64, 6.0, lambda r: paint_glass(cv, r, "#1a2631")),
        ("funnel", 96, 6.0, lambda r: paint_steel(cv, r, "#1b1d20", wear=0.2, rust=0.3, bevel=False, rough=0.55)),
        ("lashing", 96, 4.0, lambda r: paint_railing(cv, r, color="#d9d9d6", u_m=4.0)),
        ("railing", 64, 2.0, lambda r: paint_railing(cv, r, color="#e8e8e4")),
        ("cellguide", 48, 4.0, lambda r: paint_steel(cv, r, "#c8a032", wear=1.2, rust=1.0)),
        ("machinery", 48, 4.0, lambda r: paint_steel(cv, r, "#3f6a57", wear=0.6, rust=1.0)),
        ("lifeboat", 32, 4.0, lambda r: paint_flat(cv, r, "#ff6a13", 0.45)),
        ("lights", 16, 1.0, lambda r: paint_flat(cv, r, "#fff6dc", 0.1, 0.0, 0.0, emissive="#fff3d0")),
    ]
    r = 0
    for key, hpx, u_m, fn in layout:
        rows = cv.strip(key, r, r + hpx, u_m, mat=1 if key in ("lashing", "railing") else 0)
        fn(rows)
        r += hpx
    assert r <= 1936, r
    y0 = r + 8
    # marcas de calado (escala vertical) 64×(alto restante)
    hrem = S - y0 - 4
    ys, xs = cv.decal("draft_marks", 0, y0, 512, hrem)
    cv.bc[ys, xs] = hexc("#1d2f4f")
    cv.r[ys, xs] = 0.55
    cv.h[ys, xs] = 0
    img = Image.new("RGBA", (512 * 2, hrem * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT_BOLD, int(hrem * 2 * 0.2))
    for k, txt in enumerate(["14M", "12M", "10M"]):
        d.text((40 + k * 330, 10), txt, font=f, fill=(240, 240, 240, 255))
    blit(cv, ys, xs, img.resize((512, hrem), Image.LANCZOS), emboss=0.2)
    ys, xs = cv.decal("imo", 520, y0, 512, hrem)
    cv.bc[ys, xs] = hexc("#eef1f4")
    cv.r[ys, xs] = 0.5
    cv.h[ys, xs] = 0
    blit(cv, ys, xs, text_img(512, hrem, ["IMO 9700001"], font=FONT_BOLD, fill=(30, 30, 30, 255)))
    ys, xs = cv.decal("plimsoll", 1040, y0, 256, hrem)
    cv.bc[ys, xs] = hexc("#1d2f4f")
    cv.h[ys, xs] = 0
    img = Image.new("RGBA", (256 * 2, hrem * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([60, 10, 200, hrem * 2 - 10], outline=(240, 240, 240, 255), width=8)
    d.line([20, hrem, 240, hrem], fill=(240, 240, 240, 255), width=8)
    blit(cv, ys, xs, img.resize((256, hrem), Image.LANCZOS), emboss=0.2)
    paths = cv.save(outdir, "Buque", alpha=True)
    return cv.items, paths


# ---------------------------------------------------------------------------------------------------------------------
# Atlas de contenedores
# ---------------------------------------------------------------------------------------------------------------------
# Navieras inventadas (no reproducen marcas reales): nombre, prefijo BIC (ficticio), color de caja, color del texto.
LIVERIES = [
    ("CELESTE LINES", "CLSU", "#5ea7dd", "#ffffff"),
    ("AUSTRALIS", "AUSU", "#c23b2f", "#ffffff"),
    ("TRANSPLATINA", "TPLU", "#2c4f8a", "#f2c230"),
    ("VERDEMAR", "VRDU", "#3b7a4c", "#ffffff"),
    ("PAMPERO", "PMPU", "#e07a26", "#1b1b1b"),
    ("ESTUARIO", "ESTU", "#8d9196", "#1d3a66"),
    ("SOLIS LINE", "SOLU", "#e9e2d2", "#b5242a"),
    ("NORTE SUR", "NSCU", "#5b3f78", "#ffffff"),
]
ROW = 200          # alto de cada librea (px)
# columnas de cada fila (x, ancho) en px: costado 40', costado 20', puertas, frente
COL = {"side40": (0, 940), "side20": (948, 464), "door": (1420, 188), "front": (1616, 188)}
GAP_X = 8


def container_regions():
    """UV (Blender) de cada zona de la librea 0. Las demás libreas están corridas −ROW/2048 en V."""
    out = {}
    for k, (x, w) in COL.items():
        out[k] = Decal(x / S, 1 - ROW / S, (x + w) / S, 1.0)
    out["roof_band"] = Decal(COL["side40"][0] / S, 1 - ROW / S, (COL["side40"][0] + COL["side40"][1]) / S, 1 - (ROW - 18) / S)
    out["row_dv"] = ROW / S
    return out


def corrugate(u_px, period_px, phase=0.0):
    """Perfil trapezoidal del corrugado (0 = valle, 1 = cresta)."""
    t = ((u_px / period_px) + phase) % 1.0
    return np.clip(np.minimum(t * 4, (1 - t) * 4) * 1.2 - 0.1, 0, 1)


def container_atlas(outdir, normal_bake=None):
    """Pinta albedo, rugosidad y metal de las 8 libreas. La normal/AO del corrugado (horneada) se pasa aparte."""
    cv = Canvas(seed=31)
    cv.bc[:] = 0.2
    rng = cv.rng
    font_big = FONT_BLACK
    for li, (name, prefix, color, ink) in enumerate(LIVERIES):
        y = li * ROW
        base = hexc(color)
        for key, (x, w) in COL.items():
            ys, xs = slice(y, y + ROW), slice(x, x + w)
            hgt = ROW
            # pintura con variaciones, óxido en los bordes superiores, polvo abajo
            vv = np.linspace(0, 1, hgt)[:, None] * np.ones((1, w))
            mott = tnoise(rng, hgt, w, 30, 12) * 0.05
            col = base[None, None, :] * (1 + mott[..., None])
            fade = 0.06 + 0.06 * rng.random()
            col = col * (1 - fade) + np.array([0.85, 0.85, 0.82]) * fade
            streak = np.clip(tnoise(rng, hgt, w, 2.5, 60), 0, None)
            streak = smooth(1.0, 2.5, streak) * smooth(0.6, 0.0, vv) * 0.7
            rustc = hexc("#6e3a1c")
            col = col * (1 - streak[..., None] * 0.6) + rustc * streak[..., None] * 0.6
            dust = smooth(0.7, 1.0, vv) * 0.25
            col = col * (1 - dust[..., None]) + hexc("#8a7b66") * dust[..., None]
            dents = smooth(1.8, 2.6, tnoise(rng, hgt, w, 10)) * 0.5
            col *= (1 - 0.15 * dents)[..., None]
            cv.bc[ys, xs] = np.clip(col, 0, 1)
            cv.r[ys, xs] = 0.55 + 0.25 * streak + 0.1 * dust + mott
            cv.m[ys, xs] = 0.0
            # rieles superior e inferior y postes de esquina (acero un poco más oscuro y gastado)
            band = (vv < 0.07) | (vv > 0.93)
            cv.bc[ys, xs][band] *= 0.72
            post = np.zeros((hgt, w), bool)
            post[:, :max(4, int(w * 0.012))] = True
            post[:, -max(4, int(w * 0.012)):] = True
            cv.bc[ys, xs][post] *= 0.78
            # esquineros (corner castings) pintados para el LOD sin geometría
            cw = max(6, int(w * 0.015))
            for cy in (slice(0, 14), slice(hgt - 14, hgt)):
                for cx in (slice(0, cw), slice(w - cw, w)):
                    cv.bc[ys, xs][cy, cx] = hexc("#3b3b3b")
                    cv.r[ys, xs][cy, cx] = 0.7
        # texto: nombre de la línea en los costados, número BIC arriba a la derecha
        for key, scale in (("side40", 1.0), ("side20", 0.75)):
            x, w = COL[key]
            ys, xs = slice(y, y + ROW), slice(x, x + w)
            tw = int(w * (0.62 if key == "side40" else 0.8))
            img = text_img(tw, int(ROW * 0.36), [name], font=font_big, fill=tuple(int(c * 255) for c in hexc(ink)) + (255,))
            ox, oy = (w - tw) // 2, int(ROW * 0.30)
            blit(cv, slice(y + oy, y + oy + img.height), slice(x + ox, x + ox + img.width), img, rough=0.5)
            num = f"{prefix} {rng.integers(100000, 999999)} {rng.integers(0, 9)}"
            img = text_img(int(w * 0.32 / scale * 0.8), 22, [num], font=FONT_BOLD, fill=(240, 240, 240, 255) if color not in ("#e9e2d2", "#8d9196") else (30, 30, 30, 255), align="left")
            blit(cv, slice(y + 18, y + 18 + img.height), slice(x + w - img.width - 14, x + w - 14), img)
        # puertas: barras de cierre, bisagras, placa CSC, código ISO
        x, w = COL["door"]
        ys, xs = slice(y, y + ROW), slice(x, x + w)
        img = Image.new("RGBA", (w * 3, ROW * 3), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.line([w * 3 // 2, 20, w * 3 // 2, ROW * 3 - 20], fill=(30, 30, 30, 200), width=5)
        for fx in (0.085, 0.32, 0.68, 0.915):
            X0 = int(w * 3 * fx)
            d.rectangle([X0 - 5, 30, X0 + 5, ROW * 3 - 30], fill=(200, 200, 196, 255))
            for fy in (0.32, 0.68):
                d.rectangle([X0 - 16, int(ROW * 3 * fy) - 8, X0 + 16, int(ROW * 3 * fy) + 8], fill=(150, 150, 146, 255))
        for fy in (0.12, 0.38, 0.62, 0.88):
            for sx in (14, w * 3 - 34):
                d.rectangle([sx, int(ROW * 3 * fy) - 10, sx + 20, int(ROW * 3 * fy) + 10], fill=(70, 70, 70, 255))
        d.rectangle([int(w * 3 * 0.42), int(ROW * 3 * 0.74), int(w * 3 * 0.58), int(ROW * 3 * 0.82)], fill=(210, 210, 200, 255))
        blit(cv, ys, xs, img.resize((w, ROW), Image.LANCZOS), rough=0.45, metal=0.5, emboss=0.6)
        img = text_img(int(w * 0.8), 26, [f"{prefix} 45G1"], font=FONT_BOLD, fill=(240, 240, 240, 255) if color not in ("#e9e2d2", "#8d9196") else (30, 30, 30, 255))
        blit(cv, slice(y + 16, y + 16 + img.height), slice(x + int(w * 0.1), x + int(w * 0.1) + img.width), img)
    # normal: la horneada (si hay) para todas las filas; si no, un corrugado pintado
    if normal_bake is None:
        hh = np.zeros((S, S), np.float32)
        for li in range(len(LIVERIES)):
            y = li * ROW
            for key in ("side40", "side20", "front"):
                x, w = COL[key]
                u = np.arange(w)[None, :]
                hh[y:y + ROW, x:x + w] = corrugate(u, w / (40 if key == "side40" else 20 if key == "side20" else 6)) * np.ones((ROW, 1))
        cv.h = hh
        nrm = None
    else:
        nrm = normal_bake
    paths = cv.save(outdir, "Contenedor", alpha=False, normal=nrm)
    return container_regions(), paths
