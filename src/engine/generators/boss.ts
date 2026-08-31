import { Rng } from '../rng';
import { barmodel, h, numberline } from '../hintBuilders';
import type { BossMeta, Problem, SkillId } from '../types';
import { tagProblem } from './index';

/** Reconstruct one chapter of a linked, deterministic field investigation. */
export function generateBossProblem(
  boss: BossMeta,
  skillId: SkillId,
  level: number,
): Problem {
  const rng = new Rng(boss.storySeed);
  const withinTwenty = skillId === 'add-20';
  const a = withinTwenty ? rng.int(4, 7) : rng.int(18, 42);
  const b = withinTwenty ? rng.int(3, 6) : rng.int(11, 25);
  const c = withinTwenty ? rng.int(2, 20 - a - b) : rng.int(6, 99 - a - b);
  const subtotal = a + b;
  const total = subtotal + c;
  const seed = boss.storySeed + boss.step;

  if (boss.step === 1) {
    return tagProblem({
      skillId,
      level,
      seed,
      flavor: 'dino',
      prompt: `The canyon team found ${a} amber samples and ${b} fossil samples. How many are in the first shipment?`,
      subPrompt: 'Boss investigation · Part 1 of 2',
      answer: String(subtotal),
      representation: { kind: 'numeric' },
      hints: [
        h('Put the two kinds of sample together.', barmodel(null, [a, b])),
        h(`Start at ${a} and make one jump of ${b}.`, numberline(a, subtotal)),
        h(`${a} + ${b} = ${subtotal}. The first shipment has ${subtotal} samples.`),
      ],
      meta: { operands: [a, b], op: '+', tags: ['boss', 'word-problem', 'subtotal'] },
    });
  }

  return tagProblem({
    skillId,
    level,
    seed,
    flavor: 'dino',
    prompt: `The shipment had ${a} amber samples and ${b} fossil samples. A rover brings ${c} more. How many samples must the lab catalogue altogether?`,
    subPrompt: 'Boss investigation · Part 2 of 2 · Use the subtotal from Part 1.',
    answer: String(total),
    representation: { kind: 'numeric' },
    hints: [
      h('First combine the two canyon finds. Then add the rover samples.', barmodel(null, [a, b, c])),
      h(`Your first subtotal was ${subtotal}. Start there and add ${c}.`, numberline(subtotal, total)),
      h(`${a} + ${b} = ${subtotal}, then ${subtotal} + ${c} = ${total}.`),
    ],
    meta: {
      operands: [a, b, c],
      op: '+',
      tags: ['boss', 'word-problem', 'multi-step', 'use-subtotal'],
    },
  });
}

