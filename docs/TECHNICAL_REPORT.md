# Technical Report

*Architecture, rendering, procedural generation and performance engineering.*

---

## 1. Constraints that shaped the design

Three requirements drove every technical decision:

1. **It must run from a single HTML file with no network access.** A conference venue's wifi cannot
   be trusted, and a `<script src>` to a CDN is a single point of failure in front of an audience.
2. **It must run on unknown hardware.** The presentation machine might be an RTX workstation or a
   six-year-old laptop with integrated graphics.
3. **The archaeology and the project mathematics must both be correct.** Neither may be faked for
   visual convenience.

The consequences: everything is procedural (no downloadable assets), three.js is vendored and
inlined, and the renderer re-tiers itself continuously against measured frame time.

---

## 2. Architecture

```
main.js ─────────────── application shell, mode switching, key bindings, test API
  │
  ├─ engine/ ────────── renderer, post-processing, controls, input, quality, noise, textures
  │    renderer.js      WebGL context, camera, resize, context loss, frame budget
  │    postfx.js        hand-written HDR post chain
  │    quality.js       four tiers + adaptive re-tiering
  │    controls.js      first-person, orbit, drone, cinematic keyframe player
  │    input.js         keyboard, pointer lock, touch stick
  │    textures.js      procedural material library
  │    noise.js         deterministic value / fBm / ridged / Worley / dune noise
  │
  ├─ world/ ─────────── everything in 3D
  │    layout.js        survey data: positions and dimensions, in metres
  │    terrain.js       the analytic height field and its meshes
  │    sky.js           Preetham atmosphere, real solar geometry, the lighting rig
  │    pyramids.js      instanced block construction, casing, ramp, scaffolding
  │    monuments.js     Sphinx, temples, causeways, boat pits, enclosure
  │    site.js          quarry, workers' town, harbour, barges, stockpiles
  │    interior.js      the Great Pyramid's passages and chambers (separate scene)
  │    workers.js       GPU-animated instanced workforce
  │    props.js         rocks, vegetation, footprints, particles, torches
  │    collision.js     AABB collision world with a uniform-grid broad phase
  │    geobuild.js      geometry helpers: merge, hollow rooms, corbels, winding
  │    world.js         assembly and the project → visuals link
  │
  ├─ pm/ ────────────── the project simulation (zero three.js dependency)
  │    model.js         WBS, resources, risk register, procurement, stakeholders, missions
  │    cpm.js           CPM / PERT engine
  │    project.js       execution, EVM, quality, welfare, risk rolls
  │    montecarlo.js    PERT-beta sampling and network re-simulation
  │    advisor.js       the diagnostic rule engine
  │
  └─ ui/ ────────────── dashboard, charts, HUD, guided tour
       dom.js           element and SVG builders
       charts.js        every chart, in hand-written SVG
       panels.js        eleven dashboard panels
       hud.js           top bar, ticker, advisor, codex, missions, compass
       tour.js          the fifteen-beat presentation script
```

The `pm/` package has **no dependency on three.js or on the DOM**. It runs in Node, which is how the
project model was calibrated: `node tools/...` style scripts ran full twenty-year projects in 0.2
seconds each and let the resource model be tuned against five random seeds before any of it was
wired to a renderer.

---

## 3. The build

`tools/build.mjs` is a purpose-built bundler, about 150 lines. The source is written as strict ES
modules; the bundler topologically sorts the module graph, strips import statements and the
`export` keyword, concatenates, and wraps the result in an IIFE emitted as a **classic** `<script>`
(not `type="module"`) so the file works from `file://` in every browser.

three.js is inlined by transforming its single trailing `export { … }` statement into
`const THREE = { … }` — the export list is already valid object-literal shorthand.

Two safety properties are worth noting:

- **Symbol-collision detection.** Because flattening puts every module in one scope, the bundler
  refuses to build if two modules declare the same top-level name. Template literals and comments
  are stripped before scanning, so GLSL like `const float x` inside a shader string is never
  mistaken for a JavaScript declaration.
- **Function replacers everywhere.** `String.prototype.replace` with a string replacement
  interprets `$'` and `$&` as patterns. three.js contains a literal `+ '$'`, which silently
  corrupted the first build. Every substitution in the bundler now uses a function replacer.

Output: `dist/GizaDigitalTwin.html`, about 1.7 MB, of which 1.27 MB is three.js.

---

## 4. Rendering pipeline

### 4.1 Frame structure

```
scene → HDR render target (RGBA16F, MSAA 0–4 by tier)
      → bright pass    (soft-knee threshold, half resolution)
      → gaussian bloom (two separable passes at quarter resolution, run twice)
      → god rays       (24-tap radial blur from the sun's screen position)
      → composite      ACES tonemap → bloom + rays → heat haze → lift/gain/saturation
                       → filmic contrast → chromatic aberration → vignette
                       → film grain → manual sRGB encode
```

The chain is written directly against `WebGLRenderTarget` rather than using three's `EffectComposer`
add-ons, because the deliverable is a single file and every add-on would be another vendored module.

Two details that are easy to get wrong and are handled explicitly:

- **Tone mapping happens once.** `renderer.toneMapping` is `NoToneMapping`; ACES is applied in the
  composite pass. Otherwise the sky would be tone-mapped twice.
- **sRGB encoding is manual.** A custom `ShaderMaterial` does not receive three's
  `<colorspace_fragment>` chunk, so the composite pass encodes to sRGB itself.

God rays use the bright-pass buffer, so objects occluding the sun mask the rays for free — no
occlusion pre-pass is needed.

### 4.2 Atmosphere

The sky is a Preetham analytic scattering model evaluated per fragment on a far-plane dome
(`gl_Position.z = gl_Position.w`). Turbidity, the Rayleigh coefficient, the Mie coefficient and the
Mie directional term are all driven by the sun's elevation, so dawn, harsh noon, golden hour and
dusk each have their own atmospheric character rather than being a colour ramp.

The sun's position is **real solar geometry** for the latitude of Giza (29.9792° N):

```
declination δ = 23.44° · sin(2π(dayOfYear − 81)/365)
hour angle  H = 15°(t − 12)
sin(altitude) = sin(φ)sin(δ) + cos(φ)cos(δ)cos(H)
cos(azimuth)  = (sin δ − sin(alt)sin φ) / (cos(alt)cos φ)
```

So the shadow the Great Pyramid casts at 17:30 on the summer solstice falls where it actually
falls. The moon is modelled as the anti-sun with a small inclination offset — enough for a
believable night sky without an ephemeris.

Night adds a 2 200-point star field with per-star colour temperature and magnitude, a lunar halo in
the sky shader, and a directional moon light.

### 4.3 Materials

Every surface is synthesised at load time. Each builder runs **one noise evaluation per texel** and
derives the normal and roughness maps from the cached height field via a Sobel filter, which keeps
the whole library under about a second even on a low-power laptop.

| Material | Technique |
|---|---|
| Nummulitic limestone | fBm + Worley pitting + shell fragments + crack lines |
| Tura casing limestone | fine fBm, low relief, low roughness |
| Aswan granite | feldspar / quartz / biotite at separate frequencies |
| Dressed ashlar (interior) | any base stone + a running-bond joint grid, two courses per tile |
| Sahara sand | directional ripples + grain + drift |
| Plateau bedrock | ridged multifractal flutes + bedding planes, deliberately cooler than the sand |
| Mud brick | running bond with straw inclusions and mortar relief |
| Cedar / acacia | growth rings + fibre + knots |
| Lime plaster | wash, trowel marks, crackle |
| Water | dual-scale ripple normal map, scrolled in the shader |
| Hieroglyphs | procedural sunk-relief register in columns |

Textures are 128–1024 px square by tier.

### 4.4 Terrain

One analytic height field is the single definition of the ground. Collision, object placement,
worker pathing and the mesh all call the same function, so nothing can float or sink.

```
regional slope  → plateau tilt, escarpment to the floodplain, south-western desert rise
fBm undulation  → two octave bands
dune field      → asymmetric directional dune noise, masked to the west and far south
ridged bedrock  → wind-scoured flutes on the exposed plateau
wadi            → a drainage channel to the south-east
construction pads → levelled platforms under every structure
quarried cuts   → quarry benches, Sphinx enclosure, harbour basin, canal, river bed, boat pits
```

Two meshes draw it. The inner tile covers 4.2 km with a **warped grid**: the parameter is
remapped by `0.42u + 0.58u^2.6`, concentrating vertices near the centre so a 13 m quarry cut is not
smeared away, and relaxing to ~40 m cells at the edge — same vertex count, detail where it matters.

The horizon is a square annulus reaching 26 km, and its ring-zero vertices land on **exactly** the
same coordinates as the inner tile's boundary vertices. The seam is watertight without a skirt or
an overlap hack. (Getting this wrong the first time — using a different subdivision count for the
ring — produced fractional array indices, silently dropped vertices and a NaN bounding sphere,
which is documented in the audit report as a worked example of why the QA harness exists.)

The terrain material is a `MeshStandardMaterial` with `onBeforeCompile` injecting a sand/rock blend
driven by a per-vertex `aRock` attribute, plus two incommensurate sample scales per material to
kill the visible repeat of a 20 m tile seen across two kilometres of open desert.

### 4.5 The pyramids

The Great Pyramid contains roughly 2.3 million blocks. Drawing 2.3 million boxes is neither possible
nor useful, because only the outer skin is ever visible. The model therefore renders the **visible
course rings** as `InstancedMesh` blocks over a solid core:

- Course heights follow the real profile, thick at the base (~1.45 m) thinning upward (~0.58 m),
  normalised to the design height.
- Each course is a frame of four block rows with per-instance jitter in position, yaw and scale.
- Instances are emitted bottom-up, so construction progress is a single `mesh.count` truncation.
- Per-instance colour carries weathering; a per-instance UV offset stops forty thousand blocks
  showing the same texel pattern.
- The exposed core is a truncated pyramid rebuilt when the built height moves materially — it is
  also the working platform the masons stand on.
- Casing is the ideal pyramid face offset outward by 1.35 m so it swallows the steps, with a
  world-space Y clip injected into the material so it can be dressed from the apex downward.

The quality tier chooses how many real courses one instanced block spans (1 at ultra, 5 at low),
which moves the instance count between about 4 000 and 40 000 for Khufu. **The UI always reports
both the rendered instance count and the true conceptual block count**, so nothing about the
abstraction is hidden from the audience.

The construction ramp is a solid rubble embankment on the south face for the lower third, then a
wrapping spiral band hugging the four faces, rebuilt whenever the built height moves by more than
two metres. Timber lifting frames and platform decking are generated at the current working course.

### 4.6 The interior

The pyramid's interior is a **separate scene** with its own collision world, fog, torch budget and
colour grade. Only one scene is ever rendered, which keeps both draw-call counts low.

Everything lies in a single vertical plane 7.29 m east of the pyramid's north–south axis — the same
plane as the original entrance, exactly as Petrie found it. Passage sections are 1.05 × 1.20 m and
run at 26° 31′ 23″.

Sloped passages are built as tilted slabs for rendering and as a staircase of axis-aligned boxes for
collision, with 0.9 m treads giving a 0.45 m rise — inside the 0.55 m step height, so the player
simply walks up. The Grand Gallery's corbels are seven stepped courses; its side ramps are built as
twenty-seven blocks so the famous twenty-six slots between them are real gaps rather than applied
decoration. Five relieving chambers of granite beams sit above the King's Chamber, reachable by the
crawl from the top of the gallery, as they were in 1765.

### 4.7 The workforce

Every figure is one instance of a single 130-triangle mesh. The limbs are animated **entirely in
the vertex shader** from a per-instance `aGait` attribute (stride rate, amplitude, phase, lean), so
a thousand workers cost the CPU nothing but their root matrices.

The rotation is injected into both `<beginnormal_vertex>` and `<begin_vertex>`, in that order —
three transforms the normal before it reaches `begin_vertex`, so rotating the position alone would
leave the lighting wrong.

Gangs haul sledges along real routes (quarry to ramp, harbour to granite yard, town to site),
quarrymen work the benches, masons ring the current working course at its live height, and the
number of figures on site tracks the project's assigned workforce.

---

## 5. Performance engineering

### 5.1 Adaptive quality

Four tiers. The starting tier is chosen from the unmasked GPU string, core count and device memory;
after that the engine keeps a ninety-frame rolling average and re-tiers when it drops below 34 fps
or rises above 88 fps, with a cooldown to prevent oscillation.

| | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Pixel ratio cap | 1.0 | 1.25 | 1.5 | 2.0 |
| Shadows | off | 1024 | 2048 | 4096 |
| MSAA | 0 | 2 | 4 | 4 |
| Bloom / god rays | off / off | on / off | on / on | on / on |
| Courses per block | 5 | 3 | 2 | 1 |
| Terrain subdivisions | 128 | 208 | 288 | 384 |
| View distance | 3.6 km | 5.2 km | 7 km | 9 km |
| Workers | 44 | 90 | 150 | 230 |
| Torch lights | 2 | 3 | 4 | 6 |

`?quality=` pins a tier for a presentation.

### 5.2 Techniques used

- **Instancing** for blocks, rocks, vegetation, workers, sledges, footprints, torch flames.
- **Geometry merging** for every static structure, so a temple is one draw call.
- **Two scenes**, never rendered together.
- **Frustum culling** on all instanced meshes with real bounding volumes.
- **A limited light budget**: torches are point lights assigned each frame to the N nearest lit
  torches by partial selection — no full sort.
- **Shader-side particle advection**: wind-blown sand and interior dust wrap inside a box that
  follows the camera, with zero per-frame CPU cost.
- **Throttled rebuilds**: the ramp rebuilds only when the built height moves >2 m, the scaffolding
  >4 m, the core frustum >0.15%.
- **Uniform-grid broad phase** for collision, so the ~950 registered colliders cost a handful of
  candidate tests per query.

### 5.3 Measured

On the CI machine, in headless Chromium using the **SwiftShader software rasteriser** (no GPU at
all), the simulator holds 12–26 fps across all seven QA scenarios at 1600 × 900. That is the floor.
On real hardware with a GPU, the medium tier renders 50–60 draw calls and 120 000–260 000 triangles
per frame, comfortably inside a 60 fps budget.

---

## 6. Quality assurance

`npm test` runs `tools/smoke-test.mjs`, a headless Chromium harness that:

1. loads the built single file from `file://`, proving the offline path works;
2. waits for a ready signal and prints the boot report;
3. exercises seven visual scenarios across all four modes, all four times of day, and the interior,
   sampling frame rate and draw calls at each;
4. opens **every** dashboard panel;
5. drops the walker at eight points across the site and asserts it settles on the ground, then
   walks it up the Grand Gallery;
6. runs the **entire twenty-year project** headlessly and reports SPI, SPI(t), CPI, EAC, VAC,
   quality, welfare, realised risks and missions completed;
7. reports geometry, texture and shader-program counts as a leak check;
8. fails the build on **any** console error.

The world-facing test API on `window.__giza` also exposes `findBadGeometries()`, which walks both
scenes looking for empty geometry, NaN vertices or NaN bounding spheres. It found the horizon-ring
indexing bug described in §4.4.

Current status: **7 scenarios, 11 panels, 0 console errors, 0 console warnings.**

---

## 7. Browser support

| Browser | Status |
|---|---|
| Chrome / Edge 90+ | Full |
| Firefox 88+ | Full |
| Safari 15+ | Full (WebGL 2) |
| Mobile Chrome / Safari | Runs at the low tier with the touch control layer |

Requirements: WebGL 2, ES2020. The renderer handles context loss and restoration, and re-creates
its render targets on restore.

---

## 8. What would come next

Honest technical debt, in priority order:

1. **Screen-space ambient occlusion.** The blocks would gain enormous depth from contact shadows;
   the pipeline has the depth buffer available but no SSAO pass yet.
2. **Cascaded shadow maps.** A single shadow cascade at 460 m limits shadow resolution on the
   pyramid faces at long range.
3. **A Web Worker for Monte Carlo.** Four thousand iterations take about 250 ms on the main thread;
   acceptable, but it does drop frames.
4. **Baked ambient occlusion for the interior.** The chambers currently rely on fill lights where
   AO would be more truthful.
5. **Compressed textures.** KTX2/Basis would cut GPU memory, at the cost of vendoring a transcoder.
