import { describe, expect, it } from 'vitest';
import { openingRung } from '../src/engine/adaptiveHints';
import { generate } from '../src/engine/generators';
import { classify } from '../src/engine/errors';
import { SKILLS } from '../src/engine/skills';
import type { ErrorType } from '../src/engine/types';

const ALL_ERRORS: ErrorType[] = [
  'correct',
  'off-by-one',
  'off-by-ten',
  'regrouping',
  'place-value',
  'operation-reversed',
  'transposition',
  'near-miss',
  'likely-guess',
  'timeout',
  'other',
];

describe('adaptive hint entry point', () => {
  const problem = generate('add-100', 4, 3);

  it('starts at the top when there is no diagnosis', () => {
    expect(openingRung(problem, null)).toBe(0);
    expect(openingRung(problem, 'correct')).toBe(0);
    // An unclassifiable miss tells us nothing, so it must not skip ahead —
    // guessing at a rung would be worse than starting from the beginning.
    expect(openingRung(problem, 'other')).toBe(0);
  });

  it('skips the generic nudge for a diagnosable slip', () => {
    for (const e of ['off-by-one', 'off-by-ten', 'regrouping', 'place-value', 'near-miss', 'transposition'] as const) {
      expect(openingRung(problem, e), e).toBeGreaterThan(0);
    }
  });

  it('opens on the strategy rung for a reversed operation', () => {
    // The part-whole picture lives here — that is what fixes the misconception.
    expect(openingRung(problem, 'operation-reversed')).toBe(2);
  });

  it('starts gently when he never got going', () => {
    expect(openingRung(problem, 'likely-guess')).toBe(1);
    expect(openingRung(problem, 'timeout')).toBe(1);
  });

  it('never reveals the final worked solution automatically', () => {
    // The answer always has to be asked for — auto-revealing it would turn a
    // miss into a freebie and remove any reason to think.
    for (const skill of SKILLS) {
      for (let level = 1; level <= skill.maxLevel; level++) {
        for (let seed = 1; seed <= 30; seed++) {
          const p = generate(skill.id, level, seed);
          const last = p.hints.length - 1;
          for (const e of ALL_ERRORS) {
            expect(
              openingRung(p, e),
              `${skill.id} L${level} ${e} would reveal the solution`,
            ).toBeLessThanOrEqual(last);
          }
        }
      }
    }
  });

  it('end to end: a dropped carry opens the ladder past the nudge', () => {
    // Reproduce a real regrouping mistake rather than asserting on a label.
    const p = generate('add-100', 4, 99);
    const [a, b] = p.meta!.operands as [number, number];
    const droppedCarry = Number(
      `${Math.floor(a / 10) + Math.floor(b / 10)}${((a % 10) + (b % 10)) % 10}`,
    );
    const errorType = classify(p, String(droppedCarry), 9000, false);
    expect(errorType).toBe('regrouping');
    expect(openingRung(p, errorType)).toBeGreaterThan(0);
  });
});
