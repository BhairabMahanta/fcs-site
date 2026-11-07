/*
 * js/lib/pixel-field.js
 * ------------------------------------------------------------------
 * The twinkling pixel field used behind the admin gate. Extracted so the
 * member profile page can share the same quiet background.
 * ------------------------------------------------------------------
 */

export function startPixelField(canvas, { active = () => true, opacity = 1 } = {}) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const STEP = 16;
  const SIZE = 3;
  let cols = 0;
  let rows = 0;
  let cells = [];

  const colors = () => {
    const css = getComputedStyle(document.documentElement);
    return {
      ink: css.getPropertyValue("--ink").trim(),
      accent: css.getPropertyValue("--accent").trim(),
    };
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(innerWidth / STEP);
    rows = Math.ceil(innerHeight / STEP);
    cells = Array.from({ length: cols * rows }, () => ({
      a: Math.random() < 0.55 ? 0 : Math.random() * 0.35,
      yellow: Math.random() < 0.05,
    }));
  };

  const draw = () => {
    const { ink, accent } = colors();
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    const reach = Math.hypot(cx, cy);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell.a) continue;
      const x = (i % cols) * STEP + (STEP - SIZE) / 2;
      const y = Math.floor(i / cols) * STEP + (STEP - SIZE) / 2;
      const edge = Math.min(1, Math.hypot(x - cx, y - cy) / reach + 0.15);
      ctx.globalAlpha = cell.a * edge * (cell.yellow ? 2.2 : 1) * opacity;
      ctx.fillStyle = cell.yellow ? accent : ink;
      ctx.fillRect(x, y, SIZE, SIZE);
    }
    ctx.globalAlpha = 1;
  };

  resize();
  draw();
  window.addEventListener("resize", () => {
    resize();
    draw();
  });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let last = 0;
  const tick = (time) => {
    if (!active()) return;
    if (time - last > 80 && !document.hidden) {
      last = time;
      for (let n = 0; n < Math.ceil(cells.length * 0.02); n++) {
        const cell = cells[(Math.random() * cells.length) | 0];
        cell.a = Math.random() < 0.5 ? 0 : Math.random() * 0.35;
      }
      draw();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
