import { describe, expect, it } from 'vitest';
import { derivePredict } from '../src/engine/predict';
import { generate } from '../src/engine/generators';
import { SKILLS } from '../src/engine/skills';

const SEEDS = 300;

describe('predict prompts are correct whenever they are produced', () => {
  it('never mislabels bigger/smaller for any generated problem', () => {
    let derived = 0;
    for (const skill of SKILLS) {
      for (let level = 1; level <= skill.maxLevel; level++) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const problem = generate(skill.id, level, seed);
          const predict = derivePredict(problem);
          if (!predict) continue;
          derived++;

          const answer = Number(problem.answer);
          const reference = Number(
            predict.question.match(/than (\d+)\?/)?.[1],
          );
          expect(Number.isFinite(reference), predict.question).toBe(true);

          if (predict.correctAnswer === 'Bigger') {
            expect(answer, `${skill.id} L${level} s${seed}`).toBeGreaterThan(reference);
          } else {
            expect(answer, `${skill.id} L${level} s${seed}`).toBeLessThan(reference);
          }
        }
      }
    }
    // Sanity: the derivation actually fires for a meaningful share of
    // problems — otherwise this test would trivially pass on an empty set.
    expect(derived).toBeGreaterThan(1000);
  });

  it('only ever offers exactly two options, one of which is correctAnswer', () => {
    for (const skill of SKILLS) {
      for (let level = 1; level <= skill.maxLevel; level++) {
        const problem = generate(skill.id, level, 7);
        const predict = derivePredict(problem);
        if (!predict) continue;
        expect(predict.options).toHaveLength(2);
        expect(predict.options).toContain(predict.correctAnswer);
      }
    }
  });

  it('returns null for choice-based problems', () => {
    // mult-concept level 3 and function-machine level 4 are choice-based.
    const choiceProblem = generate('mult-concept', 3, 1);
    expect(choiceProblem.representation.kind).toBe('choice');
    expect(derivePredict(choiceProblem)).toBeNull();
  });

  it('returns null when there is no meta to derive from', () => {
    // place-value-3 and compare-numbers problems don't carry meta.operands/op.
    for (let seed = 1; seed <= 20; seed++) {
      const p = generate('place-value-3', 2, seed);
      expect(derivePredict(p)).toBeNull();
    }
  });
});
