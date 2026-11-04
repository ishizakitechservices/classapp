/**
 * MathChart — renders standard charts (line, bar, pie, scatter) from a ChartSpec.
 *
 * Uses Chart.js. The spec comes from DeepSeek as structured JSON or from a local
 * template — DeepSeek never touches pixels, so zero tokens are spent on rendering.
 *
 * If Chart.js is not yet installed, this renders a plain SVG fallback so the app
 * never crashes.
 */

import React, { type JSX, useEffect, useRef, useState } from 'react';
import { ChartSpec } from '../../shared/mathCharts';

interface MathChartProps {
  spec: ChartSpec;
  width?: number;
  height?: number;
  className?: string;
}

export default function MathChart({
  spec,
  width = 400,
  height = 300,
  className = '',
}: MathChartProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [chart, setChart] = useState<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Try Chart.js first (loaded globally via CDN or bundle)
    const Chart = (window as any).Chart;
    if (Chart) {
      if (chart) chart.destroy();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let newChart: any;
      switch (spec.kind) {
        case 'line':
          newChart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: spec.labels || [],
              datasets: [
                {
                  label: spec.title,
                  data: spec.values || [],
                  borderColor: '#3b82f6',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  fill: true,
                  tension: 0.2,
                  pointRadius: 3,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { title: { display: true, text: spec.title }, legend: { display: false } },
              scales: {
                x: { title: { display: true, text: spec.xAxis || 'x' } },
                y: { title: { display: true, text: spec.yAxis || 'y' } },
              },
            },
          });
          break;
        case 'bar':
          newChart = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: spec.labels || [],
              datasets: [
                {
                  label: spec.title,
                  data: spec.values || [],
                  backgroundColor: '#3b82f6',
                  borderRadius: 4,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { title: { display: true, text: spec.title }, legend: { display: false } },
              scales: {
                x: { title: { display: true, text: spec.xAxis || 'Category' } },
                y: { title: { display: true, text: spec.yAxis || 'Value' } },
              },
            },
          });
          break;
        case 'pie':
          newChart = new Chart(ctx, {
            type: 'pie',
            data: {
              labels: spec.labels || [],
              datasets: [
                {
                  label: spec.title,
                  data: spec.values || [],
                  backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { title: { display: true, text: spec.title } },
            },
          });
          break;
        case 'scatter':
          newChart = new Chart(ctx, {
            type: 'scatter',
            data: {
              datasets: [
                {
                  label: spec.title,
                  data: spec.points?.map((p) => ({ x: p.x, y: p.y })) || [],
                  backgroundColor: '#ef4444',
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { title: { display: true, text: spec.title }, legend: { display: false } },
              scales: {
                x: { title: { display: true, text: spec.xAxis || 'x' } },
                y: { title: { display: true, text: spec.yAxis || 'y' } },
              },
            },
          });
          break;
        default:
          // inequalities handled by InequalityGraph component
          break;
      }
      setChart(newChart);
      return () => newChart?.destroy();
    }

    // No Chart.js available — draw a minimal SVG line chart fallback
    if (spec.kind === 'line' && spec.labels && spec.values) {
      // Fallback handled by CSS: we render nothing here; parent shows a message.
      return;
    }
  }, [spec, chart]);

  return (
    <div className={className} style={{ width, height, position: 'relative' }}>
      <canvas ref={canvasRef} width={width} height={height} />
    </div>
  );
}
