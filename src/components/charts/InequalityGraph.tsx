/**
 * InequalityGraph — graphs a system of linear inequalities with shaded regions.
 *
 * Zero AI tokens: pure SVG. Accepts inequalities like "y <= 2x + 1" or
 * "2x + 3y < 6" and shades the feasible region client-side.
 *
 * Parses simple linear inequalities of the form:
 *   ax + by <= c  |  ax + by >= c  |  ax + by < c  |  ax + by > c
 *   y <= mx + c   |  y >= mx + c   |  y < mx + c   |  y > mx + c
 */

import React, { type JSX, useMemo } from 'react';
import { Inequality } from '../../shared/mathCharts';

interface InequalityGraphProps {
  inequalities: Inequality[];
  width?: number;
  height?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  className?: string;
}

/** Parse "2x + 3y <= 6" into { a: 2, b: 3, c: 6, op: '<=' } */
function parseInequality(expr: string): { a: number; b: number; c: number; op: string } | null {
  const cleaned = expr.replace(/\s+/g, '');
  // Match patterns like: 2x+3y<=6, y<=-2x+1, 3y>=6-x, x>4
  const m = cleaned.match(/^(-?\d*\.?\d*)x\s*([+-])\s*(-?\d*\.?\d*)y\s*(<=|>=|<|>)\s*(-?\d*\.?\d+)$/);
  if (m) {
    const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number(m[1]);
    const sign = m[2] === '+' ? 1 : -1;
    const b = sign * (m[3] === '' || m[3] === '+' ? 1 : m[3] === '-' ? -1 : Number(m[3]));
    const c = Number(m[5]);
    const op = m[4];
    return { a, b, c, op };
  }
  // Match y = mx + c style: y<=2x+1, y>-x+3
  const m2 = cleaned.match(/^y\s*(<=|>=|<|>)\s*(-?\d*\.?\d*)x\s*([+-]?\s*-?\d*\.?\d+)$/);
  if (m2) {
    const op = m2[1];
    const m = m2[2] === '' || m2[2] === '+' ? 1 : m2[2] === '-' ? -1 : Number(m2[2]);
    const cStr = m2[3].replace(/\s+/g, '');
    const c = cStr === '' || cStr === '+' ? 0 : cStr === '-' ? 0 : Number(cStr);
    // Convert y op mx + c to -mx + y op c → a=-m, b=1
    return { a: -m, b: 1, c, op };
  }
  return null;
}

/** Compute line endpoints for ax + by = c within the view box bounds. */
function lineEndpoints(
  a: number,
  b: number,
  c: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): { x1: number; y1: number; x2: number; y2: number } | null {
  // Find intersections with the rectangle boundary
  const pts: Array<{ x: number; y: number }> = [];

  // Left edge x = xMin
  if (b !== 0) {
    const y = (c - a * xMin) / b;
    if (y >= yMin && y <= yMax) pts.push({ x: xMin, y });
  } else if (a !== 0 && c / a === xMin) {
    pts.push({ x: xMin, y: yMin });
    pts.push({ x: xMin, y: yMax });
  }

  // Right edge x = xMax
  if (b !== 0) {
    const y = (c - a * xMax) / b;
    if (y >= yMin && y <= yMax) pts.push({ x: xMax, y });
  }

  // Top edge y = yMin
  if (a !== 0) {
    const x = (c - b * yMin) / a;
    if (x >= xMin && x <= xMax) pts.push({ x, y: yMin });
  }

  // Bottom edge y = yMax
  if (a !== 0) {
    const x = (c - b * yMax) / a;
    if (x >= xMin && x <= xMax) pts.push({ x, y: yMax });
  }

  // Deduplicate
  const unique: Array<{ x: number; y: number }> = [];
  for (const p of pts) {
    const dup = unique.find((u) => Math.abs(u.x - p.x) < 1e-6 && Math.abs(u.y - p.y) < 1e-6);
    if (!dup) unique.push(p);
  }

  if (unique.length < 2) return null;
  return { x1: unique[0].x, y1: unique[0].y, x2: unique[1].x, y2: unique[1].y };
}

/** Sample a point to test which side of the boundary is the feasible region. */
function testPoint(a: number, b: number, c: number, op: string): { x: number; y: number } | null {
  // Try (0,0) first, then (1,0), (0,1), etc.
  const candidates = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];
  for (const p of candidates) {
    const lhs = a * p.x + b * p.y;
    let satisfied: boolean;
    switch (op) {
      case '<=': satisfied = lhs <= c; break;
      case '>=': satisfied = lhs >= c; break;
      case '<': satisfied = lhs < c; break;
      case '>': satisfied = lhs > c; break;
      default: satisfied = false;
    }
    if (satisfied) return p;
  }
  return null;
}

export default function InequalityGraph({
  inequalities,
  width = 400,
  height = 350,
  xMin = -10,
  xMax = 10,
  yMin = -10,
  yMax = 10,
  className = '',
}: InequalityGraphProps): JSX.Element {
  const padding = 45;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const mapX = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const mapY = (y: number) => padding + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight;

  const parsed = useMemo(
    () => inequalities.map((inc) => ({ ...inc, parsed: parseInequality(inc.expression) })),
    [inequalities]
  );

  // Build test points for shading (sample a grid, find points in all feasible regions)
  const feasiblePoints = useMemo(() => {
    const valid = parsed.filter((p) => p.parsed);
    if (valid.length === 0) return [];
    const step = 0.5;
    const pts: Array<{ x: number; y: number }> = [];
    for (let x = xMin; x <= xMax; x += step) {
      for (let y = yMin; y <= yMax; y += step) {
        let ok = true;
        for (const p of valid) {
          const { a, b, c, op } = p.parsed!;
          const lhs = a * x + b * y;
          let satisfied: boolean;
          switch (op) {
            case '<=': satisfied = lhs <= c; break;
            case '>=': satisfied = lhs >= c; break;
            case '<': satisfied = lhs < c; break;
            case '>': satisfied = lhs > c; break;
            default: satisfied = false;
          }
          if (!satisfied) { ok = false; break; }
        }
        if (ok) pts.push({ x, y });
      }
    }
    return pts;
  }, [parsed, xMin, xMax, yMin, yMax]);

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="System of linear inequalities graph"
    >
      <defs>
        <pattern id="grid2" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#f3f4f6" strokeWidth="1" />
        </pattern>
      </defs>
      <rect
        x={padding}
        y={padding}
        width={plotWidth}
        height={plotHeight}
        fill="url(#grid2)"
        pointerEvents="none"
      />

      {/* Shade feasible region (light overlay over sampled points) */}
      {feasiblePoints.length > 0 && (
        <g opacity="0.25">
          {feasiblePoints.map((p, i) => (
            <rect
              key={i}
              x={mapX(p.x) - 3}
              y={mapY(p.y) - 3}
              width={6}
              height={6}
              fill="#10b981"
              pointerEvents="none"
            />
          ))}
        </g>
      )}

      {/* Boundary lines */}
      {parsed.map((p, i) => {
        if (!p.parsed) return null;
        const ep = lineEndpoints(
          p.parsed.a, p.parsed.b, p.parsed.c,
          xMin, xMax, yMin, yMax
        );
        if (!ep) return null;
        const dashed = p.parsed.op === '<' || p.parsed.op === '>';
        return (
          <g key={`ineq-${i}`}>
            <line
              x1={mapX(ep.x1)}
              y1={mapY(ep.y1)}
              x2={mapX(ep.x2)}
              y2={mapY(ep.y2)}
              stroke={p.colour}
              strokeWidth={2}
              strokeDasharray={dashed ? '6 4' : undefined}
            />
            <text
              x={mapX(ep.x2) + 4}
              y={mapY(ep.y2)}
              fontSize="11"
              fill={p.colour}
              dominantBaseline="middle"
            >
              {p.label || p.expression}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line x1={padding} y1={mapY(0)} x2={padding + plotWidth} y2={mapY(0)} stroke="#374151" strokeWidth={2} />
      <line x1={mapX(0)} y1={padding} x2={mapX(0)} y2={padding + plotHeight} stroke="#374151" strokeWidth={2} />

      {/* Ticks */}
      {[-10, -5, 5, 10].filter((t) => t > xMin && t < xMax).map((t) => (
        <g key={`xt-${t}`}>
          <line x1={mapX(t)} y1={mapY(0) - 3} x2={mapX(t)} y2={mapY(0) + 3} stroke="#6b7280" strokeWidth={1} />
          <text x={mapX(t)} y={mapY(0) + 15} fontSize="10" fill="#6b7280" textAnchor="middle">{t}</text>
        </g>
      ))}
      {[-10, -5, 5, 10].filter((t) => t > yMin && t < yMax).map((t) => (
        <g key={`yt-${t}`}>
          <line x1={mapX(0) - 3} y1={mapY(t)} x2={mapX(0) + 3} y2={mapY(t)} stroke="#6b7280" strokeWidth={1} />
          <text x={mapX(0) - 6} y={mapY(t) + 4} fontSize="10" fill="#6b7280" textAnchor="end">{t}</text>
        </g>
      ))}
    </svg>
  );
}
