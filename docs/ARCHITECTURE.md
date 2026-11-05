# SKY GATEWAY HYDERABAD — Architecture & Interface Contract

Owner: A0 (Orchestrator). **This file is the contract.** Agents code against it; if an
interface must change, say so in your report — do not silently diverge.

---

## 1. Build & coding rules (all agents)

* Plain ES modules under `src/`. The bundler (`tools/build.mjs`) wraps **each module in its
  own scope**, so private top-level names never collide. Supported syntax only:
  * `import * as THREE from 'three';`
  * `import { a, b as c } from './x.js';` (relative paths with `.js` extension)
  * `import DATA from '../data/x.json' with { type: 'json' };`
  * `export const|let|function|class NAME …` and `export { a, b as c };`
  * **No** default exports from JS, **no** re-exports (`export … from`), **no** dynamic `import()`,
    **no** import cycles, no `npm` runtime dependencies (three.js r160 is vendored at
    `assets/vendor/three.module.js`).
* `src/pm/**`, `src/ai/rules.js`, `src/ai/intents.js`, `src/ai/glossary.js`, `src/game/**` (logic parts)
  must be **pure JS**: no DOM, no `window`, no THREE — they run under `node --test`.
* `'use strict'` is applied per module by the bundler. No globals except the QA hook `window.__hdd`.
* No network at runtime except `src/ai/llm.js` (optional live-LLM mode). No web fonts, no CDN, no
  external images. Textures are procedural (canvas/shader).
* No `TODO`, `lorem`, "coming soon", dead buttons, or empty panels may ship.
* Every real-world fact shown in UI must come from `src/data/facts.json` (via `src/core/facts.js`
  `fact(key)`). Everything invented is simulated and labelled (`SIM_BADGE` / "Simulated scenario data").
* No real company names/logos/liveries, no named real people. Fictional vendors & airlines only;
  officials by role.
* Dispose GPU resources you create (`dispose()` on every system).
* Each agent edits **only the files it owns** (§3). Shared files (`layout.js`, `bus.js`,
  `settings.js`, `main.js`, this doc) are A0's. Need a change? Put it in your report.
* Agents do **not** `git commit` / `git push` — A0 integrates and commits.
* Build into your scratchpad to avoid clobbering others: `node tools/build.mjs --out <scratch>/x.html`.
  `npm run serve` serves the repo at :8080 (set `PORT=` to pick another) for native-ESM debugging.

## 2. Repository layout

```
reference/PYRAMIDS_OF_GIZA_Project_Management.html   benchmark (read-only)
reference/giza/                                      benchmark source (read-only; reuse patterns)
assets/vendor/three.module.js                        three.js r160 (MIT)
src/shell.html                                       HTML skeleton + boot screen
src/main.js                                          Simulator: boot, loop, modes, keys, QA hook
src/core/   bus.js settings.js facts.js format.js
src/engine/ renderer.js postfx.js quality.js input.js controls.js noise.js textures.js
            materials.js sky.js weather.js audio.js
src/world/  layout.js collision.js terrain.js airfield.js terminal.js tower.js landside.js
            city.js props.js construction.js aircraft.js vehicles.js workers.js passengers.js
            traffic.js world.js
src/pm/     model.js cpm.js evm.js risk.js quality.js comms.js montecarlo.js agile.js
            change.js procurement.js export.js project.js
src/ai/     mehran.js rules.js intents.js glossary.js llm.js voice.js
src/game/   director.js missions.js decisions.js scoring.js
src/data/   facts.json quiz.json glossary.json course.json cases.json
src/ui/     dom.js storage.js charts.js charts2.js panels.js panels/*.js hud.js tour.js
            touch.js onboarding.js chat.js
src/styles/ main.css panels.css hud.css chat.css
tests/pm/*.test.js     node --test, no browser
tests/e2e/run.mjs      Playwright against dist/ from file://
tools/build.mjs tools/serve.mjs
```

## 3. Ownership

| Agent | Files |
|---|---|
| A0 Orchestrator | `src/main.js`, `src/core/*`, `src/world/layout.js`, `src/shell.html`, `tools/*`, `PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/BENCHMARK_*`, `README.md` |
| A1 Research | `src/data/facts.json`, `src/data/cases.json`, `docs/FACTS_AND_SOURCES.md` |
| A2 World | `src/world/{terrain,airfield,terminal,tower,landside,city,props,construction,world}.js` |
| A3 Rendering | `src/engine/{renderer,postfx,quality,sky,textures,materials,weather}.js` |
| A4 Vehicles & crowd | `src/world/{aircraft,vehicles,workers,passengers,traffic}.js` |
| A5 PM engine | `src/pm/*.js`, `tests/pm/*.test.js` |
| A6a UI shell | `src/ui/{hud,touch,onboarding,storage,dom}.js`, `src/ui/panels.js`, `src/ui/panels/session.js`, `src/styles/{main,hud}.css` |
| A6b PM panels | `src/ui/charts.js`, `src/ui/panels/{charter,scope,schedule,control,quality,cost,risk,forecast}.js`, `src/styles/panels.css` |
| A6c Course panels | `src/ui/charts2.js`, `src/ui/panels/{course,foundations,lifecycle,approach,agile,aipm,procurement,team,stakeholders,msproject,closing,cases,assess,present,missions,operations}.js` |
| A7 AI agent | `src/ai/*.js`, `src/ui/chat.js`, `src/styles/chat.css`, `src/data/glossary.json` |
| A8 Game/tour/quiz | `src/game/*.js`, `src/ui/tour.js`, `src/data/quiz.json`, `src/data/course.json` |
| A9 Audio | `src/engine/audio.js` |
| A10 QA | `tests/e2e/*`, `docs/TEST_REPORT.md` |

## 4. The `sim` object (src/main.js — `class Simulator`)

Every UI/game/AI module receives `sim`. Stable members:

```js
sim.bus          // EventBus: on(evt, fn) → off(), once, emit(evt, payload)
sim.settings     // Settings: get('a.b'), set('a.b', v)
sim.engine       // Engine (renderer, camera, postfx, quality, stats)
sim.input        // InputManager (benchmark)
sim.audio        // AudioEngine
sim.world        // World
sim.project      // Project  (REPLACED on newProject(); listen to 'project:new')
sim.game         // GameDirector (missions, decisions, XP, score)
sim.ai           // Mehran
sim.dashboard    // Dashboard
sim.hud          // HUD
sim.tour         // TourDirector
sim.touch        // TouchControls
sim.mode         // 'inspector' | 'manager' | 'tour' | 'drone' | 'ops'
sim.simulationSpeed  // project days per real second: 0, 1, 10, 50, 200
sim.selection    // currently selected WBS id or null
sim.overlay      // PM-mode heat-map: null | 'sv' | 'cv' | 'risk' | 'load'

sim.setMode(mode)
sim.setSpeed(daysPerSecond)
sim.select(wbsId)              // highlights in 3D + emits 'selection:changed'
sim.setOverlay(kind)
sim.newProject({ seed, difficulty, approach })
sim.syncWorld(force)
sim.previewProject(worldState) // tour: drive visuals without touching the simulation
sim.toast(text, kind)          // shortcut to hud.toast; kind: '' | 'good' | 'warn' | 'bad'
sim.shake(strength)            // camera shake (no-op under reduced motion)
sim.confetti()                 // milestone celebration (no-op under reduced motion)
sim.openPanel(id) / sim.closePanel()
sim.requestApproval({ title, detail, onApprove })  // human-in-the-loop modal (AI actions, CCB)
sim.download(filename, mime, text)                  // file export helper
```

### Bus event catalogue

| Event | Payload | Emitted by |
|---|---|---|
| `project:new` | `{ project }` | main |
| `project:day` | `{ day, snapshot }` (once per sim day, throttled to ≤ 1 per frame for UI) | main |
| `project:log` | `{ entry }` (`{serial, day, kind, title, detail}`) | main (relays `project.onLog`) |
| `project:milestone` | `{ id, name, day }` | main (from project log kind `'milestone'`) |
| `project:finished` | `{ snapshot }` | main |
| `risk:occurred` | `{ risk }` | main (from project log kind `'risk'`) |
| `weather:changed` | `{ kind, intensity }` | main |
| `mode:changed` | `{ mode, previous }` | main |
| `selection:changed` | `{ id }` | main |
| `panel:opened` / `panel:closed` | `{ id }` | dashboard |
| `decision:shown` / `decision:resolved` | `{ event, option }` | game |
| `mission:completed` / `mission:failed` | `{ mission }` | game |
| `xp:gained` | `{ amount, reason, total, level }` | game |
| `badge:earned` | `{ badge }` | game |
| `quiz:answered` | `{ week, questionId, correct }` | assess panel |
| `quiz:completed` | `{ setId, score, total, byClo }` | assess panel |
| `change:raised` / `change:decided` | `{ change }` | control panel / project |
| `ai:message` | `{ role, text }` | chat |
| `settings:changed` | `{ path, value }` | settings |
| `tour:beat` | `{ index, beat }` | tour |

## 5. PM engine contract (`src/pm/project.js` → `class Project`) — A5

Pure JS. Money in **PKR** (store raw rupees; UI shows "PKR bn"). Time in whole **days**
from the project start date (simulated: **Mon 4 Jan 2027**). All gameplay data simulated.

```js
new Project({ seed = 20270104, difficulty = 'professional' /* trainee|professional|crisis */,
              approach = 'hybrid' /* predictive|agile|hybrid */ })

// ---- static / baseline ----
p.seed, p.difficulty, p.approach
p.startDate                    // Date (UTC midnight 2027-01-04)
p.wbs                          // tree [{ id:'3', code:'3', name, children:[{ id:'3.2', … }] }]
p.summaries                    // 12 summary packages [{id, code, name, color}]
p.tasks                        // leaf elements (≥ 70), each:
  { id:'3.2', code:'3.2', name, summaryId:'3', o, m, p, duration, sigma,
    predecessors:[{ id, type:'FS'|'SS'|'FF'|'SF', lag }],
    budget /*PKR*/, crew:{ resId:n }, crashDuration, crashCost, costSlope,
    delivery:'predictive'|'agile', milestone:false,
    dictionary:{ description, deliverables:[…], acceptance, owner /*role*/, assumptions, risks:[riskIds] },
    clo:['CLO1'], domain:'Scope' }
p.taskById                     // Map
p.milestones                   // [{ id, name, taskId, baselineDay }]
p.baseline                     // { nodes: Map(id→{es,ef,ls,lf,totalFloat,freeFloat,critical}),
                               //   duration, criticalPath:[ids], order:[ids] }
p.baselineDuration, p.bac
p.contingencyReserve, p.managementReserve, p.fundingLimits:[{ year, limit }]
p.pert                         // { mean, sigma, probabilityBy(day) , pathSigma }
p.resources                    // ≥ 10: [{ id, name, unit, dayRate, peakDemand, baseline, assigned,
                               //          capacity, required, utilisation }]
p.risks                        // ≥ 24: [{ id:'R01', title, category, rbs, kind:'threat'|'opportunity',
                               //   probability, costImpact, daysImpact, pScore 1-5, iScore 1-5, score,
                               //   emv /*signed*/, response, strategies:[…], responseCost, residual,
                               //   owner /*role*/, trigger, status:'Open'|'Occurred'|'Closed', occurrences,
                               //   weather?:'dust'|'rain'|'heat' }]
p.procurement                  // ≥ 10: [{ id:'P01', name, packageIds, contractType:'FFP'|'FPIF'|'CPFF'|'CPIF'|'CPAF'|'T&M',
                               //   estimate, leadTime, makeOrBuy:{ make, buy, decision }, bids:[{ vendor, price,
                               //   technical, experience, schedule, score }], status:'Planned'|'RFP'|'Evaluating'|
                               //   'Awarded'|'Delivering'|'Closed', vendor, awardedValue, claims:[], payments:[], performance }]
p.stakeholders                 // ≥ 14: [{ id:'S01', role, group, power 0..1, interest 0..1, legitimacy, urgency,
                               //   current 1..5, desired 1..5, satisfaction 0..1, channel, frequency, needs }]
p.commsPlan                    // [{ audience, info, method, frequency, owner }]
p.raci                         // { roles:[…], rows:[{ deliverable, cells:{ role:'R'|'A'|'C'|'I'|'' } }] }
p.requirements                 // [{ id:'RQ01', text, source /*stakeholder id*/, priority, wbs:[ids], test, status }]

// ---- live state ----
p.day, p.finished, p.phase      // phase ∈ 'initiating'|'planning'|'executing'|'monitoring'|'closing'
p.gates                         // [{ id:'G0'…, name, phase, criteria:[…], status:'pending'|'ready'|'approved', day }]
p.state                         // Map id → { pct, actualStart, actualFinish, actualCost, remaining, crashed, rework, blocked }
p.weather                       // { kind:'clear'|'haze'|'dust'|'rain'|'fog'|'heat', intensity 0..1, label, workFactor }
p.events                        // log, newest first: { serial, day, kind:'info'|'good'|'warn'|'bad'|'risk'|'milestone'|'change'|'decision', title, detail }
p.onLog = (entry) => {}         // callback assigned by main.js
p.evmHistory                    // [{ day, pv, ev, ac, spi, cpi, eac }] every 7 days
p.changes                       // [{ id:'CR01', title, description, raisedBy, day, status:'Raised'|'Analysed'|'Approved'|'Rejected'|'Implemented',
                                //   impact:{ scope, days, cost, risk, quality }, votes:{ role:'approve'|'reject' }, decisionDay }]
p.issues, p.decisionLog, p.lessons  // arrays of { id, day, title, detail, owner, status }
p.quality                       // { metrics:{ concrete, compaction, friction, roughness }: { name, unit, target, lsl, usl, samples:[{ day, value, ok }] },
                                //   ncrs:[…], defects:{ category:count }, costOfQuality:{ prevention, appraisal, internalFailure, externalFailure },
                                //   inspectionLevel, audits:[…] }
p.agile                         // { backlog:[{ id:'US01', title, points, priority, status:'backlog'|'todo'|'doing'|'review'|'done', sprint }],
                                //   sprintLength:14, sprints:[{ n, startDay, endDay, committed, completed, goal }], currentSprint,
                                //   wip:{ doing, review }, velocity:[…], ceremonies:[{ day, kind, note }] }
p.safety, p.welfare, p.incidents, p.qualityIndex, p.stakeholderSatisfaction
p.benefits                      // { movementsPerDay, paxPerDay, onTimePct, businessCaseTarget:{…} } (ops mode feeds it)

// ---- methods ----
p.step()                        // advance one day (eligibility → resource demand → modifiers →
                                //  progress & cost → labour → consumables → weather/risk/stakeholders → agile → gates)
p.snapshot()                    // flat object for HUD/AI (see below)
p.evm()                         // { pv, ev, ac, sv, cv, spi, cpi, eac:{ cpi, atBudget, composite, bottomUp }, etc, vac,
                                //   tcpi:{ bac, eac }, es, svt, spit, bac }
p.worldState()                  // { pct:{ [wbsId]: 0..1 }, workforce 0..1, phase, operational:boolean, weather, activeIds:[…] }
p.date(day = p.day) → Date ;  p.dateLabel(day) → 'Mon 04 Jan 2027'
p.setStaffing(resId, n) ; p.setAutoStaffing(bool) ; p.levelResources() → report
p.respondToRisk(riskId, strategy) → { ok, cost, message }
p.crashPlan(days) → [{ id, days, cost, slope }] ; p.applyCrashPlan(days) → summary ; p.crashActivity(id, days)
p.fastTrack(id) → { ok, daysSaved, riskAdded }
p.raiseChange({ title, description, raisedBy, impact? }) → change
p.analyseChange(id) → impact ; p.voteChange(id, role, approve) ; p.decideChange(id, approve) ; p.implementChange(id)
p.applyEffect({ days, cost, quality, safety, scope, risk:{ id, dp }, stakeholder:{ id, d }, satisfaction, welfare }, source)
p.approveGate(id) → { ok, message }
p.setInspectionLevel(v /*0.5..1.5*/)
p.agilePlanSprint(storyIds) ; p.agileMove(storyId, status) ; p.agileBurndown(n) → [{ day, remaining, ideal }]
p.evaluateBids(pkgId, weights) → ranked ; p.award(pkgId, vendor) ; p.raiseClaim(pkgId, amount, reason)
p.engageStakeholder(id, action /* 'inform'|'consult'|'involve'|'collaborate'|'empower' */) → { ok, message }
p.addLesson({ title, detail, category }) ; p.closeProject() → closeoutReport
p.serialise() → plain JSON (version: 1, includes rngState) ; p.restore(data) → boolean
```

`p.snapshot()` keys (at least): `day, dateLabel, phase, progress, bac, pv, ev, ac, sv, cv, spi, cpi,
eac, etc, vac, tcpi, svt, spit, baselineDuration, forecastFinish, scheduleVarianceDays,
contingencyRemaining, managementRemaining, riskExposure, openRisks, realisedRisks, qualityIndex,
safety, welfare, incidents, stakeholderSatisfaction, openChanges, weather, criticalPath, finished,
velocity, budgetBurn (ac/bac)`.

### Pure helper modules (each unit-tested in `tests/pm/`)

* `cpm.js` — `computeCPM(tasks)`, `pertDuration(o,m,p)`, `pertSigma(o,p)`, `normalCdf(z)`,
  `pertAnalysis(cpm, tasks, target)`, `crashCandidates(cpm, tasks, days)`, `costSlope(task)`.
* `evm.js` — `evmMetrics({ bac, pv, ev, ac, etcBottomUp })` → every §5.3 formula, `earnedSchedule(pvCurve, ev)`.
* `risk.js` — `emv(p, impact, kind)`, `decisionTree(node)` roll-back, `riskScore(p,i)`.
* `quality.js` — `xbarR(subgroups)`, `imr(values)` (limits), `westernElectric(values, cl, sigma)`, `pareto(counts)`.
* `comms.js` — `channels(n) = n(n−1)/2`.
* `montecarlo.js` — `runMonteCarlo(project, { iterations ≥ 5000 })` sync, and
  `createMonteCarloWorker()` (Blob Web Worker, browser only; guard `typeof Worker`).
  Result: `{ iterations, finish:{ p10,p50,p80,p90, histogram }, cost:{ … }, probabilityOnTime, tornado:[{ id, code, correlation }] }`.
* `export.js` — `toMSPDI(project) → xml string`, `toCSV(project) → csv`, `fromCSV(text) → [{ id, name, duration, predecessors }]`.
* `model.js` — all scenario data (WBS, resources, risks, procurement, stakeholders, requirements, RACI, comms plan).

## 6. World contract (`src/world/world.js` → `class World`) — A2 (+A3, A4)

```js
const world = new World(engine, textures, { onProgress(p, label) })
await world.build()                    // async, yields between steps
world.scene                            // THREE.Scene
world.sky                              // SkySystem (A3): setHour(h), hour, setDate(Date), state{dayFactor,nightFactor,…}, sunWorld, sunElevation
world.weather                          // WeatherSystem (A3): set(kind, intensity), state
world.collision                        // CollisionWorld (benchmark): groundAt, move, addBox…
world.applyProjectState(worldState)    // drives construction visuals from WBS %
world.update(dt, camera, elapsed, { mode, operations })
world.pick(raycaster) → { wbsId, name, point } | null       // PM mode click-select
world.highlight(wbsId | null)
world.setOverlay(kind, valuesById)     // heat-map tint per WBS element: valuesById { id: -1..1 }
world.pointsOfInterest                 // [{ id, name, wbsId, position:THREE.Vector3, text }]
world.interiorAt(position) → 'terminal' | 'tower' | null
world.towerCabView → { position, target }                   // "control view"
world.operations                       // Traffic (A4): start(), stop(), update, kpis()
world.kickDust(x,y,z,strength)
world.dispose()
```

Systems A2 builds: terrain (flat alluvial plain with procedural sand/scrub, cut/fill colours),
airfield (runway with ICAO Annex 14-style markings, worn existing pavement, extension phases,
taxiways, apron, stands, blast pads with chevrons, windsock, PAPI, approach lights + rabbit,
edge/centreline lights, perimeter fence/wall, encroachments), terminal (enterable: check-in islands,
security lanes, lounge, FIDS canvases showing live sim data, baggage hall; Ajrak screens;
windcatcher roof forms), tower (enterable cab), landside (forecourt, car park, access road),
city backdrop (instanced blocks, lit windows at night, roads), props (palms, neem, dust),
construction (cranes, paver, rollers, dump trucks, batch plant, site offices, fencing).

A4 builds: `aircraft.js` generic airliner/narrow-body/wide-body procedural meshes (fictional
liveries), `vehicles.js` construction fleet + GSE, `workers.js` instanced workers, `passengers.js`
terminal crowd, `traffic.js` Operations-mode ATC-lite (landing on 02 or 20 by simulated wind,
taxi, park, turnaround) with KPIs.

## 7. UI contract — A6

`class Dashboard(root, sim)`: left rail of panel buttons + one panel container.

* Panel registry: `src/ui/panels.js` exports `PANELS` = `[{ id, title, sub, icon, week, clo:['CLO1'], domain, wide, file }]`.
* Each panel module exports `const PANEL_<ID> = { id, render(dash, body, head), onOpen?(dash), onClose?(dash), tick?(dash) }`.
  `dash.sim`, `dash.project` (always current), `dash.state` (per-panel scratch object, persists across re-renders),
  `dash.rerender()`, `dash.tag(cloArray, domain)` → standard CLO/domain chip row, `dash.simBadge()` → "Simulated scenario data" badge.
* Every panel header shows CLO chips + PMBOK domain/focus-area chip (`dash.tag`).
* Shared widgets in `src/ui/dom.js`: `el, svg, clear, fmtPKR(v) → 'PKR 12.4 bn', fmtNum, fmtDays, fmtPct, indexClass, kpi, pill, bar, table(cols, rows), tabs(items, active, onChange), button(label, onClick, opts), modal({title, body, actions})`.
* Charts (`charts.js`, `charts2.js`): hand-written SVG, colour-blind-safe palette from CSS vars, tooltips via `<title>`.
* Palette ("Indus Night"): `--bg #0b0f1e`, `--panel rgba(16,20,40,.78)`, `--ink #e8e4d8`, `--muted #9aa3b8`,
  `--ajrak #9b1b30`, `--indigo #2b3a8c`, `--brass #c9a227`, `--amber #ffb000`, `--ok #3ddc84`, `--white #f4f6ff`.
  CB-safe palette (Okabe–Ito) swaps via `body.cb-safe`.

Panels (ids): `course foundations lifecycle charter approach agile aipm scope schedule control quality
cost risk forecast procurement team stakeholders msproject closing cases assess present missions
operations session` (25).

## 8. AI contract (`src/ai/mehran.js` → `class Mehran(sim)`) — A7

```js
ai.analyse() → [{ severity:'critical'|'warning'|'info'|'good', title, why, recommendation, impact, action?:{ label, run() } }]
ai.ask(text) → Promise<{ text, items?, actions?, engine:'offline'|'live' }>
ai.standup() → string ; ai.statusReport() → { title, markdown } ; ai.explain(term) → string
ai.status → 'offline' | 'live' | 'fallback'   // HUD light: green live, amber fallback/offline
```
Offline intents ≥ 60 (`intents.js`), glossary ≥ 150 terms (`data/glossary.json`). Live mode: key in
`sessionStorage` only, `fetch('https://api.anthropic.com/v1/messages', { headers: { 'x-api-key', 'anthropic-version':'2023-06-01',
'anthropic-dangerous-direct-browser-access':'true' }, body:{ model, stream:true, tools… } })`; every
state-changing tool call goes through `sim.requestApproval`.

## 9. Game contract (`src/game/director.js` → `class GameDirector(sim)`) — A8

```js
game.missions        // ≥ 12: [{ id, name, phase, clo, brief, objectives:[{ id, text, check(ctx) }], xp, status }]
game.decisions       // ≥ 30 decision events [{ id, title, text, trigger:{ minDay?, phase?, wbs?, chance? }, clo, options:[{ label, tradeoff:{ time, cost, quality, risk, stakeholders, safety, scope }, effects, outcome }] }]
game.xp, game.level, game.levelName, game.badges, game.score
game.update(dt)      // checks triggers each sim day; shows decision cards via sim.hud.showDecision(event)
game.resolve(eventId, optionIndex)
game.scorecard() → { spi, cpi, quality, safety, stakeholders, riskTrend, benefits, quiz, byClo:{CLO1,CLO2,CLO3}, grade }
game.leaderboard()   // local, localStorage
game.serialise() / game.restore(data)
```
Seeded RNG from `?seed=`. Difficulty scales decision frequency and risk strength.

Tour (`src/ui/tour.js` → `class TourDirector(sim)`): ≥ 18 beats `{ title, text, lesson, clo, phase,
camera:{ position, target } , hour, weather, progress /* worldState override */, duration }`; `start(i)`, `stop()`,
`next()`, `previous()`, `goTo(i)`, `update(dt)`; narration via `speechSynthesis` when enabled.

## 10. QA hook (`window.__hdd`)

`ready`, `sim`, `bootReport()`, `listPanels()`, `openPanel(id)`, `closePanels()`, `setMode(m)`,
`runDays(n)`, `snapshot()`, `triggerDecision(id?)`, `resolveDecision(i)`, `saveSlot(s)`, `loadSlot(s)`,
`exportJSON()`, `exportMSPDI()`, `exportCSV()`, `setWeather(kind, intensity)`, `setHour(h)`,
`stats()`, `memory()`, `railButtons()`, `aiAsk(text)`.

## 11. UI component APIs used by main.js

**HUD** (`src/ui/hud.js`, A6a) — `new HUD(root, sim)`
```
toast(text, kind) · update(dt) · setPrompt(text|null) · showPoi(poi) · showSelection(wbsId)
toggleHelp(force) · isHelpOpen() · toggleStats(force) · refreshSound()
speedIndex · setSpeedIndex(i) (SPEEDS = [0,1,10,50,200] from main.js) · applySpeed()
showNarration({ title, text, lesson, clo, phase }) · hideNarration() · setTourProgress(i, n) · setCinematic(on)
showDecision(event, onChoose(optionIndex)) · blocking() → true while a decision card is open · closeCards()
requestApproval({ title, detail, onApprove, onReject }) → Promise<boolean> · modal({ title, body, actions }) · modalOpen() · closeModal()
confetti()
```
The HUD reads `sim.project.snapshot()`, `sim.mode`, `sim.world.weather.state`, `sim.world.sky`, `sim.heading()`,
`sim.droneBattery`, `sim.drone`, `sim.ai.status`, `sim.game.{xp,level,levelName}`. Required widgets: brand, mode
switch (5 modes, buttons + touch arrows), metrics (date, % complete, SPI, CPI, budget-burn gauge, quality index,
phase/focus-area, weather icon, clock), speed control (Paused/×1/×10/×50/×200), MEHRAN button + status light,
renderer stats (F), sound (K), help card (?), compass strip (true heading), event ticker, toasts, POI reticle +
"press E" prompt, POI card (WBS code, %, quality status, open issues, **Raise NCR / Change Request** button),
mission HUD, narration box with captions, letterbox bars + tour progress bar, drone FPV HUD (altitude AGL, speed,
heading, battery, geofence warning near the active runway once operations begin), photo-mode hiding.

**Dashboard** (`src/ui/panels.js`, A6a) — `open(id)`, `toggle(id)`, `close()`, `openId`, `panelIds`, `tick(dt)`,
`quizCount()`, `focusChangeForm()`, `rerender()`. Panel modules per §7.

**ChatPanel** (`src/ui/chat.js`, A7) — `new ChatPanel(root, sim)`, `toggle(force)`, `isOpen`, `toggleVoice()`, `update(dt)`, `send(text)`.

**Onboarding** (`src/ui/onboarding.js`, A6a) — `new Onboarding(root, sim)`, `maybeStart()` (only if `settings.onboarded`
is false), `start()`: 60-second skippable tutorial, role (student/instructor), difficulty, seed → `sim.newProject(...)`.

**TouchControls** (`src/ui/touch.js`, A6a) — benchmark API: `toggle()`, `setEnabled(on)`, `update(dt)`, `buttons`, `enabled`.

**TourDirector** (`src/ui/tour.js`, A8) — uses `sim.cinematic` (`CinematicPlayer.play(keyframes)`), `sim.hud.showNarration`,
`sim.previewProject(state)`, `sim.world.sky.setHour`, `sim.world.weather.set`. Speech via `speechSynthesis` when
`settings.audio.narration`.

**GameDirector** (`src/game/director.js`, A8) — constructed BEFORE the HUD exists: do not touch `sim.hud` in the
constructor. `onDay(day)` is called after each `project.step()`; `update(dt)`; `trigger(id?)`, `resolveActive(i)`,
`autoResolve()` (QA: picks option 0), `reset()`.

**World extras used by main.js** — `world.surfaceAt(pos) → 'sand'|'asphalt'|'concrete'|'tile'|'metal'`,
`world.elementCentre(wbsId) → THREE.Vector3`, `world.interiorAt(pos)`.

**Project extras used by main.js** — `project.overlayValues(kind) → { wbsId: -1..1 }` (sv, cv, risk, load) and
`project.previewState(progress0to1) → worldState` (tour / screenshots: everything built up to that fraction of the
baseline schedule).
