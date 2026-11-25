import { useCallback, useEffect, useState } from 'react';
import type { SimConfig } from './physics/types';
import { cloneConfig, defaultConfig, EXPERIMENTS } from './physics/presets';
import { SimulatorPage } from './pages/SimulatorPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { LearnPage } from './pages/LearnPage';
import { ToolsPage } from './pages/ToolsPage';
import { GlossaryPage } from './pages/GlossaryPage';
import { defaultScope, type ScopeSettings } from './components/Oscilloscope';
import type { ViewMode } from './components/CameraView';
import { simClock } from './sim/clock';

export interface AppState {
  configs: [SimConfig, SimConfig];
  compare: boolean;
  editing: 0 | 1;
  paused: boolean;
  speed: number;
  viewMode: ViewMode;
  scope: ScopeSettings;
  experimentId?: string;
}

const STORE_KEY = 'flicker-lab:v1';

function initialState(): AppState {
  const c = defaultConfig();
  return { configs: [c, cloneConfig(c)], compare: false, editing: 0, paused: false, speed: 1, viewMode: 'video', scope: defaultScope };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return initialState();
    const s = JSON.parse(raw) as AppState;
    if (!Array.isArray(s.configs) || s.configs.length !== 2 || !s.configs[0].camera || !s.configs[0].lights?.length) return initialState();
    return { ...initialState(), ...s, paused: false };
  } catch {
    return initialState();
  }
}

type Route = 'sim' | 'experiments' | 'learn' | 'tools' | 'glossary';
const ROUTES: { id: Route; label: string }[] = [
  { id: 'sim', label: 'Simulator' },
  { id: 'experiments', label: 'Experiment Lab' },
  { id: 'learn', label: 'Learn' },
  { id: 'tools', label: 'Tools' },
  { id: 'glossary', label: 'Glossary' },
];

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return (ROUTES.find((r) => r.id === h)?.id ?? 'sim') as Route;
}

export default function App() {
  const [state, setStateRaw] = useState<AppState>(loadState);
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [menuOpen, setMenuOpen] = useState(false);

  const setState = useCallback((s: AppState | ((s: AppState) => AppState)) => setStateRaw(s), []);

  useEffect(() => {
    simClock.paused = state.paused;
    simClock.speed = state.speed;
  }, [state.paused, state.speed]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch {
        /* storage may be unavailable */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Space = play/pause on the simulator
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (route !== 'sim' || e.code !== 'Space' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      setState((s) => ({ ...s, paused: !s.paused }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route, setState]);

  const navigate = (r: Route) => {
    window.location.hash = `/${r}`;
    setRoute(r);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  const runExperiment = (id: string) => {
    const e = EXPERIMENTS.find((x) => x.id === id);
    if (!e) return;
    simClock.reset();
    setState((s) => ({
      ...s,
      configs: [cloneConfig(e.configA), cloneConfig(e.configB ?? e.configA)],
      compare: !!e.configB,
      editing: 0,
      paused: false,
      experimentId: id,
    }));
    navigate('sim');
  };

  const reset = () => {
    simClock.reset();
    setState(initialState());
  };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/sim" onClick={() => navigate('sim')}>
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
            <rect width="32" height="32" rx="7" fill="#0f1720" stroke="#1e3a4c" />
            <path d="M3 16 Q7 5 11 16 T19 16 T27 16" stroke="#38bdf8" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <rect x="5" y="22" width="22" height="2" rx="1" fill="#f59e0b" opacity="0.8" />
            <rect x="5" y="26" width="22" height="2" rx="1" fill="#f59e0b" opacity="0.35" />
          </svg>
          <span>
            Flicker Lab
            <small>light flicker & rolling shutter simulator</small>
          </span>
        </a>
        <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>
          ☰
        </button>
        <nav className={`mainnav ${menuOpen ? 'open' : ''}`}>
          {ROUTES.map((r) => (
            <button key={r.id} className={route === r.id ? 'on' : ''} onClick={() => navigate(r.id)}>
              {r.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {route === 'sim' && <SimulatorPage state={state} setState={setState} onReset={reset} />}
        {route === 'experiments' && <ExperimentsPage onRun={runExperiment} />}
        {route === 'learn' && <LearnPage />}
        {route === 'tools' && <ToolsPage config={state.configs[0]} />}
        {route === 'glossary' && <GlossaryPage />}
      </main>
      <footer className="footer">
        Flicker Lab. Every image, waveform and number is computed from L(t) and per-row exposure integration B(y) = (1/T)∫L dt. Light-source models are idealised; see the notes beside each model.
      </footer>
    </div>
  );
}
