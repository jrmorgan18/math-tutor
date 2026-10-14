import { Rng } from '../rng';
import { barmodel, h, numberline, stacked, tenframe } from '../hintBuilders';
import type { Problem } from '../types';

/** Addition within 20. Level 3 deliberately forces bridging through ten. */
export function add20(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  let a: number;
  let b: number;

  if (level === 1) {
    a = rng.int(1, 6);
    b = rng.int(1, 10 - a);
  } else if (level === 2) {
    // Sums 11-20 but no bridging: one addend is 10 or the ones don't cross.
    a = rng.int(10, 15);
    b = rng.int(1, 20 - a);
  } else {
    // Bridging ten: 7 + 5, 8 + 6. The whole point is the make-a-ten strategy.
    a = rng.int(5, 9);
    b = rng.int(11 - a, 9);
  }

  const answer = a + b;
  const bridges = (a % 10) + (b % 10) > 10;
  const toTen = 10 - a;

  // At level 1 the sum always fits in a single ten-frame, so about a third of
  // these ask him to *build* the answer instead of typing it. Purely to keep
  // the physical action varied across a session — same problem, same answer,
  // same scoring.
  const build = level === 1 && answer <= 10 && rng.bool(0.34);

  return {
    skillId: 'add-20',
    level,
    seed,
    flavor: 'lab',
    prompt: `${a} + ${b}`,
    subPrompt: build ? 'Tap to show how many.' : undefined,
    answer: String(answer),
    representation: build
      ? { kind: 'build', mode: 'tenframe', max: 10 }
      : { kind: 'numeric' },
    hints: [
      h(`Start at ${Math.max(a, b)} and count on ${Math.min(a, b)}.`, numberline(Math.max(a, b), answer)),
      bridges
        ? h(
            `Make a ten first: ${a} needs ${toTen} more to reach 10, and that leaves ${b - toTen} over.`,
            tenframe(a, b),
          )
        : h('Add the ones together, then put the ten back on.', tenframe(a, b)),
      bridges
        ? h(`${a} + ${toTen} = 10, then 10 + ${b - toTen} = ${answer}.`, tenframe(a, b))
        : h(`${a} + ${b} = ${answer}.`, tenframe(a, b)),
    ],
    meta: { operands: [a, b], op: '+' },
  };
}

/** Subtraction within 20. Level 3 forces bridging back through ten. */
export function sub20(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  let a: number;
  let b: number;

  if (level === 1) {
    a = rng.int(5, 10);
    b = rng.int(1, a - 1);
  } else if (level === 2) {
    a = rng.int(11, 20);
    b = rng.int(1, a - 10);
  } else {
    a = rng.int(12, 18);
    b = rng.int(a - 9, 9);
  }

  const answer = a - b;
  const bridges = a % 10 < b % 10;
  const downToTen = a - 10;
  // Same rationale as add-20 level 1: showing what is left over is a more
  // direct demonstration of "take away" than writing the numeral.
  const build = level === 1 && answer <= 10 && rng.bool(0.3);

  return {
    skillId: 'sub-20',
    level,
    seed,
    flavor: 'lab',
    prompt: `${a} − ${b}`,
    subPrompt: build ? 'Tap to show how many are left.' : undefined,
    answer: String(answer),
    representation: build
      ? { kind: 'build', mode: 'tenframe', max: 10 }
      : { kind: 'numeric' },
    hints: [
      // Framed as "what do I add to get there" — the counting-up strategy is
      // far more reliable for a 7-year-old than counting back.
      h(
        `Ask it the other way round: what do you add to ${b} to reach ${a}?`,
        numberline(b, a, '?'),
      ),
      bridges
        ? h(
            `Go back to 10 first: ${a} − ${downToTen} = 10, and there is still ${b - downToTen} to take away.`,
            numberline(a, answer),
          )
        : h('Take the ones away and leave the ten alone.', barmodel(a, [b, null])),
      h(bridges ? `${a} − ${downToTen} = 10; then 10 − ${b - downToTen} = ${answer}.` : `${a} − ${b} = ${answer}.`, stacked(a, b, '-', answer)),
    ],
    meta: { operands: [a, b], op: '-' },
  };
}

/**
 * Addition within 100. Levels are ordered by whether a regroup is required,
 * because that is the actual difficulty step — not the size of the numbers.
 */
export function add100(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  let a: number;
  let b: number;

  if (level === 1) {
    // 2-digit + 1-digit, no regroup.
    const tens = rng.int(1, 8);
    const ones = rng.int(1, 5);
    a = tens * 10 + ones;
    b = rng.int(1, 9 - ones);
  } else if (level === 2) {
    // 2-digit + 2-digit, no regroup.
    const oa = rng.int(1, 4);
    const ob = rng.int(1, 9 - oa);
    a = rng.int(1, 4) * 10 + oa;
    b = rng.int(1, 4) * 10 + ob;
  } else if (level === 3) {
    // 2-digit + 1-digit with a regroup.
    const ones = rng.int(5, 9);
    a = rng.int(1, 8) * 10 + ones;
    b = rng.int(10 - ones, 9);
  } else {
    // 2-digit + 2-digit with a regroup.
    const oa = rng.int(5, 9);
    const ob = rng.int(10 - oa, 9);
    a = rng.int(1, 4) * 10 + oa;
    b = rng.int(1, 4) * 10 + ob;
  }

  const answer = a + b;
  const regroups = (a % 10) + (b % 10) >= 10;
  const aTens = Math.floor(a / 10) * 10;
  const bTens = Math.floor(b / 10) * 10;

  /**
   * On the regrouping levels, sometimes ask for the answer one column at a
   * time, ones first.
   *
   * Typing `81` in one go hides whether he carried or simply recalled the
   * fact. Filling the ones column and then the tens makes the carry the thing
   * he is actually doing, which is the entire reason to teach the column
   * method rather than mental arithmetic.
   */
  const byColumn = level >= 3 && rng.bool(0.35);

  return {
    skillId: 'add-100',
    level,
    seed,
    flavor: 'dino',
    prompt: `${a} + ${b}`,
    subPrompt: byColumn ? 'Fill in the ones column first, then the tens.' : undefined,
    answer: String(answer),
    representation: byColumn
      ? { kind: 'columns', columns: String(answer).length, carry: regroups }
      : { kind: 'numeric' },
    hints: [
      h(
        'Line them up and add one column at a time, starting on the right.',
        stacked(a, b, '+', undefined, regroups ? 'ones' : undefined),
      ),
      regroups
        ? h(
            `The ones make ${(a % 10) + (b % 10)}, which is more than 9 — that is a whole extra ten to carry across.`,
            tenframe(a % 10, b % 10),
          )
        : h(
            `Tens: ${aTens} + ${bTens}. Ones: ${a % 10} + ${b % 10}.`,
            stacked(a, b, '+', undefined, 'tens'),
          ),
      h(regroups ? `Regroup ${(a % 10) + (b % 10)} ones as 1 ten and ${answer % 10} ones. Add the tens including that extra ten: ${Math.floor(a / 10)} + ${Math.floor(b / 10)} + 1 = ${Math.floor(answer / 10)}. ${a} + ${b} = ${answer}.` : `${a} + ${b} = ${answer}.`, stacked(a, b, '+', answer)),
    ],
    meta: { operands: [a, b], op: '+' },
  };
}

/** Subtraction within 100, levelled by whether a borrow is required. */
export function sub100(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  let a: number;
  let b: number;

  if (level === 1) {
    // 2-digit − 1-digit, no borrow.
    const ones = rng.int(5, 9);
    a = rng.int(2, 9) * 10 + ones;
    b = rng.int(1, ones);
  } else if (level === 2) {
    // 2-digit − 2-digit, no borrow.
    const oa = rng.int(4, 9);
    const ta = rng.int(4, 9);
    a = ta * 10 + oa;
    b = rng.int(1, ta - 1) * 10 + rng.int(0, oa);
  } else if (level === 3) {
    // 2-digit − 1-digit with a borrow.
    const ones = rng.int(0, 4);
    a = rng.int(2, 9) * 10 + ones;
    b = rng.int(ones + 1, 9);
  } else {
    // 2-digit − 2-digit with a borrow.
    const oa = rng.int(0, 4);
    const ta = rng.int(4, 9);
    a = ta * 10 + oa;
    b = rng.int(1, ta - 1) * 10 + rng.int(oa + 1, 9);
  }

  const answer = a - b;
  const borrows = a % 10 < b % 10;
  // Same reasoning as add-100: on the borrowing levels, make the algorithm
  // itself the thing being practised rather than the recalled result.
  const byColumn = level >= 3 && String(answer).length > 1 && rng.bool(0.35);

  return {
    skillId: 'sub-100',
    level,
    seed,
    flavor: 'dino',
    prompt: `${a} − ${b}`,
    subPrompt: byColumn ? 'Fill in the ones column first, then the tens.' : undefined,
    answer: String(answer),
    representation: byColumn
      ? { kind: 'columns', columns: String(answer).length, carry: borrows }
      : { kind: 'numeric' },
    hints: [
      h(
        'Line them up and work one column at a time, starting on the right.',
        stacked(a, b, '-', undefined, borrows ? 'ones' : undefined),
      ),
      borrows
        ? h(
            `${a % 10} is smaller than ${b % 10}, so break one ten open: ${a} becomes ${Math.floor(a / 10) - 1} tens and ${(a % 10) + 10} ones.`,
            { kind: 'placevalue', hundreds: 0, tens: Math.floor(a / 10) - 1, ones: (a % 10) + 10, highlight: 'ones' },
          )
        : h(`Take away the tens, then the ones.`, barmodel(a, [b, null])),
      h(
        `${a} − ${b} = ${answer}. Check by adding back: ${answer} + ${b} = ${a}.`,
        stacked(a, b, '-', answer),
      ),
    ],
    meta: { operands: [a, b], op: '-' },
  };
}

/**
 * Missing-number equations — the seed of algebra. The unknown moves around
 * the equation, so he cannot pattern-match on the operator.
 *
 * These hints carry the most weight of any in the app: "a missing addend is
 * a subtraction in disguise" is exactly the kind of sentence that means
 * nothing to a child who doesn't already know it. The bar model shows the
 * part-whole relationship, and the stacked form then shows the rearranged
 * subtraction as an actual sum he can carry out.
 */
export function missingAddend(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'missing-addend', level, seed, flavor: 'lab' as const };

  if (level === 1) {
    const a = rng.int(2, 9);
    const missing = rng.int(1, 10 - a);
    const total = a + missing;
    return {
      ...base,
      prompt: `${a} + ___ = ${total}`,
      answer: String(missing),
      representation: { kind: 'numeric' },
      hints: [
        h(`How far is it from ${a} up to ${total}?`, numberline(a, total, '?')),
        h(
          `${a} is one part and ${total} is the whole. You are looking for the other part.`,
          barmodel(total, [a, null]),
        ),
        h(
          `Take the part you know away from the whole: ${total} − ${a} = ${missing}.`,
          stacked(total, a, '-', missing),
        ),
      ],
      meta: { operands: [total, a], op: '-' },
    };
  }

  if (level === 2) {
    const missing = rng.int(2, 9);
    const b = rng.int(2, 9);
    const total = missing + b;
    const takenAway = rng.bool();
    return {
      ...base,
      prompt: takenAway ? `${total} − ___ = ${b}` : `___ + ${b} = ${total}`,
      answer: String(missing),
      representation: { kind: 'numeric' },
      hints: [
        h(takenAway
          ? `${total} is the whole; ${b} is the part left. Find the part taken away.`
          : 'The blank is at the front this time, but the idea is the same.', barmodel(total, [null, b])),
        h(
          `${b} is one part and ${total} is the whole. Take the part you know away from the whole.`,
          barmodel(total, [null, b]),
        ),
        h(`${total} − ${b} = ${missing}.`, stacked(total, b, '-', missing)),
      ],
      meta: { operands: [total, b], op: '-' },
    };
  }

  if (level === 3) {
    const a = rng.int(12, 48);
    const missing = rng.int(5, 40);
    const total = a + missing;
    return {
      ...base,
      prompt: `${a} + ___ = ${total}`,
      answer: String(missing),
      representation: { kind: 'numeric' },
      hints: [
        h(
          `Count up from ${a} to ${total} — hop to the next ten first if that helps.`,
          numberline(a, total, '?'),
        ),
        h(
          `${a} is one part and ${total} is the whole. The blank is the missing part.`,
          barmodel(total, [a, null]),
        ),
        h(
          `So it is a subtraction: ${total} − ${a} = ${missing}.`,
          stacked(total, a, '-', missing),
        ),
      ],
      meta: { operands: [total, a], op: '-' },
    };
  }

  // Level 4: the unknown is the starting amount in a subtraction.
  const result = rng.int(11, 45);
  const b = rng.int(6, 30);
  const missing = result + b;
  return {
    ...base,
    prompt: `___ − ${b} = ${result}`,
    answer: String(missing),
    representation: { kind: 'numeric' },
    hints: [
      h(
        `Something had ${b} taken away and ${result} was left. Was it bigger or smaller than ${result}?`,
        barmodel(null, [b, result]),
      ),
      h(
        `Here the two parts are ${b} and ${result} — the whole is what is missing.`,
        barmodel(null, [b, result]),
      ),
      h(
        `To undo a subtraction, add it back on: ${result} + ${b} = ${missing}.`,
        stacked(result, b, '+', missing),
      ),
    ],
    meta: { operands: [result, b], op: '+' },
  };
}
