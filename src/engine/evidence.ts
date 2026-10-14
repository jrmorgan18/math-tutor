import type { Attempt, SkillState } from './types';
import { getSkill } from './skills';

export function isIndependent(a: Attempt): boolean {
  return a.hintsUsed === 0 && !(a.automaticHints ?? 0) && !(a.requestedHints ?? 0)
    && a.remediationStage !== 'concrete' && a.remediationStage !== 'faded';
}

export function demonstratedLevel(state: SkillState): number {
  let level = 0;
  for (const [key, row] of Object.entries(state.levelEvidence ?? {})) {
    if (row.attempts >= 3 && row.correct / row.attempts >= .85) {
      level = Math.max(level, Number(key));
    }
  }
  return level;
}

/** The next tier is a probe, not a claim of demonstrated competence. */
export function practiceLevel(state: SkillState): number {
  const max = getSkill(state.skillId).maxLevel;
  if (!state.evidenceVerified) return Math.min(max, (state.demonstratedLevel ?? 0) + 1);
  return Math.min(max, Math.max(1, state.level));
}

export function conceptProficient(state: SkillState | undefined): boolean {
  return !!state?.proficient && state.evidenceVerified === true;
}

/** Rebuild only difficulty evidence from the retained log; never replay rewards. */
export function verifyLegacyEvidence(states: Record<string, SkillState>, attempts: Attempt[]): Record<string, SkillState> {
  const next = { ...states };
  for (const state of Object.values(states)) {
    if (state.evidenceVerified) continue;
    const rows: NonNullable<SkillState['levelEvidence']> = {};
    const history = attempts.filter(a => a.skillId === state.skillId && isIndependent(a) && !a.retry);
    for (const a of history) {
      if (a.slot === 'stretch' && !a.correct) continue;
      const row = rows[a.level] ?? { attempts: 0, correct: 0, streak: 0 };
      rows[a.level] = { attempts: row.attempts + 1, correct: row.correct + Number(a.correct),
        streak: a.correct ? row.streak + 1 : 0 };
    }
    const updated = { ...state, levelEvidence: rows, evidenceVerified: history.length > 0,
      recentLatencies: [], medianLatencyMs: null, fluent: false, retentionChecks: 0, retentionAnchorAt: null };
    updated.demonstratedLevel = demonstratedLevel(updated);
    updated.level = Math.min(getSkill(state.skillId).maxLevel, updated.demonstratedLevel + 1);
    const max = getSkill(state.skillId).maxLevel;
    updated.proficient = history.length >= 6 && state.attempts >= 8 &&
      (state.independentAccuracy ?? 0) >= .85 && updated.demonstratedLevel >= max;
    updated.mastered = false;
    next[state.skillId] = updated;
  }
  return next;
}
