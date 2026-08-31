import { describe, expect, it } from 'vitest';
import { migrateProfile } from '../src/store/db';
import { initialSkillState, reconcileSkillStates } from '../src/engine/mastery';
import { SKILLS } from '../src/engine/skills';
import type { SkillState } from '../src/engine/types';

/**
 * Shipping new content must never cost a learner anything.
 *
 * These tests exist because it already went wrong once: a stored profile was
 * destroyed by a careless reset, and the version check in the old loader would
 * have silently discarded any profile written by an earlier build. Progress
 * that took weeks to earn should survive every update without anyone having to
 * remember to back it up first, and nobody should ever be asked to re-sit a
 * placement test they have already passed.
 */

/** A realistic v1 profile: mid-progress, placement already done. */
function v1Profile() {
  // Deliberately old-shaped: the migration must add fields introduced later.
  const skillStates: Record<string, Partial<SkillState>> = {
    'add-20': {
      skillId: 'add-20',
      level: 3,
      accuracy: 0.92,
      medianLatencyMs: 2800,
      recentLatencies: [3000, 2600, 2800],
      attempts: 41,
      streak: 2,
      missStreak: 0,
      intervalDays: 7,
      dueAt: 1_760_000_000_000,
      retentionChecks: 2,
      proficient: true,
      mastered: true,
      unlocked: true,
      lastSeenAt: 1_759_000_000_000,
    },
    'skip-count': {
      ...initialSkillState('skip-count'),
      level: 2,
      accuracy: 0.7,
      attempts: 12,
      proficient: true,
      unlocked: true,
    },
    'place-value-3': {
      ...initialSkillState('place-value-3'),
      level: 4,
      accuracy: 0.88,
      attempts: 30,
      proficient: true,
      unlocked: true,
    },
  };

  return {
    version: 1,
    name: 'Brooks',
    avatar: '🦖',
    createdAt: 1_755_000_000_000,
    placementDone: true,
    skillStates,
    dna: 64,
    totalDna: 310,
    sequencing: { dinoId: 'stegosaurus', progress: 22 },
    hatched: ['compsognathus', 'gallimimus'],
    streakDays: 5,
    lastSessionDay: '2026-08-17',
    freezesLeft: 1,
    sessionsCompleted: 11,
    dailyDna: 40,
    dailyDnaDay: '2026-08-17',
    bestSessionAccuracy: 0.9,
    bestSessionDna: 58,
    soundOn: true,
    readAloud: false,
  };
}

describe('profile migration preserves everything earned', () => {
  it('keeps placement done — he never re-sits a test he has passed', () => {
    const migrated = migrateProfile(v1Profile());
    expect(migrated).not.toBeNull();
    expect(migrated!.placementDone).toBe(true);
  });

  it('carries across every scalar of his progress untouched', () => {
    const before = v1Profile();
    const after = migrateProfile(before)!;

    expect(after.name).toBe('Brooks');
    expect(after.avatar).toBe('🦖');
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.dna).toBe(64);
    expect(after.totalDna).toBe(310);
    expect(after.hatched).toEqual(['compsognathus', 'gallimimus']);
    expect(after.sequencing).toEqual({ dinoId: 'stegosaurus', progress: 22 });
    expect(after.streakDays).toBe(5);
    expect(after.lastSessionDay).toBe('2026-08-17');
    expect(after.sessionsCompleted).toBe(11);
    expect(after.bestSessionAccuracy).toBe(0.9);
    expect(after.bestSessionDna).toBe(58);
    expect(after.discoveries).toEqual([]);
    expect(after.labLevel).toBe(0);
    // A false here is a real preference, not a missing field to default true.
    expect(after.readAloud).toBe(false);
  });

  it('preserves per-skill mastery exactly, including level and streaks', () => {
    const after = migrateProfile(v1Profile())!;
    const add20 = after.skillStates['add-20']!;

    expect(add20.level).toBe(3);
    expect(add20.accuracy).toBeCloseTo(0.92);
    expect(add20.attempts).toBe(41);
    expect(add20.proficient).toBe(true);
    expect(add20.mastered).toBe(true);
    expect(add20.retentionChecks).toBe(2);
    expect(add20.medianLatencyMs).toBe(2800);
    expect(add20.recentLatencies).toEqual([3000, 2600, 2800]);
    expect(add20.dueAt).toBe(1_760_000_000_000);
    expect(add20.lastSeenAt).toBe(1_759_000_000_000);
  });

  it('adds skills that did not exist yet, at level 1 and nothing claimed', () => {
    const after = migrateProfile(v1Profile())!;
    // Present in the graph but absent from the stored v1 profile.
    const fresh = after.skillStates['fraction-parts']!;
    expect(fresh).toBeDefined();
    expect(fresh.level).toBe(1);
    expect(fresh.attempts).toBe(0);
    expect(fresh.proficient).toBe(false);
    expect(fresh.mastered).toBe(false);
    expect(fresh.accuracy).toBeNull();
  });

  it('gives every skill in the graph a state, so the scheduler cannot fault', () => {
    const after = migrateProfile(v1Profile())!;
    for (const skill of SKILLS) {
      expect(after.skillStates[skill.id], `missing state for ${skill.id}`).toBeDefined();
    }
  });

  it('opens new root skills immediately but leaves gated ones shut', () => {
    const after = migrateProfile(v1Profile())!;
    // No prerequisites: available from the next session.
    expect(after.skillStates['fraction-parts']!.unlocked).toBe(true);
    expect(after.skillStates['shapes-2d']!.unlocked).toBe(true);
    expect(after.skillStates['measure-length']!.unlocked).toBe(true);
    // Requires skip-count, which this profile *is* proficient at.
    expect(after.skillStates['money-count']!.unlocked).toBe(true);
    // Requires fraction-parts + mult-2-5-10, neither proficient yet.
    expect(after.skillStates['fraction-of-set']!.unlocked).toBe(false);
  });

  it('is idempotent — migrating twice changes nothing further', () => {
    const once = migrateProfile(v1Profile())!;
    const twice = migrateProfile(once)!;
    expect(twice).toEqual(once);
  });

  it('never returns null for a recognisable profile, whatever the version', () => {
    for (const version of [1, 2, 3, 99, undefined]) {
      const p = { ...v1Profile(), version };
      expect(migrateProfile(p), `version ${version}`).not.toBeNull();
      expect(migrateProfile(p)!.placementDone).toBe(true);
    }
  });

  it('rejects only things that are not profiles at all', () => {
    expect(migrateProfile(null)).toBeNull();
    expect(migrateProfile(undefined)).toBeNull();
    expect(migrateProfile('nonsense')).toBeNull();
    expect(migrateProfile({})).toBeNull();
    expect(migrateProfile({ name: 'Brooks' })).toBeNull();
  });
});

describe('skill-state reconciliation', () => {
  it('repairs a record missing fields added since it was written', () => {
    const partial = { skillId: 'add-20', level: 2, attempts: 9, proficient: true };
    const out = reconcileSkillStates({ 'add-20': partial as SkillState });
    const s = out['add-20']!;

    expect(s.level).toBe(2);
    expect(s.attempts).toBe(9);
    expect(s.proficient).toBe(true);
    // Filled from defaults rather than left undefined, which would poison
    // every average computed downstream.
    expect(s.accuracy).toBeNull();
    expect(s.recentLatencies).toEqual([]);
    expect(s.missStreak).toBe(0);
    expect(s.intervalDays).toBe(1);
    expect(s.independentAttempts).toBe(9);
    expect(s.supportedAttempts).toBe(0);
    expect(s.retryAttempts).toBe(0);
    expect(s.recentErrors).toEqual([]);
    expect(s.placementSeen).toBe(false);
  });

  it('clamps a stored level that is now past the end of the skill', () => {
    const out = reconcileSkillStates({
      'add-20': { ...initialSkillState('add-20'), level: 99 },
    });
    // add-20 has 3 levels; 99 would generate an out-of-range problem.
    expect(out['add-20']!.level).toBe(3);
  });

  it('repairs review intervals inflated by older same-session logic', () => {
    const lastSeenAt = 1_760_000_000_000;
    const out = reconcileSkillStates({
      'add-20': {
        ...initialSkillState('add-20'),
        intervalDays: 400,
        lastSeenAt,
        dueAt: lastSeenAt + 400 * 86_400_000,
      },
    });
    expect(out['add-20']!.intervalDays).toBe(35);
    expect(out['add-20']!.dueAt).toBe(lastSeenAt + 35 * 86_400_000);
  });

  it('drops state for a skill no longer in the graph rather than crashing', () => {
    const out = reconcileSkillStates({
      'add-20': initialSkillState('add-20'),
      'retired-skill': { ...initialSkillState('add-20'), skillId: 'retired-skill' },
    } as Record<string, SkillState>);
    expect(out['retired-skill']).toBeUndefined();
    expect(out['add-20']).toBeDefined();
  });

  it('handles a null or empty map by seeding a full fresh set', () => {
    for (const input of [null, undefined, {}]) {
      const out = reconcileSkillStates(input as null);
      expect(Object.keys(out).length).toBe(SKILLS.length);
    }
  });
});
