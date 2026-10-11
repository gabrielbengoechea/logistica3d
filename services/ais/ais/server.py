"""API del servicio AIS.

    uvicorn ais.server:main_app --factory --port 8000

Variables de entorno:
    AISSTREAM_API_KEY   si está, se conecta a aisstream.io y graba en vivo
    AIS_DB              ruta de la base SQLite (por defecto data/ais.sqlite)
    AIS_ZONE            ruta del zone.json (por defecto el de Montevideo de la app)
"""

import asyncio
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .events import position_event, replay, ship_info
from .parse import Position, Static, parse
from .stats import calibration
from .store import Store
from .zone import DEFAULT_ZONE, Zone

TZ = ZoneInfo("America/Montevideo")
AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"


def day_bounds(d: date) -> tuple[float, float]:
    start = datetime(d.year, d.month, d.day, tzinfo=TZ)
    return start.timestamp(), (start + timedelta(days=1)).timestamp()


def parse_day(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise HTTPException(400, f"Fecha inválida: {s} (se espera AAAA-MM-DD)")


class Hub:
    """Clientes conectados al websocket en vivo."""

    def __init__(self):
        self.clients: set[WebSocket] = set()

    async def broadcast(self, msg: dict) -> None:
        text = json.dumps(msg)
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            except Exception:
                self.clients.discard(ws)


async def ingest(store: Store, zone: Zone, hub: Hub, api_key: str) -> None:
    import websockets

    w, s, e, n = zone.bbox_lonlat()
    sub = {
        "APIKey": api_key,
        "BoundingBoxes": [[[s, w], [n, e]]],
        "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"],
    }
    backoff = 1
    while True:
        try:
            async with websockets.connect(AISSTREAM_URL, ping_interval=20, ping_timeout=20) as ws:
                await ws.send(json.dumps(sub))
                backoff = 1
                pending = 0
                async for raw in ws:
                    rec = parse(raw)
                    if rec is None:
                        continue
                    saved = store.add(rec)
                    pending += 1
                    if pending >= 200:
                        store.commit()
                        pending = 0
                    if isinstance(rec, Position) and saved:
                        ev = position_event(zone, vars(rec), rec.t)
                        if ev:
                            ship = store.ships([rec.mmsi]).get(rec.mmsi)
                            await hub.broadcast({"event": ev, "ship": ship_info(rec.mmsi, ship)})
        except asyncio.CancelledError:
            store.commit()
            raise
        except Exception as err:
            print(f"AIS: conexión perdida ({err!r}); reintento en {backoff} s", file=sys.stderr, flush=True)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 300)


def create_app(db_path: str | Path, zone_path: str | Path = DEFAULT_ZONE, api_key: str | None = None) -> FastAPI:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    store = Store(db_path)
    zone = Zone.load(Path(zone_path))
    hub = Hub()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        task = asyncio.create_task(ingest(store, zone, hub, api_key)) if api_key else None
        yield
        if task:
            task.cancel()

    app = FastAPI(title="Logística 3D · AIS", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

    @app.get("/api/health")
    def health():
        t0, t1 = store.time_range()
        return {"ok": True, "live": bool(api_key), "synthetic": store.get_meta("synthetic") == "1", "from": t0, "to": t1}

    @app.get("/api/days")
    def days():
        rows = store.db.execute("SELECT t FROM positions").fetchall()
        counts: dict[str, int] = {}
        for (t,) in rows:
            d = datetime.fromtimestamp(t, TZ).date().isoformat()
            counts[d] = counts.get(d, 0) + 1
        return [{"date": d, "positions": c} for d, c in sorted(counts.items())]

    @app.get("/api/replay")
    def get_replay(date: str):
        t0, _ = day_bounds(parse_day(date))
        return replay(store, zone, t0, 24)

    @app.get("/api/stats")
    def get_stats(start: str, end: str):
        t0, _ = day_bounds(parse_day(start))
        _, t1 = day_bounds(parse_day(end))
        if t1 <= t0:
            raise HTTPException(400, "El fin tiene que ser posterior al inicio")
        return calibration(store, zone, t0, t1)

    @app.get("/api/live/snapshot")
    def snapshot(minutes: int = 20):
        now = time.time()
        rows = store.latest(now - minutes * 60)
        events = [ev for r in rows if (ev := position_event(zone, r, r["t"]))]
        mmsis = sorted({int(e["entity"]) for e in events})
        static = store.ships(mmsis)
        return {"now": now, "ships": [ship_info(m, static.get(m)) for m in mmsis], "events": events}

    @app.websocket("/api/live")
    async def live(ws: WebSocket):
        await ws.accept()
        hub.clients.add(ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            hub.clients.discard(ws)

    app.state.store = store
    app.state.hub = hub
    app.state.zone = zone
    return app


def main_app() -> FastAPI:
    """Fábrica para uvicorn: uvicorn ais.server:main_app --factory"""
    return create_app(
        os.environ.get("AIS_DB", "data/ais.sqlite"),
        os.environ.get("AIS_ZONE", DEFAULT_ZONE),
        os.environ.get("AISSTREAM_API_KEY"),
    )
