# The Project Model

*How “Akhet Khufu” is modelled as a project, and every formula the simulator uses.*

This document is the academic core of the deliverable. It sets out the project definition, the
scheduling mathematics, the earned-value system, the risk quantification, the resource model, the
quality system and the probabilistic forecast — and states plainly where each is an idealisation.

---

## 1. Why the Great Pyramid is a project

The PMBOK definition of a project has four parts, and Akhet Khufu satisfies all of them.

| Criterion | Evidence |
|---|---|
| **Temporary** | It has a definite start (the accession of Khufu) and an end fixed by the sponsor's lifespan. Herodotus records twenty years; the reign is estimated at 23–26 years. |
| **Unique** | Nothing of the scale had been attempted. The two immediately preceding attempts — Meidum and the Bent Pyramid — both failed structurally and were redesigned mid-build. |
| **Produces a defined deliverable** | A true pyramid of specified base, height and orientation, with its complex. |
| **Progressively elaborated** | The internal chambers were relocated at least twice during execution. The abandoned Subterranean Chamber and the unfinished Queen's Chamber are the physical record of two approved scope changes. |

It also had what we would now call a project organisation: a named project director (Hemiunu, whose
title *jmj-r kꜣt nbt nt nswt* translates as "Overseer of all the King's Works"), a hierarchy of
overseers, a documented workforce organised into two crews of five phyles each, and written
accounts — the Merer papyri from Wadi al-Jarf are a boat captain's logbook recording deliveries of
Tura limestone to Giza, complete with dates and quantities. That is a progress report.

---

## 2. Scope — the work breakdown structure

Eight control accounts decompose into thirty-four work packages.

```
1.0 Site Preparation & Survey            5.0 Foundation & Core Construction
    1.1 Astronomical Survey                  5.1 Foundation Platform
    1.2 Plateau Levelling                    5.2 Core Courses 1–50    (0–65 m)
    1.3 Foundation Trenching                 5.3 Core Courses 51–120  (65–105 m)
                                             5.4 Core Courses 121–180 (105–130 m)
2.0 Quarry Development & Procurement         5.5 Core Courses 181–210 & Pyramidion Seat
    2.1 Local Limestone Quarry
    2.2 Tura Casing Stone Contract       6.0 Internal Chambers & Passages
    2.3 Aswan Granite Contract               6.1 Descending Passage & Subterranean Chamber
    2.4 Copper Tool Supply (Sinai)           6.2 Ascending Passage
                                             6.3 Queen's Chamber & Shafts
3.0 Logistics & Transport                    6.4 Grand Gallery
    3.1 Harbour Basin & Delivery Canal       6.5 King's Chamber & Relieving Chambers
    3.2 Barge Fleet Construction             6.6 Portcullis & Sealing System
    3.3 Causeway & Haulage Roads
    3.4 Construction Ramp System         7.0 Exterior Finish
                                             7.1 Casing Stone Dressing
4.0 Workforce & Settlement                   7.2 Casing Placement (top-down)
    4.1 Workers' Town                        7.3 Final Polishing & Pyramidion
    4.2 Provisioning
    4.3 Gang Organisation & Rotation     8.0 Complex & Closeout
    4.4 Medical & Welfare                    8.1 Mortuary Temple & Enclosure
                                             8.2 Causeway & Valley Temple
                                             8.3 Boat Pits & Royal Barques
                                             8.4 Queens' Pyramids G1-a/b/c
                                             8.5 Demobilisation & Handover
```

Every work package carries: a three-point duration estimate, a budget, a crew requirement per
resource pool, a predecessor list with dependency types and lags, a deliverable statement, and —
where one applies — a quality gate with a target and a tolerance.

The **100% rule** holds: the sum of the work packages is the whole of the project scope and no
more. BAC is their sum, not an independent number.

---

## 3. Schedule — the precedence diagram

### 3.1 Dependency types

All four PDM relationships are implemented, with leads and lags.

| Type | Constraint | Used for |
|---|---|---|
| **FS** finish-to-start | `ES_s ≥ EF_p + lag` | The default; 5.2 cannot start until 5.1 finishes |
| **SS** start-to-start | `ES_s ≥ ES_p + lag` | 1.2 Levelling starts 30 days after 1.1 Survey starts |
| **FF** finish-to-finish | `EF_s ≥ EF_p + lag` | 7.2 Placement cannot finish until 120 days after 7.1 Dressing finishes |
| **SF** start-to-finish | `EF_s ≥ ES_p + lag` | Supported for completeness |

A **negative lag is a lead**: `1.3 FS 1.2 −90` means trenching may begin ninety days before
levelling completes. That is fast-tracking, and the simulator honours it in execution as well as in
the plan — 1.3 becomes eligible once 1.2 is within ninety days of its finish.

### 3.2 Forward pass

For each activity in topological order:

```
ES = max over predecessors of:
        FS:  EF_p + lag
        SS:  ES_p + lag
        FF:  EF_p + lag − duration_s
        SF:  ES_p + lag − duration_s
EF = ES + duration
```

Project duration = max(EF).

### 3.3 Backward pass

In reverse topological order:

```
LF = min over successors of:
        FS:  LS_s − lag
        SS:  LS_s − lag + duration_p
        FF:  LF_s − lag
        SF:  LF_s − lag + duration_p
LS = LF − duration
```

### 3.4 Float

```
Total float TF = LS − ES = LF − EF
Free float  FF = min over successors of (ES_s − lag − EF_p), clamped to [0, TF]
Critical    ⟺  TF ≤ 0.5 days
```

### 3.5 The baseline critical path

```
1.1 → 1.2 → 1.3 → 5.1 → 5.2 → 6.2 → 6.3 → 6.4 → 6.5 → 5.3 → 5.4 → 5.5 → 7.2 → 7.3 → 8.5
```

**Baseline duration: 7 051 days ≈ 19.3 years.** Herodotus says twenty. The path is worth reading
carefully: it leaves core construction at 5.2, runs through the whole internal chamber sequence,
and only returns to the core at 5.3. That is because the courses above the King's Chamber cannot be
laid until its relieving stack is closed. **The critical path runs straight through the King's
Chamber**, which is why a seventy-tonne granite beam fracturing on the lifting frame is the single
most dangerous event in the register.

---

## 4. Estimating — PERT

Each package carries an optimistic (O), most likely (M) and pessimistic (P) duration.

```
Expected duration   te = (O + 4M + P) / 6
Standard deviation  σ  = (P − O) / 6
Variance            σ² = ((P − O) / 6)²
Path variance       Σσ² over the critical path
Z                   = (target − te_total) / √(Σσ²)
P(finish ≤ target)  = Φ(Z)
```

Φ is the standard normal CDF, evaluated with the Abramowitz & Stegun 26.2.17 rational
approximation (|error| < 7.5 × 10⁻⁸). The inverse — used for "duration at 80% confidence" — uses the
Beasley–Springer–Moro probit approximation.

**Critical-path σ for this project is 276.5 days.** So a schedule stated to the day is a fiction:
the honest statement is a date and a confidence.

### The merge bias

PERT analyses only the critical path. It therefore systematically *underestimates*, because a
near-critical path can become critical in any particular outcome. Monte Carlo over the whole
network gives the honest answer, and the difference between the two is displayed in the simulator
precisely so that it can be discussed.

---

## 5. Cost — earned value management

Costs are in **kilodeben of copper equivalent (kdb)**. One deben ≈ 91 g of copper. The Old Kingdom
had no coinage; state accounts were kept in grain, beer, linen and copper equivalents, and the
Merer papyri show quantities being tracked exactly that way. Using a single unit lets earned-value
analysis behave exactly as it does on a modern project.

**BAC = 2 898 800 kdb**, the sum of the thirty-four package budgets.

### 5.1 The three curves

```
PV(t)  Planned value  — the baseline S-curve, from the early-start schedule
EV(t)  Earned value   — Σ (budget_i × percent complete_i)
AC(t)  Actual cost    — resource cost accrued daily + material drawn with progress
                        + rework + risk response and impact
```

Note that **assigned labour is paid whether or not there is a work face for it**. That single
modelling decision is what makes resource levelling matter.

### 5.2 Variances and indices

```
SV  = EV − PV            SPI = EV / PV
CV  = EV − AC            CPI = EV / AC
```

### 5.3 Earned schedule

SPI has a well-known defect: as a project completes, EV → BAC and PV → BAC, so **SPI → 1.00 no
matter how late the project is**. Run the simulator to completion and you will see exactly that.
Earned schedule fixes it by expressing progress in time rather than money:

```
ES(t)   = the time at which the baseline planned to have earned the EV we have now
          (linear interpolation on the PV curve)
SV(t)   = ES − AT          (AT = actual time)
SPI(t)  = ES / AT
```

At the end of a run finishing 190 days late, SPI reads 1.000 while SPI(t) reads 0.974. Both numbers
are on the dashboard, side by side, deliberately.

### 5.4 Forecasting

```
EAC (atypical variance)   = AC + (BAC − EV)
EAC (typical variance)    = BAC / CPI
EAC (schedule-influenced) = AC + (BAC − EV) / (CPI × SPI)
ETC                       = EAC − AC
VAC                       = BAC − EAC
TCPI to BAC               = (BAC − EV) / (BAC − AC)
TCPI to EAC               = (BAC − EV) / (EAC − AC)
```

All three EAC formulas are displayed at once. Choosing between them is a management judgement about
whether the variance to date is representative of the future, and the panel says so.

---

## 6. Risk

### 6.1 The register

Twelve risks, each with a cause, a probability, a cost impact, a schedule impact, an affected-package
list, a response strategy, a residual probability, a trigger condition and an owner.

```
EMV                = probability × cost impact
Contingency reserve = Σ EMV over the register  = 88 812 kdb
Management reserve  = 10% of BAC               = 289 880 kdb
```

The distinction matters and the simulator enforces it: contingency covers **identified** risks and
is spent automatically as they occur; management reserve covers **unknown unknowns** and requires
an explicit escalation, which the advisor tells you to make *before* the contingency is gone.

### 6.2 Responses

| Strategy | Effect on probability | Cost |
|---|---|---|
| **Avoid** | drops to 25% of residual | 30% of impact |
| **Mitigate** | drops to residual | 12% of impact |
| **Transfer** | drops to residual | 18% of impact (a premium) |
| **Accept** | unchanged | none |

### 6.3 Realisation

Register probabilities are stated **for the whole project**, so the daily hazard is

```
seasonal risk:      λ = p / (season length × project years)
non-seasonal risk:  λ = p / baseline duration
```

A realised risk draws from the reserve, reduces productivity on the packages it affects for a
sampled number of days, and where appropriate hits stone stock, tool supply, welfare or safety
directly.

### 6.4 The register itself

| ID | Risk | P | Impact (kdb) | Schedule | Default response |
|---|---|---|---|---|---|
| R-01 | Nile inundation fails or runs low | 0.22 | 42 000 | 150 d | Mitigate |
| R-02 | Excessive flood destroys the harbour | 0.14 | 26 000 | 90 d | Accept |
| R-03 | Core stone shortage at the quarry face | 0.34 | 31 000 | 120 d | Mitigate |
| R-04 | Epidemic in the workers' town | 0.19 | 24 000 | 110 d | Mitigate |
| R-05 | Khamsin sandstorm season | 0.42 | 8 600 | 35 d | Accept |
| R-06 | Granite beam fractures during lifting | 0.16 | 58 000 | 200 d | Mitigate |
| R-07 | Grand Gallery corbel settlement | 0.12 | 71 000 | 240 d | Mitigate |
| R-08 | Provincial levy shortfall | 0.24 | 36 000 | 130 d | Transfer |
| R-09 | Copper tool supply interrupted | 0.21 | 17 000 | 70 d | Mitigate |
| R-10 | Barge foundering with cargo | 0.18 | 22 000 | 60 d | Mitigate |
| R-11 | Royal scope change to the burial chamber | 0.30 | 64 000 | 180 d | Accept |
| R-12 | Ramp collapse under load | 0.15 | 27 000 | 95 d | Mitigate |

R-11 is the interesting one. It cannot be mitigated — the sponsor is the king — so it is accepted
with a change reserve. And it is not hypothetical: the abandoned Subterranean Chamber and the
unfinished Queen's Chamber are what an approved scope change looks like when it is carved in stone.

---

## 7. Resources

Seven pools: quarry gangs, haulage gangs, setting masons, dressers and artisans, surveyors and
scribes, river barges, copper tool sets.

### 7.1 The resource plan is derived, not invented

The per-package crew figures are relative weights. At load time the simulator:

1. builds the **baseline resource histogram** — daily demand per pool from the early-start schedule;
2. finds the peak total workforce and rescales every crew figure so that peak lands on
   **21 000 people**, matching Lehner's estimate of 20 000–25 000;
3. sets each pool's recommended staffing to **its own peak demand**;
4. calibrates the day rates so that following the levelled plan for the baseline duration spends
   exactly the resource share of BAC.

The consequence is precise and pedagogically useful: **a manager who follows the plan sees
SPI = CPI = 1.00, and every variance is theirs.** Resulting peak: 23 429 across all pools.

### 7.2 Productivity

For each eligible package:

```
staffing = min over its required pools of (assigned / required)
           above 1.0, extra staffing yields diminishing returns:
           staffing = 1 + (f − 1) × 0.42                        [Brooks]

productivity = clamp(staffing × season × welfare × supply × tools × events, 0, 1.25)
```

Each modifier equals 1.0 at its planned condition and only penalises below it:

```
season   Akhet 1.06 (farm labour is free during the flood), Peret 1.00, Shemu 0.96
welfare  0.50 + min(1, welfare / 0.82) × 0.50
supply   0.45 + min(1, stone stock / 0.72) × 0.55
tools    0.62 + tool availability × supply-contract readiness × 0.38
events   Π over active realised risks of (1 − min(0.34, schedule impact / 620))
```

### 7.3 Welfare and safety

```
welfare target = 0.28 + 0.30·provisioning + 0.12·housing + 0.10·medical
                      + 0.10·rotation + 0.24·(1 − crowding) − min(0.30, recent incidents × 0.05)

crowding = assigned workers / (W × (0.20 + 0.62·provisioning + 0.26·housing))
```

Welfare moves toward its target with a two-per-cent-per-day lag, which is why adding people to an
under-provisioned site makes things worse for months before it makes them better.

---

## 8. Quality

Seven work packages carry a quality gate with a target and a tolerance:

| Package | Metric | Target | Tolerance |
|---|---|---|---|
| 1.1 Astronomical Survey | orientation | 0.06° from true north | 0.12° |
| 1.2 Plateau Levelling | level | 2.1 cm max deviation | 4.0 cm |
| 5.1 Foundation Platform | squareness | 4.4 cm corner error | 8.0 cm |
| 6.1 Descending Passage | alignment | 6 mm deviation | 20 mm |
| 6.4 Grand Gallery | corbel step | 7.6 cm per corbel | 12 cm |
| 6.5 King's Chamber | beam seating | 3 mm bearing gap | 10 mm |
| 7.1 Casing Dressing | joint | 0.5 mm mean joint | 1.6 mm |

The targets are the measured values. Petrie's 1883 survey found the base square accurate to about
two centimetres over 230 metres, the platform level to 2.1 cm across five hectares, the orientation
within three minutes six seconds of arc, and the casing joints averaging half a millimetre over
surfaces two and a half metres square.

### Statistical process control

Inspection samples are drawn as work proceeds:

```
sample = target × (1 + pressure × control × 0.9 + noise × control × 0.35)
pressure = max(0, productivity − 1) × 1.8 + max(0, 0.85 − welfare) × 1.2
control  = 1 / inspection level
```

A sample beyond the tolerance is a special-cause signal: the affected fraction of the package is
torn out and rebuilt, at 1.35× its budget rate, charged to internal failure and to the schedule.

### Cost of quality

Prevention and appraisal accrue continuously and scale with the inspection level; internal failure
accrues on rework; external failure is reserved for defects surviving to handover. The rule the
panel is designed to demonstrate holds in the model as it does in practice: appraisal costs roughly
a tenth of the internal failure it prevents.

---

## 9. Procurement

| ID | Item | Contract type | Why that type |
|---|---|---|---|
| PC-01 | Tura casing limestone | Fixed price | Quantity and specification both known |
| PC-02 | Aswan red granite | Cost plus fixed fee | Nobody can price the extraction of a 70 t monolith firm |
| PC-03 | Copper chisels and picks | Unit price | A consumable with a standing stock obligation |
| PC-04 | Lebanese cedar | Fixed price | A diplomatic contract with Byblos, paid in kind |
| PC-05 | Dolerite pounders | Unit price | Pure consumable: ~2 kg lost per m³ of granite dressed |

Contract type follows risk allocation. That is the whole of procurement management in one table,
and it was as true in the Fourth Dynasty as it is today.

---

## 10. Stakeholders

Seven stakeholders on a power/interest grid, each with a current and a desired engagement level on
the standard five-point scale (Unaware, Resistant, Neutral, Supportive, Leading) and a set of
drivers that determine how their satisfaction responds to project performance.

| Stakeholder | Power | Interest | Driven by |
|---|---|---|---|
| Khufu — the sponsor | 5 | 5 | SPI 0.5, quality 0.3, scope stability 0.2 |
| Hemiunu — project director | 5 | 5 | SPI 0.35, CPI 0.35, quality 0.3 |
| Priesthood of Ra | 4 | 4 | quality 0.6, scope 0.4 |
| Provincial nomarchs | 4 | 3 | welfare 0.5, CPI 0.3, SPI 0.2 |
| The work gangs | 3 | 5 | welfare 0.7, safety 0.3 |
| Master of the Quarry | 3 | 4 | SPI 0.5, welfare 0.25, CPI 0.25 |
| Guild of Royal Boatmen | 2 | 4 | CPI 0.5, SPI 0.5 |

The gangs are worth noting. Their power is only 3, but productivity is *directly* their morale, and
the first recorded labour action in history — the Deir el-Medina strike of 1157 BCE, under Ramesses
III — was over late ration deliveries. Stakeholder management is not a soft skill here; it is the
throughput model.

---

## 11. Monte Carlo

Four thousand iterations over the remaining network. Each iteration:

1. Samples every incomplete package's duration from the **PERT-beta** fitted to its three-point
   estimate:

   ```
   α = 1 + 4(M − O)/(P − O)      β = 1 + 4(P − M)/(P − O)
   duration = O + Beta(α, β) × (P − O)
   ```

   Beta variates are drawn from two Gamma variates using Marsaglia–Tsang.

2. Rolls each register risk as a Bernoulli trial against its current (post-response) probability
   over the remaining exposure, and distributes its schedule impact across the packages it affects.

3. Re-runs the **entire CPM network**, so correlation through the network is captured rather than
   assumed away.

Outputs: the completion-date distribution with P10/P50/P80/P90 and its cumulative curve, the cost
distribution, the probability of meeting the baseline, and a tornado chart ranking packages by the
Pearson correlation between their sampled duration and the project finish date.

### What to do with it

The deterministic schedule says day 7 051. The analysis typically gives a P50 near day 7 750 and a
P80 near day 8 000 — and a probability of hitting the deterministic date in the low single figures.
That is not pessimism; it is the merge bias made visible. The recommendation the simulator puts in
the sponsor's mouth is the correct one:

> “Commit to the P80 date, fund to the P80 cost, and understand that the difference between that and
> the deterministic estimate is not padding — it is the price of the uncertainty we have already
> identified and written down.”

---

## 12. Known idealisations

Stated plainly, because a model that hides its assumptions is not a model.

1. **Progress is linear within a package.** Real packages have learning curves and mobilisation
   ramps. The three-point estimate absorbs some of this; the day-by-day shape does not.
2. **Cost is split 55 / 45 between resource time and material.** A single global split; in reality
   it varies enormously between, say, surveying and granite haulage.
3. **Quality is modelled per metric, not per block.** One representative sample stream per gate.
4. **Stakeholder satisfaction is a first-order lag on weighted performance measures.** Real
   stakeholders are not first-order systems.
5. **Risk impacts are independent.** No correlation matrix between register entries, though the
   network correlation in Monte Carlo is real.
6. **The historical figures are estimates.** Block count, workforce size and duration are all
   scholarly reconstructions, not records. Where sources disagree the simulator uses Lehner's
   figures and says so.

None of these affect the pedagogy: every formula above is the standard one, applied correctly, and
the reader can check any of them against the numbers on the dashboard.

---

## 13. Sources

- Lehner, M. — *The Complete Pyramids* (Thames & Hudson, 1997)
- Lehner, M. & Hawass, Z. — *Giza and the Pyramids* (Thames & Hudson, 2017)
- Arnold, D. — *Building in Egypt: Pharaonic Stone Masonry* (Oxford, 1991)
- Petrie, W. M. F. — *The Pyramids and Temples of Gizeh* (1883)
- Tallet, P. — *Les papyrus de la mer Rouge I: Le journal de Merer* (IFAO, 2017)
- Project Management Institute — *A Guide to the Project Management Body of Knowledge*, 6th and 7th editions
- Project Management Institute — *Practice Standard for Earned Value Management*, 2nd edition
- Lipke, W. — *Earned Schedule* (2009)
- Vanhoucke, M. — *Measuring Time: Improving Project Performance using Earned Value Management* (Springer, 2009)
