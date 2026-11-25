import type { CameraConfig } from '../physics/types';
import { CAMERA_PRESETS, FPS_CHOICES, SHUTTER_CHOICES } from '../physics/presets';
import { fmt, formatShutter } from '../physics/analysis';
import { effectiveExposure, shutterAngle } from '../physics/exposure';
import { InfoTip, Note, Panel, Segmented, Slider, Toggle } from './ui';

export function CameraPanel({ camera, onChange }: { camera: CameraConfig; onChange: (c: CameraConfig) => void }) {
  const set = (p: Partial<CameraConfig>, keepPreset = false) => onChange({ ...camera, ...p, presetId: keepPreset ? camera.presetId : 'custom' });
  const preset = CAMERA_PRESETS.find((p) => p.id === camera.presetId);
  const denom = 1 / camera.exposure;
  const Te = effectiveExposure(camera);
  const angle = shutterAngle(camera);
  const tooLong = camera.exposure > 1 / camera.fps + 1e-9;

  return (
    <Panel title="B · Camera">
      <div className="ctl">
        <div className="ctl-label">
          <span>
            Camera preset <InfoTip text="Presets set the sensor readout and rows. Readout time depends on the recording mode, so every value stays adjustable." />
          </span>
        </div>
        <select
          value={camera.presetId}
          onChange={(e) => {
            const p = CAMERA_PRESETS.find((x) => x.id === e.target.value)!;
            onChange({ ...camera, ...p.apply, presetId: p.id });
          }}
        >
          {CAMERA_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {preset && preset.id !== 'custom' && <p className="desc">{preset.note}</p>}
      </div>

      <div className="ctl">
        <div className="ctl-label">
          <span>
            Frame rate <InfoTip k="fps" />
          </span>
        </div>
        <div className="chips">
          {FPS_CHOICES.map((f) => (
            <button key={f} className={camera.fps === f ? 'on' : ''} onClick={() => set({ fps: f }, true)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <Slider label="Custom FPS" unit="fps" min={1} max={240} step={0.001} value={camera.fps} onChange={(v) => set({ fps: v }, true)} />

      <div className="ctl">
        <div className="ctl-label">
          <span>
            Shutter speed <InfoTip k="shutter" />
          </span>
        </div>
        <div className="chips">
          {SHUTTER_CHOICES.map((s) => (
            <button key={s} className={Math.abs(denom - s) < 0.01 ? 'on' : ''} onClick={() => set({ exposure: 1 / s }, true)}>
              1/{s}
            </button>
          ))}
        </div>
      </div>
      <Slider
        label="Custom shutter 1/x (fine)"
        info="variableShutter"
        unit="1/x"
        log
        min={4}
        max={8000}
        value={+denom.toFixed(2)}
        onChange={(v) => set({ exposure: 1 / v }, true)}
      />
      <Slider
        label="Shutter angle"
        info="angle"
        unit="°"
        min={1}
        max={360}
        step={0.1}
        digits={1}
        value={+angle.toFixed(1)}
        onChange={(v) => set({ exposure: v / 360 / camera.fps }, true)}
      />
      <div className="readout-grid">
        <div>
          <span>Exposure duration</span>
          <b>{fmt(Te * 1000, 3)} ms</b>
        </div>
        <div>
          <span>Frame interval</span>
          <b>{fmt(1000 / camera.fps, 3)} ms</b>
        </div>
        <div>
          <span>Shutter</span>
          <b>{formatShutter(Te)} s</b>
        </div>
        <div>
          <span>Angle</span>
          <b>{fmt(angle, 1)}°</b>
        </div>
      </div>
      {tooLong && <Note kind="warn">Exposure is longer than the frame interval. Clamped to 360° (a real camera won't allow this).</Note>}

      <div className="subhead">Sensor</div>
      <Segmented
        label="Shutter type"
        info={camera.shutterType === 'rolling' ? 'rolling' : 'global'}
        value={camera.shutterType}
        options={[
          { value: 'rolling', label: 'Rolling shutter' },
          { value: 'global', label: 'Global shutter' },
        ]}
        onChange={(v) => set({ shutterType: v })}
      />
      <Slider
        label="Rolling-shutter readout time"
        info="readout"
        unit="ms"
        min={0}
        max={42}
        step={0.1}
        digits={1}
        disabled={camera.shutterType === 'global'}
        value={camera.readoutMs}
        onChange={(v) => set({ readoutMs: v })}
      />
      {camera.shutterType === 'rolling' && camera.readoutMs > 1000 / camera.fps && (
        <Note kind="warn">Readout is longer than the frame interval at this fps. Clamped to {fmt(1000 / camera.fps, 2)} ms.</Note>
      )}
      <Slider label="Simulated sensor rows (H)" info="rows" unit="rows" log min={8} max={4320} value={camera.rows} onChange={(v) => set({ rows: Math.round(v) })} />
      <Segmented
        label="Scan direction"
        info="scanDir"
        value={camera.scanDir}
        options={[
          { value: 'down', label: 'Top → bottom' },
          { value: 'up', label: 'Bottom → top' },
        ]}
        onChange={(v) => set({ scanDir: v }, true)}
      />
      <Toggle label="Auto exposure (normalise brightness)" info="autoExposure" checked={camera.autoExposure} onChange={(v) => set({ autoExposure: v }, true)} />
    </Panel>
  );
}
