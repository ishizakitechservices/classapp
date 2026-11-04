/**
 * CoordinatePlane — lightweight SVG Cartesian plane used by all graph components.
 *
 * Zero AI tokens: pure browser SVG. Draws axes, gridlines, and labels.
 * Consumes: width, height, x range, y range, and optional tick steps.
 * Emits nothing — purely presentational.
 */

import React, { type JSX } from 'react';

interface CoordinatePlaneProps {
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks?: number[];
  yTicks?: number[];
  className?: string;
}

/** Map a data value to a pixel position on the plane. */
function mapValue(value: number, min: number, max: number, pixelMin: number, pixelMax: number): number {
  return pixelMin + ((value - min) / (max - min)) * (pixelMax - pixelMin);
}

export default function CoordinatePlane({
  width,
  height,
  xMin,
  xMax,
  yMin,
  yMax,
  xTicks = [],
  yTicks = [],
  className = '',
}: CoordinatePlaneProps): JSX.Element {
  const padding = 40; // room for axis labels
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const xZero = mapValue(0, xMin, xMax, padding, padding + plotWidth);
  const yZero = mapValue(0, yMin, yMax, padding + plotHeight, padding);

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Coordinate plane"
    >
      {/* Gridlines */}
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect
        x={padding}
        y={padding}
        width={plotWidth}
        height={plotHeight}
        fill="url(#grid)"
        pointerEvents="none"
      />

      {/* X axis */}
      <line
        x1={padding}
        y1={yZero}
        x2={padding + plotWidth}
        y2={yZero}
        stroke="#374151"
        strokeWidth={2}
      />
      {/* Y axis */}
      <line
        x1={xZero}
        y1={padding}
        x2={xZero}
        y2={padding + plotHeight}
        stroke="#374151"
        strokeWidth={2}
      />

      {/* X ticks & labels */}
      {xTicks.map((tick) => {
        const px = mapValue(tick, xMin, xMax, padding, padding + plotWidth);
        return (
          <g key={`x-${tick}`}>
            <line
              x1={px}
              y1={yZero - 4}
              x2={px}
              y2={yZero + 4}
              stroke="#6b7280"
              strokeWidth={1}
            />
            <text
              x={px}
              y={yZero + 20}
              fontSize="11"
              fill="#6b7280"
              textAnchor="middle"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Y ticks & labels */}
      {yTicks.map((tick) => {
        const py = mapValue(tick, yMin, yMax, padding + plotHeight, padding);
        return (
          <g key={`y-${tick}`}>
            <line
              x1={xZero - 4}
              y1={py}
              x2={xZero + 4}
              y2={py}
              stroke="#6b7280"
              strokeWidth={1}
            />
            <text
              x={xZero - 8}
              y={py + 4}
              fontSize="11"
              fill="#6b7280"
              textAnchor="end"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Axis titles */}
      <text
        x={padding + plotWidth / 2}
        y={height - 8}
        fontSize="12"
        fill="#374151"
        textAnchor="middle"
      >
        x
      </text>
      <text
        x={12}
        y={padding + plotHeight / 2}
        fontSize="12"
        fill="#374151"
        textAnchor="middle"
        transform={`rotate(-90 12 ${padding + plotHeight / 2})`}
      >
        y
      </text>
    </svg>
  );
}
