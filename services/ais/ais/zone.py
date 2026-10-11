"""Geografía de la zona: conversión lon/lat ↔ metros locales y áreas para clasificar posiciones.

Usa el mismo zone.json que la app web, así las coordenadas coinciden exactamente con la escena 3D.
"""

import json
import math
from dataclasses import dataclass
from pathlib import Path

from pyproj import Transformer

DEFAULT_ZONE = Path(__file__).resolve().parents[3] / "public" / "zones" / "montevideo" / "zone.json"

# Áreas en el marco de la terminal (x a lo largo del muelle, z hacia tierra, z < 0 es agua).
BERTH_BAND = (-660.0, 340.0, -90.0, 15.0)  # xmin, xmax, zmin, zmax: franja de agua junto al muelle (incluye la ampliación)
# Línea aproximada de la boca del puerto: al sur de esta z (marco del mapa) se está fuera de las escolleras.
OUTSIDE_HARBOR_Z = 1400.0


@dataclass
class Zone:
    origin: tuple[float, float]
    epsg: int
    extent: dict
    terminal: dict

    @classmethod
    def load(cls, path: Path = DEFAULT_ZONE) -> "Zone":
        z = json.loads(Path(path).read_text())
        return cls(origin=tuple(z["origin"]), epsg=z["epsg"], extent=z["extent"], terminal=z["terminal"])

    def __post_init__(self):
        self._fwd = Transformer.from_crs(4326, self.epsg, always_xy=True)
        self._inv = Transformer.from_crs(self.epsg, 4326, always_xy=True)
        self._e0, self._n0 = self._fwd.transform(*self.origin)

    def to_local(self, lon: float, lat: float) -> tuple[float, float]:
        e, n = self._fwd.transform(lon, lat)
        return e - self._e0, -(n - self._n0)

    def to_lonlat(self, x: float, z: float) -> tuple[float, float]:
        return self._inv.transform(x + self._e0, self._n0 - z)

    def bbox_lonlat(self) -> tuple[float, float, float, float]:
        """(oeste, sur, este, norte) del recorte de la zona."""
        ex = self.extent
        lon0, lat0 = self.to_lonlat(ex["xmin"], ex["zmax"])
        lon1, lat1 = self.to_lonlat(ex["xmax"], ex["zmin"])
        return lon0, lat0, lon1, lat1

    def contains(self, x: float, z: float) -> bool:
        ex = self.extent
        return ex["xmin"] <= x <= ex["xmax"] and ex["zmin"] <= z <= ex["zmax"]

    def to_terminal(self, x: float, z: float) -> tuple[float, float]:
        t = self.terminal
        dx, dz = x - t["x"], z - t["z"]
        c, s = math.cos(t["yaw"]), math.sin(t["yaw"])
        return dx * c - dz * s, dx * s + dz * c

    def to_world(self, tx: float, tz: float) -> tuple[float, float]:
        t = self.terminal
        c, s = math.cos(t["yaw"]), math.sin(t["yaw"])
        return t["x"] + tx * c + tz * s, t["z"] - tx * s + tz * c

    def at_terminal_berth(self, x: float, z: float) -> bool:
        tx, tz = self.to_terminal(x, z)
        x0, x1, z0, z1 = BERTH_BAND
        return x0 <= tx <= x1 and z0 <= tz <= z1

    def outside_harbor(self, x: float, z: float) -> bool:
        return z > OUTSIDE_HARBOR_Z
