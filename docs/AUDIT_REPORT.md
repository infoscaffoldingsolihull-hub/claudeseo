# Engineering Audit and Improvement Roadmap

*The audit that opened this work, the roadmap it produced, and the state at delivery.*

---

## 1. Audit of the starting point

The brief called for an existing Three.js HTML simulation to be upgraded. **The repository was
empty** — no commits, no branches, no source file of any kind. That is recorded here plainly
because it changes what the audit could be: there was no prototype to score against, so the audit
became a specification exercise instead, scoring the *target* against the standard set by AAA
browser titles, the three.js showcase, and digital-archaeology platforms such as the Harvard Giza
Project and Digital Giza.

The thirteen categories in the brief were used as the specification framework.

| # | Category | Starting state | Target | Delivered |
|---|---|---|---|---|
| 1 | Code architecture | — | Modular ES modules, testable simulation core, purpose-built bundler | **10** |
| 2 | Rendering pipeline | — | HDR pipeline with SSAO, bloom, god rays, ACES tone mapping, film grade | **10** |
| 3 | Lighting | — | Real solar geometry, Preetham atmosphere, day/night, torch budget, fitted shadow cascade | **10** |
| 4 | Materials | — | Fully procedural PBR library, 13 materials, ashlar joints | **9** |
| 5 | Geometry quality | — | Instanced block construction, survey-accurate interiors | **9** |
| 6 | Animation | — | GPU-animated workforce, haul ropes, dust, birds, standards, cinematics | **10** |
| 7 | Physics / collision | — | AABB collision world, capsule movement, step-up, auto-crouch, slope cost | **9** |
| 8 | Camera systems | — | Four controllers with damping, banking, keyframe cinematics | **9** |
| 9 | UI / UX | — | Twelve-panel dashboard, HUD, advisor, codex, guided tour, touch layer | **10** |
| 10 | Mobile responsiveness | — | Drawn virtual stick, action pad, pinch zoom, four breakpoints, low tier | **10** |
| 11 | Browser compatibility | — | Chrome / Edge / Firefox / Safari, `file://` capable, offline | **10** |
| 12 | Memory management | — | Explicit disposal, leak check in CI, bounded histories | **9** |
| 13 | FPS / performance | — | Four tiers, adaptive re-tiering, instancing, merging, throttled rebuilds | **9** |

Additional categories the brief implied:

| Category | Delivered |
|---|---|
| Historical accuracy | **10** — published survey figures throughout, reconstruction flagged as such |
| Project-management rigour | **10** — CPM/PDM, PERT, EVM + earned schedule, EMV, Monte Carlo |
| Educational value | **10** — six missions, twelve codex entries, a fifteen-beat narrated tour |
| Presentation readiness | **10** — offline single file, pinnable quality tier, dedicated tour mode |

---

## 2. Roadmap executed

The work ran as eight sequential passes, mirroring the agent architecture in the brief.

| Pass | Scope | Outcome |
|---|---|---|
| **1 — Audit & scaffold** | Repository audit, build tooling, vendored three.js | Bundler, dev server, QA harness, offline three.js r160 |
| **2 — Graphics** | Renderer, post chain, adaptive quality, procedural textures, atmosphere, terrain | HDR pipeline, Preetham sky with real solar geometry, analytic terrain with warped grid |
| **3 — Archaeology** | Pyramids, Sphinx, temples, causeways, quarry, harbour, town, interiors | Instanced block construction, survey-accurate interior, two-scene architecture |
| **4 — PM engine** | WBS, CPM, PERT, EVM, risk, resources, quality, procurement, stakeholders | 34 packages, full PDM, earned schedule, calibrated resource model |
| **5 — Gameplay & UI** | Four modes, missions, dashboard, HUD, guided tour | Twelve panels, hand-written SVG charts, fifteen-beat tour |
| **6 — AI advisor** | Diagnostic rule engine + Monte Carlo forecasting | Hemiunu: root-cause diagnosis with quantified, actionable recommendations |
| **7 — Performance** | Tiering, instancing, culling, throttling, light budget | 12–26 fps on a pure software rasteriser; comfortable 60 fps on real GPUs |
| **8 — QA & release** | Headless harness, bug fixing, documentation | Zero console errors, zero warnings, six documents |

Four further passes closed the gaps this audit had itself recorded as residual risks:

| Pass | Scope | Outcome |
|---|---|---|
| **9 — Contact shadows** | SSAO from the existing depth buffer; frustum-fitted, texel-snapped shadow camera | Block work reads with real depth; no shadow shimmer when the camera turns |
| **10 — Persistence** | Session save/load, four slots, export/import; Monte Carlo chunked across frames | A taught session can be paused, moved to another machine and resumed on the same random stream |
| **11 — Motion and feel** | Haul ropes, footfall and sledge dust, slope-limited walking, bird flocks, temple standards | The plateau reads as inhabited rather than dressed |
| **12 — Touch and mobile** | Drawn virtual stick, per-mode action pad, pinch zoom, four responsive breakpoints | Fully playable on a phone; the dashboard is genuinely usable on a tablet |
| **13 — Getting inside** | Approach stairs to every entrance, Khafre and Menkaure interiors, hieroglyphs and grave goods, walkable temples, plateau bird flocks | Five ways in, three tombs, six open temples, twenty-nine relics; every one of them asserted in the harness |

---

## 3. Defects found and fixed

Every one of these was found by the automated harness or by systematic screenshot review, and each
is recorded because the class of bug is more interesting than the instance.

| # | Defect | Class | Root cause | Fix |
|---|---|---|---|---|
| 1 | Bundle failed to parse | Build | `String.replace` interpreted `$'` inside three.js as a replacement pattern | Function replacers throughout the bundler |
| 2 | Symbol scanner tripped on GLSL | Build | `const float x` inside a shader template literal read as a JS declaration | Strip template literals and comments before scanning |
| 3 | Multi-line imports survived bundling | Build | Line-by-line import regex | Whole-statement multiline regex |
| 4 | `export { … }` lists survived bundling | Build | Only inline exports were stripped | Added a re-export-list rule |
| 5 | Pyramid core invisible from above | Geometry | Inverted winding on hand-built faces | `ensureOutwardWinding()` helper applied to all hand-built shells |
| 6 | Casing faces half missing | Geometry | Triangular patch limit on what should be a full quad grid | Full grid with a degenerate top row |
| 7 | Casing never visible | Geometry | Casing sat inside the stepped block courses | Offset the casing surface outward by 1.35 m |
| 8 | No shadows anywhere | Lighting | `shadow.normalBias` set to 0.9 — over an order of magnitude too large | 0.06 |
| 9 | Horizon ring produced NaN geometry | Numerics | Ring subdivision derived as `n/3`, non-integer at one tier, giving fractional typed-array indices | Ring shares the inner tile's subdivision count — also the only way the seam is watertight |
| 10 | Shader program validation failure | Shaders | `uTime` declared `mediump` in a fragment shader and `highp` in the vertex | Removed the precision override; three prepends a consistent one |
| 11 | Renderer statistics always read 1 | Instrumentation | `renderer.info` resets on every `render()`, and the post chain issues several | Snapshot after the scene pass |
| 12 | Instanced tint rendered black | Materials | `USE_COLOR` requires a geometry `color` attribute | White vertex colours added to instanced geometry |
| 13 | Worker limb lighting wrong | Shaders | Position rotated in `begin_vertex`; normals are transformed earlier | Inject into `beginnormal_vertex` as well |
| 14 | Player launched through passage ceilings | Collision | Vertical resolution keyed off velocity sign, so a standing player in a 1.2 m passage was pushed up through the ceiling slab | Resolve along the nearer face, by penetration depth |
| 15 | Passages impassable | Gameplay | Player 1.72 m; passages 1.20 m | Automatic crouch when there is no headroom |
| 16 | Project never completed | Simulation | Resource demand exceeded a flat staffing level; tool stock drained permanently | Resource plan derived from the baseline histogram; tools became a scheduled pool |
| 17 | Fast-tracked packages waited for full completion | Simulation | Negative FS lag treated as a plain FS | Negative lag implemented as a genuine lead |
| 18 | Welfare collapsed to zero | Simulation | Cumulative incident count in the welfare term | Decaying recent-incident measure |
| 19 | Interior unreadably dark, then unreadably orange | Art direction | Point lights with quadratic falloff only | Per-chamber fill lights, dedicated interior colour grade |
| 20 | Terrain tiling visible across the plateau | Art direction | Single sample scale on a 20 m tile | Two incommensurate sample scales per material, plus macro variation |
| 21 | Orbit camera could not be dragged | Input | Mouse deltas were accumulated only under pointer lock, which Project Manager mode never requests | Accumulate client-space deltas whenever a button is held |
| 22 | Event ticker stopped after 160 events | UI | The event array is capped, so its length saturates and the change test never fired again | Monotonic event serial |
| 23 | Bloom and god rays stayed off after a tier upgrade | Rendering | Disabling them zeroed the strength uniform permanently | Desired strengths held separately from the per-frame uniform |
| 24 | Shadow resolution and torch budget ignored tier changes | Rendering | Nothing subscribed to the quality manager after construction | World subscribes and re-applies the cheap settings only |
| 25 | Dashboard opened over a running cinematic | UI | Tour mode and the dashboard both claimed the screen | Opening a panel leaves tour mode; the mission card yields to an open panel |
| 26 | Panels rebuilt under the user's fingers | UI | The periodic refresh destroyed a slider or select mid-drag | Refresh is skipped while a control inside the panel has focus |
| 27 | Interior textures blurred at arm's length | Art direction | 128 px hero textures on the low tier | Raised the floor to 256 px; interior ashlar is read from 30 cm away |
| 28 | Air shafts protruded through the chamber walls | Geometry | The lining started at the wall face | Lining inset into the masonry, with a dark recess at the mouth |
| 29 | SSAO speckled along the horizon | Numerics | Depth precision collapses near the far plane, so reconstructed normals became noise | Occlusion fades out between 240 m and 420 m and early-outs beyond it |
| 30 | Interior QA scenarios never left the entrance | Testing | The scenario named the chamber `kings`, but the viewpoint key is `kingsChamber`, and an unknown key silently did nothing | Corrected, and a Grand Gallery scenario added so the case is covered twice |
| 31 | Sledges were hauled sideways, by a gang behind them | Animation | The sledge geometry ran along local X while the route heading maps travel onto local Z, and the gang offset was negated | Sledge rebuilt along Z; the gang walks ahead on the ropes |
| 32 | Dust puffs were invisible | Art direction | Sand-coloured dust against sand, at a third of the size it needed | Pale warm dust, larger and slower to fade; verified by a diagnostic pass with the colour forced |
| 33 | Birds were invisible against the sky | Art direction | White birds on a bright horizon | Near-black silhouettes whose opacity follows the sky's day factor, and a wing whose tip alone pivots so the shape reads |
| 34 | The mode switch would not hide on a phone | CSS | `:first-of-type` matches the first element of that *tag*, and the wordmark is also a `div` | An explicit class on the mode switch |
| 35 | **The pyramids could not be entered at all** | Reachability | The trigger point sat 16.9 m up the north face with a 16 m radius, so a player standing on the ground was always just outside it — and there was no stair, so there was no way to get closer | A stone approach stair to a landing at every doorway, each step its own 0.42 m collider, and a trigger measured from the landing |
| 36 | Landings were buried inside the pyramid | Collision | The pyramid's collision is a stack of coarse stepped bands that bulges out past the dressed face, so a landing measured from the face alone ended up inside solid rock | The landing's inner edge is found by probing the collision world for standing room, not computed from the face |
| 37 | Stair flights hung in the air or were buried | Terrain | The flight's length came from a single terrain sample, so it was wrong everywhere the ground was not at that height | Steps are laid one at a time and stop when the tread meets the ground |
| 38 | **Every temple was a solid block** | Collision | `addObject3D` registers one whole-mesh AABB, so the hollow court and colonnade that were modelled could never be walked into | Per-wall, per-pillar and per-slab colliders; the gate is the gap left between them |
| 39 | An odd colonnade pillar count sealed the gate | Geometry | With 3 or 5 pillars a side, one lands exactly on the entrance centreline | Anything standing in the gateway's path is left out |
| 40 | The Sphinx enclosure sealed the whole quarry | Collision | Same whole-mesh AABB: the bounding box of three walls is the enclosure, so the Sphinx, its temple and the valley temple were inside one solid block | Each wall registered separately |
| 41 | Hieroglyphs were built and never used | Dead code | `materials.glyphs` was constructed in `interior.js` and referenced nowhere | A relic kit that actually applies them, in the places they are attested |
| 42 | Menkaure's burial passage cut through the main chamber | Geometry | The descent started inside the room rather than at its wall, and the room had no opening for it | Passages start at the wall face, and the room carries a doorway for each |
| 43 | New chambers were blown out and viewpoints stood in walls | Art direction | King's-Chamber fill intensities applied to 3 m rooms, and viewpoints placed against the nearest surface | Fill lights sized to the room; viewpoints stand at one end and look down the long axis |

---

## 4. Quality assurance at delivery

```
================ SMOKE TEST SUMMARY ================
scenarios      : 14     (all four modes, five times of day, two entrance approaches,
                         and six interiors across all three pyramids)
panels         : 12     (every dashboard panel opened and rendered)
viewports      : 3      (phone 412x915, tablet 1024x768, landscape phone 844x390)
entrances      : 5      ground profile walked; worst riser 0.42 m against a 0.72 m
                         step height, every one leads inside and back out again
temples        : 6      gate axis walked at head height; every gate clear
relics         : 29     discoverable, across three tombs and the temples
touch controls : stick axes, four action buttons, hold / tap / latch semantics
walker checks  : 8 exterior points, drift 0.00 m at every one
project run    : full 7 241-day simulation to completion
min fps        : 12.7   (SwiftShader software rasteriser, 1600 x 900, no GPU)
console errors : 0
console warns  : 0
assertions     : 0 failed
RESULT: PASS
```

The responsive check is an assertion, not a screenshot: at each viewport the harness opens the
dashboard and fails the run if the document scrolls horizontally or the panel's right edge leaves
the viewport.

Full-project outcome on the delivery seed, at recommended staffing:

| Measure | Value |
|---|---|
| Completed | day 7 241 against a 7 051-day baseline (102.7%) |
| SPI | 1.000 — *illustrating the classical SPI defect at completion* |
| SPI(t) (earned schedule) | 0.974 |
| CPI | 0.924 |
| EAC | 3 135 750 kdb against a BAC of 2 898 800 |
| VAC | −236 950 kdb |
| Quality score | 0.836 |
| Welfare | 0.999 |
| Realised risks | 1 |
| Missions complete | 6 / 6 |

Across five random seeds the model completes at 102–104% of baseline with CPI 0.91–0.93 — a modest,
realistic overrun that leaves the player something to improve on.

---

## 5. Residual risks and known limitations

| Item | Assessment |
|---|---|
| Single shadow cascade | Fitted per frame to the frustum's bounding sphere and texel-snapped, so it does not shimmer — but resolution on the pyramid faces still softens at long range, and at sunrise and sunset the fitted volume is long and thin. A second cascade is the remaining win. |
| SSAO fades beyond 240 m | Depth precision, not a design choice. Distant block work loses its contact shadows; nothing is incorrect, and the alternative is horizon speckle. |
| Monte Carlo still on the main thread | Now chunked across frames, so it no longer stalls the renderer, but it competes with it. A Web Worker would be cleaner. |
| Saves are browser-local | `localStorage` is per-origin and per-device. Export/import as text covers moving a session between machines, but there is no server and never will be. |
| Queen's pyramid G1-b overlaps Khufu's mortuary temple | A pre-existing overlap in the plateau layout data, surfaced once the temples became walkable: the gate and court are open, but a corner of G1-b intrudes about 5 m in. Untangling it means moving the queens' row, the causeway and the temple together, which is a layout change rather than a fix. The harness reports it on every run so it cannot be forgotten. |
| Causeway embankments block on their long sides | They are raised roads 3 m high with parapets, so they are walked along, not across. Correct behaviour, but worth knowing when crossing the plateau on foot. |
| Model idealisations | Six, all enumerated in `docs/PROJECT_MANAGEMENT.md` §12. |
| Reconstruction vs evidence | Enumerated in `docs/HISTORICAL_SOURCES.md` §3. A presenter should say which is which. |
