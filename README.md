# Sketch Physics

An interactive way to learn physics by drawing, built for **iPad + Apple
Pencil**. Draw a shape, a ramp, or pin a pendulum with the Pencil, press
Play, and a real 2D physics engine ([Matter.js](https://brm.io/matter-js/))
takes over — gravity, collisions, friction, and restitution all behave like
the real thing, and you can tune them live to see how each one changes the
outcome.

## Tools

- **🔷 Shape** — draw a closed outline (a "loop") and it becomes a dynamic
  body affected by gravity and collisions once you hit Play.
- **📐 Ramp** — draw a line or curve to create a fixed (static) ramp or
  platform. Combine with the Shape tool to explore inclined planes and
  friction.
- **📌 Pin** — tap a point on a shape to pin it to a fixed anchor, turning
  it into a pendulum. Where you tap (near the edge vs. near the center)
  changes how it swings.
- **🧹 Erase** — tap any shape, ramp, or pin to remove it.

## Physics controls

- **Gravity** — scales how strongly everything is pulled downward.
- **Friction** — how much surfaces resist sliding against each other.
  Applies to new shapes/ramps drawn after the slider is changed.
- **Bounciness (restitution)** — how much energy is kept in a collision.
  Low = objects settle quickly; high = they bounce around.

Press **▶ Play** to start the simulation, **⏸ Pause** to freeze it (you can
still draw while paused), and **⟲ Reset** to clear everything.

## Running it locally

No build step or dependencies beyond the Matter.js CDN script already
referenced in `index.html`.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

On an iPad, serve it on the same network and open the URL in Safari, or
just open `index.html` directly on desktop first to try it with a mouse.

## iPad / Apple Pencil notes

- Drawing uses the **Pointer Events API**, which Safari on iPadOS reports
  Apple Pencil pressure (`event.pressure`) and pointer type
  (`event.pointerType === "pen"`) through — used here to vary the live
  stroke width while sketching.
- `touch-action: none` on the canvas stops Safari from scrolling/zooming
  while drawing.
- Once a Pencil stroke starts, incidental touch input (e.g. a resting palm)
  is ignored until that stroke ends — basic palm rejection.
- `getCoalescedEvents()` is used to capture the full resolution of fast
  Pencil strokes rather than only the throttled events the browser
  dispatches by default.

## How drawing becomes physics

A drawn stroke's points are simplified, then turned into a convex polygon
(`Matter.Vertices.hull`) and added to the world as a body:

- **Shape** strokes become the polygon directly (draw a loop with real
  area).
- **Ramp** strokes are "thickened" into a band around the stroke path
  before hulling, so even a single line becomes a solid static ramp.

Note: because bodies are built from the convex hull of the stroke, a very
wiggly or concave drawing will simplify to its outer hull rather than
keeping every dent — good enough for exploring the physics concepts here,
but worth knowing if a shape looks smoothed out.

## Project structure

```
index.html   - page structure/markup
style.css    - visual styling, light/dark aware
script.js    - drawing input, stroke-to-body conversion, Matter.js engine + render loop
```

## Ideas for later

- A "concept" mode with guided challenges (e.g. "build a ramp shallow
  enough that a block won't slide").
- Save/load a sketch scene.
- Multi-touch two-finger pan/zoom on the canvas.
