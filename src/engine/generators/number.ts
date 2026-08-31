import { numericChoices, Rng } from '../rng';
import { h, numberline, placevalue } from '../hintBuilders';
import type { Problem } from '../types';

/** Place value to 1,000. */
export function placeValue3(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'place-value-3', level, seed, flavor: 'lab' as const };

  if (level === 1) {
    // Two digits: name the value of a digit, not just the digit.
    const tens = rng.int(1, 9);
    const ones = rng.int(1, 9);
    const n = tens * 10 + ones;
    const askTens = rng.bool();
    const answer = askTens ? tens * 10 : ones;
    return {
      ...base,
      prompt: `In the number ${n}, what is the value of the ${askTens ? tens : ones}?`,
      subPrompt: askTens ? 'It is in the tens place.' : 'It is in the ones place.',
      answer: String(answer),
      representation: { kind: 'numeric' },
      hints: [
        h(
          'Which column is that digit sitting in — tens or ones?',
          placevalue(n, askTens ? 'tens' : 'ones'),
        ),
        h(
          askTens
            ? `A digit in the tens place is worth that many tens. ${tens} tens is ${tens} × 10.`
            : 'A digit in the ones place is just worth itself.',
          placevalue(n, askTens ? 'tens' : 'ones'),
        ),
        h(
          `${n} is ${tens} tens and ${ones} ones, so it breaks apart as ${tens * 10} + ${ones}. The answer is ${answer}.`,
          placevalue(n),
        ),
      ],
    };
  }

  if (level === 2) {
    const hun = rng.int(1, 9);
    const t = rng.int(0, 9);
    const o = rng.int(1, 9);
    const n = hun * 100 + t * 10 + o;
    const which = rng.pick(['hundreds', 'tens', 'ones'] as const);
    const answer = which === 'hundreds' ? hun * 100 : which === 'tens' ? t * 10 : o;
    return {
      ...base,
      prompt: `In the number ${n}, what is the value of the digit in the ${which} place?`,
      answer: String(answer),
      representation: { kind: 'numeric' },
      hints: [
        h(`Read ${n} out loud. Which digit is in the ${which} place?`, placevalue(n, which)),
        h(
          'Hundreds are worth 100 each, tens are worth 10 each, ones are worth 1 each.',
          placevalue(n, which),
        ),
        h(`${n} = ${hun * 100} + ${t * 10} + ${o}. The ${which} part is ${answer}.`, placevalue(n)),
      ],
    };
  }

  if (level === 3) {
    // Expanded form, in both directions.
    const hun = rng.int(1, 9);
    const t = rng.int(1, 9);
    const o = rng.int(1, 9);
    const n = hun * 100 + t * 10 + o;
    const toStandard = rng.bool();
    if (toStandard) {
      return {
        ...base,
        prompt: `What number is ${hun * 100} + ${t * 10} + ${o}?`,
        answer: String(n),
        representation: { kind: 'numeric' },
        hints: [
          h('Each part tells you one column. Stack them up.', placevalue(n)),
          h(
            `${hun * 100} gives the hundreds digit, ${t * 10} the tens, ${o} the ones.`,
            placevalue(n),
          ),
          h(`${hun} hundreds, ${t} tens, ${o} ones makes ${n}.`, placevalue(n)),
        ],
      };
    }
    return {
      ...base,
      prompt: `${n} = ${hun * 100} + ___ + ${o}. What goes in the blank?`,
      answer: String(t * 10),
      representation: { kind: 'numeric' },
      hints: [
        h('The hundreds and the ones are already there. What is missing?', placevalue(n, 'tens')),
        h(`Look at the tens digit of ${n}.`, placevalue(n, 'tens')),
        h(
          `${n} is ${hun} hundreds, ${t} tens and ${o} ones, so the missing part is ${t * 10}.`,
          placevalue(n),
        ),
      ],
    };
  }

  // Level 4: zeros in the middle, which is where place value actually bites.
  // Worded as "which digit" rather than "how many tens" — "how many tens are
  // in 407" is genuinely ambiguous (0 or 40, depending on reading) and a sharp
  // kid answering 40 would be marked wrong for being right.
  const hun = rng.int(1, 9);
  const o = rng.int(1, 9);
  const n = hun * 100 + o;
  const options = new Set(['0', String(hun), String(o)]);
  let filler = 1;
  while (options.size < 4) options.add(String(filler++));
  return {
    ...base,
    prompt: `Which digit is in the tens place of ${n}?`,
    subPrompt: 'Careful — check every column.',
    answer: '0',
    representation: { kind: 'choice', options: rng.shuffle([...options]) },
    hints: [
      h(`Write ${n} out as hundreds, tens and ones.`, placevalue(n)),
      h(
        'A zero in a column is still a real digit. It is holding the place open.',
        placevalue(n, 'tens'),
      ),
      h(`${n} is ${hun} hundreds, 0 tens and ${o} ones. The tens digit is 0.`, placevalue(n, 'tens')),
    ],
  };
}

/** Skip counting forwards and backwards. */
export function skipCount(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const step = level === 1 ? rng.pick([10, 5]) : level === 2 ? 2 : level === 3 ? 3 : rng.pick([4, 6]);
  const backwards = level === 4 && rng.bool(0.4);
  const start = backwards
    ? step * rng.int(6, 12)
    : step * rng.int(1, 7);

  const seq: number[] = [];
  for (let i = 0; i < 4; i++) seq.push(backwards ? start - i * step : start + i * step);
  const answer = backwards ? start - 4 * step : start + 4 * step;

  /**
   * Sometimes he places the next number on a line instead of typing it.
   *
   * Skip counting *is* regular spacing, so putting the answer on a line is a
   * more faithful demonstration of the pattern than writing a numeral — and it
   * separates "knows the sequence" from "can write the number", which a keypad
   * quietly conflates. Only when the whole run fits on a readable line.
   */
  const lineTop = Math.max(answer, ...seq) + step;
  const onLine = !backwards && lineTop / step <= 14 && rng.bool(0.3);

  return {
    skillId: 'skip-count',
    level,
    seed,
    flavor: 'dino',
    prompt: `${seq.join(', ')}, ___`,
    subPrompt: onLine ? 'Tap where the next one goes.' : `What comes next?`,
    answer: String(answer),
    representation: onLine
      ? { kind: 'numberline', from: 0, to: lineTop, step }
      : { kind: 'numeric' },
    hints: [
      h(
        `Look at the jump from ${seq[0]} to ${seq[1]}. How big is each step?`,
        numberline(seq[0] as number, seq[1] as number),
      ),
      h(
        `You are counting ${backwards ? 'back' : 'up'} by ${step} each time.`,
        numberline(seq[0] as number, answer, '?'),
      ),
      h(`${seq[3]} ${backwards ? '−' : '+'} ${step} = ${answer}.`, numberline(seq[3] as number, answer)),
    ],
    meta: { operands: [seq[3] as number, step], op: backwards ? '-' : '+' },
  };
}

/** Comparing and ordering numbers. */
export function compareNumbers(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'compare-numbers', level, seed, flavor: 'lab' as const };

  if (level === 3) {
    // "Which is between" forces ordering rather than a single comparison.
    const lo = rng.int(120, 400);
    const hi = lo + rng.int(30, 120);
    const inside = rng.int(lo + 5, hi - 5);
    const options = rng.shuffle([
      String(inside),
      String(lo - rng.int(5, 40)),
      String(hi + rng.int(5, 40)),
      String(hi + rng.int(50, 90)),
    ]);
    return {
      ...base,
      prompt: `Which number is between ${lo} and ${hi}?`,
      answer: String(inside),
      representation: { kind: 'choice', options },
      hints: [
        h(
          `It has to be bigger than ${lo} and smaller than ${hi} at the same time.`,
          numberline(lo, hi),
        ),
        h('Check each one against both ends before you pick.'),
        h(`${inside} is bigger than ${lo} and smaller than ${hi}, so it sits between them.`),
      ],
    };
  }

  const digits = level === 1 ? 2 : 3;
  const min = digits === 2 ? 11 : 101;
  const max = digits === 2 ? 99 : 999;
  const a = rng.int(min, max);
  let b = rng.int(min, max);
  // Force a genuine comparison rather than an obvious one about a third of the
  // time, by making the numbers share a leading digit.
  if (rng.bool(0.35)) {
    b = Math.floor(a / 10) * 10 + rng.int(0, 9);
    if (b === a) b += b < max ? 1 : -1;
  }
  const answer = a > b ? '>' : a < b ? '<' : '=';

  return {
    ...base,
    prompt: `${a}  ?  ${b}`,
    subPrompt: 'Which sign belongs in the middle?',
    answer,
    representation: { kind: 'choice', options: ['<', '>', '='] },
    hints: [
      h('Start from the left. Compare the biggest column first.'),
      h(
        digits === 3
          ? 'If the hundreds are the same, move to the tens. If those match too, compare the ones.'
          : 'If the tens are the same, compare the ones.',
      ),
      h(
        `${a} is ${answer === '>' ? 'bigger than' : answer === '<' ? 'smaller than' : 'equal to'} ${b}, so the sign is ${answer}.`,
        numberline(Math.min(a, b), Math.max(a, b)),
      ),
    ],
  };
}

/** Shared helper so choice-based number questions look consistent. */
export function choicesAround(rng: Rng, answer: number, spread = 3): string[] {
  return numericChoices(rng, answer, 4, spread);
}
