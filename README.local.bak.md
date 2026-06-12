# Pen Plotter

Two static HTML apps for driving the Ultimate Bee CNC as a pen plotter via a DDCS Expert 1.1 controller.

- **`plotter.html`** — load an SVG, get DDCS-flavored G-code. No editing.
- **`editor.html`** — interactive editing of an existing SVG before plotting. (In progress; M2.)

Both apps share modules under `src/`.

## Run

ES modules require a web server (`file://` won't load module imports). Easiest:

```
py -3.13 -m http.server 8000
```

Then open <http://localhost:8000/> and pick an app.

## Module layout

```
src/
├── apps/             (reserved for future cross-app entry points)
├── plotter/          plotter app entry + plotter-specific UI
├── editor/           editor app (stub for now)
├── svg/              SVG parsing & flattening to polylines
│   └── elements/     one file per element type (path, polyline, line, rect, circle)
├── geometry/         points, polylines, bounding boxes, transforms
├── optimize/         linemerge / linesort / linesimplify (stubs in M1)
├── gcode/            DDCS dialect, header/footer, emitter
├── canvas/           rendering primitives shared between apps
└── util/             dom/download/format/events helpers
```

One responsibility per file. Adding a new SVG element type, optimization pass, or G-code variant is purely additive — drop a file, register it in the local `index.js`, done.

## Status

- **M1 (current)** — SVG → naive G-code working end-to-end. Optimization passes are stubs (`linemerge`, `linesort`, `linesimplify` are pass-throughs).
- **M2** — port the three vpype optimization passes to JS. Build editor.html (select, delete, reorder, hatch).
- **M3** — DDCS quirk polish, multi-pen layer support, parameter presets.

See `PLAN.md` for the full plan.
