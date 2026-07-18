# CortexWatt

Measured brain training: six precisely-timed games across six cognitive domains, with
server-authoritative sessions, Glicko-2 skill ratings, a Cortex Index, and weekly
leaderboards. Built to the specs in `05-prd-playable-games.md`,
`02-technical-implementation.md`, and `04-claude-design-prompt-games.md`.

## Stack

```
cortexwatt/
├─ apps/
│  ├─ web/   Next.js 15 (App Router) + Tailwind 4 — the Train area, Focus Mode, results
│  └─ api/   FastAPI (Python 3.12, uv) — sessions, validation gates, Glicko-2, CI
├─ packages/
│  └─ core/  @cortexwatt/core — pure-TS game runtime + all six game modules
├─ Makefile
└─ turbo.json / pnpm-workspace.yaml
```

Local services (instead of docker-compose): **MAMP MySQL 8.0** on `127.0.0.1:8889`
(root/root, db `cortexwatt`) and **Homebrew Redis** on `:6379`. Connection strings
live in `.env`.

## Run it

```sh
make deps      # pnpm install + uv sync
make migrate   # alembic upgrade head
make seed      # seed the games table
make api       # uvicorn on :8000
make web       # next dev on :3000   (separate terminal)
```

Open http://localhost:3000 → sign in with any handle (dev auth) → run the
**baseline** (all six games, radar reveal) or train per game. A hidden timing
probe lives at `/dev/latency`.

## Tests

```sh
make test
```

- **Python (42)** — golden determinism (18 committed spec goldens, byte-identical),
  every §8 validation gate incl. quarantine paths, full API contract tests
  (tamper/duplicate/reject flows), and 12-session staircase convergence.
- **TypeScript (26)** — golden cross-check (core interprets every golden), Drift
  Watch physics determinism, and headless runtime tests that drive the real game
  loop with a virtual clock + synthetic timestamped input.
- **E2E** — `cd apps/web && node e2e/flash-point.mjs` boots a real Chromium,
  signs in, plays 20 trials of Flash Point by watching the canvas for the lime
  stimulus, and asserts the results screen, trial-data view, and leaderboard.

## The six games

| Game | Domain | Mechanic |
|---|---|---|
| Flash Point | Processing speed | Simple RT — lime disc after an unpredictable foreperiod |
| Vector | Decision & control | 6-sector choice RT; ignited core = respond opposite |
| Stackwise | Working memory | Spatial n-back on a 3×3 grid, adaptive N |
| Drift Watch | Attention | Multi-object tracking, seeded reproducible physics |
| Wide Angle | Visual | Center symbol + peripheral blip, two-part response |
| Echo Grid | Memory | Pattern recall with a draining delay bar |

## Integrity model

Server generates every rated puzzle (`generate(game_id, seed, difficulty)`,
deterministic; `spec_hash` stored and re-verified). Clients execute and measure —
`performance.now()` timestamps, rAF-aligned stimulus onsets, `pointerdown`/`keydown`
responses — and submit raw trials. The server recomputes all metrics (client
numbers are advisory), runs the §8 gate sequence (token/expiry/duplicate, hash,
shape, sub-90 ms reclassification, median-RT floor, interruption rate, implausible
perfection → quarantine, rating-jump guard → quarantine), then applies the
staircase, a Glicko-2 update against an opponent rated `800 + 12·difficulty`, the
Cortex Index, and the weekly Redis leaderboard.
