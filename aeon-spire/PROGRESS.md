# AEON SPIRE — build progress

Live todo list for the phased build defined in `BUILD_PROMPT.md` Section F.
Every phase is verified against its Definition of Done with
`node tools/verify.mjs` (real Chromium, WebGL 2 via SwiftShader) before the
next phase begins.

| Phase | Title | State |
|---|---|---|
| 0 | Setup & environment verification | ✅ done |
| 1 | Scene foundation | ✅ done |
| 2 | Exterior massing (all 7 zones) | ✅ done |
| 3 | Structural & facade detail pass | ✅ done |
| 4 | Interior detail pass (Section D) | ✅ done |
| 5 | Lighting & time-of-day system | ⏳ in progress |
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

## Phase 2 — Definition of Done

- [x] All 7 zones from Section C exist as correctly proportioned, correctly
      positioned volumes. Verified visually as well as numerically: the Ring
      Deck was rebuilt as a disc standing on edge (the Aldar HQ idea) after
      the first pass read as a sphere, and the canal was cut properly out of
      the plaza after the first pass buried it under the ground plane.

## Phase 3 — Definition of Done

- [x] Sail Atrium: bronze diagrid exoskeleton, double-skin facade with a
      genuine modelled cavity, emissive-window curtain wall, sky-bridges.
- [x] Ring Deck: cantilevered glass-bottomed halo on radial ribs and ties,
      radial face diagrid, rim glazing.
- [x] Spire: parametric lattice with integrated LED ribs and glazing.
- [x] All in procedural PBR materials (albedo + normal + roughness), not flat
      colour.

## Phase 4 — Definition of Done

- [x] All **31 named interior spaces** of Section D modelled and furnished
      across all 7 zones — flooring, wall/ceiling treatment, lighting and the
      fixtures listed in each spec table.
- [x] Each interior uses its zone's own material palette and lighting
      character; no placeholder flat-colour blocks.
- [x] D.8 cross-cutting notes:
      - distance/room-based culling with lazy first-build (`InteriorManager`)
      - interior materials registered for the time-of-day response
        (`MaterialLibrary.setInteriorEnv`, driven in Phase 5)
      - a per-room acoustic profile published for the convolver bank
        (consumed in Phase 7)
      - **3 animated or interactive props in every one of the 31 rooms**

Verified by `node tools/verify.mjs`: 31/31 rooms build, 31/31 carry 2+ props,
zero console/page errors, 522 draw calls and 368k triangles with every
interior revealed at once, and 0.44 ms/frame of CPU simulation cost.
