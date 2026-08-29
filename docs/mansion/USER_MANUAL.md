# Bagh-e-Shahi Manor — User Manual

**Deliverable:** `dist/RoyalMansion.html` — one file, about 1.8 MB.
**To run it:** double-click it. That is the whole procedure.

There is no server, no build step, no npm install and no network request. Three.js
is vendored inside the file, every texture is generated from noise at start-up, and
every number in the dashboard is computed in the page. It opens from `file://`, from
a USB stick, from a shared drive, or from a laptop in a room with no internet.

**Supported browsers:** any current Chrome, Edge, Firefox or Safari with WebGL 2.
It falls back to WebGL 1 automatically. On a machine without a discrete GPU it will
detect the frame rate and drop a quality tier on its own; you can also pin the tier
in Settings, or on the URL: `RoyalMansion.html?quality=low`.

---

## 1. The first minute

When the page opens you are standing at the gate on the day the house is handed
over — day 516, everything built.

1. **Click the view.** That captures the mouse so you can look around. Press
   <kbd>Escape</kbd> to release it.
2. **Walk in** with <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>.
3. **Look at something and press <kbd>E</kbd>.** A door opens. A sofa is priced.
4. **Press <kbd>Tab</kbd>** for the project dashboard.
5. **Drag the slider at the bottom** to watch the house build itself.

Everything else is detail.

---

## 2. Controls

Every action has both a key and an on-screen control. Nothing here can only be
reached with a mouse, and nothing can only be reached with a keyboard. Press
<kbd>?</kbd> at any time for this list inside the model.

### Moving

| Key | Action |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Walk |
| <kbd>Shift</kbd> | Run |
| <kbd>C</kbd> or <kbd>Ctrl</kbd> | Crouch |
| Mouse | Look — click the view first to capture the pointer |
| Arrow keys | Look, without a mouse |
| <kbd>Space</kbd> | Rise (drone mode only) |
| <kbd>R</kbd> | Return to the gate |
| <kbd>J</kbd> | Jump to a room — 22 places, grouped by category |

Stairs are walked, not teleported: the collision resolver steps up anything under
about 300 mm, so the dog-leg flight, the basement stair and the plinth steps all
work as stairs. You cannot walk through a wall, off the plot, or into the pool.

### Interacting

| Key | Action |
|---|---|
| <kbd>E</kbd> | Open, close or inspect whatever you are looking at |
| <kbd>F</kbd> | Inspect it, whether or not it opens |
| <kbd>Escape</kbd> | Close the card, leave the tour, close a panel |

Look at anything and a prompt appears at the crosshair. Press <kbd>E</kbd> and one
of two things happens:

- **If it moves** — a door, a window sash, a garage door, the lift — it operates.
  Every leaf swings on its real hinge line through its real arc. There are 88 such
  movers.
- **If it does not move** — a sofa, a chandelier, a length of cornice, a marble
  floor — the camera frames it and an inspection card opens.

The card names the object, what it is made of, its dimensions, the work package
that bought it, the bill-of-quantities line it sits on, the rate, the quantity and
**the cost in rupees**. The "Show the package" button takes you straight to that
package in the dashboard, where you can see what else it paid for and whether it
finished on time.

### Modes and light

| Key | Action |
|---|---|
| <kbd>1</kbd> | Walk |
| <kbd>2</kbd> | Orbit the site |
| <kbd>3</kbd> | Guided tour of the finished house |
| <kbd>4</kbd> | Drone — free flight, <kbd>Space</kbd> up, <kbd>C</kbd> down |
| <kbd>5</kbd>–<kbd>9</kbd> | Dawn, day, golden hour, dusk, night |
| <kbd>G</kbd> | Guided tour of the construction |
| <kbd>X</kbd> | WBS X-ray |

The five times of day are real solar positions for Lahore (31.4805° N), not five
hand-picked tints. The sun is where it would actually be at that hour, so the
shadow the portico throws across the forecourt at five in the afternoon is the
shadow it would actually throw. Settings lets you set any hour and any day of the
year, and drag the cloud cover.

### The project

| Key | Action |
|---|---|
| <kbd>Tab</kbd> | Project dashboard |
| <kbd>P</kbd> | Play or pause the construction |
| <kbd>,</kbd> / <kbd>.</kbd> | One day back or forward |
| <kbd>[</kbd> / <kbd>]</kbd> | A fortnight back or forward |
| <kbd>Home</kbd> / <kbd>End</kbd> | Day 0 or handover |
| <kbd>O</kbd> | Settings and session |
| <kbd>?</kbd> | The controls card |

### Touch

On a tablet or a phone the left half of the screen is a look pad, the right half a
move pad, and the on-screen buttons cover interaction, modes and the dashboard.

---

## 3. The timeline

The strip along the bottom is the construction programme. Drag it and the building
is rebuilt for that day.

Nothing on the timeline is an animation. The model asks the schedule what fraction
of each work package is complete on the day you have chosen, and slides a cutting
plane through the geometry that package paid for. A wall that is 40 per cent built
is 40 per cent built because its package is 40 per cent earned. Change the schedule
— crash an activity, let a risk bite — and the building changes with it, because
there is no second source of truth.

**The bands under the slider** are the twelve phases, taken from the as-built
programme: for each day, the phase carrying the most active budget. Hover any band
and it names itself.

**The ticks** are the seven milestones, at the days the critical-path method put
them.

**The chips** under the slider are the packages actually in progress on the day you
are looking at, with their percentage complete. When the site is quiet the chip
tells you why — usually a curing lag written into the network, which is why the
model sometimes stands still for a fortnight after a pour.

**The header** carries the day, the phase, per cent complete, SPI, CPI, the
forecast at completion, and — while there is a site — how many people are on it and
what plant is standing.

### What you will see happening

- **Days 0–50.** Design, the soil investigation, and the LDA approval. Nothing can
  be dug until that approval is in hand, because the network makes it a predecessor
  of the excavation.
- **Around day 40.** Site clearance strips the plot to bare earth, the compound goes
  in — two cabins, stockpiles, a batching area — the boundary wall goes up, and the
  tower crane is erected on its base.
- **Days 55–75.** The dig. Fourteen hundred cubic metres out. Watch the formation
  drop lift by lift with the excavator working on it.
- **Days 75–175.** Blinding, the raft, the retaining walls, tanking, backfill, the
  ground slab. Long curing lags; the site empties during them.
- **Days 175–280.** The frame, floor by floor, the crane's mast climbing with it.
- **Days 280–340.** Masonry, then the façade. Masons on the wall line; the scaffold
  up; the crane lifting brick from the stockpile on a twenty-seven second cycle.
- **Days 340–450.** Services, plaster, marble, joinery, paint. The scaffold comes
  down as the cladding finishes; the crane is struck.
- **Days 450–516.** Fit-out, landscape, commissioning, snagging, handover.

---

## 4. The dashboard

<kbd>Tab</kbd>. Twelve tabs.

| Tab | What it holds |
|---|---|
| **Charter** | Scope, objectives, assumptions, constraints, exclusions, the success criteria |
| **WBS** | Nine control accounts, 61 work packages, budget and status for each |
| **Schedule** | The Gantt, the critical path, float, and the as-built against the baseline |
| **Cost** | PV / EV / AC over time, SV, CV, SPI, CPI, three EAC forecasts, ETC, VAC, TCPI |
| **BOQ** | All 122 bill-of-quantities lines: rate, quantity, unit, amount, package |
| **Risk** | 14 risks with probability, impact, EMV, response, owner and residual exposure |
| **Resources** | Eleven crews, the demand histogram, utilisation and over-allocation cost |
| **Quality** | Ten gates, what each inspects, whether it passed, and the rework it caused |
| **Procurement** | Six contracts, their type, value and the risk each places on which party |
| **Stakeholders** | Eight stakeholders on a power / interest grid, with an engagement strategy |
| **Monte Carlo** | Run the analysis: a PERT-beta simulation of the whole network, P10/P50/P80/P90, and a tornado of the activities that drive the spread |
| **Advisor** | What the numbers currently say, in words, with the arithmetic shown |

Selecting a work package anywhere highlights exactly the geometry it paid for, in
the model behind the panel. Close the dashboard and the highlight is still there.

### The one number to know

The budget is **PKR 39.70 crore**. It is not typed in anywhere. It is the sum of
122 bill-of-quantities lines, each of which is a rate times a quantity. Those lines
roll up into work packages, the packages into control accounts, and the accounts
into the budget. The BOQ panel reconciles to the budget exactly — the delta is
0.0000 rupees — because the budget *is* the sum, not a number that agrees with it.

The as-built run finishes on **day 516 against a baseline of 492**, and forecasts
**PKR 40.91 crore** at completion. The 24 days and the 1.21 crore both have causes
you can find: the schedule panel names the activities that spent the days, and the
risk panel names the events that spent the money.

---

## 5. WBS X-ray

<kbd>X</kbd>.

The finishes disappear and what is left is tinted by the system it belongs to:
substructure, structural frame, masonry, MEP services. Four systems, four colours.

Four, not nine, and that is deliberate. Past about seven simultaneous colour classes
no palette can keep them apart, and a palette that fails for a colour-blind reader
fails for a fifth of the room. The four hues used here are a validated categorical
set: every pair is separated under simulated protan and deutan vision as well as
normal vision on this surface — worst pair ΔE 15.5 simulated, 23.1 normal.
Everything else in the model is identified by name.

---

## 6. Guided tours

- <kbd>3</kbd> — **The finished house.** Fourteen beats from the gate to an aerial,
  through the portico, the foyer, the majlis, the dining room, the stair hall, the
  gallery, the master suite, the study and the pool.
- <kbd>G</kbd> — **The construction story.** Thirteen beats from a bare plot to
  handover. The tour moves the timeline as it goes, so the camera and the programme
  advance together.

Both have captions rather than narration, so they work with the sound off and read
on a projector. <kbd>Escape</kbd> to leave; the tour puts the day back where it
found it.

---

## 7. Settings

<kbd>O</kbd>.

- **Quality** — auto, or pin ultra / high / medium / low. Auto watches the frame
  rate and re-tiers.
- **Time** — any hour, any day of the year, cloud cover.
- **Session** — save and restore where you were, what day you were on, the light,
  and which doors you left open. Saves live in the browser; there is also an
  export/import so a session can be moved between machines.
- **Performance** — draw calls, triangles, frame time and the current tier.

---

## 8. Honest limitations

Read these before you present it.

- **The rates are illustrative, not a quotation.** They are an internally consistent
  model of high-end Lahore residential construction for 2025–26. They are not from a
  live tender. Every one of them lives in a single file (`mansion/src/pm/rates.js`)
  precisely so a real tender can replace them without touching anything else.
- **The as-built programme is simulated, not observed.** It is generated from the
  baseline by a seeded productivity drift, Bernoulli trials against each risk's
  residual probability, and quality-gate sampling. It is a defensible *model* of how
  this project would run; it is not a record of how it did run.
- **The plant is not solid.** You can walk through a crane mast or a scaffold
  standard. This is deliberate: a timeline scrub can move a crane while you are
  standing where it lands, and being sealed inside a lattice you cannot see out of
  is a worse failure than walking through one.
- **There is no global illumination.** Interior light is modelled — daylight
  admitted through the openings plus the electric installation — but it is modelled,
  not path-traced. It is calibrated to be legible, not photometric.
- **Simulated colour-vision checks are not user testing.** The palette passes the
  arithmetic. That is a floor, not a substitute for asking real readers.
