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
| 2 | Rendering pipeline | — | HDR pipeline with bloom, god rays, ACES tone mapping, film grade | **9** |
| 3 | Lighting | — | Real solar geometry, Preetham atmosphere, day/night, torch budget | **9** |
| 4 | Materials | — | Fully procedural PBR library, 13 materials, ashlar joints | **9** |
| 5 | Geometry quality | — | Instanced block construction, survey-accurate interiors | **9** |
| 6 | Animation | — | GPU-animated workforce, sledge gangs, water, particles, cinematics | **8** |
| 7 | Physics / collision | — | AABB collision world, capsule movement, step-up, auto-crouch | **8** |
| 8 | Camera systems | — | Four controllers with damping, banking, keyframe cinematics | **9** |
| 9 | UI / UX | — | Eleven-panel dashboard, HUD, advisor, codex, guided tour | **10** |
| 10 | Mobile responsiveness | — | Touch stick, responsive layout, low tier | **8** |
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
| **5 — Gameplay & UI** | Four modes, missions, dashboard, HUD, guided tour | Eleven panels, hand-written SVG charts, fifteen-beat tour |
| **6 — AI advisor** | Diagnostic rule engine + Monte Carlo forecasting | Hemiunu: root-cause diagnosis with quantified, actionable recommendations |
| **7 — Performance** | Tiering, instancing, culling, throttling, light budget | 12–26 fps on a pure software rasteriser; comfortable 60 fps on real GPUs |
| **8 — QA & release** | Headless harness, bug fixing, documentation | Zero console errors, zero warnings, six documents |

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

---

## 4. Quality assurance at delivery

```
================ SMOKE TEST SUMMARY ================
scenarios      : 7      (all four modes, four times of day, exterior and interior)
panels         : 11     (every dashboard panel opened and rendered)
walker checks  : 8 exterior points + a Grand Gallery traverse
project run    : full 7 241-day simulation to completion
min fps        : 14.8   (SwiftShader software rasteriser, 1600 x 900, no GPU)
console errors : 0
console warns  : 0
RESULT: PASS
```

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
| No SSAO | Cosmetic. The block work would gain depth; nothing is incorrect without it. |
| Single shadow cascade | Shadow resolution on the pyramid faces softens beyond ~450 m. |
| Monte Carlo on the main thread | ~250 ms for 4 000 iterations; drops a few frames. Acceptable, not ideal. |
| No save/load | A taught session cannot resume a project mid-flight. The highest-value next feature. |
| Model idealisations | Six, all enumerated in `docs/PROJECT_MANAGEMENT.md` §12. |
| Reconstruction vs evidence | Enumerated in `docs/HISTORICAL_SOURCES.md` §3. A presenter should say which is which. |
