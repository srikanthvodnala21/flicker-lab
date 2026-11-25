// Shared canvas drawing helpers.
export const COLORS = {
  bg: '#070a0e',
  grid: 'rgba(148,163,184,0.10)',
  gridStrong: 'rgba(148,163,184,0.22)',
  text: '#94a3b8',
  textBright: '#e2e8f0',
  voltage: '#f59e0b',
  light: '#38bdf8',
  exposure: ['#a78bfa', '#34d399', '#f472b6'],
  accent: '#38bdf8',
  warn: '#f87171',
};

export function drawGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, nx: number, ny: number) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= nx; i++) {
    const px = Math.round(x + (i / nx) * w) + 0.5;
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
  }
  for (let j = 0; j <= ny; j++) {
    const py = Math.round(y + (j / ny) * h) + 0.5;
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
  }
  ctx.stroke();
}

/** Nice tick step for a given span. */
export function niceStep(span: number, target = 8): number {
  const raw = span / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export function plotFn(
  ctx: CanvasRenderingContext2D,
  fn: (t: number) => number,
  t0: number,
  t1: number,
  x: number,
  w: number,
  mapY: (v: number) => number,
  samples?: number,
) {
  const n = samples ?? Math.max(2, Math.floor(w * 2));
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const px = x + (w * i) / n;
    const py = mapY(fn(t));
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

/** Map normalised brightness (0..1+) to a warm-white light colour. */
export function lightColor(v: number, alpha = 1): string {
  const k = Math.max(0, Math.min(1, v));
  const r = Math.round(30 + 225 * k);
  const g = Math.round(28 + 210 * k);
  const b = Math.round(24 + 170 * k);
  return `rgba(${r},${g},${b},${alpha})`;
}
