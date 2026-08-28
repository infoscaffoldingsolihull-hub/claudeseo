# The Royal Mansion Digital Twin — Master Build Prompt

*A LangChain-style prompt template for generating a bug-free, browser-based, offline-first 3D
walkthrough + construction-simulation of a royal mansion, engineered to the same standard as this
repository's existing deliverable, `dist/GizaDigitalTwin.html`.*

This document is itself the deliverable you asked for: a prompt, not the game. Hand the rendered
prompt (Section 2) to whichever agent will build the mansion — this repository's own Claude Code
session, ChatGPT, or a LangChain `AgentExecutor` — and it carries enough constraint, spec and
acceptance criteria to produce a first-try, presentation-ready build. Section 9 answers your second
question directly: what to add beyond the brief.

---

## 1. Why it is structured this way

Three judgements sit behind every choice below, and they matter more than the prompt text itself:

1. **"0% chance of bugs" is not achievable by asking nicely — it is achieved by giving the builder a
   machine-checkable Definition of Done and telling it to run that check before declaring victory.**
   Section 8 is a real smoke-test contract, not a vibe. This repository already has the pattern:
   `tools/smoke-test.mjs` drives a headless Chromium session through every mode, panel and
   interaction and fails the build on a console error, a stuck collision, or an FPS floor breach.
   The mansion prompt below requires the same class of harness, extended to your new interactions
   (door/window/garage toggles, the day scrubber, `E`-inspect, WBS X-Ray).
2. **A LangChain-style prompt means a *templated, role-separated, tool-aware* prompt — system
   instructions that never change, a human template with `input_variables` that do, and a
   structured-output contract at the end** — not just a long wish list. Section 2 gives you both the
   literal LangChain `ChatPromptTemplate` code and a flattened plain-text version you can paste
   directly into any chat model, including this session.
3. **"So my project can win 1st prize" is a rendering-quality problem and a rigor problem at once.**
   The Giza build in this repo won its credibility by making the *project-management simulation*
   real (CPM, PERT, EVM, Monte Carlo, resource levelling — not decorative numbers) and letting the
   3D world be a direct, driven consequence of that simulation state. Section 4 carries the same
   discipline into residential construction PM, denominated in PKR, because that rigor is what a
   Harvard reviewer will actually be scoring — the 3D is the medium, the simulation is the content.

---

## 2. The prompt

### 2a. As a LangChain `ChatPromptTemplate`

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.pydantic_v1 import BaseModel, Field
from typing import List

SYSTEM_TEMPLATE = """\
You are the lead engineer of a small, senior team that ships a single browser-based 3D digital \
twin as a self-contained HTML file — offline, no build step for the end user, no network calls, \
no external CDNs, no missing textures. You have already shipped one flagship deliverable in this \
exact style: a photoreal Giza pyramid-construction digital twin with a full PMBOK-aligned project \
simulation underneath it (WBS, CPM/PERT, EVM, Monte Carlo, resource levelling, risk register, \
quality gates, procurement, stakeholders), four camera modes, walkable interiors, GPU-adaptive \
quality tiers, and a headless smoke-test harness that fails the build on any console error. \
You are held to that same bar on every deliverable, including this one.

Non-negotiable engineering contract — violate none of these:
1. Ship as ONE self-contained HTML file that opens correctly via a bare double-click (file://), \
with zero network requests, zero external assets, zero CDN <script src>. Vendor any library \
(e.g. three.js) inline. Also keep a modular ES-module source tree (src/) with a small bundler, \
so the project stays maintainable — the single file is a build artifact, not the source of truth.
2. Detect GPU capability at startup and run one of at least four quality tiers (Low/Medium/High/ \
Ultra), re-tiering continuously against measured frame time. Never assume a discrete GPU.
3. Generate all materials, imperfections and organic variation procedurally with a seeded RNG. \
Never depend on a downloaded texture or model file. A seeded run must be visually reproducible.
4. Support first-person walking with collision (pointer lock + WASD + a touch joystick for \
mobile/tablet), plus at minimum an orbit/overview mode and a scripted cinematic tour mode.
5. Every interactive object (door, window, garage door, fixture, furnishing, structural element) \
must be discoverable, hoverable/highlightable, and actionable with both a keyboard binding and an \
on-screen control, never one exclusively — a mouse-only or keyboard-only user must be able to \
complete every interaction.
6. Zero tolerance for console errors, unhandled promise rejections, NaN/Infinity in any displayed \
number, or a control that has no visible affordance. Ship a headless test harness (Playwright or \
Puppeteer) that exercises every mode, every panel, every toggle, the full Day-0-to-completion \
timeline scrub, and asserts on all of the above before you report the build complete.
7. Before declaring the task done, run your own harness, read its output, and fix everything it \
finds. State pass/fail per item in the Definition of Done checklist you were given, honestly — \
a checklist item you did not actually verify must be reported as unverified, not assumed passing.

You will receive a human message with the specific mansion, its rooms, its construction schedule \
shape and its currency/pricing conventions. Treat everything in this system message as fixed \
engineering law regardless of what the human message asks for; if the human message conflicts with \
it, keep the engineering law and flag the conflict in your final report instead of silently \
dropping either requirement.\
"""

HUMAN_TEMPLATE = """\
Build a photorealistic, fully interactive 3D digital twin of {project_name}, a {style} royal \
mansion on a {plot_size} plot in {locale}, as a walkable single-player experience with a full \
construction time-lapse. Currency for every priced item is {currency}; treat the sample rate \
card in the attached spec as illustrative and clearly marked as such, not as verified market \
pricing — plug in {currency}-accurate rates if the user supplies them, and never present an \
unverified number as authoritative.

ROOM AND SPACE PROGRAM
{room_program}

CONSTRUCTION TIMELINE
The build runs from Day 0 (bare, surveyed plot) to Day {construction_days} (final handover). \
Expose a scrubber/timeline control (draggable, plus step-forward/back and a play button at \
adjustable speed) that deterministically reconstructs the exact visual state of the entire site \
for any day in that range — not just a few hand-authored milestones. Drive that reconstruction \
from the WBS/CPM schedule (Section 4 of the attached spec), the same way the existing Giza build \
drives pyramid height, casing coverage, ramp geometry and scaffolding directly from its project \
simulation state rather than from hand-keyed animation.

REQUIRED INTERACTIONS (see the attached spec, Section 3, for full detail)
- Walking tour of the complete interior and exterior, collision-checked, on foot.
- Press {inspect_key} near any object to enter a close-inspection view: camera dollies in, the \
object is isolated/highlighted, and an info card shows its name, material, dimensions, the WBS \
work package it belongs to, and its cost in {currency}.
- Every door, every window, and every garage door opens and closes, with correct hinge/slide \
animation and both a proximity key-press and an on-screen button/icon.
- A live, itemised cost breakdown (a Bill of Quantities) in {currency} that sums to the project \
budget exactly, browsable by WBS package and by room, updating correctly as the timeline scrubs.
- A full guided tour mode: a scripted camera path with narration/captions covering both the \
finished home (room by room) and the construction story (phase by phase).
- A construction simulation, not a progress bar: cranes with animated boom/hook/rigging cycles, \
an animated instanced workforce laying bricks/pouring concrete/erecting trusses appropriate to \
the current WBS phase, scaffolding that erects and strikes on schedule, and material stockpiles \
that grow and deplete correctly.
- Sky/lighting modes for Day, Golden Hour, Dusk and Night, physically-plausible (sun/sky driven \
by real solar geometry, not a colour-ramp swap), switchable at any point on the timeline.
- A "WBS X-Ray" mode: a see-through/ghosted render toggle that reveals structural layers \
(foundation, frame, MEP routing, insulation) colour-coded by WBS package, cross-linked so \
clicking a package in the WBS panel highlights its geometry in the 3D view and vice versa.

DELIVERABLE
{deliverable_format}. Match the source layout, build tooling and testing discipline already \
established in this repository for the Giza build (src/engine, src/world, src/pm, src/ui, \
tools/build.mjs, tools/smoke-test.mjs) unless {deliverable_format} says otherwise.

Attach and follow in full: the engineering, feature, data-model and Definition-of-Done \
specification at docs/mansion/MASTER_BUILD_PROMPT.md (Sections 3-8) in this repository.

Before reporting completion, return your findings using the BuildReport schema you were given: \
every Definition-of-Done item marked true only if you actually ran the corresponding check.\
"""

class BuildReport(BaseModel):
    definition_of_done: dict = Field(
        description="Every checklist item from Section 8 of the spec, mapped to true/false, "
                    "true only if the corresponding automated or manual check was actually run."
    )
    known_gaps: List[str] = Field(description="Anything intentionally left incomplete, with why.")
    smoke_test_summary: str = Field(description="Pass/fail counts and any failures, verbatim.")
    file_size_mb: float = Field(description="Size of the single-file deliverable.")
    quality_tiers_verified: List[str] = Field(
        description="Which of Low/Medium/High/Ultra were actually exercised, not just coded."
    )

mansion_prompt = ChatPromptTemplate.from_messages(
    [("system", SYSTEM_TEMPLATE), ("human", HUMAN_TEMPLATE)]
)

filled = mansion_prompt.invoke({
    "project_name": "Bagh-e-Shahi Manor",
    "style": "neoclassical / Mughal-fusion",
    "plot_size": "2-kanal (≈1,011 m²)",
    "locale": "Lahore, Pakistan",
    "currency": "PKR",
    "construction_days": 540,
    "inspect_key": "E",
    "room_program": "<paste the room table from Section 5 here, or your own>",
    "deliverable_format": "a single self-contained HTML file plus the src/ module tree that "
                          "builds it, exactly like dist/GizaDigitalTwin.html",
})

# response = model.invoke(filled)                       # any chat model
# structured_agent = model.with_structured_output(BuildReport)
# report = structured_agent.invoke(filled.to_string() + "\n\nReturn only the BuildReport JSON.")
```

### 2b. Flattened, paste-ready version (for a plain chat window, or this session)

> You are the lead engineer of a team that ships a single browser-based 3D digital twin as a
> self-contained HTML file — offline, no network calls, no external CDNs, no missing textures —
> to the same standard as this repository's existing Giza pyramid-construction digital twin
> (`dist/GizaDigitalTwin.html`): a full PMBOK-aligned project simulation (WBS, CPM/PERT, EVM,
> Monte Carlo, resource levelling, risk register, quality gates) driving a photoreal 3D world,
> four camera modes, walkable interiors, GPU-adaptive quality tiers, and a headless smoke-test
> harness that fails the build on any console error.
>
> **Build the same class of deliverable for a royal mansion**, replacing pyramid construction with
> residential construction and denominating every cost in PKR. Follow `docs/mansion/
> MASTER_BUILD_PROMPT.md` in this repository in full — Sections 3-8 are the binding spec: the
> engineering contract, the full feature list (walking tour, Day-0-to-completion timeline scrubber,
> `E`-to-inspect, openable doors/windows/garage doors, a live PKR cost breakdown, a guided tour,
> a real construction simulation with cranes and an animated workforce, Day/Golden-Hour/Dusk/Night
> lighting, and a WBS X-Ray mode), the data model for rooms and the WBS/cost schedule, the
> recommended architecture, and the Definition of Done. Do not consider the task complete until
> every item in Section 8 has actually been checked, not assumed — run the smoke-test harness
> yourself and report its real output.

---

## 3. Full feature specification

| Area | Requirement | Notes / precedent in this repo |
|---|---|---|
| **Walking tour** | First-person, pointer-lock + WASD, AABB collision against every solid, touch joystick on mobile. Every room and the full exterior reachable on foot. | `src/engine/controls.js`, `src/world/collision.js` |
| **Camera modes** | Walk (first-person), Orbit/Drone (free flight), Tour (scripted, narrated), and an optional top-down site/Gantt-synced overview. | `src/engine/controls.js` four-mode pattern |
| **Time-lapse / before-after** | A single scrubber (drag, step, play at 1×/4×/30×) reconstructing the *entire* site — building shell, scaffolding, cranes, stockpiles, landscaping, even interior finish state — for any day 0…N. Must be driven by the schedule model (Section 4), not by a handful of keyframed "before" and "after" snapshots. | Analogous to pyramid height/casing/ramp/scaffolding being pure functions of project state in `src/world/world.js` |
| **Inspect (`E`)** | Raycast-based proximity/look detection; on trigger, camera dollies to a framed close-up, object is rim-lit/isolated, an info card shows name, material, dimensions, WBS package, and cost in PKR. Escape or re-press `E` returns smoothly to the prior camera. | New; pattern of "look at → info panel" is close to the existing relic **codex** entries in `src/world/relics.js` |
| **Doors** | Every interior and exterior door hinges open/closed on proximity `E`-press or click; correct swing direction and clearance; state persists in the timeline (a door finished on Day 300 should not exist on Day 200). | New |
| **Windows** | Casement/sash animation on the same interaction pattern as doors. | New |
| **Garage doors** | Sectional/roll-up animation, triggered by an explicit on-screen button (not proximity-only, per your spec) as well as `E`. | New |
| **Pricing** | Every priced object carries a `costPKR` field. A running Bill of Quantities panel totals by room and by WBS package and must reconcile exactly to the project budget at Day N — a mismatch is a bug, not a rounding footnote. | Parallels the EVM cost panel in `src/pm/project.js` + `src/ui/panels.js`, re-denominated |
| **Guided tour** | A scripted, narrated (captioned, for accessibility) multi-beat camera path covering both "tour the finished home" and "tour the construction story," selectable independently. | `src/ui/tour.js` fifteen-beat pattern |
| **Construction simulation** | Phase-appropriate animated crew (GPU-instanced, not one-off meshes) performing bricklaying, formwork/concrete pour, steel fixing, roof truss erection, plastering, painting, landscaping; tower/mobile cranes with real boom-slew/hoist cycles; scaffolding that erects before and strikes after each phase; material stockpiles sized from the resource model. | `src/world/workers.js`, `src/world/pyramids.js` scaffolding logic |
| **Environment/sky** | Physically-based sky (Preetham or equivalent analytic model) driven by real solar geometry for the site's latitude/longitude, not a colour-ramp; Day, Golden Hour, Dusk, Night presets plus continuous time-of-day; ambient audio (wind, birds by day, crickets by night) with a mute control. | `src/world/sky.js` |
| **WBS X-Ray** | Ghosted/see-through material swap revealing foundation, structural frame, MEP routing and insulation, colour-coded by WBS control account; bidirectional highlight between the 3D view and the WBS panel. | New — natural extension of the existing wireframe/reveal techniques plus the WBS panel in `src/ui/panels.js` |
| **Quality/perf** | Low/Medium/High/Ultra tiers, auto-detected then continuously re-tiered on rolling frame time; a `?quality=` URL override for a known machine (e.g. a lectern PC). | `src/engine/quality.js` |
| **Persistence** | Save/resume (several slots + autosave), export/import as text, so a session prepared at home resumes identically on the presentation machine. | `src/ui/storage.js` |
| **Accessibility** | Full keyboard-only path through every interaction; captions on all narration; a colour-blind-safe palette option for the WBS X-Ray colour coding; a documented control reference (`?` key). | Matches this repo's existing bar |

---

## 4. The project-management layer (this is what makes it Harvard-grade, not the graphics)

Mirror the rigor of `src/pm/` — `model.js` (WBS/resources/risk/procurement/stakeholders),
`cpm.js` (CPM/PERT), `project.js` (execution/EVM/quality), `montecarlo.js` — but for a residential
build. This package should have **zero dependency on three.js or the DOM**, exactly like the Giza
one, so it can be unit-tested headlessly and calibrated against random seeds before it is ever wired
to the renderer.

**Suggested WBS control accounts** (adapt to the actual mansion program):

| # | Control account | Representative work packages |
|---|---|---|
| 1 | Preliminaries & site establishment | Survey, boundary wall, site office, temporary utilities |
| 2 | Substructure | Excavation, footings, DPC, basement/raft slab |
| 3 | Superstructure — structural frame | Columns, beams, slabs per floor, staircases |
| 4 | Envelope | External walls, roofing/waterproofing, façade stonework |
| 5 | MEP rough-in | Electrical conduit, plumbing stacks, HVAC ducting, fire protection |
| 6 | Interior finishes | Plaster, flooring, joinery, false ceiling, paint, sanitaryware |
| 7 | Fixtures, fittings & furnishing | Kitchens, wardrobes, lighting fixtures, imported fittings |
| 8 | External works & landscaping | Driveway, garden, boundary lighting, pool/fountain if any |
| 9 | Handover & commissioning | Snagging, MEP testing, final clean, client walkthrough |

Give each control account 4-8 work packages (targeting roughly the 34-package granularity the Giza
model uses across 8 accounts), each with a three-point (O/M/P) PERT duration, a dependency
(FS/SS/FF/SF, with lead/lag where realistic — e.g. plaster can start with a lag after slab pour),
a crew/resource assignment, a `costPKR` budget, and a quality gate where relevant (e.g. concrete
cube-strength testing, waterproofing pressure test).

**Cost model:** every leaf item (a door, a window, a light fixture, a m² of a given flooring) needs
an explicit `costPKR`. Build a small rate-card table (materials × quality grade → PKR/unit) so the
whole BOQ is generated from a compact data table rather than hand-priced per instance — this is also
what lets the cost breakdown reconcile exactly. **Do not present specific PKR rates as verified
current market pricing** — construction costs in Pakistan move with cement/steel prices and currency
conditions; ship the rate card as clearly-labelled illustrative data with every number editable in
one place, and note in the UI that a real submission should have rates verified against a current
local quotation.

**Risk register**, sized to the local context, e.g.: monsoon/rain delay to concrete pours, cement or
rebar price escalation, import lead time for fixtures paid in foreign currency, PKR exchange-rate
movement on imported items, labour availability during harvest season, utility-connection delay from
the local development authority. Score each with probability × impact, an EMV, and a response
strategy with real cost — exactly the Giza pattern, re-themed.

Carry forward earned-value analysis (PV/EV/AC/SV/CV/SPI/CPI, three EAC formulas, ETC, VAC, TCPI),
resource levelling with a utilisation/over-allocation view, and — if time allows — a Monte Carlo
schedule-risk run (P10/P50/P80/P90, tornado sensitivity) for the completion date. This is the layer
a Harvard reviewer with any project-management literacy will actually interrogate.

---

## 5. Data model sketch

```ts
interface PricedObject {
  id: string;
  label: string;
  wbsPackageId: string;       // links to the WBS tree for cost roll-up and X-Ray colour coding
  room?: string;
  material: string;
  dimensionsM: [number, number, number];
  costPKR: number;
  installedOnDay: number;     // drives visibility in the timeline reconstruction
  interactive?: "door" | "window" | "garageDoor" | "inspectOnly";
}

interface WorkPackage {
  id: string;
  controlAccount: string;
  name: string;
  optimisticDays: number; mostLikelyDays: number; pessimisticDays: number;  // PERT
  predecessors: { id: string; type: "FS"|"SS"|"FF"|"SF"; lagDays?: number }[];
  crew: string;                // resource pool id
  budgetPKR: number;
  qualityGate?: string;
}
```

**Room program table** — fill this in for your specific mansion and pass it as `room_program` in
Section 2a (a starting shape, adjust freely):

| Room | Approx. area (m²) | Floor | Notable priced items |
|---|---|---|---|
| Grand entrance foyer | 45 | Ground | Marble flooring, chandelier, main double door |
| Formal living/majlis | 60 | Ground | Imported sofas, fireplace, ceiling cornice |
| Formal dining | 35 | Ground | Dining set, statement lighting |
| Family lounge | 50 | Ground | Media wall, sectional seating |
| Kitchen + pantry | 40 | Ground | Cabinetry, appliances, island |
| Master suite + walk-in + bath | 70 | First | Four-poster bed, marble bath, dressing |
| Bedrooms ×4 en-suite | 35 each | First | Wardrobes, ensuite fittings |
| Home office / library | 30 | First | Built-in shelving, desk |
| Home theatre | 40 | Basement | AV system, tiered seating |
| Gym | 30 | Basement | Equipment, mirrored wall |
| Garage (2-3 car) | 60 | Ground | Sectional garage doors, storage |
| Servant quarters | 30 | Ground/annex | Basic finishes |
| Verandas / terraces | — | All | Stone balustrade, outdoor furniture |
| Landscaped garden + driveway | — | Site | Fountain, boundary wall, gate |

---

## 6. Recommended architecture

Reuse this repository's proven shape rather than inventing a new one:

```
index.html                    dev entry point (ES modules, needs a static server)
dist/RoyalMansion.html         single-file deliverable (generated)
assets/vendor/                 three.js, vendored
src/
  shell.html
  main.js                      shell, mode switching, key bindings, test API
  engine/                      renderer, postfx, quality tiers, controls, input, noise, textures
  world/                       terrain, sky, mansion geometry, interiors, doors/windows/garage,
                                construction rig (cranes, scaffolding, workforce), props
  pm/                          WBS, CPM/PERT, EVM, risk, resources, procurement — zero DOM/three.js
  ui/                          dashboard panels, BoQ/cost view, HUD, timeline scrubber, tour, WBS
                                X-Ray panel, touch layer
tools/
  build.mjs                    single-file bundler (topo-sort, inline vendor, IIFE wrap)
  serve.mjs                    dev server
  smoke-test.mjs               headless QA: console errors, FPS floor, every panel, every toggle,
                                door/window/garage interactions, timeline scrub 0→N, X-Ray, BoQ
                                reconciliation
docs/
```

Keep the `pm/` package pure (no `three`, no `document`) so it can be run and calibrated in Node
before it is wired to the renderer — that separation is what let the Giza model be tuned against
five random seeds in fractions of a second per run, and it is the fastest way to find a
scheduling or cost-roll-up bug before it ever shows up as a visual glitch.

---

## 7. Suggested build order for the agent

1. **PM core, headless.** Build and unit-test the WBS/CPM/EVM/cost model in Node with no rendering
   at all. Verify the schedule solves, floats are non-negative on the critical path, and the BoQ
   sums to budget, before any 3D work starts.
2. **Static shell.** Terrain, sky (all four lighting presets), the finished mansion's exterior and
   interior geometry at Day N (final state only), first-person + orbit controls with collision.
3. **Interactivity pass.** `E`-inspect, doors, windows, garage doors (button + key), info cards,
   cost panel wired to the (currently static, Day-N) PM data.
4. **Timeline system.** Drive every visual element (shell completeness, scaffolding, cranes,
   stockpiles, door/window presence, landscaping) from the WBS/CPM day-by-day state; wire the
   scrubber; verify Day 0 and Day N match the intended bookends and every day between is coherent.
5. **Construction choreography.** Animated crane cycles, instanced workforce per active work
   package, scaffolding erect/strike timing.
6. **WBS X-Ray, guided tour, quality tiers, save/resume, touch layer, accessibility pass.**
7. **Harden.** Build the smoke-test harness, run it, fix everything, run it again. Only then
   generate `dist/RoyalMansion.html` and hand back the `BuildReport`.

---

## 8. Definition of Done (the agent must check every line, honestly)

- [ ] Opens via `file://` double-click with zero network requests and zero console errors/warnings
- [ ] Runs on all four quality tiers without a crash; auto-detection picks a sane tier on a
      simulated low-end profile
- [ ] Walk collision holds against every wall, door (when closed) and piece of furniture in every
      room, at every timeline day where that geometry exists
- [ ] Every door, window and garage door opens and closes correctly from both its key binding and
      its on-screen control, and its state matches the current timeline day
- [ ] `E`-inspect works on every priced object; the info card shows correct name, material,
      dimensions, WBS package and PKR cost with no missing/undefined fields
- [ ] The BoQ/cost panel total reconciles exactly to the project budget at every timeline day tested
- [ ] The timeline scrubber reconstructs a visually coherent site for at least 20 sampled days
      across the full range, including Day 0 (bare plot) and Day N (final handover)
- [ ] Construction choreography (cranes, workforce, scaffolding) is present and phase-appropriate
      whenever the scrubber sits inside an active construction window
- [ ] Day / Golden Hour / Dusk / Night all render distinctly and correctly at any timeline day
- [ ] WBS X-Ray toggle reveals structural layers with correct WBS colour-coding and bidirectional
      highlight with the WBS panel
- [ ] Guided tour completes start to finish without a stuck camera or a missing caption
- [ ] Save/resume round-trips correctly across a page reload
- [ ] Full keyboard-only path exists for every interaction; touch controls work on a simulated
      mobile viewport
- [ ] Headless smoke test exercises all of the above and is included in the repository, green on
      the final commit

---

## 9. Architect's recommendations — what I'd add beyond your brief

You asked what else should be added. Ranked by how much it would move a Harvard reviewer, not by
how flashy it is:

**Substance that actually differentiates the project (do these before any visual polish):**
- **Make the PM layer the star, not the backdrop.** Section 4's WBS/CPM/EVM/risk/Monte-Carlo stack
  is what turned the Giza build from "a nice demo" into a defensible academic project — a dashboard
  a reviewer can interrogate (ask "what's the critical path today," "what does a 2-week rebar
  delay do to completion," "what's driving cost variance") is worth more than any single visual
  effect. Keep it real, not decorative.
- **A live "value engineering" comparison mode**: toggle between two finish/material specs for the
  same room (e.g. imported vs. local marble) and see the cost and schedule delta update live. This
  is a genuinely useful PM concept, not just eye candy, and it's a natural extension of the BoQ.
- **A one-click exportable PDF/print report**: project charter, WBS, S-curve, risk register,
  final BoQ — the kind of artefact a judge can take away and read after the demo ends.
- **A sustainability/energy overlay**: orientation-driven solar gain, a rough embodied-carbon
  estimate per material choice, projected utility cost — increasingly what distinguishes a
  "serious" architecture/PM capstone at a school like Harvard from a pure visualization exercise.

**Exterior & environment:**
- Real weather states (light rain, overcast, haze) layered onto the four lighting presets, not just
  four static looks — a construction site under rain affecting worker productivity is a legitimate
  PM risk-register tie-in, not just visual variety.
- Procedural landscaping that matures over the timeline (freshly planted vs. established trees by
  Day N) rather than appearing fully grown the day it's installed.
- A reflective water feature (pool/fountain) if the program includes one — cheap visual win with
  three.js and ties naturally into a "before/after" beat in the guided tour.

**Construction sequence:**
- A synchronized mini-Gantt/S-curve HUD that scrubs in lockstep with the 3D timeline, so the
  audience always sees *why* the site looks the way it does on a given day — this is the single
  highest-leverage feature for making the PM rigor legible during a live demo.
- Distinguish trades visually (mason vs. electrician vs. painter crews with different instanced
  models/animations) so the construction choreography reads as a real sequence of trades, not one
  generic "workers" animation reused everywhere.

**Interior/interactivity:**
- A "customize finishes" mode: let the viewer swap flooring/paint/fixture options per room and see
  the cost update — a light version of value engineering that's very demo-friendly.
- Furniture layout toggle (empty shell vs. furnished) as its own axis from the construction
  timeline, since a judge may want to see the architecture on its own.
- A minimap/compass and a bookmarkable camera position ("share this exact view") — small UX
  touches, expensive to skip in a live demo when someone gets lost.

**Presentation & credibility:**
- Match this repo's documentation discipline: a technical report, a user manual, and — most
  valuable for a competition — a "Defence Q&A" document anticipating judge questions, exactly like
  `docs/DEFENCE_QA.md` here. Judges reward a team that has clearly stress-tested its own project.
- Keep the rate card and every non-visual assumption (durations, risk probabilities, exchange-rate
  handling) in one clearly-documented, editable place, and say so on stage — a reviewer who asks
  "where did this number come from" should get a confident, specific answer, not a shrug.

---

## 10. Next step

This document is ready to hand to a build agent as-is. If you'd like, the next message can start
Phase 1 of Section 7 directly in this repository (a new `docs/mansion/` planning trail already
exists here) — say the word and specify the mansion's name, plot size/locale and room program (or
approve the illustrative one in Section 5) and the build can begin.
