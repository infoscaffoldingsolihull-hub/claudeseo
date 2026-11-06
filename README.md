# SKY GATEWAY HYDERABAD — Project Management Simulator

A 3D project-management simulator of the **Hyderabad Airport (Sindh, Pakistan · IATA HDD · ICAO OPKD) Revival &
Expansion Programme**, built for a 15-week university project-management course (PMBOK Guide 8th Ed.).
You run the programme from initiation to closing: you approve gates, baseline the schedule, crash the critical path,
answer to stakeholders, survive dust storms and the monsoon, run Scrum for the terminal IT, push change requests
through a change board, certify the aerodrome and hand it over to operations. Meanwhile you walk, fly and tour a
procedural 3D airfield whose construction state follows your work breakdown structure.

**One HTML file. Offline. No install.**

> **Simulated scenario — educational use.** Budgets (PKR), durations, vendors, airlines, workers, events and the
> masterplan layout are invented for teaching and are labelled "Simulated scenario data" in the app. Real-world facts
> (runway 02/20, 2,133 m × 30 m, history, the proposed revival "per press reports") come only from
> `src/data/facts.json`, each with a source and confidence grade — see `docs/FACTS_AND_SOURCES.md`.
> No real company logos, airline liveries or named individuals are used.

## Run it

Open `dist/Hyderabad_Airport_PM_Simulator.html` in Chrome, Edge or Firefox (double-click works; `file://` is fine).

| URL parameter | Effect |
|---|---|
| `?quality=low\|medium\|high\|ultra` | Pin the graphics tier (otherwise auto-detected and re-tiered from frame time) |
| `?seed=20270104` | Fixed scenario: same decision events every run |
| `?difficulty=trainee\|professional\|crisis` | Difficulty |
| `?skipintro` | Skip the onboarding tutorial |

## Controls

| Key | Action |
|---|---|
| 1 2 3 4 5 | Site Walk · Project Manager · Guided Tour · Drone · Operations (unlocks at handover) |
| WASD / arrows, mouse | Move / look (Shift sprint, C crouch, Space jump; Drone: Q down, Space up) |
| E | Inspect a work package (POI card → Raise NCR / Change Request) |
| Tab | Dashboard · H MEHRAN AI · B Agile board · R Presentation Studio · C Change request · M Missions |
| P · + · − | Pause · faster · slower (×1, ×10, ×50, ×200 days per second) |
| [ ] · N | Time of day · night |
| X · G | Photo mode · orbit-cam on the selection (Drone) |
| F · K · V · T · ? | Stats · sound · voice · touch controls · help |

Touch devices get a virtual stick, drag-look, pinch-zoom and on-screen buttons.

## What is inside

| Area | Content |
|---|---|
| Modes | Site Walk (first-person with collision, enterable terminal and tower cab), Project Manager (orbit, click-to-select, heat-map overlays), Guided Tour (20 narrated beats, letterbox, optional speech), Drone (FPV HUD, geofence, photo mode, orbit-cam), Operations (ATC-lite traffic, benefits KPIs) |
| PM engine | 12 summary packages, 77 work packages with WBS dictionary, FS/SS/FF/SF links with lags, PERT, CPM with free float, crashing in cost-slope order, fast-tracking, EVM (all EAC variants, TCPI, earned schedule), 32 risks, 16 stakeholders, 12 resource types, 17 procurement packages, change control board, Scrum backlog, quality control charts, Monte Carlo (5,000+ iterations in a Web Worker) |
| Dashboard | 25 panels, each tagged with its CLO and PMBOK 8 domain — from the Course Map to the Presentation Studio |
| MEHRAN | AI project manager: offline rule engine (80 intents, 317-term glossary) plus an optional live Claude mode with your own API key (kept in sessionStorage only), human-in-the-loop approvals, voice |
| Game | 16 missions, 38 decision events, XP, levels, badges, scorecard with grade and certificate, local leaderboard |
| Assessment | 139 quiz questions across 15 weeks, mid-term practice, final review, CLO breakdown |
| Exports | Save slots + autosave, JSON, MS Project XML (MSPDI), CSV, printable project report |

## Develop

```bash
npm run build     # → dist/Hyderabad_Airport_PM_Simulator.html (+ index.html for native-ESM dev)
```

```bash
npm test          # PM formula and engine unit tests (Node, no browser)
```

```bash
npm run e2e       # Playwright acceptance run from file:// with network blocked
```

```bash
npm run serve     # http://localhost:8080 — native ES modules for debugging
```

Architecture, interfaces and module ownership: `docs/ARCHITECTURE.md`. Loop state: `PROGRESS.md`.

## Documentation

| Document | Contents |
|---|---|
| `docs/PRESENTER_GUIDE.md` | 7- and 15-minute demo scripts, keys, talking points, fallback plan |
| `docs/COURSE_MAPPING.md` | 15-week traceability matrix (generated from `src/data/course.json`) |
| `docs/BENCHMARK_PARITY.md` | Feature-by-feature comparison with the Digital Giza benchmark |
| `docs/BENCHMARK_INVENTORY.md` | What the benchmark contains (measured) |
| `docs/FACTS_AND_SOURCES.md` | Every real-world fact with its source and confidence |
| `docs/TEST_REPORT.md` | Test results, FPS, screenshots |
| `docs/ARCHITECTURE.md` | Modules, `sim` API, event bus, data schemas |

The benchmark (Digital Giza PM simulator) is kept for reference in `reference/`.

## Credits & licences

Project code: MIT. three.js r160 (MIT) is vendored in `assets/vendor/` and inlined into the build with its licence
text. All textures, models, sounds and fonts are procedural or system-provided; nothing is downloaded at runtime.
