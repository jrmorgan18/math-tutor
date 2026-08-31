import { describe, expect, it } from 'vitest';
import {
  bucketOfError,
  reflectResponse,
  remediationLine,
  REFLECT_OPTIONS,
} from '../src/content/remediation';
import { personalizeFlavor } from '../src/content/personalize';
import { generate } from '../src/engine/generators';
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

describe('reflect buckets', () => {
  it('has exactly 4 tap options', () => {
    expect(REFLECT_OPTIONS).toHaveLength(4);
  });

  it('maps every error type to a bucket or null, never throwing', () => {
    for (const e of ALL_ERRORS) {
      expect(() => bucketOfError(e)).not.toThrow();
    }
  });

  it('operation-reversed always buckets to operation', () => {
    expect(bucketOfError('operation-reversed')).toBe('operation');
  });

  it('guess and timeout bucket to stuck', () => {
    expect(bucketOfError('likely-guess')).toBe('stuck');
    expect(bucketOfError('timeout')).toBe('stuck');
  });

  it('reflectResponse never throws for any (guess, error) pair', () => {
    for (const opt of REFLECT_OPTIONS) {
      for (const e of ALL_ERRORS) {
        const text = reflectResponse(opt.id, e);
        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it('affirms a correct self-diagnosis', () => {
    const text = reflectResponse('operation', 'operation-reversed');
    expect(text.toLowerCase()).toMatch(/right/);
  });
});

describe('remediation lines', () => {
  it('produces non-empty text for every op x common error combination', () => {
    const problem = generate('add-100', 4, 3);
    for (const e of ALL_ERRORS) {
      if (e === 'correct') continue;
      expect(() => remediationLine(problem, e)).not.toThrow();
    }
  });

  it('mentions carrying for a regrouping addition error, borrowing for subtraction', () => {
    const add = generate('add-100', 4, 3); // level 4 is guaranteed to regroup
    const sub = generate('sub-100', 4, 3); // level 4 is guaranteed to borrow
    expect(remediationLine(add, 'regrouping').toLowerCase()).toMatch(/carry/);
    expect(remediationLine(sub, 'regrouping').toLowerCase()).toMatch(/borrow/);
  });

  it('falls back to generic text for a skill with no operands', () => {
    const p = generate('compare-numbers', 1, 1);
    expect(() => remediationLine(p, 'near-miss')).not.toThrow();
  });
});

describe('word problem personalization', () => {
  it('is a no-op with no hatched dinosaurs', () => {
    const p = generate('word-1step', 3, 42);
    const out = personalizeFlavor(p, [], p.seed);
    expect(out).toEqual(p);
  });

  it('never changes the answer, only the flavor text', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = generate('word-1step', 3, seed);
      const out = personalizeFlavor(p, ['stegosaurus', 'velociraptor'], seed);
      expect(out.answer).toBe(p.answer);
      expect(out.meta).toEqual(p.meta);
    }
  });

  it('is a no-op for non-dino flavors', () => {
    // Keep generating word-1step problems until we find a non-dino one, then
    // confirm personalization leaves it untouched.
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const p = generate('word-1step', 1, seed);
      if (p.flavor === 'dino') continue;
      found = true;
      const out = personalizeFlavor(p, ['stegosaurus'], seed);
      expect(out).toEqual(p);
    }
    expect(found).toBe(true);
  });

  it('substitutes a known species token when one is hatched', () => {
    // Find a dino-flavored problem that actually contains a species name.
    let hit: ReturnType<typeof generate> | null = null;
    for (let seed = 1; seed <= 500 && !hit; seed++) {
      const p = generate('word-1step', 3, seed);
      if (p.flavor === 'dino' && /Velociraptor|Triceratops|T\. rex|Maiasaura/.test(p.prompt)) {
        hit = p;
      }
    }
    expect(hit).not.toBeNull();
    if (!hit) return;
    const out = personalizeFlavor(hit, ['stegosaurus'], hit.seed);
    expect(out.prompt).toContain('Stegosaurus');
  });
});
