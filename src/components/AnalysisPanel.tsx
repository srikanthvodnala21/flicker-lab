import type { Analysis } from '../physics/analysis';
import { fmt, fmtHz, fmtMs } from '../physics/analysis';
import type { SimConfig } from '../physics/types';
import { Note, Panel, Stat } from './ui';

const VERDICT_TONE: Record<Analysis['verdict'], 'good' | 'warn' | 'bad'> = {
  clean: 'good',
  dark: 'warn',
  subtle: 'warn',
  static_bands: 'bad',
  rolling_bands: 'bad',
  frame_flicker: 'bad',
};

function DriftArrow({ a }: { a: Analysis }) {
  const dir = a.driftDir;
  const speed = a.driftPerFrame !== null ? Math.abs(a.driftPerFrame) : 0;
  const dur = speed > 0 ? Math.max(0.4, Math.min(6, 0.35 / (speed * 25))) : 0;
  return (
    <div className="drift">
      <svg viewBox="0 0 60 90" width="48" height="72" aria-hidden>
        <defs>
          <linearGradient id="bandg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1e293b" />
            <stop offset="0.5" stopColor="#e2e8f0" />
            <stop offset="1" stopColor="#1e293b" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="52" height="82" rx="4" fill="#0b1017" stroke="#334155" />
        {dir && dir !== 'static' && dir !== 'strobing' ? (
          <g>
            <rect x="8" y="0" width="44" height="30" fill="url(#bandg)" opacity="0.7">
              <animate attributeName="y" from={dir === 'down' ? '-20' : '80'} to={dir === 'down' ? '80' : '-20'} dur={`${dur}s`} repeatCount="indefinite" />
            </rect>
            <path d={dir === 'down' ? 'M30 30 L30 62 M20 52 L30 64 L40 52' : 'M30 62 L30 30 M20 40 L30 28 L40 40'} stroke="#38bdf8" strokeWidth="4" fill="none" strokeLinecap="round" />
          </g>
        ) : dir === 'static' && a.verdict === 'static_bands' ? (
          <g>
            <rect x="8" y="30" width="44" height="30" fill="url(#bandg)" opacity="0.7" />
            <text x="30" y="80" fill="#94a3b8" fontSize="9" textAnchor="middle">
              static
            </text>
          </g>
        ) : dir === 'strobing' ? (
          <text x="30" y="50" fill="#f59e0b" fontSize="10" textAnchor="middle">
            strobe
          </text>
        ) : (
          <text x="30" y="50" fill="#34d399" fontSize="10" textAnchor="middle">
            none
          </text>
        )}
      </svg>
      <div>
        <div className="stat-label">Band motion</div>
        <div className="stat-value small">
          {a.verdict === 'clean' || !a.fL
            ? 'No bands'
            : a.driftDir === 'static'
              ? 'Static'
              : a.driftDir === 'strobing'
                ? 'Strobing (180°/frame)'
                : a.driftPerFrame !== null
                  ? `${a.driftDir === 'up' ? '↑ upward' : '↓ downward'} ${fmt(Math.abs(a.driftPerFrame) * 100, 1)} %/frame`
                  : `frame pulsing ${fmt(Math.abs(a.alias ?? 0), 2)} Hz`}
        </div>
      </div>
    </div>
  );
}

export function AnalysisPanel({ a, config, title }: { a: Analysis; config: SimConfig; title?: string }) {
  const tone = VERDICT_TONE[a.verdict];
  const cam = config.camera;
  return (
    <Panel title={title ?? 'Why am I seeing these bands?'} right={<span className={`badge ${tone}`}>{a.verdictText}</span>} className="analysis">
      <div className="stats-grid">
        <Stat label="Light flicker frequency" value={a.fL ? fmtHz(a.fL) : 'steady'} sub={`mains ${config.supply.acFreq} Hz`} />
        <Stat label="Exposure" value={fmtMs(a.exposure)} sub={`${fmt(a.angle, 0)}° shutter angle`} />
        <Stat
          label="Light cycles per exposure"
          value={a.cycles !== null ? fmt(a.cycles, 3) : '—'}
          tone={a.cycles !== null ? (Math.abs(a.cycles - Math.round(a.cycles)) < 0.015 && a.cycles >= 0.985 ? 'good' : 'bad') : undefined}
          sub={a.attenuation !== null ? `fundamental passes ${fmt(a.attenuation * 100, 1)} %` : undefined}
        />
        <Stat label="Bands per frame" value={a.bandsPerFrame !== null ? fmt(a.bandsPerFrame, 2) : cam.shutterType === 'global' ? '0 (global)' : '—'} sub={a.bandsPerFrame !== null ? `f × T_readout = ${fmtHz(a.fL!)} × ${fmtMs(a.readout)}` : undefined} />
        <Stat label="Alias (beat) frequency" value={a.alias !== null ? `${fmt(a.alias, 2)} Hz` : '—'} sub={a.phaseStepDeg !== null ? `phase step ${fmt(a.phaseStepDeg, 1)}°/frame` : undefined} />
        <Stat
          label="Simulated band contrast"
          value={`${fmt(a.stats.spatial * 100, 1)} %`}
          tone={a.stats.spatial < 0.01 ? 'good' : a.stats.spatial < 0.04 ? 'warn' : 'bad'}
          sub={`frame-to-frame ${fmt(a.stats.temporal * 100, 1)} %`}
        />
        <DriftArrow a={a} />
      </div>
      {a.warnings.map((w, i) => (
        <Note key={i} kind="warn">
          {w}
        </Note>
      ))}
      <div className="explain">
        {a.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {a.recommendations.length > 0 && (
        <div className="recs">
          <h4>What to change</h4>
          <ul>
            {a.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <Note kind="model">
        All values are computed from the same model that draws the image: each row's brightness is the exact integral of the light waveform over that row's exposure window. Light sources are idealised driver models; real fixtures differ.
      </Note>
    </Panel>
  );
}
