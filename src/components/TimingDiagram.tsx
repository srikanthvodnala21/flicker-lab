import { useMemo } from 'react';
import type { SimConfig } from '../physics/types';
import { buildScene } from '../physics/light';
import { effectiveExposure, effectiveReadout, frameStart, lastCompleteFrame, rowOffset } from '../physics/exposure';
import { fmt } from '../physics/analysis';
import { useAnimatedCanvas } from '../sim/useCanvas';
import { COLORS, lightColor, niceStep, plotFn } from '../sim/draw';
import type { SimClock } from '../sim/clock';

/**
 * Row-vs-time diagram. The background is the light intensity over time
 * (vertical stripes). Each horizontal bar is one sensor row's exposure window.
 * Its colour is that row's integrated brightness, which is exactly the
 * brightness that row has in the captured image (shown in the strip on the right).
 */
export function TimingDiagram({ config, clock, bars = 22, height }: { config: SimConfig; clock?: SimClock; bars?: number; height?: number }) {
  const scene = useMemo(() => buildScene(config), [config.supply, config.lights]);
  const cam = config.camera;

  const ref = useAnimatedCanvas((ctx, { w, h }, t) => {
    const Te = effectiveExposure(cam);
    const Tr = effectiveReadout(cam);
    const F = 1 / cam.fps;
    const n = lastCompleteFrame(cam, t);
    const tn = frameStart(cam, n);
    const t0 = tn - 0.06 * F;
    const t1 = tn + F + Tr + Te + 0.06 * F;
    const W = t1 - t0;
    const L = 52;
    const Rm = 64;
    const top = 44;
    const B = 26;
    const pw = w - L - Rm;
    const ph = h - top - B;
    const X = (tt: number) => L + ((tt - t0) / W) * pw;
    const lref = scene.max > 0 ? scene.max : 1;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // light waveform strip
    ctx.strokeStyle = COLORS.grid;
    ctx.strokeRect(L + 0.5, 6.5, pw - 1, top - 14);
    ctx.strokeStyle = COLORS.light;
    ctx.lineWidth = 1.5;
    plotFn(ctx, (tt) => scene.valueAt(tt), t0, t1, L, pw, (v) => 6 + (top - 14) - (v / lref) * (top - 16), Math.max(400, pw * 2));
    ctx.fillStyle = COLORS.light;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('L(t)', L - 6, 22);

    // background: light intensity stripes
    for (let px = 0; px < pw; px += 1) {
      const tt = t0 + (px / pw) * W;
      ctx.fillStyle = lightColor(scene.valueAt(tt) / lref, 0.22);
      ctx.fillRect(L + px, top, 1.2, ph);
    }

    // frame boundaries
    [n, n + 1].forEach((k) => {
      const fs = frameStart(cam, k);
      ctx.strokeStyle = 'rgba(226,232,240,0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(X(fs) + 0.5, 4);
      ctx.lineTo(X(fs) + 0.5, top + ph);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // row exposure bars
    const H = Math.max(1, Math.round(cam.rows));
    const K = Math.min(bars, H);
    const bh = ph / K;
    const strip: number[] = [];
    for (const k of [n + 1, n]) {
      const fs = frameStart(cam, k);
      for (let i = 0; i < K; i++) {
        const y = Math.min(H - 1, Math.floor(((i + 0.5) / K) * H));
        const ts = fs + rowOffset(cam, y);
        const v = scene.integral(ts, ts + Te) / Te;
        if (k === n) strip[i] = v;
        const yy = top + i * bh;
        const xa = X(ts);
        const xb = X(ts + Te);
        ctx.fillStyle = k === n ? lightColor(v / lref, 0.95) : lightColor(v / lref, 0.35);
        ctx.fillRect(xa, yy + 1, Math.max(1.5, xb - xa), Math.max(1, bh - 2));
        ctx.strokeStyle = k === n ? 'rgba(56,189,248,0.9)' : 'rgba(56,189,248,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(xa + 0.5, yy + 1.5, Math.max(1, xb - xa - 1), Math.max(1, bh - 3));
      }
    }
    // readout start / end lines for frame n
    if (Tr > 0) {
      const yTop = top;
      const yBot = top + ph;
      const s0 = cam.scanDir === 'down' ? tn : tn + Tr;
      const s1 = cam.scanDir === 'down' ? tn + Tr : tn;
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(s0), yTop);
      ctx.lineTo(X(s1), yBot);
      ctx.stroke();
      ctx.strokeStyle = COLORS.warn;
      ctx.beginPath();
      ctx.moveTo(X(s0 + Te), yTop);
      ctx.lineTo(X(s1 + Te), yBot);
      ctx.stroke();
    }
    // now cursor
    if (t >= t0 && t <= t1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(X(t) + 0.5, 4);
      ctx.lineTo(X(t) + 0.5, top + ph);
      ctx.stroke();
    }

    // captured image strip (frame n)
    const sx = L + pw + 14;
    const sw = 30;
    for (let i = 0; i < K; i++) {
      ctx.fillStyle = lightColor((strip[i] ?? 0) / lref);
      ctx.fillRect(sx, top + i * bh, sw, Math.ceil(bh));
    }
    ctx.strokeStyle = COLORS.gridStrong;
    ctx.strokeRect(sx + 0.5, top + 0.5, sw, ph);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.fillText('image', sx + sw / 2, top - 4);
    ctx.fillText(`frame ${n}`, sx + sw / 2, top + ph + 14);

    // labels
    ctx.save();
    ctx.translate(14, top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(cam.scanDir === 'down' ? 'sensor row  (top → bottom)' : 'sensor row  (bottom-first scan)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'right';
    ctx.fillText('row 0', L - 4, top + 10);
    ctx.fillText(`row ${H - 1}`, L - 4, top + ph - 2);
    ctx.textAlign = 'center';
    const span = W * 1000;
    const step = niceStep(span, 8);
    const rel0 = (t0 - tn) * 1000;
    for (let v = Math.ceil(rel0 / step) * step; v <= rel0 + span; v += step) {
      ctx.fillText(fmt(v, 1), L + ((v - rel0) / span) * pw, top + ph + 14);
    }
    ctx.fillText('time since frame start (ms)', L + pw / 2, h - 2);
    ctx.textAlign = 'left';
  }, clock);

  return <canvas ref={ref} className="timing-canvas" style={height ? { height } : undefined} />;
}

export function TimingLegend() {
  return (
    <div className="legend-row">
      <span>
        <i style={{ background: '#e2d8c0' }} /> background = light L(t)
      </span>
      <span>
        <i style={{ background: '#38bdf8' }} /> bars = each row's exposure window (colour = integrated brightness)
      </span>
      <span>
        <i style={{ background: '#a78bfa' }} /> exposure start
      </span>
      <span>
        <i style={{ background: '#f87171' }} /> readout (exposure end)
      </span>
    </div>
  );
}
