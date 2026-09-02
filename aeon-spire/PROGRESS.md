# AEON SPIRE — build progress

Live todo list for the phased build defined in `BUILD_PROMPT.md` Section F.
Every phase is verified against its Definition of Done with
`node tools/verify.mjs` (real Chromium, WebGL 2 via SwiftShader) before the
next phase begins.

| Phase | Title | State |
|---|---|---|
| 0 | Setup & environment verification | ✅ done |
| 1 | Scene foundation | ✅ done |
| 2 | Exterior massing (all 7 zones) | ⏳ in progress |
| 3 | Structural & facade detail pass | ☐ |
| 4 | Interior detail pass (Section D) | ☐ |
| 5 | Lighting & time-of-day system | ☐ |
| 6 | Weather system | ☐ |
| 7 | Audio system | ☐ |
| 8 | Camera & interaction system | ☐ |
| 9 | Construction timeline simulation | ☐ |
| 10 | PM-style HUD & UI polish | ☐ |
| 11 | Optimization, QA & packaging | ☐ |
| G | Master Completion Gate | ☐ |

## Phase 0 — Definition of Done

- [x] Project folder + file structure from E.2 created (`src/scene`, `src/zones`,
      `src/construction`, `src/audio`, `src/ui`, `assets/`).
- [x] Three.js resolves and loads with no console errors; a scene renders.
      Verified release: **three r185 (0.185.1)**, confirmed at build time by
      downloading the published package and importing it under Node
      (441 exports, `REVISION === '185'`). `index.html` resolves the CDN copy
      (`cdn.jsdelivr.net/npm/three@0.185.1`) first and falls back to the
      vendored copy in `assets/vendor/` when the network is unavailable.

## Phase 1 — Definition of Done

- [x] Renderer, base perspective camera, ground plane and sky dome in place.
- [x] Renders at a stable frame rate (no hitching; adaptive quality tiers
      implemented in `src/core/Engine.js` per E.9).
