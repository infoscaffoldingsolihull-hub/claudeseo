# Benchmark Parity — SKY GATEWAY HYDERABAD vs Digital Giza

Every item of the measured benchmark (`docs/BENCHMARK_INVENTORY.md`, brief §0.1) with the airport game's equivalent and
evidence. "e2e:" = a check in `tests/e2e/run.mjs` (results in `docs/test-results.json`); "unit:" = `npm test`;
screenshots are in `docs/screenshots/`.

| # | Benchmark item | Benchmark | Airport game | Evidence | ✓ |
|---|---|---|---|---|---|
| 1 | Single HTML file, inline CSS/JS, three.js vendored | yes (2.0 MB) | yes (3.6 MB of the 8 MB budget); three.js r160 inlined in its own scope with its licence | `dist/Hyderabad_Airport_PM_Simulator.html`; `tools/build.mjs` size gate | ✓ |
| 2 | Offline from `file://`, system fonts | yes | yes — e2e blocks every non-file request | e2e: "G8 no network requests attempted", "boots to ready from file:// offline" | ✓ |
| 3 | Module banners | 35 modules, flat | 90+ modules, each in its own scope (no name collisions) | `/* ===== src/… ===== */` banners in the dist file | ✓ |
| 4 | First-person walk with collision, sprint, crouch, jump, head-bob, footsteps | yes | Site Walk: same controller, terminal and tower collision, surface-aware footsteps (sand/asphalt/concrete/tile/metal), lift POIs | e2e: "mode inspector"; `inspector-terminal.png`, `inspector-night.png` | ✓ |
| 5 | Orbit PM mode | yes | yes + click-to-select WBS element, heat-map overlays (SV, CV, risk, load) | e2e: "mode manager"; `manager-*.png` | ✓ |
| 6 | Tour: scripted cinematic, narration, arrows, letterbox, progress bar, auto-advance | 15 beats | 20 beats, Initiating → Closing, CLO-tagged lessons, weather + time + construction per beat, optional speech | e2e: "G3 tourBeats ≥ 18" (20); `tour-beat-1.png` | ✓ |
| 7 | Drone free flight | yes | yes + FPV HUD (altitude AGL, speed, heading, battery, geofence), photo mode (PNG), orbit-cam | e2e: "mode drone"; `drone-*.png` | ✓ |
| 8 | — | — | **New:** Operations mode (ATC-lite traffic, runway by wind, turnarounds, benefits KPIs) | e2e: "mode ops"; `ops-day.png`, `ops-night.png` | ✓ |
| 9 | Hand-written post chain: HDR, bright pass, 2-mip bloom, god-rays, ACES, haze, grade, CA, vignette, grain, SSAO | yes | all of these + FXAA, TAA (Ultra), depth of field, motion blur, lens flare, eye adaptation, weather/interior/night looks | `src/engine/postfx.js`; screenshots | ✓ |
| 10 | Adaptive quality tiers + rolling re-tier + `?quality=` | 4 tiers | 4 tiers, same detection and re-tiering, `?quality=`, per-feature overrides in the Graphics settings | e2e FPS per tier in `docs/test-results.json` | ✓ |
| 11 | Procedural audio, mute persisted | wind, site, water, torches, footsteps | wind, dust, rain, construction, terminal crowd, tower/ATC radio (no speech), jet spool, birds, crickets, footsteps, UI cues; mute + volume persisted | `src/engine/audio.js` (A9 sandbox: 164 state combinations, bounded node count) | ✓ |
| 12 | Sky: time of day, sun colour ramp, fog/horizon, night, time scrub | Preetham, simplified sun | Preetham + NOAA solar ephemeris for 25.318 N 68.366 E, moon phase, stars, PMREM image-based lighting | `src/engine/sky.js`; `manager-golden.png`, `manager-night.png` | ✓ |
| 13 | — | — | **New:** weather (clear, haze, dust storm, monsoon rain with wet materials, night fog, heat shimmer) tied to risks | `manager-dust-storm.png`, `manager-monsoon.png`, `drone-dust.png`, `drone-monsoon.png` | ✓ |
| 14 | HUD: brand, modes, date, % complete, SPI, CPI, clock, speed, advisor, stats (F), sound (K), help (?), compass, ticker, toasts, POI prompt, mission HUD, narration | yes | all + phase indicator, weather, budget-burn gauge, quality index, XP/level, decision cards, approval modal, drone FPV HUD | every screenshot; `src/ui/hud.js` | ✓ |
| 15 | Speed control | Paused/×1/×10/×40/×150 | Paused/×1/×10/×50/×200 | e2e: "two simulated years at ×200" | ✓ |
| 16 | 12 dashboard panels | 12 | 25, each CLO- and domain-tagged | e2e: "every panel opens with content and no placeholders", "every rail button clickable" (25/25) | ✓ |
| 17 | Charter | yes | Charter & business case (NPV/IRR/payback, simulated), gate G0 sign-off | `panel-charter.png` | ✓ |
| 18 | WBS | 8 + 34 | 12 summaries + 77 work packages + 12 milestones, WBS dictionary, RTM | e2e: "G3 wbsElements ≥ 70" (89) | ✓ |
| 19 | Schedule: Gantt, AON, PERT & crashing | yes | + activity list with FS/SS/FF/SF and lags, fast-tracking, resource levelling | `panel-schedule.png`; unit: cpm tests | ✓ |
| 20 | Cost & EV | PV, EV, AC, CPI, SPI, 3 EACs | all four EAC variants, ETC, VAC, TCPI (BAC and EAC), earned schedule, reserves, funding limits | `panel-cost.png`; unit: evm tests | ✓ |
| 21 | Risk register | 12 risks | 32 risks (26 threats, 6 opportunities), 5×5 heat map, EMV, decision tree, burndown, reserve drawdown | e2e: "G3 risks ≥ 24"; `panel-risk.png`; unit: risk tests | ✓ |
| 22 | Resources | 7 types | 12 types, levelling/smoothing, histogram, RACI, Tuckman | e2e: "G3 resources ≥ 10" | ✓ |
| 23 | Quality | control charts, gates, CoQ | + Western Electric rules, Pareto, fishbone, NCRs, standards | `panel-quality.png`; unit: quality tests | ✓ |
| 24 | Procurement | 5 contracts | 17 packages, all six contract types, make-or-buy, weighted bid scoring, claims | e2e: "G3 procurement ≥ 10" | ✓ |
| 25 | Stakeholders | 7, power/interest | 16, power/interest, salience, engagement matrix, comms plan, n(n−1)/2 | e2e: "G3 stakeholders ≥ 14"; `panel-stakeholders.png` | ✓ |
| 26 | Monte Carlo | chunked on main thread | ≥ 5,000 iterations in a Blob Web Worker, P10/50/80/90, tornado | unit: montecarlo tests | ✓ |
| 27 | Missions | 6 | 16 + XP, levels, 19 badges, scorecard with grade, certificate, leaderboard | e2e: "G3 missions ≥ 12" | ✓ |
| 28 | Session: 3 slots + autosave, JSON export | yes | + import, MS Project XML, CSV, printable report | e2e: "save → load slot restores state", JSON/MSPDI/CSV checks | ✓ |
| 29 | PM engine daily loop, all link types, three-point estimates, CPM with free float, crash in cost-slope order | yes | same structure, extended with weather, agile, change control, gates | unit: 78 tests | ✓ |
| 30 | Advisor (Hemiunu): ranked severity/why/recommendation/impact/action, P50/P80, one-click actions | yes | MEHRAN: 21 rules, 80 intents, 317-term glossary, human-in-the-loop approval, optional live Claude mode | e2e: "MEHRAN answers offline"; `mehran-chat.png` | ✓ |
| 31 | Mobile: virtual stick, drag-look, pinch, buttons, breakpoints | yes | same, mapped to 5 modes; phone/tablet/landscape layouts | e2e: "phone viewport boots"; `mobile-phone.png`, `mobile-phone-panel.png` | ✓ |
| 32 | World link: progress drives 3D state | pyramid height, casing, workers | 40+ WBS elements drive earthworks → pavement layers, markings, AGL, tower, terminal phases, landside, encroachment clearance, crews and vehicles | `src/world/layout.js` `WORLD_LINKS`; screenshots at different days | ✓ |
| 33 | QA harness | smoke test | e2e acceptance run + 78 unit tests + soak | `docs/TEST_REPORT.md` | ✓ |

**Result: 33/33 items at or above benchmark level.**
