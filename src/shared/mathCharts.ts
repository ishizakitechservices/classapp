/**
 * Shared maths chart and graph definitions for Adom AI.
 *
 * Design rules (keep token use to zero on the drawing side):
 * - DeepSeek only returns structured JSON: chart type, data, labels, and
 *   optional inequality system. It never draws or returns image URLs.
 * - All rendering happens client-side in SVG or Chart.js — no AI tokens
 *   spent on pixels, no fake/generated images.
 * - This file is imported by both client and server. Keep it free of secrets
 *   and browser-only APIs.
 */

export type ChartKind =
  | 'line'
  | 'bar'
  | 'pie'
  | 'scatter'
  | 'inequalities'; // system of linear inequalities, shaded regions

export type Inequality = {
  /** e.g. 'y <= 2x + 1' or '2x + 3y < 6' */
  expression: string;
  /** Human label shown in the legend */
  label: string;
  /** Colour for the boundary line and shading */
  colour: string;
};

export interface ChartSpec {
  kind: ChartKind;
  title: string;
  /** X-axis label */
  xAxis?: string;
  /** Y-axis label */
  yAxis?: string;
  /** For line/bar/pie/scatter */
  labels?: string[];
  /** Parallel array to labels */
  values?: number[];
  /** For scatter: array of {x, y} */
  points?: Array<{ x: number; y: number }>;
  /** For system of inequalities */
  inequalities?: Inequality[];
  /** Curriculum topic this chart belongs to (for caching/display) */
  topic?: string;
  /** SHS form level (1-3) */
  form?: 1 | 2 | 3;
}

/**
 * Registry of built-in SHS maths chart templates.
 * These cost zero DeepSeek tokens — the frontend looks up the template,
 * plugs in student numbers, and renders locally.
 */
export const MATH_CHART_TEMPLATES: Record<string, ChartSpec> = {
  'statistics_mean': {
    kind: 'bar',
    title: 'Mean calculation',
    xAxis: 'Data value',
    yAxis: 'Value',
    labels: [],
    values: [],
    topic: 'Statistics',
    form: 1,
  },
  'linear_graph': {
    kind: 'line',
    title: 'Linear graph',
    xAxis: 'x',
    yAxis: 'y',
    labels: [],
    values: [],
    topic: 'Linear graphs',
    form: 2,
  },
  'quadratic_graph': {
    kind: 'line',
    title: 'Quadratic graph',
    xAxis: 'x',
    yAxis: 'y',
    labels: [],
    values: [],
    topic: 'Quadratic functions',
    form: 2,
  },
  'trig_ratios': {
    kind: 'bar',
    title: 'Trigonometric ratios',
    xAxis: 'Angle',
    yAxis: 'Ratio',
    labels: ['0°', '30°', '45°', '60°', '90°'],
    values: [0, 0.5, Math.sqrt(2) / 2, Math.sqrt(3) / 2, 1],
    topic: 'Trigonometry',
    form: 2,
  },
  'probability_distribution': {
    kind: 'bar',
    title: 'Probability distribution',
    xAxis: 'Outcome',
    yAxis: 'Probability',
    labels: [],
    values: [],
    topic: 'Probability',
    form: 3,
  },
  'sine_wave': {
    kind: 'line',
    title: 'Sine wave: y = sin(x)',
    xAxis: 'Angle (°)',
    yAxis: 'sin(x)',
    labels: ['0', '30', '45', '60', '90', '120', '135', '150', '180', '210', '225', '240', '270', '300', '315', '330', '360'],
    values: [0, 0.5, Math.sqrt(2)/2, Math.sqrt(3)/2, 1, Math.sqrt(3)/2, Math.sqrt(2)/2, 0.5, 0, -0.5, -Math.sqrt(2)/2, -Math.sqrt(3)/2, -1, -Math.sqrt(3)/2, -Math.sqrt(2)/2, -0.5, 0],
    topic: 'Trigonometry',
    form: 2,
  },
  'cosine_wave': {
    kind: 'line',
    title: 'Cosine wave: y = cos(x)',
    xAxis: 'Angle (°)',
    yAxis: 'cos(x)',
    labels: ['0', '30', '45', '60', '90', '120', '135', '150', '180', '210', '225', '240', '270', '300', '315', '330', '360'],
    values: [1, Math.sqrt(3)/2, Math.sqrt(2)/2, 0.5, 0, -0.5, -Math.sqrt(2)/2, -Math.sqrt(3)/2, -1, -Math.sqrt(3)/2, -Math.sqrt(2)/2, -0.5, 0, 0.5, Math.sqrt(2)/2, Math.sqrt(3)/2, 1],
    topic: 'Trigonometry',
    form: 2,
  },
  'statistics_histogram': {
    kind: 'bar',
    title: 'Frequency histogram',
    xAxis: 'Class interval',
    yAxis: 'Frequency',
    labels: [],
    values: [],
    topic: 'Statistics',
    form: 2,
  },
  'quadratic_curve': {
    kind: 'line',
    title: 'Quadratic curve: y = ax² + bx + c',
    xAxis: 'x',
    yAxis: 'y',
    labels: [],
    values: [],
    topic: 'Quadratic functions',
    form: 2,
  },
  'circle_geometry': {
    kind: 'pie',
    title: 'Circle parts',
    xAxis: '',
    yAxis: '',
    labels: ['Radius', 'Diameter', 'Circumference', 'Area'],
    values: [],
    topic: 'Circle theorems',
    form: 2,
  },
  'venn_diagram': {
    kind: 'scatter',
    title: 'Set relationship',
    xAxis: '',
    yAxis: '',
    labels: [],
    values: [],
    points: [],
    topic: 'Sets',
    form: 1,
  },
};

/**
 * Build a line-chart spec from a linear equation y = mx + c over an x range.
 * Zero tokens: pure client-side maths.
 */
export function linearGraphSpec(
  m: number,
  c: number,
  xMin: number,
  xMax: number,
  step = 1
): ChartSpec {
  const labels: string[] = [];
  const values: number[] = [];
  for (let x = xMin; x <= xMax; x += step) {
    labels.push(String(x));
    values.push(m * x + c);
  }
  return {
    kind: 'line',
    title: `y = ${m}x + ${c >= 0 ? '+' : ''}${c}`,
    xAxis: 'x',
    yAxis: 'y',
    labels,
    values,
    topic: 'Linear graphs',
    form: 2,
  };
}

/**
 * Build a system-of-inequalities spec.
 * Zero tokens: pure client-side maths.
 */
export function inequalitiesSpec(
  inequalities: Inequality[],
  xMin = -10,
  xMax = 10,
  yMin = -10,
  yMax = 10
): ChartSpec {
  return {
    kind: 'inequalities',
    title: 'System of linear inequalities',
    inequalities,
    topic: 'Linear inequalities',
    form: 3,
  };
}

/** Look up a built-in template by topic key. */
export function getChartTemplate(key: string): ChartSpec | null {
  return MATH_CHART_TEMPLATES[key] ?? null;
}

/**
 * Build a quadratic curve spec y = ax² + bx + c over an x range.
 * Zero tokens: pure client-side maths.
 */
export function quadraticGraphSpec(
  a: number,
  b: number,
  c: number,
  xMin: number,
  xMax: number,
  step = 0.5
): ChartSpec {
  const labels: string[] = [];
  const values: number[] = [];
  for (let x = xMin; x <= xMax; x += step) {
    labels.push(x.toFixed(1));
    values.push(a * x * x + b * x + c);
  }
  const signB = b >= 0 ? '+' : '';
  const signC = c >= 0 ? '+' : '';
  return {
    kind: 'line',
    title: `y = ${a}x² ${signB}${b}x ${signC}${c}`,
    xAxis: 'x',
    yAxis: 'y',
    labels,
    values,
    topic: 'Quadratic functions',
    form: 2,
  };
}

/**
 * Build a statistics histogram spec from frequency data.
 * Zero tokens: pure client-side maths.
 */
export function histogramSpec(
  intervals: string[],
  frequencies: number[]
): ChartSpec {
  return {
    kind: 'bar',
    title: 'Frequency distribution',
    xAxis: 'Class interval',
    yAxis: 'Frequency',
    labels: intervals,
    values: frequencies,
    topic: 'Statistics',
    form: 2,
  };
}

/**
 * Build a sine or cosine wave spec over degrees 0-360.
 * Zero tokens: pure client-side maths.
 */
export function trigWaveSpec(kind: 'sine' | 'cosine'): ChartSpec {
  const labels = ['0', '30', '45', '60', '90', '120', '135', '150', '180', '210', '225', '240', '270', '300', '315', '330', '360'];
  const values = labels.map((deg) => {
    const rad = (Number(deg) * Math.PI) / 180;
    return kind === 'sine' ? Math.sin(rad) : Math.cos(rad);
  });
  return {
    kind: 'line',
    title: kind === 'sine' ? 'y = sin(x)' : 'y = cos(x)',
    xAxis: 'Angle (°)',
    yAxis: kind === 'sine' ? 'sin(x)' : 'cos(x)',
    labels,
    values,
    topic: 'Trigonometry',
    form: 2,
  };
}

/**
 * Build a circle geometry spec showing radius, diameter, circumference, area proportions.
 * Zero tokens: pure client-side maths.
 */
export function circleGeometrySpec(radius: number): ChartSpec {
  const diameter = 2 * radius;
  const circumference = 2 * Math.PI * radius;
  const area = Math.PI * radius * radius;
  return {
    kind: 'pie',
    title: `Circle with radius r = ${radius}`,
    labels: ['Radius (r)', 'Diameter (2r)', 'Circumference (2πr)', 'Area (πr²)'],
    values: [radius, diameter, circumference, area],
    topic: 'Circle theorems',
    form: 2,
  };
}

/**
 * Build a scatter plot spec for coordinate geometry points.
 * Zero tokens: pure client-side maths.
 */
export function scatterSpec(
  points: Array<{ x: number; y: number }>,
  title: string = 'Coordinate geometry points'
): ChartSpec {
  return {
    kind: 'scatter',
    title,
    xAxis: 'x',
    yAxis: 'y',
    points,
    topic: 'Coordinate geometry',
    form: 2,
  };
}

/**
 * Solve a quadratic equation ax² + bx + c = 0 client-side (zero tokens).
 * Returns real roots or null if no real solutions.
 */
export function solveQuadratic(a: number, b: number, c: number): { x1: number; x2: number } | { x: number } | null {
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  if (discriminant === 0) return { x: -b / (2 * a) };
  const sqrtD = Math.sqrt(discriminant);
  return {
    x1: (-b - sqrtD) / (2 * a),
    x2: (-b + sqrtD) / (2 * a),
  };
}

/**
 * Compute mean, median, mode, range from a data array (zero tokens).
 */
export function statisticsSummary(data: number[]): {
  mean: number;
  median: number;
  mode: number[];
  range: number;
} {
  const sorted = [...data].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const freq: Record<number, number> = {};
  for (const v of sorted) freq[v] = (freq[v] || 0) + 1;
  const maxFreq = Math.max(...Object.values(freq));
  const mode = Object.entries(freq)
    .filter(([, f]) => f === maxFreq)
    .map(([k]) => Number(k));
  const range = sorted[sorted.length - 1] - sorted[0];
  return { mean, median, mode, range };
}
