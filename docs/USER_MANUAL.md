# Digital Giza — User Manual

*An interactive digital twin of the Giza Necropolis and a full simulation of the construction of the
Great Pyramid of Khufu.*

---

## 1. Starting the simulator

Open `dist/GizaDigitalTwin.html` in **Chrome, Edge or Firefox**. Double-clicking the file works —
it needs no server, no installation and no internet connection.

The loading screen builds the world in nine stages: atmosphere, terrain, pyramids, the Sphinx and
temples, the quarry and harbour and town, scattered props, the pyramid's interior, the workforce,
and finally the torches. On a modern laptop this takes three to eight seconds; on an older machine
up to twenty.

If the graphics tier the engine picks is not what you want, add a URL parameter:

```
GizaDigitalTwin.html?quality=low
GizaDigitalTwin.html?quality=medium
GizaDigitalTwin.html?quality=high
GizaDigitalTwin.html?quality=ultra
```

**Before a presentation**, open the file once on the presentation machine and note the frame rate
(press `F`). If it is below 45, pin `?quality=medium` or `?quality=low` in the URL so the engine
never has to re-tier mid-demonstration.

---

## 2. Controls

### Movement

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| Mouse | Look (click the canvas first to capture the pointer) |
| `Shift` | Sprint / boost |
| `C` | Crouch — toggles, so you can stay down without holding a key |
| `Ctrl` | Crouch — hold |
| `K` | Sound on/off |
| `Space` | Jump (walking) / ascend (drone) |
| `Q` | Descend (drone) |
| `Alt` | Slow, precise flight (drone) |
| `E` | Interact — read a point of interest, enter or leave the pyramid |

The passages inside the pyramid are 1.20 m high. You **crouch automatically** when there is no
headroom and stand up again when there is; you do not need to hold a key.

### Interface

| Key | Action |
|---|---|
| `1` `2` `3` `4` | Archaeologist / Project Manager / Tour Guide / Drone |
| `Tab` | Open or close the dashboard |
| `Esc` | Close the top-most panel, or release the mouse |
| `H` | Hemiunu — the AI project advisor |
| `M` | Missions panel |
| `F` | Renderer statistics overlay |
| `?` | Controls card |
| `P` | Pause / resume the project simulation |
| `+` `−` | Simulation speed: paused, ×1, ×10, ×40, ×150 days per second |
| `[` `]` | Move the time of day back / forward half an hour |
| `N` | Jump between noon and night |
| `G` | Show or hide the construction ramp and scaffolding |
| `←` `→` | Previous / next beat in Tour Guide mode |

| `T` | Show or hide the on-screen touch controls |

### Touch devices

The touch layer appears by itself on a phone or tablet, and the first time a finger touches the
canvas on anything else. `T` forces it on or off — useful when you are presenting from a
touch-enabled laptop or projector.

| Gesture | Action |
|---|---|
| **Left thumb** | Virtual stick. It appears wherever you press; push past the ring and it follows your thumb |
| **Drag the right side** | Look |
| **Pinch, two fingers** | Zoom (Project Manager and Drone) |
| **Bottom-right buttons** | Jump, Run, Crouch and Enter on foot; Rise, Dive and Boost in the drone |
| **◀ ▶ at the top right** | Previous / next mode |
| **⏱ at the top right** | Simulation speed |

Crouch latches — tap it once to duck, again to stand. Everything else is momentary.

The dashboard is fully usable on a tablet: every control grows to a finger-sized target and the
panel takes the full width. On a phone the wordmark, the mode switch and the date and clock
metrics stand down to make room, because the mode arrows and the speed button on the touch layer
already do that job. In landscape the chrome shrinks again so the plateau keeps the screen.

### Saving and resuming

Open the **Session** panel from the rail. There are four slots — one automatic, three manual — and
the automatic slot is written every 500 simulated days. A save is a complete snapshot: the project
day, every work package, the resources, the risk register, the procurement contracts, the event
log and the random seed, so a restored run continues on exactly the same random stream it would
have followed. You can also copy a save out as text, or download it as a file, and paste or load it
back on another machine — useful if you build a scenario at your desk and present it from another
laptop.

---

## 3. The four modes

### 1 · Archaeologist

First-person exploration. Walk the plateau, climb the construction ramp, and go inside.

**Getting in.** Every pyramid entrance sits part-way up a 52-degree face, so each one has a stone
approach: a flight of steps from the ground to a landing at the threshold, marked by the relieving
chevrons over the doorway and a torch either side. Walk up it — the steps are ordinary steps, you
do not need to jump — and press `E` when the prompt appears. Press `E` again inside to come back
out, at whichever entrance you used.

There are five ways in:

| Entrance | Where |
| --- | --- |
| Great Pyramid — Original Entrance | north face, 16.9 m up, 7.3 m east of the axis |
| Great Pyramid — al-Ma'mun's Forced Entry | north face, 7 m up, the ragged hole |
| Pyramid of Khafre — Upper Entrance | north face, 11.5 m up |
| Pyramid of Khafre — Lower Entrance | in the pavement, 30 m north of the face |
| Pyramid of Menkaure | north face, 4 m up |

**Sound.** Wind, footsteps that change with what you are standing on, torch crackle, kites
overhead, the works in the distance, and the dead air of a sealed chamber. All of it is
synthesised — there are no audio files — so it costs nothing to download. `K` or the ♪ button in
the top bar turns it off; the setting is remembered. Browsers will not let a page make a sound
before you have clicked or pressed a key, so the first noise arrives a moment after you start.

**Inside.** Passages are 1.05 m wide and 1.20 m high; you crouch automatically and stand up again
when the ceiling allows. The Great Pyramid gives you the Descending Passage to the Subterranean
Chamber, the Ascending Passage to the Grand Gallery, the King's and Queen's Chambers and the
relieving chambers above. Khafre gives you the long horizontal run to Belzoni's burial chamber,
with its gabled roof and the sarcophagus sunk into the floor. Menkaure gives you the panelled
chamber, the main chamber, the six niches and the granite burial chamber under its barrel vault.

**The temples are open as well** — walk in through the gate, across the court and round the
colonnade. Khafre's valley temple has the granite hall with the emplacements of the twenty-three
seated statues.

**Finding things.** Forty-one **points of interest and relics** are scattered across the site,
inside the tombs and inside the temples. Walk within about twenty-five metres and a prompt
appears; press `E` to open the codex entry, which gives both the archaeology and the
project-management reading of what you are looking at.

Footprints follow you across the sand.

### 2 · Project Manager

An orbit camera over the whole site, with the dashboard as the primary interface. Left-drag to
orbit, right-drag to pan, wheel to zoom, `W`/`A`/`S`/`D` to pan.

This is where you run the project. The pyramid in front of you rises as the simulation advances:
its built height, its casing, its ramp, its scaffolding, the number of workers on site and the size
of the stone stockpile beside the ramp are all consequences of your decisions.

### 3 · Tour Guide

A fifteen-beat scripted camera tour with narration, cinematic letterboxing and a progress
indicator, covering the whole story of the project from survey to handover — including three beats
inside the pyramid.

It advances by itself, or you can drive it with `←` and `→`. **This is the presentation mode.**
Each beat carries a title, a paragraph of narration, and a one-line project-management point in
gold beneath it.

### 4 · Drone

Free six-degree-of-freedom flight with inertia and banking, for cinematic shots and for inspecting
the model. `Shift` boosts, `Alt` slows for fine framing.

---

## 4. The dashboard

Press `Tab`, or use the icon rail down the left edge. Twelve panels:

| Panel | What it shows |
|---|---|
| **Project Charter** | Scope statement, objectives, success criteria per domain, assumptions and constraints |
| **Work Breakdown Structure** | The full WBS tree with budget, float, percent complete and earned value roll-up. Click a package for its three-point estimate, dependencies, crew and quality gate |
| **Schedule** | Three tabs: a Gantt with the critical path in red and float shown dashed; an activity-on-node CPM network showing ES/EF/LS/LF and total float for every package; and PERT analysis with a crash-cost table you can act on |
| **Cost & Earned Value** | The complete EVM set — PV, EV, AC, SV, CV, SPI, CPI, three EAC formulas, ETC, VAC, TCPI — an S-curve, a control-account breakdown and the cost of quality |
| **Risk Register** | A probability/impact matrix and the twelve-entry register. Change any risk's response strategy from the dropdown and watch the exposure and the reserve move |
| **Resource Management** | Seven resource pools with sliders, live demand, fulfilment, and the baseline resource histogram with the levelling opportunity quantified |
| **Quality Management** | Quality gates against tolerance, statistical process-control charts with the upper control limit, and the inspection-level control |
| **Procurement** | The contract register: item, supplier, contract type and why, lead time, status |
| **Stakeholders** | The power/interest grid with live engagement levels, the register and the engagement strategies |
| **Monte Carlo Forecast** | Run four thousand iterations over the remaining network. P50/P80/P90 dates and costs, the distribution with its cumulative curve, and a tornado sensitivity chart |
| **Missions** | Six missions with objectives and success criteria |
| **Session** | Save, load, export, import and start a new project on a chosen seed |

---

## 5. Running the project

The simulation advances in whole days. At ×10 the whole twenty-year project takes about twelve
minutes of real time; at ×150 it takes under a minute.

### The one decision that matters most

Open **Resource Management**. By default **auto-levelling is ON**: each resource pool tracks the
day's demand plus five per cent. That is the resource-levelled plan, and following it produces
SPI ≈ 1.00 and CPI ≈ 1.00 by construction.

Turn it off and you take control. Understaff and you lose schedule; overstaff and you pay for
idle labour every single day, which is the fastest way to destroy CPI. The gap between a pool's
peak demand and its mean demand is printed under the histogram: that is exactly what resource
levelling is worth on this project.

### Risk

Every risk starts with a default response. Mitigating or transferring costs money now and reduces
the residual probability; accepting costs nothing and leaves the exposure. Total exposure (Σ EMV)
is the size of the contingency reserve, so if you accept everything you will exhaust the reserve
and have to escalate.

### Quality

Rushing degrades quality. If productivity is pushed above 100% — by overstaffing, or by crashing —
inspection samples drift toward the upper control limit, and a sample beyond it triggers rework:
part of the package is torn out and rebuilt, at 1.35× its budget rate. Raising the inspection level
costs appraisal money and prevents far more internal-failure money.

### Hemiunu

Press `H`. The advisor states the diagnosis, the root cause and a quantified recommendation, and
where it can it offers a button that applies it. He is not a black box: every conclusion he draws
is a rule over measures visible on the dashboard, and the Monte Carlo statement quotes the run you
can reproduce in the panel next door.

---

## 6. Missions

| Mission | Objective |
|---|---|
| **M1 Set Out the Base** | Complete the survey and levelling with SPI ≥ 0.95 and orientation within 0.12° |
| **M2 Open the Supply Lines** | Quarry, harbour and both stone contracts, at CPI ≥ 0.90 |
| **M3 Raise the Core** | Fifty courses with SPI ≥ 0.92, welfare above 60%, no more than two realised risks |
| **M4 Complete the King's Chamber** | The Grand Gallery and King's Chamber with SPI ≥ 0.95, CPI ≥ 0.90, beam seating within 10 mm |
| **M5 Dress the Horizon** | Apex and casing complete with a mean joint ≤ 1.6 mm and CPI ≥ 0.88 |
| **M6 Hand Over the Horizon** | Everything complete, SPI ≥ 0.90, CPI ≥ 0.85, all stakeholders Supportive or better |

---

## 7. Presenting this

A suggested twenty-minute structure:

1. **Open in Tour Guide mode** (`3`). Let the first two beats play — they establish the site and the
   scale. (2 minutes)
2. **Drive the tour manually** with `→` through the survey, quarry, harbour and town beats, pausing
   on the project-management line under each. (5 minutes)
3. **Stop at the interior beats.** The Grand Gallery and King's Chamber land hardest on an
   audience. (3 minutes)
4. **Switch to Project Manager** (`2`) and open **Schedule → CPM network**. Point out that the
   critical path runs through the King's Chamber they have just been standing in. (3 minutes)
5. **Open Cost & Earned Value.** Set speed to ×150 and let the S-curve draw itself. Stop it and read
   SPI, CPI and EAC off the panel. (3 minutes)
6. **Open Monte Carlo** and run it live. The gap between the deterministic date and P80 is the
   single most useful thing an audience takes away. (3 minutes)
7. **Press `H`** and read Hemiunu's diagnosis aloud. (1 minute)

Practical notes: press `F` beforehand and confirm the frame rate; keep the browser in full screen
(`F11`); `Esc` closes panels without leaving the mode; and the whole thing runs from a USB stick
with no network.
