import { getSkill } from '../skills';
import type { Problem, SkillId } from '../types';
import { compareNumbers, placeValue3, skipCount } from './number';
import { add100, add20, missingAddend, sub100, sub20 } from './addsub';
import { divShare, mult2510, mult34, multConcept } from './multdiv';
import { functionMachine, word1Step } from './reasoning';
import { fractionOfSet, fractionParts } from './fractions';
import { measureLength, moneyCount, timeClock } from './measurement';
import { perimeter, shapes2d } from './geometry';

export type Generator = (level: number, seed: number) => Problem;

/**
 * Every skill maps to exactly one pure generator. Purity matters: an attempt
 * record stores only (skillId, level, seed), so any past question can be
 * reconstructed exactly for debugging or for the parent dashboard.
 */
export const GENERATORS: Record<SkillId, Generator> = {
  'place-value-3': placeValue3,
  'skip-count': skipCount,
  'compare-numbers': compareNumbers,
  'add-20': add20,
  'sub-20': sub20,
  'add-100': add100,
  'sub-100': sub100,
  'missing-addend': missingAddend,
  'mult-concept': multConcept,
  'mult-2-5-10': mult2510,
  'mult-3-4': mult34,
  'div-share': divShare,
  'function-machine': functionMachine,
  'word-1step': word1Step,
  'fraction-parts': fractionParts,
  'fraction-of-set': fractionOfSet,
  'money-count': moneyCount,
  'time-clock': timeClock,
  'measure-length': measureLength,
  'shapes-2d': shapes2d,
  'perimeter': perimeter,
};

/** Generate a problem, clamping the level to what the skill actually defines. */
export function generate(skillId: SkillId, level: number, seed: number): Problem {
  const gen = GENERATORS[skillId];
  if (!gen) throw new Error(`No generator for skill: ${skillId}`);
  const skill = getSkill(skillId);
  const clamped = Math.min(Math.max(Math.round(level), 1), skill.maxLevel);
  return tagProblem(gen(clamped, seed));
}

/**
 * Attach stable structural labels after generation. Generators remain small
 * and pure, while the scheduler gets a shared vocabulary for selecting work
 * that addresses a recurring misconception.
 */
export function tagProblem(problem: Problem): Problem {
  const tags = new Set(problem.meta?.tags ?? []);
  tags.add(problem.skillId);
  tags.add(problem.representation.kind);

  if (problem.meta?.op) tags.add(`operation:${problem.meta.op}`);
  if (problem.skillId === 'missing-addend') tags.add('unknown-position');
  if (problem.skillId === 'place-value-3') tags.add('place-value');
  if (problem.skillId === 'word-1step') tags.add('word-problem');
  if (problem.skillId === 'mult-concept' || problem.skillId === 'div-share') {
    tags.add('equal-groups');
  }
  if (
    problem.skillId === 'add-100' || problem.skillId === 'sub-100'
  ) {
    tags.add('place-value');
    if (problem.level >= 3) tags.add('regrouping');
  }

  return { ...problem, meta: { ...problem.meta, tags: [...tags] } };
}
