"""Genera un día de mensajes AIS sintéticos, con el formato exacto de aisstream.io.

Sirve para probar el servicio y la app de punta a punta antes de tener datos reales.
NO son datos reales: la app los muestra marcados como sintéticos.

    python -m ais.synthetic --date 2026-10-10 --out data/synthetic-2026-10-10.jsonl.gz
"""

import argparse
import gzip
import json
import math
import random
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from .zone import Zone

TZ = ZoneInfo("America/Montevideo")
# Rutas en metros del mapa (las mismas que usa la app para los buques simulados).
ENTRY = (-1250.0, 7800.0)
MOUTH = (-1080.0, 1350.0)
TURN = (-1150.0, 350.0)
KNOT = 1852 / 3600  # m/s


def _fmt_time(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f +0000 UTC")


class Track:
    """Recorrido de un buque como lista de tramos: (t_inicio, t_fin, punto_a, punto_b, estado)."""

    def __init__(self):
        # (inicio, fin, desde, hasta, estado AIS, proa fija en grados o None para seguir el rumbo)
        self.legs: list[tuple[float, float, tuple, tuple, int, float | None]] = []
        self.heading: float | None = None

    def sail(self, t: float, pts: list[tuple[float, float]], knots: float, heading: float | None = None) -> float:
        for a, b in zip(pts, pts[1:]):
            dur = math.dist(a, b) / (knots * KNOT)
            self.legs.append((t, t + dur, a, b, 0, heading))
            t += dur
        return t

    def stay(self, t: float, p: tuple[float, float], hours: float, status: int, heading: float | None = None) -> float:
        self.legs.append((t, t + hours * 3600, p, p, status, heading))
        return t + hours * 3600

    def at(self, t: float):
        for t0, t1, a, b, status, fixed in self.legs:
            if t0 <= t <= t1:
                u = (t - t0) / (t1 - t0) if t1 > t0 else 0
                x, z = a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u
                moving = a != b
                sog = math.dist(a, b) / (t1 - t0) / KNOT if moving else 0.0
                # Rumbo: grados desde el norte, en sentido horario (z apunta al sur).
                cog = (math.degrees(math.atan2(b[0] - a[0], -(b[1] - a[1]))) + 360) % 360 if moving else None
                return x, z, sog, cog, status, fixed if fixed is not None else cog
        return None


def generate(day: date, seed: int = 3) -> list[dict]:
    zone = Zone.load()
    rnd = random.Random(seed)
    t_day = datetime(day.year, day.month, day.day, tzinfo=TZ).timestamp()
    ships = []

    # Portacontenedores que atracan en la terminal (muelles 1 y 2 sobre el frente real).
    berths = [zone.to_world(-157.5, -27), zone.to_world(157.5, -27)]
    # Proa a lo largo del muelle (grados desde el norte): los buques amarrados informan su proa.
    quay_heading = (90 - math.degrees(zone.terminal["yaw"])) % 360
    offs = [zone.to_world(-157.5, -290), zone.to_world(157.5, -290)]
    free_at = [t_day - 6 * 3600, t_day + 3 * 3600]
    for i, (arrive_h, length) in enumerate([(-4, 294), (2.5, 260), (7, 300), (12, 228), (15.5, 276)]):
        tr = Track()
        anchor = (-3200 + i * 450 + rnd.uniform(-60, 60), 4500 + rnd.uniform(-150, 150))
        t = t_day + arrive_h * 3600
        t = tr.sail(t - 1.2 * 3600, [ENTRY, anchor], 11)
        b = min(range(2), key=lambda k: free_at[k])
        wait_until = max(t + 0.5 * 3600, free_at[b])
        anchor_heading = (math.degrees(math.atan2(anchor[0] - ENTRY[0], -(anchor[1] - ENTRY[1]))) + 360) % 360
        t = tr.stay(t, anchor, (wait_until - t) / 3600, 1, anchor_heading)
        t = tr.sail(t, [anchor, MOUTH, TURN, offs[b]], 8)
        # Los remolcadores lo empujan de costado: la proa queda a lo largo del muelle.
        t = tr.sail(t, [offs[b], berths[b]], 1.5, quay_heading)
        t = tr.stay(t, berths[b], rnd.uniform(14, 20), 5, quay_heading)
        free_at[b] = t + 0.5 * 3600
        t = tr.sail(t, [berths[b], offs[b]], 1.5, quay_heading)
        tr.sail(t, [offs[b], TURN, MOUTH, ENTRY], 9)
        ships.append({"mmsi": 770576100 + i, "name": f"SINTETICO {i + 1}", "type": 71, "length": length, "beam": 40 if length > 260 else 32, "track": tr})

    # Tránsito por el río sin entrar al puerto.
    for i in range(3):
        tr = Track()
        t = t_day + rnd.uniform(0, 18) * 3600
        tr.sail(t, [(-9500, 3000 + i * 900), (7400, 5200 + i * 700)], rnd.uniform(9, 13))
        ships.append({"mmsi": 770576200 + i, "name": f"SINTETICO R{i + 1}", "type": 80, "length": 180, "beam": 30, "track": tr})

    msgs = []
    for s in ships:
        a, c = s["length"] * 0.8, s["beam"] / 2
        for t in range(int(t_day - 6 * 3600), int(t_day + 24 * 3600), 60):
            st = s["track"].at(t)
            if st is None:
                continue
            x, z, sog, cog, status, heading = st
            lon, lat = zone.to_lonlat(x, z)
            meta = {"MMSI": s["mmsi"], "ShipName": s["name"], "latitude": lat, "longitude": lon, "time_utc": _fmt_time(t)}
            msgs.append(
                {
                    "MessageType": "PositionReport",
                    "MetaData": meta,
                    "Message": {
                        "PositionReport": {
                            "UserID": s["mmsi"],
                            "Latitude": lat,
                            "Longitude": lon,
                            "Sog": round(sog, 1),
                            "Cog": round(cog, 1) if cog is not None else 360,
                            "TrueHeading": round(heading) % 360 if heading is not None else 511,
                            "NavigationalStatus": status,
                        }
                    },
                }
            )
            if t % 1800 == 0:
                msgs.append(
                    {
                        "MessageType": "ShipStaticData",
                        "MetaData": meta,
                        "Message": {
                            "ShipStaticData": {
                                "UserID": s["mmsi"],
                                "Name": s["name"],
                                "Type": s["type"],
                                "Dimension": {"A": round(a), "B": s["length"] - round(a), "C": round(c), "D": s["beam"] - round(c)},
                                "Destination": "MONTEVIDEO",
                                "CallSign": "SYN",
                                "ImoNumber": 0,
                            }
                        },
                    }
                )
    msgs.sort(key=lambda m: m["MetaData"]["time_utc"])
    return msgs


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    msgs = generate(date.fromisoformat(args.date))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(args.out, "wt", encoding="utf-8") as f:
        for m in msgs:
            f.write(json.dumps(m) + "\n")
    print(f"{len(msgs)} mensajes sintéticos en {args.out}")


if __name__ == "__main__":
    main()
