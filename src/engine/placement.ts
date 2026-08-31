import { randomSeed } from './rng';
import { initialSkillStates } from './mastery';
import type { SkillId, SkillState, StrandId } from './types';

/**
 * Adaptive placement.
 *
 * Each strand has a ladder of (skill, level) probes ordered by genuine
 * difficulty. A staircase walks the ladder — up on a correct answer, down on a
 * wrong one — and stops after a few reversals. That finds his level in ~5
 * questions per strand instead of the ~20 a fixed test would need, which
 * matters enormously: a long test in front of a six-year-old spends all the
 * goodwill before the app has earned any.
 *
 * The result is only a *starting guess*. Real placement happens continuously
 * from actual practice, so this does not need to be precise — it needs to be
 * short and roughly right.
 */

export interface Probe {
  skillId: SkillId;
  level: number;
}

const LADDERS: Record<string, Probe[]> = {
  number: [
    { skillId: 'place-value-3', level: 1 },
    { skillId: 'skip-count', level: 1 },
    { skillId: 'place-value-3', level: 2 },
    { skillId: 'skip-count', level: 2 },
    { skillId: 'compare-numbers', level: 1 },
    { skillId: 'place-value-3', level: 3 },
    { skillId: 'compare-numbers', level: 2 },
    { skillId: 'skip-count', level: 3 },
    { skillId: 'place-value-3', level: 4 },
    { skillId: 'compare-numbers', level: 3 },
    { skillId: 'skip-count', level: 4 },
  ],
  addsub: [
    { skillId: 'add-20', level: 1 },
    { skillId: 'sub-20', level: 1 },
    { skillId: 'add-20', level: 2 },
    { skillId: 'sub-20', level: 2 },
    { skillId: 'add-20', level: 3 },
    { skillId: 'missing-addend', level: 2 },
    { skillId: 'sub-20', level: 3 },
    { skillId: 'add-100', level: 1 },
    { skillId: 'sub-100', level: 1 },
    { skillId: 'add-100', level: 2 },
    { skillId: 'sub-100', level: 2 },
    { skillId: 'missing-addend', level: 3 },
    { skillId: 'add-100', level: 3 },
    { skillId: 'sub-100', level: 3 },
    { skillId: 'add-100', level: 4 },
    { skillId: 'missing-addend', level: 4 },
    { skillId: 'sub-100', level: 4 },
  ],
  multdiv: [
    { skillId: 'mult-concept', level: 1 },
    { skillId: 'mult-concept', level: 2 },
    { skillId: 'mult-2-5-10', level: 1 },
    { skillId: 'mult-concept', level: 3 },
    { skillId: 'mult-2-5-10', level: 2 },
    { skillId: 'div-share', level: 1 },
    { skillId: 'mult-2-5-10', level: 3 },
    { skillId: 'mult-3-4', level: 1 },
    { skillId: 'div-share', level: 2 },
    { skillId: 'mult-3-4', level: 2 },
    { skillId: 'div-share', level: 3 },
    { skillId: 'mult-3-4', level: 3 },
    { skillId: 'div-share', level: 4 },
  ],
  reasoning: [
    { skillId: 'function-machine', level: 1 },
    { skillId: 'function-machine', level: 2 },
    { skillId: 'word-1step', level: 1 },
    { skillId: 'word-1step', level: 2 },
    { skillId: 'function-machine', level: 3 },
    { skillId: 'word-1step', level: 3 },
    { skillId: 'function-machine', level: 4 },
    { skillId: 'word-1step', level: 4 },
  ],
  fractions: [
    { skillId: 'fraction-parts', level: 1 },
    { skillId: 'fraction-parts', level: 2 },
    { skillId: 'fraction-of-set', level: 1 },
    { skillId: 'fraction-parts', level: 3 },
    { skillId: 'fraction-of-set', level: 2 },
    { skillId: 'fraction-parts', level: 4 },
    { skillId: 'fraction-of-set', level: 3 },
    { skillId: 'fraction-of-set', level: 4 },
  ],
  measurement: [
    { skillId: 'measure-length', level: 1 },
    { skillId: 'time-clock', level: 1 },
    { skillId: 'money-count', level: 1 },
    { skillId: 'time-clock', level: 2 },
    { skillId: 'money-count', level: 2 },
    { skillId: 'measure-length', level: 2 },
    { skillId: 'time-clock', level: 3 },
    { skillId: 'money-count', level: 3 },
    { skillId: 'measure-length', level: 3 },
    { skillId: 'time-clock', level: 4 },
    { skillId: 'money-count', level: 4 },
  ],
  geometry: [
    { skillId: 'shapes-2d', level: 1 },
    { skillId: 'shapes-2d', level: 2 },
    { skillId: 'shapes-2d', level: 3 },
    { skillId: 'perimeter', level: 1 },
    { skillId: 'shapes-2d', level: 4 },
    { skillId: 'perimeter', level: 2 },
    { skillId: 'perimeter', level: 3 },
  ],
};

/**
 * Strands the placement test actually probes.
 *
 * Deliberately *not* every strand. Each one adds up to six questions, and a
 * placement test that runs past ~12 minutes spends all the goodwill before the
 * app has earned any. Fractions, measurement and geometry are genuinely new
 * material rather than something he arrives with, so starting them at level 1
 * is honest rather than condescending — and the per-skill staircase reaches
 * his real level within a session or two anyway. Their ladders above still
 * exist for the parent dashboard's difficulty explanation.
 */
export const PLACEMENT_STRANDS: StrandId[] = [
  'addsub',
  'number',
  'multdiv',
  'reasoning',
];

/**
 * Entry point per strand: start a little above the floor rather than at it.
 * He is described as ahead of his year group, and opening with trivially easy
 * questions reads as condescending even to a six-year-old.
 */
const START_FRACTION = 0.35;
/** Hard cap on probes per strand, so the whole test stays inside ~12 minutes. */
const MAX_PROBES_PER_STRAND = 6;
/** Direction changes before we accept we have bracketed his level. */
const MAX_REVERSALS = 2;

export interface StrandRun {
  strand: StrandId;
  index: number;
  asked: number;
  reversals: number;
  lastCorrect: boolean | null;
  /** Highest ladder index answered correctly, -1 if none. */
  ceiling: number;
  done: boolean;
  /** Exact probes survive reloads and become explicit placement evidence. */
  history: Array<Probe & { correct: boolean }>;
}

export function startStrand(strand: StrandId): StrandRun {
  const ladder = LADDERS[strand] ?? [];
  return {
    strand,
    index: Math.floor(ladder.length * START_FRACTION),
    asked: 0,
    reversals: 0,
    lastCorrect: null,
    ceiling: -1,
    done: ladder.length === 0,
    history: [],
  };
}

export function currentProbe(run: StrandRun): Probe | null {
  const ladder = LADDERS[run.strand];
  if (!ladder || run.done) return null;
  return ladder[Math.min(Math.max(run.index, 0), ladder.length - 1)] ?? null;
}

/** Advance the staircase after one answer. */
export function advanceStrand(run: StrandRun, correct: boolean): StrandRun {
  const ladder = LADDERS[run.strand] ?? [];
  const probe = currentProbe(run);
  const next: StrandRun = {
    ...run,
    asked: run.asked + 1,
    history: probe ? [...run.history, { ...probe, correct }] : [...run.history],
  };

  if (correct) next.ceiling = Math.max(run.ceiling, run.index);

  if (run.lastCorrect !== null && run.lastCorrect !== correct) {
    next.reversals = run.reversals + 1;
  }
  next.lastCorrect = correct;

  // Two rungs at a time: the ladder is fine-grained, and single steps would
  // burn the question budget before reaching his actual level.
  next.index = correct
    ? Math.min(ladder.length - 1, run.index + 2)
    : Math.max(0, run.index - 2);

  if (
    next.asked >= MAX_PROBES_PER_STRAND ||
    next.reversals >= MAX_REVERSALS ||
    (correct && run.index >= ladder.length - 1) ||
    (!correct && run.index === 0)
  ) {
    next.done = true;
  }

  return next;
}

export function totalProbeEstimate(): number {
  return PLACEMENT_STRANDS.length * MAX_PROBES_PER_STRAND;
}

/**
 * Turn finished staircases into a starting profile.
 *
 * Everything at or below the measured ceiling is opened up and set to the
 * level he demonstrated, bypassing the normal prerequisite gate so he starts
 * at the right difficulty on day one. Crucially, nothing is marked
 * `proficient` — a five-question probe is not evidence of mastery, so real
 * proficiency still has to be earned through practice, and downstream unlocks
 * above the boundary still require it.
 */
export function seedFromPlacement(runs: StrandRun[]): Record<SkillId, SkillState> {
  const states = initialSkillStates();

  for (const run of runs) {
    const ladder = LADDERS[run.strand];
    if (!ladder) continue;

    // A strand where he got nothing right still opens its first rung — the
    // app must never present him with an empty strand.
    const ceiling = Math.max(run.ceiling, 0);

    for (let i = 0; i <= Math.min(ceiling, ladder.length - 1); i++) {
      const probe = ladder[i];
      if (!probe) continue;
      const state = states[probe.skillId];
      if (!state) continue;
      states[probe.skillId] = {
        ...state,
        unlocked: true,
        level: Math.max(state.level, probe.level),
        placementLevel: Math.max(state.placementLevel ?? 1, probe.level),
      };
    }

    // Open the next rung too, so there is always somewhere to grow into.
    const nextProbe = ladder[Math.min(ceiling + 1, ladder.length - 1)];
    if (nextProbe) {
      const state = states[nextProbe.skillId];
      if (state) states[nextProbe.skillId] = { ...state, unlocked: true };
    }

    // Only questions actually shown are marked seen; inferred lower rungs stay
    // separate from real practice and cannot masquerade as mastered evidence.
    for (const evidence of run.history) {
      const state = states[evidence.skillId];
      if (!state) continue;
      states[evidence.skillId] = {
        ...state,
        placementSeen: true,
        placementLevel: evidence.correct
          ? Math.max(state.placementLevel ?? 1, evidence.level)
          : state.placementLevel,
      };
    }
  }

  return states;
}

/** All probes for a strand, used by the parent dashboard to explain placement. */
export function ladderFor(strand: StrandId): Probe[] {
  return LADDERS[strand] ?? [];
}

export function probeSeed(): number {
  return randomSeed();
}
