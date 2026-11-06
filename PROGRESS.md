# PROGRESS — SKY GATEWAY HYDERABAD (loop source of truth)

Resume here after any context reset. Contract: `docs/ARCHITECTURE.md`. Brief: the uploaded swarm prompt.

## Status
Iteration 1 complete — all phase-1 and phase-2 agents delivered and integrated; acceptance suite green.

## Known input gaps (honest)
* `reference/COURSE_OUTLINE.txt` was **not supplied**. The 15-week plan, CLO wording and objectives are derived from
  the brief and stored in `src/data/course.json` ("derived — replace with the official outline"); instructor-editable.
* Web access: most primary sources (Wikipedia, SkyVector, The News, PMI) were blocked for direct fetch; facts were
  verified via search snippets and graded by confidence (`docs/FACTS_AND_SOURCES.md`).

## Iteration log
- [x] Step 0 benchmark inventory · architecture · scoped bundler · walking skeleton · e2e harness
- [x] A5 PM engine (78 unit tests) · A8 game/tour/quiz · A6a UI shell · A7 MEHRAN · A2 world · A3 rendering · A4 vehicles/traffic · A9 audio · A1 facts/cases
- [x] A6b PM panels · A6c-1 / A6c-2 course panels (25 panels)
- [x] Integration fixes: Traffic wiring, graphics settings, three.js scoping, C-key clash, toast placement, HUD weather, PMO persistence
- [x] Critique → fix loop on screenshots (decision-card occlusion, monsoon look, weather transitions)
- [x] Docs: README, PRESENTER_GUIDE, COURSE_MAPPING, BENCHMARK_PARITY, FACTS_AND_SOURCES, TEST_REPORT, CHANGELOG

## Gates (§12)
| Gate | Status | Evidence |
|---|---|---|
| G1 Benchmark parity | ✅ | docs/BENCHMARK_PARITY.md — 33/33 items |
| G2 Course coverage | ✅ (derived outline) | docs/COURSE_MAPPING.md — 15 rows, no empty cells; CLOs/objectives ≥ 3 features; panels CLO-tagged |
| G3 Minimums | ✅ | bootReport: 5 modes, 25 panels, 89 WBS, 32 risks, 16 stakeholders, 12 resources, 17 procurement, 20 beats, 16 missions, 38 decisions, 139 quiz, 317 glossary |
| G4 Formula correctness | ✅ | npm test 78/78 |
| G5 Facts | ✅ with caveats | facts.json 55 graded entries; low-confidence items flagged; simulated badge throughout |
| G6 Stability | ✅ | 0 console errors; 10-minute soak 0.0 % heap growth |
| G7 Performance | ⚠️ unverified on GPU | only software-GL numbers available here; auto-tiering works; needs a real-hardware check |
| G8 Offline | ✅ | e2e with all network blocked; AI falls back offline |
| G9 Persistence/export | ✅ | slots, JSON, MSPDI (168 links), CSV, printable report |
| G10 UX polish | ✅ | 25/25 rail buttons, no placeholders, keyboard + touch, conference mode, reduced motion |
| G11 Visual quality | ✅ (A0 sign-off, notes in TEST_REPORT) | docs/screenshots/ |
| G12 Docs | ✅ | §11 deliverables present |

## Open defects / next steps
1. Verify G7 frame rates on a discrete GPU and on integrated graphics (press F).
2. Replace the derived course outline and the British Columbia case card with the official course material.
3. Open the MSPDI export in MS Project or ProjectLibre once (schema-ordered, not yet opened in either).
4. Polish: daylight terminal interior is hazy; night floodlight pools are large.
