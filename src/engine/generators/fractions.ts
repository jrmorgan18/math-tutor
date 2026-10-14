import { Rng } from '../rng';
import { arrayIfSmall, barmodel, fractionbar, groupsIfSmall, h } from '../hintBuilders';
import type { Problem } from '../types';

/**
 * Fractions.
 *
 * The single misconception this strand exists to prevent is "the bottom number
 * is how many pieces are shaded". Every level therefore keeps the *whole*
 * visible: a fraction is always shown as parts of one thing, never as a bare
 * pair of numbers. The picture is part of the question, not a hint, because
 * without it the question is a vocabulary test rather than a maths one.
 */

const NAMES: Record<number, string> = {
  2: 'half',
  3: 'third',
  4: 'quarter',
  5: 'fifth',
  6: 'sixth',
  8: 'eighth',
};

/** "3 quarters", "1 half" — how a seven-year-old actually says it. */
function spoken(shaded: number, parts: number): string {
  const name = NAMES[parts] ?? `${parts}th`;
  return `${shaded} ${name}${shaded === 1 ? '' : 's'}`;
}

/** Naming and recognising unit and non-unit fractions from a picture. */
export function fractionParts(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'fraction-parts', level, seed, flavor: 'lab' as const };

  if (level === 1) {
    // Halves and quarters only, always a unit fraction, shape drawn.
    const parts = rng.pick([2, 4]);
    const shape = rng.pick(['bar', 'circle'] as const);
    const options = ['1/2', '1/4', '1/3'];
    return {
      ...base,
      prompt: 'How much of the amber is filled?',
      questionVisual: fractionbar(parts, 1, shape),
      answer: `1/${parts}`,
      representation: { kind: 'choice', options: rng.shuffle(options) },
      hints: [
        h(
          `Count the equal pieces the whole is cut into. There are ${parts}.`,
          fractionbar(parts, 1, shape),
        ),
        h(
          `${parts} equal pieces means each one is a ${NAMES[parts]}. Only 1 is filled.`,
          fractionbar(parts, 1, shape),
        ),
        h(
          `1 piece out of ${parts} is written 1/${parts} — one ${NAMES[parts]}.`,
          fractionbar(parts, 1, shape),
        ),
      ],
      meta: { operands: [1, parts] },
    };
  }

  if (level === 2) {
    // Non-unit fractions: the "top counts, bottom names" idea.
    const parts = rng.pick([3, 4, 6]);
    const shaded = rng.int(2, parts - 1);
    return {
      ...base,
      prompt: 'How much of the fossil block is shaded?',
      questionVisual: fractionbar(parts, shaded, 'bar'),
      answer: `${shaded}/${parts}`,
      representation: {
        kind: 'choice',
        options: rng.shuffle(
          unique([
            `${shaded}/${parts}`,
            `${parts - shaded}/${parts}`,
            `${shaded}/${parts + 1}`,
            `1/${parts}`,
          ]).slice(0, 4),
        ),
      },
      hints: [
        h(
          `The block is cut into ${parts} equal pieces, so every piece is a ${NAMES[parts]}.`,
          fractionbar(parts, shaded, 'bar'),
        ),
        h(
          `Now count only the shaded ones: ${shaded} of them. That is ${spoken(shaded, parts)}.`,
          fractionbar(parts, shaded, 'bar'),
        ),
        h(
          `The bottom number names the piece (${parts}), the top counts them (${shaded}) — so ${shaded}/${parts}.`,
          fractionbar(parts, shaded, 'bar'),
        ),
      ],
      meta: { operands: [shaded, parts] },
    };
  }

  if (level === 3) {
    // Comparing two fractions — same numerator or same denominator.
    const sameDenominator = rng.bool(0.5);
    let a: { parts: number; shaded: number };
    let b: { parts: number; shaded: number };

    if (sameDenominator) {
      const parts = rng.pick([4, 6, 8]);
      const x = rng.int(1, parts - 2);
      const y = rng.int(x + 1, parts - 1);
      a = { parts, shaded: x };
      b = { parts, shaded: y };
    } else {
      // Same numerator, different denominator — the counter-intuitive case:
      // more pieces means *smaller* pieces.
      const shaded = 1;
      const [small, large] = rng.bool(0.5) ? [2, 4] : [3, 6];
      a = { parts: large, shaded };
      b = { parts: small, shaded };
    }

    const aVal = a.shaded / a.parts;
    const bVal = b.shaded / b.parts;
    const bigger = aVal > bVal ? a : b;

    return {
      ...base,
      prompt: `Which is more: ${a.shaded}/${a.parts} or ${b.shaded}/${b.parts}?`,
      questionVisual: fractionbar(a.parts, a.shaded, 'bar', { parts: b.parts, shaded: b.shaded }),
      answer: `${bigger.shaded}/${bigger.parts}`,
      representation: {
        kind: 'choice',
        // "They are the same" is here on purpose: believing 1/3 and 1/6 are
        // equal because both show one piece is the exact misconception this
        // level exists to catch, so it has to be offerable.
        options: rng.shuffle([
          `${a.shaded}/${a.parts}`,
          `${b.shaded}/${b.parts}`,
          'They are the same',
        ]),
      },
      hints: [
        h(
          'Look at the two bars. Ignore the numbers for a second — which one has more colour?',
          fractionbar(a.parts, a.shaded, 'bar', { parts: b.parts, shaded: b.shaded }),
        ),
        sameDenominator
          ? h(
              `Both are cut into ${a.parts} equal pieces, so the pieces are the same size. More pieces shaded means more.`,
              fractionbar(a.parts, a.shaded, 'bar', { parts: b.parts, shaded: b.shaded }),
            )
          : h(
              `Careful — ${a.parts} is a bigger number than ${b.parts}, but cutting into more pieces makes each piece smaller.`,
              fractionbar(a.parts, a.shaded, 'bar', { parts: b.parts, shaded: b.shaded }),
            ),
        h(
          `${bigger.shaded}/${bigger.parts} covers more of the whole, so it is more.`,
          fractionbar(bigger.parts, bigger.shaded, 'bar'),
        ),
      ],
      meta: { operands: [a.shaded, a.parts] },
    };
  }

  // Level 4: how many more pieces to complete the whole — fractions that sum to 1.
  const parts = rng.pick([4, 6, 8]);
  const shaded = rng.int(1, parts - 1);
  const missing = parts - shaded;
  return {
    ...base,
    prompt: `${shaded}/${parts} of the tank is full. How many more ${NAMES[parts]}s fill it up?`,
    questionVisual: fractionbar(parts, shaded, 'bar'),
    answer: String(missing),
    representation: { kind: 'numeric' },
    hints: [
      h(
        `A full tank is all ${parts} pieces. Count the empty ones.`,
        fractionbar(parts, shaded, 'bar'),
      ),
      h(
        `${shaded} pieces are full out of ${parts}, so the empty part is the rest of the whole.`,
        barmodel(parts, [shaded, null]),
      ),
      h(
        `${parts} − ${shaded} = ${missing}, so ${missing} more ${NAMES[parts]}${missing === 1 ? '' : 's'} fills it (${shaded}/${parts} + ${missing}/${parts} = ${parts}/${parts}).`,
        fractionbar(parts, parts, 'bar'),
      ),
    ],
    meta: { operands: [parts, shaded], op: '-' },
  };
}

/**
 * Fractions of a quantity — 1/2 of 12, 3/4 of 20.
 *
 * The hint ladder is built around the two-step structure ("divide by the
 * bottom, multiply by the top") but never states it as a rule before showing
 * it as equal groups, because the rule is only memorable once the picture has
 * made it obvious.
 */
export function fractionOfSet(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'fraction-of-set', level, seed, flavor: 'dino' as const };

  if (level === 1) {
    // Half of an even amount.
    const half = rng.int(2, 10);
    const total = half * 2;
    return {
      ...base,
      prompt: `Half of ${total} eggs is how many?`,
      answer: String(half),
      representation: { kind: 'numeric' },
      hints: [
        h(`Half means split into 2 equal groups.`, groupsIfSmall(2, half)),
        h(
          `Share the ${total} eggs fairly between 2 nests — how many in each?`,
          arrayIfSmall(2, half),
        ),
        h(`${total} ÷ 2 = ${half}.`, groupsIfSmall(2, half)),
      ],
      meta: { operands: [total, 2], op: '÷' },
    };
  }

  if (level === 2) {
    // Unit fraction of an amount that divides exactly.
    const parts = rng.pick([3, 4]);
    const each = rng.int(2, 8);
    const total = parts * each;
    return {
      ...base,
      prompt: `What is 1/${parts} of ${total}?`,
      answer: String(each),
      representation: { kind: 'numeric' },
      hints: [
        h(
          `The bottom number tells you how many equal groups to make: ${parts}.`,
          fractionbar(parts, 1, 'bar'),
        ),
        h(
          `Split ${total} into ${parts} equal groups and take one of them.`,
          groupsIfSmall(parts, each),
        ),
        h(`${total} ÷ ${parts} = ${each}, so 1/${parts} of ${total} is ${each}.`, groupsIfSmall(parts, each)),
      ],
      meta: { operands: [total, parts], op: '÷' },
    };
  }

  if (level === 3) {
    // Non-unit fraction: divide then multiply.
    const parts = rng.pick([3, 4]);
    const each = rng.int(2, 6);
    const total = parts * each;
    const top = rng.int(2, parts - 1);
    const answer = each * top;
    return {
      ...base,
      prompt: `What is ${top}/${parts} of ${total}?`,
      answer: String(answer),
      representation: { kind: 'numeric' },
      hints: [
        h(
          `First make the ${parts} equal groups, same as before.`,
          groupsIfSmall(parts, each),
        ),
        h(
          `Each group is ${total} ÷ ${parts} = ${each}. Now you need ${top} of those groups, not just 1.`,
          fractionbar(parts, top, 'bar'),
        ),
        h(
          `${each} in a group, ${top} groups: ${each} × ${top} = ${answer}.`,
          arrayIfSmall(top, each),
        ),
      ],
      // The final step is the multiplication, not the division — meta must
      // describe the operation whose result *is* the answer.
      meta: { operands: [each, top], op: '×' },
    };
  }

  // Level 4: fraction of an amount inside a word problem, answer is the remainder.
  const parts = rng.pick([2, 4]);
  const each = rng.int(3, 8);
  const total = parts * each;
  const eaten = each;
  const left = total - eaten;
  return {
    ...base,
    prompt: `A herd finds ${total} ferns and eats 1/${parts} of them. How many ferns are left?`,
    answer: String(left),
    representation: { kind: 'numeric' },
    hints: [
      h(
        `Two steps here. First work out how many they ate, then take that away.`,
        barmodel(total, [eaten, null]),
      ),
      h(
        `1/${parts} of ${total} is ${total} ÷ ${parts} = ${eaten} ferns eaten.`,
        groupsIfSmall(parts, each),
      ),
      h(
        `${total} − ${eaten} = ${left} ferns left. (That is the other ${parts - 1}/${parts}.)`,
        fractionbar(parts, parts - 1, 'bar'),
      ),
    ],
    meta: { operands: [total, eaten], op: '-' },
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
