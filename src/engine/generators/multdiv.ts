import { numericChoices, Rng } from '../rng';
import { array, arrayIfSmall, barmodel, groups, groupsIfSmall, h, numberline } from '../hintBuilders';
import type { Problem } from '../types';

function remainderSharingWording(total: number, nests: number, askRemainder: boolean) {
  return {
    prompt: `Share ${total} whole eggs between ${nests} nests. Give each nest the same number, using as many eggs as you can. Leave any extra eggs aside.`,
    subPrompt: askRemainder ? 'How many eggs are left over?' : 'How many whole eggs can go in each nest?',
  };
}

/** Clarify the whole-egg rule, including questions already saved in a session. */
export function clarifyRemainderSharing(problem: Problem): Problem {
  if (problem.skillId !== 'div-share' || problem.level !== 4 || problem.meta?.op !== '÷') return problem;
  const [total, nests] = problem.meta.operands ?? [];
  if (!Number.isInteger(total) || !Number.isInteger(nests) || !total || !nests || nests <= 1 || total % nests === 0) return problem;
  const { prompt, subPrompt } = remainderSharingWording(total, nests, !!problem.subPrompt?.includes('left over'));
  if (problem.prompt === prompt && problem.subPrompt === subPrompt) return problem;
  return { ...problem, prompt, subPrompt };
}

/**
 * Multiplication as a concept, before any facts get memorised: equal groups,
 * arrays, and recognising repeated addition. Getting this in first is what
 * stops times tables from being meaningless chanting.
 */
export function multConcept(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'mult-concept', level, seed, flavor: 'dino' as const };

  if (level === 1) {
    const g = rng.int(2, 6);
    const per = rng.int(2, 6);
    const answer = g * per;
    /**
     * Sometimes he lays the eggs out rather than typing the total.
     *
     * Equal groups is a concept about *making* a quantity, so building it is a
     * more honest demonstration than recalling a product — and at this level
     * the whole point is that he has not memorised the product yet.
     */
    const build = answer <= 20 && rng.bool(0.3);
    return {
      ...base,
      prompt: `${g} nests. Each nest has ${per} eggs.`,
      questionVisual: groups(g, per),
      subPrompt: build ? 'Tap out how many eggs altogether.' : 'How many eggs altogether?',
      answer: String(answer),
      representation: build
        ? { kind: 'build', mode: 'tenframe', max: 20 }
        : { kind: 'numeric' },
      hints: [
        h(`Picture ${g} nests with ${per} eggs in each.`, groups(g, per)),
        h(`That is ${Array(g).fill(per).join(' + ')}.`, groups(g, per)),
        h(`${g} groups of ${per} is ${g} × ${per} = ${answer}.`, array(g, per)),
      ],
      meta: { operands: [g, per], op: '×' },
    };
  }

  if (level === 2) {
    const rows = rng.int(2, 7);
    const cols = rng.int(2, 7);
    const answer = rows * cols;
    return {
      ...base,
      prompt: 'How many dots?',
      // The array is the question here, so it renders as a build-style
      // visual rather than being buried in a text sub-prompt.
      answer: String(answer),
      representation: { kind: 'numeric' },
      hints: [
        h('Count how many rows, and how many are in each row.', array(rows, cols)),
        h(`${rows} rows with ${cols} in each row.`, array(rows, cols)),
        h(
          `${rows} × ${cols} = ${answer}. Counting the columns instead gives ${cols} × ${rows} = ${answer} too.`,
          array(rows, cols),
        ),
      ],
      questionVisual: array(rows, cols),
      meta: { operands: [rows, cols], op: '×' },
    };
  }

  // Level 3: recognise which repeated addition matches a product. Tests
  // understanding rather than recall.
  const a = rng.int(3, 7);
  const b = rng.int(3, 7);
  const repeated = (count: number, value: number) => Array(count).fill(value).join(' + ');

  // Distractors vary either the number of groups or the size of a group, so
  // each is wrong in value *and* distinct in text no matter how a and b land.
  // Note "b groups of a" is deliberately NOT used as a distractor — it is a
  // legitimate reading of a × b, and marking it wrong would punish him for
  // understanding commutativity.
  const correct = repeated(a, b);
  const options = rng.shuffle([correct, `${a} + ${b}`, repeated(a + 1, b), repeated(a, b + 1)]);
  return {
    ...base,
    prompt: `Which one means the same as ${a} × ${b}?`,
    answer: correct,
    representation: { kind: 'choice', options },
    hints: [
      h(`${a} × ${b} means ${a} groups of ${b}.`, groups(a, b)),
      h(`So you are adding ${b} to itself ${a} times.`, groups(a, b)),
      h(`That is ${correct}.`, array(a, b)),
    ],
  };
}

/** Times tables 2, 5, 10 — the first fact set, and the base for division. */
export function mult2510(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const table = level === 1 ? rng.pick([10, 5]) : rng.pick([2, 5, 10]);
  const other = level === 1 ? rng.int(2, 6) : level === 2 ? rng.int(2, 11) : rng.int(2, 13);
  // Vary which side the table number sits on, so he learns commutativity.
  const [a, b] = rng.bool() ? [table, other] : [other, table];
  const answer = a * b;

  return {
    skillId: 'mult-2-5-10',
    level,
    seed,
    flavor: 'lab',
    prompt: `${a} × ${b}`,
    answer: String(answer),
    representation: { kind: 'numeric' },
    hints: [
      h(
        table === 10
          ? 'Multiplying by 10 shifts every digit up one place.'
          : table === 5
            ? 'Count in fives, or take half of the ten times answer.'
            : 'Multiplying by 2 is just doubling.',
        numberline(0, answer),
      ),
      h(`${table} × ${other}: count in ${table}s, ${other} times.`, groupsIfSmall(other, table)),
      h(`${a} × ${b} = ${answer}.`, arrayIfSmall(Math.min(a, b), Math.max(a, b))),
    ],
    meta: { operands: [a, b], op: '×' },
  };
}

/** Times tables 3 and 4, taught off the back of doubling. */
export function mult34(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const table = level === 1 ? 3 : rng.pick([3, 4]);
  const other = level === 1 ? rng.int(2, 6) : level === 2 ? rng.int(2, 10) : rng.int(2, 13);
  const [a, b] = rng.bool() ? [table, other] : [other, table];
  const answer = a * b;

  return {
    skillId: 'mult-3-4',
    level,
    seed,
    flavor: 'lab',
    prompt: `${a} × ${b}`,
    answer: String(answer),
    representation: { kind: 'numeric' },
    hints: [
      h(
        table === 4
          ? 'Four times something is double, then double again.'
          : 'Three times something is double it, then add one more group.',
        groupsIfSmall(table, other),
      ),
      h(
        table === 4
          ? `Double ${other} is ${other * 2}. Double that is ${other * 4}.`
          : `Double ${other} is ${other * 2}, plus one more ${other} is ${other * 3}.`,
        arrayIfSmall(table, other),
      ),
      h(`${a} × ${b} = ${answer}.`, arrayIfSmall(Math.min(a, b), Math.max(a, b))),
    ],
    meta: { operands: [a, b], op: '×' },
  };
}

/**
 * Division built on the multiplication facts he already has. Level 1 is fair
 * sharing, level 3 is measurement division ("how many groups fit"), and level
 * 4 introduces remainders concretely — three genuinely different ideas that
 * all wear the same ÷ symbol.
 */
export function divShare(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = { skillId: 'div-share', level, seed, flavor: 'dino' as const };

  if (level === 1) {
    const g = rng.pick([2, 5, 10]);
    const per = rng.int(2, 8);
    const total = g * per;
    return {
      ...base,
      prompt: `${total} eggs are shared equally between ${g} nests.`,
      subPrompt: 'How many eggs go in each nest?',
      answer: String(per),
      representation: { kind: 'numeric' },
      hints: [
        h(`Deal them out one at a time, like cards, into ${g} nests.`, groupsIfSmall(g, per)),
        h(`Ask it the other way round: ${g} × what = ${total}?`, arrayIfSmall(g, per)),
        h(`${g} × ${per} = ${total}, so ${total} ÷ ${g} = ${per}.`, arrayIfSmall(g, per)),
      ],
      meta: { operands: [total, g], op: '÷' },
    };
  }

  if (level === 2) {
    const divisor = rng.pick([2, 5, 10]);
    const quotient = rng.int(2, 12);
    const total = divisor * quotient;
    return {
      ...base,
      flavor: 'lab',
      prompt: `${total} ÷ ${divisor}`,
      answer: String(quotient),
      representation: { kind: 'numeric' },
      hints: [
        h(`Think of the matching times table: ${divisor} × ? = ${total}.`, arrayIfSmall(divisor, quotient)),
        h(`Count up in ${divisor}s and keep track of how many jumps it takes.`, numberline(0, total)),
        h(
          `${divisor} × ${quotient} = ${total}, so ${total} ÷ ${divisor} = ${quotient}.`,
          arrayIfSmall(divisor, quotient),
        ),
      ],
      meta: { operands: [total, divisor], op: '÷' },
    };
  }

  if (level === 3) {
    // Measurement division: same symbol, different question.
    const per = rng.pick([2, 3, 4, 5]);
    const g = rng.int(3, 9);
    const total = per * g;
    return {
      ...base,
      prompt: `${total} dinosaurs are moved in groups of ${per}.`,
      subPrompt: 'How many groups will there be?',
      answer: String(g),
      representation: { kind: 'numeric' },
      hints: [
        h('This time you know how big each group is, not how many groups there are.', groupsIfSmall(g, per)),
        h(`How many ${per}s fit inside ${total}?`, numberline(0, total)),
        h(`${per} × ${g} = ${total}, so there will be ${g} groups.`, groupsIfSmall(g, per)),
      ],
      meta: { operands: [total, per], op: '÷' },
    };
  }

  // Level 4: remainders, asked concretely so the leftover means something.
  const divisor = rng.int(3, 6);
  const quotient = rng.int(2, 7);
  const remainder = rng.int(1, divisor - 1);
  const total = divisor * quotient + remainder;
  const askRemainder = rng.bool();
  return {
    ...base,
    ...remainderSharingWording(total, divisor, askRemainder),
    answer: String(askRemainder ? remainder : quotient),
    representation: { kind: 'numeric' },
    hints: [
      h('They will not share out perfectly this time. Some will be left over.', groupsIfSmall(divisor, quotient)),
      h(
        `The biggest multiple of ${divisor} that fits inside ${total} is ${divisor * quotient}.`,
        barmodel(total, [divisor * quotient, remainder]),
      ),
      h(
        `${divisor} × ${quotient} = ${divisor * quotient}, and ${total} − ${divisor * quotient} = ${remainder}. So each nest gets ${quotient} and ${remainder} ${remainder === 1 ? 'is' : 'are'} left over.`,
        barmodel(total, [divisor * quotient, remainder]),
      ),
    ],
    meta: { operands: [total, divisor], op: '÷' },
  };
}

export function multChoices(rng: Rng, answer: number): string[] {
  return numericChoices(rng, answer, 4, 4);
}
