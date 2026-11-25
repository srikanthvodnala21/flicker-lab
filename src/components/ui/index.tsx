import { useEffect, useState, type ReactNode } from 'react';
import { GLOSSARY } from '../../content/glossary';

export function InfoTip({ k, text }: { k?: string; text?: string }) {
  const entry = k ? GLOSSARY[k] : undefined;
  const body = text ?? entry?.def;
  if (!body) return null;
  return (
    <span className="infotip" tabIndex={0} role="button" aria-label={entry ? `About ${entry.term}` : 'More info'}>
      i
      <span className="infotip-pop" role="tooltip">
        {entry && <strong>{entry.term}</strong>}
        {body}
      </span>
    </span>
  );
}

/** Inline glossary term with a dotted underline and tooltip. */
export function Term({ k, children }: { k: string; children: ReactNode }) {
  const entry = GLOSSARY[k];
  return (
    <span className="term" tabIndex={0}>
      {children}
      {entry && (
        <span className="infotip-pop" role="tooltip">
          <strong>{entry.term}</strong>
          {entry.def}
        </span>
      )}
    </span>
  );
}

export function Panel({ title, children, right, className = '' }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="panel-head">
          <h3>{title}</h3>
          {right && <div className="panel-right">{right}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  log?: boolean;
  info?: string;
  infoText?: string;
  disabled?: boolean;
  digits?: number;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step = 1, unit, log, info, infoText, disabled, digits, onChange }: SliderProps) {
  const toPos = (v: number) => (log ? (Math.log(v / min) / Math.log(max / min)) * 1000 : v);
  const fromPos = (p: number) => {
    if (!log) return p;
    const v = min * Math.pow(max / min, p / 1000);
    // round to ~3 significant figures
    const mag = Math.pow(10, Math.floor(Math.log10(v)) - 2);
    return Math.round(v / mag) * mag;
  };
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(digits !== undefined ? String(+value.toFixed(digits)) : String(+value.toPrecision(6)));
  }, [value, digits]);
  const commit = (s: string) => {
    const v = parseFloat(s);
    if (isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
    else setText(String(value));
  };
  return (
    <div className={`ctl slider ${disabled ? 'disabled' : ''}`}>
      <div className="ctl-label">
        <span>
          {label} {(info || infoText) && <InfoTip k={info} text={infoText} />}
        </span>
        <span className="num-input">
          <input
            type="text"
            inputMode="decimal"
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
            aria-label={typeof label === 'string' ? label : undefined}
          />
          {unit && <em>{unit}</em>}
        </span>
      </div>
      <input
        type="range"
        min={log ? 0 : min}
        max={log ? 1000 : max}
        step={log ? 1 : step}
        value={toPos(Math.min(max, Math.max(min, value)))}
        disabled={disabled}
        onChange={(e) => onChange(fromPos(parseFloat(e.target.value)))}
        aria-label={typeof label === 'string' ? label : undefined}
      />
    </div>
  );
}

interface SegProps<T extends string | number> {
  label?: ReactNode;
  info?: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  small?: boolean;
}

export function Segmented<T extends string | number>({ label, info, value, options, onChange, small }: SegProps<T>) {
  return (
    <div className="ctl">
      {label && (
        <div className="ctl-label">
          <span>
            {label} {info && <InfoTip k={info} />}
          </span>
        </div>
      )}
      <div className={`seg ${small ? 'seg-sm' : ''}`} role="radiogroup">
        {options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'on' : ''}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, info, checked, onChange }: { label: ReactNode; info?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="ctl toggle">
      <span>
        {label} {info && <InfoTip k={info} />}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
    </label>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Note({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'model' | 'warn' }) {
  return <div className={`note note-${kind}`}>{children}</div>;
}
