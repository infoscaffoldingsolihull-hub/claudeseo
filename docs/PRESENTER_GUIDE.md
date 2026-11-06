# Presenter Guide — SKY GATEWAY HYDERABAD

Two scripted demos (7 and 15 minutes), talking points per learning outcome, and a fallback plan.
Everything runs from `dist/Hyderabad_Airport_PM_Simulator.html` — double-click it; no internet needed.

## Before you start (2 minutes, off-stage)

| Step | How |
|---|---|
| Open the file | Chrome or Edge, full screen (F11). Add `?quality=high` on a gaming laptop, `?quality=medium` on a normal laptop, `?quality=low` on an old projector PC. |
| Fix the scenario | Add `&seed=20270104` so the same decision events appear every time you rehearse. |
| Skip the tutorial | Click **Skip** on the onboarding card, or add `&skipintro`. |
| Projector text | Session & Settings → Accessibility → **Conference mode** (large text). |
| Sound | Press **K** to toggle. Narration voice: Session & Settings → Audio → Narration. |

Example: `Hyderabad_Airport_PM_Simulator.html?quality=high&seed=20270104&skipintro`

## Keys you need on stage

| Key | Does |
|---|---|
| 1 / 2 / 3 / 4 / 5 | Site Walk · Project Manager · Guided Tour · Drone · Operations |
| ← / → | Previous / next tour beat |
| Tab | Open / close the dashboard |
| H | MEHRAN, the AI project manager |
| B / R / C | Agile board · Presentation Studio · Change request |
| P | Pause / resume (in Photo mode: save PNG) |
| + / − | Simulation speed (Paused, ×1, ×10, ×50, ×200 days per second) |
| [ / ] / N | Time of day back / forward / night toggle |
| X | Photo mode (Drone) · G orbit-cam around the selected element |
| E | Inspect a work package (Site Walk) |
| ? | Full control card |

## 7-minute demo

| Time | Do | Say (learning outcome) |
|---|---|---|
| 0:00 | Boot screen → Project Manager overview (2). | "Hyderabad Airport, HDD/OPKD: a 2,133 m runway that has had no commercial flights since 2013. Press reports describe a proposed revival with a longer runway. Every budget and schedule here is simulated." (CLO1) |
| 0:45 | Press **3**: tour beats *dawn-gateway* → *business-case*. | Charter, business case, phase gates. (CLO1) |
| 1:45 | Press **2**, then **Tab** → **Schedule** → Gantt, then **Network (AON)**. | "Seventy-seven work packages; the critical path runs through the terminal and certification. All four dependency types." (CLO2) |
| 2:45 | Speed **×200** (press + until it shows). Let a decision card appear; pick an option and read the trade-off chips aloud. | "Every choice trades time, cost, quality, risk, stakeholders, safety and scope." (CLO2/3) |
| 3:45 | **Cost** panel → S-curve and the EVM table. | "SPI, CPI, four EAC formulas, TCPI — all live." (CLO2) |
| 4:30 | **H** → ask *"why are we behind?"* then click a recommended action → approve. | "MEHRAN is a transparent rule engine; nothing changes without a human approval click." (CLO1, AI in PM) |
| 5:30 | **4** Drone over the runway extension; **N** for night lights. | "WBS progress drives what you see: earthworks, sub-base, base, surface, then the lights." |
| 6:30 | **R** Presentation Studio → slide summary. | Close on the scorecard mapped to CLO1/2/3. |

## 15-minute demo

Run the 7-minute script, then add:

| Time | Do | Say |
|---|---|---|
| 7:00 | **Risk** panel → heat map → respond to *Land encroachment* (mitigate). **Forecast** → run Monte Carlo (5,000 iterations). | Qualitative vs quantitative risk; P50 vs P80; tornado drivers. (CLO2) |
| 9:00 | **B** Agile board → Scrum and Kanban tabs, burndown. | Hybrid delivery: predictive civil works, Scrum for terminal IT. (CLO1/2) |
| 10:30 | **C** change request "Widen to Code E" → impact analysis → CCB votes → approve. | Integrated change control and re-baselining. (CLO1/2) |
| 12:00 | **Stakeholders** → power/interest grid; engage the residents group. **Procurement** → weighted bid scoring. | Engagement and contracts. (CLO3) |
| 13:30 | **1** Site Walk into the terminal; **E** at a POI → "Raise NCR". Then **5** Operations (instructor role) for benefits. | Quality on site; benefits realisation after handover. (CLO2/3) |
| 14:30 | **Assessments** → one numeric EVM question → wrong answer → "Explain". | Assessment and AI tutoring. |

## Talking points per learning outcome

* **CLO1 — concepts & frameworks:** Course Map, Foundations (project/programme/portfolio, PMO types, EEFs), Lifecycle (5 focus areas, gates), Delivery Approach, Charter.
* **CLO2 — quantitative tools:** Schedule (CPM/PERT/crashing), Cost (EVM), Risk (EMV, decision tree), Forecast (Monte Carlo), Quality (control charts, Pareto).
* **CLO3 — people & procurement:** Team (RACI, Tuckman, conflict), Stakeholders (grid, salience, comms channels n(n−1)/2), Procurement (contract types, make-or-buy, scoring).

## Fallback plan

| Problem | Fix |
|---|---|
| Low frame rate | Reload with `?quality=low`; or Session & Settings → Graphics → turn off motion blur, depth of field, SSAO. The engine also re-tiers on its own. |
| No internet | Nothing changes: the simulator is fully offline. MEHRAN uses its offline engine (amber status light). |
| Live AI wanted | MEHRAN → settings → paste your own Anthropic API key (kept for this browser session only). Any network error falls back to offline automatically. |
| Projector too small | Conference mode; or browser zoom (Ctrl +). |
| A decision card is in the way | Choose any option; the clock resumes. |
| You lost your place | Session & Settings → load the slot you saved before the talk. Save one during rehearsal. |
