import { isIndependent } from './evidence';
import { getSkill, skillExists } from './skills';
import type { Attempt, Problem, SkillState, SupportStage } from './types';

/** Only fresh, independent answers can retire a support cycle. */
export function supportStageFor(skillId: string, level: number, attempts: Attempt[]): SupportStage | undefined {
  const recent = attempts.filter(a => a.skillId === skillId && a.level === level &&
    a.slot !== 'stretch' && a.slot !== 'warmup' && !a.retry).slice(-6);
  if (recent.length >= 3 && recent.slice(-3).every(a => a.correct && isIndependent(a))) return;
  const last = recent.at(-1);
  if (last?.supportStage) {
    if (!last.correct) return 'guided';
    if (last.supportStage === 'guided') return 'faded';
    if (last.supportStage === 'faded') return 'check';
    return isIndependent(last) ? 'check' : 'faded';
  }
  if (recent.length >= 4 && recent.filter(a => !isIndependent(a)).length >= 4) return 'guided';
}

/** Changes the scaffold, never the original question, seed, or correct answer. */
export function withLearningSupport(problem: Problem, stage?: SupportStage): Problem {
  if ((stage !== 'guided' && stage !== 'faded') || problem.skillId !== 'div-share' || problem.level !== 4) return problem;
  const [total, nests] = problem.meta?.operands ?? [];
  if (!total || !nests) return problem;
  return { ...problem, representation: { kind: 'sharing', total, nests,
    ask: problem.subPrompt?.includes('left over') ? 'leftover' : 'each', showEggs: stage === 'guided' } };
}

export interface LevelReport {
  level: number;
  attempts: number;
  correct: number;
  independentAttempts: number;
  independentCorrect: number;
  requestedSupport: number;
}

export interface SkillLearningReport {
  skillId: string;
  name: string;
  attempts: number;
  correct: number;
  stretchAttempts: number;
  stretchCorrect: number;
  independentAttempts: number;
  independentCorrect: number;
  supportedAttempts: number;
  requestedSupport: number;
  automaticSupport: number;
  levels: LevelReport[];
  signals: Array<{ kind: 'support' | 'progression'; text: string }>;
}

/** Raw counts, including unsuccessful stretch probes, keep the report honest. */
export function buildLearningReports(attempts: Attempt[], states: Record<string, SkillState>): SkillLearningReport[] {
  const groups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    if (!skillExists(a.skillId)) continue;
    const group = groups.get(a.skillId) ?? [];
    group.push(a); groups.set(a.skillId, group);
  }
  return [...groups.entries()].map(([skillId, history]) => {
    const skill = getSkill(skillId);
    const ordered = [...history].sort((a, b) => a.at - b.at);
    const regular = ordered.filter(a => a.slot !== 'stretch');
    const independent = regular.filter(a => !a.retry && isIndependent(a));
    const levels = [...new Set(ordered.map(a => a.level))].sort((a, b) => a - b).map(level => {
      const rows = ordered.filter(a => a.level === level);
      const independentRows = rows.filter(a => !a.retry && isIndependent(a));
      return { level, attempts: rows.length, correct: rows.filter(a => a.correct).length,
        independentAttempts: independentRows.length, independentCorrect: independentRows.filter(a => a.correct).length,
        requestedSupport: rows.filter(a => (a.requestedHints ?? 0) > 0).length };
    });
    const supported = regular.filter(a => !isIndependent(a));
    const signals: SkillLearningReport['signals'] = [];
    const lastSix = regular.filter(a => !a.retry && a.slot !== 'warmup').slice(-6);
    if (lastSix.length >= 4 && lastSix.filter(a => !isIndependent(a)).length >= 4) {
      signals.push({ kind: 'support', text: `${lastSix.filter(a => !isIndependent(a)).length} of the last ${lastSix.length} practice questions used support. Check a fresh answer independently.` });
    }
    const probes = ordered.filter(a => !a.retry && a.slot !== 'warmup' && isIndependent(a)).slice(-8);
    const probeLevel = probes[0]?.level ?? 0;
    if (probes.length === 8 && probeLevel < skill.maxLevel && probes.every(a => a.level === probeLevel) &&
      probes.filter(a => a.correct).length >= 7 && (states[skillId]?.demonstratedLevel ?? 0) <= probeLevel &&
      !ordered.some(a => a.level > probeLevel)) {
      signals.push({ kind: 'progression', text: `Repeated success at level ${probeLevel}; ready to try level ${probeLevel + 1}.` });
    }
    return { skillId, name: skill.name, attempts: regular.length, correct: regular.filter(a => a.correct).length,
      stretchAttempts: ordered.length - regular.length,
      stretchCorrect: ordered.filter(a => a.slot === 'stretch' && a.correct).length,
      independentAttempts: independent.length, independentCorrect: independent.filter(a => a.correct).length,
      supportedAttempts: supported.length,
      requestedSupport: regular.filter(a => (a.requestedHints ?? 0) > 0).length,
      automaticSupport: regular.filter(a => (a.automaticHints ?? 0) > 0).length, levels, signals };
  }).sort((a, b) => b.attempts + b.stretchAttempts - a.attempts - a.stretchAttempts);
}
