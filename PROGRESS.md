# PROGRESS — SKY GATEWAY HYDERABAD (loop source of truth)

Resume here after any context reset. Contract: `docs/ARCHITECTURE.md`. Brief: the uploaded swarm prompt.

## Status
Iteration 1 — foundations laid by A0; swarm phase 1 dispatched.

## Known input gaps (honest)
* `reference/COURSE_OUTLINE.txt` was **not supplied**. The 15-week plan, CLO wording and objectives are derived
  from the brief (§5.2 table, §6) and stored in `src/data/course.json`, flagged "derived — replace with the official
  outline", and are **instructor-editable** in the Course Map panel.
* The benchmark HTML was supplied as this repository's previous content; it now lives in `reference/`.
* Web access: npm registry reachable; wikipedia.org blocked by the egress proxy. A1 uses WebSearch/WebFetch where
  available; any fact that cannot be verified keeps the brief's §2.1 value with `confidence` lowered and a note.

## Iteration log
- [x] Step 0: `docs/BENCHMARK_INVENTORY.md` (measured)
- [x] `docs/ARCHITECTURE.md` (module list, `sim` API, bus, schemas, ownership)
- [x] Scoped-module bundler (`tools/build.mjs`), shell/boot screen, core (bus, settings, facts, format), layout/geo
- [x] Walking skeleton builds (1.4 MB) and boots in headless Chromium with 0 console errors
- [ ] Phase 1 swarm: A1 facts · A2 world · A3 rendering · A4 vehicles · A5 PM engine · A6a UI shell · A7 AI · A8 game/tour/quiz · A9 audio
- [ ] Phase 2 swarm: A6b PM panels · A6c course panels (against the real Project API)
- [ ] Integration pass (A0)
- [ ] A10 e2e harness + screenshots + FPS per tier
- [ ] Critique → fix loop
- [ ] Docs: PRESENTER_GUIDE, COURSE_MAPPING, BENCHMARK_PARITY, FACTS_AND_SOURCES, TEST_REPORT, README, CHANGELOG

## Gates (§12)
| Gate | Status | Evidence |
|---|---|---|
| G1 Benchmark parity | ☐ | docs/BENCHMARK_PARITY.md |
| G2 Course coverage | ☐ | docs/COURSE_MAPPING.md, Course Map panel |
| G3 Minimums | ☐ | `__hdd.bootReport()` in e2e |
| G4 Formula correctness | ☐ | `npm test` |
| G5 Facts | ☐ | facts.json + UI audit |
| G6 Stability | ☐ | e2e console log, soak |
| G7 Performance | ☐ | e2e FPS per tier (SwiftShader caveat) |
| G8 Offline | ☐ | e2e with network blocked |
| G9 Persistence/export | ☐ | e2e save/load + exports |
| G10 UX polish | ☐ | rail audit, keyboard/touch, reduced motion |
| G11 Visual quality | ☐ | screenshots review |
| G12 Docs | ☐ | §11 deliverables |

## Open defects
(none yet)
