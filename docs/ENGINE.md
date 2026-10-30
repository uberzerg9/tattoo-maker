Tattoo Engine — implementation spec

This document describes how the drawing engine works and how it connects to the Workspace UI. It complements docs/SPEC.md (what) and docs/SETUP.md step 10 (the TattooEngine interface). All numeric values marked [tune] are starting points; they live in src/engine/presets/cartridges.json and will be adjusted with a tattoo artist.

1. The core idea

A real tattoo machine is a needle hitting the skin N times per second (machine speed, Hz) while the artist moves their hand. Everything visible — solid lines, dotted gradients, whip shading, patchy fills, overworked skin — comes from three things:

Where each hit lands (hand path + machine frequency).
What each hit deposits (cartridge footprint, depth, ink left in the cartridge, how saturated the skin already is).
What each hit does to the skin (trauma accumulates; too much = overwork).

So the engine is a hit simulator, not a brush. Do not draw lines or gradients directly — schedule hits in time and stamp them. Whip shading must emerge from the physics (faster hand at the end of a flick → wider spacing → lighter), not be hardcoded.

2. Units and coordinate systems
   Space Units Notes
   Screen CSS px Pointer events
   View CSS px After inverse of zoom / pan / rotation
   Sheet mm Origin top-left of the skin sheet, 200 × 150 mm. All physics runs here
   Buffer texels 2048 × 1536 → 10.24 px/mm
   Keep one pure module src/engine/view.ts with screenToSheetMm(x, y, view) and sheetMmToScreen(...). The view is { zoom, offsetX, offsetY, rotationDeg }, owned by the UI store (see §9).
   Hits outside the sheet (0..200, 0..150 mm) are discarded.
   Unit-test the round trip at several zoom / rotation values: a hit must land exactly under the cursor.
3. Input pipeline (time-based hit scheduling)

This is the most important part. Get it right before any rendering polish.

pointer samples (x, y, t, pressure) ──► segments ──► hits every 1/f seconds ──► stamp queue
On pointerdown (tool = needle): start a stroke. Capture the pointer.
On each pointermove, read e.getCoalescedEvents() (fallback to the event itself). Convert each sample to sheet mm.
For each consecutive pair of samples A → B:
dt = B.t − A.t (ms → s), dist = |B − A| (mm), speed = dist / dt (mm/s).
Keep a time accumulator carried across segments and events. While acc + dt ≥ 1/f: place a hit at the interpolated position, acc −= 1/f.
So hit spacing = speed / f mm. Example: 100 Hz, hand at 20 mm/s → 0.2 mm spacing → solid line. Hand at 150 mm/s → 1.5 mm spacing → separate dots.
Also emit hits while the pointer is stationary but down (needle keeps hitting the same spot — that's how overwork happens). Run a timer at f Hz while pressed and there's no movement.
pointerup / pointercancel ends the stroke. Strokes are the unit of undo and of the "passes" counter.
Use getPredictedEvents() only for drawing a cursor preview, never for placing hits.

Each hit record:

ts
interface Hit {
x: number; y: number; // sheet mm
t: number; // ms since stroke start
speed: number; // mm/s at this point
depth: number; // 0..1
angle: number; // radians, direction of travel (for magnums)
cartridgeId: CartridgeId;
inkTone: number; // 0 = black … 1 = white, from the cap
inkLevel: number; // 0..1, cartridge ink at the moment of the hit
seed: number; // deterministic jitter
}

Depth: pressure from a pen (0..1) mapped through a curve; mouse / trackpad (pressure 0 or 0.5) → fixed 0.5. Tilt is ignored in MVP.

Determinism: all randomness (needle jitter, dot scatter) comes from a seeded PRNG keyed by (strokeId, hitIndex). Replaying the same hits must produce the same pixels — undo relies on it.

4. Cartridge model

src/engine/presets/cartridges.json — versioned, loaded at start (Firestore cartridgePresets later, JSON as fallback).

json
{
"version": 2,
"cartridges": {
"rl-3": { "group": "RL", "needles": 3, "needleMm": 0.35, "layout": "round-tight", "footprintMm": 0.8, "inkPerHit": 0.22, "traumaPerHit": 0.012, "spreadMm": 0.04 },
"rl-7": { "group": "RL", "needles": 7, "needleMm": 0.35, "layout": "round-tight", "footprintMm": 1.2, "inkPerHit": 0.20, "traumaPerHit": 0.014, "spreadMm": 0.05 },
"rs-9": { "group": "RS", "needles": 9, "needleMm": 0.35, "layout": "round-loose", "footprintMm": 1.8, "inkPerHit": 0.10, "traumaPerHit": 0.010, "spreadMm": 0.06 },
"m1-7": { "group": "M1", "needles": 7, "needleMm": 0.35, "layout": "flat-row", "footprintMm": 2.4, "inkPerHit": 0.07, "traumaPerHit": 0.008, "spreadMm": 0.06 },
"rm-15": { "group": "RM", "needles": 15, "needleMm": 0.35, "layout": "curved-row", "footprintMm": 5.0, "inkPerHit": 0.06, "traumaPerHit": 0.007, "spreadMm": 0.07 }
},
"ink": { "consumptionPerHit": 0.00018, "fadeBelow": 0.25 },
"trauma": { "overworkThreshold": 0.6, "blowoutDepth": 0.85 },
"render": { "healedInkFactor": 0.85, "healedBlurMm": 0.12, "freshRedness": 0.55 }
}

All values [tune].

Footprint = the needle points. Each hit stamps every needle as a tiny soft dot (needleMm wide), arranged by layout:

round-tight (RL) — needles in a tight circle → reads as one solid round dot.
round-loose (RS) — wider circle, small gaps → softer fill.
flat-row (M1) — needles in a straight row perpendicular to travel direction (use angle).
curved-row (RM) — like M1 but the row is an arc and edge needles deposit ~50% less → soft edges.

Per-needle jitter: ±spreadMm (seeded).

5. What a hit deposits

For each needle dot of a hit:

amount = cart.inkPerHit * depthCurve(depth) // shallow → little ink, patchy * inkFactor(inkLevel) // below ink.fadeBelow, ramps to 0
depthCurve: ~0 below 0.15, rises to 1 at ~0.6, flat after. [tune]
inkFactor: 1 when inkLevel ≥ fadeBelow, linear to 0 at inkLevel = 0. At 0 the hit still adds trauma — needle with no ink.
After each hit: inkLevel −= consumptionPerHit * needles. The UI shows it as "Ink in cartridge".
Dip (button "DIP NEEDLE"): inkLevel = 1, tone = selected cap; the cap's own level drops a little.

Saturation is natural with "over" blending: store ink density in alpha and use blendFunc(ONE, ONE_MINUS_SRC_ALPHA): dst = src + dst·(1 − src). Repeated passes approach 1 but never exceed it — exactly how skin saturates. Colour (tone) is premultiplied in RGB.

Blowout: if depth > trauma.blowoutDepth, add a second, wide, low-alpha halo stamp (≈3× footprint, 10% of amount). It is a mistake signal, so it must be visible.

6. Trauma

Separate R16F buffer, additive blending blendFunc(ONE, ONE).

Every needle dot adds cart.traumaPerHit * depthCurve(depth) at its position, with a slightly larger radius than the ink dot.
Stationary needle + many passes over one area → trauma climbs fast → overwork when > overworkThreshold.
Trauma drives the fresh look (redness, swelling) and the "Skin trauma" score. In healed mode it is ignored. 7. GPU pipeline

Use twgl.js. Check webgl2 + EXT_color_buffer_float on mount; if missing, emit an unsupported event and the UI shows the fallback screen.

Textures (all 2048 × 1536):

Name Format Written by
inkTex RGBA16F (premultiplied tone in RGB, density in A) stamp pass
traumaTex R16F stamp pass (second draw)
stencilTex R8 stencil upload
skinTex RGBA8, procedural generated once per tone

Stamp pass — each frame, flush the queued hits: one instanced draw per buffer, one instance per needle dot (vec2 posMm, float radiusMm, float amount, float tone). Fragment = smooth gaussian falloff. Do not do per-hit draw calls.

Composite pass (to the screen canvas, applies the view transform in the vertex shader):

skin = skinTex // tone colour + subtle pore noise
inkA = inkTex.a * (healed ? healedInkFactor : 1)
inkRGB = inkTex.rgb / max(inkTex.a, ε)
base = mix(skin, skin * inkRGB, inkA) // multiply-style, ink sits in the skin
if fresh: base = mix(base, redTint, freshRedness * smoothstep(0, 1, traumaBlur)) + slight blur of ink (swelling)
if healed: ink sampled with healedBlurMm blur, slightly desaturated / lifted
stencil = stencilTex * stencilOpacity * (1 − 0.6 * clamp(trauma, 0, 1)) // wipes off where worked
out = mix(base, stencilPurple, stencil)

The sheet has rounded corners and a black 3px border to match the mockup (docs/design/Main.dc.html).

Render loop: the engine owns one requestAnimationFrame loop and only redraws when dirty (new hits, view change, mode change). Idle = 0 GPU work.

8. Stencil and scoring

Stencil: the worker (SETUP.md step 10) returns mask (ImageBitmap) and distanceField (Float32Array, distance to the nearest line, in mm, at buffer or half resolution). Before the first stroke the stencil has an editable transform (move / rotate / scale, max height 15 cm). On the first stroke it locks.

Scores (emitted as score events, throttled to ~4/s):

deviation (mm) — for liner cartridges only (RL): mean of distanceField(hit) over all hits that are within 3 mm of a line. Hits farther away are "off-stencil" and not counted (the artist may be shading). Show a heat overlay in debug mode.
passes — number of strokes.
trauma level — fraction of inked area (inkA > 0.05) where trauma > overworkThreshold: < 5% low, 5–15% medium, > 15% high. Compute on GPU: reduce traumaTex + inkTex to 64 × 48 in a shader, then readPixels (use a PBO / fence, never block the frame).

When a session ends (leaving Workspace or saving), write a sessions doc with these values (the Cloud Function updates profile stats).

9. Wiring to the UI

The UI already exists. Connect it like this; do not move UI state into the engine.

Zustand store (UI state) ──subscribe──► engine setters
engine events ─────────────────────────► store (read-only data for panels)
canvas pointer events ──► (tool = needle) engine.pointer(e)
└──► (tool = hand) view controller → store.view

Store → engine (src/features/workspace/useEngine.ts):

Store field Engine call Panel
cartridgeId setCartridge Cartridges
capId setInk (applies on next Dip) Ink caps
dip() action dip() "DIP NEEDLE" button
machineHz setMachineHz Machine slider + presets
skinTone setSkinTone Skin
view (zoom, offset, rotation) setView Toolbar zoom/rotate, wheel, pan
renderMode setRenderMode FRESH / HEALED
stencilVisible, stencilOpacity setStencilVisibility (add to interface) Stencil panel + toolbar
stencil result from worker setStencil Stencil transfer dialog
undo() action undo() Undo button, Ctrl/⌘+Z

Engine → store:

Event Store field Shown in
inkLevel inkLevel "Ink in cartridge" bar
capLevels caps[].level cap level bars
score passes, deviationMm, traumaLevel bottom-left stats sticker
unsupported engineError fallback screen
dirty hasUnsavedChanges autosave

Rules:

Create the engine once per Workspace mount (useEffect with a ref), destroy() on unmount. Never recreate it on re-render.
Subscribe with selectors (useStore.subscribe(s => s.machineHz, engine.setMachineHz)), not via React re-renders.
Wheel handling is a non-passive native listener on the stage ({ passive: false }): plain scroll = pan, Ctrl/⌘ + scroll or pinch = zoom, Alt + scroll = rotate. This is already in the mockup logic — port it.
Pointer events on panels must not reach the canvas (panels sit above it; stop propagation on panel pointerdown).
Floating panel positions / collapsed state persist in users/{uid}.settings.panelLayout. 10. Undo, save, restore

Full-texture snapshots per stroke are too big (RGBA16F 2048×1536 ≈ 25 MB). Instead:

Record every stroke as its list of Hits (compact, ~40 bytes/hit).
Keep a checkpoint (copy of inkTex + traumaTex + ink levels) every 10 strokes; keep the last 4 checkpoints.
undo() = restore the nearest checkpoint before the target stroke, then replay the hit lists up to it. Works because hits are deterministic.
Minimum 30 undo steps.
snapshot() = read both textures, encode as half-float binary, gzip via CompressionStream, plus a 512 px WebP preview. restore() is the reverse.
Autosave every 30 s when dirty: IndexedDB first, then Cloud Storage (users/{uid}/works/{id}/ink.bin, trauma.bin, preview.webp) + works/{id} doc. Store the presets version in the work. 11. Debug mode

?debug=1 shows a small overlay: hits/s, current hand speed (mm/s), last hit spacing (mm), depth, ink level, frame time, and toggles to draw hit centres and the deviation heatmap. Most tuning with the artist will happen here.

12. Build order and acceptance checks

Do these in order. Stop after each milestone, show it, and wait for review.

Sheet + view. Composite pass with procedural skin (6 tones), view transform, pan / zoom / rotate wired to the existing UI. ✔ Sheet stays clamped on screen at any zoom/rotation; tone switch is instant.
Input → hits. Time-based scheduling, coalesced events, stationary hits. Debug-draw hit centres only. ✔ At 100 Hz and a slow drag dots merge into a line; a fast flick shows spaced dots; a hit lands exactly under the cursor at 300% zoom rotated 45°.
Stamps. Instanced needle-dot stamping for all 5 layouts, over-blending saturation. ✔ 7 RL reads as a solid line; 7 M1 leaves a flat band perpendicular to travel; repeated passes saturate without going past black.
Ink. Ink level, depletion, fade, Dip, cap tones and levels. ✔ Long stroke without dipping visibly fades, then leaves no ink; Dip restores it; grey caps produce grey.
Trauma + render modes. Trauma buffer, fresh redness/swelling, healed fade/blur, blowout halo. ✔ Holding the needle still in one spot turns it red fast; HEALED looks lighter and softer than FRESH.
Stencil + scores. Stencil upload from the worker, placement before first stroke, wipe-off, deviation / passes / trauma level, sessions write. ✔ Tracing a stencil line exactly gives < 0.2 mm; tracing 1 mm off gives ≈ 1 mm.
Undo + save/restore + autosave. ✔ 30 undos are pixel-identical to the state before those strokes; a saved work reopens identically on another device.

Performance target throughout: 60 fps while drawing on integrated graphics.

Write Vitest tests for everything that is pure (view math, hit scheduling, depth/ink curves, scoring math). Rendering is checked visually with debug mode.
