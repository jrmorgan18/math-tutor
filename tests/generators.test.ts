import { describe, expect, it } from 'vitest';
import { generate, GENERATORS } from '../src/engine/generators';
import { getSkill, SKILLS, topoSortedSkills } from '../src/engine/skills';
import type { Problem } from '../src/engine/types';

const SEEDS = 400;

/** Every (skill, level) pair, exercised across many seeds. */
function forEachProblem(fn: (p: Problem) => void) {
  for (const skill of SKILLS) {
    for (let level = 1; level <= skill.maxLevel; level++) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        fn(generate(skill.id, level, seed));
      }
    }
  }
}

describe('skill graph', () => {
  it('has a generator for every skill', () => {
    for (const skill of SKILLS) {
      expect(GENERATORS[skill.id], `missing generator: ${skill.id}`).toBeDefined();
    }
  });

  it('has no generators for skills that do not exist', () => {
    for (const id of Object.keys(GENERATORS)) {
      expect(() => getSkill(id)).not.toThrow();
    }
  });

  it('is acyclic and every prerequisite resolves', () => {
    expect(() => topoSortedSkills()).not.toThrow();
    for (const skill of SKILLS) {
      for (const req of skill.requires) {
        expect(() => getSkill(req), `${skill.id} requires ${req}`).not.toThrow();
      }
    }
  });

  it('declares a latency band for every level', () => {
    for (const skill of SKILLS) {
      expect(skill.latencyBandMs.length, skill.id).toBe(skill.maxLevel);
    }
  });
});

describe('problem shape', () => {
  it('always produces a prompt, an answer and a full hint ladder', () => {
    forEachProblem((p) => {
      expect(p.prompt.length, `${p.skillId} L${p.level} s${p.seed}`).toBeGreaterThan(0);
      expect(p.answer.length).toBeGreaterThan(0);
      // Nudge, strategy, worked solution. The UI depends on all three.
      expect(p.hints.length, `${p.skillId} hints`).toBeGreaterThanOrEqual(3);
      for (const hint of p.hints) expect(hint.text.trim().length).toBeGreaterThan(0);
    });
  });

  it('build-mode answers always fit inside the cells provided', () => {
    forEachProblem((p) => {
      if (p.representation.kind !== 'build') return;
      const answer = Number(p.answer);
      expect(Number.isInteger(answer), `${p.skillId} L${p.level} s${p.seed}`).toBe(true);
      expect(answer, `${p.skillId} L${p.level} s${p.seed}`).toBeGreaterThanOrEqual(0);
      // Otherwise the correct answer would be physically untappable.
      expect(
        answer,
        `${p.skillId} L${p.level} s${p.seed}: answer ${answer} > ${p.representation.max} cells`,
      ).toBeLessThanOrEqual(p.representation.max);
    });
  });

  it('column entry always has exactly as many boxes as the answer has digits', () => {
    forEachProblem((p) => {
      if (p.representation.kind !== 'columns') return;
      // One box too few makes the answer physically unenterable; one too many
      // leaves a box that can never be filled, so the submit never enables.
      expect(
        p.representation.columns,
        `${p.skillId} L${p.level} s${p.seed}: answer ${p.answer} in ${p.representation.columns} boxes`,
      ).toBe(p.answer.length);
      expect(p.representation.columns).toBeGreaterThan(0);
      expect(Number.isInteger(Number(p.answer))).toBe(true);
    });
  });

  it('number-line input always contains the answer on a real tick', () => {
    forEachProblem((p) => {
      if (p.representation.kind !== 'numberline') return;
      const { from, to, step } = p.representation;
      const n = Number(p.answer);
      expect(step, `${p.skillId} L${p.level} s${p.seed}`).toBeGreaterThan(0);
      expect(to, `${p.skillId} L${p.level} s${p.seed}`).toBeGreaterThan(from);
      expect(n, `${p.skillId} s${p.seed}: ${n} below line start ${from}`).toBeGreaterThanOrEqual(from);
      expect(n, `${p.skillId} s${p.seed}: ${n} past line end ${to}`).toBeLessThanOrEqual(to);
      // The answer has to land exactly on a tick, or it is untappable.
      expect(
        (n - from) % step,
        `${p.skillId} s${p.seed}: ${n} is not on a step-${step} tick from ${from}`,
      ).toBe(0);
      // Beyond this the ticks are too close together to hit on a tablet.
      expect((to - from) / step, `${p.skillId} s${p.seed}: too many ticks`).toBeLessThanOrEqual(20);
    });
  });

  it('never produces a negative or non-integer numeric answer', () => {
    forEachProblem((p) => {
      if (p.representation.kind !== 'numeric') return;
      const n = Number(p.answer);
      expect(Number.isInteger(n), `${p.skillId} L${p.level} -> ${p.answer}`).toBe(true);
      expect(n, `${p.skillId} L${p.level} s${p.seed}`).toBeGreaterThanOrEqual(0);
    });
  });

  it('always includes the answer among multiple-choice options, with no duplicates', () => {
    forEachProblem((p) => {
      if (p.representation.kind !== 'choice') return;
      const { options } = p.representation;
      expect(options, `${p.skillId} L${p.level} s${p.seed}`).toContain(p.answer);
      expect(new Set(options).size, `dupes in ${p.skillId} L${p.level} s${p.seed}`).toBe(
        options.length,
      );
      expect(options.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('is deterministic — same level and seed give an identical problem', () => {
    for (const skill of SKILLS) {
      for (let level = 1; level <= skill.maxLevel; level++) {
        const a = generate(skill.id, level, 12345);
        const b = generate(skill.id, level, 12345);
        expect(b).toEqual(a);
      }
    }
  });

  it('clamps out-of-range levels rather than throwing', () => {
    for (const skill of SKILLS) {
      expect(generate(skill.id, 0, 7).level).toBe(1);
      expect(generate(skill.id, 99, 7).level).toBe(skill.maxLevel);
    }
  });
});

describe('arithmetic is correct by construction', () => {
  it('recomputes every stated answer from its own operands', () => {
    forEachProblem((p) => {
      const ops = p.meta?.operands;
      const op = p.meta?.op;
      if (!ops || ops.length !== 2 || !op) return;
      // Division with a remainder reports either the quotient or the leftover,
      // so a bare a/b check does not apply; it is covered separately below.
      if (p.skillId === 'div-share' && p.level === 4) return;

      const [a, b] = ops as [number, number];
      const expected =
        op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : a / b;
      expect(
        Number(p.answer),
        `${p.skillId} L${p.level} s${p.seed}: ${a} ${op} ${b}`,
      ).toBe(expected);
    });
  });
});

describe('difficulty tiers mean what they claim', () => {
  const sample = (skillId: string, level: number) =>
    Array.from({ length: SEEDS }, (_, i) => generate(skillId, level, i + 1));

  it('add-20 level 1 never exceeds ten', () => {
    for (const p of sample('add-20', 1)) expect(Number(p.answer)).toBeLessThanOrEqual(10);
  });

  it('add-20 level 3 always bridges through ten', () => {
    for (const p of sample('add-20', 3)) {
      const [a, b] = p.meta!.operands as [number, number];
      expect((a % 10) + (b % 10), `${a}+${b}`).toBeGreaterThan(10);
    }
  });

  it('add-100 level 2 never requires a regroup', () => {
    for (const p of sample('add-100', 2)) {
      const [a, b] = p.meta!.operands as [number, number];
      expect((a % 10) + (b % 10), `${a}+${b}`).toBeLessThan(10);
    }
  });

  it('add-100 level 4 always requires a regroup and stays under 100', () => {
    for (const p of sample('add-100', 4)) {
      const [a, b] = p.meta!.operands as [number, number];
      expect((a % 10) + (b % 10), `${a}+${b}`).toBeGreaterThanOrEqual(10);
      expect(a + b).toBeLessThan(100);
    }
  });

  it('sub-100 level 2 never requires a borrow', () => {
    for (const p of sample('sub-100', 2)) {
      const [a, b] = p.meta!.operands as [number, number];
      expect(a % 10, `${a}-${b}`).toBeGreaterThanOrEqual(b % 10);
    }
  });

  it('sub-100 level 4 always requires a borrow', () => {
    for (const p of sample('sub-100', 4)) {
      const [a, b] = p.meta!.operands as [number, number];
      expect(a % 10, `${a}-${b}`).toBeLessThan(b % 10);
    }
  });

  it('div-share levels 1 to 3 always divide exactly', () => {
    for (const level of [1, 2, 3]) {
      for (const p of sample('div-share', level)) {
        const [a, b] = p.meta!.operands as [number, number];
        expect(a % b, `${a}/${b}`).toBe(0);
      }
    }
  });

  it('div-share level 4 always leaves a genuine remainder', () => {
    for (const p of sample('div-share', 4)) {
      const [a, b] = p.meta!.operands as [number, number];
      expect(a % b, `${a}/${b}`).toBeGreaterThan(0);
      const answer = Number(p.answer);
      // The question asks for either the quotient or the leftover.
      expect([Math.floor(a / b), a % b]).toContain(answer);
    }
  });

  it('word problems never ask for a negative or fractional result', () => {
    for (let level = 1; level <= 4; level++) {
      for (const p of sample('word-1step', level)) {
        const n = Number(p.answer);
        expect(Number.isInteger(n), p.prompt).toBe(true);
        expect(n, p.prompt).toBeGreaterThan(0);
      }
    }
  });

  it('multiplication fact levels stay inside the intended tables', () => {
    for (const p of sample('mult-2-5-10', 3)) {
      const [a, b] = p.meta!.operands as [number, number];
      expect([2, 5, 10].includes(a) || [2, 5, 10].includes(b), `${a}x${b}`).toBe(true);
    }
    for (const p of sample('mult-3-4', 3)) {
      const [a, b] = p.meta!.operands as [number, number];
      expect([3, 4].includes(a) || [3, 4].includes(b), `${a}x${b}`).toBe(true);
    }
  });

  it('function machine inputs never drive a subtraction below zero', () => {
    for (let level = 1; level <= 4; level++) {
      for (const p of sample('function-machine', level)) {
        const numbers = [...p.prompt.matchAll(/\d+/g), ...(p.subPrompt ?? '').matchAll(/\d+/g)];
        for (const m of numbers) expect(Number(m[0])).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
