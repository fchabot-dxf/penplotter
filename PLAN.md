# Pen Plotter G-code Plan

Working notes for getting the Ultimate Bee + DDCS Expert 1.1 plotting reliably.

## Setup

- **Machine:** Ultimate Bee CNC
- **Controller:** DDCS Expert 1.1 (offline, has documented quirks — G53 verified, G10 broken, G28 not configured, manual tool change workflow)
- **Pen lift:** spring-loaded Z-axis mount (pen can plunge past paper without breaking the tip)
- **Inputs we care about:** SVG/vector art + generative/code-drawn patterns
- **CAM tool already in use:** Fusion 360

## Decision

Pursue **three parallel avenues** — Inkscape/vpype, Fusion 360, and Affinity — to compare them on real jobs before committing to one as the long-term workflow. Skip the homemade DDCS Studio module for now; revisit once we know what good pen-plotter G-code for this machine actually looks like.

---

## Avenue 1 — Inkscape / vpype pipeline

**Pitch:** purpose-built for line art and pen plotting; the community has refined this for years.

**Real pipeline (not gcodetools — that's deprecated):**

1. Draw or import SVG in Inkscape (or generate it from Processing/p5.js/Python for generative work)
2. `vpype` to optimize: `read in.svg linemerge linesort linesimplify write out.gcode`
   - `linemerge` joins contiguous segments → fewer pen lifts
   - `linesort` reorders strokes nearest-neighbor → less wasted travel
   - `linesimplify` tightens vertex count without visible quality loss
3. Custom vpype G-code config emits DDCS-friendly output (pen-up height, pen-down depth, feeds, modal codes)

**What I need to build:**

- vpype install + a `config.toml` with a DDCS-flavored G-code template
- Decide pen-up Z height (clearance) and pen-down Z (slight overtravel for the spring)
- Decide draw feed rate and rapid feed rate
- Sample SVG round-trip → load on DDCS → tweak

**Strengths:**

- Generative art is trivial (any tool that emits SVG → vpype → gcode)
- Path optimization is free and well-tested
- Fast iteration once the config is dialed

**Risks / unknowns:**

- vpype's G-code output assumes a fairly generic controller — need to verify modal behavior plays nice with DDCS
- Terminal-heavy workflow (less GUI than Fusion)

---

## Avenue 2 — Fusion 360 contour toolpaths

**Pitch:** stays in the CAM environment I already know; parametric and visually verifiable.

**Approach:**

- Treat the pen as a 2D contour cutter
- Operation: 2D Contour, no stepover, no lead-in/lead-out, tab disabled
- Pen-down depth = paper Z plus 1–2 mm of intentional overtravel for the spring
- Pen-up clearance = whatever clears jigs/registration pins
- Need a DDCS-tuned post-processor (Fusion's stock posts won't know about G53 syntax / missing G10 / variable quirks)

**What I need to build:**

- Customize or write a Fusion post for DDCS Expert
- A standard sketch-to-CAM template so I'm not redoing operation settings every time

**Strengths:**

- Comfortable, parametric, simulation visible before sending
- Good for jobs that combine art with mechanical features (registration marks, jigs)
- One tool I already maintain

**Risks / unknowns:**

- SVG import in Fusion is mediocre — only handles closed curves cleanly, ignores layers/colors
- Generative art is awkward (would need a Fusion add-in to lay down geometry)
- One CAM operation per "color" / pen change makes multi-pen jobs tedious
- Fusion's optimization is geared for cutting, not pen lifts

---

## Avenue 3 — Affinity Designer

**Pitch:** the design app I likely want to be drawing in anyway, with a real scripting SDK in 2.6+.

Two flavors to consider:

### Flavor A — Affinity as design tool, SVG export → vpype

Same pipeline as Avenue 1; Affinity just replaces Inkscape as the drawing front end. Zero new infrastructure. Worth doing if I prefer Affinity's drawing UX.

### Flavor B — Native Affinity JS script that emits G-code directly

Write a script inside Affinity (using the 2.6+ SDK) that walks the document's curves, reads layer/stroke metadata, and writes G-code to a file. The SDK exposes documents → layers → curves → segments/control points plus stroke/fill data — everything required.

**Strengths:**

- No SVG round-trip; read native curve data, no parsing quirks
- Layer-aware natively → one layer per pen color, script emits `M0` pause + comment between layers
- "Plot" becomes a menu item inside Affinity — no terminal, no external tools
- DDCS-flavored output baked in — emit exactly what the controller wants

**Risks / unknowns:**

- Path optimization (vpype's linemerge / linesort / linesimplify) has to be reimplemented in JS, or…
- Hybrid: script exports stroke-order-optimized SVG → vpype handles geometric optimization → G-code. Best of both, but reintroduces the multi-tool chain
- SDK details unconfirmed — Affinity wasn't running when I checked. Need to pull the exact curve/segment API surface and verify

**To do for this avenue:**

- Open Affinity, query the SDK docs for `Curve`, `Segment`, `Layer`, `Document` APIs
- Prototype: a script that just enumerates all paths in the open doc and prints their segment counts
- Then: stroke-order optimization (nearest-neighbor)
- Then: G-code emission with DDCS-specific header/footer/pen-up/pen-down

---

## Comparison criteria (to fill in once we've tried them)

- Time from "I have an SVG" to "G-code on controller"
- Path optimization quality (count pen lifts, total travel)
- Quality of plotted output
- How painful multi-color / multi-pen jobs are
- How well each handles generative inputs

---

## Open questions

- Pen-up Z height — measure once spring-loaded holder is on the machine
- Pen-down Z overtravel — start at 2 mm, adjust based on line consistency
- Draw feed rate — start ~2000 mm/min, push up until lines degrade
- Rapid feed for pen-up moves — DDCS rapid setting
- Do I need a dwell after pen-down for the ink to start flowing?
- Color change strategy — M0 pause + manual swap? Macro-driven?

---

## Next steps

1. Set up vpype on the workstation; commit a starter `config.toml` to this repo
2. Pull a Fusion post-processor for DDCS (or start from the closest Mach3 post and adapt)
3. With Affinity open, pull the SDK docs for Curve/Segment/Layer; prototype a path-enumeration script
4. Pick one simple test SVG (single-stroke logo or geometric pattern) and run it through all three pipelines
5. Plot all three, compare, record findings here
