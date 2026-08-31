import { describe, expect, it } from 'vitest';
import { generate } from '../src/engine/generators';
import { SKILLS } from '../src/engine/skills';
import { computeJumps, MAX_DOTS } from '../src/engine/hintBuilders';
import { remediationHint } from '../src/content/remediation';
import type { HintVisual, Problem } from '../src/engine/types';

const SEEDS = 250;

function everyVisual(fn: (v: HintVisual, p: Problem, where: string) => void) {
  for (const skill of SKILLS) {
    for (let level = 1; level <= skill.maxLevel; level++) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const p = generate(skill.id, level, seed);
        p.hints.forEach((hint, i) => {
          if (hint.visual) fn(hint.visual, p, `${skill.id} L${level} s${seed} hint${i}`);
        });
        if (p.questionVisual) fn(p.questionVisual, p, `${skill.id} L${level} s${seed} question`);
      }
    }
  }
}

/**
 * The central guarantee: a picture must never disagree with the maths it is
 * illustrating. A visual showing wrong numbers is worse than no visual at
 * all — it would actively teach the wrong thing, with more authority than
 * prose because he can see it.
 */
describe('hint visuals are arithmetically sound', () => {
  it('stacked visuals state a correct sum when they state one at all', () => {
    everyVisual((v, _p, where) => {
      if (v.kind !== 'stacked' || v.result === undefined) return;
      const expected = v.op === '+' ? v.top + v.bottom : v.top - v.bottom;
      expect(v.result, `${where}: ${v.top} ${v.op} ${v.bottom}`).toBe(expected);
    });
  });

  it('stacked visuals never show a negative result', () => {
    everyVisual((v, _p, where) => {
      if (v.kind !== 'stacked') return;
      if (v.op === '-') expect(v.top, where).toBeGreaterThanOrEqual(v.bottom);
      if (v.result !== undefined) expect(v.result, where).toBeGreaterThanOrEqual(0);
    });
  });

  it('bar models add up — known parts never exceed a known whole', () => {
    everyVisual((v, _p, where) => {
      if (v.kind !== 'barmodel') return;
      const known = v.parts.filter((x): x is number => x !== null);
      const sum = known.reduce((a, b) => a + b, 0);
      if (v.whole !== null) {
        // With every part known, the parts must exactly make the whole.
        if (known.length === v.parts.length) {
          expect(sum, `${where}: parts ${v.parts} vs whole ${v.whole}`).toBe(v.whole);
        } else {
          expect(sum, `${where}: known parts exceed whole`).toBeLessThanOrEqual(v.whole);
        }
      }
      expect(v.parts.length, where).toBeGreaterThan(0);
      for (const p of known) expect(p, where).toBeGreaterThanOrEqual(0);
    });
  });

  it('arrays and groups are positive and renderable', () => {
    everyVisual((v, _p, where) => {
      if (v.kind === 'array') {
        expect(v.rows, where).toBeGreaterThan(0);
        expect(v.cols, where).toBeGreaterThan(0);
        // Guard against a visual so large it stops being a picture you can
        // grasp and becomes a wall you have to count.
        expect(v.rows * v.cols, `${where}: array too large`).toBeLessThanOrEqual(MAX_DOTS);
      }
      if (v.kind === 'groups') {
        expect(v.groups, where).toBeGreaterThan(0);
        expect(v.per, where).toBeGreaterThan(0);
        expect(v.groups * v.per, `${where}: groups too large`).toBeLessThanOrEqual(MAX_DOTS);
      }
    });
  });

  it('ten-frames never overflow the two frames they are drawn in', () => {
    everyVisual((v, _p, where) => {
      if (v.kind !== 'tenframe') return;
      expect(v.a, where).toBeGreaterThanOrEqual(0);
      expect(v.b, where).toBeGreaterThanOrEqual(0);
      expect(v.a + v.b, `${where}: ${v.a}+${v.b} exceeds 20`).toBeLessThanOrEqual(20);
    });
  });

  it('number lines never run negative', () => {
    everyVisual((v, _p, where) => {
      if (v.kind !== 'numberline') return;
      expect(v.from, where).toBeGreaterThanOrEqual(0);
      expect(v.to, where).toBeGreaterThanOrEqual(0);
    });
  });

  it('fraction pictures never shade more pieces than exist', () => {
    everyVisual((v, _p, where) => {
      if (v.kind !== 'fractionbar') return;
      // A bar showing 5 of 4 pieces would teach that a fraction can exceed its
      // own whole, which is precisely the confusion this strand must avoid.
      expect(v.parts, where).toBeGreaterThan(1);
      expect(v.shaded, where).toBeGreaterThanOrEqual(0);
      expect(v.shaded, `${where}: ${v.shaded}/${v.parts}`).toBeLessThanOrEqual(v.parts);
      // Beyond this the wedges are too thin for a child to count.
      expect(v.parts, `${where}: too many pieces to read`).toBeLessThanOrEqual(12);
      if (v.compare) {
        expect(v.compare.shaded, where).toBeLessThanOrEqual(v.compare.parts);
        expect(v.compare.parts, where).toBeGreaterThan(1);
      }
    });
  });

  it('clock faces show a readable, real time', () => {
    everyVisual((v, _p, where) => {
      if (v.kind !== 'clock') return;
      // 12-hour face: 1..12, never a 0 o'clock.
      expect(v.hour, where).toBeGreaterThanOrEqual(1);
      expect(v.hour, where).toBeLessThanOrEqual(12);
      expect(v.minute, where).toBeGreaterThanOrEqual(0);
      expect(v.minute, where).toBeLessThan(60);
    });
  });

  it('coin pictures only use real coins and state a correct total', () => {
    const REAL = [1, 5, 10, 25, 50];
    everyVisual((v, _p, where) => {
      if (v.kind !== 'coins') return;
      expect(v.values.length, where).toBeGreaterThan(0);
      for (const c of v.values) expect(REAL, `${where}: ${c}¢ is not a coin`).toContain(c);
      if (v.total !== undefined) {
        expect(v.total, `${where}: stated total disagrees with the coins drawn`).toBe(
          v.values.reduce((a, b) => a + b, 0),
        );
      }
    });
  });

  it('polygons are drawable and their side labels match their sides', () => {
    everyVisual((v, _p, where) => {
      if (v.kind !== 'shape') return;
      expect(v.sides, where).toBeGreaterThanOrEqual(3);
      if (v.sideLabels) {
        // A label count that disagrees with the side count would silently
        // drop or duplicate an edge in the perimeter picture.
        expect(v.sideLabels.length, `${where}: ${v.sideLabels.length} labels on ${v.sides} sides`).toBe(
          v.sides,
        );
        for (const s of v.sideLabels) expect(s, where).toBeGreaterThan(0);
      }
    });
  });

  it('perimeter side labels always sum to the stated answer', () => {
    // The one place a picture can contradict the answer outright.
    for (let level = 1; level <= 3; level++) {
      for (let seed = 1; seed <= 200; seed++) {
        const p = generate('perimeter', level, seed);
        const v = p.questionVisual;
        if (v?.kind !== 'shape' || !v.sideLabels) continue;
        const sum = v.sideLabels.reduce((a, b) => a + b, 0);
        expect(sum, `perimeter L${level} s${seed}: sides ${v.sideLabels} vs answer ${p.answer}`).toBe(
          Number(p.answer),
        );
      }
    }
  });

  it('a shape called a rectangle is never drawn as a square', () => {
    // The renderer draws four-sided shapes to the proportions of their side
    // labels. If the generator hands it equal sides, the picture shows a
    // square while the hint says "the opposite sides match" — which reads as
    // "all four are the same", the exact opposite of the lesson.
    for (let seed = 1; seed <= 300; seed++) {
      const p = generate('perimeter', 2, seed);
      const v = p.questionVisual;
      if (v?.kind !== 'shape' || !v.sideLabels) continue;
      const [w, hgt] = v.sideLabels as [number, number];
      expect(w, `perimeter L2 s${seed}: ${w}x${hgt} is a square, not a rectangle`).not.toBe(hgt);
      // Opposite sides must still match, or it is not a rectangle at all.
      expect(v.sideLabels[2]).toBe(w);
      expect(v.sideLabels[3]).toBe(hgt);
    }
  });

  it('rulers only draw positive lengths', () => {
    everyVisual((v, _p, where) => {
      if (v.kind !== 'ruler') return;
      expect(v.lengths.length, where).toBeGreaterThan(0);
      for (const l of v.lengths) expect(l, where).toBeGreaterThan(0);
    });
  });

  it('every skill offers at least one visual somewhere in its ladder', () => {
    for (const skill of SKILLS) {
      let found = false;
      for (let level = 1; level <= skill.maxLevel && !found; level++) {
        for (let seed = 1; seed <= 40 && !found; seed++) {
          const p = generate(skill.id, level, seed);
          if (p.hints.some((x) => x.visual) || p.questionVisual) found = true;
        }
      }
      expect(found, `${skill.id} has no visual hints at all`).toBe(true);
    }
  });
});

describe('number line jump decomposition', () => {
  it('jumps always sum to the gap', () => {
    for (let from = 0; from <= 60; from++) {
      for (let to = from; to <= from + 60; to++) {
        const jumps = computeJumps(from, to);
        const sum = jumps.reduce((a, b) => a + b, 0);
        expect(sum, `${from} -> ${to}`).toBe(to - from);
      }
    }
  });

  it('never emits a zero or negative jump', () => {
    for (let from = 0; from <= 40; from++) {
      for (let to = from; to <= from + 40; to++) {
        for (const j of computeJumps(from, to)) expect(j).toBeGreaterThan(0);
      }
    }
  });

  it('bridges through the next ten on a large forward jump', () => {
    // 47 -> 82 should hop 3 (to 50), then 30, then 2 — the strategy a child
    // is actually taught, rather than one opaque leap of 35.
    expect(computeJumps(47, 82)).toEqual([3, 30, 2]);
    expect(computeJumps(45, 54)).toEqual([9]);
  });
});

describe('remediation visuals match the problem', () => {
  it('never produces a stacked visual with a wrong result', () => {
    const errors = ['regrouping', 'operation-reversed', 'off-by-one', 'near-miss'] as const;
    for (const skill of SKILLS) {
      for (let level = 1; level <= skill.maxLevel; level++) {
        for (let seed = 1; seed <= 60; seed++) {
          const p = generate(skill.id, level, seed);
          for (const e of errors) {
            const v = remediationHint(p, e).visual;
            if (v?.kind === 'stacked' && v.result !== undefined) {
              const expected = v.op === '+' ? v.top + v.bottom : v.top - v.bottom;
              expect(v.result, `${skill.id} L${level} ${e}`).toBe(expected);
            }
            if (v?.kind === 'barmodel' && v.whole !== null) {
              const known = v.parts.filter((x): x is number => x !== null);
              if (known.length === v.parts.length) {
                expect(known.reduce((a, b) => a + b, 0), `${skill.id} L${level} ${e}`).toBe(v.whole);
              }
            }
          }
        }
      }
    }
  });
});
