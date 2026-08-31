import type { Problem } from './types';

/**
 * A tap-only calibration question shown before he starts solving — "will the
 * answer be bigger or smaller than X?" This is the cheap, offline substitute
 * for a free-text "explain your reasoning" step: forcing a commitment before
 * the answer is revealed is what makes a question Socratic, not the prose
 * around it. No LLM, no speech recognition, no free text — just a tap.
 */
export interface PredictPrompt {
  question: string;
  options: [string, string];
  /** One of `options`, verbatim. */
  correctAnswer: string;
}

/**
 * Derive a predict prompt from a problem's operands, or null if one can't be
 * derived safely.
 *
 * Deliberately conservative: only fires for numeric two-operand problems with
 * a known op, and only after a sanity check against the *actual* computed
 * answer. An edge case (e.g. multiplying by a value that doesn't make the
 * result bigger) silently returns null rather than ever showing a
 * mislabelled question — the same "never wrong" bar the generators hold
 * themselves to.
 */
export function derivePredict(problem: Problem): PredictPrompt | null {
  if (problem.representation.kind !== 'numeric') return null;

  const operands = problem.meta?.operands;
  const op = problem.meta?.op;
  if (!operands || operands.length !== 2 || !op) return null;

  const [x, y] = operands as [number, number];
  const answer = Number(problem.answer);
  if (!Number.isFinite(answer)) return null;

  // Reference value each op family compares the answer against, and what
  // "correct" means for that comparison. Addition/multiplication grow the
  // result past the larger input; subtraction/division shrink it below the
  // first (starting) input.
  let reference: number;
  let correctAnswer: 'Bigger' | 'Smaller';
  if (op === '+' || op === '×') {
    reference = Math.max(x, y);
    correctAnswer = 'Bigger';
  } else if (op === '-' || op === '÷') {
    reference = x;
    correctAnswer = 'Smaller';
  } else {
    return null;
  }

  // Sanity check: bail rather than risk a mislabelled question if the
  // assumption doesn't actually hold for this specific problem (e.g. an edge
  // case where a factor is 0 or 1, or the reference equals the answer).
  const holds =
    correctAnswer === 'Bigger' ? answer > reference : answer < reference;
  if (!holds) return null;

  return {
    question: `Before you solve it — will the answer be bigger or smaller than ${reference}?`,
    options: ['Bigger', 'Smaller'],
    correctAnswer,
  };
}
