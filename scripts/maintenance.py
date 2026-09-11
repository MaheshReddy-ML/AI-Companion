from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.maintenance import run_retention_maintenance


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit or apply Emora retention maintenance.")
    parser.add_argument("--apply", action="store_true", help="Apply cleanup. The default is a read-only dry run.")
    parser.add_argument("--attachment-grace-hours", type=int, default=24)
    args = parser.parse_args()
    print(json.dumps(run_retention_maintenance(apply=args.apply, grace_hours=max(1, args.attachment_grace_hours)), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
