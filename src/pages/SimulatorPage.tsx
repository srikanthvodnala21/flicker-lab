import { useCallback, useMemo, useRef, useState } from 'react';
import type { SimConfig } from '../physics/types';
import { analyze, fmt, formatShutter } from '../physics/analysis';
import { buildScene } from '../physics/light';
import { cloneConfig, defaultCamera, defaultLight, EXPERIMENTS } from '../physics/presets';
import { LightPanel } from '../components/LightPanel';
import { CameraPanel } from '../components/CameraPanel';
import { CameraView, type ViewMode } from '../components/CameraView';
import { Oscilloscope, type ScopeSettings } from '../components/Oscilloscope';
import { TimingDiagram, TimingLegend } from '../components/TimingDiagram';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { FlickerChart } from '../components/FlickerChart';
import { Panel, Segmented } from '../components/ui';
import { simClock } from '../sim/clock';
import type { AppState } from '../App';

const SPEEDS = [
  { v: 1, l: '1× real time' },
  { v: 0.5, l: '0.5×' },
  { v: 0.25, l: '0.25×' },
  { v: 0.1, l: '0.1× slow-mo' },
  { v: 0.03, l: '0.03× slow-mo' },
  { v: 0.01, l: '0.01× (see pulses)' },
  { v: 0.002, l: '0.002× (see readout)' },
];

interface Scenario {
  id: string;
  name: string;
  make: () => SimConfig;
}

const mk = (lights: SimConfig['lights'], cam: Partial<SimConfig['camera']>, acFreq = 50): SimConfig => ({
  supply: { acFreq, voltageRms: acFreq === 50 ? 230 : 120, phaseDeg: 0 },
  lights,
  camera: defaultCamera(cam),
});

export const SCENARIOS: Scenario[] = [
  { id: 'problem', name: 'India home, cheap LED, FX30 25p 1/200 (the problem)', make: () => mk([defaultLight()], { fps: 25, exposure: 1 / 200 }) },
  { id: 'fixed', name: 'India home, cheap LED, FX30 25p 1/50 (fixed)', make: () => mk([defaultLight()], { fps: 25, exposure: 1 / 50 }) },
  { id: 'us30', name: 'India home, 30p 1/60 (US habits in a 50 Hz country)', make: () => mk([defaultLight()], { fps: 30, exposure: 1 / 60 }) },
  { id: 'us60hz', name: 'USA 60 Hz mains, 24p 1/50 (rolling bands)', make: () => mk([defaultLight()], { fps: 24, exposure: 1 / 50 }, 60) },
  { id: 'pwm1k', name: 'Office panel, PWM 1 kHz 30 %, 24p 1/1000', make: () => mk([defaultLight({ type: 'led_pwm', pwmFreq: 1000, duty: 0.3, modDepth: 1 })], { fps: 24, exposure: 1 / 1000 }) },
  {
    id: 'mixed',
    name: 'Mixed: 100 Hz LED + 360 Hz PWM strip, 25p 1/50',
    make: () => mk([defaultLight(), defaultLight({ type: 'led_pwm', pwmFreq: 360, duty: 0.4, modDepth: 1, intensity: 0.6 })], { fps: 25, exposure: 1 / 50 }),
  },
  {
    id: '3phase',
    name: 'Three-phase wiring: three LEDs 120° apart, 25p 1/200',
    make: () =>
      mk(
        [defaultLight({ modDepth: 1, intensity: 0.5 }), defaultLight({ modDepth: 1, intensity: 0.5, phaseDeg: 120 }), defaultLight({ modDepth: 1, intensity: 0.5, phaseDeg: 240 })],
        { fps: 25, exposure: 1 / 200 },
      ),
  },
  { id: 'tungsten', name: 'Incandescent bulb, 25p 1/500', make: () => mk([defaultLight({ type: 'incandescent' })], { fps: 25, exposure: 1 / 500 }) },
  { id: 'tube', name: 'Fluorescent tube, 30p 1/250', make: () => mk([defaultLight({ type: 'fluorescent' })], { fps: 30, exposure: 1 / 250 }) },
  { id: 'clean', name: 'Flicker-free video light, any shutter (1/2000)', make: () => mk([defaultLight({ type: 'led_cc', modDepth: 0 })], { fps: 25, exposure: 1 / 2000 }) },
];

interface Props {
  state: AppState;
  setState: (s: AppState | ((s: AppState) => AppState)) => void;
  onReset: () => void;
}

export function SimulatorPage({ state, setState, onReset }: Props) {
  const { configs, compare, editing, paused, speed, viewMode, scope } = state;
  const active = compare ? editing : 0;
  const cfg = configs[active];
  const setCfg = useCallback(
    (c: SimConfig) => setState((s) => ({ ...s, configs: s.configs.map((x, i) => (i === (s.compare ? s.editing : 0) ? c : x)) as [SimConfig, SimConfig] })),
    [setState],
  );
  const canvases = useRef<(HTMLCanvasElement | null)[]>([null, null]);
  const setCanvasA = useCallback((c: HTMLCanvasElement | null) => (canvases.current[0] = c), []);
  const setCanvasB = useCallback((c: HTMLCanvasElement | null) => (canvases.current[1] = c), []);
  const [chartOpen, setChartOpen] = useState(true);

  const sceneA = useMemo(() => buildScene(cfg), [cfg.supply, cfg.lights]);
  const analysis = useMemo(() => analyze(cfg, sceneA), [cfg, sceneA]);
  const exp = EXPERIMENTS.find((e) => e.id === state.experimentId);

  const setPaused = (p: boolean) => {
    simClock.paused = p;
    setState((s) => ({ ...s, paused: p }));
  };
  const setSpeed = (v: number) => {
    simClock.speed = v;
    setState((s) => ({ ...s, speed: v }));
  };
  const stepFrame = (dir: number) => {
    simClock.step(dir / cfg.camera.fps);
    if (!paused) setPaused(true);
  };

  const exportPng = () => {
    const list = (compare ? canvases.current : [canvases.current[0]]).filter(Boolean) as HTMLCanvasElement[];
    if (!list.length) return;
    const pad = 16;
    const capH = 64;
    const w = list.reduce((s, c) => s + c.width, 0) + pad * (list.length + 1);
    const h = Math.max(...list.map((c) => c.height)) + pad * 2 + capH;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const g = out.getContext('2d')!;
    g.fillStyle = '#0a0e13';
    g.fillRect(0, 0, w, h);
    let x = pad;
    list.forEach((c) => {
      g.drawImage(c, x, pad);
      x += c.width + pad;
    });
    g.fillStyle = '#e2e8f0';
    g.font = '600 22px system-ui, sans-serif';
    g.fillText('Flicker Lab: simulated camera output', pad, h - capH + 18);
    g.font = '16px ui-monospace, monospace';
    g.fillStyle = '#94a3b8';
    const desc = (c: SimConfig) =>
      `${c.supply.acFreq} Hz mains · ${c.lights.filter((l) => l.enabled).map((l) => l.type).join('+')} · ${fmt(c.camera.fps, 3)} fps · ${formatShutter(Math.min(c.camera.exposure, 1 / c.camera.fps))} · ${c.camera.shutterType === 'global' ? 'global' : `RS ${c.camera.readoutMs} ms`}`;
    g.fillText(compare ? `A: ${desc(configs[0])}   |   B: ${desc(configs[1])}` : desc(configs[0]), pad, h - capH + 44);
    g.fillText(`t = ${simClock.t.toFixed(4)} s`, pad, h - 10);
    const a = document.createElement('a');
    a.download = `flicker-lab-${Date.now()}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
  };

  const toggleCompare = () =>
    setState((s) => ({
      ...s,
      compare: !s.compare,
      editing: 0,
      configs: !s.compare && !s.experimentId ? [s.configs[0], { ...cloneConfig(s.configs[0]), camera: { ...s.configs[0].camera, exposure: 1 / 50, presetId: s.configs[0].camera.presetId } }] : s.configs,
    }));

  const applyScenario = (id: string) => {
    const sc = SCENARIOS.find((x) => x.id === id);
    if (!sc) return;
    const c = sc.make();
    setState((s) => ({ ...s, configs: [c, cloneConfig(c)], compare: false, editing: 0, experimentId: undefined }));
  };

  const labels = exp?.labels ?? ['Setup A', 'Setup B'];

  return (
    <div className="sim-layout">
      <aside className="controls">
        {compare && (
          <div className="edit-switch">
            <span>Editing</span>
            <Segmented
              small
              value={editing}
              options={[
                { value: 0, label: `A · ${labels[0]}` },
                { value: 1, label: `B · ${labels[1]}` },
              ]}
              onChange={(v) => setState((s) => ({ ...s, editing: v }))}
            />
          </div>
        )}
        <LightPanel key={`l${active}`} config={cfg} onChange={setCfg} />
        <CameraPanel camera={cfg.camera} onChange={(camera) => setCfg({ ...cfg, camera })} />
      </aside>

      <div className="sim-main">
        {exp && (
          <div className="exp-banner">
            <div>
              <div className="eyebrow">Running experiment</div>
              <h3>{exp.title}</h3>
              <p className="observe">
                <b>Observe:</b> {exp.observe}
              </p>
              <ul>
                {exp.explanation.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
            <button className="btn-ghost" onClick={() => setState((s) => ({ ...s, experimentId: undefined }))} aria-label="Close experiment">
              ✕
            </button>
          </div>
        )}

        <Panel
          title="C · Camera output simulation"
          className="output-panel"
          right={
            <div className="toolbar">
              <button className="btn primary" onClick={() => setPaused(!paused)} title="Space">
                {paused ? '▶ Play' : '❚❚ Pause'}
              </button>
              <button className="btn" onClick={() => stepFrame(-1)} title="Previous frame">
                ◀|
              </button>
              <button className="btn" onClick={() => stepFrame(1)} title="Next frame">
                |▶
              </button>
              <select value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} aria-label="Simulation speed">
                {SPEEDS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.l}
                  </option>
                ))}
              </select>
              <button className={`btn ${compare ? 'on' : ''}`} onClick={toggleCompare}>
                ⇆ Compare
              </button>
              <button className="btn" onClick={exportPng}>
                ⤓ PNG
              </button>
              <button className="btn" onClick={onReset} title="Reset everything to defaults">
                ↺ Reset
              </button>
            </div>
          }
        >
          <div className="view-mode-row">
            <Segmented<ViewMode>
              small
              value={viewMode}
              options={[
                { value: 'video', label: '● Recorded video', title: 'What the camera records: whole frames at the frame rate' },
                { value: 'sensor', label: 'Sensor readout (live)', title: 'Rows update the moment their exposure finishes. Use slow motion to see the scan.' },
                { value: 'eye', label: 'Your eye', title: 'What you see in the room: the eye averages flicker above ~80 Hz' },
              ]}
              onChange={(v) => setState((s) => ({ ...s, viewMode: v }))}
            />
            <select className="scenario-select" value="" onChange={(e) => applyScenario(e.target.value)} aria-label="Load a preset scenario">
              <option value="">Load a preset scenario…</option>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className={`views ${compare ? 'two' : ''}`}>
            <div className={`view-wrap ${compare && editing === 0 ? 'editing' : ''}`} onClick={() => compare && setState((s) => ({ ...s, editing: 0 }))}>
              <CameraView config={configs[0]} mode={viewMode} label={compare ? 'A' : undefined} onCanvas={setCanvasA} compact={compare} />
              {compare && <div className="view-caption">A · {labels[0]}</div>}
            </div>
            {compare && (
              <div className={`view-wrap ${editing === 1 ? 'editing' : ''}`} onClick={() => setState((s) => ({ ...s, editing: 1 }))}>
                <CameraView config={configs[1]} mode={viewMode} label="B" onCanvas={setCanvasB} compact />
                <div className="view-caption">B · {labels[1]}</div>
              </div>
            )}
          </div>
          <p className="hint">
            {viewMode === 'video' && 'Each frame is computed by integrating the light waveform over every row\'s exposure window. Bands that move here also move in your footage.'}
            {viewMode === 'sensor' &&
              'Live readout: each row refreshes the instant its exposure ends. Choose 0.002× speed to watch the red readout line sweep down and "paint" each frame.'}
            {viewMode === 'eye' && 'Your visual system averages light flicker above roughly 60–90 Hz, so the room looks steady to you even when the camera records bands.'}
            {' '}The lamp dot shows the light's instantaneous brightness, and the side strip plots B(y) per row.
          </p>
        </Panel>

        <Panel title={`Live waveforms: oscilloscope${compare ? ` (setup ${active === 0 ? 'A' : 'B'})` : ''}`}>
          <Oscilloscope config={cfg} settings={scope} onSettings={(sc: ScopeSettings) => setState((s) => ({ ...s, scope: sc }))} />
        </Panel>

        <Panel title={`Exposure timing: how each row samples the light${compare ? ` (setup ${active === 0 ? 'A' : 'B'})` : ''}`}>
          <TimingDiagram config={cfg} />
          <TimingLegend />
        </Panel>

        <AnalysisPanel a={analysis} config={cfg} title={`Why am I seeing these bands?${compare ? ` (setup ${active === 0 ? 'A' : 'B'})` : ''}`} />

        <Panel
          title="Shutter speed vs residual flicker"
          right={
            <button className="btn-xs" onClick={() => setChartOpen(!chartOpen)}>
              {chartOpen ? 'Hide' : 'Show'}
            </button>
          }
        >
          {chartOpen && (
            <>
              <FlickerChart config={cfg} />
              <p className="hint">
                Worst-case contrast a row can show, computed for 320 shutter speeds by integrating the current light waveform at every start phase. The dips to zero are the "safe" shutters: whole multiples of the light period.
              </p>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
