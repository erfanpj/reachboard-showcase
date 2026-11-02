# Reachboard showcase

Self-contained **fictional** marketplace demo for portfolio review. Greenfield code and fixtures—not a copy of any private product repository or its git history.

## What it demonstrates

- Six fictional publishers with channel, placement, deliverable, and prices in **RB credits**.
- English catalogue and a deliberate Persian RTL catalogue path.
- Server-side cart total (`40 + 35 = 75` for the sample pair).
- Draft campaign from cart via **POST** checkout, single submit to **awaiting payment**, idempotent re-submit.
- Per-user demo reset; wrong-owner 404; CSRF on mutating POST endpoints.

## Data model

| Model | Role |
|---|---|
| `Package` | Fictional offer (slug, EN/FA copy, channel, placement, deliverable, payable) |
| `CartLine` | Per-user cart rows |
| `Campaign` / `CampaignItem` | Draft → awaiting payment lifecycle |
| `CampaignHistory` | Campaign vs item scoped history rows |

## Engineering decision

**Server-authoritative cart totals and POST-only checkout.** Templates never add prices locally; checkout creates a draft only on an explicit POST with CSRF. Tradeoff: one extra click versus safe caching and no accidental draft creation from a prefetched GET link.

## Repeated submit semantics

`POST /campaign/<id>/submit/` is safe to call multiple times, including with stale in-memory `Campaign` instances: the server performs a conditional update on persisted **draft** status under `select_for_update`, writes history only when that update succeeds, and returns the current row otherwise (HTTP 302 back to detail). This prevents duplicate history rows from repeated or stale submits in one process; it is not a claim about distributed exactly-once execution.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_showcase
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8788
```

Demo users: `demo_advertiser` / `demo_other` — password `reachboard-showcase-demo` (local fiction only).

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## Static simulation (GitHub Pages–ready)

See `static-demo/README.md`. Labelled **browser simulation** with the same six packages and credit prices; the Django service enforces ownership, CSRF, and transitions over HTTP.

## Browser evidence

Captured from this repository’s UI into `docs/evidence/` (see manifest).

## AI assistance

Implementation and tests were drafted with AI coding assistants (Cursor Composer) from a public fixture contract; human review is required before any GitHub publish.

## Licence

MIT — see `LICENSE`.
