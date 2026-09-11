from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.database import attachments_collection, utc_now, users_collection


def clear_expired_password_reset_state(*, apply: bool = False) -> int:
    query = {"reset_otp_expiry": {"$lt": utc_now()}}
    count = users_collection().count_documents(query)
    if apply and count:
        users_collection().update_many(
            query,
            {
                "$set": {
                    "reset_otp": None,
                    "reset_otp_hash": None,
                    "reset_otp_expiry": None,
                    "reset_otp_verified": False,
                }
            },
        )
    return count


def reconcile_attachment_storage(*, apply: bool = False, grace_hours: int = 24) -> dict[str, int]:
    """Find missing attachment files and old unowned files; mutate only with apply."""
    collection = attachments_collection()
    documents = list(collection.find({}, {"path": 1, "created_at": 1}))
    known_paths = {Path(item["path"]).resolve() for item in documents if item.get("path")}
    missing_ids = [item["_id"] for item in documents if item.get("path") and not Path(item["path"]).is_file()]

    upload_root = Path(__file__).resolve().parent / "static" / "uploads" / "attachments"
    cutoff = utc_now() - timedelta(hours=max(1, grace_hours))
    orphan_files: list[Path] = []
    if upload_root.exists():
        for path in upload_root.iterdir():
            if not path.is_file() or path.resolve() in known_paths:
                continue
            modified_at = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            if modified_at <= cutoff:
                orphan_files.append(path)

    if apply:
        if missing_ids:
            collection.delete_many({"_id": {"$in": missing_ids}})
        for path in orphan_files:
            path.unlink(missing_ok=True)

    return {
        "missingDatabaseFiles": len(missing_ids),
        "orphanFiles": len(orphan_files),
        "changesApplied": int(apply),
    }


def run_retention_maintenance(*, apply: bool = False, grace_hours: int = 24) -> dict:
    return {
        "expiredPasswordResetStates": clear_expired_password_reset_state(apply=apply),
        "attachments": reconcile_attachment_storage(apply=apply, grace_hours=grace_hours),
        "mode": "apply" if apply else "dry-run",
    }
