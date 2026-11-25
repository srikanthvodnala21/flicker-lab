import { useMemo, useState } from 'react';
import { GLOSSARY } from '../content/glossary';

const CATS = ['Electrical', 'Lighting', 'Camera', 'Signal'] as const;

export function GlossaryPage() {
  const [q, setQ] = useState('');
  const entries = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.values(GLOSSARY).filter((e) => !s || e.term.toLowerCase().includes(s) || e.def.toLowerCase().includes(s));
  }, [q]);
  return (
    <div className="page">
      <header className="page-head">
        <h1>Glossary</h1>
        <p>Photography and electrical-engineering terms used throughout Flicker Lab.</p>
        <input className="search" placeholder="Search terms…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search glossary" />
      </header>
      {CATS.map((c) => {
        const list = entries.filter((e) => e.category === c);
        if (!list.length) return null;
        return (
          <section key={c} className="gloss-section">
            <h2>{c}</h2>
            <div className="gloss-grid">
              {list.map((e) => (
                <div key={e.term} className="gloss-card">
                  <h3>{e.term}</h3>
                  <p>{e.def}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {!entries.length && <p className="hint">No matching terms.</p>}
    </div>
  );
}
