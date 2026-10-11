"""Almacenamiento en SQLite: posiciones (submuestreadas) y datos fijos de cada buque."""

import sqlite3
from pathlib import Path

from .parse import Position, Static

SCHEMA = """
CREATE TABLE IF NOT EXISTS positions (
  mmsi INTEGER NOT NULL,
  t REAL NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  sog REAL,
  cog REAL,
  heading REAL,
  status INTEGER
);
CREATE INDEX IF NOT EXISTS positions_t ON positions (t);
CREATE INDEX IF NOT EXISTS positions_mmsi_t ON positions (mmsi, t);
CREATE TABLE IF NOT EXISTS ships (
  mmsi INTEGER PRIMARY KEY,
  name TEXT,
  ship_type INTEGER,
  length REAL,
  beam REAL,
  destination TEXT,
  callsign TEXT,
  imo INTEGER,
  updated REAL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""

# Un buque informa su posición cada pocos segundos; con una cada 30 s alcanza para el replay y las estadísticas.
MIN_INTERVAL_S = 30.0


class Store:
    def __init__(self, path: str | Path):
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self._last: dict[int, float] = {}

    def add(self, rec: Position | Static) -> bool:
        """Guarda un registro. Devuelve True si la posición se guardó (no se descartó por submuestreo)."""
        if isinstance(rec, Static):
            self.db.execute(
                """INSERT INTO ships (mmsi, name, ship_type, length, beam, destination, callsign, imo, updated)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(mmsi) DO UPDATE SET
                     name = coalesce(excluded.name, name), ship_type = coalesce(excluded.ship_type, ship_type),
                     length = coalesce(excluded.length, length), beam = coalesce(excluded.beam, beam),
                     destination = coalesce(excluded.destination, destination), callsign = coalesce(excluded.callsign, callsign),
                     imo = coalesce(excluded.imo, imo), updated = excluded.updated""",
                (rec.mmsi, rec.name, rec.ship_type, rec.length, rec.beam, rec.destination, rec.callsign, rec.imo, rec.t),
            )
            return False
        last = self._last.get(rec.mmsi)
        if last is not None and rec.t - last < MIN_INTERVAL_S:
            return False
        self._last[rec.mmsi] = rec.t
        self.db.execute(
            "INSERT INTO positions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (rec.mmsi, rec.t, rec.lat, rec.lon, rec.sog, rec.cog, rec.heading, rec.status),
        )
        return True

    def commit(self) -> None:
        self.db.commit()

    def set_meta(self, key: str, value: str) -> None:
        self.db.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (key, value))
        self.db.commit()

    def get_meta(self, key: str) -> str | None:
        row = self.db.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None

    def positions(self, t0: float, t1: float) -> list[sqlite3.Row]:
        return self.db.execute("SELECT * FROM positions WHERE t >= ? AND t < ? ORDER BY mmsi, t", (t0, t1)).fetchall()

    def latest(self, since: float) -> list[sqlite3.Row]:
        return self.db.execute(
            """SELECT p.* FROM positions p
               JOIN (SELECT mmsi, max(t) AS t FROM positions WHERE t >= ? GROUP BY mmsi) m
               ON p.mmsi = m.mmsi AND p.t = m.t""",
            (since,),
        ).fetchall()

    def ships(self, mmsis) -> dict[int, sqlite3.Row]:
        mmsis = list(mmsis)
        if not mmsis:
            return {}
        q = ",".join("?" * len(mmsis))
        return {r["mmsi"]: r for r in self.db.execute(f"SELECT * FROM ships WHERE mmsi IN ({q})", mmsis)}

    def time_range(self) -> tuple[float | None, float | None]:
        r = self.db.execute("SELECT min(t), max(t) FROM positions").fetchone()
        return r[0], r[1]
