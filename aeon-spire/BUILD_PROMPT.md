# AEON SPIRE — Autonomous Build Directive
### A 3D HTML Architectural Marvel + Interactive Construction Game
### Build spec for use with Claude Code (or any agentic coding assistant)

---

## HOW TO USE THIS DOCUMENT

1. Save this file into an empty project folder as `BUILD_PROMPT.md`.
2. Open that folder in Claude Code (or paste this whole document as your first
   message to any capable coding agent).
3. Send exactly this as your opening instruction:

   > Read `BUILD_PROMPT.md` in full. Create a todo list covering every phase
   > in Section F. Do not stop, summarize, or ask for confirmation between
   > phases — proceed autonomously, self-verifying each phase against its
   > Definition of Done before moving to the next, until the Master
   > Completion Gate in Section G is fully satisfied. If you hit a genuine
   > blocker after 3 attempts, stop and report it precisely. Begin now with
   > Phase 0.

4. If the session ends before completion, your next message is simply:
   `Continue from the todo list in BUILD_PROMPT.md. Do not repeat finished phases.`

That's the entire "loop" mechanism — a persistent file the agent re-reads,
a todo list it owns, and an explicit instruction to keep going without
checking in. This is exactly how long-horizon agentic coding sessions are
meant to be driven.

---

## SECTION A — MISSION DIRECTIVE & ANTI-HALLUCINATION RULES

You are acting as a senior 3D web developer, structural/civil engineer, and
game systems designer, building a single browser-playable deliverable for a
university Project Management course.

**Non-negotiable operating rules:**

- [ ] Use only real, verifiable technology: **Three.js** (latest stable
      release, pulled from a CDN such as `cdn.jsdelivr.net/npm/three` —
      confirm the exact version resolves at build time rather than assuming
      a version number), the native **Web Audio API**, and standard browser
      APIs (Pointer Lock, requestAnimationFrame, etc.). Do not invent
      libraries, methods, or APIs that don't exist.
- [ ] Never mark a phase complete without checking it against that phase's
      Definition of Done. If you cannot run the code in a live browser to
      verify, say so explicitly and describe how you validated it logically
      instead (code review against known Three.js patterns) — do not assert
      certainty you don't have.
- [ ] Maintain a visible todo list at all times. Update it after every phase.
- [ ] Do not stop, pause, or summarize progress for the user's approval
      between phases. Keep working until Section G's gate is satisfied.
- [ ] The only acceptable reason to stop early is a genuine blocking
      constraint (e.g., a required browser API unavailable) after at least
      3 attempted solutions — in which case, report the exact blocker and
      what you tried.
- [ ] All landmark references in this spec (Burj Al Arab, Burj Khalifa,
      Aldar HQ, etc.) are **inspiration for engineering/aesthetic concepts
      only**. Do not reproduce any real building's exact geometry, any
      trademarked logos, or any branded characters (no Ferrari horse logo,
      no Disney/Universal characters, no LEGO branding) — use generic,
      original equivalents as specified in Section C. This keeps the
      project both original and safe for academic submission.
- [ ] All textures and audio must be original/procedural, or sourced from
      CC0 / public-domain libraries (e.g., Poly Haven, ambientCG, Freesound
      CC0 filter). Note sources used in the README.

---

## SECTION B — THE LOOP PROTOCOL (role-cycling in place of a multi-agent swarm)

Since this is one continuous agent session rather than separate LangChain-style
agents, simulate that division of labor by explicitly cycling through these
personas as you move through Section F's phases. Each persona hands off to
the next only once its own checklist passes:

`Architect → Structural Builder → Interior Designer → Atmosphere Engineer
(lighting/weather) → Animator (construction rig) → Sound Designer →
Interaction Engineer → QA Tester → Optimizer → Documenter`

The **QA Tester** persona is the gate: nothing proceeds past it silently.
The **Documenter** persona only runs once, at the very end, producing the
README described in Section H.

---

## SECTION C — THE PROJECT: "AEON SPIRE, City of Wonders"

*(Alternate names if you'd rather rename it: "Meridian Wonder", "Elysia Tower")*

A fictional 700m mixed-use supertall + entertainment campus, composited from
seven zones, each an original design that borrows an **engineering idea**
from a real-world marvel — never its literal likeness.

| Zone | Levels | Inspired by (concept only) | Design & structural notes |
|---|---|---|---|
| **1. The Canal Concourse** (podium) | B2–L3 | Venice | Navigable canal ring around the podium, arched stone footbridges, small electric shuttle boats. Canal water doubles as part of the building's greywater/evaporative-cooling loop. Reinforced-concrete raft on bored piles (high water table). |
| **2. The Sail Atrium** | L4–L30 | Burj Al Arab | Asymmetric sail-shaped double-skin glass facade over a full-height atrium; steel diagrid exoskeleton; suspended sky-bridges; cascading water feature at ground level. |
| **3. The Ring Deck** | L31–L55 | Aldar HQ (disc form) + a cantilevered sky-ring | Tower transitions into a circular disc volume; a cantilevered halo walkway (glass-bottomed) wraps the tower at this level. Perimeter truss ring on raker columns with seismic dampers at the ring/tower joint. |
| **4. The Spire Crown** | L56–L88 + spire | Tallest cathedral spires (verticality/rhythm, not ornamentation) | Tapering parametric lattice spire with illuminated structural ribs; doubles as a tuned-mass-damper housing and broadcast mast. |
| **5. The Leaning Observatory** (detached annex) | ground to 40m | Leaning Tower of Pisa | Deliberately tilted 8°, stabilized by post-tensioned cable anchors and an asymmetric caisson foundation. Interior includes a spiral stair and intentionally tilt-corrected furniture as a visitor novelty. |
| **6. The Reflection Court & Pyramid Pavilion** | ground level | Taj Mahal symmetry + Giza pyramid form | Symmetrical reflecting pool and garden quadrants leading to a glass-and-stone pyramid pavilion that houses the building's sustainability core (geothermal exchange, solar chimney, rainwater cistern). |
| **7. The Wonder Annex** (low-rise entertainment cluster) | ground level | Motorsport pavilion + modular block pavilion + themed promenade (generic, unbranded) | A curved speed-form pavilion, a colorful modular-block creative pavilion, and a themed promenade street with a nightly light-and-water show plaza. |

**Interior design directive:** every zone's interior is fully specified,
room by room, in **Section D** — no zone is to be treated as an exterior
shell only.

---

## SECTION D — INTERIOR DETAIL SPECIFICATION (how each zone looks from inside)

Every subsection below lists the named rooms/spaces that must exist inside
that zone, a walkthrough of what a visitor sees, and a spec table covering
flooring, walls/ceiling, lighting, furniture/fixtures, ambient sound, and a
modeling note for the agent implementing it. Treat this section as
authoritative for Phase 4 in Section F.

### D.1 — The Canal Concourse Interior (B2–L3)

**Named interior spaces:** B2 Water Arrival Hall (canal-level boat dock) ·
B1 Market Loggia (retail arcade) · L1 Canalside Promenade Interior (cafés,
colonnade) · L2 Mezzanine Overlook (lounge terrace over the canal) ·
L3 Tower Transfer Lobby (concierge, elevator bank into the Sail Atrium).

**Walkthrough:** Arriving by boat, you enter a dim, stone barrel-vaulted
hall where rippling canal water throws animated caustic light across the
ceiling. Ascending, the Market Loggia opens into a colonnaded arcade lined
with striped-awning stalls. The Canalside Promenade runs along the water's
edge with café seating under the arches. A glass-balustraded mezzanine
looks back down over the canal. The sequence ends at a marble-and-brass
Transfer Lobby where the canal's rustic warmth gives way to the sleek glass
of the Sail Atrium beyond.

| Element | Spec |
|---|---|
| Flooring | Honed pale limestone (non-slip) at water level; reclaimed herringbone brick in the Market Loggia |
| Walls / Ceiling | Stone barrel vaults, exposed timber tie-beams painted muted ochre/venetian red, warm cream plaster |
| Lighting | Wrought-iron lantern pendants (~2700K) along the canal edge; uplighting under vault arches; animated caustic-light texture on the ceiling above water |
| Furniture / Fixtures | Canvas-striped stall awnings, wrought-iron café furniture, timber-hulled electric shuttle boats at stone mooring piers, brass cleats as accent hardware |
| Ambient sound | Water lapping on stone, a soft generic instrumental drone, muffled market murmur, reverberant footsteps under the vaults |
| Modeling note | Reuse one extruded arch profile along a spline for all vaults; fake caustics with a scrolling noise texture on an emissive plane rather than real-time ray tracing |

### D.2 — The Sail Atrium Interior (L4–L30)

**Named interior spaces:** Grand Lobby (L4–L6, triple-height) · Cascading
Water Wall (atrium ground level) · Suspended Sky-Bridges (crossing the
void at intervals) · Sweeping Cantilever Staircase · Typical Guest/Office
Floor (L7–L29) · Sky Lobby Transfer (L30, into the Ring Deck).

**Walkthrough:** The Grand Lobby opens beneath the full sail curve, its
bronze diagrid ribs visible through the double-skin glazing. A backlit
onyx reception desk sits under a fiber-optic "starlight" ceiling. A glass
cantilever staircase sweeps upward beside a water wall cascading down
textured slate into a reflecting basin. Sky-bridges cross the atrium void
at several levels. Typical floors carry the sail's curve into a geometric
carpet pattern and full-height glazing. The Sky Lobby at L30 is a dramatic
marble transfer space with a preview view straight up into the Ring Deck.

| Element | Spec |
|---|---|
| Flooring | Polished travertine with a brass inlay medallion under the lobby water feature; custom geometric carpet echoing the sail's curve on typical floors |
| Walls / Ceiling | Double-skin glazing exposing bronze-finished diagrid ribs; one full-height living green wall; fiber-optic starlight ceiling over the sky-bridges |
| Lighting | Warm ~3000K in lobby/lounge zones; cooler ~4000K daylight-mimicking on office/guest floors; LED cove lighting tracing the ceiling curve; diagrid rib uplighting that shifts tone with the exterior time-of-day mode |
| Furniture / Fixtures | Backlit onyx reception desk, cream leather seating pods around low marble tables, glass balustrades on stair and bridges, minimalist workstations or hotel-suite furniture on typical floors |
| Ambient sound | Constant soft water-wall white noise, footsteps on stone/carpet, distant elevator chime, a generative ambient pad in the lobby |
| Modeling note | Only render sky-bridge and typical-floor interiors within camera-relevant range (distance-based show/hide) — this is the tallest, most expensive zone to keep fully loaded |

### D.3 — The Ring Deck Interior (L31–L55)

**Named interior spaces:** Halo Walkway Interior (glass-bottomed corridor
wrapping the full ring) · Ring-Level Sky Gardens (planted atria at
intervals) · Observation Lounge (ring's highest point) · Typical Ring
Floor Interior (wrapping the central core) · Seismic Joint Viewing Gallery
(engineering showcase).

**Walkthrough:** The Halo Walkway is a full circular glass-floored
corridor; underfoot, illuminated steel ribs are visible through the glass
in a radial terrazzo setting. Sky Gardens punctuate the ring with
full-height planting under skylight wells. The Observation Lounge at the
ring's peak has 360° glazing and a curved bar. Typical floors wrap a
central service core. A glass viewing panel at the ring/tower structural
joint reveals the seismic damper mechanism, with an informational plaque —
a deliberate engineering-education moment.

| Element | Spec |
|---|---|
| Flooring | Radial-pattern terrazzo following the ring's curve; structural glass panels over an illuminated steel-rib underlay in the walkway |
| Walls / Ceiling | Curved glazing with a radial rib ceiling pattern; full-height planting walls under skylights in the sky gardens |
| Lighting | Under-floor lighting in the glass walkway; daylight-toned wash in sky gardens; warm accent lighting in the Observation Lounge; a focused spotlight on the damper viewing panel |
| Furniture / Fixtures | Curved built-in bar/lounge seating, informational plaques at the engineering gallery, planting troughs and bench seating in sky gardens |
| Ambient sound | Soft mechanical hum near the damper gallery, muffled wind-hush at height, ambient water-trickle in the sky gardens |
| Modeling note | Model the damper as a simplified but recognizable assembly (large suspended mass + visible bracing) — a visual/educational element, not a working physics simulation |

### D.4 — The Spire Crown Interior (L56–L88 + spire)

**Named interior spaces:** Sky-Lobby Transfer Floor (L56, base of the
spire) · Lattice Stair / Viewing Gallery (ascending through the lattice
void) · Tuned Mass Damper Chamber · Broadcast & Beacon Room (top of the
spire).

**Walkthrough:** The transfer floor marks a shift to a narrowing, tapering
plan. Structural lattice ribs are exposed and internally lit along their
length. A glass-tread stair/gallery is suspended within the lattice void,
giving vertigo-inducing views straight down through the structure. The
Damper Chamber holds a massive suspended polished-steel weight behind
reinforced glass, with plaques explaining its wind-stabilizing role. The
Beacon Room at the very top is utilitarian — brushed aluminum, exposed
conduit — dominated by the mechanical beacon-light apparatus.

| Element | Spec |
|---|---|
| Flooring | Dark polished concrete on tapering floor plates; expanded-metal-mesh gallery flooring near the top |
| Walls / Ceiling | Exposed lattice ribs with integrated LED strip lighting; glass panels between ribs for exterior views at every level |
| Lighting | Rib-integrated LED lighting that subtly shifts color with the exterior time-of-day mode; one dramatic spotlight on the damper sphere; utilitarian strip lighting in the beacon room |
| Furniture / Fixtures | Glass-tread stair with slim steel stringers; informational plaques at the damper chamber; visible beacon-light mechanism and conduit runs at the top |
| Ambient sound | Low structural wind-hum that increases with altitude, a faint mechanical tick near the damper, near-silence at the beacon room broken only by its own mechanical hum |
| Modeling note | Prioritize LOD here — only the current and adjacent floor plates need full detail; distant floors can be low-poly silhouettes |

### D.5 — The Leaning Observatory Interior

**Named interior spaces:** Entry Hall (tilted floor pattern) · Spiral
Marble Stair · Tilt-Corrected Visitor Lounge · Rooftop Tilted Terrace.

**Walkthrough:** In the Entry Hall, a concentric-ring floor pattern reads
as subtly skewed because of the annex's genuine 8° lean — a deliberate,
playful acknowledgment of the tilt rather than something hidden. A
brass-railed marble spiral stair winds upward past walls that expose the
post-tensioned cable anchor points as a visible architectural feature. The
Visitor Lounge furniture sits on hydraulic-leveling plinths, with signage
explaining the auto-leveling response to the tilt. The Rooftop Terrace
deliberately leaves the lean uncorrected so visitors feel it underfoot.

| Element | Spec |
|---|---|
| Flooring | Polished marble with a concentric-ring inlay in the Entry Hall (visually "off" due to the tilt); leveled decking on hydraulic plinths in the lounge |
| Walls / Ceiling | Exposed cable-anchor hardware as a deliberate feature wall; smooth plastered walls elsewhere |
| Lighting | Warm accent lighting following the spiral stair; a focused light on the cable-anchor feature wall; even wash lighting in the lounge |
| Furniture / Fixtures | Brass-railed marble spiral stair; lounge seating on visible mechanical leveling plinths; signage: "Furniture Auto-Levels: A Response to an 8° Structural Tilt" |
| Ambient sound | A subtle mechanical whir when a leveling plinth adjusts; light wind-whistle at the rooftop terrace |
| Modeling note | Apply the 8° tilt as a rotation on the entire annex's geometry group, not faked per-object — the floor pattern's "off" look should be a genuine consequence of that rotation, reinforcing the engineering narrative honestly |

### D.6 — The Reflection Court & Pyramid Pavilion Interior

**Named interior spaces:** Pyramid Atrium (sustainability core) · Solar
Chimney Core (vertical light/airflow feature) · Geothermal & Mechanical
Viewing Gallery · Garden Court Interior Halls (flanking the pyramid).

**Walkthrough:** Inside the glass pyramid, a sunken reflecting basin
mirrors the exposed steel ribs overhead. A central glass solar chimney
rises through the full height with a visible upward shimmer suggesting
convection. A viewing gallery looks down over exposed geothermal pipework
and heat exchangers, with educational signage. Flanking garden halls have
clerestory glazing, stone flooring, and quiet water channels underfoot.

| Element | Spec |
|---|---|
| Flooring | Pale stone echoing the exterior reflecting pool's white inlay, around a sunken glass-edged basin |
| Walls / Ceiling | Exposed steel pyramid ribs; glass solar-chimney core; clerestory glazing in the garden halls |
| Lighting | Daylight-dominant through the glazing, supplemented by warm accent lighting at dusk/night; a subtle rising shimmer effect in the solar chimney |
| Furniture / Fixtures | Educational signage at the geothermal gallery, simple stone benches in the garden halls, quiet water-channel details |
| Ambient sound | Soft water-channel trickle, a faint low hum from the geothermal gallery, airy reverb typical of a large glazed volume |
| Modeling note | Represent the chimney's "airflow" as a simple upward-drifting particle/shimmer shader, not a fluid simulation |

### D.7 — The Wonder Annex Interior

**Named interior spaces:** Motorsport Pavilion Interior (display floor +
simulator zone) · Modular Block Pavilion Interior (maker-space/creative
zone) · Themed Promenade Arcade (shops + show-viewing gallery).

**Walkthrough:** The Motorsport Pavilion has a dramatic curved,
aerodynamic-form ceiling with sweeping stage-style lighting over a central
rotating display plinth (a generic, unbranded concept vehicle) and a row
of simulator pods. The Modular Block Pavilion uses oversized colorful
block-shaped elements as literal feature-wall building blocks, in a
playful primary-color palette with interactive maker tables. The Promenade
Arcade has a full glass barrel-vault roof, warm-lit shopfronts, and a
tiered viewing gallery overlooking the exterior light-and-water show
plaza.

| Element | Spec |
|---|---|
| Flooring | Dark glossy resin (motorsport, reflective for dramatic lighting); bright poured-resin/rubber in primary colors (block pavilion); patterned tile (promenade) |
| Walls / Ceiling | Curved aerodynamic-form ceiling (motorsport); oversized modular block wall elements (block pavilion); full glass barrel-vault roof (promenade) |
| Lighting | Sweeping saturated stage lighting, red/black/silver, generic and unbranded (motorsport); bright even primary-color lighting (block pavilion); warm shopfront lighting plus a show-facing spotlight rig (promenade gallery) |
| Furniture / Fixtures | Central rotating display plinth and simulator pods (motorsport); interactive maker tables and stacked block seating (block pavilion); shopfront displays and tiered gallery seating (promenade) |
| Ambient sound | Low engine-hum drone and soft electronic beat, generic (motorsport); bright playful chime accents (block pavilion); crowd murmur and distant show-music swell during the light-and-water show (promenade) |
| Modeling note | Keep all vehicle/brand-adjacent shapes generic and unbranded per Section A's IP-safety rule — a sleek concept silhouette reads as "motorsport" without needing any real marque's design |

### D.8 — Cross-Cutting Interior Modeling & Performance Notes

- [ ] Distance/room-based culling: fully render an interior's detail meshes
      only when the camera is inside or near that zone; keep a low-poly
      exterior shell visible from afar.
- [ ] Interior lighting reacts subtly to the exterior time-of-day system
      (light spilling through glazing) while artificial lighting stays
      dominant, so interiors never go fully dark or blown-out.
- [ ] Give each interior a distinct acoustic character via a Web Audio
      convolver (stone hall vs. glass atrium vs. padded lounge) instead of
      one global reverb everywhere.
- [ ] Every interior includes at least 2–3 interactive or animated props
      (a door, an elevator, a rotating display, a leveling plinth, etc.) so
      spaces feel inhabited, not static backdrops.

---

## SECTION E — TECHNICAL SPECIFICATION

### E.1 Stack
- Three.js (latest stable, via CDN — verify version resolves)
- Vanilla JS modules (no build step required — keep it a static folder that
  runs by opening `index.html` via a local server)
- Web Audio API for all sound
- No external game engine, no paid assets

### E.2 Suggested file structure
```
aeon-spire/
  index.html
  /src
    main.js
    scene/        SceneManager.js  Lighting.js  Weather.js  TimeOfDay.js
    zones/        CanalConcourse.js SailAtrium.js RingDeck.js
                   SpireCrown.js LeaningObservatory.js
                   ReflectionCourt.js WonderAnnex.js
    construction/  ConstructionTimeline.js Crane.js Truck.js Worker.js
    audio/         AudioManager.js
    ui/            HUD.js Controls.js
  /assets
    textures/  audio/  models/ (optional .glb)
  README.md
```

### E.3 Visual style target (be honest about real-time limits)
Real-time browser WebGL won't hit offline-render photorealism — and it
doesn't need to. Aim for a **stylized, painterly PBR look**: baked
ambient-occlusion where possible, emissive window maps, fog and bloom for
atmosphere, and confident color grading per time-of-day. This reads as
"professional indie studio," which is the achievable and correct target.

### E.4 Time-of-day & weather system
- Modes: **Dawn, Day, Golden Hour, Dusk, Night** — each with its own sun
  angle/color, sky gradient, and a window-emissive toggle (lit at dusk/night).
- **Rain**: GPU or instanced-mesh particle rain, wet-surface material shift
  (lower roughness, subtle puddle reflection), canal ripple increase,
  distant thunder audio with occasional screen-space lightning flash.
- **Wind**: vertex-shader sway on flags, garden trees, and (during
  construction mode) crane cables; drifting dust particles; wind-strength
  audio layer that scales with an internal wind value.

### E.5 Audio system
Layered, cross-fading ambience keyed to mode: city hum, water lapping, birds
(day) / crickets (night), wind, rain + thunder, and — only in construction
mode — crane motor whir, hammering, truck engines (non-verbal foley only).
Add a soft generative pad/drone for "wonder" ambience. Crossfade smoothly on
mode change; never hard-cut audio.

### E.6 Camera & keyboard control table

| Key | Action |
|---|---|
| W A S D | Move / walk |
| Mouse drag (pointer lock) | Look around |
| Shift | Sprint / fast-fly |
| Q / E | Descend / ascend (fly mode) |
| F | Toggle walk ↔ fly mode |
| 1–7 | Jump to preset camera at each of the 7 zones |
| T | Cycle time of day |
| G | Force Golden Hour |
| N | Force Night |
| R | Toggle rain |
| C | Toggle Construction Mode (present-day ↔ build timeline) |
| [ / ] | Scrub construction timeline back / forward (Construction Mode only) |
| Space | Play/pause the construction timeline (Construction Mode only) |
| M | Toggle ambient music/soundscape |
| H | Toggle HUD / help overlay |
| P | Photo mode (hide UI, shallow depth of field) |
| Esc | Release pointer lock |

### E.7 Construction timeline simulation
Compress a fictional ~700-day schedule into 10 scrubbable milestones. Each
milestone needs: a visible structural change, animated equipment, and a
PM-style label with day count and % complete.

| # | Milestone | Equipment / animation |
|---|---|---|
| 1 | Site clearing & survey | Survey stakes, small excavator |
| 2 | Excavation & piling | Excavators, pile-driving rig |
| 3 | Foundation & raft slab pour | Concrete pump trucks, mixer trucks |
| 4 | Core & podium rising | Tower crane, rebar/formwork workers |
| 5 | Sail Atrium steel erection | Crawler crane, steel-erection crew |
| 6 | Ring Deck cantilever install | Heavy-lift crane, engineers on the ring |
| 7 | Spire topping-out | Self-jacking climbing crane, flag-raising moment |
| 8 | Facade glazing & MEP | Glazing trucks, cherry-pickers |
| 9 | Interior fit-out & landscaping | Canal filled, gardens planted, Annex assembled |
| 10 | Completion & opening | Ribbon-cutting, night light show |

Workers can be simple low-poly rigged figures with 3 animation loops (idle,
walk, work-action) — full skeletal animation isn't necessary; even
instanced billboard sprites with a walk-cycle texture atlas are acceptable
if performance requires it.

### E.8 UI / HUD (this is your Project Management hook)
- Mode indicators (time of day, weather, camera mode)
- A bottom Gantt-style progress bar showing the 10 construction milestones,
  synced to the timeline scrubber
- A day counter and a fictional "budget utilized %" ticker tied to
  milestone progress — gives you a direct PM talking point (schedule vs.
  budget, critical path, milestone tracking)
- Help overlay (H) listing every key from E.6

### E.9 Performance targets
Target 30–60fps on a mid-range laptop. Use instancing for repeated elements
(windows, trees, rain particles, worker figures), frustum culling, and LOD
for distant zones. Degrade shadow/particle quality gracefully rather than
dropping frames.

---

## SECTION F — PHASE-BY-PHASE BUILD PLAN

Work through these in order. Each has a Definition of Done — do not advance
until every box is checked.

**Phase 0 — Setup & environment verification**
- [ ] Project folder + file structure from E.2 created
- [ ] Three.js loads from CDN with no console errors, a blank scene renders

**Phase 1 — Scene foundation**
- [ ] Renderer, base perspective camera, ground plane, and a placeholder
      skybox are in place and render at a stable frame rate

**Phase 2 — Exterior massing (all 7 zones blocked out)**
- [ ] All 7 zones from Section C exist as correctly proportioned, correctly
      positioned low-poly volumes relative to each other

**Phase 3 — Structural & facade detail pass**
- [ ] Diagrid/glazing on the Sail Atrium, the Ring Deck's cantilevered halo,
      and the Spire's lattice are modeled with real materials (not flat color)

**Phase 4 — Interior detail pass**
- [ ] Every named interior space listed in Section D is modeled and
      furnished for all 7 zones (not just a subset) — flooring, wall/ceiling
      treatment, lighting, and at least the fixtures listed in each zone's
      spec table
- [ ] Each interior matches its zone's material palette and lighting
      character from Section D — no placeholder flat-color blocks
- [ ] The cross-cutting notes in D.8 (culling, lighting response, acoustics,
      interactive props) are implemented

**Phase 5 — Lighting & time-of-day system**
- [ ] All 5 modes (E.4) implemented and switchable via the T key with a
      smooth transition, not a hard cut

**Phase 6 — Weather system**
- [ ] Rain and wind both implemented per E.4, toggleable independently of
      time-of-day mode

**Phase 7 — Audio system**
- [ ] All ambience layers from E.5 implemented with cross-fade on mode change

**Phase 8 — Camera & interaction system**
- [ ] Every key in the E.6 table is implemented and functions as specified

**Phase 9 — Construction timeline simulation**
- [ ] All 10 milestones from E.7 are reachable via the scrubber, each with
      visible structural change and animated equipment

**Phase 10 — PM-style HUD & UI polish**
- [ ] Gantt-style progress bar, day counter, budget ticker, and help overlay
      all implemented and synced correctly to construction state

**Phase 11 — Optimization, QA & packaging**
- [ ] Frame rate holds at target on a representative machine
- [ ] No console errors across a full walkthrough of every mode and zone
- [ ] Final files copied into a clean, submittable folder
- [ ] README written (Section H)

---

## SECTION G — MASTER COMPLETION GATE

Do not declare the project finished until **every** checkbox in every phase
of Section F is checked, AND a full walkthrough (all 7 zones and their
interiors from Section D, all 5 time-of-day modes, rain, wind, full
construction scrub 1→10, every keyboard control) has been performed without
errors.

---

## SECTION H — PRESENTING THIS FOR YOUR PROJECT MANAGEMENT COURSE

The README should frame the deliverable explicitly in PM terms, not just as
a game:
- Map the 10 construction milestones to a simple Gantt chart / critical path
- Note the Leaning Observatory as a worked risk-management example
  (a design risk — the tilt — mitigated by a specific engineering response)
- Frame the budget ticker and milestone tracker as a stand-in for earned
  value tracking
- List controls and a one-paragraph pitch for why this is an original
  composite design, not a copy of any single real building

## SECTION I — ASSETS & LICENSING
- [ ] All textures are original, procedural, or CC0 (cite sources)
- [ ] All audio is original, synthesized, or CC0 (cite sources)
- [ ] No trademarked logos, brand names, or copyrighted characters anywhere
      in the scene

---

## SECTION J — THE STARTER MESSAGE (copy this in)

> Read `BUILD_PROMPT.md` in full. Create a todo list covering every phase in
> Section F. Do not stop, summarize, or ask for confirmation between phases —
> proceed autonomously, self-verifying each phase against its Definition of
> Done before moving to the next, until the Master Completion Gate in
> Section G is fully satisfied. If you hit a genuine blocker after 3
> attempts, stop and report it precisely. Begin now with Phase 0.
