import { Rng } from '../rng';
import { TEMPLATES_BY_OP } from '../../content/wordProblems';
import { arrayIfSmall, barmodel, h, numberline, stacked } from '../hintBuilders';
import type { Problem } from '../types';

/**
 * Function machines: infer a rule from examples, then apply it.
 *
 * This is the strand that actually stretches him. It is not harder arithmetic —
 * the numbers are small — it is a different kind of thinking, and it is the
 * direct precursor to variables and functions.
 */
export function functionMachine(level: number, seed: number): Problem {
  const rng = new Rng(seed);
  const base = {
    skillId: 'function-machine',
    level,
    seed,
    flavor: 'lab' as const,
  };

  const op: '+' | '-' | '×' =
    level === 1 ? '+' : level === 2 ? '-' : level === 3 ? '×' : rng.pick(['+', '-', '×'] as const);
  const n = op === '×' ? rng.int(2, 6) : rng.int(2, 9);

  const apply = (x: number) => (op === '+' ? x + n : op === '-' ? x - n : x * n);
  // Keep inputs large enough that subtraction never goes negative.
  const lowest = op === '-' ? n + 1 : 1;
  const inputs = rng.shuffle(
    Array.from({ length: 8 }, (_, i) => lowest + i),
  ).slice(0, 4) as number[];

  const shown = inputs.slice(0, 3);
  const test = inputs[3] as number;
  const table = shown.map((x) => `${x}  →  ${apply(x)}`).join('\n');
  const ruleText = op === '+' ? `add ${n}` : op === '-' ? `subtract ${n}` : `multiply by ${n}`;

  if (level === 4) {
    // Name the rule, rather than apply it.
    const options = rng.shuffle([
      ruleText,
      op === '+' ? `subtract ${n}` : `add ${n}`,
      `multiply by ${n === 2 ? 3 : 2}`,
      op === '+' ? `add ${n + 1}` : `subtract ${n + 1}`,
    ]);
    return {
      ...base,
      prompt: 'What is the machine doing?',
      subPrompt: table,
      answer: ruleText,
      representation: { kind: 'choice', options },
      hints: [
        h(
          'Look at the first pair. What happened to that number?',
          op === '×'
            ? arrayIfSmall(n, shown[0] as number)
            : numberline(shown[0] as number, apply(shown[0] as number)),
        ),
        h('Now check your idea against the second and third pairs. It has to work for all of them.'),
        h(
          `Every output is the input ${op === '+' ? 'plus' : op === '-' ? 'minus' : 'times'} ${n}, so the rule is: ${ruleText}.`,
        ),
      ],
    };
  }

  return {
    ...base,
    prompt: `${test}  →  ?`,
    subPrompt: `The machine follows a secret rule:\n${table}`,
    answer: String(apply(test)),
    representation: { kind: 'numeric' },
    hints: [
      h(
        'Compare each input with its output. What is happening every time?',
        op === '×'
          ? arrayIfSmall(n, shown[0] as number)
          : numberline(shown[0] as number, apply(shown[0] as number)),
      ),
      h('Check your rule works on all three examples before you use it.'),
      h(
        `The rule is "${ruleText}", so ${test} → ${apply(test)}.`,
        op === '×' ? arrayIfSmall(n, test) : numberline(test, apply(test)),
      ),
    ],
    meta: { operands: [test, n], op },
  };
}

/**
 * One-step word problems drawn from the authored bank.
 *
 * The template supplies prose; the numbers and the answer are computed here,
 * so the answer is correct by construction. Level controls both which
 * operations appear and how big the numbers get.
 */
export function word1Step(level: number, seed: number): Problem {
  const rng = new Rng(seed);

  const ops: Array<'+' | '-' | '×' | '÷'> =
    level === 1
      ? ['+', '-']
      : level === 2
        ? ['+', '-']
        : level === 3
          ? ['+', '-', '×']
          : ['+', '-', '×', '÷'];
  const op = rng.pick(ops);

  let a: number;
  let b: number;
  let answer: number;

  if (op === '+') {
    if (level === 1) {
      a = rng.int(4, 12);
      b = rng.int(3, 8);
    } else if (level === 2) {
      a = rng.int(14, 45);
      b = rng.int(11, 40);
    } else {
      a = rng.int(26, 68);
      b = rng.int(15, 31);
    }
    answer = a + b;
  } else if (op === '-') {
    if (level === 1) {
      a = rng.int(8, 18);
      b = rng.int(2, a - 3);
    } else if (level === 2) {
      a = rng.int(30, 80);
      b = rng.int(10, a - 10);
    } else {
      a = rng.int(42, 95);
      // Force a borrow so the harder levels are genuinely harder.
      b = rng.int(1, 9) * 10 + rng.int((a % 10) + 1, 9);
      if (b >= a) b = a - rng.int(6, 19);
    }
    answer = a - b;
  } else if (op === '×') {
    a = rng.int(2, 8);
    b = level === 3 ? rng.pick([2, 5, 10]) : rng.pick([2, 3, 4, 5, 10]);
    answer = a * b;
  } else {
    b = rng.pick([2, 3, 4, 5, 10]);
    answer = rng.int(2, 9);
    a = b * answer;
  }

  const pool = TEMPLATES_BY_OP[op];
  if (!pool || pool.length === 0) throw new Error(`No word templates for ${op}`);
  const template = rng.pick(pool);

  const opWord =
    op === '+' ? 'add' : op === '-' ? 'subtract' : op === '×' ? 'multiply' : 'divide';

  return {
    skillId: 'word-1step',
    level,
    seed,
    flavor: template.flavor,
    prompt: template.build(a, b),
    subPrompt: `Choose an operation, then answer in ${template.unit}.`,
    operationChoice: { options: ops.map(o => ({ '+': 'Add', '-': 'Subtract', '×': 'Multiply', '÷': 'Divide' })[o]),
      answer: ({ '+': 'Add', '-': 'Subtract', '×': 'Multiply', '÷': 'Divide' })[op] },
    answer: String(answer),
    representation: { kind: 'numeric' },
    hints: [
      h('Read it once more. What is it actually asking you to find?'),
      // The bar model is the whole point here: it turns "which operation?"
      // from a guess into something he can see. Addition/subtraction are
      // part-whole; multiplication/division are equal groups.
      h(
        op === '+'
          ? 'Two amounts are being put together, so the answer will be bigger than either one.'
          : op === '-'
            ? 'Something is being taken away or compared, so the answer will be smaller than what you started with.'
            : op === '×'
              ? 'There are equal groups, so you can multiply instead of adding the same number again and again.'
              : 'Something is being split into equal parts, so the answer will be smaller than the total.',
        op === '+'
          ? barmodel(null, [a, b])
          : op === '-'
            ? barmodel(a, [b, null])
            : op === '×'
              ? arrayIfSmall(a, b)
              : arrayIfSmall(b, answer),
      ),
      h(
        `You need to ${opWord}: ${a} ${op} ${b} = ${answer}.`,
        op === '+' || op === '-'
          ? stacked(a, b, op, answer)
          : arrayIfSmall(Math.min(a, b), Math.max(a, b)),
      ),
    ],
    meta: { operands: [a, b], op },
  };
}
