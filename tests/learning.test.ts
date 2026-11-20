import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { applyAttempt, initialSkillStates } from '../src/engine/mastery';
import { isIndependent } from '../src/engine/evidence';
import { buildSession, refreshSupportItem } from '../src/engine/scheduler';
import { buildLearningReports, supportStageFor, withLearningSupport } from '../src/engine/learning';
import { generate } from '../src/engine/generators';
import { sharingAnswer } from '../src/engine/answerEntry';
import { migrateProfile, newProfile } from '../src/store/db';
import { buildWeeklyDigest } from '../src/llm/weeklySummary';
import { HintVisualView } from '../src/ui/components/HintVisualView';
import type { Attempt } from '../src/engine/types';
import { readFile } from 'node:fs/promises';
import type { Profile } from '../src/store/db';

const DAY = 86_400_000;
const now = 100 * DAY;
const attempt = (over: Partial<Attempt> = {}): Attempt => ({ id: 'test', skillId: 'div-share', level: 4,
  seed: 1, given: '3', expected: '3', correct: true, errorType: 'correct', hintsUsed: 0,
  slot: 'working', latencyMs: 12000, at: now, ...over });

function settledStates() {
  const states = initialSkillStates();
  for (const s of Object.values(states)) Object.assign(s, { unlocked: true, mastered: true,
    proficient: true, accuracy: .95, attempts: 20, lastSeenAt: now, dueAt: now + DAY });
  return states;
}

describe('learning from stretch and support', () => {
  it('advances a locked fraction probe from halves to thirds and quarters without opening ordinary lessons', () => {
    const states = settledStates();
    states['fraction-of-set'] = { ...initialSkillStates()['fraction-of-set']!, unlocked: false };
    for (let i = 0; i < 3; i++) {
      const plan = buildSession(states, now, i + 1);
      const item = plan.find(p => p.slot === 'stretch' && p.skillId === 'fraction-of-set')!;
      expect(item.level).toBe(1);
      states[item.skillId] = applyAttempt(states[item.skillId]!, attempt({ ...item }), now + i);
    }
    const plan = buildSession(states, now + 10, 8);
    expect(plan.some(p => p.skillId === 'fraction-of-set' && p.level === 2 && p.slot === 'stretch')).toBe(true);
    expect(plan.some(p => p.skillId === 'fraction-of-set' && p.slot !== 'stretch')).toBe(false);
    expect(states['fraction-of-set']!.proficient).toBe(false);
  });

  it('fades supported success, reopens a hinted check, and retires the cycle only after fresh successes', () => {
    const history = Array.from({ length: 6 }, (_, i) => attempt({ hintsUsed: 1, requestedHints: 1, at: now + i }));
    expect(supportStageFor('div-share', 4, history)).toBe('guided');
    history.push(attempt({ supportStage: 'guided' }));
    expect(isIndependent(history.at(-1)!)).toBe(false);
    expect(supportStageFor('div-share', 4, history)).toBe('faded');
    history.push(attempt({ supportStage: 'faded' }));
    expect(supportStageFor('div-share', 4, history)).toBe('check');
    history.push(attempt({ supportStage: 'check', hintsUsed: 1, requestedHints: 1 }));
    expect(refreshSupportItem({ slot: 'working', skillId: 'div-share', level: 4, seed: 1, supportStage: 'check' }, history).supportStage).toBe('faded');
    for (let i = 0; i < 3; i++) history.push(attempt({ supportStage: 'check' }));
    expect(supportStageFor('div-share', 4, history)).toBeUndefined();
    expect(supportStageFor('div-share', 3, history)).toBeUndefined();
  });

  it('does not mistake automatic or guided success for independent mastery', () => {
    let state = initialSkillStates()['div-share']!;
    for (let i = 0; i < 12; i++) state = applyAttempt(state, attempt({ supportStage: 'guided' }), now + i);
    expect(state.independentAttempts).toBe(0);
    expect(state.demonstratedLevel).toBe(0);
    expect(state.proficient).toBe(false);
  });

  it('sharing preserves the exact historical question and answer and accepts incomplete equal sharing as a scored attempt', () => {
    for (let seed = 1; seed < 100; seed++) {
      const original = generate('div-share', 4, seed);
      const guided = withLearningSupport(original, 'guided');
      expect(guided.prompt).toBe(original.prompt); expect(guided.answer).toBe(original.answer);
      expect(guided.meta).toEqual(original.meta);
      expect(guided.representation.kind).toBe('sharing');
      if (guided.representation.kind !== 'sharing') continue;
      const r = guided.representation, each = Math.floor(r.total / r.nests);
      expect(sharingAnswer(Array(r.nests).fill(each), r.total, r.ask)).toBe(original.answer);
      expect(sharingAnswer(Array(r.nests).fill(each - 1), r.total, r.ask)).not.toBe(original.answer);
      expect(withLearningSupport(original, 'check')).toEqual(original);
    }
    expect(sharingAnswer([2, 3, 2], 23, 'each')).toBeNull();
    expect(sharingAnswer([9, 9, 9], 23, 'leftover')).toBeNull();
    expect(sharingAnswer([0, 0, 0], 23, 'each')).toBeNull();
  });

  it('separates clock tasks after repeated hints while retaining combined tasks once component skills are secure', () => {
    const states = settledStates();
    Object.assign(states['time-clock']!, { level: 4, mastered: false, proficient: false });
    Object.assign(states['clock-reading']!, { level: 4, mastered: false, proficient: false, lastSeenAt: null });
    Object.assign(states['elapsed-time']!, { level: 2, mastered: false, proficient: false, lastSeenAt: now });
    const history = Array.from({ length: 6 }, () => attempt({ skillId: 'time-clock', hintsUsed: 1, requestedHints: 1 }));
    const plan = buildSession(states, now, 5, { focusStrand: 'measurement', history });
    expect(plan.some(p => p.slot === 'working' && p.skillId === 'clock-reading' && p.level === 4)).toBe(true);
    states['clock-reading']!.proficient = true;
    const next = buildSession(states, now, 5, { focusStrand: 'measurement', history });
    expect(next.some(p => p.slot === 'working' && p.skillId === 'elapsed-time')).toBe(true);
    states['elapsed-time']!.proficient = true;
    expect(buildSession(states, now, 5, { focusStrand: 'measurement', history })
      .some(p => p.slot === 'working' && p.skillId === 'time-clock')).toBe(true);
  });

  it('rotates neglected reasoning and subtraction into useful practice without lengthening a session', () => {
    const states = settledStates();
    for (const id of ['place-value-3', 'mult-concept', 'fraction-parts', 'shapes-2d']) Object.assign(states[id]!,
      { mastered: false, proficient: false, recentErrors: ['off-by-one', 'off-by-one'] });
    const targets = ['function-machine', 'missing-addend', 'sub-100'];
    for (const id of targets) Object.assign(states[id]!, { proficient: false, mastered: false, lastSeenAt: now - 10 * DAY });
    const seen = new Set<string>();
    for (let day = 0; day < 3; day++) {
      const plan = buildSession(states, now + day * DAY, 7);
      const working = plan.filter(p => p.slot === 'working');
      expect(working.length).toBe(9);
      expect(new Set(working.map(p => p.skillId)).size).toBeLessThanOrEqual(4);
      for (const id of targets) if (working.some(p => p.skillId === id)) {
        seen.add(id); states[id]!.lastSeenAt = now + day * DAY;
      }
    }
    expect([...seen].sort()).toEqual([...targets].sort());
  });
});

describe('honest parent reporting', () => {
  it('flags perfect but supported results and includes stretch-only difficulty stalls', () => {
    const rows = [
      ...Array.from({ length: 6 }, () => attempt({ hintsUsed: 1, requestedHints: 1 })),
      ...Array.from({ length: 8 }, (_, i) => attempt({ skillId: 'fraction-of-set', level: 1, slot: 'stretch',
        correct: i !== 7, errorType: i === 7 ? 'off-by-one' : 'correct' })),
    ];
    const states = initialSkillStates();
    const reports = buildLearningReports(rows, states);
    const division = reports.find(r => r.skillId === 'div-share')!;
    expect(division.correct).toBe(6); expect(division.independentAttempts).toBe(0);
    expect(division.signals[0]?.kind).toBe('support'); expect(division.requestedSupport).toBe(6);
    const fractions = reports.find(r => r.skillId === 'fraction-of-set')!;
    expect(fractions.stretchCorrect).toBe(7); expect(fractions.signals[0]?.kind).toBe('progression');
    expect(fractions.levels[0]?.independentCorrect).toBe(7);
    const digest = buildWeeklyDigest(rows, states, now);
    expect(digest.accuracyPct).toBe(100); expect(digest.strugglingWith).toContain('Division as fair sharing');
    expect(digest.perSkill.some(r => r.skillId === 'fraction-of-set')).toBe(true);
    expect(buildWeeklyDigest([attempt({ at: now + DAY })], states, now).totalAttempts).toBe(0);
  });

  it('does not label easy warmups or automatic support as independent progress', () => {
    const rows = Array.from({ length: 8 }, () => attempt({ skillId: 'add-20', level: 1, slot: 'warmup' }));
    expect(buildLearningReports(rows, initialSkillStates())[0]?.signals).toEqual([]);
    const report = buildLearningReports([attempt({ automaticHints: 1 }), attempt({ retry: true }),
      attempt({ supportStage: 'guided' }), attempt()], initialSkillStates())[0]!;
    expect(report.independentAttempts).toBe(1); expect(report.automaticSupport).toBe(1);
    expect(report.supportedAttempts).toBe(2);
  });
});

describe('new content and additive upgrades', () => {
  it('preserves earned progress and only seeds practice probes for the new clock components', () => {
    const raw = newProfile('Preservation fixture', initialSkillStates());
    for (const id of ['clock-reading', 'elapsed-time', 'mult-6-8', 'area', 'fraction-equivalence']) delete raw.skillStates[id];
    raw.placementDone = true; raw.dna = 3652; raw.totalDna = 4502; raw.sessionsCompleted = 63;
    raw.hatched = ['compsognathus', 'stegosaurus'];
    Object.assign(raw.skillStates['time-clock']!, { demonstratedLevel: 3, level: 4 });
    const before = JSON.stringify(raw), log = [attempt()];
    const migrated = migrateProfile(raw, log)!;
    for (const [id, old] of Object.entries(raw.skillStates)) expect(migrated.skillStates[id]).toEqual(old);
    expect(migrated.skillStates['clock-reading']!.level).toBe(4);
    expect(migrated.skillStates['clock-reading']!.demonstratedLevel).toBe(0);
    expect(migrated.skillStates['clock-reading']!.proficient).toBe(false);
    expect(migrated.skillStates['elapsed-time']!.level).toBe(2);
    expect(migrated.dna).toBe(3652); expect(migrated.totalDna).toBe(4502); expect(migrated.sessionsCompleted).toBe(63);
    expect(migrated.hatched).toEqual(raw.hatched); expect(migrated.placementDone).toBe(true);
    expect(JSON.stringify(raw)).toBe(before); expect(log).toHaveLength(1);
    expect(migrateProfile(migrated, log)).toEqual(migrated);
  });

  it('keeps clock reading distinct from written-time arithmetic, including noon crossings', () => {
    let crossedNoon = false;
    for (let seed = 1; seed <= 150; seed++) {
      const reading = generate('clock-reading', 4, seed);
      expect(reading.questionVisual?.kind).toBe('clock');
      expect(reading.prompt).not.toContain('lasts');
      expect(reading.hints[0]!.text).not.toMatch(/\d:\d/);
      for (const level of [1, 2, 3]) {
        const elapsed = generate('elapsed-time', level, seed);
        expect(elapsed.questionVisual).toBeUndefined();
        const [a, b] = elapsed.meta!.operands as [number, number];
        if (level < 3) {
          const total = a + b;
          expect(elapsed.answer).toBe(`${Math.floor(total / 60) % 12 || 12}:${String(total % 60).padStart(2, '0')}`);
          if (total >= 13 * 60) crossedNoon = true;
          expect(total >= (Math.floor(a / 60) + 1) * 60).toBe(level === 2);
        } else expect(Number(elapsed.answer)).toBe(a - b);
      }
    }
    expect(crossedNoon).toBe(true);
  });

  it('uses equivalent values and true unit intervals across fraction diagrams', () => {
    for (let seed = 1; seed <= 150; seed++) for (const level of [1, 2, 3]) {
      const p = generate('fraction-equivalence', level, seed);
      if (p.representation.kind === 'choice') {
        const [a, b] = p.answer.split('/').map(Number) as [number, number];
        expect(p.representation.options.filter(option => {
          const [x, y] = option.split('/').map(Number) as [number, number]; return x * b === a * y;
        })).toHaveLength(1);
        if (p.questionVisual?.kind === 'fractionline') {
          expect(p.questionVisual.marked * b).toBe(a * p.questionVisual.parts);
          const html = renderToStaticMarkup(createElement(HintVisualView, { visual: p.questionVisual }));
          expect(html).toContain('Number line from zero to one');
        }
      }
    }
  });

  it('connects unit-square diagrams to exact areas', () => {
    for (let seed = 1; seed <= 100; seed++) for (const level of [1, 2]) {
      const p = generate('area', level, seed);
      expect(p.questionVisual?.kind).toBe('squaregrid');
      if (p.questionVisual?.kind === 'squaregrid') expect(Number(p.answer)).toBe(p.questionVisual.rows * p.questionVisual.cols);
    }
  });
});

// Opt-in, read-only validation of a local export. Personal data never becomes a fixture.
for (const path of (process.env.GENESIS_REFERENCE_EXPORTS ?? '').split(';').filter(Boolean)) {
  it('preserves every saved field and attempt in a supplied reference export', async () => {
    const data = JSON.parse(await readFile(path, 'utf8')) as { profile: Profile; attempts: Attempt[] };
    const before = JSON.stringify(data);
    const migrated = migrateProfile(data.profile, data.attempts)!;
    for (const [key, value] of Object.entries(data.profile)) {
      if (key !== 'version' && key !== 'skillStates') expect(migrated[key as keyof Profile]).toEqual(value);
    }
    for (const [id, state] of Object.entries(data.profile.skillStates)) expect(migrated.skillStates[id]).toEqual(state);
    expect(JSON.stringify(data)).toBe(before);
    expect(migrateProfile(migrated, data.attempts)).toEqual(migrated);
    const reports = buildLearningReports(data.attempts.slice(-177), migrated.skillStates);
    expect(reports.find(r => r.skillId === 'div-share')!.signals.some(s => s.kind === 'support')).toBe(true);
    expect(reports.find(r => r.skillId === 'fraction-of-set')!.signals.some(s => s.kind === 'progression')).toBe(true);
    const plan = buildSession(migrated.skillStates, Math.max(...data.attempts.map(a => a.at)) + DAY, 42,
      { history: data.attempts, focusStrand: 'multdiv' });
    expect(plan.some(p => p.skillId === 'fraction-of-set' && p.slot === 'stretch' && p.level === 2)).toBe(true);
    expect(plan.some(p => p.skillId === 'div-share' && p.supportStage === 'guided')).toBe(true);
  });
}
