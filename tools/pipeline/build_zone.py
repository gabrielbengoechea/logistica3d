"""Prepara una zona para el explorador 3D: relieve, imagen satelital y geometría, en metros locales.

Uso:
    python build_zone.py montevideo            # escribe public/zones/montevideo/

Fuentes (todas abiertas, leídas directo de AWS sin descargar archivos enteros):
- Relieve: Copernicus DEM GLO-30 (~30 m).
- Imagen: Sentinel-2 L2A, color verdadero (10 m), una escena sin nubes elegida a mano.
- Geometría: Overture Maps (incluye datos de OpenStreetMap): muelles, edificios, calles y vías.

Coordenadas de salida: UTM 21S (EPSG:32721) trasladado al origen de la zona.
x = este (m), z = sur (m), así el eje y de three.js queda hacia arriba.
"""

import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]


@dataclass
class Zone:
    name: str
    # Recorte en lon/lat: (oeste, sur, este, norte).
    bbox: tuple[float, float, float, float]
    # Recorte más chico para edificios (la ciudad entera tiene decenas de miles).
    buildings_bbox: tuple[float, float, float, float]
    # Origen de las coordenadas locales (lon, lat).
    origin: tuple[float, float]
    sentinel_scene: str
    dem_tile: str
    # Ubicación de la terminal en metros locales (x, z, giro en radianes) y largo del frente de muelle.
    terminal: tuple[float, float, float, float] | None = None
    epsg: int = 32721
    dem_res: float = 30.0
    image_res: float = 10.0


ZONES = {
    "montevideo": Zone(
        name="montevideo",
        bbox=(-56.32, -34.975, -56.13, -34.855),
        buildings_bbox=(-56.235, -34.912, -56.19, -34.89),
        origin=(-56.2125, -34.9015),
        sentinel_scene="S2B_21HWB_20260208_1_L2A",
        dem_tile="Copernicus_DSM_COG_10_S35_00_W057_00_DEM",
        # Frente de muelle de la terminal de contenedores, medido sobre la imagen Sentinel-2.
        terminal=(-685.0, 317.0, 0.511, 630.0),
    ),
}

S2_BASE = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs"
DEM_BASE = "https://copernicus-dem-30m.s3.amazonaws.com"
OVERTURE_BASE = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com"
OVERTURE_RELEASE = "release/2026-09-23.1"


def configure_network() -> None:
    """GDAL no toma el proxy del entorno por sí solo; si hay uno, se lo pasamos."""
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        u = urllib.parse.urlparse(proxy)
        os.environ.setdefault("GDAL_HTTP_PROXY", f"{u.hostname}:{u.port}")
        if u.username:
            os.environ.setdefault("GDAL_HTTP_PROXYUSERPWD", f"{u.username}:{u.password}")
    for ca in ("/root/.ccr/ca-bundle.crt",):
        if Path(ca).exists():
            os.environ.setdefault("CURL_CA_BUNDLE", ca)
            os.environ.setdefault("SSL_CERT_FILE", ca)
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")


class Local:
    """Conversión lon/lat ↔ metros locales."""

    def __init__(self, zone: Zone):
        self.to_utm = Transformer.from_crs(4326, zone.epsg, always_xy=True)
        self.e0, self.n0 = self.to_utm.transform(*zone.origin)
        w, s, e, n = zone.bbox
        xs, ys = self.to_utm.transform([w, e, w, e], [s, s, n, n])
        # Extensión en UTM, redondeada a la resolución del relieve.
        self.emin, self.emax = min(xs), max(xs)
        self.nmin, self.nmax = min(ys), max(ys)

    def xz(self, lon, lat):
        e, n = self.to_utm.transform(lon, lat)
        return np.asarray(e) - self.e0, -(np.asarray(n) - self.n0)

    def extent(self) -> dict:
        return {
            "xmin": round(self.emin - self.e0, 1),
            "xmax": round(self.emax - self.e0, 1),
            "zmin": round(-(self.nmax - self.n0), 1),
            "zmax": round(-(self.nmin - self.n0), 1),
        }


def warp_to_grid(url: str, local: Local, res: float, epsg: int, bands=None, resampling="bilinear"):
    """Lee un raster remoto y lo reproyecta a la grilla local (filas de norte a sur, columnas de oeste a este)."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import from_origin
    from rasterio.warp import reproject

    width = int(round((local.emax - local.emin) / res))
    height = int(round((local.nmax - local.nmin) / res))
    dst_transform = from_origin(local.emin, local.nmax, res, res)
    with rasterio.open(url) as src:
        idx = bands or list(range(1, src.count + 1))
        out = np.zeros((len(idx), height, width), dtype=np.float32)
        for k, b in enumerate(idx):
            reproject(
                source=rasterio.band(src, b),
                destination=out[k],
                dst_transform=dst_transform,
                dst_crs=f"EPSG:{epsg}",
                resampling=getattr(Resampling, resampling),
            )
    return out


def build_terrain(zone: Zone, local: Local, out: Path) -> dict:
    url = f"/vsicurl/{DEM_BASE}/{zone.dem_tile}/{zone.dem_tile}.tif"
    h = warp_to_grid(url, local, zone.dem_res, zone.epsg)[0]
    # En el DEM el agua queda cerca de 0 m. La bajamos un poco para que quede bajo el plano de agua.
    h = np.where(h < 0.5, -3.0, h)
    # Codificación Terrarium (PNG RGB): altura = R*256 + G + B/256 - 32768. Precisión de ~4 mm.
    v = np.clip(h + 32768.0, 0, 65535.996)
    r = np.floor(v / 256)
    g = np.floor(v - r * 256)
    b = np.floor((v - r * 256 - g) * 256)
    Image.fromarray(np.stack([r, g, b], axis=-1).astype(np.uint8), "RGB").save(out / "terrain.png", optimize=True)
    old = out / "terrain.bin"
    if old.exists():
        old.unlink()
    print(f"relieve: {h.shape[1]}x{h.shape[0]} celdas, {h.min():.1f} a {h.max():.1f} m")
    return {"file": "terrain.png", "encoding": "terrarium", "cols": int(h.shape[1]), "rows": int(h.shape[0]), "res": zone.dem_res, "min": float(h.min()), "max": float(h.max())}


def build_imagery(zone: Zone, local: Local, out: Path) -> dict:
    parts = zone.sentinel_scene.split("_")
    tile, date = parts[1], parts[2]
    zone_num, band, square = tile[:2], tile[2], tile[3:]
    url = f"/vsicurl/{S2_BASE}/{zone_num}/{band}/{square}/{date[:4]}/{int(date[4:6])}/{zone.sentinel_scene}/TCI.tif"
    rgb = warp_to_grid(url, local, zone.image_res, zone.epsg, resampling="bilinear")
    img = np.transpose(rgb, (1, 2, 0))
    # El color verdadero de Sentinel-2 sale oscuro: estiramiento suave por percentiles y un poco de gamma.
    lo, hi = np.percentile(img[img > 0], [1, 99.5])
    img = np.clip((img - lo) / (hi - lo), 0, 1) ** 0.85
    Image.fromarray((img * 255).astype(np.uint8)).save(out / "imagery.jpg", quality=86, optimize=True)
    print(f"imagen: {img.shape[1]}x{img.shape[0]} px")
    return {"file": "imagery.jpg", "width": int(img.shape[1]), "height": int(img.shape[0]), "res": zone.image_res, "source": f"Copernicus Sentinel-2 ({date[:4]}-{date[4:6]}-{date[6:]})"}


# ---------- Overture ----------


def s3_list(prefix: str) -> list[str]:
    keys, token = [], None
    while True:
        q = f"?list-type=2&prefix={urllib.parse.quote(prefix)}" + (f"&continuation-token={urllib.parse.quote(token)}" if token else "")
        xml = urllib.request.urlopen(f"{OVERTURE_BASE}/{q}").read().decode()
        keys += re.findall(r"<Key>([^<]*)</Key>", xml)
        m = re.search(r"<NextContinuationToken>([^<]*)<", xml)
        if not m:
            return [k for k in keys if k.endswith(".parquet")]
        token = m.group(1)


def overture_rows(theme: str, typ: str, bbox, columns: list[str]):
    """Filas de Overture dentro del bbox. Usa las estadísticas de cada bloque para no bajar el resto."""
    import fsspec
    import pyarrow.compute as pc
    import pyarrow.parquet as pq
    import shapely

    fs = fsspec.filesystem("https", client_kwargs={"trust_env": True})
    w, s, e, n = bbox
    rows = []
    keys = s3_list(f"{OVERTURE_RELEASE}/theme={theme}/type={typ}/")
    for key in keys:
        with fs.open(f"{OVERTURE_BASE}/{key}", "rb", block_size=2**16) as f:
            pf = pq.ParquetFile(f)
            md = pf.metadata
            names = [md.row_group(0).column(j).path_in_schema for j in range(md.num_columns)]
            col = {name: j for j, name in enumerate(names)}
            hits = []
            for i in range(md.num_row_groups):
                st = {k: md.row_group(i).column(col[f"bbox.{k}"]).statistics for k in ("xmin", "xmax", "ymin", "ymax")}
                if st["xmin"].min > e or st["xmax"].max < w or st["ymin"].min > n or st["ymax"].max < s:
                    continue
                hits.append(i)
            if not hits:
                continue
            t = pf.read_row_groups(hits, columns=columns + ["bbox", "geometry"])
            bb = t.column("bbox")
            mask = pc.and_(
                pc.and_(pc.less_equal(pc.struct_field(bb, "xmin"), e), pc.greater_equal(pc.struct_field(bb, "xmax"), w)),
                pc.and_(pc.less_equal(pc.struct_field(bb, "ymin"), n), pc.greater_equal(pc.struct_field(bb, "ymax"), s)),
            )
            t = t.filter(mask)
            geoms = shapely.from_wkb(t.column("geometry").to_numpy(zero_copy_only=False))
            data = t.select(columns).to_pylist()
            for g, d in zip(geoms, data):
                d["geometry"] = g
                rows.append(d)
    print(f"overture {theme}/{typ}: {len(rows)} elementos")
    return rows


def rings_local(poly, local: Local, tol: float = 1.0):
    """Anillo exterior de un polígono, simplificado y en metros locales."""
    import shapely

    xs, zs = local.xz(*np.asarray(poly.exterior.coords).T)
    ring = shapely.Polygon(np.column_stack([xs, zs])).simplify(tol)
    if ring.is_empty or ring.geom_type != "Polygon":
        return None
    return [[round(x, 1), round(z, 1)] for x, z in ring.exterior.coords[:-1]]


def line_local(line, local: Local, tol: float = 2.0):
    import shapely

    xs, zs = local.xz(*np.asarray(line.coords).T)
    ln = shapely.LineString(np.column_stack([xs, zs])).simplify(tol)
    return [[round(x, 1), round(z, 1)] for x, z in ln.coords]


def polygons(g):
    if g.geom_type == "Polygon":
        return [g]
    if g.geom_type == "MultiPolygon":
        return list(g.geoms)
    return []


def lines(g):
    if g.geom_type == "LineString":
        return [g]
    if g.geom_type == "MultiLineString":
        return list(g.geoms)
    return []


def building_height(b: dict) -> float:
    if b.get("height"):
        return float(b["height"])
    if b.get("num_floors"):
        return float(b["num_floors"]) * 3.2
    return 8.0


def build_vectors(zone: Zone, local: Local, out: Path) -> dict:
    data = {"buildings": [], "piers": [], "areas": [], "roads": [], "rails": []}

    for b in overture_rows("buildings", "building", zone.buildings_bbox, ["height", "num_floors", "class"]):
        for p in polygons(b["geometry"]):
            ring = rings_local(p, local)
            if ring and len(ring) >= 3:
                data["buildings"].append({"h": round(building_height(b), 1), "ring": ring})

    for r in overture_rows("base", "infrastructure", zone.bbox, ["subtype", "class", "names"]):
        name = (r.get("names") or {}).get("primary")
        if r["class"] in ("pier", "quay", "breakwater", "groyne", "dock"):
            for p in polygons(r["geometry"]):
                ring = rings_local(p, local)
                if ring:
                    data["piers"].append({"class": r["class"], "name": name, "ring": ring})
            for ln in lines(r["geometry"]):
                data["piers"].append({"class": r["class"], "name": name, "line": line_local(ln, local)})

    for r in overture_rows("base", "land_use", zone.bbox, ["subtype", "class", "names"]):
        if r["class"] in ("port", "harbour", "industrial", "container_terminal") or r["subtype"] == "transportation":
            for p in polygons(r["geometry"]):
                ring = rings_local(p, local, tol=3)
                if ring:
                    data["areas"].append({"class": r["class"], "name": (r.get("names") or {}).get("primary"), "ring": ring})

    keep_roads = {"motorway", "trunk", "primary", "secondary", "tertiary"}
    for r in overture_rows("transportation", "segment", zone.bbox, ["subtype", "class"]):
        for ln in lines(r["geometry"]):
            if r["subtype"] == "rail":
                data["rails"].append(line_local(ln, local))
            elif r["subtype"] == "road" and r["class"] in keep_roads:
                data["roads"].append({"class": r["class"], "pts": line_local(ln, local)})

    (out / "vectors.json").write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print({k: len(v) for k, v in data.items()})
    return {"file": "vectors.json", "source": "Overture Maps (incluye datos de OpenStreetMap, ODbL)"}


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else "montevideo"
    steps = set(sys.argv[2:]) or {"terrain", "imagery", "vectors"}
    zone = ZONES[name]
    configure_network()
    local = Local(zone)
    out = ROOT / "public" / "zones" / zone.name
    out.mkdir(parents=True, exist_ok=True)
    meta_path = out / "zone.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta.update({"name": zone.name, "origin": zone.origin, "epsg": zone.epsg, "extent": local.extent()})
    if zone.terminal:
        x, z, yaw, quay = zone.terminal
        meta["terminal"] = {"x": x, "z": z, "yaw": yaw, "quayLength": quay}
    if "terrain" in steps:
        meta["terrain"] = build_terrain(zone, local, out)
    if "imagery" in steps:
        meta["imagery"] = build_imagery(zone, local, out)
    if "vectors" in steps:
        meta["vectors"] = build_vectors(zone, local, out)
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"listo: {out}")


if __name__ == "__main__":
    main()
