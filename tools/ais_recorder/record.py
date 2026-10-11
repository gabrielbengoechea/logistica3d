"""Graba mensajes AIS del Río de la Plata desde aisstream.io en archivos JSONL diarios (comprimidos).

Uso:
    export AISSTREAM_API_KEY=...        # se obtiene gratis en https://aisstream.io
    python record.py                    # graba en data/ais/ hasta que se corte con Ctrl+C

Se reconecta solo si se cae la conexión. Cada línea del archivo es un mensaje tal como lo manda aisstream.
"""

import asyncio
import gzip
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import websockets

URL = "wss://stream.aisstream.io/v0/stream"
# [[lat, lon], [lat, lon]]: Río de la Plata, desde Buenos Aires hasta Punta del Este.
BBOX = [[-35.60, -58.60], [-34.25, -54.90]]
MESSAGE_TYPES = ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"]
OUT_DIR = Path(os.environ.get("AIS_OUT_DIR", "data/ais"))


class DailyWriter:
    """Escribe en un archivo por día (UTC) y lo cambia a medianoche."""

    def __init__(self, out_dir: Path):
        self.out_dir = out_dir
        self.day = None
        self.file = None
        self.count = 0

    def write(self, line: str) -> None:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if day != self.day:
            self.close()
            self.out_dir.mkdir(parents=True, exist_ok=True)
            self.file = gzip.open(self.out_dir / f"ais-{day}.jsonl.gz", "at", encoding="utf-8")
            self.day = day
        self.file.write(line.rstrip("\n") + "\n")
        self.count += 1
        if self.count % 500 == 0:
            self.file.flush()
            print(f"{self.count} mensajes grabados", flush=True)

    def close(self) -> None:
        if self.file:
            self.file.close()
            self.file = None


async def record(api_key: str) -> None:
    subscription = {"APIKey": api_key, "BoundingBoxes": [BBOX], "FilterMessageTypes": MESSAGE_TYPES}
    writer = DailyWriter(OUT_DIR)
    backoff = 1
    try:
        while True:
            try:
                async with websockets.connect(URL, ping_interval=20, ping_timeout=20) as ws:
                    await ws.send(json.dumps(subscription))
                    print("Conectado a aisstream.io", flush=True)
                    backoff = 1
                    async for raw in ws:
                        writer.write(raw if isinstance(raw, str) else raw.decode("utf-8"))
            except (OSError, websockets.WebSocketException) as e:
                print(f"Conexión perdida ({e!r}); reintento en {backoff} s", file=sys.stderr, flush=True)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 300)
    finally:
        writer.close()


def main() -> None:
    api_key = os.environ.get("AISSTREAM_API_KEY")
    if not api_key:
        sys.exit("Falta la variable de entorno AISSTREAM_API_KEY (clave gratuita en https://aisstream.io).")
    try:
        asyncio.run(record(api_key))
    except KeyboardInterrupt:
        print("Grabación detenida.")


if __name__ == "__main__":
    main()
