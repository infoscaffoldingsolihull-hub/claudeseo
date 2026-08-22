# Digital Giza — Project Management Simulator

An interactive digital twin of the Giza Necropolis in **2560 BCE**, wrapped around a complete,
PMBOK-aligned simulation of the construction of the Great Pyramid of Khufu.

Walk the plateau at sunrise. Stoop down the Descending Passage and stand in the King's Chamber.
Fly the site at golden hour. Then open the dashboard and run the project: a 34-package work
breakdown structure, a critical-path network with all four dependency types, three-point PERT
estimates, earned-value analysis, a quantified risk register, resource levelling, statistical
quality control, procurement, stakeholder engagement, and Monte Carlo forecasting.

**Everything runs from a single HTML file, offline, with no build step, no server and no network
access.**

---

## Run it

### The conference build (recommended)

Open `dist/GizaDigitalTwin.html` in Chrome, Edge or Firefox. Double-clicking the file is enough —
it works from `file://`. Nothing is downloaded; three.js and every texture are inside the file.

Optional URL parameters:

| Parameter | Effect |
|---|---|
| `?quality=low` | Pin the lowest graphics tier (integrated graphics, old laptops, projectors) |
| `?quality=medium` | Pin the medium tier |
| `?quality=high` | Pin the high tier |
| `?quality=ultra` | Pin the highest tier (discrete GPU) |

Without a parameter the engine detects the GPU, picks a tier, and then continuously re-tiers on a
rolling frame-time average.

### Development

```bash
npm run serve     # static server on http://localhost:8080 — loads src/ as native ES modules
npm run build     # regenerate index.html and dist/GizaDigitalTwin.html
npm test          # headless Chromium QA: console errors, FPS, panels, collision, project run
```

`index.html` at the repository root is the development entry point (native ES modules, needs a
server). `dist/GizaDigitalTwin.html` is the single-file deliverable.

---

## The four modes

| Key | Mode | What it is for |
|---|---|---|
| `1` | **Archaeologist** | First-person exploration of the plateau and the pyramid's interior. Twelve points of interest with historical and project-management commentary. |
| `2` | **Project Manager** | Orbit the site while running the project: staffing, risk responses, crashing, quality inspection. |
| `3` | **Tour Guide** | A fifteen-beat scripted camera tour with narration, driven by the arrow keys. This is the presentation mode. |
| `4` | **Drone** | Free six-degree-of-freedom cinematic flight. |

Press `?` in the application for the full control reference.

---

## What is actually simulated

| Domain | Implementation |
|---|---|
| **Scope** | 8 control accounts, 34 work packages, interactive WBS tree with earned value roll-up |
| **Schedule** | Precedence-diagram CPM with FS / SS / FF / SF and leads/lags; ES, EF, LS, LF, total float, free float; live re-forecast on remaining durations |
| **Estimating** | PERT three-point estimates, `te = (O + 4M + P)/6`, `σ = (P − O)/6`, critical-path variance, probit at any confidence |
| **Cost** | Full earned-value analysis: PV, EV, AC, SV, CV, SPI, CPI, three EAC formulas, ETC, VAC, TCPI, plus Earned Schedule (ES, SV(t), SPI(t)) |
| **Risk** | 12-entry quantified register, probability × impact matrix, EMV, four response strategies with real cost, contingency and management reserves, live stochastic events |
| **Resources** | 7 resource pools sized from the baseline resource histogram, auto-levelling, utilisation, over-allocation cost, welfare and safety dynamics |
| **Quality** | Seven quality gates with tolerances, statistical process control charts, rework on out-of-tolerance samples, four-category cost of quality |
| **Procurement** | 5 contracts with contract-type rationale, lead times and delivery tracking |
| **Stakeholders** | 7 stakeholders on a power/interest grid with dynamic engagement levels driven by project performance |
| **Uncertainty** | Monte Carlo over the whole network: PERT-beta duration sampling, Bernoulli risk trials, P10/P50/P80/P90, tornado sensitivity |
| **AI advisor** | Hemiunu — a transparent rule-and-forecast engine that diagnoses the binding constraint, states the root cause, and quantifies its recommendation |

The 3D world is not decoration: the pyramid's built height, its casing coverage, the ramp, the
scaffolding, the number of workers on site and the size of the stone stockpile are all driven by
the simulation state.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md) | Controls, modes, dashboard walkthrough, presenting guide |
| [`docs/TECHNICAL_REPORT.md`](docs/TECHNICAL_REPORT.md) | Architecture, rendering pipeline, procedural generation, performance engineering |
| [`docs/PROJECT_MANAGEMENT.md`](docs/PROJECT_MANAGEMENT.md) | The project model in full, with every formula |
| [`docs/DEFENCE_QA.md`](docs/DEFENCE_QA.md) | Anticipated examiner questions and answers |
| [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md) | Engineering audit, scoring and improvement roadmap |
| [`docs/HISTORICAL_SOURCES.md`](docs/HISTORICAL_SOURCES.md) | Archaeological basis, survey data, and where the model simplifies |

---

## Repository layout

```
index.html                    development entry point (generated)
dist/GizaDigitalTwin.html     the single-file deliverable (generated)
assets/vendor/                three.js r160, vendored for offline use
src/
  shell.html                  HTML skeleton shared by both builds
  main.js                     application shell and the test API
  engine/                     renderer, post-processing, controls, input, quality, noise, textures
  world/                      terrain, sky, pyramids, monuments, site, interior, workers, props
  pm/                         the project simulation: model, CPM, EVM, Monte Carlo, advisor
  ui/                         dashboard panels, charts, HUD, guided tour, stylesheet
tools/
  build.mjs                   the single-file bundler
  serve.mjs                   zero-dependency dev server
  smoke-test.mjs              headless Chromium QA harness
docs/                         documentation and screenshots
```

---

## Licence

Project code: MIT. Vendored three.js is MIT (see `assets/vendor/THREE-LICENSE.txt`).
