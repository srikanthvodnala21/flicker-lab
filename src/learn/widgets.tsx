import { useEffect, useMemo, useState } from 'react';
import { buildLight, buildScene, valueAt } from '../physics/light';
import { defaultCamera, defaultLight } from '../physics/presets';
import { effectiveExposure, frameStart, rowOffset } from '../physics/exposure';
import { exposureContrast, fmt, fmtHz, formatShutter, sincAttenuation } from '../physics/analysis';
import type { SimConfig } from '../physics/types';
import { useAnimatedCanvas, useLocalClock } from '../sim/useCanvas';
import { COLORS, drawGrid, lightColor, plotFn } from '../sim/draw';
import { Segmented, Slider } from '../components/ui';
import { CameraView } from '../components/CameraView';
import { TimingDiagram } from '../components/TimingDiagram';
import type { SimClock } from '../sim/clock';

function useSlowClock(speed: number): SimClock {
  const clock = useLocalClock();
  useEffect(() => {
    clock.speed = speed;
  }, [clock, speed]);
  return clock;
}

function SpeedPicker({ value, onChange, options }: { value: number; onChange: (v: number) => void; options: number[] }) {
  return (
    <Segmented
      small
      label="Playback speed"
      value={value}
      options={options.map((o) => ({ value: o, label: `${o}×` }))}
      onChange={onChange}
    />
  );
}

// ---------------- Module 1: AC & rectification ----------------
export function AcDemo() {
  const [f, setF] = useState(50);
  const [rect, setRect] = useState<'none' | 'half' | 'full'>('full');
  const [speed, setSpeed] = useState(0.02);
  const clock = useSlowClock(speed);
  const pulses = rect === 'none' ? 0 : rect === 'half' ? f : 2 * f;

  const ref = useAnimatedCanvas((ctx, { w, h }, t) => {
    const L = 40;
    const pw = w - L - 70;
    const span = 3 / f; // 3 cycles
    const t0 = Math.floor(t / span) * span;
    const ph = (h - 30) / 2;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    drawGrid(ctx, L, 8, pw, ph - 8, 12, 4);
    drawGrid(ctx, L, ph + 14, pw, ph - 8, 12, 4);
    const vy = (v: number) => 8 + (ph - 8) / 2 - v * ((ph - 8) / 2 - 4);
    const ry = (v: number) => ph + 14 + (ph - 8) - v * (ph - 12);
    const sin = (tt: number) => Math.sin(2 * Math.PI * f * tt);
    const out = (tt: number) => (rect === 'none' ? sin(tt) : rect === 'full' ? Math.abs(sin(tt)) : Math.max(0, sin(tt)));
    ctx.strokeStyle = COLORS.voltage;
    ctx.lineWidth = 2;
    plotFn(ctx, sin, t0, t0 + span, L, pw, vy);
    ctx.strokeStyle = COLORS.light;
    plotFn(ctx, rect === 'none' ? (tt) => Math.abs(sin(tt)) : out, t0, t0 + span, L, pw, ry);
    // cursor
    const x = L + ((t - t0) / span) * pw;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, h - 16);
    ctx.stroke();
    ctx.fillStyle = COLORS.voltage;
    ctx.beginPath();
    ctx.arc(x, vy(sin(t)), 4, 0, 7);
    ctx.fill();
    // labels
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = COLORS.voltage;
    ctx.fillText('+325 V', 2, 14);
    ctx.fillText('−325 V', 2, ph - 2);
    ctx.fillStyle = COLORS.light;
    ctx.fillText(rect === 'none' ? '|V| lamp' : 'rectified', 2, ph + 26);
    ctx.fillStyle = COLORS.text;
    for (let k = 0; k <= 3; k++) ctx.fillText(`${fmt((k / f) * 1000, 1)} ms`, L + (k / 3) * pw - 14, h - 2);
    // bulb
    const b = rect === 'none' ? Math.abs(sin(t)) : out(t);
    const bx = w - 34;
    const by = h / 2;
    ctx.fillStyle = lightColor(b);
    ctx.shadowColor = lightColor(b, 0.9);
    ctx.shadowBlur = 24 * b;
    ctx.beginPath();
    ctx.arc(bx, by, 18, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.fillText('lamp', bx, by + 34);
    ctx.textAlign = 'left';
  }, clock);

  return (
    <div className="widget">
      <canvas ref={ref} className="widget-canvas" />
      <div className="widget-controls">
        <Segmented label="Mains" value={f} options={[{ value: 50, label: '50 Hz' }, { value: 60, label: '60 Hz' }]} onChange={setF} />
        <Segmented
          label="Rectifier"
          value={rect}
          options={[
            { value: 'none', label: 'None (raw AC)' },
            { value: 'half', label: 'Half-wave' },
            { value: 'full', label: 'Full-wave' },
          ]}
          onChange={setRect}
        />
        <SpeedPicker value={speed} onChange={setSpeed} options={[0.005, 0.02, 0.1]} />
        <div className="widget-readout">
          Voltage: <b>{f} cycles/s</b> (period {fmt(1000 / f, 2)} ms) · Brightness pulses: <b>{rect === 'none' ? `${2 * f}/s (|V| peaks twice per cycle)` : `${pulses}/s`}</b>
        </div>
      </div>
    </div>
  );
}

// ---------------- Module 2: different LED drivers on the same supply ----------------
export function LedDriversDemo() {
  const [speed, setSpeed] = useState(0.01);
  const clock = useSlowClock(speed);
  const supply = { acFreq: 50, voltageRms: 230, phaseDeg: 0 };
  const models = useMemo(
    () => [
      { name: 'Cheap bulb: full-wave, small capacitor', m: buildLight(defaultLight({ type: 'led_ac', modDepth: 1 }), supply) },
      { name: 'Better bulb: full-wave, 30 % ripple', m: buildLight(defaultLight({ type: 'led_ac', modDepth: 0.3 }), supply) },
      { name: 'Half-wave driver (50 Hz flicker)', m: buildLight(defaultLight({ type: 'led_ac', rectification: 'half', modDepth: 1 }), supply) },
      { name: 'PWM dimmer at 1 kHz, 40 % duty', m: buildLight(defaultLight({ type: 'led_pwm', pwmFreq: 1000, duty: 0.4, modDepth: 1 }), supply) },
      { name: 'Constant-current driver', m: buildLight(defaultLight({ type: 'led_cc', modDepth: 0 }), supply) },
    ],
    [],
  );
  const ref = useAnimatedCanvas((ctx, { w, h }, t) => {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    const span = 0.04;
    const t0 = Math.floor(t / span) * span;
    const L = 8;
    const pw = w - L - 64;
    const rowH = h / models.length;
    models.forEach(({ name, m }, i) => {
      const y0 = i * rowH;
      ctx.strokeStyle = COLORS.grid;
      ctx.strokeRect(L + 0.5, y0 + 16.5, pw, rowH - 22);
      ctx.strokeStyle = COLORS.light;
      ctx.lineWidth = 1.5;
      plotFn(ctx, (tt) => valueAt(m, tt), t0, t0 + span, L, pw, (v) => y0 + rowH - 8 - v * (rowH - 26), 1200);
      ctx.fillStyle = COLORS.textBright;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${name} · ${m.fundamental ? fmtHz(m.fundamental) : 'steady'} · ${fmt(m.modDepth * 100, 0)} % flicker`, L + 2, y0 + 12);
      const v = valueAt(m, t);
      const bx = w - 30;
      const by = y0 + rowH / 2 + 4;
      ctx.fillStyle = lightColor(v);
      ctx.shadowColor = lightColor(v, 0.9);
      ctx.shadowBlur = 16 * v;
      ctx.beginPath();
      ctx.arc(bx, by, 11, 0, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    const x = L + ((t - t0) / span) * pw;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }, clock);
  return (
    <div className="widget">
      <canvas ref={ref} className="widget-canvas tall" />
      <div className="widget-controls">
        <SpeedPicker value={speed} onChange={setSpeed} options={[0.002, 0.01, 0.05]} />
        <div className="widget-readout">All five bulbs share the same 230 V / 50 Hz supply. 40 ms window (two mains cycles).</div>
      </div>
    </div>
  );
}

// ---------------- Module 3: exposure integration ----------------
export function ExposureDemo() {
  const [denom, setDenom] = useState(200);
  const [speed, setSpeed] = useState(0.02);
  const clock = useSlowClock(speed);
  const scene = useMemo(() => buildScene({ supply: { acFreq: 50, voltageRms: 230, phaseDeg: 0 }, lights: [defaultLight({ modDepth: 0.8 })] }), []);
  const Te = 1 / denom;
  const contrast = useMemo(() => exposureContrast(scene, Te), [scene, Te]);

  const ref = useAnimatedCanvas((ctx, { w, h }, t) => {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    const L = 40;
    const pw = w - L - 10;
    const top = 10;
    const ph = h * 0.55;
    const span = 0.05;
    const t0 = 0;
    const X = (tt: number) => L + ((tt - t0) / span) * pw;
    const yv = (v: number) => top + ph - (v / scene.max) * (ph - 6);
    drawGrid(ctx, L, top, pw, ph, 10, 4);
    // sliding window position cycles through 20 ms
    const start = ((t * 1) % 0.02) + 0.005;
    ctx.fillStyle = 'rgba(167,139,250,0.25)';
    ctx.fillRect(X(start), top, X(start + Te) - X(start), ph);
    ctx.fillStyle = 'rgba(56,189,248,0.35)';
    ctx.beginPath();
    ctx.moveTo(X(start), yv(0));
    const n = 200;
    for (let i = 0; i <= n; i++) {
      const tt = start + (Te * i) / n;
      ctx.lineTo(X(tt), yv(scene.valueAt(tt)));
    }
    ctx.lineTo(X(start + Te), yv(0));
    ctx.fill();
    ctx.strokeStyle = COLORS.light;
    ctx.lineWidth = 2;
    plotFn(ctx, scene.valueAt, t0, t0 + span, L, pw, yv);
    const avg = scene.integral(start, start + Te) / Te;
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(start), yv(avg));
    ctx.lineTo(X(start + Te), yv(avg));
    ctx.stroke();
    ctx.fillStyle = '#a78bfa';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`average = ${fmt(avg / scene.max, 3)}`, Math.min(X(start + Te) + 4, w - 120), yv(avg) - 4);

    // captured brightness vs start time
    const top2 = top + ph + 24;
    const ph2 = h - top2 - 18;
    drawGrid(ctx, L, top2, pw, ph2, 10, 2);
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    plotFn(ctx, (tt) => scene.integral(tt, tt + Te) / Te, t0, t0 + span, L, pw, (v) => top2 + ph2 - (v / scene.max) * ph2, 400);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(X(start), top2 + ph2 - (avg / scene.max) * ph2, 4, 0, 7);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('L(t)', 4, top + 12);
    ctx.fillText('B(start)', 2, top2 + 12);
    for (let k = 0; k <= 5; k++) ctx.fillText(`${k * 10} ms`, L + (k / 5) * pw - (k === 5 ? 34 : 8), h - 4);
  }, clock);

  return (
    <div className="widget">
      <canvas ref={ref} className="widget-canvas tall" />
      <div className="widget-controls">
        <Segmented
          label="Shutter speed"
          small
          value={denom}
          options={[25, 50, 60, 100, 120, 200, 500, 1000].map((d) => ({ value: d, label: `1/${d}` }))}
          onChange={setDenom}
        />
        <SpeedPicker value={speed} onChange={setSpeed} options={[0.005, 0.02, 0.1]} />
        <div className="widget-readout">
          Exposure {fmt(Te * 1000, 2)} ms = <b>{fmt(Te * 100, 2)} light cycles</b> at 100 Hz · |sinc| = {fmt(sincAttenuation(100, Te) * 100, 1)} % · max row-to-row contrast{' '}
          <b className={contrast < 0.01 ? 'good-text' : 'bad-text'}>{fmt(contrast * 100, 1)} %</b>
        </div>
      </div>
    </div>
  );
}

// ---------------- Module 4: sensor scanning ----------------
export function ScanDemo() {
  const [type, setType] = useState<'rolling' | 'global'>('rolling');
  const [speed, setSpeed] = useState(0.01);
  const clock = useSlowClock(speed);
  const cam = useMemo(() => defaultCamera({ fps: 25, exposure: 1 / 100, readoutMs: 22, rows: 12, shutterType: type }), [type]);
  const config: SimConfig = useMemo(
    () => ({ supply: { acFreq: 50, voltageRms: 230, phaseDeg: 0 }, lights: [defaultLight({ modDepth: 0.9 })], camera: { ...cam, rows: 16 } }),
    [cam],
  );
  const ref = useAnimatedCanvas((ctx, { w, h }, t) => {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    const rows = 12;
    const sw = Math.min(w - 20, 340);
    const sx = (w - sw) / 2;
    const sy = 22;
    const rh = (h - 40) / rows;
    const Te = effectiveExposure(cam);
    const n = Math.floor(t * cam.fps);
    ctx.fillStyle = COLORS.text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(type === 'rolling' ? 'CMOS rolling shutter: rows start one after another' : 'Global shutter: all rows together', w / 2, 14);
    ctx.textAlign = 'left';
    for (let r = 0; r < rows; r++) {
      let state = 'idle';
      for (const k of [n - 1, n]) {
        const ts = frameStart(cam, k) + rowOffset({ ...cam, rows }, r);
        if (t >= ts && t < ts + Te) state = 'exposing';
        else if (t >= ts + Te && t < ts + Te + 0.0012) state = 'reading';
      }
      const y = sy + r * rh;
      ctx.fillStyle = state === 'exposing' ? 'rgba(245,158,11,0.75)' : state === 'reading' ? 'rgba(248,113,113,0.95)' : '#162130';
      ctx.fillRect(sx, y + 1, sw, rh - 2);
      // pixels
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let c = 0; c < 24; c++) ctx.fillRect(sx + c * (sw / 24) + sw / 24 - 1, y + 1, 1, rh - 2);
      ctx.fillStyle = state === 'idle' ? COLORS.text : '#0b0f14';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`row ${r}`, sx + 4, y + rh / 2 + 3);
      ctx.fillText(state, sx + sw - 58, y + rh / 2 + 3);
    }
  }, clock);
  return (
    <div className="widget">
      <div className="widget-split">
        <canvas ref={ref} className="widget-canvas tall" />
        <div>
          <TimingDiagram config={config} clock={clock} bars={16} height={260} />
        </div>
      </div>
      <div className="widget-controls">
        <Segmented
          label="Sensor"
          value={type}
          options={[
            { value: 'rolling', label: 'Rolling shutter' },
            { value: 'global', label: 'Global shutter' },
          ]}
          onChange={setType}
        />
        <SpeedPicker value={speed} onChange={setSpeed} options={[0.002, 0.01, 0.05]} />
        <div className="widget-readout">
          <span style={{ color: '#f59e0b' }}>■</span> exposing · <span style={{ color: '#f87171' }}>■</span> being read out · 25 fps, 1/100 s, 22 ms readout under a 100 Hz LED
        </div>
      </div>
    </div>
  );
}

// ---------------- Module 5: band formation ----------------
export function BandDemo() {
  const [fps, setFps] = useState(25);
  const [denom, setDenom] = useState(200);
  const [readout, setReadout] = useState(22);
  const [speed, setSpeed] = useState(1);
  const clock = useSlowClock(speed);
  const config: SimConfig = useMemo(
    () => ({
      supply: { acFreq: 50, voltageRms: 230, phaseDeg: 0 },
      lights: [defaultLight({ modDepth: 0.8 })],
      camera: defaultCamera({ fps, exposure: 1 / denom, readoutMs: readout }),
    }),
    [fps, denom, readout],
  );
  const alias = 100 - fps * Math.round(100 / fps);
  return (
    <div className="widget">
      <div className="widget-split">
        <CameraView config={config} mode="video" clock={clock} compact />
        <TimingDiagram config={config} clock={clock} bars={18} height={240} />
      </div>
      <div className="widget-controls">
        <Segmented label="Frame rate" small value={fps} options={[24, 25, 30, 50, 60].map((v) => ({ value: v, label: `${v}` }))} onChange={setFps} />
        <Segmented label="Shutter" small value={denom} options={[50, 60, 100, 200, 500].map((v) => ({ value: v, label: `1/${v}` }))} onChange={setDenom} />
        <Slider label="Readout" unit="ms" min={2} max={Math.floor(1000 / fps)} value={Math.min(readout, Math.floor(1000 / fps))} onChange={setReadout} />
        <SpeedPicker value={speed} onChange={setSpeed} options={[0.1, 0.25, 1]} />
        <div className="widget-readout">
          100 Hz light · {formatShutter(1 / denom)} · bands per frame = 100 × {readout} ms = <b>{fmt((100 * Math.min(readout, 1000 / fps)) / 1000, 2)}</b> · 100 ÷ {fps} = {fmt(100 / fps, 3)} → beat{' '}
          <b>{fmt(alias, 2)} Hz</b> {alias === 0 ? '(static)' : alias > 0 ? '(bands drift up)' : '(bands drift down)'}
        </div>
      </div>
    </div>
  );
}

export function ShutterTable({ fL = 100 }: { fL?: number }) {
  const rows = [24, 25, 30, 50, 60, 100, 120];
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Frame rate</th>
          <th>180° shutter</th>
          <th>Cycles at 180°</th>
          <th>Flicker-safe choices (≤ 360°)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((fps) => {
          const t180 = 1 / (2 * fps);
          const c = t180 * fL;
          const safe: string[] = [];
          for (let k = 1; k / fL <= 1 / fps + 1e-9; k++) safe.push(`${formatShutter(k / fL)} (${fmt(360 * (k / fL) * fps, 0)}°)`);
          const ok = Math.abs(c - Math.round(c)) < 0.01 && c >= 0.99;
          return (
            <tr key={fps}>
              <td>{fps} fps</td>
              <td>{formatShutter(t180)}</td>
              <td className={ok ? 'good-text' : 'bad-text'}>
                {fmt(c, 2)} {ok ? '✓' : '✗'}
              </td>
              <td>{safe.length ? safe.slice(0, 4).join(', ') : <span className="bad-text">none: frame shorter than a light cycle</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
