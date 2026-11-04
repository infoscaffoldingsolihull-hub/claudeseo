# Historical Basis and Sources

*What is measured, what is reconstructed, and where each figure comes from.*

This document exists so that any claim the simulator makes can be traced. Where the archaeology is
uncertain, it says so.

---

## 1. Survey data used in the model

All figures are in metres. Source column: **P** = Petrie 1883, **L** = Lehner 1997/2017,
**A** = Arnold 1991, **D** = Dorner 1981.

### The three pyramids

| Monument | Base | Design height | Slope | Courses | Volume | Source |
|---|---|---|---|---|---|---|
| Khufu (Great Pyramid) | 230.33 m | 146.6 m | 51° 50′ 40″ | 210 | 2 583 283 m³ | P, L |
| Khafre | 215.25 m | 143.5 m | 53° 07′ 48″ | ~200 | 2 211 096 m³ | L |
| Menkaure | 102.2 m | 65.0 m | 51° 20′ 25″ | ~95 | 235 183 m³ | L |

Khufu's base is square to within about 2 cm over 230 m; the platform is level to within 2.1 cm
across the whole 5.3-hectare base; the orientation error from true north is 3′ 6″ (P, D).

Khafre retains its original Tura casing over roughly the top third — modelled as a casing cap over
31% of the height. Menkaure's lowest sixteen courses were cased in Aswan granite and never
finished — modelled as a granite skirt.

### Interior of the Great Pyramid (all P, with L)

| Feature | Dimension |
|---|---|
| Original entrance | 16.9 m above base, 7.29 m east of the N–S axis |
| Passage section | 1.05 m wide × 1.20 m high |
| Passage angle | 26° 31′ 23″ |
| Descending Passage | 105.15 m, straight to within ~6 mm over its length |
| Subterranean Chamber | 14.0 × 8.26 m, ~30 m below the base, floor unfinished |
| Ascending Passage | 39.27 m |
| Horizontal Passage | 38.7 m |
| Queen's Chamber | 5.75 × 5.23 m, 4.67 m to the eaves, 6.23 m to the gable apex |
| Grand Gallery | 46.68 m long, 8.74 m high, 2.06 m → 1.04 m over 7 corbels |
| Antechamber | 3.15 × 1.55 × 3.75 m, three granite portcullis slabs |
| King's Chamber | 10.47 × 5.23 × 5.97 m, red Aswan granite |
| Roof beams | nine, the largest ~70 t, lifted 43 m |
| Relieving chambers | five, above the King's Chamber, gabled limestone roof |
| Sarcophagus | 2.28 × 0.98 × 1.05 m, lidless, granite |
| Air shafts | ~0.21 m square; King's at 32.6° N and 45.0° S; Queen's sealed both ends |

The entire passage system lies in one vertical plane 7.29 m east of the pyramid's north–south axis.
The simulator preserves that: it is one of the details that most surprises visitors.

Al-Ma'mun's forced tunnel, cut around 820 CE, is included as a second entrance.

### The Sphinx (L)

73.0 m long, 20.2 m high, 19.3 m wide at the body, head about 11.5 m wide. Carved in place from a
knoll of Mokattam limestone left standing in Khafre's quarry. Faces due east. The enclosure floor
sits about 8.5 m below plateau level.

### The complex

| Structure | Position (relative to Khufu's centre) | Source |
|---|---|---|
| Khafre pyramid | 252 m west, 418 m south | L |
| Menkaure pyramid | 594 m west, 862 m south | L |
| Sphinx | 336 m east, 522 m south | L |
| Khafre valley temple | 404 m east, 596 m south, 44.6 × 44.5 m | Hoelscher, L |
| Sphinx temple | 404 m east, 520 m south | L |
| Khufu mortuary temple | 168 m east, basalt-paved | L |
| Queens' pyramids G1-a/b/c | 152 m east, 49.5 / 49.0 / 46.9 m base | L |
| Central Field quarry | ~268 m east, 366 m south, ~300 × 260 m, ~13.5 m deep | L |
| Heit el-Ghurab (workers' town) | ~300 m east, ~1 010 m south | L, AERA |
| Wall of the Crow | north of the town, ~196 m long, ~10 m high | AERA |
| Boat pits | five; the Khufu ship pit 32 m long on the south side | L |

Positions of the subsidiary structures are simplified from the Giza plateau plan. The **Khufu valley
temple** lies under the modern village of Nazlet el-Samman and is only partially known; its plan
here is generic.

---

## 2. Workforce and logistics

| Claim | Basis |
|---|---|
| ~20 000–25 000 workers at peak | Lehner, from the town's provisioning capacity and the gallery count |
| ~1 600 in the dormitory galleries | AERA excavation of Heit el-Ghurab |
| Two crews of five phyles each | Gang names painted in the relieving chambers |
| Three-month rotation from the nomes | Merer papyri; administrative parallels |
| Paid, fed, housed, medically treated | Bakeries and breweries at scale; cattle bone from Delta herds; healed fractures and set bones in the skeletal record |
| ~90% of core stone from the local quarry | Lehner; the Central Field quarry geology |
| Tura casing shipped across the river during Akhet | Merer papyri record exactly these deliveries |
| Aswan granite floated ~900 km downstream | Standard; the granite is petrologically Aswan |
| Copper chisels and dolerite pounders | Arnold; tool finds and quarry tool marks |
| Sledges on watered, gypsum-sealed roads | Arnold; the Djehutihotep relief; friction experiments |
| ~20 years' construction | Herodotus; consistent with Khufu's reign length |

The **Merer papyri**, found at Wadi al-Jarf and published by Pierre Tallet, are the closest thing we
have to a project record: a boat captain's logbook recording dated round trips carrying Tura
limestone to Giza, with quantities. They are the single most important source for the logistics
model, and the reason the simulator treats the inundation window as a hard external constraint.

---

## 3. What is reconstruction

The simulator is explicit about the difference between evidence and inference.

| Feature | Status |
|---|---|
| **The construction ramp** | **No ramp survives.** The model shows a straight south ramp for the lower third plus wrapping side ramps, chosen because a straight ramp to the apex would need more material than the pyramid. Internal-spiral and lever-lifting reconstructions also exist; none is proven. |
| **Scaffolding and lifting frames** | Conjectural, following Arnold's analysis of lever and rocker methods. |
| **The Khufu valley temple plan** | Largely unexcavated; generic Old Kingdom plan used. |
| **Worker figures, gangs and routes** | Illustrative. The workforce size, town plan and rotation are evidenced; the individual figures are not. |
| **Surface colour and weathering** | Inferred. |
| **Torch placement** | Illustrative. Lamp evidence exists (soot-free wick lamps), but not a lighting plan. |
| **The barge fleet** | Sized from the Khufu ship and from Merer's cargo figures; hull form follows the reassembled Khufu ship. |
| **Interior of the relieving chambers** | Geometry from survey; the crawl route from the Grand Gallery follows the 1765 Davison route. |

---

## 4. Where the simulator deliberately departs from the evidence

1. **The pyramid rises during play.** No single moment in history looked like a half-built Great
   Pyramid with a completed Khafre beside it. The scene is a *project state*, not a photograph of a
   date.
2. **Khafre and Menkaure are shown complete throughout.** They were built after Khufu. They are
   context, not subject, and showing them complete keeps the site legible.
3. **The Sphinx is shown throughout.** Its dating is debated; most scholars attribute it to Khafre,
   which would post-date this project.
4. **The casing is dressed top-down during play.** Correct in method, but compressed in time so it
   reads on screen.
5. **Time of day is a free control.** Obviously.

These are presentation choices, and a presenter should say so.

---

## 5. Bibliography

**Archaeology and construction**

- Lehner, M. *The Complete Pyramids*. Thames & Hudson, 1997.
- Lehner, M. and Hawass, Z. *Giza and the Pyramids: The Definitive History*. Thames & Hudson, 2017.
- Arnold, D. *Building in Egypt: Pharaonic Stone Masonry*. Oxford University Press, 1991.
- Petrie, W. M. F. *The Pyramids and Temples of Gizeh*. Field & Tuer, 1883.
- Dorner, J. *Die Absteckung und astronomische Orientierung ägyptischer Pyramiden*. Innsbruck, 1981.
- Tallet, P. *Les papyrus de la mer Rouge I: Le journal de Merer*. IFAO, 2017.
- Hoelscher, U. *Das Grabdenkmal des Königs Chephren*. Hinrichs, 1912.
- Ancient Egypt Research Associates (AERA), excavation reports on Heit el-Ghurab.

**Project management**

- Project Management Institute. *A Guide to the Project Management Body of Knowledge (PMBOK Guide)*,
  6th ed. (2017) and 7th ed. (2021).
- Project Management Institute. *Practice Standard for Earned Value Management*, 2nd ed., 2011.
- Project Management Institute. *Practice Standard for Scheduling*, 3rd ed., 2019.
- Lipke, W. *Earned Schedule*. Lulu, 2009.
- Vanhoucke, M. *Measuring Time: Improving Project Performance using Earned Value Management*.
  Springer, 2009.
- Hulett, D. *Practical Schedule Risk Analysis*. Gower, 2009.

**Graphics and technique**

- Preetham, A. J., Shirley, P. and Smits, B. "A Practical Analytic Model for Daylight". SIGGRAPH 1999.
- Narkowicz, K. "ACES Filmic Tone Mapping Curve". 2016.
- Marsaglia, G. and Tsang, W. W. "A Simple Method for Generating Gamma Variables". ACM TOMS, 2000.
- Abramowitz, M. and Stegun, I. *Handbook of Mathematical Functions*, §26.2.17.
