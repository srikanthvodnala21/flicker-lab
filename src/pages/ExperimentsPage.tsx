import { useMemo } from 'react';
import { EXPERIMENTS, type Experiment } from '../physics/presets';
import { analyze } from '../physics/analysis';
import { CameraView } from '../components/CameraView';

function ExperimentCard({ e, onRun }: { e: Experiment; onRun: () => void }) {
  const vA = useMemo(() => analyze(e.configA), [e]);
  const vB = useMemo(() => (e.configB ? analyze(e.configB) : null), [e]);
  return (
    <article className="exp-card">
      <div className="exp-thumbs">
        <div>
          <CameraView config={e.configA} mode="video" showProfile={false} compact label={e.configB ? 'A' : undefined} />
          <span className={`badge ${vA.verdict === 'clean' ? 'good' : 'bad'}`}>{vA.verdictText}</span>
        </div>
        {e.configB && vB && (
          <div>
            <CameraView config={e.configB} mode="video" showProfile={false} compact label="B" />
            <span className={`badge ${vB.verdict === 'clean' ? 'good' : 'bad'}`}>{vB.verdictText}</span>
          </div>
        )}
      </div>
      <h3>{e.title}</h3>
      <ul className="setup">
        {e.setup.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <p className="observe">
        <b>What you'll see:</b> {e.observe}
      </p>
      <button className="btn primary wide" onClick={onRun}>
        ▶ Run experiment in the simulator
      </button>
    </article>
  );
}

export function ExperimentsPage({ onRun }: { onRun: (id: string) => void }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Experiment Lab</h1>
        <p>
          Seven one-click experiments that isolate one variable at a time. Each one loads the simulator with the exact parameters, runs it, and explains the result. The thumbnails below are live simulations.
        </p>
      </header>
      <div className="exp-grid">
        {EXPERIMENTS.map((e) => (
          <ExperimentCard key={e.id} e={e} onRun={() => onRun(e.id)} />
        ))}
      </div>
    </div>
  );
}
