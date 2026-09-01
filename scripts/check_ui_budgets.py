from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "app" / "static"
LIMITS = {
    "all_css": 750_000,
    "all_js": 500_000,
    "emora_system_css": 40_000,
    "emora_system_js": 30_000,
    "raster_image": 2_600_000,
    "vrm_model": 20_000_000,
}


def total(pattern: str) -> int:
    return sum(path.stat().st_size for path in STATIC.rglob(pattern))


def main() -> int:
    checks = {
        "all_css": total("*.css"),
        "all_js": total("*.js"),
        "emora_system_css": (STATIC / "css" / "emora-system.css").stat().st_size,
        "emora_system_js": (STATIC / "js" / "emora-system.js").stat().st_size,
    }
    failures: list[str] = []
    for name, size in checks.items():
        if size > LIMITS[name]:
            failures.append(f"{name}: {size} bytes exceeds {LIMITS[name]}")
    for path in (STATIC / "images").rglob("*"):
        if not path.is_file():
            continue
        limit = LIMITS["vrm_model"] if path.suffix.lower() == ".vrm" else LIMITS["raster_image"]
        if path.stat().st_size > limit:
            failures.append(f"{path.relative_to(ROOT)}: {path.stat().st_size} bytes exceeds {limit}")
    for name, size in checks.items():
        print(f"{name}={size}/{LIMITS[name]}")
    if failures:
        print("UI budget failures:")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
