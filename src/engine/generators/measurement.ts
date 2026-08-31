import { Rng } from '../rng';
import { clock, coins, h, numberline, ruler, stacked } from '../hintBuilders';
import type { Problem } from '../types';

/**
 * Measurement: money, time and length.
 *
 * These are the strands where a child who is strong at pure arithmetic often
 * still stalls, because the difficulty is not the sum — it is reading the
 * representation. So the picture *is* the question here more often than
 * anywhere else in the app, and the hint ladder works on reading the dial or
 * the coins before it ever works on the arithmetic.
 */

const COIN_NAMES: Record<number, string> = {
  1: 'penny',
  5: 'nickel',
  10: 'dime',
  25: 'quarter',
};

function money(cents: number): string {
  if (cents < 100) return `${cents}¢`;
  const d = Math.floor(cents / 100);
  const c = cents % 100;
  return `$${d}.${String(c).padStart(2, '0')}`;
}

/** Counting coins, and making a target amount. */
export function moneyCount(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'money-count', level, seed, flavor: 'lab' as const };

  if (level === 1) {
    // One denomination only — pure skip counting made physical.
    const coin = rng.pick([5, 10, 25]);
    const count = coin === 25 ? rng.int(2, 4) : rng.int(3, 6);
    const values = Array.from({ length: count }, () => coin);
    const total = coin * count;
    return {
      ...base,
      prompt: 'How much money is here?',
      questionVisual: coins(values),
      answer: String(total),
      subPrompt: 'Answer in cents.',
      representation: { kind: 'numeric' },
      hints: [
        h(
          `These are all ${COIN_NAMES[coin]}s, worth ${coin}¢ each. Count up in ${coin}s.`,
          coins(values),
        ),
        h(
          `${Array.from({ length: count }, (_, i) => coin * (i + 1)).join(', ')}.`,
          numberline(0, total),
        ),
        h(`${count} × ${coin}¢ = ${total}¢.`, coins(values, total)),
      ],
      meta: { operands: [count, coin], op: '×' },
    };
  }

  if (level === 2) {
    // Mixed coins, largest first — teaches the count-down-by-value habit.
    const values = rng.shuffle([
      ...Array.from({ length: rng.int(1, 2) }, () => 25),
      ...Array.from({ length: rng.int(1, 2) }, () => 10),
      ...Array.from({ length: rng.int(1, 2) }, () => 5),
    ]);
    const total = values.reduce((a, b) => a + b, 0);
    const sorted = [...values].sort((a, b) => b - a);
    return {
      ...base,
      prompt: 'How much money is here?',
      questionVisual: coins(values),
      answer: String(total),
      subPrompt: 'Answer in cents.',
      representation: { kind: 'numeric' },
      hints: [
        h('Start with the biggest coins and count down to the smallest.', coins(sorted)),
        h(
          `In order that is ${sorted.map((c) => `${c}¢`).join(' + ')}.`,
          coins(sorted),
        ),
        h(`Altogether that makes ${total}¢.`, coins(sorted, total)),
      ],
      meta: { operands: [total, 0], op: '+' },
    };
  }

  if (level === 3) {
    // Pennies in the mix, so skip counting has to switch to counting on.
    const values = rng.shuffle([
      25,
      ...Array.from({ length: rng.int(1, 2) }, () => 10),
      ...Array.from({ length: rng.int(1, 3) }, () => 1),
    ]);
    const total = values.reduce((a, b) => a + b, 0);
    const sorted = [...values].sort((a, b) => b - a);
    const withoutPennies = sorted.filter((c) => c !== 1);
    const subtotal = withoutPennies.reduce((a, b) => a + b, 0);
    const pennies = total - subtotal;
    return {
      ...base,
      prompt: 'How much money is here?',
      questionVisual: coins(values),
      answer: String(total),
      subPrompt: 'Answer in cents.',
      representation: { kind: 'numeric' },
      hints: [
        h('Count the big coins first and save the pennies for last.', coins(sorted)),
        h(
          `The silver coins make ${subtotal}¢. Now count on ${pennies} more penny${pennies === 1 ? '' : 's'}.`,
          coins(withoutPennies, subtotal),
        ),
        h(`${subtotal}¢ + ${pennies}¢ = ${total}¢.`, coins(sorted, total)),
      ],
      meta: { operands: [subtotal, pennies], op: '+' },
    };
  }

  // Level 4: change from a dollar — a real subtraction with a borrow.
  const values = rng.shuffle([
    ...Array.from({ length: rng.int(1, 2) }, () => 25),
    ...Array.from({ length: rng.int(1, 2) }, () => 10),
    ...Array.from({ length: rng.int(0, 1) }, () => 5),
  ]);
  const spent = values.reduce((a, b) => a + b, 0);
  const change = 100 - spent;
  return {
    ...base,
    prompt: `You pay with a dollar and it costs ${money(spent)}. How much change?`,
    questionVisual: coins(values, spent),
    answer: String(change),
    subPrompt: 'Answer in cents.',
    representation: { kind: 'numeric' },
    hints: [
      h(
        `A dollar is 100¢. You are asking how far it is from ${spent} up to 100.`,
        numberline(spent, 100, '?'),
      ),
      h(
        `Hop to the next ten first, then up to 100 — that is often easier than the sum.`,
        numberline(spent, 100, '?'),
      ),
      h(`100¢ − ${spent}¢ = ${change}¢.`, stacked(100, spent, '-', change)),
    ],
    meta: { operands: [100, spent], op: '-' },
  };
}

/** Reading an analogue clock, hour to five-minute intervals. */
export function timeClock(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'time-clock', level, seed, flavor: 'lab' as const };

  const label = (hour: number, minute: number) =>
    `${hour}:${String(minute).padStart(2, '0')}`;

  if (level === 1) {
    // O'clock only.
    const hour = rng.int(1, 12);
    const options = new Set<string>([label(hour, 0)]);
    while (options.size < 4) options.add(label(rng.int(1, 12), 0));
    return {
      ...base,
      prompt: 'What time is it?',
      questionVisual: clock(hour, 0),
      answer: label(hour, 0),
      representation: { kind: 'choice', options: rng.shuffle([...options]) },
      hints: [
        h('The long hand points straight up at 12, so it is exactly an o’clock.', clock(hour, 0)),
        h('Now read the short hand — that one tells you the hour.', clock(hour, 0)),
        h(`The short hand is on ${hour}, so it is ${hour} o’clock — ${label(hour, 0)}.`, clock(hour, 0)),
      ],
      meta: { operands: [hour, 0] },
    };
  }

  if (level === 2) {
    // Half past — and the deliberately tricky part: the hour hand has moved.
    const hour = rng.int(1, 12);
    const options = new Set<string>([label(hour, 30)]);
    options.add(label((hour % 12) + 1, 30));
    while (options.size < 4) options.add(label(rng.int(1, 12), 30));
    return {
      ...base,
      prompt: 'What time is it?',
      questionVisual: clock(hour, 30),
      answer: label(hour, 30),
      representation: { kind: 'choice', options: rng.shuffle([...options]) },
      hints: [
        h('The long hand is pointing straight down at 6 — that is half past.', clock(hour, 30)),
        h(
          'Careful with the short hand: at half past it has already slid halfway to the next number. Read the number it has just *passed*.',
          clock(hour, 30),
        ),
        h(`It has passed ${hour}, so it is half past ${hour} — ${label(hour, 30)}.`, clock(hour, 30)),
      ],
      meta: { operands: [hour, 30] },
    };
  }

  if (level === 3) {
    // Quarter past and quarter to.
    const hour = rng.int(1, 12);
    const minute = rng.pick([15, 45]);
    const shownHour = minute === 45 ? ((hour + 10) % 12) + 1 : hour;
    const answer = label(shownHour, minute);
    const options = new Set<string>([answer]);
    options.add(label(shownHour, minute === 15 ? 45 : 15));
    while (options.size < 4) options.add(label(rng.int(1, 12), rng.pick([15, 45])));
    return {
      ...base,
      prompt: 'What time is it?',
      questionVisual: clock(shownHour, minute),
      answer,
      representation: { kind: 'choice', options: rng.shuffle([...options]) },
      hints: [
        h(
          minute === 15
            ? 'The long hand is a quarter of the way round, pointing at 3.'
            : 'The long hand is three quarters of the way round, pointing at 9.',
          clock(shownHour, minute),
        ),
        h(
          `Each number on the face is 5 minutes, so count round in 5s: that is ${minute} minutes.`,
          clock(shownHour, minute),
        ),
        h(
          `${minute === 15 ? `Quarter past ${shownHour}` : `Quarter to ${(shownHour % 12) + 1}`} — written ${answer}.`,
          clock(shownHour, minute),
        ),
      ],
      meta: { operands: [shownHour, minute] },
    };
  }

  // Level 4: any five-minute interval, plus elapsed time.
  const hour = rng.int(1, 11);
  const minute = rng.pick([5, 10, 20, 25, 35, 40, 50, 55]);
  const addMin = rng.pick([10, 15, 20, 30]);
  const endTotal = hour * 60 + minute + addMin;
  const endHour = Math.floor(endTotal / 60) % 12 || 12;
  const endMinute = endTotal % 60;
  const answer = label(endHour, endMinute);
  return {
    ...base,
    prompt: `The dig starts at this time and lasts ${addMin} minutes. What time does it finish?`,
    questionVisual: clock(hour, minute),
    answer,
    representation: { kind: 'choice', options: elapsedOptions(rng, answer, endHour, endMinute) },
    hints: [
      h(
        `First read the start time. Count the long hand round in 5s: it is ${label(hour, minute)}.`,
        clock(hour, minute),
      ),
      h(
        `Now count on ${addMin} minutes from ${minute}. Watch for going past 60 — that rolls into the next hour.`,
        numberline(minute, minute + addMin),
      ),
      h(`It finishes at ${answer}.`, clock(endHour, endMinute)),
    ],
    // No `op`: the answer is a clock reading, not the numeric sum of these
    // operands, so error classification must not try to arithmetic on it.
    meta: { operands: [hour * 60 + minute, addMin] },
  };
}

function elapsedOptions(rng: Rng, answer: string, hour: number, minute: number): string[] {
  const label = (hh: number, mm: number) => `${hh}:${String(mm).padStart(2, '0')}`;
  const options = new Set<string>([answer]);
  // Near misses that reflect real errors: forgetting the hour roll-over, and
  // being one five-minute step out.
  options.add(label((hour % 12) + 1, minute));
  options.add(label(hour, (minute + 5) % 60));
  while (options.size < 4) {
    options.add(label(rng.int(1, 12), rng.pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])));
  }
  return rng.shuffle([...options]);
}

/** Length: comparing, ordering and adding measurements. */
export function measureLength(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'measure-length', level, seed, flavor: 'dino' as const };

  if (level === 1) {
    // Read a length off a ruler starting at zero.
    const length = rng.int(3, 12);
    return {
      ...base,
      prompt: 'How long is the bone, in centimetres?',
      questionVisual: ruler([length], 'cm'),
      answer: String(length),
      representation: { kind: 'numeric' },
      hints: [
        h('Line the start of the bone up with 0 on the ruler.', ruler([length], 'cm')),
        h('Now read the number at the far end.', ruler([length], 'cm')),
        h(`It reaches ${length}, so it is ${length} cm long.`, ruler([length], 'cm')),
      ],
      meta: { operands: [length, 0] },
    };
  }

  if (level === 2) {
    // Difference between two lengths.
    const a = rng.int(8, 30);
    const b = rng.int(2, a - 2);
    const diff = a - b;
    return {
      ...base,
      prompt: `One claw is ${a} cm and the other is ${b} cm. How much longer is the first?`,
      questionVisual: ruler([a, b], 'cm'),
      answer: String(diff),
      representation: { kind: 'numeric' },
      hints: [
        h('Line the two up at the same start and look at the bit that sticks out.', ruler([a, b], 'cm')),
        h(`"How much longer" means find the difference: ${a} − ${b}.`, ruler([a, b], 'cm')),
        h(`${a} − ${b} = ${diff} cm.`, stacked(a, b, '-', diff)),
      ],
      meta: { operands: [a, b], op: '-' },
    };
  }

  // Level 3: unit conversion, cm to m and back.
  const metres = rng.int(2, 9);
  const extra = rng.pick([0, 20, 50]);
  const cm = metres * 100 + extra;
  return {
    ...base,
    prompt: `A Stegosaurus tail is ${cm} cm. How many whole metres is that?`,
    answer: String(metres),
    representation: { kind: 'numeric' },
    hints: [
      h('There are 100 centimetres in 1 metre.', ruler([100], 'cm')),
      h(
        `So ask how many 100s fit inside ${cm}.`,
        numberline(0, cm),
      ),
      h(
        `${metres} × 100 = ${metres * 100}, so it is ${metres} whole metres${extra ? ` and ${extra} cm left over` : ''}.`,
        ruler([100], 'cm'),
      ),
    ],
    // Floor division — `cm / 100` is not the answer when there is a remainder,
    // so no `op` here.
    meta: { operands: [cm, 100] },
  };
}
