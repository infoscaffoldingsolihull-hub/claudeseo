# Bagh-e-Shahi Manor — Technical Report

A single-file, offline, real-time digital twin of a royal mansion in DHA Phase VI,
Lahore, and of the 516-day project that builds it.

**Deliverable:** `dist/RoyalMansion.html`, ~1.8 MB, no network requests.
**Source:** `mansion/src/`, 33 ES modules, ~12,700 lines.
**Verification:** `tools/check-mansion.mjs` (static) and `tools/smoke-mansion.mjs`
(63 checks in a headless browser). Both must pass before the file ships.

---

## 1. The governing idea

Most architectural walkthroughs are a model with a schedule bolted on beside it.
The two agree because someone made them agree, and they stop agreeing the moment
either changes.

Here there is **one source of truth and everything is derived from it**:

```
  rates × quantities                     (122 BOQ lines, PKR)
        └─► work-package budgets         (61 packages)
              └─► control accounts       (9)
                    └─► the project budget
                              PKR 39.70 crore

  PERT estimates + precedence network
        └─► CPM forward/backward pass    (baseline: day 492)
              └─► seeded as-built run    (actual:   day 516)
                    └─► package progress on any day
                          └─► a cutting plane through the geometry
                                that package paid for
```

Two consequences follow, and they are the whole argument for the project:

1. **The budget cannot disagree with the bill of quantities**, because the budget is
   the sum of the bill of quantities. The reconciliation delta is 0.0000 PKR, and it
   is checked on every build.
2. **The building cannot disagree with the programme.** A wall is 40 per cent built
   because its package is 40 per cent earned. There is no animation timeline to keep
   in step; change the network and the model changes with it.

---

## 2. Architecture

```
mansion/src/
  pm/          the project, headless — runs and is verified in Node alone
    rates.js       112 PKR rates; a 122-line bill of quantities
    model.js       9 control accounts, 61 packages, 11 crews, 14 risks,
                   10 quality gates, 7 milestones, 12 phases, 6 contracts,
                   8 stakeholders; validateModel()
    cpm.js         compiled flat-array network; forward/backward pass with
                   FS/SS/FF/SF and leads/lags
    project.js     baseline, seeded as-built, EVM, earned schedule, resources,
                   diagnosis
    montecarlo.js  PERT-beta sampling of the whole network; tornado sensitivity

  engine/      the renderer, with no knowledge of mansions
    renderer.js    WebGL context, HDR target, shadow-camera fit
    postfx.js      bright pass → bloom → composite (exposure, ACES, grade,
                   aberration, vignette, grain, manual sRGB)
    textures.js    every surface, generated from periodic noise
    quality.js     five tiers and the adaptive re-tiering policy
    controls.js    walk / orbit / drone / cinematic
    input.js       keyboard, pointer lock, wheel, touch
    rng.js         seeded RNG, hashes, noise, PERT sampling

  world/       the building
    plan.js        every dimension in the project, and nothing else
    build.js       geometry emitters (boxes with world-space UVs, entasis,
                   domes, interval algebra)
    materials.js   the material library and the shader patch
    mansion.js     walls, slabs, columns, stairs, portico, roof, dome
    openings.js    88 doors, windows, garage doors and the lift
    furnish.js     ~120 priced objects, merged by (material × package)
    site.js        ground, plinth, boundary, drive, pool, planting
    construction.js the live site: crane, gangs, scaffold, plant, compound
    interact.js    ray-AABB picking, focus poses, the inspection card
    collision.js   AABB + uniform grid, step-up, ray queries
    sky.js         Preetham sky, real solar geometry, the light rig
    world.js       assembly, and applyDay()

  ui/          panels, charts, HUD, timeline, tours, session, touch
  main.js      wiring and the frame loop
```

### The build

`tools/build-mansion.mjs` flattens all 33 modules plus a vendored three.js r160
into one `<script>` in one HTML file. The flattening strips `import`/`export` and
concatenates in dependency order, which means **every top-level symbol in the
project must be globally unique**. That is not a convention anyone can be trusted
to keep, so `tools/check-mansion.mjs` enforces it: it parses every module, resolves
every import, checks every named export exists, and fails the build on a duplicate
top-level declaration or a stray `console.log`. It caught six real collisions
during development, each of which would have been a silent, catastrophic shadow.

---

## 3. The project model

### Bill of quantities

122 lines. Each is `{ id, name, unit, quantity, ratePKR, package }`. Cost flows one
way only: `lineCost = rate × quantity`, packages sum their lines, accounts sum their
packages, the project sums its accounts. Nothing anywhere writes a cost back.

Reserves sit outside the base: 6.5 per cent contingency (PKR 2.58 crore) against
identified risk, 3.5 per cent management reserve (PKR 1.39 crore) against unknown
unknowns. Contingency is drawn against by risk events; management reserve is not,
because that is what distinguishes them.

> **Honesty note.** The rates are an internally consistent illustrative model for
> high-end Lahore residential construction in 2025–26. They are *not* a verified
> quotation. They live in one file so a live tender can replace them.

### Network and CPM

61 activities with all four precedence relations and leads and lags. The network is
compiled once into flat typed arrays — predecessors in a CSR-style adjacency — and
the pass is a loop over integers, not a graph walk over objects, so a full
reschedule costs microseconds and the Monte Carlo can afford thousands of them.

The backward pass gives total float; zero float is the critical path. The four
relation types are handled explicitly:

```js
case REL_SS: cand = r.es[i] + lag;                 break;
case REL_FF: cand = r.ef[i] + lag - dur[j];        break;
case REL_SF: cand = r.es[i] + lag - dur[j];        break;
default:     cand = r.ef[i] + lag;                 break;  // FS
```

Durations are PERT three-point estimates: `(o + 4m + p) / 6`, with the variance
carried for the Monte Carlo.

### The as-built run

`createProject(seed)` builds the baseline, then generates a *seeded* as-built:

- a per-crew productivity drift, so some trades run ahead and some behind;
- a Bernoulli trial against each risk's residual probability, applying its schedule
  and cost impact when it fires;
- a quality-gate sample, adding the rework each failed gate causes.

Then it runs **the same CPM** over the perturbed durations. The as-built finish is
day 516 against a baseline of 492; the 24 days are attributable, activity by
activity, in the schedule panel.

### Earned value

Full EVM: PV, EV, AC, SV, CV, SPI, CPI; EAC by three methods (BAC/CPI, AC+ETC at
budgeted rate, AC + (BAC−EV)/(CPI×SPI)); ETC, VAC, TCPI against both BAC and EAC.
Plus **earned schedule** — ES, SV(t), SPI(t) — because SPI collapses to 1.0 at
completion no matter how late the project was, and a schedule index that always
reads perfect at the end is worse than none.

At handover: SPI 1.000, SPI(t) short of it, CPI 0.971, EAC PKR 40.91 crore against
a BAC of 39.70, VAC −1.20 crore.

### Monte Carlo

PERT-beta sampling of every activity, thousands of full network runs, reported as
P10/P50/P80/P90 with a tornado of the activities whose variance drives the spread.
It runs in the page in about a second because of the flat-array CPM.

---

## 4. Geometry

### Walls are derived, not drawn

No wall is placed by hand. Rooms are rectangles in `plan.js`; wall lines are the
union of room edges per axis line, split at every room corner. Each resulting piece
is built in **three physical layers** — brick core, sandstone cladding, internal
plaster or panelling — and each layer is paid for by a *different work package*.
That is why the model can show you a bare brick shell: the masonry package has been
earned and the façade package has not.

### Openings by omission, not subtraction

There is no CSG anywhere. A window is not cut out of a wall; the wall is built as
piers either side, a head panel above and a sill panel below. `wallPieces()` does
the interval arithmetic. The result is watertight, has exact axis-aligned collision
boxes, and never produces the degenerate triangles a boolean would.

Each opening is built in a **canonical frame** — wall along local X, outward normal
+Z, sill at y = 0 — and then placed and rotated. One piece of code builds all 88
movers; the frame is what makes a door in the north wall and a door in the east
wall the same problem.

### Draw calls

Furniture is merged by `(material × work package)`, so a room's contents are two or
three draw calls rather than forty, and the timeline can still install the reception
furniture on the day the FF&E package starts, because the package is part of the
merge key. Picking does not need the individual meshes: `interact.js` tests a ray
against each object's own AABB, so merging costs nothing in interactivity.

The finished house renders in **292 draw calls and 128k triangles**, shadow and post
passes included, against a budget of 340; the busiest
construction frame — plant, scaffold and gangs all up at once — costs 257.

---

## 5. Rendering

### The shader patch

Every material in the world is a `MeshStandardMaterial` with four behaviours
grafted on through `onBeforeCompile`. All four need to happen inside the fragment
shader and none is worth a second pass. Every patched material shares one
`customProgramCacheKey`, so three.js compiles the program once and reuses it.

1. **Reveal.** `if (dot(vRevealWorld, uRevealDir) > uRevealDist) discard;` — one dot
   product per fragment. A wall whose reveal direction is +Y grows out of the ground
   course by course; a slab whose direction is +X is poured bay by bay. This is what
   drives the whole Day 0 → handover timeline.
2. **X-ray tint.** Finishes hidden, what remains tinted by control account.
3. **Highlight.** An emissive wash on exactly the geometry a selected package
   bought.
4. **Interior fill.** See below.

The patch handles instanced meshes correctly — an instanced mesh's world transform
is `modelMatrix * instanceMatrix`, and leaving the instance matrix out puts every
instance's reveal plane at the prototype's origin.

### Interior light

A real-time renderer has no global illumination. A room whose only light is a
directional sun outside it renders **black**: the sun is occluded by the walls and
nothing bounces. Measured at the majlis wall, rendered luminance was 2/255 while the
exterior sat at 120.

The fix is not to raise the ambient — that washes out the exterior, which is
correctly exposed. Instead the bounce is modelled and applied *geometrically*:

- The building's interior is described as up to four world-space boxes — shell,
  garage, portico — taken straight from the plan, so they cannot drift from the
  rooms they describe.
- In the fragment shader, a fragment inside one of those boxes receives a fill
  term. The same wall therefore gets it on its inside face and not on the sunlit
  face outside.
- The term is multiplied by `RECIPROCAL_PI`, so its magnitude is in the same units
  as the intensity of an ambient or hemisphere light and the three can be reasoned
  about together.
- A shallow gradient on the world normal keeps a filled room from flattening into a
  single tone: more bounce arrives at an upward face off the floor than at a soffit.
- The colour is the sum of two modelled sources: **daylight** admitted through the
  openings, following a much shallower curve on the sun's elevation than the sun
  itself because a room's illuminance is dominated by the diffuse sky component;
  and **the electric installation**, switched by exactly the term that turns the
  light fittings' emissive on, so the fill and the fittings can never disagree
  about whether the lights are on.
- A roofed but open-sided space — the portico — takes about half the fill, because
  the sky is already lighting it through its open sides and counting that twice is
  what turns a loggia chalk white.

A second cause was found at the same time. The panelling material was dark walnut
with a tint over it, putting its reflectance under **three per cent** — darker than
any real timber, dark enough that no amount of fill would recover it. It is now a
raised-and-fielded oak recipe at about eighteen per cent, built as joinery: stiles
and rails proud, a chamfer down into each field, and a quirk that reads as the
shadow line between them. Upholstery was split from the cinema's acoustic fabric for
the same reason — the two want opposite things.

### Sky

A Preetham analytic scattering model on a dome forced to the far plane. Turbidity,
the Rayleigh coefficient and the Mie terms are all driven by the sun's elevation,
so each hour has its own atmospheric character rather than being a ramp between
hand-picked tints.

The sun's position is **real solar geometry** for the site:

```
declination δ = 23.44° · sin(2π(dayOfYear − 81) / 365)
hour angle  H = 15° · (solar time − 12)
sin(altitude) = sin(φ)·sin(δ) + cos(φ)·cos(δ)·cos(H)
```

with the azimuth resolved for the afternoon branch. This matters more than it
sounds: an architectural model whose light is invented cannot be used to argue
anything about orientation, glare or solar gain.

Irradiance does not fall off linearly with the sine of the altitude as far as the
eye is concerned — at ten degrees the sun still lights a façade, and the eye adapts
besides — so the rig applies a gamma to the elevation. That is what keeps golden
hour golden instead of merely dark.

### Post

Scene → half-float HDR target (MSAA by tier) → bright pass (soft-knee threshold) →
separable gaussian bloom → composite: exposure, ACES, colour grade, chromatic
aberration, vignette, grain, manual sRGB encode.

Two things here are easy to get wrong and are handled deliberately. Tone mapping
happens **exactly once** — `renderer.toneMapping` is `NoToneMapping` and ACES is
applied in the composite. And sRGB encoding is **manual**, because a custom
`ShaderMaterial` never receives three's `<colorspace_fragment>` chunk and the pass
has to encode its own output or everything renders washed out.

### Textures

Every surface is generated from noise at start-up: marble veining, sandstone
bedding, brick courses, oak grain and panelling, turf, plaster, water. There is not
a single downloaded image in the deliverable, which is what lets it live in one
file and open from `file://`.

All noise is **periodic** — the lattice wraps at the octave frequency — so every
texture tiles seamlessly no matter how many times it repeats across a floor. Normal
maps are Sobel over the wrapped height field, so they tile too.

Textures are built lazily and cached: a room the player never enters costs nothing.

---

## 6. The live construction site

`construction.js`. Everything in it is driven by the programme; nothing is on a
timer that runs regardless of the schedule.

- **Tower crane.** Erected during package P4 (*Boundary wall, crane base &
  scaffolding*). Its mast **climbs with the frame** — the mast geometry is built to
  full height once and the reveal plane cuts it, the same mechanism the building
  uses. It runs a real duty cycle over 27 seconds: slew and trolley out to the
  stockpile, lower, hook on, hoist, slew to the work face, trolley in, lower,
  release, hoist clear. The load only exists between hooking on and letting go.
  The work face is the level currently being built. The crane is struck when the
  façade package finishes.
- **The workforce.** Its size is `siteHeadcount` — the head count the resource model
  derives from each active package's budget, duration, crew rate and labour content.
  Each figure is posted to a zone belonging to a package actually in progress on
  the day you are looking at. Scrub to a curing lag and the site empties, because
  on that day nothing is being earned. Masons stand on the wall line and run a
  bricklayer's cycle — down to the stack, up to the course, about two and a half
  seconds a brick, with the brick in the hand only on the way up. Four instanced
  meshes draw the whole site: body, hi-vis, arm, load.
- **Scaffold.** Tube and fitting, standards at 2.0 m, four lifts, boarded and guard-
  railed, stopping short of the portico order and the garage flank. It erects with
  the masonry and is struck **from the ground up** as the façade completes, because
  you cannot clad a wall you have already taken the scaffold off. Erect and strike
  are the same reveal plane read in opposite directions.
- **The dig.** Modelled as the earth that is *still there*, not as a hole — cut the
  top off a box and you are looking at the inside of a box, which is to say at
  nothing, and the sky shows through the floor. So the excavation is a stack of thin
  lifts and the reveal takes them away from the top down. Every stage has a real
  ground surface, because the lift under the plane still has its own top face. The
  cut face of the surrounding ground is the same plane read the other way round, so
  the two always meet exactly at the formation of the day. The excavator works off
  that formation and goes down with it.
- **The compound.** Two cabins on bearers, a water tank on a stand, reinforcement
  bundles, banded brick pallets, sand and aggregate. Up from the day the site office
  goes in until the builders' clean.
- **Working ground.** A building site is not a lawn. From site clearance until the
  hardscape goes in, the plot is compacted earth, cut around the building from the
  same footprint list the ground itself uses.

The plant is deliberately **not solid**. A timeline scrub can move a crane or strike
a scaffold while you are standing where it used to be, and being sealed inside a
lattice mast you cannot see out of is a worse failure than walking through one.

---

## 7. Collision

An AABB world in a uniform grid. Movement is resolved axis by axis, so sliding along
a wall works and a corner does not catch. Steps under about 300 mm are climbed,
which is what makes the stairs walkable without special-casing them.

The subtle bug worth recording: the vertical resolver originally mutated `pos.y`
inside its own loop, so landing on a floor made the next candidate box overlap and
the walker climbed a storey per frame. Basement spawns ended up on the ground floor.
The fix is to land on the highest surface that was at or below the feet *before* the
move:

```js
if (dy < 0) {
  let landing = -Infinity;
  for (const i of list) {
    const top = boxes[i].maxY;
    if (top <= oldY + 0.02 && top > landing) landing = top;
  }
  if (landing > -Infinity) { pos.y = landing; grounded = true; }
  else { pos.y = oldY; }
}
```

A ray query (`raycastDistance`, slab method) is used by the interaction system so
you cannot inspect a sofa through a wall.

---

## 8. Verification

Nothing ships unverified. Two gates run before every build.

### `tools/check-mansion.mjs` — static

Syntax (`node --check`), import resolution, named-export existence, duplicate
top-level symbols, stray `console.log`. Currently: 33 modules, 257 top-level
symbols, clean.

### `tools/smoke-mansion.mjs` — behavioural

Boots the built single file in headless Chromium on software WebGL, from `file://`,
and exercises it the way a person would. **63 checks**, all passing:

- reaches ready with no console error and no unhandled rejection;
- every camera mode runs;
- every door, window and garage door opens and closes, from its key binding *and*
  from its on-screen control;
- close inspection works on every priced object and never shows an undefined field;
- the bill of quantities reconciles to the budget at every sampled day;
- the timeline reconstructs a coherent site across the full range;
- **the construction plant**: the crane is erected and struck with the programme;
  the scaffold goes up and comes down; the excavation runs and ends; gangs are
  posted across the programme; the site is empty at handover — checked by scene
  traversal, not by the module's own report; and the crane actually slews, trolleys
  and hoists;
- x-ray strips the finishes and restores them;
- both guided tours play from end to end with captions;
- save and resume restore the day, the light and the open doors;
- collision holds at all 22 spawn points;
- each time preset produces a distinct solar position and a distinct look;
- the draw-call and heap budgets hold for the finished house *and* for the
  busiest construction frame, and **scrubbing the whole timeline allocates
  nothing** (299 → 299 geometries, 708 → 708 collision boxes).

Several of these checks failed when first written, and the failures were real. Two
found by this harness in the final pass: an instanced mesh left visible with zero
instances after the site was cleared, and — in the check itself — a wrong assumption
about the crane's scene-graph depth. Both are recorded because a harness that has
never failed has never been tested.

---

## 9. Known limitations

Stated plainly, because a defence that hides them is worse than one that does not.

1. **The rates are illustrative, not a quotation.** Internally consistent, sourced
   from published Lahore construction cost ranges for 2025–26, but not tendered.
   One file to replace.
2. **The as-built programme is simulated, not observed.** It is a defensible model
   of how this project would run, generated from the baseline by seeded productivity
   drift, risk trials and gate sampling. It is not a record.
3. **Lighting is modelled, not photometric.** The interior fill is calibrated to be
   legible at the exterior's exposure, not measured in lux.
4. **No global illumination, no reflections beyond the environment term, no
   refraction through glass.** These are real-time compromises, chosen knowingly.
5. **Colour-vision checks are arithmetic.** The palette passes simulated protan and
   deutan separation. That is a floor, not user testing.
6. **The plant is not collidable**, for the reason given above.
7. **One seeded as-built run is shown.** The Monte Carlo panel is where the
   distribution lives; the single run in the model is one draw from it.
