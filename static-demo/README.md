# Static browser simulation

Open `index.html` locally or publish this folder to GitHub Pages under  
`https://<user>.github.io/reachboard-showcase/static-demo/` (paths are relative; no build step).

Uses **fictional fixtures only** and does not call the Django service.

The runnable local app enforces CSRF, ownership, per-user reset, and one-way draft → awaiting payment transitions via HTTP tests. The static demo **freezes campaign totals at draft review** so cart edits after submit cannot change the displayed submitted amount.
