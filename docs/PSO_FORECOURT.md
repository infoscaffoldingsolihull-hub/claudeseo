# PSO 2035 — Future Forecourt

A first-person walkthrough of a Pakistan State Oil flagship service station, ten years out.
One self-contained HTML file: three.js is vendored, every mesh is procedural `BufferGeometry`,
every texture is drawn to a `<canvas>` at runtime, every sound is synthesised through Web Audio.
Nothing downloads.

```
games/PSOFutureForecourt.html     the deliverable — open it directly, file:// is fine
prompts/pso-forecourt-loop.md     the looping LangChain pipeline that regenerates it
tools/pso-vendor.mjs              flattens three.js + addons into the file
tools/pso-smoke.mjs               headless Chromium QA — 19 assertions
```

Run the checks:

```bash
node tools/pso-smoke.mjs --shots     # boots it, asserts, writes docs/pso-screenshots/
```

---

## What was wrong, and what the fix was

### The LED bars could not glow — an arithmetic fault

`UnrealBloomPass` thresholds on Rec.709 luminance (`0.2126 R + 0.7152 G + 0.0722 B`), and this
build sets that threshold to **0.86** — deliberately high, so white concrete and pale paint never
glow. Measured against it:

| Material | Peak night RGB | Luminance | Blooms? |
|---|---|---|---|
| `MAT.cove` (blue bars) | `(0.10, 0.40, 1.05)` | **0.383** | no — 45 % of threshold |
| `MAT.emGreen` (green accent) | `(0.09, 1.00, 0.52)` | **0.772** | no — 90 % of threshold |
| `MAT.dlight` (ceiling downlights) | `(1.05, 0.96, 0.84)` | 0.971 | yes |

So the downlights glowed and the LED bars did not. They rendered as flat coloured plastic, which
is exactly the reported symptom.

The threshold is load-bearing, so the fix raises the emitters rather than lowering the bar. Blue
is the hard case: at a 0.0722 luminance weight a pure blue would need B ≈ 12 to clear 0.86, and a
value that far out of range clips to white and loses its hue. The bar is therefore mixed toward
cyan and driven to luminance ≈ 1.5 — the core clips to white-blue and the bloom halo carries the
blue, which is how a bright LED actually photographs.

Measured after the fix: blue **1.495**, green **1.153**, and every animated strip between
**1.17 and 1.52**, against the unchanged 0.86.

**The trap inside the fix.** `new THREE.Color(0x2E85FF)` is not `new THREE.Color().setRGB(0.18,
0.52, 1.0)`. `setHex` treats its argument as sRGB and applies the transfer function, landing at
roughly a third of the nominal luminance; `setRGB` writes into the linear working space. The first
attempt defined strip bases as hex and measured 0.45–0.79 — still under threshold, and
indistinguishable in source from the original bug. Every emitter is now a **linear triple**.

### The LED plumbing was dead code

`COVE`, `DOWN` and `SIGNS` were pushed to in five places and **never read anywhere**. `SIGNS` was
never even populated. All per-fixture behaviour — dusk sequencing, breathing, per-strip colour —
was absent; night lighting was a single global material-colour ramp, so every strip on the site
was mathematically identical and perfectly static.

They now drive a real rig. Each strip takes its own material clone and:

- **strikes at its own point in the dusk ramp** (`on0` 0.18–0.30), so the site lights up in a
  sequence rather than all at once;
- **stutters** while its driver comes up to voltage;
- **breathes** on a slow sine at 2–6 %.

None of that is nameable by a viewer. Its absence is the difference between "lit" and "on".

### Added from the reference photograph

| | Element |
|---|---|
| V1 | Blue perimeter LED bar tracing the full canopy fascia |
| V2 | Green under-fascia accent, striking a beat after the blue |
| V3 | **White crescent-and-star on the dark green soffit** — was absent entirely |
| V4 | **Vertical illuminated column totems** — "Hi-Cetane Diesel", set vertically |
| V5 | Illuminated dispenser nameplates (already present, now correctly lit) |

V3 is the national flag, not the crescent inside the PSO roundel — different geometry, different
purpose. It is drawn as a disc minus an offset disc filled in the field colour, rather than
composited with `destination-out`, so the horns stay analytically clean at any radius instead of
depending on a blend mode.

### Night ambience

The hemisphere ground bounce was a light grey concrete colour held constant across the whole day.
After dark there is no sky to bounce, so leaving the daytime value up lifted every surface on the
site equally — the forecourt never separated from the car park behind it, and the render read as
flat mauve. The bounce now fades to 20 % at night and the two darkest palette rows drop from
`hemiI` 0.16/0.24 to 0.07/0.14. The canopy becomes an island of light.

Bloom strength was eased 0.52 → 0.44 afterwards: the new rig puts far more surface above the
threshold than existed when 0.52 was tuned, and the sum was blowing the soffit into a white band.
The threshold itself is untouched.

### Sound

The mixer assigned `AudioParam.value` directly on thirteen loops six times a second. A direct
`.value` write steps the signal discontinuously — inaudible at a zero crossing, a click anywhere
else. At 6 Hz × 13 voices that is a continuous crackle, and it gets heard as "the sound is broken".

Every per-tick move now uses `setTargetAtTime`, which hands the ramp to the audio thread to
interpolate per sample: the mixer (τ = 55 ms), the engine note under acceleration (τ = 40 ms), the
wash-water filter sweep (τ = 70 ms), and mute (τ = 30 ms) — muting by stepping the master gain to
zero was the loudest click in the build, firing mid-waveform on every voice at once.

Construction-time `.value` initialisers are left alone; they run before the node is connected and
are correct.

### Signage

Every `rotation.z`, `rotateZ` and Z-argument in the game code was swept. **No sign carried a stray
tilt.** Everything remaining is deliberate: wheels laid on their side, a motorcycle fork rake, bike
lean, pedestrian arm swing, the nozzle rest angle, the charging-plug animation. The raked EV
charger screen (−0.10 rad) is a raked fixture and is correct.

Two real defects were behind the "signs look wrong" impression:

**Taper drift.** The canopy columns taper from `r0` to `r0 × 0.86`. Signs mounted at a fixed offset
from the *nominal* half-width floated further off the face the higher they sat — 30 mm at the
roundel, 50 mm at the top of a totem. The half-width is now computed at each fixing's own height.

**Viewpoint drift.** Viewpoint 1 ("Main canopy") sat at `(0, -5.6)`. An earlier fix had moved the
ordering-kiosk cluster to the shopfront at `(2, -6.4)`, leaving kiosk A **0.82 m** from the camera
— pressing `1` filled the screen with a black slab. The viewpoint moved west of the cluster;
clearance is now 6.64 m, and `tools/pso-smoke.mjs` raycasts a fan from every viewpoint and fails
any under 1.2 m, because objects move between builds and viewpoints do not follow them.

### Offline integrity

The build reached jsDelivr through an import map. It could not open from `file://`, could not run
offline, and could not be booted by a harness at all — the first run failed with nine
`ERR_TUNNEL_CONNECTION_FAILED`s and no assertion could be made about it.

`tools/pso-vendor.mjs` flattens three.js r169 and its seven addon passes into the file, following
the same rules as the Digital Giza bundler: imports stripped, `export` keywords dropped, and a
collision check. Two real collisions turned up — `Pass.js` declares its own `_camera` and
`_geometry`, both of which exist at top level in the core — and are renamed under a module-scoped
prefix. A collision on an *exported* name still fails the build, because renaming it would change
the public surface.

One bug worth recording: the splice originally used `String.replace(re, bundle)`, and the three.js
source contains `$&` and `` $` `` byte sequences, which `replace` expands as substitution patterns.
That silently duplicated the tail of the document and produced a file whose `<script>` block closed
early. It uses the function form now.

---

## Verification

19 assertions in Chromium, all passing. The ones that matter:

```
C1a blue cove clears bloom threshold      lum=1.495 vs required 0.989
C1b green accent clears bloom threshold   lum=1.153 vs required 0.903
C1c every animated strip clears threshold lum=[1.52, 1.17, 1.35, 1.23, 1.29]
                                          lit=[1.02, 1.01, 0.98, 0.99, 0.99]
C4  LEDs respond to time of day           night/day ratio 10.0
C5  LED animation is actually running
C6  strips go dark in daylight            day lum=[0, 0, 0, 0, 0]
E1  no viewpoint spawns inside geometry   6.64m, 3.31m, 2.3m, 7.1m, 6.64m
F1  no per-tick AudioParam steps in the mixer
```

`lit ≈ 1.0` in C1c is load-bearing. The strike ramp converges at `dt × 9` per frame with `dt`
clamped to 0.05 s, so under SwiftShader at 0.5 fps it needs ~30 s of wall time to settle. An
earlier version of the harness waited in milliseconds, sampled strips still on their way up, and
reported a failure of the rig that was a failure of the harness. It waits in **frames** now, and
asserts on the strike variable as well as the resulting colour, so "not bright enough" can be told
apart from "not finished yet".

### Not verified here

**Frame rate.** The only GL backend in this environment is ANGLE/SwiftShader, a CPU rasteriser,
which renders this scene at 0.4–0.6 fps regardless of settings. That says nothing about a real GPU
and is reported as informational rather than dressed up as a frame time. What is bounded and
measured: draw calls, triangle count, one shadow caster, no allocation in the frame loop, and the
existing self-tiering boot probe.

**Perceptual match to the photograph.** Screenshots are in `docs/pso-screenshots/`. Judging V1–V7
against the reference is a human call; the numeric gates confirm the mechanism, not the likeness.
