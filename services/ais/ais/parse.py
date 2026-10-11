"""Lectura de los mensajes de aisstream.io (JSON) a registros simples."""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone

POSITION_TYPES = ("PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport")
_TIME = re.compile(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.(\d+))?")


@dataclass
class Position:
    mmsi: int
    t: float  # segundos Unix (UTC)
    lat: float
    lon: float
    sog: float | None  # nudos
    cog: float | None  # grados
    heading: float | None  # grados; None si el buque no lo informa
    status: int | None  # estado de navegación AIS (0 navegando, 1 fondeado, 5 amarrado, ...)


@dataclass
class Static:
    mmsi: int
    t: float
    name: str | None
    ship_type: int | None
    length: float | None  # m (A + B)
    beam: float | None  # m (C + D)
    destination: str | None
    callsign: str | None
    imo: int | None


def parse_time(meta: dict) -> float | None:
    m = _TIME.match(meta.get("time_utc", ""))
    if not m:
        return None
    dt = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    frac = float(f"0.{m.group(2)}") if m.group(2) else 0.0
    return dt.timestamp() + frac


def _clean(s) -> str | None:
    if not isinstance(s, str):
        return None
    s = s.replace("@", "").strip()
    return s or None


def _num(v, invalid=None):
    if v is None or v == invalid:
        return None
    return float(v)


def parse(raw: str | dict) -> Position | Static | None:
    """Convierte un mensaje de aisstream en Position o Static. Devuelve None si no sirve."""
    msg = json.loads(raw) if isinstance(raw, str) else raw
    kind = msg.get("MessageType")
    meta = msg.get("MetaData") or {}
    mmsi = meta.get("MMSI")
    t = parse_time(meta)
    if mmsi is None or t is None:
        return None
    body = (msg.get("Message") or {}).get(kind) or {}

    if kind in POSITION_TYPES:
        lat = body.get("Latitude", meta.get("latitude"))
        lon = body.get("Longitude", meta.get("longitude"))
        if lat is None or lon is None or abs(lat) > 90 or abs(lon) > 180:
            return None
        return Position(
            mmsi=int(mmsi),
            t=t,
            lat=float(lat),
            lon=float(lon),
            sog=_num(body.get("Sog"), invalid=102.3),
            cog=_num(body.get("Cog"), invalid=360),
            heading=_num(body.get("TrueHeading"), invalid=511),
            status=body.get("NavigationalStatus"),
        )

    if kind == "ShipStaticData":
        dim = body.get("Dimension") or {}
        a, b, c, d = (dim.get(k) or 0 for k in ("A", "B", "C", "D"))
        return Static(
            mmsi=int(mmsi),
            t=t,
            name=_clean(body.get("Name")) or _clean(meta.get("ShipName")),
            ship_type=body.get("Type"),
            length=float(a + b) if a + b > 0 else None,
            beam=float(c + d) if c + d > 0 else None,
            destination=_clean(body.get("Destination")),
            callsign=_clean(body.get("CallSign")),
            imo=body.get("ImoNumber") or None,
        )
    return None
