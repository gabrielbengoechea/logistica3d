"""Informe de cobertura AIS: cuántos buques y mensajes hay por hora y dónde hay huecos.

Uso:
    python coverage.py                  # lee data/ais/*.jsonl.gz
    python coverage.py otra/carpeta

Responde la pregunta del Hito 0: ¿alcanza la cobertura gratuita para ver el tráfico de Montevideo?
"""

import gzip
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# Zona del puerto de Montevideo y su canal de acceso (aproximada).
PORT_BBOX = (-34.98, -56.30, -34.88, -56.18)  # lat_min, lon_min, lat_max, lon_max


def parse_time(meta: dict) -> datetime | None:
    raw = meta.get("time_utc", "")
    try:
        return datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def in_port(lat: float, lon: float) -> bool:
    return PORT_BBOX[0] <= lat <= PORT_BBOX[2] and PORT_BBOX[1] <= lon <= PORT_BBOX[3]


def main() -> None:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else "data/ais")
    files = sorted(folder.glob("ais-*.jsonl.gz"))
    if not files:
        sys.exit(f"No hay archivos en {folder}")

    msgs_per_hour: dict[datetime, int] = defaultdict(int)
    ships_per_hour: dict[datetime, set] = defaultdict(set)
    port_ships_per_day: dict[str, set] = defaultdict(set)
    all_ships: set = set()
    with_dimensions: set = set()
    bad = 0

    for path in files:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                try:
                    m = json.loads(line)
                except json.JSONDecodeError:
                    bad += 1
                    continue
                meta = m.get("MetaData", {})
                mmsi = meta.get("MMSI")
                t = parse_time(meta)
                if mmsi is None or t is None:
                    bad += 1
                    continue
                hour = t.replace(minute=0, second=0)
                msgs_per_hour[hour] += 1
                ships_per_hour[hour].add(mmsi)
                all_ships.add(mmsi)
                lat, lon = meta.get("latitude"), meta.get("longitude")
                if lat is not None and lon is not None and in_port(lat, lon):
                    port_ships_per_day[t.strftime("%Y-%m-%d")].add(mmsi)
                if m.get("MessageType") == "ShipStaticData":
                    dim = m.get("Message", {}).get("ShipStaticData", {}).get("Dimension", {})
                    if dim.get("A", 0) + dim.get("B", 0) > 0:
                        with_dimensions.add(mmsi)

    hours = sorted(msgs_per_hour)
    first, last = hours[0], hours[-1]
    total_hours = int((last - first).total_seconds() // 3600) + 1
    empty = total_hours - len(hours)
    print(f"Período: {first:%Y-%m-%d %H:00} a {last:%Y-%m-%d %H:00} UTC ({total_hours} h)")
    print(f"Mensajes: {sum(msgs_per_hour.values())}  ·  líneas inválidas: {bad}")
    print(f"Buques distintos: {len(all_ships)}  ·  con dimensiones (eslora/manga): {len(with_dimensions)}")
    print(f"Horas sin ningún mensaje: {empty} ({empty / total_hours:.0%})")
    per_hour = [len(ships_per_hour[h]) for h in hours]
    print(f"Buques por hora: mín {min(per_hour)}, mediana {sorted(per_hour)[len(per_hour) // 2]}, máx {max(per_hour)}")
    print("\nBuques vistos en la zona del puerto de Montevideo, por día:")
    for day in sorted(port_ships_per_day):
        print(f"  {day}: {len(port_ships_per_day[day])}")

    # Huecos más largos (horas seguidas sin mensajes).
    gaps = []
    for a, b in zip(hours, hours[1:]):
        gap = int((b - a).total_seconds() // 3600) - 1
        if gap > 0:
            gaps.append((gap, a))
    if gaps:
        print("\nHuecos más largos:")
        for gap, start in sorted(gaps, reverse=True)[:5]:
            print(f"  {gap} h sin datos desde {start:%Y-%m-%d %H:00}")


if __name__ == "__main__":
    main()
