import { barmodel, stacked, tenframe } from '../engine/hintBuilders';
import type { ErrorType, Hint, HintVisual, Problem } from '../engine/types';

/**
 * Kid-facing remediation and self-diagnosis.
 *
 * This is the "high-quality canned response" layer that replaces a runtime
 * LLM call for the common case: a short, warm, second-person line targeted at
 * *how* he went wrong, chosen from the already-classified error type plus the
 * operation involved. `ERROR_COACHING` in engine/errors.ts is the parent-
 * facing equivalent (third person, dashboard tone) — this file is what he
 * actually reads.
 */

export type ReflectBucket = 'operation' | 'slip' | 'stuck' | 'unsure';

export interface ReflectOption {
  id: ReflectBucket;
  label: string;
}

/** The tap choices shown after a wrong answer, before any remediation text. */
export const REFLECT_OPTIONS: ReflectOption[] = [
  { id: 'operation', label: 'I used the wrong operation' },
  { id: 'slip', label: 'I made a small mistake' },
  { id: 'stuck', label: "I didn't know where to start" },
  { id: 'unsure', label: "I'm not sure" },
];

/**
 * Map a classified error type onto the same coarse buckets he self-reports
 * from. Several distinct error types collapse into "slip" — he isn't asked to
 * distinguish off-by-one from a dropped carry, just whether it was a small
 * mistake versus a conceptual one.
 */
export function bucketOfError(errorType: ErrorType): ReflectBucket | null {
  switch (errorType) {
    case 'operation-reversed':
      return 'operation';
    case 'off-by-one':
    case 'off-by-ten':
    case 'regrouping':
    case 'place-value':
    case 'near-miss':
    case 'transposition':
      return 'slip';
    case 'likely-guess':
    case 'timeout':
      return 'stuck';
    default:
      return null;
  }
}

/**
 * A short line responding to his self-diagnosis: affirm when he correctly
 * spotted the pattern, gently correct when he didn't. Kept warm either way —
 * this is metacognition practice, not a second scoring pass.
 */
export function reflectResponse(guess: ReflectBucket, errorType: ErrorType): string {
  const actual = bucketOfError(errorType);

  if (guess === 'unsure') {
    return "That's alright — here's what happened.";
  }
  if (actual === null) {
    // The real error didn't fit a clean bucket; don't contradict a reasonable guess.
    return "Good thinking. Here's a closer look.";
  }
  if (guess === actual) {
    return guess === 'operation'
      ? "You're right — that's exactly what happened."
      : guess === 'slip'
        ? 'Good catch — the method was right, it was just a small slip.'
        : 'Good noticing — that one was tricky to get started on.';
  }
  // Gentle correction, never blunt.
  if (actual === 'operation') return 'Actually, I think this one needed a different operation. Take a look:';
  if (actual === 'slip') return 'Close — actually it looks like a small slip rather than the wrong approach:';
  return "Actually, this looks like one you weren't quite sure how to start:";
}

/**
 * The main remediation line: a short, second-person explanation of *how* the
 * error happened, tuned by operation where that changes the language (carry
 * vs. borrow), with a generic fallback for anything without an op-specific
 * variant. This is shown alongside the worked-solution hint, not instead of
 * it — it explains the mistake, the hint shows the method.
 */
export function remediationLine(problem: Problem, errorType: ErrorType): string {
  const op = problem.meta?.op;
  const opSpecific = op ? REMEDIATION[op]?.[errorType] : undefined;
  return opSpecific ?? REMEDIATION.generic[errorType] ?? '';
}

/**
 * Remediation as a full hint — the words plus a picture of *the specific
 * mistake*. A dropped carry gets the two columns stacked with the ones
 * column called out; a reversed operation gets the part-whole bar so he can
 * see why it had to be a subtraction. This is the difference between being
 * told you were wrong and being shown where.
 */
export function remediationHint(problem: Problem, errorType: ErrorType): Hint {
  const text = remediationLine(problem, errorType);
  return { text, visual: remediationVisual(problem, errorType) };
}

function remediationVisual(problem: Problem, errorType: ErrorType): HintVisual | undefined {
  const ops = problem.meta?.operands;
  const op = problem.meta?.op;
  if (!ops || ops.length !== 2 || !op) return undefined;
  const [x, y] = ops as [number, number];
  const answer = Number(problem.answer);
  const hasAnswer = Number.isFinite(answer);

  switch (errorType) {
    case 'regrouping':
      // Show the column where the carry/borrow was dropped.
      if (op === '+' || op === '-') {
        return stacked(x, y, op, hasAnswer ? answer : undefined, 'ones');
      }
      return undefined;

    case 'operation-reversed':
      // Part-whole makes the required operation visible rather than asserted.
      if (op === '+') return barmodel(hasAnswer ? answer : null, [x, y]);
      if (op === '-') return barmodel(x, [y, hasAnswer ? answer : null]);
      return undefined;

    case 'off-by-one':
    case 'off-by-ten':
    case 'place-value':
    case 'near-miss':
    case 'transposition':
      if (op === '+' || op === '-') {
        return stacked(x, y, op, hasAnswer ? answer : undefined);
      }
      return undefined;

    case 'likely-guess':
    case 'timeout':
      // He didn't get started — go back to the most concrete representation.
      if (op === '+' && x <= 10 && y <= 10) return tenframe(x, y);
      if (op === '+' || op === '-') return barmodel(op === '+' ? (hasAnswer ? answer : null) : x, op === '+' ? [x, y] : [y, hasAnswer ? answer : null]);
      return undefined;

    default:
      return undefined;
  }
}

type OpKey = '+' | '-' | '×' | '÷' | 'generic';

const REMEDIATION: Record<OpKey, Partial<Record<ErrorType, string>>> = {
  '+': {
    'off-by-one': 'So close — you were just one off. Try counting on again from the bigger number.',
    'off-by-ten': "You're a whole ten out. Check the tens column separately from the ones.",
    regrouping:
      "It looks like you added the ones and the tens separately but didn't carry the extra ten across. When the ones make more than 9, that's a whole ten to add on.",
    'place-value': 'The digits are close, but check which column each one belongs in.',
    'operation-reversed': "This one needed adding, not subtracting — the two amounts are being put together.",
    'near-miss': 'You had the right idea — just a small slip in the arithmetic.',
    transposition: 'You had the right digits, just in the wrong order. Slow down on the write-down.',
  },
  '-': {
    'off-by-one': 'Just one off — try counting back again, one step at a time.',
    'off-by-ten': "You're a whole ten out. Check the tens column on its own.",
    regrouping:
      "It looks like you subtracted each column on its own, but when the top digit is smaller than the bottom one, you need to borrow a ten first.",
    'place-value': 'The digits are close, but check which column each one is in.',
    'operation-reversed': 'This one needed subtracting, not adding — something is being taken away or compared.',
    'near-miss': 'Right idea, small slip in the numbers.',
    transposition: 'Right digits, wrong order. Slow down when you write the answer.',
  },
  '×': {
    'operation-reversed': "This one needed multiplying, not adding — there are equal groups here, so count them as groups.",
    'near-miss': 'Close — check you counted the right number of groups.',
  },
  '÷': {
    'operation-reversed': 'This one needed sharing out (dividing), not multiplying.',
    'near-miss': "Close — double-check how many equal groups it splits into.",
  },
  generic: {
    'off-by-one': 'So close — just one off.',
    'off-by-ten': "You're a whole ten away. Check the tens column.",
    regrouping: "Check whether you needed to carry or borrow between columns.",
    'place-value': 'Check which column each digit belongs in.',
    'operation-reversed': 'Read it again — which operation does this actually need?',
    transposition: 'Right digits, wrong order.',
    'near-miss': 'Very close — a small arithmetic slip.',
    'likely-guess': "That looked like a guess. It's okay to take your time — try working through it slowly.",
    timeout: "This one was tough to get started on. That's useful to know — it's not about being fast.",
    other: '',
  },
};
