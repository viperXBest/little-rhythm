// Growth records: units, input parsing, date checks and chart geometry (v1.2.0). Weight is stored in
// grams, length and head circumference in millimetres (integers); the app shows kg and cm, metric
// only. No reference values, norms or percentiles live here or anywhere else in the app: the numbers
// are the family's own record.
// No imports: this runs under the app and under `deno test` (growth-values.test.ts).

export type GrowthKind = 'weight' | 'length' | 'head';
export const GROWTH_KINDS: readonly GrowthKind[] = ['weight', 'length', 'head'];

export function isGrowthKind(value: string): value is GrowthKind {
  return value === 'weight' || value === 'length' || value === 'head';
}

type GrowthSpec = {
  /** Short name (the measure chips and form labels). */
  label: string;
  /** Heading of the chart card and the form. */
  title: string;
  /** Lower case name for sentences ("Add weight"). */
  noun: string;
  unit: 'kg' | 'cm';
  /** Stored units per shown unit: 1000 g per kg, 10 mm per cm. */
  perUnit: number;
  /** Most decimals the app shows and accepts. */
  decimals: number;
  /** Weight drops trailing zeros (4.2 kg); cm always shows one decimal (54.0 cm). */
  trimZeros: boolean;
  /** Typo guards in stored units: the same bounds as the database CHECK, not norms. */
  min: number;
  max: number;
};

export const GROWTH_SPECS: Record<GrowthKind, GrowthSpec> = {
  weight: {
    label: 'Weight',
    title: 'Weight',
    noun: 'weight',
    unit: 'kg',
    perUnit: 1000,
    decimals: 2,
    trimZeros: true,
    min: 300,
    max: 30000,
  },
  length: {
    label: 'Length',
    title: 'Length',
    noun: 'length',
    unit: 'cm',
    perUnit: 10,
    decimals: 1,
    trimZeros: false,
    min: 200,
    max: 1200,
  },
  head: {
    label: 'Head',
    title: 'Head circumference',
    noun: 'head circumference',
    unit: 'cm',
    perUnit: 10,
    decimals: 1,
    trimZeros: false,
    min: 150,
    max: 600,
  },
};

const NBSP = ' ';

/** A stored value as shown, without the unit: 4250 g is "4.25", 4000 g "4"; 543 mm is "54.3". */
export function formatValue(kind: GrowthKind, stored: number): string {
  const { perUnit, decimals, trimZeros } = GROWTH_SPECS[kind];
  const scale = 10 ** decimals;
  // Whole steps of the last shown decimal (10 g, 1 mm), so no floating-point division by 1000.
  const steps = Math.round(stored / (perUnit / scale));
  const whole = Math.floor(steps / scale);
  const fraction = String(steps % scale).padStart(decimals, '0');
  const shown = trimZeros ? fraction.replace(/0+$/, '') : fraction;
  return shown ? `${whole}.${shown}` : String(whole);
}

/** The value with its unit, the two kept together by a non-breaking space ("4.25 kg"). */
export function formatWithUnit(kind: GrowthKind, stored: number): string {
  return `${formatValue(kind, stored)}${NBSP}${GROWTH_SPECS[kind].unit}`;
}

export type ParsedValue = { ok: true; value: number } | { ok: false; message: string };

const EXAMPLE: Record<GrowthKind, string> = { weight: '4.25', length: '54.5', head: '36.5' };

/**
 * What a parent typed (kg or cm, with a dot or a comma) as the stored integer, or a message to
 * show under the field. Integer arithmetic only; more decimals than the app shows are refused, not rounded.
 */
export function parseValue(kind: GrowthKind, text: string): ParsedValue {
  const spec = GROWTH_SPECS[kind];
  const match = /^(\d{0,3})(?:[.,](\d*))?$/.exec(text.trim());
  const whole = match?.[1] ?? '';
  const fraction = match?.[2] ?? '';
  if (!match || (whole === '' && fraction === '')) {
    return { ok: false, message: `Enter a number, like ${EXAMPLE[kind]}.` };
  }
  if (fraction.length > spec.decimals) {
    return {
      ok: false,
      message: `Use at most ${spec.decimals} ${spec.decimals === 1 ? 'decimal' : 'decimals'}.`,
    };
  }
  const lastDecimal = spec.perUnit / 10 ** spec.decimals;
  const value = Number(whole || '0') * spec.perUnit + Number(fraction.padEnd(spec.decimals, '0')) * lastDecimal;
  if (value < spec.min || value > spec.max) {
    return {
      ok: false,
      message: `Enter a ${spec.noun} between ${formatValue(kind, spec.min)} and ${formatWithUnit(kind, spec.max)}.`,
    };
  }
  return { ok: true, value };
}

// ---------------------------------------------------------------------------------------------
// Dates (YYYY-MM-DD, the phone's calendar day)
// ---------------------------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days since 1970-01-01 of a real YYYY-MM-DD date, or null (2026-02-30 is not a date). */
export function dayNumber(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return time / MS_PER_DAY;
}

/** A message when the date can't be saved, else null. `today` is the phone's local day. */
export function validateMeasuredOn(measuredOn: string, birthDate: string, today: string): string | null {
  const day = dayNumber(measuredOn);
  if (day === null) return 'Choose a date.';
  const todayNumber = dayNumber(today);
  if (todayNumber !== null && day > todayNumber) return 'The date can’t be in the future.';
  const birth = dayNumber(birthDate);
  if (birth !== null && day < birth) return 'The date can’t be before the birth date.';
  return null;
}

/** "3 Nov" or, with the year, "3 Nov 2026", in the phone's language. */
export function formatDay(date: string, withYear = false): string {
  const day = dayNumber(date);
  if (day === null) return date;
  const [year, month, dom] = date.split('-').map(Number);
  return new Date(year, month - 1, dom).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

// ---------------------------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------------------------

type RowLike = { id: string; kind: string; value: number; measured_on: string; created_at?: string };

/** Oldest first; measurements of the same day by when they were logged. */
function compareRows(a: RowLike, b: RowLike): number {
  if (a.measured_on !== b.measured_on) return a.measured_on < b.measured_on ? -1 : 1;
  const logged = (a.created_at ?? '').localeCompare(b.created_at ?? '');
  return logged !== 0 ? logged : a.id.localeCompare(b.id);
}

/** The rows of one kind, newest first (the list under the chart). */
export function newestFirst<T extends RowLike>(rows: readonly T[], kind: GrowthKind): T[] {
  return rows.filter((row) => row.kind === kind).sort((a, b) => compareRows(b, a));
}

export type ChartPoint = { id: string; date: string; day: number; value: number };

/** The points of one kind, oldest first. Rows with an unreadable date are left out. */
export function chartPoints(rows: readonly RowLike[], kind: GrowthKind): ChartPoint[] {
  return rows
    .filter((row) => row.kind === kind)
    .sort(compareRows)
    .flatMap((row) => {
      const day = dayNumber(row.measured_on);
      return day === null ? [] : [{ id: row.id, date: row.measured_on, day, value: row.value }];
    });
}

/** A step of 1, 2 or 5 times a power of ten, aiming for about `intervals` steps across `range`. */
function niceStep(range: number, intervals: number): number {
  const raw = range / intervals;
  const power = 10 ** Math.floor(Math.log10(raw));
  const factor = raw / power;
  const nice = factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10;
  return Math.max(1, nice * power);
}

/**
 * The vertical range of a chart in stored units: the data rounded out to a round step. A single
 * value (or all equal) sits in the middle.
 */
export function yDomain(values: readonly number[]): { min: number; max: number } {
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  if (highest === lowest) {
    const step = niceStep(Math.max(1, highest * 0.1), 2);
    return { min: lowest - step, max: lowest + step };
  }
  const step = niceStep(highest - lowest, 4);
  return { min: Math.floor(lowest / step) * step, max: Math.ceil(highest / step) * step };
}

export type ChartBox = {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ChartLayout = {
  yMin: number;
  yMax: number;
  /** y of yMax and yMin in the box. */
  yTop: number;
  yBottom: number;
  dots: { id: string; x: number; y: number }[];
  /** SVG path of the line; empty with fewer than two points. */
  path: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pixel positions for the points, in time order along x (a gap of weeks looks like a gap) and in
 * value along y. Pure geometry: no reference lines, bands or norms are ever added.
 */
export function layoutChart(points: readonly ChartPoint[], box: ChartBox): ChartLayout {
  const { min, max } = yDomain(points.map((p) => p.value));
  const innerWidth = Math.max(0, box.width - box.left - box.right);
  const yTop = box.top;
  const yBottom = Math.max(box.top, box.height - box.bottom);
  const first = points[0]?.day ?? 0;
  const span = (points[points.length - 1]?.day ?? 0) - first;
  const dots = points.map((p) => ({
    id: p.id,
    x: round1(span === 0 ? box.left + innerWidth / 2 : box.left + ((p.day - first) / span) * innerWidth),
    y: round1(yTop + ((max - p.value) / (max - min)) * (yBottom - yTop)),
  }));
  const path = dots.length < 2 ? '' : dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.x} ${d.y}`).join(' ');
  return { yMin: min, yMax: max, yTop, yBottom, dots, path };
}

/** What a screen reader says for a chart: the count, the first and the latest value, no judgement. */
export function chartAltText(
  kind: GrowthKind,
  points: readonly ChartPoint[],
  formatDate: (date: string) => string = (date) => formatDay(date, true),
): string {
  const title = GROWTH_SPECS[kind].title;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return `${title} chart: no measurements yet.`;
  const at = (p: ChartPoint) => `${formatWithUnit(kind, p.value)} on ${formatDate(p.date)}`;
  if (points.length === 1) return `${title} chart: 1 measurement, ${at(first)}.`;
  return `${title} chart: ${points.length} measurements. First: ${at(first)}. Latest: ${at(last)}.`;
}
