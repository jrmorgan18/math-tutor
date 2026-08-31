import type { ErrorType, Problem } from './types';

/**
 * Where the hint ladder should open.
 *
 * Normally hints start at rung 0 — the gentlest nudge — and he walks down.
 * But once he has *already answered wrong*, the nudge is wasted: we know
 * something specific about where he is. Opening at the rung that actually
 * addresses his mistake is the difference between a hint system and a
 * hint list.
 *
 * Returns the number of rungs to reveal immediately (never the last one —
 * the worked solution is still earned, not given).
 */
export function openingRung(problem: Problem, errorType: ErrorType | null): number {
  if (!errorType || errorType === 'correct') return 0;

  const last = problem.hints.length - 1;
  // The strategy rung (usually index 1) is where the concrete representation
  // lives, so most diagnosed errors should land there rather than on the
  // generic "read it again" opener.
  const strategyRung = Math.min(1, last);

  switch (errorType) {
    // He knows roughly what to do and slipped, so the nudge is useless — but
    // the strategy rung shows the method laid out, which is what he needs.
    case 'off-by-one':
    case 'off-by-ten':
    case 'regrouping':
    case 'place-value':
    case 'transposition':
    case 'near-miss':
      return strategyRung + 1;

    // He picked the wrong operation — that is a conceptual miss, and the
    // strategy rung carries the part-whole picture that fixes it.
    case 'operation-reversed':
      return strategyRung + 1;

    // He never got started. Begin at the beginning, but don't make him tap
    // through the opener he already ignored.
    case 'likely-guess':
    case 'timeout':
      return Math.min(1, last);

    default:
      return 0;
  }
}
