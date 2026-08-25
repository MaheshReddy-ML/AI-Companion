from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a gzip-compressed MongoDB archive for Emora.")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--mongo-uri", default=settings.mongo_uri, help="Defaults to MONGO_URI; never written to the manifest.")
    args = parser.parse_args()

    executable = shutil.which("mongodump")
    if not executable:
        raise SystemExit("mongodump is required. Install MongoDB Database Tools first.")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive = args.output_dir / f"emora-{settings.mongo_database}-{stamp}.archive.gz"
    subprocess.run([executable, f"--uri={args.mongo_uri}", f"--archive={archive}", "--gzip"], check=True)
    if not archive.is_file() or archive.stat().st_size == 0:
        raise SystemExit("mongodump completed without producing a non-empty archive.")

    manifest = {
        "format": "emora-mongodb-backup.v1",
        "database": settings.mongo_database,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "archive": archive.name,
        "bytes": archive.stat().st_size,
        "encrypted": False,
        "warning": "Encrypt this archive with your deployment key before off-site storage.",
    }
    archive.with_suffix(archive.suffix + ".json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(str(archive))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
