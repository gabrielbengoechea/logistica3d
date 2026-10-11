"""Conversión de posiciones guardadas al formato de eventos común de la app (src/sim/events.ts)."""

from .store import Store
from .zone import Zone

AIS_SHIP_TYPES = {
    range(30, 31): "Pesquero",
    range(31, 33): "Remolcador",
    range(35, 36): "Militar",
    range(36, 38): "Recreativo",
    range(40, 50): "Alta velocidad",
    range(50, 51): "Práctico",
    range(52, 53): "Remolcador",
    range(60, 70): "Pasajeros",
    range(70, 80): "Carga",
    range(80, 90): "Tanquero",
}


def type_label(code) -> str:
    if code is None:
        return "Sin dato"
    for r, label in AIS_SHIP_TYPES.items():
        if code in r:
            return label
    return "Otro"


def ship_info(mmsi: int, row) -> dict:
    return {
        "id": str(mmsi),
        "mmsi": mmsi,
        "name": (row["name"] if row else None) or f"MMSI {mmsi}",
        "type": type_label(row["ship_type"] if row else None),
        "typeCode": row["ship_type"] if row else None,
        "length": row["length"] if row else None,
        "beam": row["beam"] if row else None,
        "destination": row["destination"] if row else None,
    }


def position_event(zone: Zone, row, t: float) -> dict | None:
    x, z = zone.to_local(row["lon"], row["lat"])
    if not zone.contains(x, z):
        return None
    return {
        "t": t,
        "entity": str(row["mmsi"]),
        "type": "position",
        "pos": [round(x, 1), round(z, 1)],
        "data": {"sog": row["sog"], "cog": row["cog"], "heading": row["heading"], "status": row["status"]},
    }


def replay(store: Store, zone: Zone, t0: float, hours: float) -> dict:
    """Eventos de posición de un período; el tiempo de cada evento va en horas desde t0."""
    rows = store.positions(t0, t0 + hours * 3600)
    events = []
    for r in rows:
        ev = position_event(zone, r, (r["t"] - t0) / 3600)
        if ev:
            events.append(ev)
    events.sort(key=lambda e: e["t"])
    seen = {int(e["entity"]) for e in events}
    static = store.ships(seen)
    return {
        "start": t0,
        "hours": hours,
        "synthetic": store.get_meta("synthetic") == "1",
        "ships": [ship_info(m, static.get(m)) for m in sorted(seen)],
        "events": events,
    }
