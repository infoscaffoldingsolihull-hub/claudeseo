# Test Report — SKY GATEWAY HYDERABAD

Build: `dist/Hyderabad_Airport_PM_Simulator.html` (3.80 MB; budget 8 MB). Environment: headless Chromium with
SwiftShader (software WebGL) in a cloud container — no GPU. Raw results: `docs/test-results.json`.

## Unit tests — `npm test` (gate G4)

**78 / 78 pass** (Node, no browser).

| File | Covers |
|---|---|
| `tests/pm/cpm.test.js` | Forward/backward pass, total and free float, FS/SS/FF/SF with leads and lags, PERT tₑ and σ, path σ, P(T ≤ d), crashing in ascending cost-slope order with critical-path re-evaluation — hand-calculated networks |
| `tests/pm/evm.test.js` | CV, SV, CPI, SPI, the four EAC formulas, ETC, VAC, TCPI to BAC and to EAC, earned schedule SV(t)/SPI(t) — textbook numbers |
| `tests/pm/analysis.test.js` | EMV (threat/opportunity signs), decision-tree roll-back, X̄/R and I-MR control limits, Western Electric rules, Pareto cumulative %, channels n(n−1)/2 |
| `tests/pm/montecarlo.test.js` | ≥ 5,000 iterations, percentile ordering, determinism by seed, tornado |
| `tests/pm/export.test.js` | MSPDI XML structure (tasks, link types, lags), CSV export → import round trip |
| `tests/pm/project.test.js` | Full headless runs at all three difficulties, entity minimums, serialise → restore → continue equals an uninterrupted run |
| `tests/pm/ai.test.js` | 80 intents route and answer on a project, glossary ≥ 150 unique terms, live-LLM tool loop and fallback with a mocked fetch |
| `tests/pm/game.test.js` | Mission/decision/quiz/tour/course counts and validity, deterministic decision sequence |

Headless full-project results (seed 20270104): trainee finishes day 1,412 (CPI 0.99, SPI(t) 1.00); professional
day 1,445 (0.95 / 0.98); crisis ≈ day 1,550 (0.92 / 0.91). Baseline 1,403 days; BAC PKR 64.0 bn (simulated).

## End-to-end acceptance — `npm run e2e`

**34 / 34 checks pass**, loaded from `file://` with every non-file network request blocked.

| Gate | Check | Result |
|---|---|---|
| G8 | Boots offline; no network request attempted | pass (boot ≈ 4 s) |
| G3 | modes 5 · panels 25 · WBS 89 (77 packages + 12 milestones) · risks 32 · stakeholders 16 · resources 12 · procurement 17 · tour beats 20 · missions 16 · decisions 38 · quiz 139 · glossary 317 · intents 80 | all ≥ minimum |
| G10 | Every panel opens with content, no TODO/lorem/"coming soon"; 25/25 rail buttons clickable | pass |
| — | Every mode: inspector, manager, drone, tour, ops | pass |
| — | Two simulated years at ×200 | 739 days in 58 s; 21 decision events shown and resolved; SPI 0.94, CPI 0.94 |
| G9 | Save → load slot restores the same day; JSON valid and free of any API key; MSPDI XML with 168 predecessor links; CSV 90 rows | pass |
| — | MEHRAN answers offline | pass |
| G6 | Zero console errors / warnings across the whole run | pass |
| G6 | Memory soak (45 s, drone orbit at ×10): geometries 177 → 178, textures 66 → 66, JS heap 56.8 MB → 56.8 MB | pass (10-minute soak below) |
| — | Phone viewport (390 × 844) boots, panel readable | pass |

### 10-minute soak

`node tests/e2e/run.mjs --quick --soak` — 600 s of drone auto-orbit with the simulation at ×10: **pass**. JS heap 56.8 MB → 56.8 MB (0.0 % growth), geometries 165 → 168, textures 61 → 63, zero console errors. Raw: `docs/test-results-soak.json`.

## Performance (gate G7) — honest status

| Tier | FPS (SwiftShader, 1920×1080) | Draw calls | Triangles |
|---|---|---|---|
| Low | 18 | 49 | 244 k |
| Medium | 20 | 45 | 408 k |
| High | 20 | 45 | 634 k |
| Ultra | 20 | 45 | 934 k |

These are **software-rendering** numbers on a CPU-only container and the medium–ultra readings sit at the same ~20 fps
ceiling, which points at the headless frame pacing rather than the scene. They show the scene is light (≤ 50 draw
calls, < 1 M triangles at Ultra) but they **do not** prove the brief's targets (≥ 60 fps High on a discrete GPU,
≥ 30 fps Medium on integrated graphics). Those must be confirmed on real hardware before the conference — open the file
with `?quality=high`, press **F** and read the FPS. Auto-tiering is implemented (rolling 90-frame average, down below
34 fps, up above 88 fps) and `?quality=` pins a tier.

## Visual review (gate G11)

Screenshots in `docs/screenshots/` (deviceScaleFactor 1): `manager-day`, `manager-golden`, `manager-night`,
`manager-dust-storm`, `manager-monsoon`, `inspector-terminal`, `inspector-night`, `drone-day`, `drone-dust`,
`drone-monsoon`, `tour-beat-1`, `ops-day`, `ops-night`, ten panel shots, `mehran-chat`, `mobile-phone`,
`mobile-phone-panel`.

Defects found in review and fixed before this run: a decision card covering every screenshot (harness now pauses
the clock and clears cards), the HUD weather label not following tour/preview weather, the monsoon reading as beige
dust (darker storm tint, thinner fog, instant weather in the QA hook), toasts covering open panels, `[object …]` text in
tables (three.js names shadowing DOM globals — the bundler now scopes three.js).

Remaining visual notes: the terminal interior is bright and hazy in daylight; airfield floodlight pools are large at
night; the full-intensity dust storm hides most of the airfield (by design — visibility 20 %).
