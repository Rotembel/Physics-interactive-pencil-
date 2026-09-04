// Sketch Physics
// Draw shapes, ramps, and pendulum pins with an Apple Pencil (or mouse/touch)
// and watch a real 2D physics engine (Matter.js) act on them.

(function () {
  "use strict";

  const { Engine, World, Bodies, Body, Composite, Constraint, Vector, Vertices, Query } = Matter;

  // ---------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------
  const canvas = document.getElementById("physicsCanvas");
  const ctx = canvas.getContext("2d");
  const toolGroup = document.getElementById("toolGroup");
  const toolTip = document.getElementById("toolTip");
  const gravitySlider = document.getElementById("gravitySlider");
  const frictionSlider = document.getElementById("frictionSlider");
  const restitutionSlider = document.getElementById("restitutionSlider");
  const playBtn = document.getElementById("playBtn");
  const resetBtn = document.getElementById("resetBtn");

  // ---------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------
  const TOOL_TIPS = {
    shape: "Draw a closed shape, then press Play — gravity pulls it down and it collides realistically with everything else.",
    ramp: "Draw a line or curve to create a fixed ramp. Steeper inclines and higher friction change how fast things slide.",
    pin: "Tap a shape to pin one point to a fixed anchor, turning it into a pendulum. Where you tap changes how it swings.",
    erase: "Tap any shape, ramp, or pin to remove it.",
  };

  let currentTool = "shape";

  function setTool(tool) {
    currentTool = tool;
    [...toolGroup.children].forEach((btn) => {
      btn.setAttribute("aria-checked", String(btn.dataset.tool === tool));
    });
    toolTip.textContent = TOOL_TIPS[tool];
  }

  toolGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".tool-btn");
    if (btn) setTool(btn.dataset.tool);
  });

  setTool("shape");

  // ---------------------------------------------------------------------
  // Physics engine setup
  // ---------------------------------------------------------------------
  const engine = Engine.create();
  const world = engine.world;
  world.gravity.y = Number(gravitySlider.value);

  let isPlaying = false;
  let lastTime = null;

  const PASTELS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];
  let colorIndex = 0;
  function nextColor() {
    const c = PASTELS[colorIndex % PASTELS.length];
    colorIndex++;
    return c;
  }

  function currentMaterial() {
    return {
      friction: Number(frictionSlider.value),
      restitution: Number(restitutionSlider.value),
      frictionAir: 0.012,
    };
  }

  gravitySlider.addEventListener("input", () => {
    world.gravity.y = Number(gravitySlider.value);
  });

  // Walls so shapes don't fly off forever (recreated on resize).
  let walls = [];
  function buildWalls() {
    walls.forEach((w) => World.remove(world, w));
    const rect = canvas.getBoundingClientRect();
    const t = 40;
    walls = [
      Bodies.rectangle(rect.width / 2, rect.height + t / 2, rect.width + t * 2, t, { isStatic: true }),
      Bodies.rectangle(rect.width / 2, -t / 2, rect.width + t * 2, t, { isStatic: true }),
      Bodies.rectangle(-t / 2, rect.height / 2, t, rect.height + t * 2, { isStatic: true }),
      Bodies.rectangle(rect.width + t / 2, rect.height / 2, t, rect.height + t * 2, { isStatic: true }),
    ];
    walls.forEach((w) => (w.plugin = { hidden: true }));
    World.add(world, walls);
  }

  // ---------------------------------------------------------------------
  // Stroke -> polygon helpers
  // ---------------------------------------------------------------------
  const RAMP_THICKNESS = 16;

  function simplify(points, minDist) {
    if (points.length < 2) return points;
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = out[out.length - 1];
      const p = points[i];
      if (Math.hypot(p.x - prev.x, p.y - prev.y) >= minDist) out.push(p);
    }
    return out;
  }

  function bandOffset(points, thickness) {
    const half = thickness / 2;
    const top = [];
    const bottom = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      // perpendicular
      const nx = -dy;
      const ny = dx;
      const p = points[i];
      top.push({ x: p.x + nx * half, y: p.y + ny * half });
      bottom.push({ x: p.x - nx * half, y: p.y - ny * half });
    }
    return top.concat(bottom.reverse());
  }

  function addBodyFromPoints(rawPoints, { thicken }) {
    let points = simplify(rawPoints, 3);
    if (points.length < 2) return null;
    const poly = thicken ? bandOffset(points, RAMP_THICKNESS) : points;
    const hull = Vertices.hull(poly);
    if (hull.length < 3) return null;
    const centre = Vertices.centre(hull);
    const material = currentMaterial();
    const body = Bodies.fromVertices(
      centre.x,
      centre.y,
      [hull],
      {
        isStatic: thicken,
        friction: material.friction,
        restitution: material.restitution,
        frictionAir: material.frictionAir,
      },
      true
    );
    if (!body) return null;
    body.plugin = { color: thicken ? "#94a3b8" : nextColor() };
    World.add(world, body);
    return body;
  }

  // ---------------------------------------------------------------------
  // Drawing input (Apple Pencil aware)
  // ---------------------------------------------------------------------
  let drawing = false;
  let activePointerId = null;
  let activePointerType = null;
  let strokePoints = [];
  let strokeWidths = [];

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pressureWidth(e) {
    const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
    return 2 + pressure * 5;
  }

  function handlePointerDown(e) {
    if (!e.isPrimary) return;
    if (e.pointerType === "touch" && activePointerType === "pen") return;

    const point = canvasPoint(e);

    if (currentTool === "pin") {
      pinAt(point);
      return;
    }
    if (currentTool === "erase") {
      eraseAt(point);
      return;
    }

    drawing = true;
    activePointerId = e.pointerId;
    activePointerType = e.pointerType;
    canvas.setPointerCapture(e.pointerId);
    strokePoints = [point];
    strokeWidths = [pressureWidth(e)];
  }

  function handlePointerMove(e) {
    if (!drawing || e.pointerId !== activePointerId) return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
    (events.length ? events : [e]).forEach((ev) => {
      strokePoints.push(canvasPoint(ev));
      strokeWidths.push(pressureWidth(ev));
    });
  }

  function endStroke(e) {
    if (e && e.pointerId !== activePointerId) return;
    if (drawing && strokePoints.length >= 2) {
      addBodyFromPoints(strokePoints, { thicken: currentTool === "ramp" });
    }
    drawing = false;
    activePointerId = null;
    activePointerType = null;
    strokePoints = [];
    strokeWidths = [];
  }

  function pinAt(point) {
    const bodies = Composite.allBodies(world).filter((b) => !b.isStatic && !(b.plugin && b.plugin.hidden));
    const hits = Query.point(bodies, point);
    const target = hits[0];
    if (!target) return;
    const constraint = Constraint.create({
      bodyA: target,
      pointA: { x: point.x - target.position.x, y: point.y - target.position.y },
      pointB: { x: point.x, y: point.y },
      length: 0,
      stiffness: 1,
    });
    constraint.plugin = { isPin: true };
    World.add(world, constraint);
  }

  function eraseAt(point) {
    const bodies = Composite.allBodies(world).filter((b) => !(b.plugin && b.plugin.hidden));
    const hits = Query.point(bodies, point);
    if (hits[0]) {
      World.remove(world, hits[0]);
      Composite.allConstraints(world)
        .filter((c) => c.bodyA === hits[0] || c.bodyB === hits[0])
        .forEach((c) => World.remove(world, c));
      return;
    }
    // Otherwise erase the nearest pin constraint within a small radius.
    const constraints = Composite.allConstraints(world).filter((c) => c.plugin && c.plugin.isPin);
    for (const c of constraints) {
      const anchor = c.pointB;
      if (Math.hypot(anchor.x - point.x, anchor.y - point.y) < 20) {
        World.remove(world, c);
        return;
      }
    }
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("pointerleave", endStroke);

  // ---------------------------------------------------------------------
  // Play / Reset
  // ---------------------------------------------------------------------
  playBtn.addEventListener("click", () => {
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? "⏸ Pause" : "▶ Play";
    lastTime = null;
  });

  resetBtn.addEventListener("click", () => {
    Composite.allBodies(world)
      .filter((b) => !(b.plugin && b.plugin.hidden))
      .forEach((b) => World.remove(world, b));
    Composite.allConstraints(world).forEach((c) => World.remove(world, c));
    isPlaying = false;
    playBtn.textContent = "▶ Play";
    colorIndex = 0;
  });

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function drawBody(body) {
    if (body.plugin && body.plugin.hidden) return;
    const vertices = body.vertices;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
    ctx.fillStyle = (body.plugin && body.plugin.color) || (body.isStatic ? "#94a3b8" : "#60a5fa");
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawConstraint(c) {
    if (!(c.plugin && c.plugin.isPin)) return;
    const a = c.bodyA
      ? Vector.add(c.bodyA.position, Vector.rotate(c.pointA, c.bodyA.angle))
      : c.pointA;
    const b = c.pointB;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = "#1d1d1f";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#1d1d1f";
    ctx.fill();
  }

  function drawLiveStroke() {
    if (strokePoints.length < 2) return;
    for (let i = 1; i < strokePoints.length; i++) {
      const a = strokePoints[i - 1];
      const b = strokePoints[i];
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineWidth = strokeWidths[i];
      ctx.strokeStyle = currentTool === "ramp" ? "#64748b" : "#1d4ed8";
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildWalls();
  }

  function loop(time) {
    if (isPlaying) {
      if (lastTime != null) {
        const delta = Math.min(33, time - lastTime);
        Engine.update(engine, delta);
      }
      lastTime = time;
    } else {
      lastTime = null;
    }

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    Composite.allBodies(world).forEach(drawBody);
    Composite.allConstraints(world).forEach(drawConstraint);
    drawLiveStroke();

    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  requestAnimationFrame(loop);
})();
