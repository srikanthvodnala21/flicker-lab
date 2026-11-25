import { useEffect, useMemo, useRef } from 'react';
import Chart from 'chart.js/auto';
import type { SimConfig } from '../physics/types';
import { buildScene } from '../physics/light';
import { exposureContrast, fmt } from '../physics/analysis';
import { effectiveExposure } from '../physics/exposure';

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(148,163,184,0.12)';
Chart.defaults.font.family = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Worst-case band contrast vs shutter speed for the current lights. Computed
 * by integrating the actual light waveform over every exposure start phase.
 */
export function FlickerChart({ config, height = 260 }: { config: SimConfig; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);
  const scene = useMemo(() => buildScene(config), [config.supply, config.lights]);
  const Te = effectiveExposure(config.camera);
  const frameDenom = config.camera.fps;

  const data = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const n = 320;
    for (let i = 0; i <= n; i++) {
      const denom = 10 * Math.pow(400, i / n); // 1/10 … 1/4000
      pts.push({ x: denom, y: exposureContrast(scene, 1 / denom) * 100 });
    }
    return pts;
  }, [scene]);

  const current = useMemo(() => ({ x: 1 / Te, y: exposureContrast(scene, Te) * 100 }), [scene, Te]);

  useEffect(() => {
    if (!canvas.current) return;
    chart.current = new Chart(canvas.current, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: {
            type: 'logarithmic',
            min: 10,
            max: 4000,
            title: { display: true, text: 'shutter speed  1/x  (x →)' },
            ticks: {
              callback: (v) => {
                const n = Number(v);
                return [10, 25, 50, 100, 200, 500, 1000, 2000, 4000].includes(n) ? `1/${n}` : '';
              },
            },
          },
          y: { min: 0, title: { display: true, text: 'max. band contrast (%)' } },
        },
        plugins: {
          legend: { labels: { boxWidth: 12 } },
          tooltip: {
            callbacks: {
              title: (items) => `1/${fmt(items[0].parsed.x ?? 0, 1)} s`,
              label: (item) => `${item.dataset.label}: ${fmt(item.parsed.y ?? 0, 2)} %`,
            },
          },
        },
      },
    });
    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.data.datasets = [
      {
        label: 'Residual flicker in captured image',
        data,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56,189,248,0.12)',
        fill: true,
        pointRadius: 0,
        borderWidth: 2,
        tension: 0,
      },
      {
        label: 'Current shutter',
        data: [current],
        borderColor: '#f59e0b',
        backgroundColor: '#f59e0b',
        pointRadius: 6,
        showLine: false,
      },
      {
        label: `Slowest allowed at ${fmt(frameDenom, 3)} fps (360°)`,
        data: [
          { x: Math.max(10, frameDenom), y: 0 },
          { x: Math.max(10, frameDenom), y: Math.max(5, ...data.map((d) => d.y)) },
        ],
        borderColor: 'rgba(248,113,113,0.6)',
        borderDash: [5, 5],
        pointRadius: 0,
        borderWidth: 1.5,
      },
    ];
    c.update();
  }, [data, current, frameDenom]);

  return (
    <div style={{ height, position: 'relative' }}>
      <canvas ref={canvas} />
    </div>
  );
}
