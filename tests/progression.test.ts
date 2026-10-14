import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyAttempt, initialSkillState, initialSkillStates, propagateUnlocks } from '../src/engine/mastery';
import { conceptProficient, practiceLevel } from '../src/engine/evidence';
import { editEntry, SolveClock } from '../src/engine/answerEntry';
import { buildSession, dominantMisconception } from '../src/engine/scheduler';
import { generate } from '../src/engine/generators';
import { migrateProfile, newProfile } from '../src/store/db';
import { nextTarget } from '../src/content/dinosaurs';
import { HintVisualView } from '../src/ui/components/HintVisualView';
import type { Attempt, SkillState } from '../src/engine/types';
import { buildWeeklyDigest } from '../src/llm/weeklySummary';

const DAY = 86_400_000;
const answer = (skillId = 'add-20', level = 1, extras: Partial<Attempt> = {}): Attempt => ({
  id: 'test', skillId, level, seed: 1, given: '5', expected: '5', correct: true,
  errorType: 'correct', latencyMs: 10_000, hintsUsed: 0, slot: 'working', at: 1000, ...extras,
});
function learn(skillId = 'add-20') {
  let s = initialSkillState(skillId);
  for (let i = 0; i < 12; i++) s = applyAttempt(s, answer(skillId, s.level), 1000 + i);
  return s;
}

describe('difficulty, understanding and fluency', () => {
  it('easy stretch and warmup successes never demonstrate higher fraction tiers', () => {
    let s = initialSkillState('fraction-of-set');
    for (let i = 0; i < 30; i++) s = applyAttempt(s, answer(s.skillId, 1, { slot: i % 2 ? 'warmup' : 'stretch' }));
    expect(s.demonstratedLevel).toBe(1);
    expect(s.level).toBe(2);
    expect(s.proficient).toBe(false);
    expect(practiceLevel(s)).toBe(2);
  });
  it('slow accurate independent work opens content and dinosaur gates', () => {
    const s = learn();
    expect(s.proficient).toBe(true);
    expect(s.fluent).toBe(false);
    const states = propagateUnlocks({ ...initialSkillStates(), 'add-20': s });
    expect(states['sub-20']!.unlocked).toBe(true);
    const target = nextTarget(['compsognathus', 'stegosaurus', 'pteranodon', 'ankylosaurus', 'triceratops'], id => conceptProficient(states[id]));
    expect(target?.unlocked).toBe(true);
  });
  it('automatic support and retries do not establish difficulty evidence', () => {
    let s = initialSkillState('add-20');
    for (let i = 0; i < 20; i++) s = applyAttempt(s, answer('add-20', 3, i % 2 ? { retry: true } : { automaticHints: 1 }));
    expect(s.demonstratedLevel).toBe(0);
    expect(s.proficient).toBe(false);
  });
  it('fluency uses reliable top-tier timings, excluding interruptions and old wall time', () => {
    let s = learn();
    for (let i = 0; i < 8; i++) s = applyAttempt(s, answer('add-20', 3, { latencyMs: 1000, timingReliable: false }));
    expect(s.fluent).toBe(false);
    for (let i = 0; i < 6; i++) s = applyAttempt(s, answer('add-20', 3, { latencyMs: 1000, timingReliable: true }));
    expect(s.fluent).toBe(true);
  });
  it('daily practice cannot defer independent spaced verification forever', () => {
    let s = learn();
    const anchor = s.retentionAnchorAt!;
    for (let day = 1; day <= 6; day++) s = applyAttempt(s, answer('add-20', 3), anchor + day * DAY);
    expect(s.retentionAnchorAt).toBe(anchor);
    s = applyAttempt(s, answer('add-20', 3, { automaticHints: 1 }), anchor + 7 * DAY);
    expect(s.retentionChecks).toBe(0);
    s = applyAttempt(s, answer('add-20', 2, { slot: 'warmup' }), anchor + 7 * DAY);
    expect(s.retentionChecks).toBe(0);
    s = applyAttempt(s, answer('add-20', 3), anchor + 7 * DAY);
    expect(s.retentionChecks).toBe(1);
    s = applyAttempt(s, answer('add-20', 3), anchor + 14 * DAY);
    expect(s.mastered).toBe(true);
  });
});

describe('legacy evidence and preservation', () => {
  it('reconciles an inflated legacy fraction state without replaying or deleting earned assets', () => {
    const raw = newProfile('Test learner', initialSkillStates());
    raw.placementDone = true; raw.dna = 27; raw.totalDna = 800;
    raw.hatched = ['compsognathus', 'stegosaurus']; raw.discoveries = ['fact-raptor-tail'];
    raw.sequencing = { dinoId: 'pteranodon', progress: 32 };
    const legacy = { ...initialSkillState('fraction-of-set'), level: 4, proficient: true,
      mastered: true, unlocked: true, attempts: 16, independentAccuracy: 1, independentAttempts: 16 };
    delete legacy.evidenceVerified; delete legacy.levelEvidence;
    raw.skillStates['fraction-of-set'] = legacy;
    const attempts = Array.from({ length: 16 }, () => answer('fraction-of-set', 1));
    const before = JSON.stringify({ raw, attempts });
    const migrated = migrateProfile(raw, attempts)!;
    const s = migrated.skillStates['fraction-of-set']!;
    expect(s.legacyLevel).toBe(4); expect(s.demonstratedLevel).toBe(1);
    expect(s.legacyState).toEqual(legacy);
    expect(s.proficient).toBe(false); expect(s.mastered).toBe(false);
    expect(s.level).toBe(2); expect(s.unlocked).toBe(true);
    expect(migrated.hatched).toEqual(raw.hatched); expect(migrated.discoveries).toEqual(raw.discoveries);
    expect(migrated.dna).toBe(27); expect(migrated.totalDna).toBe(800);
    expect(migrated.sequencing).toEqual(raw.sequencing); expect(migrated.placementDone).toBe(true);
    expect(JSON.stringify({ raw, attempts })).toBe(before);
    expect(migrateProfile(migrated, attempts)).toEqual(migrated);
    const plan = buildSession(migrated.skillStates, 1000, 12, { focusStrand: 'fractions' });
    expect(plan.some(p => p.skillId === 'fraction-of-set' && p.level === 2)).toBe(true);
  });
  it('legacy flags with no log remain unverified and cannot unlock new rewards', () => {
    const legacy = { skillId: 'add-20', level: 3, proficient: true } as SkillState;
    const migrated = migrateProfile({ name: 'Test', skillStates: { 'add-20': legacy } })!;
    expect(conceptProficient(migrated.skillStates['add-20'])).toBe(false);
    expect(practiceLevel(migrated.skillStates['add-20']!)).toBe(1);
  });
  it('keeps optional saved profile data and zero-target expedition progress', () => {
    const raw = { ...newProfile('Preservation test', initialSkillStates()),
      savedExtra: { note: 'keep this saved value' }, expedition: { weekKey: '2026-W42', siteId: 'badlands',
        goalSessions: 4, goalNewSkills: 0, sessionsDone: 3, skillsAdvanced: [], claimed: false } };
    const migrated = migrateProfile(raw, [])!;
    expect(migrated.expedition).toEqual(raw.expedition);
    expect((migrated as unknown as typeof raw).savedExtra).toEqual(raw.savedExtra);
  });
});

describe('remediation outcomes and scheduling', () => {
  it('orders concrete, faded and transfer after interleaving and carries fading across sessions', () => {
    const states = initialSkillStates();
    let s = { ...states['add-20']!, recentErrors: ['off-by-one', 'off-by-one'] as SkillState['recentErrors'], attempts: 8 };
    states['add-20'] = s;
    for (let seed = 1; seed <= 40; seed++) {
      const plan = buildSession(states, 1000, seed, { focusStrand: 'addsub', includeBoss: true });
      expect(plan.length).toBeLessThanOrEqual(18);
      const stages = plan.filter(p => p.skillId === 'add-20' && p.remediationStage).map(p => p.remediationStage);
      expect(stages).toEqual(['concrete', 'faded', 'transfer'].slice(0, stages.length));
      expect(plan.some(p => p.slot === 'working' && !p.remediationStage)).toBe(true);
    }
    s = applyAttempt(s, answer('add-20', 1, { remediationStage: 'concrete', hintsUsed: 2, targetError: 'off-by-one' }));
    states['add-20'] = s;
    const stages = buildSession(states, 1000, 3, { focusStrand: 'addsub' }).filter(p => p.skillId === 'add-20' && p.remediationStage).map(p => p.remediationStage);
    expect(stages[0]).toBe('faded');
  });
  it('resolves after independent transfer, retains diagnosis history and reopens on recurrence', () => {
    let s = { ...initialSkillState('add-20'), recentErrors: ['off-by-one', 'off-by-one'] as SkillState['recentErrors'] };
    for (let i = 0; i < 3; i++) s = applyAttempt(s, answer('add-20', 1, { hintsUsed: 1 }));
    expect(dominantMisconception(s)).toBe('off-by-one');
    for (let i = 0; i < 3; i++) s = applyAttempt(s, answer());
    expect(dominantMisconception(s)).toBeNull();
    expect(s.recentErrors).toContain('off-by-one');
    s = applyAttempt(s, answer('add-20', 2, { correct: false, errorType: 'off-by-one' }));
    expect(dominantMisconception(s)).toBe('off-by-one');
    expect(s.remediation?.['off-by-one']?.stage).toBe(0);
  });
  it('opens introductory money, clock and concrete groups without advanced skip counting', () => {
    const s = initialSkillStates();
    for (const id of ['money-count', 'time-clock', 'mult-concept']) expect(s[id]!.unlocked).toBe(true);
  });
});

describe('geometry and answer interaction', () => {
  it('shows complete correct axes only in symmetry explanations, with a non-square rectangle', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 100; seed++) {
      const p = generate('shapes-2d', 4, seed);
      const v = p.questionVisual!;
      expect(v.kind).toBe('shape');
      if (v.kind !== 'shape') continue;
      seen.add(v.label!); expect(v.symmetry).toBeFalsy();
      expect(p.prompt).not.toContain('regular rectangle');
      const html = renderToStaticMarkup(HintVisualView({ visual: p.hints.at(-1)!.visual! }));
      expect((html.match(/class="viz-poly-symmetry"/g) ?? []).length).toBe(Number(p.answer));
      if (v.label === 'rectangle') {
        const coordinates = /points="([^"]+)"/.exec(html)![1]!.split(' ').map(pair => pair.split(',').map(Number));
        const width = Math.abs(coordinates[1]![0]! - coordinates[0]![0]!);
        const height = Math.abs(coordinates[2]![1]! - coordinates[1]![1]!);
        expect(width).not.toBe(height);
      }
    }
    expect(seen.size).toBe(5);
  });
  it('handles rapid column edits, undo, zero ones and single digits', () => {
    const rep = { kind: 'columns' as const, columns: 2, carry: true };
    let value = editEntry('', '0', rep); value = editEntry(value, '4', rep);
    expect(value).toBe('40'); expect(editEntry(value, '7', rep)).toBe('40');
    value = editEntry(value, 'backspace', rep); expect(value).toBe('0');
    expect(editEntry(value, '5', rep)).toBe('50');
    expect(editEntry('0', '6', { kind: 'numeric' })).toBe('6');
    expect(editEntry('', '7', { kind: 'columns', columns: 1, carry: false })).toBe('7');
  });
  it('pauses background time and excludes interrupted fluency samples', () => {
    const clock = new SolveClock(1000); clock.pause(2000); clock.resume(102000);
    expect(clock.read(103000)).toEqual({ latencyMs: 2000, timingReliable: false });
  });
  it('word stories ask for an operation before computation, and fractions progress beyond halves', () => {
    const equationForms = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const p = generate('word-1step', 1, seed);
      expect(p.operationChoice?.options).toContain(p.operationChoice?.answer);
      expect(generate('fraction-of-set', 2, seed).prompt).toMatch(/1\/[34]/);
      const sub = generate('sub-20', 3, seed);
      expect(sub.hints.at(-1)!.text).toContain('then 10');
      const missing = generate('missing-addend', 2, seed);
      equationForms.add(missing.prompt.includes('−') ? 'missing taken-away part' : 'missing added part');
      expect(missing.hints[0]?.visual?.kind).toBe('barmodel');
      expect(generate('mult-concept', 1, seed).questionVisual?.kind).toBe('groups');
    }
    expect(equationForms.size).toBe(2);
  });
  it('perimeter triangles have valid side lengths', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = generate('perimeter', 3, seed);
      const v = p.questionVisual;
      if (v?.kind !== 'shape' || v.sides !== 3) continue;
      const [a, b, c] = v.sideLabels as [number, number, number];
      expect(a + b).toBeGreaterThan(c); expect(a + c).toBeGreaterThan(b); expect(b + c).toBeGreaterThan(a);
      expect(Number(p.answer)).toBe(a + b + c);
    }
  });
  it('weekly reporting distinguishes automatic, requested and unknown legacy support', () => {
    const attempts = [answer('add-20', 1, { hintsUsed: 1, automaticHints: 1, requestedHints: 0 }),
      answer('add-20', 1, { hintsUsed: 1, automaticHints: 0, requestedHints: 1 }),
      answer('add-20', 1, { hintsUsed: 1 })];
    const digest = buildWeeklyDigest(attempts, initialSkillStates(), 2000);
    expect(digest.automaticSupportCount).toBe(1); expect(digest.requestedSupportCount).toBe(1);
    expect(digest.legacySupportCount).toBe(1); expect(digest.perSkill[0]?.level).toBe(0);
  });
});
