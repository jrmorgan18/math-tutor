import { Rng } from '../rng';
import { h, shape, stacked } from '../hintBuilders';
import type { Problem } from '../types';

/**
 * Geometry.
 *
 * Shape work at this age goes wrong in one specific way: shapes get learned as
 * pictures in a default orientation, so a rotated square stops being a square
 * and a long thin rectangle stops being a rectangle. The levels therefore move
 * from naming to *properties* (sides, corners) as fast as possible, because
 * the property is the definition and the silhouette is not.
 */

interface ShapeFact {
  name: string;
  sides: number;
  corners: number;
}

/**
 * Only shapes whose side count names them unambiguously.
 *
 * Square and rectangle both have four sides, so "which shape has 4 sides?"
 * would have two correct answers, and the regular-polygon renderer draws them
 * identically anyway. Rectangles still appear at level 4 and throughout
 * perimeter, where the prompt names the shape outright.
 */
const SHAPES: ShapeFact[] = [
  { name: 'triangle', sides: 3, corners: 3 },
  { name: 'square', sides: 4, corners: 4 },
  { name: 'pentagon', sides: 5, corners: 5 },
  { name: 'hexagon', sides: 6, corners: 6 },
  { name: 'octagon', sides: 8, corners: 8 },
];

export function shapes2d(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'shapes-2d', level, seed, flavor: 'lab' as const };

  if (level === 1) {
    // Name the shape from a picture.
    const target = rng.pick(SHAPES);
    const options = new Set<string>([target.name]);
    while (options.size < 4) options.add(rng.pick(SHAPES).name);
    return {
      ...base,
      prompt: 'What is this shape called?',
      questionVisual: shape(target.sides, undefined),
      answer: target.name,
      representation: { kind: 'choice', options: rng.shuffle([...options]) },
      hints: [
        h('Count the straight sides all the way round.', shape(target.sides)),
        h(`It has ${target.sides} sides.`, shape(target.sides)),
        h(
          `A shape with ${target.sides} sides is a ${target.name}.`,
          shape(target.sides, target.name),
        ),
      ],
      meta: { operands: [target.sides, target.corners] },
    };
  }

  if (level === 2) {
    // Go the other way: property to name, with no picture until the hint.
    const target = rng.pick(SHAPES);
    const askCorners = rng.bool(0.5);
    const options = new Set<string>([target.name]);
    while (options.size < 4) options.add(rng.pick(SHAPES).name);
    return {
      ...base,
      prompt: askCorners
        ? `Which shape has exactly ${target.corners} corners?`
        : `Which shape has exactly ${target.sides} sides?`,
      answer: target.name,
      representation: { kind: 'choice', options: rng.shuffle([...options]) },
      hints: [
        h('Picture each one and count as you go round it.', shape(target.sides)),
        h(
          `A shape always has the same number of sides as corners — so ${target.sides} sides means ${target.corners} corners.`,
          shape(target.sides),
        ),
        h(`That is a ${target.name}.`, shape(target.sides, target.name)),
      ],
      meta: { operands: [target.sides, target.corners] },
    };
  }

  if (level === 3) {
    // Count sides on a drawn shape — numeric, so it can't be guessed from
    // four options.
    const target = rng.pick(SHAPES);
    const askCorners = rng.bool(0.5);
    return {
      ...base,
      prompt: askCorners ? 'How many corners does this shape have?' : 'How many sides does this shape have?',
      questionVisual: shape(target.sides),
      answer: String(askCorners ? target.corners : target.sides),
      representation: { kind: 'numeric' },
      hints: [
        h(
          'Start at one corner and work round in the same direction so you do not count one twice.',
          shape(target.sides),
        ),
        h(
          askCorners
            ? 'A corner is where two sides meet.'
            : 'A side is one straight edge between two corners.',
          shape(target.sides),
        ),
        h(
          `It is a ${target.name}: ${target.sides} sides and ${target.corners} corners.`,
          shape(target.sides, target.name),
        ),
      ],
      meta: { operands: [target.sides, target.corners] },
    };
  }

  // Level 4: lines of symmetry on a regular shape.
  const target = rng.pick([
    { name: 'square', sides: 4, lines: 4 },
    { name: 'rectangle', sides: 4, lines: 2 },
    { name: 'triangle', sides: 3, lines: 3 },
    { name: 'hexagon', sides: 6, lines: 6 },
    { name: 'pentagon', sides: 5, lines: 5 },
  ]);
  return {
    ...base,
    prompt: `How many lines of symmetry does a regular ${target.name} have?`,
    questionVisual: shape(target.sides, target.name, undefined, true),
    answer: String(target.lines),
    representation: { kind: 'numeric' },
    hints: [
      h(
        'A line of symmetry is a fold line: both halves land exactly on top of each other.',
        shape(target.sides, target.name, undefined, true),
      ),
      h(
        target.name === 'rectangle'
          ? 'Try folding it across the middle both ways. Then try the diagonals — do those actually match up?'
          : 'Try a fold through each corner, and a fold through the middle of each side.',
        shape(target.sides, target.name, undefined, true),
      ),
      h(
        `A regular ${target.name} has ${target.lines} lines of symmetry.`,
        shape(target.sides, target.name, undefined, true),
      ),
    ],
    meta: { operands: [target.sides, target.lines] },
  };
}

/**
 * Perimeter — distance all the way round.
 *
 * The dominant error is counting only two sides of a rectangle, so the ladder
 * makes "go all the way round and back to where you started" the first idea,
 * before any adding happens.
 */
export function perimeter(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'perimeter', level, seed, flavor: 'dino' as const };

  if (level === 1) {
    // Square: all sides equal.
    const side = rng.int(3, 12);
    const total = side * 4;
    return {
      ...base,
      prompt: 'What is the perimeter of this square paddock, in metres?',
      questionVisual: shape(4, 'square', [side, side, side, side]),
      answer: String(total),
      representation: { kind: 'numeric' },
      hints: [
        h(
          'Perimeter means the whole way round the outside — walk the fence and come back to the start.',
          shape(4, 'square', [side, side, side, side]),
        ),
        h(
          `Every side of a square is the same, so all four are ${side} m.`,
          shape(4, 'square', [side, side, side, side]),
        ),
        h(
          `${side} + ${side} + ${side} + ${side} = ${total} m, or 4 × ${side} = ${total}.`,
          shape(4, 'square', [side, side, side, side]),
        ),
      ],
      meta: { operands: [side, 4], op: '×' },
    };
  }

  if (level === 2) {
    // Rectangle: the classic "forgot the other two sides" trap.
    // The two dimensions must differ — a square labelled as a rectangle makes
    // "the opposite sides match" read as "all four are the same", which is the
    // opposite of the point.
    const w = rng.int(3, 15);
    const hgt = w <= 8 ? rng.int(w + 1, 16) : rng.int(2, w - 1);
    const total = 2 * (w + hgt);
    return {
      ...base,
      prompt: 'What is the perimeter of this rectangle, in metres?',
      questionVisual: shape(4, 'rectangle', [w, hgt, w, hgt]),
      answer: String(total),
      representation: { kind: 'numeric' },
      hints: [
        h(
          'Only two numbers are written on, but a rectangle has four sides. The opposite sides match.',
          shape(4, 'rectangle', [w, hgt, w, hgt]),
        ),
        h(
          `So the four sides are ${w}, ${hgt}, ${w} and ${hgt}.`,
          shape(4, 'rectangle', [w, hgt, w, hgt]),
        ),
        h(
          `${w} + ${hgt} = ${w + hgt}, and there are two of those: ${w + hgt} + ${w + hgt} = ${total} m.`,
          stacked(w + hgt, w + hgt, '+', total),
        ),
      ],
      meta: { operands: [w + hgt, 2], op: '×' },
    };
  }

  // Level 3: irregular shape, or work backwards from a known perimeter.
  const backwards = rng.bool(0.4);
  if (backwards) {
    const side = rng.int(4, 15);
    const total = side * 4;
    return {
      ...base,
      prompt: `A square pen has a perimeter of ${total} m. How long is one side?`,
      questionVisual: shape(4, 'square'),
      answer: String(side),
      representation: { kind: 'numeric' },
      hints: [
        h('This one runs backwards — you know the whole way round, and want one side.', shape(4, 'square')),
        h(
          `A square has 4 equal sides, so ${total} m is shared equally between 4 of them.`,
          shape(4, 'square'),
        ),
        h(`${total} ÷ 4 = ${side} m.`, shape(4, 'square', [side, side, side, side])),
      ],
      meta: { operands: [total, 4], op: '÷' },
    };
  }

  const a = rng.int(3, 12);
  const b = rng.int(3, 12);
  const c = rng.int(3, 12);
  const total = a + b + c;
  return {
    ...base,
    prompt: 'What is the perimeter of this triangle, in metres?',
    questionVisual: shape(3, 'triangle', [a, b, c]),
    answer: String(total),
    representation: { kind: 'numeric' },
    hints: [
      h('Add up every side, all the way round.', shape(3, 'triangle', [a, b, c])),
      h(
        `The sides are ${a}, ${b} and ${c}. Add two of them first, then the last one.`,
        stacked(a, b, '+', a + b),
      ),
      h(`${a} + ${b} = ${a + b}, then ${a + b} + ${c} = ${total} m.`, stacked(a + b, c, '+', total)),
    ],
    meta: { operands: [a + b, c], op: '+' },
  };
}
