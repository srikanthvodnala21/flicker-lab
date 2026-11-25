import { useMemo, useState } from 'react';
import type { LightConfig, LightType, SimConfig } from '../physics/types';
import { buildLight, LIGHT_LABELS } from '../physics/light';
import { defaultLight } from '../physics/presets';
import { fmt, fmtHz } from '../physics/analysis';
import { Note, Panel, Segmented, Slider } from './ui';

export const LIGHT_DESCRIPTIONS: Record<LightType, string> = {
  incandescent:
    'A hot tungsten filament. Electrical power P ∝ V² peaks twice per mains cycle, but the filament cannot heat and cool instantly. Its thermal mass acts as a low-pass filter, so only a small ripple at 2× mains remains (typically 5–15 %). Idealised: real light output rises faster than temperature, which slightly increases the ripple.',
  fluorescent:
    'A gas-discharge tube on a magnetic ballast. The arc current follows the mains and briefly extinguishes near every zero crossing, so the light pulses at 2× mains. Phosphor afterglow (a few ms) partly fills the gaps. Simplified model; electronic ballasts (20–60 kHz) behave very differently.',
  led_ac:
    'An LED fed from rectified mains through a cheap driver (capacitor dropper or linear driver). The light follows the rectified waveform: full-wave gives 2 pulses per cycle (100 Hz on 50 Hz mains), half-wave gives 1. The smoothing capacitor sets the ripple depth. Real drivers may add dark gaps below the LED forward voltage, which this model does not include.',
  led_pwm:
    'An LED dimmed with pulse-width modulation: the current is switched fully ON and OFF at the driver\'s own oscillator frequency. That can be anything from ~200 Hz to 40 kHz and has no connection to the mains frequency. Average brightness = duty cycle.',
  led_cc:
    'A quality switch-mode constant-current driver with enough output filtering to make the current practically steady. Light output is constant, so no camera setting can create bands. Use the residual-ripple slider to model a not-quite-perfect driver.',
  sine:
    'The textbook model L(t) = L_mean [1 + M cos(2πft + φ)] with a freely chosen frequency. Use it to explore the mathematics without any driver details.',
};

const TYPE_ORDER: LightType[] = ['led_ac', 'led_pwm', 'led_cc', 'incandescent', 'fluorescent', 'sine'];

export function LightPanel({ config, onChange }: { config: SimConfig; onChange: (c: SimConfig) => void }) {
  const [sel, setSel] = useState(0);
  const idx = Math.min(sel, config.lights.length - 1);
  const light = config.lights[idx];
  const setSupply = (p: Partial<SimConfig['supply']>) => onChange({ ...config, supply: { ...config.supply, ...p } });
  const setLight = (p: Partial<LightConfig>) =>
    onChange({ ...config, lights: config.lights.map((l, i) => (i === idx ? { ...l, ...p } : l)) });
  const model = useMemo(() => buildLight(light, config.supply), [light, config.supply]);

  const addLight = () => {
    if (config.lights.length >= 3) return;
    onChange({ ...config, lights: [...config.lights, defaultLight({ type: 'led_pwm', pwmFreq: 120, intensity: 0.6 })] });
    setSel(config.lights.length);
  };
  const removeLight = () => {
    if (config.lights.length <= 1) return;
    onChange({ ...config, lights: config.lights.filter((_, i) => i !== idx) });
    setSel(Math.max(0, idx - 1));
  };

  const mainsDerived = light.type !== 'led_pwm' && light.type !== 'sine';

  return (
    <Panel title="A · Light source">
      <div className="subhead">Electrical supply</div>
      <Segmented
        label="AC mains frequency"
        info="mainsFreq"
        value={config.supply.acFreq}
        options={[
          { value: 50, label: '50 Hz', title: 'India, Europe, most of Asia & Africa' },
          { value: 60, label: '60 Hz', title: 'Americas, parts of Japan' },
        ]}
        onChange={(v) => setSupply({ acFreq: v, voltageRms: v === 50 ? 230 : 120 })}
      />
      <Slider label="AC voltage (illustrative)" info="vrms" unit="V rms" min={100} max={260} step={1} value={config.supply.voltageRms} onChange={(v) => setSupply({ voltageRms: v })} />
      <Slider
        label="Mains phase vs camera clock"
        infoText="Where the mains cycle is when frame 0 starts. Because the camera's clock is not locked to the mains, this is effectively random in real life. Changing it moves the bands but not their contrast."
        unit="°"
        min={0}
        max={360}
        step={1}
        value={config.supply.phaseDeg}
        onChange={(v) => setSupply({ phaseDeg: v })}
      />

      <div className="subhead row-between">
        <span>Light sources in scene</span>
        <span className="mini-actions">
          {config.lights.length < 3 && (
            <button className="btn-xs" onClick={addLight} title="Add another light (simulate mixed lighting)">
              + Add light
            </button>
          )}
          {config.lights.length > 1 && (
            <button className="btn-xs danger" onClick={removeLight}>
              Remove
            </button>
          )}
        </span>
      </div>
      {config.lights.length > 1 && (
        <div className="tabs-sm">
          {config.lights.map((l, i) => (
            <button key={l.id} className={i === idx ? 'on' : ''} onClick={() => setSel(i)}>
              Light {i + 1}
              {!l.enabled && ' (off)'}
            </button>
          ))}
        </div>
      )}

      <div className="ctl">
        <div className="ctl-label">
          <span>Source type</span>
          {config.lights.length > 1 && (
            <label className="inline-check">
              <input type="checkbox" checked={light.enabled} onChange={(e) => setLight({ enabled: e.target.checked })} /> on
            </label>
          )}
        </div>
        <select value={light.type} onChange={(e) => setLight({ type: e.target.value as LightType, modDepth: e.target.value === 'led_cc' ? 0 : light.type === 'led_cc' ? 0.8 : light.modDepth })}>
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {LIGHT_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <p className="desc">{LIGHT_DESCRIPTIONS[light.type]}</p>

      {(light.type === 'led_ac' || light.type === 'incandescent') && (
        <Segmented
          label={light.type === 'incandescent' ? 'Supply to filament' : 'Driver rectification'}
          info="rectification"
          value={light.rectification}
          options={
            light.type === 'incandescent'
              ? [
                  { value: 'full', label: 'Direct AC (2 pulses/cycle)' },
                  { value: 'half', label: 'Half-wave diode dimmer' },
                ]
              : [
                  { value: 'full', label: 'Full-wave' },
                  { value: 'half', label: 'Half-wave' },
                ]
          }
          onChange={(v) => setLight({ rectification: v })}
        />
      )}
      {light.type === 'led_pwm' && (
        <>
          <Slider label="PWM / LED modulation frequency" info="pwm" unit="Hz" log min={50} max={40000} value={light.pwmFreq} onChange={(v) => setLight({ pwmFreq: v })} />
          <Slider label="PWM duty cycle" info="duty" unit="%" min={1} max={99} value={Math.round(light.duty * 100)} onChange={(v) => setLight({ duty: v / 100 })} />
        </>
      )}
      {light.type === 'sine' && <Slider label="Light modulation frequency" info="flickerFreq" unit="Hz" log min={1} max={20000} value={light.sineFreq} onChange={(v) => setLight({ sineFreq: v })} />}
      {(light.type === 'led_ac' || light.type === 'led_pwm' || light.type === 'sine') && (
        <Slider
          label={light.type === 'led_pwm' ? 'Modulation depth (OFF level)' : light.type === 'led_ac' ? 'Ripple / modulation depth' : 'Modulation depth M'}
          info="modDepth"
          unit="%"
          min={0}
          max={100}
          value={Math.round(light.modDepth * 100)}
          onChange={(v) => setLight({ modDepth: v / 100 })}
        />
      )}
      {light.type === 'led_cc' && (
        <Slider label="Residual ripple (at 2× mains)" info="ripple" unit="%" min={0} max={10} step={0.1} digits={1} value={+(light.modDepth * 100).toFixed(1)} onChange={(v) => setLight({ modDepth: v / 100 })} />
      )}
      {light.type === 'incandescent' && (
        <Slider label="Filament thermal time constant" info="thermal" unit="ms" log min={1} max={100} value={light.thermalTauMs} onChange={(v) => setLight({ thermalTauMs: v })} />
      )}
      {light.type === 'fluorescent' && (
        <Slider label="Phosphor persistence" info="phosphor" unit="ms" log min={0.2} max={20} value={light.phosphorTauMs} onChange={(v) => setLight({ phosphorTauMs: v })} />
      )}
      <Slider label="Light intensity (peak)" unit="×" min={0} max={1.5} step={0.01} value={light.intensity} onChange={(v) => setLight({ intensity: v })} />
      <Slider
        label={mainsDerived ? 'Wiring phase offset' : 'Oscillator phase φ'}
        info={mainsDerived ? undefined : 'phase'}
        infoText={mainsDerived ? 'Extra phase on top of the mains phase. In three-phase buildings, lights on different phases are 120° apart. Mixing them reduces the total flicker.' : undefined}
        unit="°"
        min={0}
        max={360}
        value={light.phaseDeg}
        onChange={(v) => setLight({ phaseDeg: v })}
      />

      <div className="readout-grid">
        <div>
          <span>Light flicker frequency</span>
          <b>{model.fundamental ? fmtHz(model.fundamental) : 'none (steady)'}</b>
        </div>
        <div>
          <span>Mains frequency</span>
          <b>{config.supply.acFreq} Hz</b>
        </div>
        <div>
          <span>Percent flicker</span>
          <b>{fmt(model.modDepth * 100, 1)} %</b>
        </div>
        <div>
          <span>Flicker index</span>
          <b>{fmt(model.flickerIndex, 3)}</b>
        </div>
        <div>
          <span>Peak / min</span>
          <b>
            {fmt(model.max, 2)} / {fmt(model.min, 2)}
          </b>
        </div>
        <div>
          <span>Average output</span>
          <b>{fmt(model.mean, 3)}</b>
        </div>
      </div>
      {(light.type === 'fluorescent' || light.type === 'incandescent' || light.type === 'led_ac') && (
        <Note kind="model">Simplified physical model. Real drivers and lamps vary; measure your own lights if you can (see Module 6).</Note>
      )}
    </Panel>
  );
}
