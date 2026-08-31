import type { Problem } from '../../engine/types';

/**
 * The standard column-addition/subtraction layout — operands right-aligned
 * one above the other, operator on the left, a rule beneath.
 *
 * Driven entirely from `problem.meta.operands`/`op`, never by parsing the
 * prompt string, so it can't drift out of sync with what's actually being
 * asked. Purely a *visual* reinforcement of the standard algorithm for now —
 * the answer is still entered as one number on the keypad below, not
 * column-by-column. That's a natural follow-up if he responds well to this.
 */
interface Props {
  problem: Problem;
}

const STACKABLE_SKILLS = new Set(['add-100', 'sub-100']);

export function isStackable(problem: Problem): boolean {
  return (
    STACKABLE_SKILLS.has(problem.skillId) &&
    problem.representation.kind === 'numeric' &&
    !!problem.meta?.operands &&
    problem.meta.operands.length === 2 &&
    (problem.meta.op === '+' || problem.meta.op === '-')
  );
}

export function StackedProblem({ problem }: Props) {
  const [a, b] = problem.meta!.operands as [number, number];
  const op = problem.meta!.op as '+' | '-';

  return (
    <div className="stack-problem mono" aria-label={problem.prompt}>
      <div className="stack-row">
        <span className="stack-op" />
        <span className="stack-num">{a}</span>
      </div>
      <div className="stack-row">
        <span className="stack-op">{op}</span>
        <span className="stack-num">{b}</span>
      </div>
      <div className="stack-line" />
    </div>
  );
}
