import { useMemo, useState } from 'react';
import type { SimConfig } from '../physics/types';
import { analyze, fmt, fmtHz, fpsOptions, sincAttenuation } from '../physics/analysis';
import { buildScene } from '../physics/light';
import { defaultCamera, defaultLight } from '../physics/presets';
import { FlickerChart } from '../components/FlickerChart';
import { Note, Panel, Segmented, Slider } from '../components/ui';

type Driver = 'full' | 'half' | 'pwm';

function Calculator() {
  const [mains, setMains] = useState(50);
  const [driver, setDriver] = useState<Driver>('full');
  const [pwm, setPwm] = useState(400);
  const [fps, setFps] = useState(25);
  const [denom, setDenom] = useState(200);
  const [readout, setReadout] = useState(22);

  const config: SimConfig = useMemo(
    () => ({
      supply: { acFreq: mains, voltageRms: 230, phaseDeg: 0 },
      lights: [driver === 'pwm' ? defaultLight({ type: 'led_pwm', pwmFreq: pwm, duty: 0.5, modDepth: 1 }) : defaultLight({ type: 'led_ac', rectification: driver, modDepth: 1 })],
      camera: defaultCamera({ fps, exposure: 1 / denom, readoutMs: readout }),
    }),
    [mains, driver, pwm, fps, denom, readout],
  );
  const a = useMemo(() => analyze(config), [config]);
  const fpsTable = useMemo(() => fpsOptions(a.scene), [a.scene]);

  return (
    <Panel title="Flicker frequency calculator">
      <div className="calc">
        <div className="calc-inputs">
          <Segmented label="Mains" value={mains} options={[{ value: 50, label: '50 Hz' }, { value: 60, label: '60 Hz' }]} onChange={setMains} />
          <Segmented
            label="Light driver"
            value={driver}
            options={[
              { value: 'full', label: 'Full-wave' },
              { value: 'half', label: 'Half-wave' },
              { value: 'pwm', label: 'PWM' },
            ]}
            onChange={setDriver}
          />
          {driver === 'pwm' && <Slider label="PWM frequency" unit="Hz" log min={50} max={40000} value={pwm} onChange={setPwm} />}
          <Slider label="Frame rate" unit="fps" min={1} max={240} step={0.001} value={fps} onChange={setFps} />
          <Slider label="Shutter 1/x" unit="1/x" log min={4} max={8000} value={denom} onChange={setDenom} />
          <Slider label="Readout time" unit="ms" min={0} max={42} step={0.1} value={readout} onChange={setReadout} />
        </div>
        <div className="calc-out">
          <table className="data-table kv">
            <tbody>
              <tr>
                <td>Light flicker frequency</td>
                <td>
                  <b>{a.fL ? fmtHz(a.fL) : '—'}</b>
                </td>
              </tr>
              <tr>
                <td>Light period</td>
                <td>{a.fL ? `${fmt(1000 / a.fL, 3)} ms` : '—'}</td>
              </tr>
              <tr>
                <td>Exposure / shutter angle</td>
                <td>
                  {fmt(a.exposure * 1000, 3)} ms / {fmt(a.angle, 1)}°
                </td>
              </tr>
              <tr>
                <td>Light cycles per exposure</td>
                <td>{a.cycles !== null ? fmt(a.cycles, 3) : '—'}</td>
              </tr>
              <tr>
                <td>Fundamental passed (|sinc|)</td>
                <td>{a.attenuation !== null ? `${fmt(a.attenuation * 100, 1)} %` : '—'}</td>
              </tr>
              <tr>
                <td>Band pairs per frame</td>
                <td>{a.bandsPerFrame !== null ? fmt(a.bandsPerFrame, 2) : '—'}</td>
              </tr>
              <tr>
                <td>Alias / beat frequency</td>
                <td>{a.alias !== null ? `${fmt(a.alias, 3)} Hz` : '—'}</td>
              </tr>
              <tr>
                <td>Band motion</td>
                <td>{a.driftDir ?? '—'}</td>
              </tr>
              <tr>
                <td>Simulated contrast</td>
                <td>
                  <b className={a.verdict === 'clean' ? 'good-text' : 'bad-text'}>
                    {fmt(Math.max(a.stats.spatial, a.stats.temporal) * 100, 1)} % · {a.verdictText}
                  </b>
                </td>
              </tr>
            </tbody>
          </table>
          {a.recommendations.map((r, i) => (
            <p key={i} className="hint">
              {r}
            </p>
          ))}
        </div>
      </div>
      <h4>Best shutter for each standard frame rate (this light)</h4>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>FPS</th>
              <th>f_light / fps</th>
              <th>Beat</th>
              <th>Best shutter</th>
              <th>Angle</th>
              <th>Residual</th>
            </tr>
          </thead>
          <tbody>
            {fpsTable.map((r) => (
              <tr key={r.fps}>
                <td>{r.fps}</td>
                <td>{r.ratio !== null ? fmt(r.ratio, 3) : '—'}</td>
                <td>{r.alias !== null ? `${fmt(r.alias, 2)} Hz` : '—'}</td>
                <td>{r.best?.label ?? '—'}</td>
                <td>{r.best ? `${fmt(r.best.angle, 0)}°` : '—'}</td>
                <td className={r.best && r.best.contrast < 0.01 ? 'good-text' : 'bad-text'}>{r.best ? `${fmt(r.best.contrast * 100, 1)} %` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ReadoutEstimator() {
  const [bands, setBands] = useState(2.2);
  const [f, setF] = useState(100);
  return (
    <Panel title="Measure your camera's readout time">
      <p className="desc">
        Film a 100 Hz-flickering light (or a wall lit by it) at a very fast shutter (1/2000 or faster) so the bands are sharp. Count the bright bands from top to bottom of the frame, including fractions. Then readout time = bands ÷ light frequency.
      </p>
      <div className="calc-inputs two">
        <Slider label="Band pairs counted" min={0.1} max={20} step={0.1} value={bands} onChange={setBands} />
        <Slider label="Light flicker frequency" unit="Hz" min={50} max={2000} value={f} onChange={setF} />
      </div>
      <div className="big-result">
        Readout ≈ <b>{fmt((bands / f) * 1000, 2)} ms</b>
      </div>
      <Note kind="info">Enter this value in the simulator's readout slider (Custom preset) to match your own FX30 recording mode.</Note>
    </Panel>
  );
}

function Heatmap() {
  const freqs = [50, 60, 100, 120, 200, 240, 400, 1000, 2000];
  const shutters = [25, 50, 60, 100, 120, 200, 250, 500, 1000, 2000];
  const color = (v: number) => {
    const h = 140 - 140 * Math.min(1, Math.sqrt(v / 0.7));
    return `hsl(${h} 70% ${v < 0.01 ? 28 : 34}%)`;
  };
  return (
    <Panel title="Light frequency × shutter speed: residual flicker">
      <p className="desc">
        Fraction of a sinusoidal flicker component that survives exposure integration, |sin(πfT)/(πfT)|. 0 % (green) means the shutter cancels that frequency completely.
      </p>
      <div className="table-scroll">
        <table className="data-table heat">
          <thead>
            <tr>
              <th>f_light ↓ / shutter →</th>
              {shutters.map((s) => (
                <th key={s}>1/{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {freqs.map((f) => (
              <tr key={f}>
                <th>{fmtHz(f)}</th>
                {shutters.map((s) => {
                  const v = sincAttenuation(f, 1 / s);
                  return (
                    <td key={s} style={{ background: color(v) }}>
                      {fmt(v * 100, 0)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note kind="model">
        For non-sinusoidal waveforms (PWM, rectified sine) the harmonics at 2f, 3f… are attenuated by their own sinc values. They all vanish at the same "whole number of cycles" exposures.
      </Note>
    </Panel>
  );
}

export function ToolsPage({ config }: { config: SimConfig }) {
  const scene = useMemo(() => buildScene(config), [config]);
  return (
    <div className="page">
      <header className="page-head">
        <h1>Tools</h1>
        <p>Calculators and charts that use the same physics engine as the simulator.</p>
      </header>
      <div className="tools-grid">
        <Calculator />
        <div className="stack">
          <ReadoutEstimator />
          <Panel title="Shutter response of your current simulator lighting">
            <FlickerChart config={config} height={240} />
            <p className="hint">
              Lights in the simulator: {scene.models.map((m) => `${m.label}${m.fundamental ? ` (${fmtHz(m.fundamental)})` : ''}`).join(' + ') || 'none'}.
            </p>
          </Panel>
        </div>
      </div>
      <Heatmap />
    </div>
  );
}
