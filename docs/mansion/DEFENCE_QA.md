# Bagh-e-Shahi Manor — Defence Q&A

Questions a serious examiner will ask, and the honest answer to each. Where the
honest answer is a limitation, it is stated as one. A defence that hides its
weaknesses loses to the first person who finds one.

---

## On the project management

**Q. Where does the budget come from? Did you just pick a number?**

No. The budget is not entered anywhere. There are 122 bill-of-quantities lines, each
a rate times a quantity. Lines sum into 61 work packages, packages into 9 control
accounts, accounts into the project. PKR 39.70 crore is the result of that
summation. Open the BOQ panel: it reconciles to the budget with a delta of 0.0000
rupees, and it must, because the budget *is* the sum.

**Q. Are those rates real?**

They are an internally consistent illustrative model for high-end residential
construction in Lahore in 2025–26. They are not a verified quotation and I will not
claim they are. Every rate lives in one file, `mansion/src/pm/rates.js`, precisely so
that a live tender can replace the lot without touching another line of code. If you
hand me a real BOQ, the model re-costs itself.

**Q. Why 61 packages? Why nine control accounts?**

Because that is the level at which a house of this size is actually managed. Nine
accounts follow the standard elemental breakdown — preliminaries, substructure,
superstructure, envelope, MEP, finishes, FF&E, external works, commissioning. Below
that, a package is a thing one crew does with one predecessor logic and one budget.
Splitting further would be false precision; splitting less would hide the float.

**Q. Does the schedule use real precedence logic, or just finish-to-start?**

All four relations, with leads and lags. First-floor masonry starts on a
finish-to-start from the ground floor with a **negative** lag of six days, because
in practice the gangs overlap. The staircase has a start-to-start from the first
floor slab and a finish-to-finish against the roof slab. Curing lags are explicit —
twelve days after the raft pour before the retaining walls start — which is why the
site visibly stands still on the timeline after a pour, and why the workforce
disappears on those days.

**Q. Why is the project 24 days late and 1.2 crore over?**

Because the as-built run says so, and it says so for reasons you can find. The
schedule panel names the activities that spent the days. The risk panel names the
events that fired and what each cost. It is not a fudge factor.

**Q. Then is the as-built real?**

No, and this is the limitation to state before anyone finds it. The baseline is a
genuine CPM. The as-built is *generated* from it by a seeded model: a per-crew
productivity drift, a Bernoulli trial against each risk's residual probability, and
a quality-gate sample that adds rework where a gate fails. Then the same CPM is
re-run over the perturbed durations. It is a defensible model of how this project
would run. It is not a record of how it did.

**Q. Your SPI is 1.000 at completion. Isn't that meaningless?**

Yes, and that is exactly why earned schedule is in there too. SPI collapses to 1.0
at completion no matter how late a project was, because EV and PV both reach BAC. A
schedule index that always reads perfect at the end is worse than none. The cost
panel reports ES, SV(t) and SPI(t) alongside it, and SPI(t) does not flatter the
project.

**Q. Three EAC formulas — which one do you believe?**

Whichever the situation justifies, which is why all three are shown. BAC/CPI assumes
past cost performance continues. AC + (BAC − EV) assumes the remainder runs to
budget. AC + (BAC − EV)/(CPI × SPI) assumes schedule pressure keeps costing money.
For a project at CPI 0.971 that is behind on the critical path, the third is the one
I would report to a client, and it is the one the header shows.

**Q. What is contingency for, and what is management reserve for?**

Contingency (6.5 per cent, PKR 2.58 crore) is for identified risk — it is the sum of
the EMVs on the register, and it is drawn against when a risk fires. Management
reserve (3.5 per cent, PKR 1.39 crore) is for unknown unknowns and is *not* drawn
against by the model, because that is the distinction. Mixing them is the most common
error in student cost plans.

**Q. How many Monte Carlo iterations, and sampled how?**

Thousands, in about a second, in the page. Each activity is sampled from a PERT-beta
fitted to its three-point estimate, and the full network is rescheduled every
iteration — this is not a sum of independent activity durations, which would ignore
the network and give you a nonsense distribution. The panel reports P10/P50/P80/P90
and a tornado of the activities whose variance actually drives the spread. It is
fast because the CPM is compiled to flat typed arrays, so a reschedule is a loop over
integers.

---

## On the model

**Q. How do I know the building matches the schedule?**

Because it is not a separate thing. There is no animation track. For any day, the
model asks the project what fraction of each package is earned and slides a cutting
plane through the geometry that package paid for. Drag the slider and watch: the
façade cladding sweeps across the elevation because the façade package is being
earned, and it stops where the earned value stops.

Pick any object, press <kbd>E</kbd>, and the card names its work package. Click
"Show the package" and you are in the dashboard looking at that package's budget and
dates. Same identifier, both directions.

**Q. Did you model the walls by hand?**

No. Rooms are rectangles. Wall lines are computed as the union of room edges on each
axis line, split at every room corner. Each piece is built in three physical layers —
brick core, sandstone cladding, internal plaster or panelling — and each layer is
bought by a *different* package. That is why the model can show a bare brick shell
between the masonry package and the façade package: at that moment the brick has
been paid for and the stone has not.

**Q. How are the windows cut out? Boolean operations?**

Nothing is cut. A window is built as piers either side, a head panel above and a
sill panel below — omission, not subtraction. The interval arithmetic is in
`wallPieces()`. The result is watertight, has exact axis-aligned collision boxes,
and cannot produce the degenerate triangles a CSG boolean produces at grazing
angles. There is no CSG anywhere in the project.

**Q. Is the sunlight real, or is it five presets?**

Real solar geometry for 31.4805° N, 74.3239° E. Declination from day of year, hour
angle from solar time, altitude and azimuth resolved for the afternoon branch. The
five named times are five *hours*; Settings will give you any hour on any day of the
year. This matters: an architectural model whose light is invented cannot be used to
argue anything about orientation, glare or solar gain, and the reason the portico is
on the south elevation is that it shades the front rooms through the worst of a
Lahore afternoon — which you can verify by setting the hour and looking.

**Q. Why does the sky look different at dawn and at dusk if the sun is at a similar
altitude?**

Because it is a Preetham scattering model, not a colour ramp. Turbidity, the
Rayleigh coefficient and the Mie terms are all functions of solar elevation, and the
azimuth differs, so the two have genuinely different atmospheric character.

**Q. The interiors — how are they lit? There is no ray tracing here.**

Correct, and this was the hardest problem in the project. A real-time renderer has
no global illumination. A room whose only light is a directional sun outside it
renders black — the sun is occluded by the walls and nothing bounces. Measured, the
majlis wall was at 2 of 255 while the exterior sat at 120.

Raising the ambient light would have fixed the interior by wrecking the exterior,
which was correctly exposed. So the bounce is modelled and applied *geometrically*:
the interior is described as world-space boxes taken from the plan, and a fragment
inside one of them receives a fill term. The same wall gets it on its inside face and
not on the sunlit face outside. The term is divided by π so it is in the same units
as three.js's own ambient and hemisphere lights and the three can be reasoned about
together. Its colour is the sum of two modelled sources — daylight admitted through
the openings, and the electric installation, switched by exactly the same term that
turns the light fittings on, so the fill and the fittings can never disagree about
whether the lights are on.

**Q. Did that fix it on its own?**

No, and this is worth saying because it is the more interesting half. Measurement
showed the panelling material was at under **three per cent reflectance** — dark
walnut with a dark tint multiplied over it, darker than any real timber. No amount
of fill recovers a surface that dark. It is now a raised-and-fielded oak recipe at
about eighteen per cent, built as joinery: stiles and rails proud, a chamfer down
into each field, a quirk that reads as the shadow line. The lesson is that the
symptom was lighting and one of the two causes was material.

**Q. Are the cranes and workers real, or decoration?**

Driven by the programme. The crane is erected during package P4, *Boundary wall,
crane base & scaffolding*. Its mast climbs with the frame, using the same reveal
plane the building uses. It runs a real duty cycle — slew and trolley to the
stockpile, lower, hook on, hoist, slew to the work face, trolley in, lower, release,
hoist clear — over 27 seconds, and the load exists only between hooking on and
letting go. It is struck when the façade package finishes.

The workforce size is `siteHeadcount`, which the resource model derives from each
active package's budget, its duration, its crew's day rate and that rate's labour
content. Each figure is posted to a zone belonging to a package actually in progress
on that day. The masons on the wall line are laying brick because the masonry
package is being earned. Scrub to a curing lag and the site empties, because on that
day nothing is being earned.

**Q. Is the excavation a hole?**

It is the opposite, and deliberately. You cannot reveal a hole: cut the top off a box
and you are looking at the inside of a box, which is to say at nothing, and the sky
shows through the floor. So the dig is modelled as the earth that is *still there* —
a stack of thin lifts that the reveal plane takes away from the top down. Every stage
has a real ground surface because the lift under the plane still has its own top
face. The cut face of the surrounding ground is the same plane read the other way
round, so the two always meet exactly at the formation of the day.

**Q. Why can I walk through the crane?**

Deliberately. A timeline scrub can move a crane or strike a scaffold while you are
standing where it used to be. Being sealed inside a lattice mast you cannot see out
of is a worse failure than walking through one. It is a stated compromise, not an
oversight.

**Q. Why only four colours in the X-ray when there are nine control accounts?**

Because past about seven simultaneous colour classes no palette can keep them apart,
and one that fails for a colour-blind reader fails for a fifth of the room. Nine
accounts were tried and rejected. The four hues that remain — substructure, frame,
masonry, services — are a validated categorical set: every pair separated under
simulated protan and deutan vision as well as normal vision on this surface, worst
pair ΔE 15.5 simulated and 23.1 normal. Everything else in the model is identified
by name. That is the right answer to a palette problem: change the design, do not
force the palette.

**Q. Is that accessibility claim tested?**

It is *computed*, not user-tested, and I would not overstate it. The separation
arithmetic passes. That is a floor, not a substitute for asking real readers.

---

## On the engineering

**Q. Why one HTML file?**

Because it has to open on a machine you do not control, with no network, no install
and no permission from IT. Double-click and it runs. Three.js is vendored inside it,
every texture is generated from noise at start-up, and there is not one downloaded
image in the deliverable — which is exactly what makes the single file possible.

**Q. How do you keep 33 modules from colliding when you flatten them into one
scope?**

A static checker that fails the build. `tools/check-mansion.mjs` parses every module,
resolves every import, verifies every named export exists, and rejects any duplicate
top-level declaration. It caught six real collisions during development — two modules
each declaring `$`, a `schedule` in both the CPM and the furnishing code, a
`smootherstep` in two places. Each would have been a silent, catastrophic shadow in
the bundle. This is not a convention anyone can be trusted to keep by hand.

**Q. How is it tested?**

Two gates, both of which must pass before the file ships. The static checker above,
and a headless browser harness that boots the *built single file* from `file://` on
software WebGL and exercises it: 63 checks. Every door and window opened from both
its key and its on-screen control. Every priced object inspected, with no undefined
field. The BOQ reconciled to the budget at every sampled day. The timeline scrubbed
end to end. The crane checked to actually slew, trolley and hoist. The site checked
to be empty at handover — by traversing the scene graph, not by trusting the
module's own report. Collision checked at all 22 spawn points. And a leak check: a
full timeline scrub must allocate nothing, and it allocates nothing.

**Q. Have those checks ever caught anything?**

Repeatedly, which is the point — a harness that has never failed has never been
tested. Among them: the collision resolver mutating `pos.y` mid-loop, so a walker
spawned in the basement climbed a storey per frame and ended up on the ground floor;
a ground slab passing straight through the home cinema; a structural column planted
in the middle of the main entrance; a sky calibrated three times too bright; every
spawn point facing backwards. In the final pass it caught an instanced mesh left
visible with zero instances after the site was cleared — and a wrong assumption in
one of my own checks about the crane's scene-graph depth.

**Q. What is the performance, and how does it hold on a weak machine?**

292 draw calls and 128k triangles for the finished house, shadow and post passes
included, against a budget of 340 — and the busiest construction frame, with the plant,
the scaffold and the gangs all up at once, costs 257. Five quality tiers with adaptive re-tiering: it
watches the frame rate and steps down on its own. The biggest single win was
measured, not guessed — of 395 draw calls at one point, 190 were the shadow pass, so
window sashes and lift doors stopped casting and the low tier drops finish and
joinery casters entirely. A skirting board's shadow is not what anyone came to see.

**Q. Why merge the furniture if you still need to click on it?**

Because picking does not need the individual meshes. Furniture is merged by
`(material × work package)` — the package is in the key so the timeline can still
install the reception furniture on the day the FF&E package starts — and the
interaction system tests a ray against each object's own bounding box. A room's
contents are two or three draw calls instead of forty, and merging costs nothing in
interactivity.

**Q. Why is tone mapping done in the composite rather than by the renderer?**

Because doing it in both places is the classic way to end up with a washed-out sky.
The scene renders to a half-float target so the sun and the chandeliers can carry
values well above 1.0; `renderer.toneMapping` is `NoToneMapping`; ACES is applied
exactly once in the composite. The sRGB encode is manual in the same pass, because a
custom `ShaderMaterial` never receives three's colour-space chunk.

---

## The two questions to be ready for

**Q. What is the single weakest part of this project?**

The rates. Everything downstream of them — the budget, the EVM, the forecast, the
Monte Carlo — is arithmetic I can defend line by line. But it is arithmetic on
figures that are modelled rather than tendered. The structure is sound and the
inputs are replaceable in one file; that is the honest position.

**Q. What would you do next?**

Three things, in order. Replace the rate file with a live tender and re-run
everything. Add a second and third seeded as-built run so the model shows a spread
rather than one draw from the distribution the Monte Carlo already computes. And put
the palette in front of readers with actual colour vision deficiency, because
simulated separation is a floor and not a finding.
