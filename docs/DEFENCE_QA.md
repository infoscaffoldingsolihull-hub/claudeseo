# Defence — Anticipated Questions and Answers

*Prepared for an academic panel. Questions are grouped by the direction they are most likely to come
from: project management, archaeology, software engineering, and the honest challenges.*

---

## A. Project management

### A1. Why is this a project and not just a large construction operation?

All four PMBOK criteria hold. It is **temporary** — the deadline is the sponsor's lifespan, and
Khufu's successor abandoned Giza for Zawyet el-Aryan, so the deadline was real. It is **unique** —
the two immediately preceding attempts, Meidum and the Bent Pyramid, both failed structurally and
were redesigned mid-build. It produces a **defined deliverable**. And it was **progressively
elaborated** — the burial chamber moved at least twice during execution.

It also had a project organisation: a named project director (Hemiunu, "Overseer of all the King's
Works"), a documented workforce structure of two crews of five phyles, and written progress
records. The Merer papyri from Wadi al-Jarf are a boat captain's logbook recording dated deliveries
of Tura limestone to Giza. That is a progress report, in 2560 BCE.

### A2. Your BAC is in "kilodeben". Isn't that invented?

The unit is a modelling convenience and the simulator says so. The Old Kingdom had no coinage;
state accounts were kept in grain, beer, linen and copper equivalents, and the Merer papyri show
quantities tracked exactly that way. One deben is about 91 g of copper. Expressing everything in a
single unit is what lets earned-value analysis behave exactly as it does on a modern project — which
is the pedagogical point. The *relative* magnitudes are what matter, and those are derived from
volume, distance and workforce estimates that are defensible.

### A3. Why does SPI read 1.00 at the end of a project that finished 190 days late?

Because that is what SPI does, and demonstrating it is deliberate. SPI = EV/PV, and at completion
EV → BAC and PV → BAC regardless of when you finish. It is the best-known defect in classical
earned-value analysis.

That is why the dashboard shows **earned schedule** next to it. ES expresses progress in time
rather than money: ES is the date at which the baseline planned to have earned the value you have
now, SV(t) = ES − AT, SPI(t) = ES/AT. On the same run SPI(t) reads 0.974 and stays honest to the
last day. Both are on screen together, on purpose.

### A4. How is the critical path calculated, and can you show me the float?

Full precedence-diagram CPM with all four dependency types and leads and lags. Forward pass for
ES/EF, backward pass for LS/LF, total float = LS − ES, free float = the minimum slack to any
successor clamped to total float, critical = total float ≤ 0.5 days.

Open **Schedule → CPM network**: every node shows ES, EF, LS, LF and TF. The critical path is red.
Link labels show the type and lag wherever it is not a plain FS with zero lag.

### A5. Why does the critical path leave core construction and come back to it?

Because 5.3 — the courses from 65 to 105 metres — cannot start until 6.5, the King's Chamber and its
five relieving chambers, is closed. You cannot build over an open chamber. So the path runs
1.1 → 1.2 → 1.3 → 5.1 → 5.2 → 6.2 → 6.3 → 6.4 → 6.5 → 5.3 → 5.4 → 5.5 → 7.2 → 7.3 → 8.5.

That is the single most important structural fact in the schedule, and it is why a granite beam
fracturing on the lifting frame — R-06 — is the most dangerous entry in the risk register.

### A6. Why is your Monte Carlo P50 later than your deterministic estimate? Is the model biased?

No — the deterministic estimate is biased, and the simulator is showing you why. PERT analyses only
the critical path. In any particular outcome, a near-critical path can become critical. Because the
project duration is the *maximum* over paths, and the expectation of a maximum exceeds the maximum
of expectations, the true mean is always later than the deterministic sum. This is the merge bias,
sometimes called Fondahl's effect.

Monte Carlo re-runs the whole network for every iteration, so it captures it. The gap between day
7 051 deterministic and a P50 near day 7 750 is not padding; it is the arithmetic of a network.

### A7. What should the sponsor be told?

The wording the simulator puts on screen:

> "The deterministic schedule says day 7 051. The analysis says there is about a 1% chance of
> achieving it. I recommend we commit to the P80 date, which we will meet four times in five, and
> fund to the P80 cost. The difference between the two dates is not padding — it is the price of the
> uncertainty we have already identified and written down."

### A8. Where does the resource plan come from? Did you just pick numbers?

No. The per-package crew figures are relative weights. At load time the simulator builds the
**baseline resource histogram** — daily demand per pool from the early-start schedule — finds the
peak total workforce, and rescales every crew figure so that peak lands on 21 000 people, matching
Lehner's estimate. Each pool's recommended staffing is then its own peak demand, and the day rates
are calibrated so that following the levelled plan for the baseline duration spends exactly the
resource share of BAC.

The consequence is exact and testable: a manager who follows the plan sees SPI = CPI = 1.00. Every
variance in a run is the player's, not the model's. Open **Resource Management** and the histogram
shows peak against mean for each pool — the gap between them is what levelling is worth.

### A9. Why does over-staffing hurt the cost performance index?

Because assigned labour is paid whether or not there is a work face for it. That single modelling
decision is what makes resource levelling matter. Park every pool at peak for the whole project and
you pay peak rates through every trough in the histogram; the panel quantifies the waste in kdb.
There is also a Brooks term: above 100% staffing, extra people yield only 42% of their nominal
contribution.

### A10. Your risk register uses EMV. How do you handle unknown unknowns?

Two separate reserves, and the simulator enforces the distinction. **Contingency reserve** = Σ EMV
over the register = 88 812 kdb, spent automatically as identified risks occur. **Management
reserve** = 10% of BAC, for unknown unknowns, requiring explicit escalation. When contingency runs
out the advisor tells you to escalate — and points out that a reserve request made before the
reserve is gone is a management decision, whereas one made afterwards is an apology.

### A11. Can quality actually fail, or is it decorative?

It fails. Seven packages carry a gate with a target and a tolerance. Inspection samples are drawn as
work proceeds; the sample mean drifts with *pressure* — productivity pushed above 100% by
over-staffing or crashing, and welfare below 0.85. A sample beyond the upper control limit is a
special-cause signal: the affected fraction of the package is torn out and rebuilt at 1.35× its
budget rate, charged to internal failure and to the schedule.

Raise the inspection level and appraisal cost rises linearly while internal failure falls faster —
the standard cost-of-quality relationship, and you can watch it happen on the panel.

### A12. Is the stakeholder model more than window dressing?

It is wired into throughput. The work gangs have power 3 and interest 5, and productivity is
directly a function of their welfare — rations, housing, rotation, safety. Under-provision the site
and output falls for months, because welfare moves toward its target with a lag. The first recorded
labour action in history, at Deir el-Medina under Ramesses III, was over late ration deliveries.
Stakeholder management here is not a soft skill; it is the throughput model.

### A13. Which PMBOK performance domains are covered?

All eight, plus the knowledge areas they subsume: Stakeholders, Team, Development Approach and Life
Cycle, Planning, Project Work, Delivery, Measurement, and Uncertainty. In knowledge-area terms:
integration (the charter and the change model), scope, schedule, cost, quality, resource,
communications (the event ticker and stakeholder reporting), risk, procurement and stakeholder
management. Every one has its own dashboard panel.

---

## B. Archaeology and history

### B1. How accurate is the geometry?

Dimensions are published survey figures. Great Pyramid: 230.33 m base, 146.6 m design height,
51.844° slope, 210 courses. Khafre: 215.25 m, 143.5 m, 53.13°. Menkaure: 102.2 m, 65 m. Sphinx:
73 m long, 20.2 m high, 19.3 m wide, facing due east. King's Chamber: 10.47 × 5.23 × 5.97 m. Grand
Gallery: 46.68 m long, 8.74 m high, 2.06 m at the floor narrowing to 1.04 m at the roof over seven
corbels. Passages: 1.05 × 1.20 m at 26° 31′ 23″.

The whole internal system lies in a single vertical plane 7.29 m east of the pyramid's north–south
axis — the plane of the original entrance — exactly as Petrie recorded.

### B2. What is reconstruction rather than evidence?

Stated plainly, and this is important:

- **The ramp.** No construction ramp survives. The model shows the most economical reconstruction —
  a straight ramp on the south face for the lower third, then wrapping side ramps — because a
  straight ramp to the apex would require more material than the pyramid itself. Other
  reconstructions exist (internal spiral, levered lifting) and none is proven.
- **The scaffolding and lifting frames.** Conjectural, based on Arnold's analysis of lever and
  rocker methods.
- **The Khufu valley temple.** Lies under the modern village of Nazlet el-Samman and is only
  partially known; its plan here is generic.
- **The worker figures and gang routes.** Illustrative, though the workforce size, the town plan and
  the rotation system come from the AERA excavations at Heit el-Ghurab.
- **The colour of everything.** Weathering, tone and finish are inferred, not measured.

### B3. Was the workforce enslaved?

No, and the model reflects the evidence. The AERA excavations found dormitory galleries for about
1 600 rotating workers, bakeries and breweries at industrial scale, a fish-processing yard, and
cattle bone from herds driven in from the Delta. The skeletal record shows set bones and healed
fractures — these people received medical care. The gang names painted in the relieving chambers
("Friends of Khufu", "Drunkards of Menkaure") are self-chosen and cheerful.

It was a paid, fed, housed, rotating levy: closer to a national infrastructure programme than to
slavery. That is why welfare is a first-class variable in the simulation.

### B4. Twenty years and 2.3 million blocks — is that credible?

It is the standard figure and the model is consistent with it. 2.3 million blocks over 7 051 days is
about 326 blocks a day, or roughly 34 an hour over a ten-hour day. With gangs working multiple
faces of a course simultaneously and the volume heavily concentrated in the lower courses — 59% of
the volume is below 65 m — that rate is achievable. It is also why the model's 5.4 package, covering
just 17% of the height, takes longer than its volume suggests: the lift height dominates.

### B5. Why is the Queen's Chamber unfinished?

Because the design changed. It has a gabled roof and a corbelled eastern niche, both unfinished, and
its two shafts were sealed at both ends. Together with the abandoned Subterranean Chamber, it is the
physical record of the burial chamber being relocated at least twice during construction.

In the simulator that is R-11, "Royal scope change to the burial chamber": probability 0.30, impact
64 000 kdb and 180 days, response **Accept**, because the sponsor is the king. It is the best
teaching example in the register — an approved scope change, carved in stone, that you can walk
into.

### B6. The half-millimetre joint — really?

Petrie measured the mean joint of the surviving Tura casing blocks at about half a millimetre over
surfaces two and a half metres square. It is the single most demanding quality requirement on the
project, achieved with copper saws, sand abrasive and eyesight. It sits on the critical path through
7.1 and 7.2, and it is one of the seven quality gates.

### B7. Where are the sources?

`docs/HISTORICAL_SOURCES.md` lists them per feature, and `src/world/layout.js` carries the survey
figures with their attribution in comments. The principal sources are Lehner's *The Complete
Pyramids*, Arnold's *Building in Egypt*, Petrie's 1883 survey, and Tallet's publication of the Merer
papyri.

---

## C. Software engineering

### C1. Why not a game engine?

Three reasons. It must run from a single file with no install and no network. It must run on unknown
hardware from a USB stick. And every asset had to be generated, not licensed — which a browser and
a procedural pipeline do naturally.

### C2. How do you render 2.3 million blocks?

You do not, and the interface says so. Only the outer skin of a pyramid is ever visible, so the
model renders the visible course rings as instanced blocks over a solid core. The quality tier
chooses how many real courses one instanced block spans — one at ultra, five at low — which puts the
rendered instance count between about 4 000 and 40 000 for Khufu.

The statistics overlay always shows both the rendered instance count and the true conceptual block
count of 2 300 000, side by side. Hiding the abstraction would be the dishonest choice.

### C3. How does it stay at 60 fps on unknown hardware?

Four quality tiers, chosen initially from the GPU string and then re-selected continuously from a
ninety-frame rolling average — down below 34 fps, up above 88, with a cooldown against oscillation.
Everything scales: pixel ratio, shadow resolution, MSAA, post-processing passes, terrain
subdivision, instance density, worker count and light budget.

For a presentation, `?quality=medium` pins the tier so the engine never re-tiers mid-demonstration.

### C4. How is it tested?

`npm test` runs a headless Chromium harness that loads the built single file from `file://`, boots
it, exercises seven visual scenarios across all four modes and the interior, opens every dashboard
panel, drops the walker at eight points and asserts it settles on the ground, walks it up the Grand
Gallery, runs the entire twenty-year project headlessly and reports the earned-value outcome, checks
geometry/texture/program counts for leaks, and **fails on any console error**.

Current status: seven scenarios, eleven panels, zero errors, zero warnings.

### C5. Give me an example of a bug the tests caught.

The horizon terrain ring. The ring's subdivision count was derived as `n/3`, which is not an integer
for every tier. At the medium tier that produced fractional array indices — writes to a typed array
at a non-integer index are silently discarded — leaving zeroed vertices, a NaN bounding sphere, and
a terrain seam that would have opened at 2 km. It never threw. It surfaced as a `computeBoundingSphere`
warning in the harness, and `findBadGeometries()` located the exact object.

The fix was not just to round the number: the ring must share the inner tile's subdivision count for
the seam to be watertight at all, which the code and its comment now make explicit.

### C6. Why is the project simulation separate from the renderer?

Because it made it testable. `src/pm/` has no dependency on three.js or the DOM, so it runs in Node.
The resource model was calibrated by running complete twenty-year projects in about 0.2 seconds each
across five random seeds, before any of it touched a renderer. Present behaviour is 102–104% of
baseline duration and CPI 0.91–0.93 on autopilot — a modest, realistic overrun that leaves the player
something to fix.

---

## D. The honest challenges

### D1. Is this a game or a teaching tool?

Both, and the tension is real. The gamification — four modes, six missions, discovery of points of
interest — exists to get an audience to engage with a critical path network. But nothing in the
mathematics is softened for playability. The one concession is a difficulty floor: following the
resource plan yields SPI = CPI = 1.00, so a learner is never punished for doing the right thing.

### D2. Where is the model weakest?

Progress is linear within a package; real packages have learning curves and mobilisation ramps. The
55/45 resource-to-material cost split is global where it should vary by package. Quality is one
sample stream per gate rather than per block. Stakeholder satisfaction is a first-order lag on
weighted measures, which real people are not. And risk impacts are independent — there is no
correlation matrix between register entries, though the network correlation inside Monte Carlo is
real.

All five are listed in `docs/PROJECT_MANAGEMENT.md` §12. A model that hides its assumptions is not a
model.

### D3. Couldn't you have used real archaeological scan data?

The Harvard Giza Project and ScanPyramids hold exactly that. Two reasons not to. First, licensing
and file size: this had to be a single self-contained file. Second, and more importantly, scan data
shows the monument as it is *now* — eroded, stripped of its casing, with a nineteenth-century tourist
staircase. This simulator's subject is the monument **under construction in 2560 BCE**, which no
scan can show. A procedural reconstruction is the right tool for that question.

### D4. What would you do with another month?

In order: screen-space ambient occlusion, which would transform the depth of the block work;
cascaded shadow maps for the pyramid faces at range; moving Monte Carlo into a Web Worker; baked
ambient occlusion for the chambers; and a save/load system so a taught session can resume a project
mid-flight.

### D5. What is the single thing you would want the audience to take away?

That the critical path runs through the King's Chamber. Not as a fact about the Fourth Dynasty, but
as the moment when the discipline becomes visible: you stand inside a granite room, you learn that
nothing above it could be built until it was closed, and the abstract idea of a schedule constraint
becomes a place you are standing in.
