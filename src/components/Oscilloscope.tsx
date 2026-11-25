import { useEffect, useMemo } from 'react';
import type { SimConfig } from '../physics/types';
import { buildScene, mainsVoltage } from '../physics/light';
import { effectiveExposure, frameStart, lastCompleteFrame, rowOffset } from '../physics/exposure';
import { fmt, fmtHz } from '../physics/analysis';
import { useAnimatedCanvas } from '../sim/useCanvas';
import { COLORS, drawGrid, niceStep, plotFn } from '../sim/draw';
import { Segmented, Slider, Toggle } from './ui';

export type Trigger = 'frame' | 'mains' | 'free';

export interface ScopeSettings {
  windowMs: number;
  trigger: Trigger;
  showVoltage: boolean;
  showExposure: boolean;
}

export const defaultScope: ScopeSettings = { windowMs: 50, trigger: 'frame', showVoltage: true, showExposure: true };

export function Oscilloscope({ config, settings, onSettings }: { config: SimConfig; settings: ScopeSettings; onSettings: (s: ScopeSettings) => void }) {
  const scene = useMemo(() => buildScene(config), [config.supply, config.lights]);
  const cam = config.camera;
  const { windowMs, trigger, showVoltage, showExposure } = settings;
  const vpk = config.supply.voltageRms * Math.SQRT2;

  const ref = useAnimatedCanvas((ctx, { w, h }, t) => {
    const W = windowMs / 1000;
    const L = 46;
    const Rm = 44;
    const T = 14;
    const B = 26;
    const pw = w - L - Rm;
    const ph = h - T - B;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // trigger
    const f = config.supply.acFreq;
    let tTrig: number;
    let t0: number;
    const n = lastCompleteFrame(cam, t);
    if (trigger === 'frame') {
      tTrig = frameStart(cam, n);
      t0 = tTrig - 0.08 * W;
    } else if (trigger === 'mains') {
      const p = config.supply.phaseDeg / 360;
      const m = Math.floor(t * f + p) - Math.ceil(W * f);
      tTrig = (m - p) / f;
      t0 = tTrig;
    } else {
      tTrig = t;
      t0 = t - W;
    }
    const t1 = t0 + W;
    const X = (tt: number) => L + ((tt - t0) / W) * pw;
    drawGrid(ctx, L, T, pw, ph, 10, 8);
    // zero line
    const yMid = T + ph / 2;
    ctx.strokeStyle = COLORS.gridStrong;
    ctx.beginPath();
    ctx.moveTo(L, yMid + 0.5);
    ctx.lineTo(L + pw, yMid + 0.5);
    ctx.stroke();

    const lref = scene.max > 0 ? scene.max : 1;
    const yLight = (v: number) => T + ph - (v / lref / 1.1) * ph;
    const yVolt = (v: number) => yMid - (v / (vpk * 1.1)) * (ph / 2);

    // exposure windows of rows (top / middle / bottom)
    const Te = effectiveExposure(cam);
    if (showExposure) {
      const H = Math.max(1, Math.round(cam.rows));
      const rowsToShow = cam.shutterType === 'global' ? [{ y: 0, name: 'all rows' }] : [
        { y: 0, name: 'top row' },
        { y: Math.floor(H / 2), name: 'middle row' },
        { y: H - 1, name: 'bottom row' },
      ];
      const frameT = 1 / cam.fps;
      const kStart = Math.floor((t0 - Te - frameT) * cam.fps);
      const kEnd = Math.ceil(t1 * cam.fps);
      for (let k = kStart; k <= kEnd; k++) {
        const fs = frameStart(cam, k);
        if (fs >= t0 && fs <= t1) {
          ctx.strokeStyle = 'rgba(226,232,240,0.35)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(X(fs) + 0.5, T);
          ctx.lineTo(X(fs) + 0.5, T + ph);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = COLORS.textBright;
          ctx.font = '10px ui-monospace, monospace';
          ctx.fillText(`frame ${k}`, X(fs) + 3, T + 10);
        }
        rowsToShow.forEach((r, i) => {
          const ts = fs + rowOffset(cam, r.y);
          const te = ts + Te;
          if (te < t0 || ts > t1) return;
          const col = COLORS.exposure[i];
          const xa = Math.max(L, X(ts));
          const xb = Math.min(L + pw, X(te));
          const band = 9;
          const by = T + ph - (rowsToShow.length - i) * (band + 2) - 2;
          ctx.fillStyle = col + '22';
          ctx.fillRect(xa, T, xb - xa, ph);
          ctx.fillStyle = col + 'aa';
          ctx.fillRect(xa, by, Math.max(1, xb - xa), band);
          // integrated average over window = captured brightness
          const avg = scene.integral(ts, te) / Te;
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(xa, yLight(avg));
          ctx.lineTo(xb, yLight(avg));
          ctx.stroke();
          if (k === n && xb - xa > 30) {
            ctx.fillStyle = col;
            ctx.font = '10px ui-monospace, monospace';
            ctx.fillText(`${r.name}: B=${fmt(avg / lref, 3)}`, xa + 3, yLight(avg) - 4);
          }
        });
      }
    }

    // traces
    if (showVoltage) {
      ctx.strokeStyle = COLORS.voltage;
      ctx.lineWidth = 1.5;
      plotFn(ctx, (tt) => mainsVoltage(config.supply, tt), t0, t1, L, pw, yVolt);
    }
    ctx.strokeStyle = COLORS.light;
    ctx.lineWidth = 2;
    plotFn(ctx, (tt) => scene.valueAt(tt), t0, t1, L, pw, yLight, Math.max(600, Math.floor(pw * 3)));

    // now cursor
    if (t >= t0 && t <= t1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(t) + 0.5, T);
      ctx.lineTo(X(t) + 0.5, T + ph);
      ctx.stroke();
    }

    // axes labels
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = COLORS.text;
    const step = niceStep(windowMs, 8);
    const rel0 = (t0 - tTrig) * 1000;
    const first = Math.ceil(rel0 / step) * step;
    ctx.textAlign = 'center';
    for (let v = first; v <= rel0 + windowMs + 1e-9; v += step) {
      const xx = L + ((v - rel0) / windowMs) * pw;
      ctx.fillText(fmt(v, step < 1 ? 2 : 1), xx, T + ph + 14);
    }
    ctx.fillText(
      `time (ms) relative to ${trigger === 'frame' ? 'frame start' : trigger === 'mains' ? 'mains zero crossing' : 'now'}`,
      L + pw / 2,
      h - 2,
    );
    ctx.textAlign = 'right';
    if (showVoltage) {
      ctx.fillStyle = COLORS.voltage;
      [1, 0.5, 0, -0.5, -1].forEach((k) => ctx.fillText(`${fmt(k * vpk, 0)}`, L - 4, yVolt(k * vpk) + 3));
      ctx.save();
      ctx.translate(10, T + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('voltage (V)', 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.light;
    [0, 0.25, 0.5, 0.75, 1].forEach((k) => ctx.fillText(fmt(k, 2), L + pw + 4, yLight(k * lref) + 3));
    ctx.save();
    ctx.translate(w - 6, T + ph / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('brightness (norm.)', 0, 0);
    ctx.restore();
  });

  // Mouse-wheel zoom on the scope (non-passive so we can prevent page scroll)
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return; // pinch (trackpad) or Ctrl/Alt + scroll
      e.preventDefault();
      const k = Math.exp(e.deltaY * 0.0015);
      onSettings({ ...settings, windowMs: Math.min(400, Math.max(0.5, windowMs * k)) });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [ref, settings, windowMs, onSettings]);

  const dom = scene.models.find((m) => m.fundamental);
  return (
    <div className="scope">
      <div className="scope-stats">
        <span>
          <i style={{ background: COLORS.voltage }} /> AC {config.supply.acFreq} Hz · {fmt(vpk, 0)} V peak
        </span>
        <span>
          <i style={{ background: COLORS.light }} /> Light {dom?.fundamental ? fmtHz(dom.fundamental) : 'steady'}
        </span>
        <span>Peak {fmt(scene.max, 3)}</span>
        <span>Min {fmt(scene.min, 3)}</span>
        <span>Mod. depth {fmt(scene.modDepth * 100, 1)} %</span>
        {showExposure && (
          <span className="exp-legend">
            {cam.shutterType === 'global' ? (
              <>
                <i style={{ background: COLORS.exposure[0] }} /> exposure (all rows)
              </>
            ) : (
              <>
                <i style={{ background: COLORS.exposure[0] }} />
                top <i style={{ background: COLORS.exposure[1] }} />
                middle <i style={{ background: COLORS.exposure[2] }} />
                bottom row exposure
              </>
            )}
          </span>
        )}
      </div>
      <canvas ref={ref} className="scope-canvas" title="Pinch, or Ctrl/Alt + scroll, to zoom" />
      <div className="scope-controls">
        <Slider label="Time window (zoom)" unit="ms" log min={0.5} max={400} value={+windowMs.toFixed(2)} onChange={(v) => onSettings({ ...settings, windowMs: v })} />
        <Segmented
          label="Trigger"
          small
          value={trigger}
          options={[
            { value: 'frame', label: 'Frame start' },
            { value: 'mains', label: 'Mains' },
            { value: 'free', label: 'Free run' },
          ]}
          onChange={(v) => onSettings({ ...settings, trigger: v })}
        />
        <div className="toggles-row">
          <Toggle label="AC voltage" checked={showVoltage} onChange={(v) => onSettings({ ...settings, showVoltage: v })} />
          <Toggle label="Exposure windows" info="integration" checked={showExposure} onChange={(v) => onSettings({ ...settings, showExposure: v })} />
        </div>
      </div>
    </div>
  );
}
