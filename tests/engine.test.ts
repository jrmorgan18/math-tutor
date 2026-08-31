import { describe, expect, it } from 'vitest';
import {
  applyAttempt,
  initialSkillStates,
  progressToward,
  propagateUnlocks,
} from '../src/engine/mastery';
import {
  buildMissionChoices,
  buildSession,
  dominantMisconception,
  retargetPlannedItem,
} from '../src/engine/scheduler';
import { generateBossProblem } from '../src/engine/generators/boss';
import {
  advanceStrand,
  currentProbe,
  PLACEMENT_STRANDS,
  seedFromPlacement,
  startStrand,
} from '../src/engine/placement';
import { classify } from '../src/engine/errors';
import { generate } from '../src/engine/generators';
import { getSkill, SKILLS } from '../src/engine/skills';
import type { Attempt, SessionSlot, SkillId, SkillState } from '../src/engine/types';

const DAY = 86_400_000;

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    id: 'a',
    skillId: 'add-20',
    level: 1,
    seed: 1,
    given: '5',
    expected: '5',
    correct: true,
    errorType: 'correct',
    latencyMs: 2000,
    hintsUsed: 0,
    slot: 'working' as SessionSlot,
    at: Date.now(),
    ...over,
  };
}

describe('mastery model', () => {
  it('levels up after a run of fast correct answers', () => {
    let state = initialSkillStates()['add-20'] as SkillState;
    for (let i = 0; i < 3; i++) {
      state = applyAttempt(state, attempt({ latencyMs: 1500 }));
    }
    expect(state.level).toBe(2);
  });

  it('does not level up a fluency skill on slow answers', () => {
    let state = initialSkillStates()['add-20'] as SkillState;
    for (let i = 0; i < 5; i++) {
      state = applyAttempt(state, attempt({ latencyMs: 30_000 }));
    }
    expect(state.level).toBe(1);
  });

  it('drops a level after two misses in a row', () => {
    let state = initialSkillStates()['add-100'] as SkillState;
    state = { ...state, level: 3 };
    state = applyAttempt(state, attempt({ skillId: 'add-100', correct: false }));
    state = applyAttempt(state, attempt({ skillId: 'add-100', correct: false }));
    expect(state.level).toBe(2);
  });

  it('never penalises a missed stretch item', () => {
    let state = initialSkillStates()['add-100'] as SkillState;
    state = { ...state, level: 3, accuracy: 0.9, missStreak: 1, streak: 2 };
    const before = { ...state };

    state = applyAttempt(
      state,
      attempt({ skillId: 'add-100', correct: false, slot: 'stretch' }),
    );

    expect(state.accuracy).toBe(before.accuracy);
    expect(state.level).toBe(before.level);
    expect(state.missStreak).toBe(before.missStreak);
    expect(state.dueAt).toBe(before.dueAt);
    // The attempt log records the exploration; mastery evidence is untouched.
    expect(state.attempts).toBe(before.attempts);
  });

  it('does not inflate a review interval with repeated same-day practice', () => {
    let state = initialSkillStates()['add-100'] as SkillState;
    const start = Date.now();
    state = applyAttempt(state, attempt({ skillId: 'add-100' }), start);
    const firstDue = state.dueAt;
    for (let i = 1; i <= 8; i++) {
      state = applyAttempt(state, attempt({ skillId: 'add-100' }), start + i * 60_000);
    }
    expect(state.intervalDays).toBe(1);
    expect(state.dueAt).toBe(firstDue);

    state = applyAttempt(
      state,
      attempt({ skillId: 'add-100', slot: 'review' }),
      firstDue,
    );
    expect(state.intervalDays).toBe(3);
  });

  it('caps spaced review intervals and advances only when due', () => {
    let state = initialSkillStates()['add-100'] as SkillState;
    let now = Date.now();
    state = applyAttempt(state, attempt({ skillId: 'add-100' }), now);
    for (let i = 0; i < 8; i++) {
      now = state.dueAt;
      state = applyAttempt(state, attempt({ skillId: 'add-100', slot: 'review' }), now);
    }
    expect(state.intervalDays).toBe(35);
  });

  it('keeps supported success separate and requires unaided work to level up', () => {
    let state = initialSkillStates()['add-20'] as SkillState;
    for (let i = 0; i < 3; i++) {
      state = applyAttempt(state, attempt({ hintsUsed: 1, latencyMs: 1500 }));
    }
    expect(state.level).toBe(1);
    expect(state.streak).toBe(0);
    expect(state.supportedAttempts).toBe(3);
    expect(state.independentAttempts).toBe(0);

    for (let i = 0; i < 3; i++) {
      state = applyAttempt(state, attempt({ latencyMs: 1500 }));
    }
    expect(state.level).toBe(2);
    expect(state.independentAttempts).toBe(3);
  });

  it('records whether a retry transferred successfully', () => {
    let state = initialSkillStates()['add-20'] as SkillState;
    state = applyAttempt(state, attempt({ retry: true, correct: false }));
    state = applyAttempt(state, attempt({ retry: true, correct: true }));
    expect(state.retryAttempts).toBe(2);
    expect(state.retrySuccesses).toBe(1);
  });

  it('does credit a correct stretch item', () => {
    let state = initialSkillStates()['add-100'] as SkillState;
    const before = state.accuracy;
    state = applyAttempt(
      state,
      attempt({ skillId: 'add-100', correct: true, slot: 'stretch' }),
    );
    expect(state.accuracy).not.toBe(before);
    expect(state.accuracy).toBeGreaterThan(0);
  });

  it('scores a hinted success below an unaided one', () => {
    const base = initialSkillStates()['add-100'] as SkillState;
    const unaided = applyAttempt(base, attempt({ skillId: 'add-100' }));
    const hinted = applyAttempt(base, attempt({ skillId: 'add-100', hintsUsed: 2 }));
    expect(hinted.accuracy).toBeLessThan(unaided.accuracy as number);
    expect(hinted.accuracy).toBeGreaterThan(0);
  });

  it('requires top level, accuracy and volume before claiming proficiency', () => {
    let state = initialSkillStates()['add-20'] as SkillState;
    for (let i = 0; i < 7; i++) {
      state = applyAttempt(state, attempt({ latencyMs: 1500 }));
    }
    expect(state.level).toBe(getSkill('add-20').maxLevel);
    // Level is maxed but the attempt floor is not yet met.
    expect(state.attempts).toBeLessThan(8);
    expect(state.proficient).toBe(false);

    state = applyAttempt(state, attempt({ latencyMs: 1500 }));
    expect(state.proficient).toBe(true);
  });

  it('only claims mastery after spaced retention checks', () => {
    let state = initialSkillStates()['add-20'] as SkillState;
    let now = Date.now();
    for (let i = 0; i < 10; i++) {
      state = applyAttempt(state, attempt({ latencyMs: 1500 }), now);
      now += 60_000;
    }
    expect(state.proficient).toBe(true);
    expect(state.mastered).toBe(false);

    // Two successful reviews, each more than a week later.
    now += 8 * DAY;
    state = applyAttempt(state, attempt({ latencyMs: 1500 }), now);
    expect(state.mastered).toBe(false);
    now += 20 * DAY;
    state = applyAttempt(state, attempt({ latencyMs: 1500 }), now);
    expect(state.mastered).toBe(true);
  });

  it('resets the review schedule and retention on a miss', () => {
    let state = initialSkillStates()['add-100'] as SkillState;
    state = { ...state, retentionChecks: 2, intervalDays: 16 };
    const now = Date.now();
    state = applyAttempt(state, attempt({ skillId: 'add-100', correct: false }), now);
    expect(state.retentionChecks).toBe(0);
    expect(state.intervalDays).toBe(1);
    expect(state.dueAt).toBe(now + DAY);
  });

  it('progressToward stays within 0..1', () => {
    for (const skill of SKILLS) {
      const state = initialSkillStates()[skill.id] as SkillState;
      const maxed: SkillState = {
        ...state,
        level: skill.maxLevel,
        accuracy: 1,
        attempts: 50,
      };
      expect(progressToward(state)).toBeGreaterThanOrEqual(0);
      expect(progressToward(maxed)).toBeLessThanOrEqual(1);
    }
  });
});

describe('unlock propagation', () => {
  it('opens a skill only once every prerequisite is proficient', () => {
    let states = initialSkillStates();
    expect(states['sub-20']?.unlocked).toBe(false);

    states = propagateUnlocks({
      ...states,
      'add-20': { ...(states['add-20'] as SkillState), proficient: true },
    });
    expect(states['sub-20']?.unlocked).toBe(true);
    // add-100 also needs place-value-3, which is not proficient yet.
    expect(states['add-100']?.unlocked).toBe(false);

    states = propagateUnlocks({
      ...states,
      'place-value-3': { ...(states['place-value-3'] as SkillState), proficient: true },
    });
    expect(states['add-100']?.unlocked).toBe(true);
  });

  it('cascades through a chain in a single pass', () => {
    let states = initialSkillStates();
    states = {
      ...states,
      'skip-count': { ...(states['skip-count'] as SkillState), proficient: true },
      'mult-concept': { ...(states['mult-concept'] as SkillState), proficient: true },
      'mult-2-5-10': { ...(states['mult-2-5-10'] as SkillState), proficient: true },
    };
    states = propagateUnlocks(states);
    expect(states['mult-3-4']?.unlocked).toBe(true);
    expect(states['div-share']?.unlocked).toBe(true);
  });

  it('roots of the graph start unlocked, others do not', () => {
    const states = initialSkillStates();
    for (const skill of SKILLS) {
      expect(states[skill.id]?.unlocked, skill.id).toBe(skill.requires.length === 0);
    }
  });
});

describe('session scheduler', () => {
  /** A profile a few weeks in: some proficiency, a working set, some due. */
  function realisticStates(): Record<SkillId, SkillState> {
    let states = initialSkillStates();
    const now = Date.now();
    const bump = (id: SkillId, over: Partial<SkillState>) => {
      states = { ...states, [id]: { ...(states[id] as SkillState), ...over } };
    };
    bump('add-20', { proficient: true, accuracy: 0.95, attempts: 40, level: 3, dueAt: now - DAY });
    bump('place-value-3', { proficient: true, accuracy: 0.9, attempts: 30, level: 4 });
    bump('skip-count', { proficient: true, accuracy: 0.88, attempts: 25, level: 4 });
    bump('sub-20', { accuracy: 0.7, attempts: 12, level: 2, dueAt: now - 2 * DAY });
    return propagateUnlocks(states);
  }

  it('never schedules a locked skill outside the stretch slot', () => {
    const states = realisticStates();
    for (let seed = 1; seed <= 60; seed++) {
      for (const item of buildSession(states, Date.now(), seed)) {
        if (item.slot === 'stretch') continue;
        expect(states[item.skillId]?.unlocked, `${item.slot}:${item.skillId}`).toBe(true);
      }
    }
  });

  it('always includes new and stretch work, not just review', () => {
    const states = realisticStates();
    for (let seed = 1; seed <= 40; seed++) {
      const plan = buildSession(states, Date.now(), seed);
      const slots = new Set(plan.map((i) => i.slot));
      expect(slots.has('working'), 'working').toBe(true);
      expect(slots.has('stretch'), 'stretch').toBe(true);
      // The whole point: a session is never entirely material he already owns.
      const easy = plan.filter((i) => i.slot === 'warmup' || i.slot === 'review');
      expect(easy.length).toBeLessThan(plan.length);
    }
  });

  it('produces a workable session from a blank profile', () => {
    const plan = buildSession(initialSkillStates(), Date.now(), 3);
    expect(plan.length).toBeGreaterThan(8);
    for (const item of plan) {
      expect(() => generate(item.skillId, item.level, item.seed)).not.toThrow();
    }
  });

  it('balances a blank session across several strands', () => {
    const plan = buildSession(initialSkillStates(), Date.now(), 3);
    const strands = new Set(
      plan
        .filter((item) => item.slot === 'working')
        .map((item) => getSkill(item.skillId).strand),
    );
    expect(strands.size).toBeGreaterThanOrEqual(3);
  });

  it('offers two distinct mission choices', () => {
    const [a, b] = buildMissionChoices(initialSkillStates(), Date.now(), 9);
    expect(a.strand).not.toBe(b.strand);
    expect(a.focusSkillIds.length).toBeGreaterThan(0);
    expect(b.focusSkillIds.length).toBeGreaterThan(0);
  });

  it('does not present an actually-probed placement skill as new', () => {
    const runs = PLACEMENT_STRANDS.map((strand) => {
      let run = startStrand(strand);
      while (!run.done) run = advanceStrand(run, true);
      return run;
    });
    const states = seedFromPlacement(runs);
    const plan = buildSession(states, Date.now(), 12);
    for (const item of plan.filter((candidate) => candidate.slot === 'new')) {
      expect(states[item.skillId]?.placementSeen).toBe(false);
    }
  });

  it('fades support across recurring-misconception practice', () => {
    const states = initialSkillStates();
    states['add-20'] = {
      ...(states['add-20'] as SkillState),
      attempts: 5,
      recentErrors: ['off-by-one', 'off-by-one'],
    };
    expect(dominantMisconception(states['add-20'] as SkillState)).toBe('off-by-one');
    const plan = buildSession(states, Date.now(), 4, { focusStrand: 'addsub' });
    const stages = plan
      .filter((item) => item.skillId === 'add-20')
      .map((item) => item.remediationStage)
      .filter(Boolean);
    expect(stages).toEqual(expect.arrayContaining(['concrete', 'faded', 'transfer']));
  });

  it('uses problem tags to select a matching remediation variant', () => {
    const targeted = retargetPlannedItem({
      slot: 'working',
      skillId: 'add-100',
      level: 3,
      seed: 1,
      remediationStage: 'faded',
      targetError: 'regrouping',
    });
    expect(generate(targeted.skillId, targeted.level, targeted.seed).meta?.tags).toContain(
      'regrouping',
    );
  });

  it('keeps a two-part boss investigation linked and reconstructable', () => {
    const states = initialSkillStates();
    const plan = buildSession(states, Date.now(), 5, { includeBoss: true });
    const bosses = plan.filter((item) => item.slot === 'boss');
    expect(bosses).toHaveLength(2);
    expect(plan.indexOf(bosses[1] as (typeof plan)[number])).toBe(
      plan.indexOf(bosses[0] as (typeof plan)[number]) + 1,
    );
    for (const item of bosses) {
      const problem = generateBossProblem(item.boss!, item.skillId, item.level);
      expect(problem.meta?.tags).toContain('boss');
      expect(Number(problem.answer)).toBeGreaterThan(0);
    }
  });

  it('every planned item generates a valid problem', () => {
    const states = realisticStates();
    for (let seed = 1; seed <= 30; seed++) {
      for (const item of buildSession(states, Date.now(), seed)) {
        const p = generate(item.skillId, item.level, item.seed);
        expect(p.answer.length).toBeGreaterThan(0);
        expect(p.level).toBeLessThanOrEqual(getSkill(item.skillId).maxLevel);
      }
    }
  });

  it('ends on something he can already do', () => {
    const states = realisticStates();
    for (let seed = 1; seed <= 30; seed++) {
      const plan = buildSession(states, Date.now(), seed);
      expect(plan.at(-1)?.slot).toBe('warmup');
    }
  });

  it('avoids scheduling the same skill twice in a row where possible', () => {
    const states = realisticStates();
    let repeats = 0;
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const plan = buildSession(states, Date.now(), seed);
      for (let i = 1; i < plan.length; i++) {
        total++;
        if (plan[i]?.skillId === plan[i - 1]?.skillId) repeats++;
      }
    }
    // Some repetition is unavoidable with a small working set, but it should
    // be the exception.
    expect(repeats / total).toBeLessThan(0.35);
  });
});

describe('placement staircase', () => {
  it('always terminates within the probe budget', () => {
    for (const strand of PLACEMENT_STRANDS) {
      for (const pattern of [true, false] as const) {
        let run = startStrand(strand);
        let guard = 0;
        while (!run.done && guard++ < 50) run = advanceStrand(run, pattern);
        expect(run.done, `${strand} always-${pattern}`).toBe(true);
        expect(run.asked).toBeLessThanOrEqual(6);
      }
    }
  });

  it('terminates on alternating answers too', () => {
    for (const strand of PLACEMENT_STRANDS) {
      let run = startStrand(strand);
      let guard = 0;
      let correct = true;
      while (!run.done && guard++ < 50) {
        run = advanceStrand(run, correct);
        correct = !correct;
      }
      expect(run.done, strand).toBe(true);
    }
  });

  it('offers a valid probe at every step', () => {
    for (const strand of PLACEMENT_STRANDS) {
      let run = startStrand(strand);
      let guard = 0;
      while (!run.done && guard++ < 50) {
        const probe = currentProbe(run);
        expect(probe, strand).not.toBeNull();
        if (probe) {
          expect(() => generate(probe.skillId, probe.level, 42)).not.toThrow();
        }
        run = advanceStrand(run, guard % 2 === 0);
      }
    }
  });

  it('seeds a higher starting level for a stronger performance', () => {
    const allWrong = PLACEMENT_STRANDS.map((s) => {
      let run = startStrand(s);
      while (!run.done) run = advanceStrand(run, false);
      return run;
    });
    const allRight = PLACEMENT_STRANDS.map((s) => {
      let run = startStrand(s);
      while (!run.done) run = advanceStrand(run, true);
      return run;
    });

    const weak = seedFromPlacement(allWrong);
    const strong = seedFromPlacement(allRight);

    const unlockedCount = (s: Record<SkillId, SkillState>) =>
      Object.values(s).filter((x) => x.unlocked).length;
    expect(unlockedCount(strong)).toBeGreaterThan(unlockedCount(weak));

    const levelSum = (s: Record<SkillId, SkillState>) =>
      Object.values(s).reduce((t, x) => t + x.level, 0);
    expect(levelSum(strong)).toBeGreaterThan(levelSum(weak));
  });

  it('never claims proficiency from a placement probe alone', () => {
    const runs = PLACEMENT_STRANDS.map((s) => {
      let run = startStrand(s);
      while (!run.done) run = advanceStrand(run, true);
      return run;
    });
    for (const state of Object.values(seedFromPlacement(runs))) {
      expect(state.proficient).toBe(false);
      expect(state.mastered).toBe(false);
    }
  });

  it('always leaves a weak learner something to work on', () => {
    const runs = PLACEMENT_STRANDS.map((s) => {
      let run = startStrand(s);
      while (!run.done) run = advanceStrand(run, false);
      return run;
    });
    const states = seedFromPlacement(runs);
    expect(Object.values(states).some((s) => s.unlocked)).toBe(true);
    expect(buildSession(states, Date.now(), 1).length).toBeGreaterThan(5);
  });
});

describe('error classification', () => {
  const problem = generate('add-100', 4, 99);

  it('recognises a dropped carry', () => {
    const [a, b] = problem.meta!.operands as [number, number];
    const noCarry = Number(
      `${Math.floor(a / 10) + Math.floor(b / 10)}${((a % 10) + (b % 10)) % 10}`,
    );
    expect(classify(problem, String(noCarry), 8000, false)).toBe('regrouping');
  });

  it('recognises the inverse operation', () => {
    const [a, b] = problem.meta!.operands as [number, number];
    expect(classify(problem, String(a - b), 8000, false)).toBe('operation-reversed');
  });

  it('recognises off-by-one and transposition', () => {
    const answer = Number(problem.answer);
    expect(classify(problem, String(answer + 1), 8000, false)).toBe('off-by-one');
    const swapped = String(answer).split('').reverse().join('');
    if (swapped !== problem.answer && swapped.length === problem.answer.length) {
      expect(classify(problem, swapped, 8000, false)).toBe('transposition');
    }
  });

  it('flags an answer given faster than the question can be read', () => {
    expect(classify(problem, '1', 400, false)).toBe('likely-guess');
  });

  it('marks a correct answer correct regardless of formatting', () => {
    expect(classify(problem, ` ${problem.answer} `, 5000, false)).toBe('correct');
  });

  it('treats a timeout as a timeout, not a wrong answer', () => {
    expect(classify(problem, '', 90_000, true)).toBe('timeout');
  });
});
