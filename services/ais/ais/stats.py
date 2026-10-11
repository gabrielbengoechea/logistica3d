"""Estadísticas para calibrar el simulador a partir del AIS guardado.

Para cada buque se detectan las estadías en el muelle de la terminal (quieto junto al muelle al menos 1 h)
y la espera previa en el fondeadero (quieto fuera de las escolleras justo antes de atracar).
"""

from collections import defaultdict

from .events import ship_info
from .store import Store
from .zone import Zone

MIN_STAY_H = 1.0
MAX_GAP_H = 2.0  # un hueco de datos más largo corta la estadía
ANCHOR_LOOKBACK_H = 6.0  # fondeo que termina hasta 6 h antes del atraque cuenta como espera


def _segments(points: list[tuple[float, bool]], max_gap_s: float) -> list[tuple[float, float]]:
    """Tramos continuos donde la condición es verdadera: [(inicio, fin)] en segundos."""
    segs, start, last = [], None, None
    for t, ok in points:
        if ok and start is not None and t - last > max_gap_s:
            segs.append((start, last))
            start = None
        if ok:
            start = t if start is None else start
            last = t
        elif start is not None:
            segs.append((start, last))
            start = None
    if start is not None:
        segs.append((start, last))
    return segs


def terminal_stays(store: Store, zone: Zone, t0: float, t1: float) -> list[dict]:
    # Se mira también el día anterior para encontrar fondeos que empezaron antes del período.
    rows = store.positions(t0 - 86400, t1)
    by_ship = defaultdict(list)
    for r in rows:
        x, z = zone.to_local(r["lon"], r["lat"])
        slow = r["sog"] is not None and r["sog"] < 1.0
        anchored = (r["status"] == 1 or (r["sog"] is not None and r["sog"] < 0.5)) and zone.outside_harbor(x, z)
        by_ship[r["mmsi"]].append((r["t"], slow and zone.at_terminal_berth(x, z), anchored))

    static = store.ships(by_ship.keys())
    stays = []
    for mmsi, pts in by_ship.items():
        berth = _segments([(t, b) for t, b, _ in pts], MAX_GAP_H * 3600)
        anchor = _segments([(t, a) for t, _, a in pts], MAX_GAP_H * 3600)
        for start, end in berth:
            if (end - start) / 3600 < MIN_STAY_H or not (t0 <= start < t1):
                continue
            before = [s for s in anchor if s[1] <= start and start - s[1] <= ANCHOR_LOOKBACK_H * 3600]
            wait_start = before[-1][0] if before else None
            info = ship_info(mmsi, static.get(mmsi))
            stays.append(
                {
                    "mmsi": mmsi,
                    "name": info["name"],
                    "berthStart": start,
                    "berthEnd": end,
                    "berthH": round((end - start) / 3600, 2),
                    "anchored": wait_start is not None,
                    "waitH": round((start - wait_start) / 3600, 2) if wait_start else 0.0,
                    # Sigue atracado al final de los datos: la duración real es mayor.
                    "ongoing": end >= min(t1, pts[-1][0]) - 1800,
                }
            )
    stays.sort(key=lambda s: s["berthStart"])
    return stays


def calibration(store: Store, zone: Zone, t0: float, t1: float) -> dict:
    stays = terminal_stays(store, zone, t0, t1)
    days = (t1 - t0) / 86400
    n = len(stays)
    done = [s for s in stays if not s["ongoing"]]
    return {
        "from": t0,
        "to": t1,
        "days": days,
        "berthCalls": n,
        "callsPerDay": round(n / days, 2) if days else 0,
        "avgBerthH": round(sum(s["berthH"] for s in done) / len(done), 2) if done else None,
        "avgWaitH": round(sum(s["waitH"] for s in stays) / n, 2) if n else None,
        "shareAnchored": round(sum(s["anchored"] for s in stays) / n, 2) if n else None,
        "stays": stays,
    }
