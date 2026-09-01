# Emora security verification baseline

Baseline date: 2026-08-30. Target: OWASP ASVS 5.0 Level 2 for the web application, with extra verification for private companion data and generative-AI boundaries.

This matrix is evidence tracking, not a blanket claim of compliance. `Automated` means repository tests cover the contract. `Manual` means a person must verify a deployed browser/device/provider. `Pending` must remain open until evidence exists.

| Area | Repository control | Evidence | Status |
|---|---|---|---|
| Tenant authorization | Every private object query includes authenticated `user_id`; destructive routes rate-limit and audit | `tests/test_access.py`, `tests/test_workspace_features.py` | Automated; two-real-account browser audit pending |
| Session integrity | Signed JWT, token version, tracked/revocable sessions | `app/security.py`, `tests/test_core_logic.py` | Automated; HttpOnly-cookie migration pending |
| Authentication recovery | Hashed, expiring OTP with throttling and security events | `app/routers/api_auth.py`, `tests/test_core_logic.py` | Automated; live SMTP/device journey pending |
| Browser isolation | Security headers, report-only CSP, safe link protocols | `app/main.py`, `app/http_security.py` | Automated headers; nonce CSP and manual DOM audit pending |
| Upload boundary | Bounded type/signature validation and optional malware scanner | `app/services/attachments.py` | Automated; real scanner deployment pending |
| Rate/resource limits | Route limits, bounded chat/TTS queues, attachment/message sizes | `app/rate_limit.py`, queue tests | Automated; multi-instance load test pending |
| Data lifecycle | Export, deletion, TTL indexes, retention/orphan tooling | `app/routers/account.py`, `app/maintenance.py` | Automated; observed encrypted restore drill pending |
| Audit/metrics privacy | Request IDs, normalized routes, hashed email audit fields, content-free product events | `app/audit.py`, `app/metrics.py`, `app/product_operations.py` | Automated |
| Admin operations | Separate admin authorization, audited subscription/flag mutations | `app/routers/admin.py`, `app/routers/billing.py` | Automated; production key rotation procedure pending |
| Deployment | Readiness, configuration validation, migrations, rollback documentation | `app/main.py`, `app/config.py`, deployment docs | Automated startup checks; staged deployment pending |

## Generative-AI threat boundary

The following inputs are untrusted: user prompts, retrieved web text, uploaded documents, community posts, model output, generated URLs, provider errors, and tool arguments.

| Risk | Required control | Current evidence | Remaining evidence |
|---|---|---|---|
| Prompt injection | Retrieved/document text cannot change system policy or authorize actions | Bounded web loop and source filtering in `app/services/web_search.py` | Adversarial corpus in AI eval suite |
| Sensitive disclosure | Per-user context queries, private metadata removed from replies, no raw-content metrics | Companion memory tests and product-event allowlist | Two-account red-team run |
| Improper output handling | Escape/construct DOM safely; validate generated links and downstream arguments | Link sanitization and HTML escaping tests | Complete browser DOM-sink inventory |
| Excessive agency | Consequential email/calendar/payment actions require explicit server-side confirmation | Billing cannot self-activate; no autonomous integrations | Reassess before any connector ships |
| Resource exhaustion | Queue limits, token limits, rate limits, circuit/fallback behavior | Queue and rate-limit tests | Failure-injection and sustained-load run |
| Misleading information | Explicit research mode, dates/citations, conflict disclosure, feedback | Web-search tests and Research Shelf | Versioned factuality evaluation set |
| Model/supply-chain change | Versioned models/dependencies, benchmark before larger model, staged flags | Model selection and CI docs | Artifact hashes/SBOM and canary deployment |

## Release gate

Before a production release: run the complete automated suite, JavaScript syntax checks, dependency audit, tenant-isolation tests, backup/restore drill evidence, accessibility journeys, and a rollback exercise. Record exceptions with owner, reason, expiry, and compensating control. Never convert a `Pending` row to complete from a mock-only test.
