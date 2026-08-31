/**
 * Small seeded PRNG (mulberry32). Generators are pure functions of
 * (level, seed), so any problem can be reproduced exactly from an attempt
 * record — which is what makes the attempt log useful for debugging and for
 * the parent dashboard.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const a = out[i] as T;
      const b = out[j] as T;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  bool(pTrue = 0.5): boolean {
    return this.next() < pTrue;
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Build a set of plausible multiple-choice distractors around a correct
 * numeric answer. Distractors are deliberately *near* misses so a guess is
 * genuinely a guess rather than obviously eliminable.
 */
export function numericChoices(
  rng: Rng,
  answer: number,
  count = 4,
  spread = 3,
): string[] {
  const set = new Set<number>([answer]);
  let guard = 0;
  while (set.size < count && guard++ < 100) {
    const delta = rng.int(1, spread) * (rng.bool() ? 1 : -1);
    const candidate = answer + delta;
    if (candidate >= 0) set.add(candidate);
  }
  // Fall back to widening if the answer is small and we ran out of room.
  let extra = answer + spread;
  while (set.size < count) set.add(++extra);
  return rng.shuffle([...set]).map(String);
}
