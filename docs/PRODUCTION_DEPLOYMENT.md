# Production Deployment

## NVIDIA inference container

For an NVIDIA Linux host, build `Dockerfile.cuda` or use
`docker-compose.cuda.yml`. The image installs `requirements-cuda.txt` rather
than Apple MLX packages and stores Hugging Face weights under the persistent
`/models/huggingface` mount.

```env
EMORA_BACKEND=cuda
DEVICE=cuda
CHAT_MODEL=Qwen/Qwen3-4B
VISION_MODEL=Qwen/Qwen2-VL-2B-Instruct
TTS_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice
```

Start it with `docker compose -f docker-compose.cuda.yml up --build`. The host
must provide a compatible NVIDIA driver and NVIDIA Container Toolkit; direct
Docker runs must pass `--gpus all`. `/health` is the liveness probe, while
`/health/ready` includes the selected backend, device, model load state, and
the normal database/storage readiness checks.

A successful image build is not GPU acceptance evidence. Before launch, send
disposable chat, camera-check-in, and speech requests on the target GPU and
observe VRAM, latency, and generated media. For GridShare or another serverless
provider, wrap this container with a persistent model cache, a warm timeout,
and the provider's scale-to-zero policy; Emora deliberately does not embed
cloud orchestration.

This checklist covers the minimum production setup for the FastAPI version of Emora.

## Environment

- Set `APP_ENV=production`.
- Set `JWT_SECRET` to a long random value and rotate it if it is ever exposed.
- Set `ADMIN_API_KEY` only for trusted operators who need `/api/admin/diagnostics`.
- Keep `.env` outside source control.
- Keep `RATE_LIMIT_ENABLED=true` unless you have a stronger external gateway rate limiter.
- Set `TRUST_PROXY_HEADERS=true` only behind a reverse proxy and list its source
  networks in `TRUSTED_PROXY_CIDRS`. Direct clients must never be allowed to
  choose their own forwarded IP or protocol.
- Set `REDIS_URL` when running multiple API workers or instances. The app automatically uses Redis-backed rate limits when it is reachable and safely falls back to in-memory limits for local development.
- Set `CLAMAV_SOCKET` (for example, `/var/run/clamav/clamd.ctl`) to require ClamAV scanning for uploaded attachments. If configured, uploads fail closed when the scanner is unavailable.
- Set `AUDIO_CACHE_MAX_AGE_DAYS` to control how long generated voice audio is retained; expired WAV files are removed at startup.
- Set `TTS_WORKER_COUNT` to bound concurrent voice jobs (defaults to 2). The app uses a worker queue so TTS work does not block the async request loop.

## Database

- Use a managed or secured MongoDB instance.
- Set `MONGO_URI` to the production database.
- Keep MongoDB network access restricted to the app host or private network.
- Let app startup create indexes, or create equivalent indexes manually before traffic:
  - `users.email` unique
  - `users.anonymous_id` sparse unique
  - `users.token_version`
  - `conversations.user_id + updated_at`
  - `conversations.user_id + title`
  - `posts.created_at`
  - `posts.anonymous_id + created_at`
  - `posts.moderation_status + created_at`
  - `attachments.user_id + created_at`
  - `attachments.conversation_id`
  - `memories.user_id + created_at`
  - `quests.user_id + date`
  - `focus_rooms.code` unique
  - `user_spaces.user_id` unique

Startup runs numbered, repeatable migrations and records completed versions in
`schema_migrations`. Run a new release against a staging copy of production data
before allowing it to migrate the live database.

## Backups and retention

- Create a database archive with
  `../.venv/bin/python scripts/backup_emora.py --output-dir /explicit/backup/path`.
- The generated manifest deliberately excludes `MONGO_URI`, but the archive is
  not encrypted by the script. Encrypt it with the deployment's managed key
  before copying it off-site.
- Back up `app/static/uploads` consistently with MongoDB attachment records.
- Restore backups only into an isolated drill database first; verify account,
  conversation, attachment, memory, and deletion behavior before declaring a
  backup usable.
- Run `../.venv/bin/python scripts/maintenance.py` for a read-only retention and
  orphan audit. Review the counts, then use `--apply` explicitly when cleanup is
  intended.
- Retention TTLs are configured through `AUTH_SESSION_RETENTION_DAYS`,
  `SECURITY_EVENT_RETENTION_DAYS`, `BILLING_REQUEST_RETENTION_DAYS`,
  `CHECK_IN_DELIVERY_RETENTION_DAYS`, and `CHAT_TURN_RETENTION_DAYS`.

## External Services

- Chat runs exclusively on local Qwen3 MLX and requires no API key. Its model files persist in the Hugging Face cache across server restarts; model memory is loaded once per server process.
- Optional camera check-ins use local MLX-VLM (`VISION_MLX_MODEL`). Browser permission and a send-time frame are both required. Do not add camera-frame logging or persistence: only the coarse behavior report belongs in Insights.
- Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google sign-in.
- Set `GOOGLE_CALLBACK_URL` to the public HTTPS callback URL.
- Set `EMAIL_USER` and `EMAIL_PASS` for OTP delivery.
- Install and warm up voice dependencies if `/api/voices/speak` is required.
- Install the optional Redis dependency from `requirements.txt` and operate Redis if shared rate limits are required.
- Operate ClamAV/clamd before setting `CLAMAV_SOCKET`; this is recommended for internet-facing attachment uploads.

## Runtime

- Run behind HTTPS.
- Put a reverse proxy in front of Uvicorn or run with a production ASGI process manager.
- Example command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

- Use `/health` for lightweight liveness checks.
- Use `/health/ready` for readiness checks that include MongoDB and integration
  configuration. It returns HTTP 503 when MongoDB is not ready, so load
  balancers can stop routing traffic to an unhealthy instance.
- Use `/api/admin/diagnostics` with `X-Admin-Key` only from trusted networks or admin tooling.

## Safety And Operations

- Monitor structured audit events from the `app.audit` logger.
- Alert on repeated auth failures, OTP failures, chat provider failures, and voice fallback errors.
- Review posts marked `moderation_status=needs_review`.
- Back up MongoDB regularly.
- Run CI before deploy:

```bash
python -m compileall app tests
python -m pytest -q
```
