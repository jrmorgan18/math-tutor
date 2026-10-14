import type { ErrorType, Problem } from './types';

/**
 * Classify *how* an answer was wrong.
 *
 * This is the difference between a dashboard that says "62% on subtraction
 * within 100" and one that says "he is dropping the regroup when the ones
 * digit is smaller" — only the second tells you what to actually work on, and
 * only the second lets the scheduler pick a targeted remediation.
 */
export function classify(
  problem: Problem,
  given: string,
  latencyMs: number,
  timedOut: boolean,
): ErrorType {
  if (timedOut) return 'timeout';

  const expected = normalise(problem.answer);
  const actual = normalise(given);
  if (expected === actual) return 'correct';

  const e = Number(expected);
  const a = Number(actual);

  // Non-numeric answers (choice questions with word options) can only be
  // scored as fast-guess or plain wrong.
  if (!Number.isFinite(e) || !Number.isFinite(a)) {
    return latencyMs < 1200 ? 'likely-guess' : 'other';
  }

  const diff = a - e;
  const abs = Math.abs(diff);

  // An answer given faster than it is physically possible to read the question
  // is a guess, regardless of how close it landed.
  if (latencyMs < 1200) return 'likely-guess';

  const ops = problem.meta?.operands;
  const op = problem.meta?.op;

  if (ops && ops.length === 2 && op) {
    const [x, y] = ops as [number, number];

    // Applied the inverse operation.
    if (op === '+' && (a === x - y || a === y - x)) return 'operation-reversed';
    if (op === '-' && a === x + y) return 'operation-reversed';
    if (op === '×' && (a === x + y || a === x - y)) return 'operation-reversed';
    if (op === '÷' && (a === x * y || a === x - y)) return 'operation-reversed';

    // Column arithmetic with the carry or borrow dropped.
    if ((op === '+' || op === '-') && a === columnwiseNoRegroup(x, y, op)) {
      return 'regrouping';
    }
  }

  if (abs === 1) return 'off-by-one';
  if (abs === 10) return 'off-by-ten';
  if (isTransposition(e, a)) return 'transposition';
  if (abs % 100 === 0 || abs % 10 === 0) return 'place-value';
  if (abs <= 3) return 'near-miss';
  return 'other';
}

/**
 * What you get by operating on each column independently and never carrying or
 * borrowing. 27 + 15 becomes 3|12 -> the learner writes 32 (carry dropped) or
 * 312 (columns concatenated); we catch the first, which is by far the common
 * one. 42 - 17 becomes 3|5 -> 35 instead of 25.
 */
function columnwiseNoRegroup(x: number, y: number, op: '+' | '-'): number {
  const digits = (n: number) => String(Math.abs(n)).split('').map(Number);
  const dx = digits(x);
  const dy = digits(y);
  const width = Math.max(dx.length, dy.length);
  while (dx.length < width) dx.unshift(0);
  while (dy.length < width) dy.unshift(0);

  let out = 0;
  for (let i = 0; i < width; i++) {
    const a = dx[i] as number;
    const b = dy[i] as number;
    // Truncating each column to a single digit is exactly the mistake.
    const col = op === '+' ? (a + b) % 10 : Math.abs(a - b);
    out = out * 10 + col;
  }
  return out;
}

/** 42 answered as 24 — the digits are right, the order is not. */
function isTransposition(expected: number, actual: number): boolean {
  const e = String(expected);
  const a = String(actual);
  if (e.length !== a.length || e.length < 2 || e === a) return false;
  return [...e].sort().join('') === [...a].sort().join('');
}

/** Trim, lowercase, and strip a leading '+' or thousands separators. */
export function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/,/g, '').replace(/^\+/, '');
}

export const ERROR_LABELS: Record<ErrorType, string> = {
  correct: 'Correct',
  'off-by-one': 'Off by one',
  'off-by-ten': 'Off by ten',
  regrouping: 'Dropped a carry or borrow',
  'place-value': 'Place value slip',
  'operation-reversed': 'Used the opposite operation',
  transposition: 'Digits swapped',
  'near-miss': 'Close, small slip',
  'likely-guess': 'Answered too fast to have worked it out',
  timeout: 'Ran out of time',
  other: 'Something else',
};

/**
 * Plain-language coaching note per error type, surfaced on the parent
 * dashboard next to the skill it happened on.
 */
export const ERROR_COACHING: Record<ErrorType, string> = {
  correct: '',
  'off-by-one':
    'Usually a counting-on error — he starts the count at the first number instead of after it. Counting on fingers from the larger number helps.',
  'off-by-ten':
    'A tens-column slip. Worth practising with base-ten blocks or a hundred chart so the tens are visible.',
  regrouping:
    'He is treating each column separately and losing the carry or borrow. Work it with physical objects that must be bundled into tens.',
  'place-value':
    'The digits are right but sitting in the wrong column. Expanded form (40 + 2) makes the columns explicit.',
  'operation-reversed':
    'He read the problem and picked the wrong operation. Ask him to say out loud whether the answer should be bigger or smaller before he starts.',
  transposition:
    'The digits were reversed. Check entry direction and allow correction before interpreting this as a learning difficulty.',
  'near-miss': 'The method is right, the arithmetic slipped. Not a concept gap.',
  'likely-guess':
    'Answered faster than the problem can be read. Usually means he is disengaged or the question feels too hard to attempt.',
  timeout:
    'Skipped after support. Ask about interruptions and understanding before drawing a conclusion.',
  other: '',
};
