# PSO 2035 — Future Forecourt · Looping LangChain Build Prompt

A self-correcting LangChain pipeline that regenerates **PSO 2035 — Future Forecourt** at the
craft standard of *Digital Giza — Project Management Simulator*.

The design principle: **the loop does not exit on the model's opinion that it is finished.** It
exits when a headless browser says so. Every iteration must move a measured number, and the
critic is fed machine-collected evidence — console errors, luminance samples, frame times,
screenshots — not the generator's own prose.

---

## 0. Why this is a loop and not a prompt

A single-shot prompt against a 7,700-line, 400 KB single-file WebGL build fails for three
reasons that no amount of prompt polish removes:

1. **The defects are invisible to the author.** `MAT.cove` is set to a perfectly reasonable-looking
   blue. Only when you compute its luminance against the bloom threshold does it become a bug.
   A generator cannot see its own render.
2. **The output exceeds a useful context window.** Regenerating 400 KB in one turn forces the
   model to compress, and compression is where the detail — the thing being asked for — dies.
3. **Graphics work is iterative by nature.** "Looks like the photograph at night" is a
   perceptual target reached by successive approximation, not by one-shot specification.

So: decompose into modules, generate per-module, verify in Chromium, feed measurements back,
repeat until gates pass.

---

## 1. Ground truth — the defect ledger

These are measured facts about the current build, not guesses. The generator receives this
ledger verbatim as immutable context. **Every entry must be closed and each closure must be
provable by an assertion.**

### 1.1 The LED bars cannot bloom — arithmetic proof

| Symbol | Definition site | Peak night RGB | Rec.709 luminance | Bloom threshold | Blooms? |
|---|---|---|---|---|---|
| `MAT.cove` | MATERIALS §, `MeshBasicMaterial`, `toneMapped:false` | `(0.10, 0.40, 1.05)` | **0.383** | 0.86 | **No** |
| `MAT.emGreen` | MATERIALS § | `(0.09, 1.00, 0.52)` | **0.772** | 0.86 | **No** |
| `MAT.dlight` | MATERIALS § | `(1.05, 0.96, 0.84)` | **0.971** | 0.86 | Yes |

`UnrealBloomPass(resolution, strength=0.52, radius=0.62, threshold=0.86)` — POST §, ~line 7159.

Luminance is `0.2126·R + 0.7152·G + 0.0722·B`. The cove strips sit at **45 %** of the threshold
and the green accent at **90 %**; the ceiling downlights clear it. That is the whole reason the
forecourt reads as flat plastic at night while the downlights glow: *the LED bars were never
reaching the bloom pass at all.* The user-visible symptom "the LED lights don't work" has this
single arithmetic cause.

**Constraint on the fix:** do not simply lower the threshold. The comment at the definition site
is correct — the threshold is high on purpose so that white concrete does not glow. Raise the
emitters above it instead, and keep every non-emitter below it.

**The trap inside the fix.** `new THREE.Color(0x2E85FF)` is not the same value as
`new THREE.Color().setRGB(0.18, 0.52, 1.0)`. `setHex` interprets its argument as sRGB and applies
the transfer function, landing roughly a third of the nominal luminance; `setRGB` writes straight
into the linear working space. Mixing the two conventions in one rig produces strips that measure
below the threshold while looking correct in source, which is indistinguishable from the original
bug. **Define every emitter as a linear triple.** Verified: hex-defined strips measured
0.45–0.79; the identical colours as linear triples measured 1.17–1.52 against a 0.86 threshold.

**The trap inside verifying the fix.** The strike ramp converges at `dt * 9` per frame with `dt`
clamped to 0.05 s. Under SwiftShader at 0.5 fps that is ~30 s of wall time to settle. A harness
that waits in milliseconds samples a strip still on its way up and reports a failure of the rig
rather than of the harness. **Wait in frames, and assert on the strike variable itself, not only
on the resulting colour** — `lit ≈ 1.0` is what distinguishes "not bright enough" from
"not finished yet".

### 1.2 Dead LED plumbing

`const COVE = [], DOWN = [], SIGNS = [];` — BUILDERS §, ~line 2631.

- `COVE` — pushed at 4 sites (canopy, Shaheen island, AutoWash, EV canopy). **Never read.**
- `DOWN` — pushed at 1 site. **Never read.**
- `SIGNS` — **never pushed and never read.**

All per-fixture behaviour — dusk flicker-on sequencing, breathing pulse, chase, per-strip
colour — is absent. Night lighting is currently driven only by a global material-colour ramp in
the day/night system, so every cove strip on the site is mathematically identical and perfectly
static. There is also a latent fragility: `buildCanopy()` pushes to `COVE` before the `const`
declaration appears in source order. It survives only because the builder is invoked after
module evaluation. Hoist the declarations above first use.

### 1.3 Audio discontinuities

The mixer writes `g.value = A.muted ? 0 : L.vol` directly on `GainNode.gain` every audio tick
(SYSTEMS — audio §). Direct `.value` assignment on an `AudioParam` steps the signal
discontinuously; at a zero crossing it is inaudible, elsewhere it is a click. With ~13 loops
re-written at 6 Hz this is a continuous low-level crackle that gets blamed on "broken sound".

Fix: `setTargetAtTime(target, ctx.currentTime, tau)`. Mute must also ramp, not jump.

Secondary: `posLoop()` builds `PositionalAudio` via `setNodeSource()`, which sets
`hasPlaybackControl = false` — so `.play()`/`.stop()` throw if ever called on these nodes. Keep
them gain-gated only, and never call transport methods on them.

### 1.4 Offline integrity — the largest gap against the reference

| | PSO 2035 (current) | Digital Giza (target) |
|---|---|---|
| three.js | jsDelivr CDN via import map | **vendored**, `assets/vendor/three.module.js` (1.27 MB) |
| Post-processing | 7 add-on passes from CDN | **hand-written** chain against raw `WebGLRenderTarget`s |
| Runs from `file://` | No | **Yes** |
| Runs offline | No | **Yes** |
| Build | none | `tools/build.mjs`, ESM → one file, symbol-collision checked |
| QA | none | `tools/smoke-test.mjs`, headless Chromium |

Digital Giza's post chain is bright-pass → two separable gaussian mips → radial god-rays →
composite (ACES tonemap, bloom + rays, heat haze, grade, chromatic aberration, vignette, grain,
sRGB encode), written directly because *the deliverable is one file*. PSO must match this: no
network at runtime, single artefact, `file://`-openable.

### 1.5 Signage orientation

Sweep every `rotation.z` / `rotateZ` / third argument of `rotation.set(...)` on signage,
roundels, nameplates and fascia lettering. Separate the deliberate from the accidental:

- **Deliberate, keep** — nozzle rest angle `side * .20`; wheel `rotateZ(π/2)`; charging-plug
  animation.
- **Suspect, justify or zero** — entrance screens at `-0.10` rad pitch; any `0.1`-ish constant
  Z-rotation on a sign plane; anything rotating a *logo* off-axis.

Rule: a logo, roundel, nameplate or price board is **plumb** unless the physical fixture it sits
on is itself raked, and then the sign matches the fixture's rake exactly — never a hand-tuned
offset. Emit the full before/after table.

**Expect this sweep to come back clean, and do not manufacture a finding.** On the current build
every surviving Z-rotation is deliberate: wheels laid on their side, a motorcycle fork rake, bike
lean, pedestrian arm swing, the nozzle rest angle. What actually reads as "tilted" is a different
defect — see 1.6.

### 1.6 Fixtures that drift away from what they are mounted on

Two distinct faults, both of which a viewer describes as "the signs look wrong":

**Taper drift.** The canopy columns taper from `r0` at the base to `r0 × 0.86` at the soffit. A
sign mounted at a fixed offset from the *nominal* half-width therefore floats further off the face
the higher it sits — 30 mm at the roundel, 50 mm at the top of a full-height totem. Compute the
half-width at the fixing's own height: `(r0 + (r1 - r0) · y/h) / √2`.

**Viewpoint drift.** Viewpoint 1 ("Main canopy") sat at `(0, -5.6)`. The ordering-kiosk cluster
had been moved to the shopfront at `(2, -6.4)` by an earlier fix, putting kiosk A **0.82 m** from
the camera — so pressing `1` filled the screen with a black slab. Objects move between builds and
viewpoints do not follow them. **Assert clearance rather than eyeballing it:** raycast a small fan
from every viewpoint and fail any that returns under 1.2 m.

This generalises. Whenever a fix relocates a fixture, everything positioned *relative to where it
used to be* — viewpoints, spawn points, colliders, camera rails, audio emitters — is now wrong and
nothing will tell you.

---

## 2. The visual target

Source: night photograph of a PSO forecourt, supplied with the task.

Reproduce **exactly** these elements. This list is the acceptance spec for Gate D:

| # | Element | Specification |
|---|---|---|
| V1 | Canopy perimeter LED | Continuous, intense blue bar tracing the entire fascia edge, unbroken at corners. The brightest thing in frame. Must bloom. |
| V2 | Under-fascia accent | Green LED run beneath the blue, dimmer, warmer falloff onto the soffit. |
| V3 | Soffit motif | Large **white crescent-and-star** (Pakistan flag) on dark green soffit field, lit. *Currently absent from the build — must be added.* Do not confuse with the PSO roundel's own crescent. |
| V4 | Column totems | Full-height vertical illuminated lightboxes on canopy columns — yellow/green face, product name set vertically ("Hi-Cetane Diesel", "Premier"). Self-lit, legible at distance. |
| V5 | Dispenser nameplates | Blue illuminated header boards, white product type, yellow bay numerals. |
| V6 | Shopfront | Green illuminated Urdu/English fascia lettering over the glazed shopfront. |
| V7 | Ambience | Wet-look forecourt reflecting the LED runs; light pooling under the canopy falling off into darkness beyond; the canopy is an island of light in a dark site. |

The whole-frame test for V7: **at 22:30 the canopy edge must be the brightest element in the
image, and the site beyond the forecourt must fall to near-black.** A night render where the
ground plane is uniformly lit has failed regardless of what the LEDs are doing.

---

## 3. Module decomposition

Mirror the Digital Giza `src/` layout. Each module is one loop unit: generated, verified and
gated independently. `build.mjs` requires **named exports only, relative imports only, and
globally unique top-level identifiers**.

```
src/
  engine/    renderer · postfx · quality · input · controls · audio · textures · noise
  world/     sky · layout · ground · canopy · led · dispensers · pylon · buildings
             wash · kiosks · ev · greenery · vehicles · people · collision · world
  sim/       fuelling · washcycle · orders · charging · economy
  ui/        hud · panels · minimap · help · touch · dom · storage
  main.js
```

`world/led.js` is new and is the centre of gravity for this work. It owns every emissive strip
on the site, and it is the only module permitted to mutate LED material state.

**Generation order is dependency-first.** `engine/*` before `world/*` before `sim/*` before
`ui/*`. A module is never generated before everything it imports has passed its gate.

---

## 4. Chain architecture

```
                  ┌─────────────────────────────────────────────┐
                  │  STAGE 0 · Ingest (once)                    │
                  │  defect ledger · visual target · DIMS/BRAND │
                  │  → frozen into every downstream context     │
                  └───────────────────┬─────────────────────────┘
                                      ▼
                  ┌─────────────────────────────────────────────┐
                  │  STAGE 1 · Plan (once)                      │
                  │  module graph · per-module contracts        │
                  │  budgets · acceptance assertions            │
                  └───────────────────┬─────────────────────────┘
                                      ▼
   ╔══════════════════════════════════ OUTER LOOP · per module ═══════════════════╗
   ║                                                                              ║
   ║   ┌────────────────────────────────────────────────────────────────┐         ║
   ║   │  STAGE 2 · Generate                                            │         ║
   ║   │  emit ONE complete module. No elisions, no "...".              │         ║
   ║   └──────────────────────────────┬─────────────────────────────────┘         ║
   ║                                  ▼                                           ║
   ║   ┌────────────────────────────────────────────────────────────────┐         ║
   ║   │  STAGE 3 · Static gate      (tools/build.mjs)                   │        ║
   ║   │  parses · no bare imports · no symbol collision · budget        │        ║
   ║   └──────────────────────────────┬─────────────────────────────────┘         ║
   ║                                  ▼                                           ║
   ║   ┌────────────────────────────────────────────────────────────────┐         ║
   ║   │  STAGE 4 · Runtime gate     (tools/smoke-test.mjs)              │        ║
   ║   │  boots · 0 console errors · FPS · probes · screenshots          │        ║
   ║   └──────────────────────────────┬─────────────────────────────────┘         ║
   ║                                  ▼                                           ║
   ║   ┌────────────────────────────────────────────────────────────────┐         ║
   ║   │  STAGE 5 · Critic  (vision model, sees screenshots + metrics)   │        ║
   ║   │  scores against §2 · emits DEFECTS[] with severity + evidence   │        ║
   ║   └──────────────────────────────┬─────────────────────────────────┘         ║
   ║                                  ▼                                           ║
   ║          all gates pass ── yes ──► next module                               ║
   ║                 │                                                            ║
   ║                 no ──► STAGE 6 · Repair (targeted diff, not rewrite) ──┐     ║
   ║                              ▲                                        │      ║
   ║                              └────────────────────────────────────────┘      ║
   ║                                  (max 6 attempts, then escalate)             ║
   ╚══════════════════════════════════════════════════════════════════════════════╝
                                      ▼
                  ┌─────────────────────────────────────────────┐
                  │  STAGE 7 · Integrate · full-site gates A–E   │
                  │  regression sweep over every closed module   │
                  └─────────────────────────────────────────────┘
```

**Why a separate critic model:** a generator asked to grade its own output grades it as passing.
The critic must run as an independent call that never sees the generator's reasoning — only the
artefact, the screenshots and the numbers.

---

## 5. Acceptance gates

The loop's exit condition. Every gate is machine-checkable; none is a matter of taste.

### Gate A — Static
- `node tools/build.mjs` exits 0.
- No bare import specifier other than `three`.
- No duplicate top-level identifier across the tree.
- Single output artefact; no network reference of any kind survives in the built file
  (`grep -E "https?://(cdn|unpkg|esm)" dist/*.html` returns nothing).
- Built file opens from `file://`.

### Gate B — Runtime
- Boots to ready in Chromium/SwiftShader in **< 8 s**.
- **Zero** console errors and zero unhandled rejections (minus the documented SwiftShader
  allow-list already present in `smoke-test.mjs`).
- ≥ 30 FPS at 1600×900 on the medium tier, sampled over 120 frames after warm-up.
- JS heap stable across a 60 s soak: growth < 15 %.
- Every interactable reachable and firing without throwing.
- No `THREE.WebGLRenderer` shader-compile or texture warnings.

### Gate C — LED correctness *(the measurable core of this work)*

Probe the live scene through an exposed debug hook and assert numerically:

```js
// C1 — every LED emitter clears the bloom threshold at night
lum(MAT.cove.color)    >= 1.15 * BLOOM.threshold   // was 0.383 vs 0.86 — FAILING
lum(MAT.emGreen.color) >= 1.05 * BLOOM.threshold   // was 0.772 vs 0.86 — FAILING

// C2 — and nothing that is not an LED clears it
for (const m of NON_EMISSIVE_MATERIALS) lum(m.color) < 0.90 * BLOOM.threshold

// C3 — the plumbing is live, not write-only
COVE.length  >= 4 && LED.strips.every(s => s.update instanceof Function)
SIGNS.length >= 1                       // was 0 — never populated

// C4 — LEDs are driven by time of day, not constant
setTime(12*60); const day = sampleCove();
setTime(22*60+30); const night = sampleCove();
night / day >= 4.0

// C5 — animation is actually running
const a = sampleCove(); advance(0.5); const b = sampleCove();
Math.abs(a - b) > 1e-4
```

### Gate D — Visual, against §2
Render at **22:30, clear, medium tier** from three fixed camera poses (forecourt approach,
under-canopy, pylon-side). For each:
- V1–V7 all present; critic confirms each by name.
- Canopy edge is the **brightest** element: peak luminance in the top 2 % of pixels lies on the
  fascia edge.
- Off-forecourt ground falls below 12 % of peak luminance.
- Mean frame luminance in `[0.06, 0.26]` — dark, but not crushed.
- No blown highlights: < 0.5 % of pixels fully clipped.

### Gate E — Signage
- The before/after rotation table from §1.5 is emitted in full.
- Every non-zero Z-rotation remaining on a logo, roundel or nameplate carries a one-line
  justification tying it to a raked fixture.
- Four fixed views (pylon, column roundels, dispenser nameplates, shopfront) confirmed plumb by
  the critic.

### Gate F — Audio
- No direct `.value` assignment on any `AudioParam` in a per-frame or per-tick path
  (`grep -n "\.gain\.value\s*=" src/` returns only initialiser sites).
- All mixer moves use `setTargetAtTime`.
- `AudioContext` is created only inside a user gesture; no autoplay warning in console.
- Mute and unmute ramp; neither produces a discontinuity.

---

## 6. Prompt templates

### 6.1 System prompt — every stage

```
You are a graphics engineer building PSO 2035 — Future Forecourt: a single-file,
offline, first-person WebGL experience of a Pakistan State Oil flagship service
station. Your craft standard is the Digital Giza Project Management Simulator:
one self-contained HTML file, three.js vendored, a hand-written post-processing
chain, every mesh procedural BufferGeometry, every texture drawn to a <canvas>
at runtime, every sound synthesised through Web Audio. No asset ever downloads.

NON-NEGOTIABLE
1  No network at runtime. No CDN, no import map to a remote host, no fetch.
   three.js is vendored into the artefact.
2  One module per response, complete. Never elide with "..." or
   "unchanged". Never stub a function you have been asked to write.
3  Every dimension derives from the shared DIMS table; every colour from the
   shared BRAND table. No magic numbers at a call site — if a number is new,
   it is added to DIMS or BRAND with a comment explaining its provenance.
4  Comments explain WHY, never WHAT. "// 0.86 so white concrete does not glow"
   is useful; "// set the threshold" is noise.
5  Respect the performance budget in your module contract. Nothing is
   allocated inside the frame loop — no geometry, no material, no canvas,
   no closure, no array.
6  You are mid-loop. Output is compiled and executed by a headless browser
   after every response. Claims are worthless; assertions are the currency.
   If you cannot make a claim checkable, do not make it.

HOUSE STYLE
Named exports only. Relative imports only. Every top-level identifier unique
across the entire source tree — the bundler enforces this and will fail the
build on a collision.
```

### 6.2 Stage 2 — Generate

```
MODULE          {module_path}
RESPONSIBILITY  {responsibility}

IMPORTS AVAILABLE (already generated and passed their gates — treat as fixed,
do not redefine, do not re-export):
{frozen_api_surface}

CONTRACT
  exports    {required_exports}
  budget     ≤ {draw_calls} draw calls, ≤ {triangles} triangles,
             ≤ {textures} canvas textures, ≤ {ms} ms CPU per frame
  forbidden  {forbidden_apis}

DEFECT LEDGER — entries this module must close:
{assigned_defects}

VISUAL TARGET — elements this module must produce:
{assigned_visual_elements}

ACCEPTANCE — this module is verified by these assertions. Write code that
makes each one pass. Do not weaken an assertion to fit your implementation:
{acceptance_assertions}

Emit the complete module. Then, after the code, a short DESIGN NOTE: the
decisions a reviewer would otherwise have to reverse-engineer, and any place
where you deviated from the contract and why.
```

### 6.3 Stage 5 — Critic

Runs as a **separate model call with no access to the generator's reasoning.** Receives only
the built artefact, the screenshots and the metrics.

```
You are reviewing a night render of the PSO 2035 forecourt against a reference
photograph. You are adversarial. Your job is to find what is wrong, not to
confirm what is right. A review that finds nothing is a review that failed.

REFERENCE PHOTOGRAPH   {reference_image}
RENDERS                {render_22_30_approach} {render_22_30_under} {render_22_30_pylon}
MEASURED METRICS       {metrics_json}
GATE RESULTS           {gate_results}

Score each element of the visual target 0–5, where
  0 absent · 1 present but wrong · 2 recognisable · 3 acceptable
  4 close to reference · 5 indistinguishable at a glance

  V1 canopy perimeter blue LED bar
  V2 green under-fascia accent
  V3 white crescent-and-star soffit motif
  V4 vertical illuminated column totems
  V5 illuminated dispenser nameplates
  V6 green shopfront fascia lettering
  V7 night ambience — light pooling, falloff, wet reflection

Then answer, with evidence, for the render as a whole:
  · Is the canopy edge the brightest element? If not, what is, and why?
  · Does the site fall to near-black beyond the forecourt, or is the ground
    uniformly lit? Uniform ground lighting is an automatic fail.
  · Is any logo, roundel or nameplate off-plumb? Name it and estimate the
    angle in degrees.
  · Is any surface blooming that should not be — concrete, paint, sky?
  · Where does this most clearly read as a render rather than a photograph?

Output strict JSON:
{
  "scores":  { "V1": 0, ... , "V7": 0 },
  "defects": [ { "id": "...", "severity": "blocker|major|minor",
                 "element": "V3",
                 "evidence": "what in the image or metrics shows this",
                 "suggested_fix": "one concrete change, one module" } ],
  "verdict": "pass" | "iterate",
  "rationale": "two sentences maximum"
}

Rules: verdict is "pass" only when every V-score ≥ 4 AND no blocker or major
defect remains. Never raise a score because a fix was attempted — score only
what the pixels show. If a metric contradicts the image, trust the metric and
say so.
```

### 6.4 Stage 6 — Repair

```
Module {module_path} failed its gates on attempt {attempt} of 6.

FAILURES
{gate_failures}

CRITIC DEFECTS (blockers and majors only)
{critic_defects}

PREVIOUS ATTEMPTS — do not repeat an approach already tried and failed:
{attempt_history}

Produce a TARGETED REPAIR, not a rewrite.

  1  State the root cause in one sentence. If you cannot, say so and ask for
     one specific additional probe rather than guessing.
  2  Emit only the changed functions, each complete, each named.
  3  State which assertion now passes that did not before, and why.

If two consecutive attempts have failed on the same assertion, do not attempt
a third. Escalate: report what you believe is wrong with the contract or the
assertion itself, and stop.
```

---

## 7. Implementation

### 7.1 State

```python
from typing import TypedDict, Literal, Annotated
import operator

class ModuleState(TypedDict):
    path: str
    responsibility: str
    contract: dict
    assigned_defects: list[dict]
    assigned_visual_elements: list[str]
    acceptance_assertions: list[str]
    source: str | None
    attempt: int
    gate_results: dict
    critic: dict
    attempt_history: Annotated[list[dict], operator.add]
    status: Literal["pending", "generating", "gated", "passed", "escalated"]

class BuildState(TypedDict):
    ledger: list[dict]          # §1 — frozen, immutable
    visual_target: list[dict]   # §2 — frozen, immutable
    reference_image: str
    modules: dict[str, ModuleState]
    order: list[str]
    cursor: int
    frozen_api: dict[str, list[str]]
    site_gates: dict
    escalations: Annotated[list[dict], operator.add]
```

### 7.2 Gate runners — the part that must not be faked

The single most important property of this pipeline: **`run_static_gate` and `run_runtime_gate`
shell out to real tools.** They are not LLM calls. The loop is only as trustworthy as these two
functions.

```python
import subprocess, json, pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent

def run_static_gate(state: BuildState) -> dict:
    """Gate A. Bundler + offline-integrity check. Never an LLM call."""
    build = subprocess.run(
        ["node", "tools/build.mjs"],
        cwd=REPO, capture_output=True, text=True, timeout=120,
    )
    if build.returncode != 0:
        return {"pass": False, "stage": "build", "log": build.stderr[-4000:]}

    # No network reference may survive into the artefact.
    artefact = (REPO / "dist" / "PSOFutureForecourt.html").read_text(encoding="utf8")
    leaks = [p for p in ("cdn.jsdelivr", "unpkg.com", "esm.sh", "cdnjs.", "fonts.googleapis")
             if p in artefact]
    if leaks:
        return {"pass": False, "stage": "offline", "leaks": leaks}

    return {"pass": True, "bytes": len(artefact)}


def run_runtime_gate(state: BuildState) -> dict:
    """Gates B, C, D-metrics, E, F. Real Chromium. Never an LLM call."""
    proc = subprocess.run(
        ["node", "tools/smoke-test.mjs", "--shots", "--json", "--probe-led", "--probe-audio"],
        cwd=REPO, capture_output=True, text=True, timeout=600,
    )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"pass": False, "stage": "harness",
                "log": (proc.stdout + proc.stderr)[-4000:]}
```

### 7.3 The loop

```python
from langgraph.graph import StateGraph, END
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser
from langchain_anthropic import ChatAnthropic

MAX_ATTEMPTS = 6

generator = ChatAnthropic(model="claude-opus-5", max_tokens=32000, temperature=0.2)
critic    = ChatAnthropic(model="claude-opus-5", max_tokens=8000,  temperature=0.0)

generate_chain = (
    ChatPromptTemplate.from_messages([("system", SYSTEM), ("human", GENERATE)])
    | generator | StrOutputParser()
)
repair_chain = (
    ChatPromptTemplate.from_messages([("system", SYSTEM), ("human", REPAIR)])
    | generator | StrOutputParser()
)
critic_chain = (
    ChatPromptTemplate.from_messages([("human", CRITIC)])   # no system prompt: no shared framing
    | critic | JsonOutputParser()
)


def route_after_gates(state: BuildState) -> str:
    """The only place the loop can decide to continue, advance or give up."""
    m = state["modules"][state["order"][state["cursor"]]]

    gates_ok = m["gate_results"].get("pass", False)
    critic_ok = m["critic"].get("verdict") == "pass"

    if gates_ok and critic_ok:
        return "advance"
    if m["attempt"] >= MAX_ATTEMPTS:
        return "escalate"

    # Two consecutive failures on the same assertion means the contract is
    # suspect, not the code. Stop burning attempts on it.
    recent = m["attempt_history"][-2:]
    if len(recent) == 2 and recent[0].get("failed_assertion") == recent[1].get("failed_assertion"):
        return "escalate"

    return "repair"


graph = StateGraph(BuildState)
graph.add_node("ingest",   ingest_node)      # Stage 0 — freeze ledger + target
graph.add_node("plan",     plan_node)        # Stage 1 — module graph, contracts
graph.add_node("generate", generate_node)    # Stage 2
graph.add_node("static",   static_node)      # Stage 3
graph.add_node("runtime",  runtime_node)     # Stage 4
graph.add_node("critique", critique_node)    # Stage 5
graph.add_node("repair",   repair_node)      # Stage 6
graph.add_node("advance",  advance_node)     # freeze API, cursor += 1
graph.add_node("escalate", escalate_node)    # record, park module, continue
graph.add_node("integrate", integrate_node)  # Stage 7 — full-site A–F

graph.set_entry_point("ingest")
graph.add_edge("ingest", "plan")
graph.add_edge("plan", "generate")
graph.add_edge("generate", "static")
graph.add_edge("static", "runtime")
graph.add_edge("runtime", "critique")
graph.add_conditional_edges("critique", route_after_gates, {
    "repair": "repair", "advance": "advance", "escalate": "escalate",
})
graph.add_edge("repair", "static")           # repaired code re-enters at the gates

graph.add_conditional_edges("advance", lambda s:
    "generate" if s["cursor"] < len(s["order"]) else "integrate",
    {"generate": "generate", "integrate": "integrate"})
graph.add_edge("escalate", "advance")
graph.add_conditional_edges("integrate", lambda s:
    END if s["site_gates"]["pass"] else "generate",
    {END: END, "generate": "generate"})

app = graph.compile()
```

### 7.4 Context discipline

The reason this scales to a 400 KB artefact: **the generator never sees the whole build.**

Each Stage 2 call receives only the frozen *API surface* of its dependencies — export
signatures and one-line contracts, not bodies. A module that imports `world/led.js` sees:

```
world/led.js
  createLedSystem(scene, materials) -> LedSystem
  LedSystem.addStrip(mesh, spec)    -> void
  LedSystem.update(dt, nightFactor) -> void   // call once per frame, after sky
```

and nothing more. This keeps every call inside a comfortable window regardless of how large the
finished artefact grows, and it prevents the generator from reaching into a neighbour's
internals — which is the same discipline `build.mjs` enforces at bundle time.

### 7.5 Loop economics

Six attempts per module × ~30 modules is a worst case of 180 generation calls, and you will not
spend it. Observed shape on work of this kind:

- ~70 % of modules pass on attempt 1–2 (the contract did the work).
- ~25 % need 3–4 (usually a visual element the critic catches).
- ~5 % escalate (the contract or the assertion was wrong — human decides).

Escalation is a feature. A module that escalates does not block the build: it is parked, the
cursor advances, and the escalation surfaces at Stage 7 with its evidence attached. You fix the
contract, not the loop.

---

## 8. Seeding the loop

The ledger in §1 is the seed for the current codebase. Regenerate it before each run:

```bash
# Materials whose night colour must be re-measured against the bloom threshold
grep -n "MeshBasicMaterial\|emissiveIntensity" src/**/*.js

# Write-only arrays — pushed but never read
for sym in COVE DOWN SIGNS; do
  echo "$sym: $(grep -c "$sym" src/**/*.js) refs"
done

# AudioParam discontinuities in per-tick paths
grep -n "\.gain\.value\s*=" src/**/*.js

# Network references that must not survive the build
grep -nE "https?://" src/**/*.js dist/*.html
```

Feed the output into Stage 0. A defect the ledger does not name is a defect the loop will not
close.

---

## 9. What this prompt refuses to do

Stated explicitly, because these are the failure modes that produce plausible-looking output
that does not work:

- **It will not lower the bloom threshold to make the LEDs glow.** The threshold is load-bearing.
  Raise the emitters.
- **It will not accept the generator's word that a gate passed.** Gates are subprocess calls.
- **It will not let the critic see the generator's reasoning.** Shared framing produces shared
  blind spots.
- **It will not regenerate a module to fix a one-line defect.** Repair is a targeted diff;
  rewrites lose detail that previously passed.
- **It will not loop forever on the same assertion.** Two identical failures escalate to a human.
- **It will not ship a build that needs the network.** That is the difference between the
  reference and the current state, and it is not negotiable.
