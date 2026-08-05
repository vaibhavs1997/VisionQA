# UI Quality Platform — Phase 0 + Phase 1 + Phase 2

A local CLI scanner that opens a public URL in a real browser, runs 33 deterministic
UI-defect detectors across desktop/tablet/mobile viewports,
optionally validates the most ambiguous ones with an AI vision layer, and
writes a JSON report, a self-contained HTML report, and
screenshots/evidence to disk. This covers Phase 0 (technical
feasibility), Phase 1 (modular detection engine), and Phase 2 (AI visual
intelligence) of the phased architecture in
`AI-Powered_UI_Quality_Platform_-_Phased_Solution_and_Technical_Architecture.docx`
— still no accounts, database, queue, or SaaS infrastructure (that's
Phase 3+). AI is deliberately narrow here: a validator/explainer bolted
onto the deterministic detectors, never the primary detection mechanism.

## What's implemented

### Phase 0 (foundation)
- **URL Security Guard** (`packages/scanner-core/src/security`) — blocks
  non-http(s) protocols, localhost, RFC1918 private ranges, loopback,
  link-local, and cloud metadata endpoints (169.254.169.254 and the AWS
  IMDS IPv6 equivalent); revalidates every redirect hop.
- **Browser Adapter** (`packages/scanner-core/src/browser`) — the *only*
  module that imports Playwright. Ephemeral, isolated browser contexts:
  no persisted cookies/profile, downloads disabled, permissions denied by
  default, hard navigation timeout, redirect-count cap.
- **PageContext Collector** (`packages/scanner-core/src/collector`) —
  normalizes DOM, computed styles, geometry, images, SVGs, fonts, network
  log, and console log into the stable `PageContext` contract every
  detector reads.

### Phase 1 (modular detection engine — 17 detectors, +11 more in Phase 5 below — 28 total)
Every detector is a pure function over `PageContext` (`packages/detectors`),
registered in a plugin registry (`packages/detectors/src/registry.ts`);
none of them touch the browser directly, which is what makes them
independently unit-testable without a real browser:

| Category | Detectors |
|---|---|
| Image | broken-image, missing-alt-text |
| Network | failed-resource |
| Layout | horizontal-overflow, element-outside-viewport, text-clipping, text-overflow, element-overlap |
| Accessibility | missing-form-label, missing-accessible-name, low-contrast-candidate |
| Technical | font-load-failure, broken-svg-icon, console-ui-error |
| Content | placeholder-content, empty-component, unexpected-disabled-cta |

Plus a cross-viewport **Responsive Delta correlator**
(`packages/issue-engine/src/responsive-delta.ts`) — not a detector itself,
since it needs every viewport's issues to compare against each other. It
tags each issue with which viewports its root cause appeared in, flags
narrow-viewport-only regressions, and escalates severity one step when a
root cause is confirmed across every scanned viewport.

- **Issue Engine** (`packages/issue-engine`) — confidence-threshold
  validation (per-category thresholds), root-cause deduplication, the UI
  Quality Score model (severity × confidence × element-importance ×
  viewport-weight × sub-linear recurrence multiplier), the JSON report
  writer, and a self-contained **local HTML report** (`report.html`) for
  developer review before any SaaS dashboard exists.
- **CLI** (`apps/cli`) — `ui-scan <url> --viewports desktop,mobile --out ./scan-output`.
- **Benchmark harness** (`benchmarks/`) — serves 11 fixture pages (6 from
  Phase 0, 5 new Phase 1 pages covering all 12 new detectors plus a
  dedicated clean-page control) locally, runs the real pipeline against
  them, and computes precision/recall/false-positive-rate against
  `benchmarks/expected/expected-issues.json`.

### Phase 2 (AI visual intelligence)
- **`packages/ai-engine`** — a provider-agnostic AI layer:
  - `AiProvider` interface with a real **`AnthropicProvider`** (genuine
    Messages API calls, cost/latency telemetry) and an offline
    **`MockAiProvider`** (deterministic heuristic over the same measured
    evidence the detector already computed — no vision, clearly labeled
    as a pipeline-testing stand-in, never presented as a real judgment).
  - Strict **prompt contracts** (`validate-visual-issue.prompt.ts`,
    `explain-issue.prompt.ts`) that forbid subjective design critique and
    demand evidence-grounded, schema-shaped JSON only.
  - A **zod-based response validator** that rejects malformed, vague
    (too-short explanations), or unsupported claims — including
    downgrading a "confirm" with implausibly low confidence to a
    rejection outright.
  - **Crop and annotation builders** (`sharp`-based) that send a small,
    padded region around the flagged element(s) — never a full-page
    screenshot — with two-color outlines + labels for two-element cases
    like overlap.
  - A **context-pack builder** that finds spatially-nearby elements so
    the model can distinguish "overlapping in empty space" from
    "overlapping in a dense toolbar."
  - A **redaction module** that scrubs emails/tokens/card-like numbers
    from any text sent to the model (documented gap: no pixel-level
    image redaction yet — see the module's own comments).
  - A **cost/latency tracker** reporting total cost, cost per confirmed
    issue, and a per-issue-type breakdown.
- **`packages/ocr`** — a real, working OCR adapter (tesseract.js),
  reserved for canvas/image-rendered text that DOM extraction can't see.
  Not invoked by any detector today — Phase 0/1 detectors all read free,
  exact DOM text, which OCR can't beat on accuracy or cost. It exists
  because the spec calls for the capability, tested for real (no
  mocking) against generated images.
- **AI is applied to exactly three issue types**, chosen because each is
  where the deterministic layer is inherently a partial judgment call,
  not a full-confidence measurement: `element-overlap` (always — the
  spec's own primary example), `broken-svg-icon` (only the
  lower-confidence icon-font-class case), and `unexpected-disabled-cta`
  (always, since "unexpected" is inherently judgment-laden). AI never
  runs on the other 14 detectors — deterministic-only conclusions don't
  need a second opinion, and every additional call is cost with no
  accuracy upside.
- **CLI flag**: `--ai off|mock|anthropic` (default `off` — a scan never
  costs money or needs an API key unless you explicitly ask).

## Setup

```bash
npm install
npx playwright install chromium   # downloads a Chromium binary
npm run build
```

### A note on the Chromium binary

`npx playwright install chromium` needs to reach
`cdn.playwright.dev`. If you're running this in a network-restricted
environment where that download is blocked, the code still runs against
**any** Chromium/Chrome binary you already have — point the adapter at it
via an environment variable instead of trying to satisfy Playwright's own
downloader:

```bash
export UI_SCAN_CHROMIUM_PATH=/path/to/chromium
```

This is exactly how this Phase 0 build was validated in a network-locked
development sandbox that couldn't reach Playwright's CDN: a Chromium
binary was obtained via the `@sparticuz/chromium` npm package (which
ships a full Chromium build as ordinary npm package content, extractable
locally) and pointed at via `UI_SCAN_CHROMIUM_PATH`. In a normal
development machine or CI environment, `npx playwright install chromium`
is all you need and this variable can be left unset.

### A note on OCR (`packages/ocr`)

`tesseract.js` defaults to downloading its language training data from
`cdn.jsdelivr.net` at runtime, which hits the exact same problem as the
Chromium binary above in network-restricted environments. The fix here
is the same shape: `OcrAdapter` points `langPath` at the
`@tesseract.js-data/eng` npm package (which bundles the actual
`.traineddata` file as ordinary package content) instead of relying on
the CDN fetch. This is the default and requires no configuration — it's
called out here only so the "why does this work offline" question has an
answer on record. No detector invokes OCR by default (see the Phase 2
section above for why); it's exercised directly by its own test suite.

## Usage

```bash
npm run scan -- https://example.com --viewports desktop,mobile --out ./scan-output
```

Output:

```
scan-output/
  report.json
  screenshots/
    desktop-viewport.png
    desktop-full.png
    mobile-viewport.png
    mobile-full.png
  evidence/
    issue-001.json
    issue-002.json
    ...
```

The CLI exits non-zero only when the scan itself fails to execute (e.g.
the URL Security Guard rejects the target, or every viewport fails to
load) — never because UI issues were found. Try it against a target the
guard should reject, to see the security posture in action:

```bash
npm run scan -- http://localhost:3000/          # rejected: localhost
npm run scan -- http://169.254.169.254/          # rejected: cloud metadata endpoint
npm run scan -- http://192.168.1.1/              # rejected: private range
npm run scan -- "file:///etc/passwd"             # rejected: disallowed protocol
```

### AI validation (Phase 2)

```bash
# Default — no AI, no cost, no key needed:
npm run scan -- https://example.com

# Offline deterministic heuristic provider — exercises the full AI
# pipeline (crops, context packs, schema validation, cost telemetry)
# with zero API cost and no key, useful for testing/demos:
npm run scan -- https://example.com --ai mock

# Real vision-LLM calls — requires ANTHROPIC_API_KEY:
export ANTHROPIC_API_KEY=sk-...
npm run scan -- https://example.com --ai anthropic
```

AI only ever runs on 6 of the 33 detectors' issue types
(`element-overlap`, ambiguous `broken-svg-icon`, `unexpected-disabled-cta`,
`low-contrast-borderline`, the class-pattern bucket of `empty-component`,
and `placeholder-generic-token`) — see the Phase 2 and Phase 5 sections
above. With `--ai` set, `report.json`/`report.html` gain an
`aiTelemetry` block (call count, cost, latency) and AI-touched issues
show an "AI: confirm / suppress / needs more evidence" badge plus a
plain-language `aiExplanation`.

## Running the test suite

```bash
npm run test        # 140 unit tests across all packages: detectors (via
                     # hand-built PageContext fixtures), issue-engine
                     # (validator/deduplicator/scoring/responsive-delta),
                     # URL Security Guard (literal IPs, no network
                     # needed), ai-engine (schema validation, redaction,
                     # cost tracking, and a full enhanceWithAi pipeline
                     # test using real sharp-generated screenshots), and
                     # ocr (real, unmocked tesseract.js recognition
                     # against generated images)
npm run benchmark    # full end-to-end run: real Chromium against local
                     # fixture pages with planted defects, computing
                     # precision/recall/false-positive-rate
```

Current benchmark result on the eleven fixture pages in
`benchmarks/pages/`: **100% precision, 100% recall, 0 false positives**
across both clean control pages (Phase 0's `clean-page.html` and Phase
1's `phase1-clean-page.html`), averaging ~3.7s per fixture across 2
viewports — comfortably inside the Phase 1 acceptance gate (≥85%
precision, 15+ detectors implemented, no detector depends on the browser
automation library).

Getting there took a genuine debugging pass, not just writing detectors
and calling it done — the benchmark surfaced four real detector bugs that
got fixed along the way:
- `low-contrast-candidate` was guessing a white fallback background
  behind CSS gradients, flagging white text on a colored gradient banner
  as a contrast failure. Fixed by detecting `background-image` during the
  ancestor walk and skipping rather than guessing.
- `element-outside-viewport` flagged carousel items scrolled outside
  the visible area of their own horizontally-scrollable container as a
  layout defect. Fixed by tracking whether an element sits inside a
  scrollable ancestor.
- `element-overlap` flagged `<body>` as "overlapping" its own
  descendants whenever a child overflowed its box (e.g. a 1200px-wide
  banner inside a 390px body) — the area-ratio containment heuristic
  breaks down under overflow. Fixed with a more reliable
  selector-chain ancestor check.
- `empty-component` matched `<img class="card">`-style elements against
  its "important class name" pattern regardless of tag, flagging broken
  leaf images as empty structural containers. Fixed by excluding
  media/leaf tags (img, svg, video, etc.) outright.

`benchmarks/src/run-ai-demo.ts` is a standalone script (not part of the
main benchmark gate) that runs the full AI-enhanced pipeline against a
real Chromium screenshot of the `element-overlap` fixture using
`MockAiProvider`, so the crop/annotation/decision/telemetry flow can be
inspected end-to-end without needing an API key:

```bash
UI_SCAN_CHROMIUM_PATH=/path/to/chromium npx tsx benchmarks/src/run-ai-demo.ts
```

## Repository layout

```
apps/cli/                   CLI entrypoint (commander) + scan command
packages/shared/             PageContext, Universal Issue Object, viewport presets
packages/scanner-core/       URL Security Guard, Browser Adapter, PageContext Collector
packages/detectors/          33 detectors (image/network/layout/accessibility/technical/content/seo) + plugin registry
packages/issue-engine/       Validator, Deduplicator, Scoring, Responsive Delta, Assembler, JSON + HTML report writers
packages/ai-engine/          Provider-agnostic AI layer: providers, prompts, schemas, crop/annotation/context builders, redaction, cost tracker
packages/ocr/                Real tesseract.js-based OCR adapter (not wired into any detector by default)
benchmarks/pages/            11 fixture HTML pages with planted defects (+2 clean controls)
benchmarks/expected/         Expected-issues manifest used to score the benchmark
benchmarks/src/              Benchmark harness (static server + scan + scoring) + AI pipeline demo script
```

## Adding a new detector (Phase 3+)

1. Create `packages/detectors/src/<category>/<name>.detector.ts`
   implementing the `Detector` interface from `packages/detectors/src/types.ts`.
2. Register it in `packages/detectors/src/registry.ts`'s `PHASE_1_DETECTORS` array.
3. Add a fixture page (or extend an existing one) under `benchmarks/pages/`
   with a planted instance of the defect AND a corresponding case in a
   clean-control page, then add an entry to
   `benchmarks/expected/expected-issues.json`.
4. Write unit tests against hand-built `PageContext` fixtures
   (`packages/detectors/src/__tests__/fixtures.ts` has helpers) covering
   both the true-positive and the false-positive cases your detector is
   supposed to exclude.
5. If the detector is inherently a judgment call rather than a full-
   confidence measurement, consider adding it to `isAiEligible()` in
   `packages/ai-engine/src/ai-service.ts` instead of trying to force
   deterministic certainty out of an ambiguous signal.
6. Nothing else changes — the CLI, issue engine, and report shape are all
   detector-agnostic by design (see `UiIssue` in `packages/shared/src/issue.types.ts`).

## What's deliberately NOT here (per the Phase 0/1/2/3 spec)

No queue/cloud worker infrastructure (Phase 3 explicitly allows
synchronous/fire-and-forget execution, with the seam prepared for a real
queue in Phase 4), no multi-page crawler, no authenticated scanning, no
multi-tenant auth (Phase 3 is explicitly single-workspace), and no
Jira/Slack/GitHub/CI/CD/Figma/billing/enterprise features. AI validation
(Phase 2) is implemented but strictly scoped — no open-ended "find
everything wrong" prompt, no autonomous navigation agent, no Figma
comparison, and no promise of perfect visual judgment. Phase 4 onward
hardens this into a production SaaS (real queue workers, Postgres,
multi-tenant auth, horizontal scaling).

## Phase 3 — Standalone Web Product

`apps/api` (Fastify) and `apps/web` (Next.js) turn the engine into a
usable product: enter a URL, start a scan, watch progress, review the
score, inspect issues with evidence, and record feedback.

### Running it locally

```bash
npm install
npm run build

# Terminal 1 — API service (persists to SQLite via node:sqlite, zero
# native dependencies; the CLI's scanner-core/detectors/issue-engine/
# ai-engine pipeline runs exactly as-is underneath, just persisted to
# rows instead of report.json)
cd apps/api && npm run dev            # listens on :4000, data in ./data

# Terminal 2 — web frontend
cd apps/web && npm run dev            # listens on :3000
```

Then open `http://localhost:3000`: create a project, start a scan, watch
it move through the same state machine the CLI uses
(QUEUED → LOADING_PAGE → RUNNING_DETECTORS → ... → COMPLETED), and review
the report — score, screenshots, filterable issue list, issue detail
with evidence/AI explanation/suggested fix, and valid/false-positive/
ignore feedback buttons.

### What's implemented

- **`apps/api`** — Fastify service, `node:sqlite` persistence (schema
  ported with Postgres in mind — TEXT primary keys, ISO8601 timestamps,
  JSON-as-TEXT columns — so the Phase 4 migration is a data-access-layer
  swap, not a schema redesign), the full API surface from the spec
  (projects, scans, scan status/detail/issues, issue detail/feedback),
  rate limiting on scan creation, basic audit logging (scan
  start/complete/failed, issue feedback), and static evidence serving
  scoped to the data directory. `scan-orchestrator.ts` reuses the
  identical CLI pipeline — not a reimplementation — and runs scans
  fire-and-forget (HTTP responds immediately with `QUEUED`; the client
  polls `/status`), which is explicitly the seam a Phase 4 queue worker
  slots into without changing the function's signature.
- **`apps/web`** — Next.js App Router + Tailwind. Dashboard (project
  list + create), project detail (scan history + new-scan form with
  viewport/AI-mode selection), scan page (live-polling progress, then
  score panel + screenshots + filterable issue list once complete),
  issue detail page (full evidence, AI explanation when present,
  suggested fix, screenshot, feedback buttons, related issues).
- 16 API contract tests (via `fastify.inject()` — no real HTTP server or
  browser needed) plus a live, manually-verified end-to-end run through
  the actual running services (see below).

### Real bugs found and fixed while building this phase

Same philosophy as every earlier phase — these were caught by actually
running things, not just writing code that looked right:

- `better-sqlite3` fails to compile in this environment (native
  `node-gyp` build failure) — switched to `node:sqlite`, Node 22's
  built-in module, which needs zero native compilation.
- Vite/Vitest's bundler doesn't recognize `node:sqlite` (its
  builtin-module list predates Node 22.5) — fixed by loading it via
  `process.getBuiltinModule` for the one file that constructs it, and
  `import type` (erased at compile time) everywhere else that only needs
  the type.
- A dependency-injection refactor for testability (so tests could
  substitute a stub instead of launching a real browser) added the
  parameter and updated the type signature, but **left the actual call
  site still hardcoded to the real function** — caught because the test
  suite tried to launch a real, uninstalled Chromium binary instead of
  using the stub.
- Audit logging could throw and crash a fire-and-forget promise chain
  with an unhandled rejection if the database happened to close
  mid-flight (e.g. during shutdown) — made it properly best-effort
  (catches and logs its own errors, never propagates).
- `@fastify/static` requires an absolute path for its root directory,
  but the data directory can arrive as a relative path from an env
  var — fixed at two layers (the entrypoint and defensively inside
  `buildApp` itself) rather than trusting every caller to remember.

### Verified live (not just unit-tested)

Ran both services together and drove a complete flow with real HTTP
requests: created a project, started a real scan (Chromium + mock AI)
against a real public URL, polled it through to `COMPLETED`, then
confirmed severity-filtered issue queries, full issue detail with
evidence, feedback submission, and static screenshot serving all
returned correct data — and that the Next.js pages (dashboard, project,
scan results, issue detail) render that same data correctly via
server-side rendering.

## Known limitations worth knowing about before relying on this

- **The real `AnthropicProvider` path is implemented but not
  live-verified** — no API key was available in the environment this was
  built in, so that code path compiles and follows the Messages API
  correctly but hasn't actually been exercised against the real API.
  `--ai mock` and the full test suite exercise everything else in the
  pipeline (crop building, schema validation, suppression/confirmation
  logic, cost tracking) for real.
- **Redaction only covers text**, not pixel-level image content — see
  the `KNOWN_LIMITATION_NO_PIXEL_REDACTION` flag and comment in
  `packages/ai-engine/src/redaction.ts`.
- **The benchmark corpus (11 pages) is small and built by the same
  person who wrote the detectors** — good enough to catch real logic
  bugs (and it did, four times — see above), not yet the kind of large,
  independently-built, adversarial corpus you'd want before fully
  trusting precision/recall numbers against arbitrary real-world sites.
- **The `S3ObjectStorage` adapter is a documented stub, not verified** —
  no AWS credentials/bucket available in this environment. The local
  filesystem adapter it would replace is real, tested, and what this
  project's own dev/CI setup actually runs on.
- **Real container isolation (Docker) per scan worker is written but not
  executed** — this sandbox has no Docker daemon, so the Dockerfiles
  (`infra/docker/*.Dockerfile`) and `docker-compose.yml` are
  correctly-authored, reviewed deliverables, not a verified `docker
  compose up`. Every service they orchestrate was independently verified
  working by running it directly (see "Verified live" below) — the
  containerization wraps an already-proven stack, but the act of
  building/running those specific images has not itself been tested.
  The queue/worker *process* separation (a job can be picked up by any
  worker instance) is real and tested regardless of containerization.
- **Structured logging and Prometheus metrics exist** (`packages/observability`,
  wired into both the API and worker — see the Phase 4 section below)
  and are unit-tested, but there's no real Prometheus/Grafana/log
  aggregator deployment to point at in this environment — the `/metrics`
  endpoint and structured JSON log lines are real and correct, just not
  verified against an actual scraper.
- **`node:sqlite`/in-memory rate limiting are gone as of Phase 4** — the
  API now uses real Postgres and the rate limiter is still in-memory/
  single-process, which is fine for one API instance but needs a shared
  (Redis-backed) implementation before running multiple API replicas.

## Phase 4 — Production Hardening

Turns the Phase 3 single-workspace product into a multi-tenant system
with real async execution: users and workspaces with role-based
membership, a real queue-backed worker pool (not fire-and-forget),
Postgres instead of SQLite, and object storage with signed evidence URLs
instead of static file serving.

### What's implemented

- **`packages/database`** — Postgres 16 schema (users, workspaces,
  workspace_members, projects, scans, scan_pages, issues, issue_feedback,
  usage_events, audit_log) with every workspace-scoped query requiring an
  explicit `workspaceId` parameter — there is no code path that reads
  scan/project/issue data by ID alone, which is what makes cross-tenant
  data leaks structurally hard rather than just "hopefully prevented by
  convention." 9 tests against a real database, including genuine
  tenant-isolation checks.
- **`packages/queue`** — real BullMQ + Redis. Scan creation enqueues a
  job (`scanId` as the job ID, so re-enqueuing is idempotent) instead of
  the Phase 3 in-process fire-and-forget call. 3 tests against live
  Redis: enqueue→consume, idempotency, and retry-then-fail behavior.
- **`packages/storage`** — a real, working `ObjectStorage` implementation
  backed by the local filesystem, with HMAC-signed time-limited URLs
  (simulating S3 presigned URLs), path-traversal protection, and
  age-based retention cleanup. A documented (not executed — no AWS
  account available) `S3ObjectStorage` stub shows the exact swap point:
  one class change behind the same interface, nothing else in the
  codebase needs to know which one is active. 9 tests.
- **`apps/api/src/auth`** — scrypt password hashing (via `node:crypto`,
  zero native compilation — the same lesson learned from
  `better-sqlite3` failing to build earlier applied proactively here)
  and JWT sessions. Tenant isolation is enforced by a two-part guard:
  `requireAuth` (valid session) and `requireWorkspaceMembership` (this
  *specific* user belongs to *this specific* workspace, with role
  ranking for admin/owner-only actions) — conflating those two checks is
  exactly how tenant-isolation bugs happen, so they're deliberately
  separate middleware.
- **`apps/api`** — rewired end-to-end onto Postgres + the queue: every
  route is workspace-scoped, scan creation enforces a per-workspace daily
  usage limit before enqueuing, and evidence (screenshots) is served
  through a signed-URL-verifying route rather than a bare static mount —
  matching the spec's "private, only accessible through authorized
  links" requirement. Denying access to a workspace you're not a member
  of returns 404, not 403 — deliberately not confirming the workspace
  even exists.
- **`apps/scanner-worker`** — a real BullMQ worker consuming the scan
  queue, running the *exact same* scanner-core/detectors/issue-engine/
  ai-engine pipeline the CLI and Phase 3 API used, now writing to
  Postgres and object storage instead of SQLite and local files. It
  independently re-validates the target URL before navigating (defense
  in depth — it does not trust that the API already checked), verified
  by a real test that confirms a scan targeting `localhost` is correctly
  rejected and marked `FAILED` by the worker itself, not just by the API.
- **`packages/observability`** — structured JSON logging (pino, with a
  human-readable `LOG_PRETTY=1` mode for local dev) and Prometheus
  metrics (`prom-client`) shared by the API and worker: scan duration
  histograms, scan/worker-failure counters, AI call/cost counters, queue
  depth, and per-route HTTP request duration. The API exposes them at
  `GET /metrics`. 9 tests. Not verified against a real
  Prometheus/Grafana deployment (none available here) — the metrics
  themselves and their wiring are real and tested, that last mile isn't.
- **`infra/docker`** — multi-stage Dockerfiles for the API, scanner-worker
  (installs a real Chromium + system libs via `playwright install
  --with-deps`, runs as an unprivileged user), and web (Next.js
  standalone output for a minimal runtime image), plus a
  `docker-compose.yml` wiring Postgres + Redis + all three services
  together. Reviewed and correctly structured against each tool's real
  API, but — consistent with this project's standing honesty policy for
  anything requiring infrastructure this sandbox doesn't have (Docker
  daemon, AWS credentials) — not executed here. See the compose file's
  own header comment for exactly what that means in practice.
- **`apps/web`** — full auth flow (register/login pages, JWT stored in a
  client-readable cookie so both Server Components and client fetches
  can attach it as a Bearer token — see `lib/session.ts`'s own comment
  on the tradeoff this makes vs. a same-domain httpOnly cookie), a
  `middleware.ts` route guard redirecting unauthenticated requests to
  `/login`, a workspace picker, and every page moved under
  `/w/[workspaceId]/...` to match the API's tenant-scoped routes.

### Verified live — the full stack, together, with real infrastructure

This environment actually has Postgres 16, Redis, and a real Chromium
binary available (installed via apt; no Docker daemon, so containerized
worker isolation isn't testable here, but everything else is real, not
mocked). Ran all four processes together — API, scanner-worker, Next.js
web app, against real Postgres/Redis — and drove the complete flow with
real HTTP requests: registered a user, created a workspace and project,
started a scan, watched the *actual queue* hand it to the *actual
worker*, which ran a real Chromium scan against a real public URL and
persisted real issues to real Postgres. Then confirmed the Next.js pages
render that data correctly via SSR with a real session cookie, and that
a signed evidence URL genuinely serves back a real screenshot (verified
a 93KB PNG at the exact requested viewport resolution) — not just that
the API returns a URL-shaped string.

239 tests pass across the whole monorepo, run against this same real
infrastructure (not mocks) wherever the component being tested touches
a database, queue, browser, or OCR engine.

### Running it locally

```bash
# Postgres and Redis need to be running (this project developed against
# Postgres 16 + Redis 7, installed via apt in a plain Ubuntu container —
# no Docker required for local dev, only for a "real" isolated deployment)
createdb uiquality_dev   # or: psql -c "CREATE DATABASE uiquality_dev;"

npm install && npm run build

# Terminal 1 — API (runs migrations automatically on startup)
cd apps/api
DATABASE_URL=postgres://user:pass@localhost:5432/uiquality_dev \
JWT_SECRET=$(openssl rand -hex 32) \
STORAGE_SIGNING_SECRET=$(openssl rand -hex 32) \
npm run dev                                    # listens on :4000

# Terminal 2 — scanner worker (consumes the same queue the API produces to)
cd apps/scanner-worker
DATABASE_URL=postgres://user:pass@localhost:5432/uiquality_dev \
STORAGE_SIGNING_SECRET=$(openssl rand -hex 32) \
UI_SCAN_CHROMIUM_PATH=/path/to/chromium \
npm run dev

# Terminal 3 — web frontend
cd apps/web && npm run dev                     # listens on :3000
```

Then open `http://localhost:3000`: register, create a workspace, create
a project, start a scan — it's enqueued instantly and the worker picks
it up asynchronously, exactly like a real production deployment would
behave, just without the horizontal scaling.

### Alternative: Docker Compose

If you have Docker available (this project's own dev sandbox didn't —
see the limitations section above), the whole stack — Postgres, Redis,
API, worker, and web — can be brought up in one step instead of the
three-terminal manual setup:

```bash
export JWT_SECRET=$(openssl rand -hex 32)
export STORAGE_SIGNING_SECRET=$(openssl rand -hex 32)
docker compose -f infra/docker/docker-compose.yml up --build
```

Then open `http://localhost:3000`, same as above. As noted in the
compose file itself, this exact `up --build` command has not been run
in this project's own development environment (no Docker daemon
available there) — everything it orchestrates was verified working by
running each piece directly instead (see "Verified live" above).

## Phase 5 (this pass — CI, frontend redesign, detector expansion)

Three additions on top of Phase 0-4, aimed at closing production-readiness
and product-depth gaps rather than adding a new architectural phase:

**CI/CD.** `.github/workflows/ci.yml` — GitHub Actions runs the full
build + test suite against real Postgres/Redis service containers (and
real Chromium) on every push/PR to `main`. `.env.example` files added
for `apps/api`, `apps/scanner-worker`, `apps/web`, listing every env var
each service actually reads.

**Frontend redesign (`apps/web`).** New design system: a cool
graphite/paper palette instead of a generic default, a "viewfinder"
corner-bracket motif (`.viewfinder` CSS + `<ViewfinderFrame>`) reused
throughout the UI that echoes the scanner's own bounding-box annotations
on flagged elements, a sidebar app shell, an instrument-style score
panel, and a real multi-step scan-progress timeline instead of a single
spinner. All pages and forms restyled to match.

**Detector expansion (17 → 22).** Five new detectors, all built from
data `PageContext` already collects (no browser-collection changes):
`duplicate-element-id-v1`, `heading-hierarchy-skip-v1`,
`tap-target-too-small-v1`, `ambiguous-link-text-v1`, and
`fully-obscured-interactive-element-v1` (a higher-confidence, narrower
sibling of `element-overlap-v1` for near-total coverage cases). 23 new
unit tests — see `packages/detectors/src/__tests__/`.

**AI validation coverage (3 → 6 eligible issue types).** Extended
`isAiEligible` in `packages/ai-engine/src/ai-service.ts` to also cover
`low-contrast-borderline`, the class-pattern (lower-confidence) bucket
of `empty-component`, and `placeholder-generic-token`. The
`low-contrast-candidate` detector previously *silently dropped*
borderline contrast cases — its own comment promised they were
"reserved for AI validation" but nothing actually sent them there; that
detector now emits them as a distinct `low-contrast-borderline`
issueType at exactly the accessibility confidence floor (0.6), since
the Issue Engine's confidence-threshold filter runs *before* AI
enhancement in the pipeline — a candidate meant for AI review has to
clear that gate on its own first. The system prompt's framing was also
generalized from "geometrically ambiguous" to cover contrast/content
ambiguity too. 5 new tests across the detector and `ai-service` suites.

**Tier 1 checklist coverage (22 → 29 detectors, new `seo` category).**
Closed the SEO/crawler-visibility checklist section from zero to
covered, plus two more zero-collector-change detectors:
- `meta-tags-v1`: missing/malformed meta description, `noindex` robots
  meta (critical severity — usually an accidental staging leftover),
  missing canonical tag.
- `open-graph-tags-v1`: missing og:title/description/image (controls
  how a shared link preview renders in Slack/iMessage/LinkedIn/etc).
- `robots-and-sitemap-v1` + `blocked-critical-resource-v1`: robots.txt
  and sitemap reachability, and — the subtler one — cross-referencing
  robots.txt Disallow rules against the CSS/JS the page actually loads,
  since a real browser ignores robots.txt but Googlebot's renderer
  respects it, so a too-broad Disallow rule can make Google's indexed
  view of a page look broken even though every human visitor sees it
  fine.
- `font-size-too-small-v1` (accessibility) and
  `image-aspect-ratio-distorted-v1` (image): straightforward, built on
  data already collected — no browser-side changes needed.

robots.txt/sitemap reachability required real infrastructure changes,
not just a new detector: `BrowserAdapter` gained a `fetchExternal`
method (Playwright's request context, capped response size, URL
Security Guard applied to every target before fetching — same SSRF
defense the page-navigation path already uses), and the in-page
collection script now reads `<meta>`/`<link rel="canonical">`/Open
Graph tags. All four SEO detectors are gated to the desktop viewport
only — these are `<head>`-level properties that don't vary by
viewport, and the pipeline deduplicates issues within a single
viewport's candidates, not across a scan's three viewports, so without
that gate every SEO issue would be reported three times over. 29 new
tests.

**Broken-link checking (`broken-link-v1`).** Built after initially
deferring it — the cost/risk shape genuinely differs from a single
robots.txt fetch, so this went in with explicit bounds rather than
guessing: capped to the first 15 unique `<a href>` targets per page
(`MAX_LINKS_TO_CHECK` in `page-context-collector.ts`), 5s timeout per
link, every target run through the same URL Security Guard the main
scan navigation uses (a link pointing at an internal/private address is
silently excluded, not flagged "broken" — that's the guard doing its
job, not a scan failure), and the whole check is best-effort: a network
hiccup on one link degrades to "not sampled," never fails the scan.
Reachability results land in the new `page.linkChecks` field, computed
once during collection (same pattern as `page.seo`) so the detector
itself stays a plain synchronous function over already-assembled data,
consistent with every other detector in this codebase. Gated to the
desktop viewport only, same reasoning as the SEO detectors: link
reachability doesn't vary by viewport, and issues aren't deduplicated
across a scan's three viewports, so without the gate a single broken
link would be reported three times over. 6 new tests.

**Still open, deliberately left as future work rather than guessed at:**
same-origin-vs-external link scope is currently "both" by default (no
signal from the person building this to scope it down), and multi-
browser (Firefox/WebKit) support wasn't touched this pass.

**Tier 2 begun: real interaction simulation (29 → 31 detectors).**
Every detector before this point ran against a single static DOM
snapshot. This is the first architecture change that requires actually
*doing* something to the page rather than just reading it:
`BrowserAdapter` gained a `checkFocusIndicators(selectors)` method that
focuses each given element for real (`locator.focus()`) and diffs its
computed style (`outline`, `box-shadow`, `border-color`) against its
own unfocused baseline — the *change* is what indicates a real focus
style, since some elements have a permanent border regardless of focus
state. A new `DataDependency` kind, `"interaction"`, marks which
detectors depend on this pass so it's visible at a glance which ones
need more than a snapshot.
- `missing-focus-indicator-v1` (accessibility, critical severity):
  flags interactive elements where focusing produces no visible
  change at all — arguably the single highest-impact keyboard-
  accessibility failure, since it's not "harder to tell where you
  are," it's "no way to tell at all."
- `positive-tabindex-v1` (accessibility): a purely static companion
  check — positive `tabindex` values are the single most
  well-documented cause of illogical tab order, so this needed no
  interaction simulation at all, just reading the `tabindex` attribute
  already captured in `attributes`.

Together these close the "tab order" and "focus indicators" checklist
items. Sampling is capped at 20 elements and gated to the desktop
viewport at the *collection* source (not just the detector, unlike the
SEO/link checks) — each focus check is a real interaction with a
meaningfully higher per-element cost than a network fetch, so there's
no reason to pay that cost three times over for a result that won't
vary by viewport. 7 new tests.

**Tier 2 completed: hover feedback + dropdown/menu toggles (31 → 33
detectors).** The remaining two Tier 2 items, built on the same
interaction-simulation foundation:
- `missing-hover-feedback-v1` (content, low severity): hovers a capped
  sample of links/buttons for real and diffs style (background, text
  color, border, box-shadow, cursor) against each element's own
  resting baseline — same technique as the focus check, for `:hover`
  instead. Lower severity than a missing focus indicator, deliberately
  — a sighted mouse user can usually still tell a link/button is
  clickable from its baseline styling even with zero hover change, so
  this is a polish issue, not an accessibility blocker.
- `broken-expandable-toggle-v1` (technical, high severity): clicks a
  capped sample of `aria-expanded` elements — the standard ARIA pattern
  behind dropdowns, accordions, and disclosure widgets — and verifies
  the attribute actually flips and, when `aria-controls` points at a
  real element, that element's visibility follows. Flags either "the
  toggle doesn't do anything" or the subtler bug: `aria-expanded` says
  one thing while the panel it describes shows another, which is a
  real defect for anyone using assistive technology even if it looks
  fine visually. Restores the original state with a second click
  before returning, so it doesn't leave the page altered for anything
  reading it afterward.

Both gated to the desktop viewport at the collection source, same
reasoning as the focus check. 6 new tests. This closes Tier 2 — every
item from that tier (focus indicators, tab order, hover feedback,
dropdown/menu toggles) is now covered.

## Production readiness: database backups

Shifting from detection-engine breadth back to the original
production-readiness list, starting with backups (the highest-risk gap
on that list — a single Postgres instance with real customer data and
zero backup story).

**`npm run backup --workspace=@ui-quality/database`** — runs `pg_dump`
in custom format (`-Fc`), uploads the result to object storage under
`backups/<timestamp>.dump`, then deletes backups older than
`BACKUP_RETENTION_DAYS` (default 30) — retention only runs *after* the
new backup is confirmed uploaded, never before, so a failed dump can't
leave the backup set empty. Storage target: local filesystem by
default, or S3 if `BACKUP_S3_BUCKET` is set (see
`packages/database/.env.example`).

**`npm run restore --workspace=@ui-quality/database -- --yes`** —
restores the newest backup (or `--key=backups/<specific>.dump`) via
`pg_restore --clean --if-exists`. Requires the explicit `--yes` flag —
without it, the CLI prints what it *would* do and exits without
touching the database, since `--clean` drops every existing object
before recreating it.

Both CLIs shell out to the real `pg_dump`/`pg_restore` binaries
(`postgresql-client`, not bundled with the `pg` npm driver), which
aren't available in this project's own sandbox — but unlike other
sandbox-unverified pieces in this README, this one has real coverage:
`.github/workflows/ci.yml` now has a **smoke-test step that runs on
every push** — install `postgresql-client`, insert a row, back up,
`TRUNCATE` the table, restore, verify the row survived. That's an
actual `pg_dump → wipe → pg_restore` cycle against real Postgres in
CI, not a documented-but-unverified claim like the Docker Compose path.

The orchestration logic itself (key naming, retention timing, temp-file
cleanup on both success and failure) is unit-tested with an injected
mock in place of the real binary — see
`packages/database/src/__tests__/backup.test.ts` and `restore.test.ts`
— so that part doesn't depend on `pg_dump` being installed at all.

**Scheduled automation**: `.github/workflows/backup.yml` exists but is
**manual-dispatch-only by default**, not on a cron schedule. Reason:
without `BACKUP_S3_BUCKET` configured, a scheduled run would either
fail outright or — worse — silently "succeed" writing to an ephemeral
GitHub Actions runner's local disk, which vanishes when the job ends.
`S3ObjectStorage` itself is still the same documented,
reviewed-but-not-yet-implemented stub from Phase 4
(`packages/storage/src/s3-adapter.ts`) — once that's filled in and
`BACKUP_S3_BUCKET`/AWS credentials are added as repo secrets, uncomment
the `schedule:` block in that workflow file to run it daily.

**Still open**: the shared Redis-backed rate limiter, billing/Stripe,
transactional email, error tracking, and legal/compliance basics —
see "Known limitations" above, which still applies to everything not
mentioned in this Phase 5 section.
