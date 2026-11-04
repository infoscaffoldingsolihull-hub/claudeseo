# Benchmark Inventory — "Digital Giza" (PYRAMIDS_OF_GIZA_Project_Management.html)

Read by A0 on 2026-11-04 from `reference/PYRAMIDS_OF_GIZA_Project_Management.html` (2,030,667 bytes,
72,758 lines) and its source in `reference/giza/src/`. Counts below were measured, not copied from the brief
(`grep -n "src/" …` for modules; `node -e "import('./pm/model.js')…"` for model sizes).

## Packaging
| Item | Measured |
|---|---|
| Single file | yes — inline `<style>`, inline `<script>`; three.js **r160** vendored inline |
| Fonts | system stack only |
| Offline | runs from `file://`, no network |
| Module banners | `/* ================= src/… ================= */`, flat concatenation, unique-top-level-name check |
| Modules | **35** (engine 8 · world 16 · pm 5 · ui 7 · main 1) — postfx, quality, renderer, input, controls, noise, textures, audio · collision, sky, layout, terrain, geobuild, pyramids, relics, monuments, site, workers, tombs, interior, entrances, cemeteries, props, world · model, cpm, project, advisor, montecarlo · storage, dom, charts, panels, hud, tour, touch · main |

Baseline in the brief said "≈72,746 lines": measured 72,758 (the brief is within 0.02 %). All other baseline items confirmed.

## Modes (keys 1–4)
Archaeologist (FPS: capsule collision vs AABB grid, sprint, crouch, jump, head-bob, footsteps, slope factor,
void-catch) · Project Manager (orbit, collision-aware) · Tour Guide (15 beats, `CinematicPlayer` keyframes, letterbox,
progress bar, arrow keys, auto-advance, PM note per beat) · Drone (6-DoF, Q/Space down/up, auto-orbit).

## Rendering
Hand-written post chain (no EffectComposer): HDR MSAA scene RT → SSAO (16-tap, depth-reconstructed normals, blur) →
soft-knee bright pass → separable gaussian bloom (2 mips) → god-rays from sun screen position → composite (ACES,
bloom+rays, heat haze, lift/gain/saturation/contrast grade, chromatic aberration, vignette, film grain, sRGB).
Looks: `exterior`, `interior`. Preetham sky dome, real solar position (declination + hour angle) for Giza, stars,
moon disc, sun colour-temperature ramp, hemisphere bounce, exp² fog keyed to horizon, frustum-fitted texel-snapped
shadow camera.

## Adaptive quality
Tiers low / medium / high / ultra from GPU string (WEBGL_debug_renderer_info) + mobile/cores/memory heuristics;
re-tier on a 90-frame rolling average (down < 34 fps, up > 88 fps, never auto-up to ultra); `?quality=` override.
Controls pixel ratio, shadows, shadow-map size & distance, MSAA, SSAO, bloom, god-rays, grain, anisotropy, instance
counts (blocks, dust, birds, sand, workers, vegetation, rocks), torch lights, view distance.

## Audio
WebAudio, created on first gesture: wind bed, site-work bed, water, torch crackle, footsteps (sand/stone), kite
calls, chisel strikes, threshold whoosh, discovery chime; master mute persisted in localStorage.

## HUD
Brand, mode switch, live metrics (date, % complete, SPI, CPI, clock), speed (Paused/×1/×10/×40/×150), advisor
button, renderer stats (F), sound (K), help (?), compass strip, event ticker, toasts, POI reticle + "press E",
mission HUD, narration box, codex cards.

## Dashboard — 12 panels
Project Charter · WBS · Schedule (Gantt / AON network / PERT & crashing) · Cost & EV · Risk Register · Resources ·
Quality · Procurement · Stakeholders · Monte Carlo · Missions · Session.

## PM engine (measured)
| Item | Count |
|---|---|
| Summary packages / leaf work packages | **8 / 34** (= 42 WBS elements) |
| Dependency types | engine supports FS/SS/FF/SF + lag; model uses FS, SS, FF |
| Estimates | three-point PERT on every package |
| CPM | forward/backward pass, total & free float, live re-forecast on remaining durations |
| Crashing | `crashCandidates` in cost-slope order along the critical path |
| Daily loop | eligibility → resource demand → modifiers → progress & cost → labour → consumables → risk & stakeholders → missions |
| Resource types | **7** |
| Risks | **12** quantified (P, cost, days, response, residual) |
| Procurement | **5** contracts |
| Stakeholders | **7** |
| Missions | **6** |
| Monte Carlo | PERT-beta + Bernoulli risks, chunked across animation frames (not a Worker), P10/50/80/90, tornado |
| Advisor "Hemiunu" | rule engine → `{severity, title, why, recommendation, impact, action}`, quotes P50/P80, one-click actions |
| Persistence | `auto` + 3 slots in localStorage, JSON export/import, RNG state saved |

## Mobile
Virtual stick, drag-look, pinch-zoom, per-mode action buttons, utility row (mode ◀ ▶, speed), breakpoints for phone,
tablet and landscape.

## World link
`project.worldState()` → built height, casing coverage, workforce, stone stockpile → pyramid courses, ramp,
scaffolding, worker count, stockpile mesh.

## QA harness
`tools/smoke-test.mjs`: SwiftShader Chromium, console-error assertion, every mode & panel, FPS & heap samples,
collision walks, headless full project run, screenshots.
