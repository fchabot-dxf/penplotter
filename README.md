# Pen Plotter

SVG → optimized G-code for the Ultimate Bee + DDCS Expert M350 with a
spring-loaded pen mount.

## What's here

**The app** — `start.ps1` launches a local browser-based pen plotter app
with a built-in SVG editor (draw lines / rects / ellipses / polylines /
freehand, organized by layer), live settings, and an Export G-code button
that produces one `.gcode` per layer. Backend is a small Flask server
that shells out to vpype for path optimization and G-code generation.

**The CLI pipeline** — for the same workflow without the GUI, `plot.ps1`
takes an SVG, runs it through vpype, and writes per-layer `.gcode` to
`out/`. Useful for batch jobs and scripting.

Both share the same vpype install, the same DDCS conventions, and produce
the same output format.

---

## Pipeline

```
your.svg
   │
   ▼
vpype read
   │
   ▼  optimize
linemerge      join contiguous segments (fewer pen lifts)
linesort       reorder strokes nearest-neighbor (less travel)
linesimplify   reduce vertex count
   │
   ▼  emit
forlayer + gwrite -p ddcs    one .gcode per SVG layer
   │
   ▼
out/<svg-name>/layer_<id>_<name>.gcode
```

---

## One-time setup

Already done on this machine, recorded for repeatability.

1. **Python 3.13** (vpype's deps don't ship Windows wheels for 3.14 yet —
   Shapely fails to build).

   ```powershell
   winget install --id Python.Python.3.13 -e
   ```

2. **Create the project venv** and install vpype + vpype-gcode:

   ```powershell
   cd C:\Users\danse\APPS\penplotter
   py -3.13 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install --upgrade pip
   .\.venv\Scripts\python.exe -m pip install vpype vpype-gcode
   ```

3. **Verify**:

   ```powershell
   .\.venv\Scripts\vpype.exe --version       # vpype 1.15.0
   .\.venv\Scripts\vpype.exe gwrite --help   # confirms vpype-gcode loaded
   ```

The venv lives inside the project (`.venv/`) and is git-ignored — no
global Python pollution.

---

## Daily use — the app

```powershell
.\start.ps1
```

That starts Flask on http://127.0.0.1:5005/ and opens your browser to it.
Draw, set parameters in the right panel, click **Export G-code (.zip)** —
you get a zip with one `.gcode` per layer. Ctrl+C in the PowerShell window
stops the server.

Frontend code lives in `app/js/` as small ES modules (state, render,
interaction, layers-panel, settings, svg-import, export, etc.) — easy to
modify per feature without touching the rest.

## Daily use — the CLI pipeline

```powershell
.\plot.ps1 -InputSvg .\art\my-drawing.svg
```

That:

1. reads `my-drawing.svg`
2. runs the optimization pipeline
3. writes `out\my-drawing\layer_1_<name>.gcode`, `layer_2_<name>.gcode`, …
   — one file per SVG layer.

Load each `.gcode` on the DDCS, swap pen between files for multi-color jobs.

Options:

| flag | default | what it does |
|---|---|---|
| `-OutputDir` | `out\<svg>\` | override output folder |
| `-Tolerance` | `0.1mm` | linesimplify tolerance — larger = fewer vertices |

Manual one-liner (without the wrapper):

```powershell
.\.venv\Scripts\vpype.exe --config .\vpype.toml `
    read .\art\my-drawing.svg `
    linemerge linesort linesimplify `
    gwrite -p ddcs .\out\single.gcode
```

That collapses all layers into one file — handy for single-pen test plots.

---

## Tuning the output for your hardware

Open [`vpype.toml`](vpype.toml). The four numbers you'll edit are sprinkled
through the template strings (each is paired with an inline G-code comment
so it's easy to find both in the config and in the generated `.gcode`):

| variable | placeholder | where it appears |
|---|---|---|
| **pen-up Z** | `Z5.000` | `document_start`, `line_end`, `document_end` |
| **pen-down Z** | `Z-1.000` | `segment_first` |
| **draw feed** | `F2000` | `segment` |
| **Z feed** | `F1000` | `document_start`, `segment_first`, `line_end`, `document_end` |

Search-and-replace within `vpype.toml` is the fastest workflow.

### Measurements to take once the plotter is built

The current values are starting placeholders only. To dial them in:

- [ ] **Touch off Z=0 at paper surface** — the standard CNC zero procedure
      with the pen tip just kissing the paper.
- [ ] **Pen-up Z** — height clear of paper, jigs, and any registration
      pins. 5–10 mm is typical for plotters; raise if you stack jigs.
- [ ] **Pen-down Z** — start at `-1` to `-2` mm. The spring should be
      compressed enough to keep consistent pressure but not bottomed out.
      Plot a single line and look at it: dropouts → go more negative,
      crushed nib → go less negative.
- [ ] **Draw feed** — start at 2000 mm/min. Increase until lines visibly
      degrade (wobble, dropouts at corners), then back off ~20%.
- [ ] **Z feed** — start at 1000 mm/min. The spring tolerates fast Z moves,
      but DDCS rapid behavior on Z is worth checking. Bump to rapid only
      after a few jobs go cleanly.
- [ ] **Dwell after pen-down?** — open question in PLAN.md. If ink takes a
      moment to flow, add `G4 P0.1` (100 ms dwell) after the pen-down line
      in `segment_first`.

---

## DDCS-specific decisions baked into `vpype.toml`

Cross-referenced against `Fusion360_DDCS_post-processor.cps`:

- **No G10, no G28** — both flagged in `PLAN.md` as broken / unconfigured.
  None appear in the template.
- **Comments use parens** `(like this)` — matches `formatComment` in the
  Fusion post (prefix `(`, suffix `)`).
- **Header** = `G21 G90 G17 G94` — units, absolute, XY plane, feed/min.
  Mirrors the Fusion post's `onOpen()` (minus the cutter-comp / canned-
  cycle cancellations, which aren't relevant to a pen).
- **Footer** = `M30` — same as Fusion.
- **Always explicit X and Y on move lines** — the Fusion post's
  `onRapid`/`onLinear` calls `forceXYZ()` with the comment "Force XYZ
  output for M350 DDCS compatibility". Our template emits both axes on
  every G0/G1 line.
- **Pen lift/lower uses G1 with Z feed**, not G0. Controlled descent is
  gentler on the spring mount than a rapid plunge.
- **One file per layer** (via `forlayer` + `gwrite`) — chosen during
  planning over `M0` color-change pauses. Load each file separately on the
  DDCS for multi-pen jobs.

---

## Files in this repo

```
PLAN.md                              three-avenue evaluation plan
README.md                            this file
start.ps1                            launch the app (Flask + browser)
server.py                            Flask backend: serves the app, runs vpype
app/index.html                       app shell (HTML + CSS)
app/js/                              ES modules — one per concern
    main.js                          entry point, wires everything
    state.js                         single source of truth
    dom.js                           DOM refs + toast
    viewport.js                      pan/zoom, screen↔SVG coords
    render.js                        canvas SVG rebuild
    shapes.js                        SVG element builders, translate, serialize
    layers-panel.js                  left-sidebar layer UI
    tools.js                         tool selection, preview helpers
    interaction.js                   mouse handlers, draw/drag/polyline/freehand
    keyboard.js                      global shortcuts
    svg-import.js                    file/drag-drop import + parsing
    export.js                        Export button → /api/plot → download
    settings.js                      right-sidebar settings panel
vpype.toml                           CLI gwrite profile (edit Z/feeds here)
plot.ps1                             CLI: SVG → per-layer .gcode
test_e2e.ps1                         smoke test: start server, POST SVG, inspect
Fusion360_DDCS_post-processor.cps    reference: Fusion post (Avenue 2 source)
.venv/                               Python venv — git-ignored
out/                                 generated .gcode — git-ignored
```
