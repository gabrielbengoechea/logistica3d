"""Importa archivos grabados (JSONL, también .gz) a la base SQLite.

    python -m ais.importer ../../tools/ais_recorder/data/ais/*.jsonl.gz
    python -m ais.importer data/synthetic-2026-10-10.jsonl.gz --synthetic
"""

import argparse
import gzip
from pathlib import Path

from .parse import parse
from .store import Store


def import_files(store: Store, files: list[Path]) -> tuple[int, int]:
    read = kept = 0
    for path in files:
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8") as f:
            for line in f:
                read += 1
                try:
                    rec = parse(line)
                except ValueError:
                    continue
                if rec is not None and store.add(rec):
                    kept += 1
    store.commit()
    return read, kept


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--db", default="data/ais.sqlite")
    ap.add_argument("--synthetic", action="store_true", help="marca la base como datos de prueba sintéticos")
    args = ap.parse_args()
    Path(args.db).parent.mkdir(parents=True, exist_ok=True)
    store = Store(args.db)
    read, kept = import_files(store, args.files)
    if args.synthetic:
        store.set_meta("synthetic", "1")
    print(f"{read} mensajes leídos, {kept} posiciones guardadas en {args.db}")


if __name__ == "__main__":
    main()
