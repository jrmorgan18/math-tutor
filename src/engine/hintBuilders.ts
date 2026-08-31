import type { Hint, HintVisual } from './types';

/**
 * Terse constructors so generator hint ladders stay readable.
 *
 * Usage reads close to the thing it describes:
 *
 *   hints: [
 *     h('Start at 45 and count up to 54.', numberline(45, 54)),
 *     h('The part you are missing fits inside the whole.', barmodel(54, [45, null])),
 *     h('Take the part you know away from the whole.', stacked(54, 45, '-', 9)),
 *   ]
 */
export const h = (text: string, visual?: HintVisual): Hint =>
  visual ? { text, visual } : { text };

export const stacked = (
  top: number,
  bottom: number,
  op: '+' | '-',
  result?: number,
  highlight?: 'ones' | 'tens',
): HintVisual => ({ kind: 'stacked', top, bottom, op, result, highlight });

export const numberline = (
  from: number,
  to: number,
  unknownLabel?: string,
): HintVisual => ({ kind: 'numberline', from, to, unknownLabel });

export const tenframe = (a: number, b: number): HintVisual => ({
  kind: 'tenframe',
  a,
  b,
});

export const array = (rows: number, cols: number): HintVisual => ({
  kind: 'array',
  rows,
  cols,
});

/**
 * Beyond roughly this many dots an array stops being a picture you can grasp
 * and becomes a wall you have to count — which defeats the entire purpose of
 * drawing it.
 */
export const MAX_DOTS = 60;

/**
 * An array/groups visual only when it is small enough to actually read.
 * Returns undefined otherwise, and `h(text, undefined)` degrades cleanly to a
 * text-only hint — better than an unreadable grid.
 */
export const arrayIfSmall = (rows: number, cols: number): HintVisual | undefined =>
  rows > 0 && cols > 0 && rows * cols <= MAX_DOTS ? array(rows, cols) : undefined;

export const groupsIfSmall = (g: number, per: number): HintVisual | undefined =>
  g > 0 && per > 0 && g * per <= MAX_DOTS ? groups(g, per) : undefined;

/** Base-ten columns — the concrete picture behind place value. */
export const placevalue = (
  n: number,
  highlight?: 'hundreds' | 'tens' | 'ones',
): HintVisual => ({
  kind: 'placevalue',
  hundreds: Math.floor(n / 100) % 10,
  tens: Math.floor(n / 10) % 10,
  ones: n % 10,
  highlight,
});

export const barmodel = (
  whole: number | null,
  parts: Array<number | null>,
): HintVisual => ({ kind: 'barmodel', whole, parts });

export const groups = (g: number, per: number): HintVisual => ({
  kind: 'groups',
  groups: g,
  per,
});

/** `shaded` of `parts` equal pieces filled in. */
export const fractionbar = (
  parts: number,
  shaded: number,
  shape: 'bar' | 'circle' = 'bar',
  compare?: { parts: number; shaded: number },
): HintVisual => ({ kind: 'fractionbar', parts, shaded, shape, compare });

export const clock = (hour: number, minute: number): HintVisual => ({
  kind: 'clock',
  // 12-hour face: 12 and 0 are the same position, but 12 is what a child reads.
  hour: ((hour - 1 + 12) % 12) + 1,
  minute: ((minute % 60) + 60) % 60,
});

export const coins = (values: number[], total?: number): HintVisual => ({
  kind: 'coins',
  values,
  total,
});

export const shape = (
  sides: number,
  label?: string,
  sideLabels?: number[],
  symmetry?: boolean,
): HintVisual => ({ kind: 'shape', sides, label, sideLabels, symmetry });

export const ruler = (lengths: number[], unit = 'cm'): HintVisual => ({
  kind: 'ruler',
  lengths,
  unit,
});

/**
 * Break a jump on the number line into the hops a child would actually make:
 * up to the next ten, then whole tens, then the leftover ones. Returning the
 * bridging strategy rather than one opaque leap is the entire pedagogical
 * point of drawing the line at all.
 */
export function computeJumps(from: number, to: number): number[] {
  const gap = Math.abs(to - from);
  if (gap === 0) return [];
  if (gap <= 10) return [gap];

  const toNextTen = from < to ? (10 - (from % 10)) % 10 : from % 10;
  if (toNextTen === 0 || toNextTen >= gap) {
    const tens = Math.floor(gap / 10) * 10;
    const ones = gap - tens;
    return [tens, ones].filter((j) => j > 0);
  }

  const rest = gap - toNextTen;
  const tens = Math.floor(rest / 10) * 10;
  const ones = rest - tens;
  return [toNextTen, tens, ones].filter((j) => j > 0);
}
