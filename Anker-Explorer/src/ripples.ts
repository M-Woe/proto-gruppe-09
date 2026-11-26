// Background of the 3D views: a dot grid gently rippling like water (a few long swells crossing, plus a ring wherever
// `clickTarget` is pressed), after the Sketch2Feedback bridge's ripples.js. Colour from the palette's `--dot`; drawn
// once (still) with "reduce motion". Pure decoration: it carries no data.

interface Swell { kx: number; ky: number; ux: number; uy: number; omega: number; amp: number }

export function startRipples(canvas: HTMLCanvasElement, clickTarget: HTMLElement = canvas): void {
  const ctx = canvas.getContext("2d")!;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const drops: { x: number; y: number; t: number }[] = [];
  let cw = 0;
  let ch = 0;
  let dot = "150, 140, 122";
  const readDot = () => (dot = getComputedStyle(document.documentElement).getPropertyValue("--dot").trim() || dot);
  function size(): void {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cw = r.width;
    ch = r.height;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const swells: Swell[] = [
    { dir: 0.35, length: 420, speed: 48, amp: 3.2 },
    { dir: 2.3, length: 260, speed: 35, amp: 2.0 },
    { dir: 4.1, length: 170, speed: 26, amp: 1.2 },
  ].map((w) => ({
    kx: (Math.cos(w.dir) * 2 * Math.PI) / w.length, ky: (Math.sin(w.dir) * 2 * Math.PI) / w.length,
    ux: Math.cos(w.dir), uy: Math.sin(w.dir), omega: (2 * Math.PI * w.speed) / w.length, amp: w.amp,
  }));
  function draw(t: number): void {
    if (!cw) size();
    ctx.clearRect(0, 0, cw, ch);
    const step = 22;
    const s = t / 1000;
    const driftX = Math.sin(s * 0.09) * 6;
    const driftY = Math.cos(s * 0.067) * 4;
    for (let i = drops.length - 1; i >= 0; i--) if (s - drops[i].t > 4) drops.splice(i, 1);
    for (let y = step / 2 - step; y < ch + step; y += step) {
      for (let x = step / 2 - step; x < cw + step; x += step) {
        let dx = driftX;
        let dy = driftY;
        let lift = 0;
        for (const w of swells) {
          const phase = w.kx * x + w.ky * y - w.omega * s;
          const c = Math.cos(phase);
          dx += w.ux * w.amp * c;
          dy += w.uy * w.amp * c;
          lift += Math.sin(phase) * w.amp;
        }
        for (const drop of drops) {
          const age = s - drop.t;
          const vx = x - drop.x;
          const vy = y - drop.y;
          const d = Math.hypot(vx, vy) || 1;
          const front = age * 120;
          const band = Math.exp(-((d - front) ** 2) / 500) * Math.max(0, 1 - age / 4) ** 2;
          const v = Math.sin((d - front) * 0.14) * 2.2 * band;
          dx += (vx / d) * v;
          dy += (vy / d) * v;
          lift += v * 0.8;
        }
        const crest = lift / 6.4;
        ctx.fillStyle = `rgba(${dot}, ${Math.min(0.5, Math.max(0.1, 0.25 + crest * 0.13))})`;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 1.05 + Math.max(0, crest) * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (!still) requestAnimationFrame(draw);
  }
  clickTarget.addEventListener("pointerdown", (event) => {
    const r = canvas.getBoundingClientRect();
    drops.push({ x: event.clientX - r.left, y: event.clientY - r.top, t: performance.now() / 1000 });
  });
  new ResizeObserver(() => {
    size();
    if (still) draw(0);
  }).observe(canvas);
  readDot();
  window.addEventListener("themechange", () => {
    readDot();
    if (still) draw(0);
  });
  // Arriving through a tab: start once the page has settled, so the entrance stays smooth.
  if ((window as unknown as { shellArriving?: boolean }).shellArriving) setTimeout(() => requestAnimationFrame(draw), 420);
  else requestAnimationFrame(draw);
}
