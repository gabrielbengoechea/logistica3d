import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

from ais.importer import import_files
from ais.parse import Position, Static, parse
from ais.server import create_app, day_bounds
from ais.stats import calibration
from ais.store import Store
from ais.synthetic import generate
from ais.zone import Zone

DAY = date(2026, 10, 10)


def test_parse_position():
    raw = {
        "MessageType": "PositionReport",
        "MetaData": {"MMSI": 123, "latitude": -34.9, "longitude": -56.2, "time_utc": "2026-10-10 12:00:05.123456 +0000 UTC"},
        "Message": {"PositionReport": {"Latitude": -34.9, "Longitude": -56.2, "Sog": 10.5, "Cog": 45.0, "TrueHeading": 511, "NavigationalStatus": 0}},
    }
    p = parse(json.dumps(raw))
    assert isinstance(p, Position)
    assert p.mmsi == 123 and p.sog == 10.5 and p.heading is None
    assert p.t == pytest.approx(1791633605.123456)


def test_parse_static_dimensions():
    raw = {
        "MessageType": "ShipStaticData",
        "MetaData": {"MMSI": 9, "time_utc": "2026-10-10 12:00:00 +0000 UTC"},
        "Message": {"ShipStaticData": {"Name": "CERRO AZUL@@@", "Type": 71, "Dimension": {"A": 200, "B": 94, "C": 20, "D": 20}}},
    }
    s = parse(raw)
    assert isinstance(s, Static)
    assert (s.name, s.length, s.beam) == ("CERRO AZUL", 294, 40)


def test_parse_ignores_garbage():
    assert parse({"MessageType": "PositionReport", "MetaData": {}}) is None
    assert parse({"MessageType": "Other", "MetaData": {"MMSI": 1, "time_utc": "2026-10-10 00:00:00"}}) is None


def test_zone_roundtrip():
    zone = Zone.load()
    lon, lat = zone.to_lonlat(-685, 317)
    x, z = zone.to_local(lon, lat)
    assert (x, z) == (pytest.approx(-685, abs=0.01), pytest.approx(317, abs=0.01))
    assert zone.at_terminal_berth(*zone.to_world(0, -30))
    assert not zone.at_terminal_berth(*zone.to_world(0, 200))


@pytest.fixture(scope="module")
def store(tmp_path_factory):
    path = tmp_path_factory.mktemp("ais") / "data.jsonl"
    path.write_text("\n".join(json.dumps(m) for m in generate(DAY)))
    s = Store(tmp_path_factory.mktemp("db") / "ais.sqlite")
    read, kept = import_files(s, [path])
    assert kept > 0 and kept <= read
    return s


def test_replay_events_are_local_and_sorted(store):
    from ais.events import replay

    zone = Zone.load()
    t0, _ = day_bounds(DAY)
    r = replay(store, zone, t0, 24)
    assert len(r["ships"]) == 8
    ts = [e["t"] for e in r["events"]]
    assert ts == sorted(ts) and 0 <= ts[0] and ts[-1] < 24
    ex = zone.extent
    for e in r["events"]:
        x, z = e["pos"]
        assert ex["xmin"] <= x <= ex["xmax"] and ex["zmin"] <= z <= ex["zmax"]


def test_calibration_finds_terminal_calls(store):
    zone = Zone.load()
    t0, t1 = day_bounds(DAY)
    c = calibration(store, zone, t0, t1)
    # Los buques que atracan en el día: llegan a las -4, 2.5, 7, 12 y 15.5 h; el primero atraca antes del día.
    assert 3 <= c["berthCalls"] <= 5
    assert all(14 <= s["berthH"] <= 20.5 for s in c["stays"] if not s["ongoing"])
    assert any(s["ongoing"] for s in c["stays"])
    assert 14 <= c["avgBerthH"] <= 20.5
    assert any(s["anchored"] and s["waitH"] > 1 for s in c["stays"])
    assert not any(s["name"].startswith("SINTETICO R") for s in c["stays"])


def test_api(tmp_path):
    path = tmp_path / "data.jsonl"
    path.write_text("\n".join(json.dumps(m) for m in generate(DAY)))
    app = create_app(tmp_path / "ais.sqlite")
    import_files(app.state.store, [path])
    app.state.store.set_meta("synthetic", "1")
    with TestClient(app) as client:
        assert client.get("/api/health").json()["synthetic"] is True
        assert any(d["date"] == "2026-10-10" for d in client.get("/api/days").json())
        r = client.get("/api/replay", params={"date": "2026-10-10"}).json()
        assert r["synthetic"] and r["events"]
        s = client.get("/api/stats", params={"start": "2026-10-10", "end": "2026-10-10"}).json()
        assert s["berthCalls"] >= 3
        assert client.get("/api/replay", params={"date": "10/10/2026"}).status_code == 400


def test_live_websocket_broadcast(tmp_path):
    app = create_app(tmp_path / "ais.sqlite")
    with TestClient(app) as client:
        with client.websocket_connect("/api/live") as ws:
            msg = {"event": {"t": 1.0, "entity": "1", "type": "position", "pos": [0, 0]}, "ship": {"id": "1"}}
            client.portal.call(app.state.hub.broadcast, msg)
            assert ws.receive_json() == msg
