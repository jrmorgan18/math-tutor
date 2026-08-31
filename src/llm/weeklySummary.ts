import { ERROR_LABELS } from '../engine/errors';
import { getSkill, skillExists } from '../engine/skills';
import type { Attempt, ErrorType, SkillId, SkillState } from '../engine/types';

/**
 * The weekly parent summary.
 *
 * Same discipline as the hint layer: **every number is computed here, in
 * TypeScript, and handed to the model already finished.** The model's job is
 * prose, not arithmetic — it is explicitly told not to compute or recompute
 * anything. A summary that quietly misstates his accuracy would be worse than
 * no summary, because it would be acted on.
 *
 * The digest is also useful on its own, so the screen renders it whether or
 * not an API key is configured. The model adds interpretation, not data.
 */

const DAY = 86_400_000;

export interface WeeklyDigest {
  from: number;
  to: number;
  totalAttempts: number;
  correct: number;
  accuracyPct: number;
  sessions: number;
  minutes: number;
  hintRatePct: number;
  /** Skills worked on, best-first by accuracy. */
  perSkill: Array<{
    skillId: SkillId;
    name: string;
    attempts: number;
    accuracyPct: number;
    level: number;
    proficient: boolean;
  }>;
  /** The most common error types this week, with counts. */
  topErrors: Array<{ errorType: ErrorType; label: string; count: number }>;
  stretchAttempted: number;
  stretchWins: number;
  /** Skills where accuracy is under 60% with enough attempts to mean it. */
  strugglingWith: string[];
  /** Skills that reached proficiency in the window. */
  newlyProficient: string[];
}

/**
 * Build the digest from the raw attempt log. Pure and synchronous, so the
 * parent screen can render it with no network at all.
 */
export function buildWeeklyDigest(
  attempts: Attempt[],
  skillStates: Record<SkillId, SkillState>,
  now = Date.now(),
  windowDays = 7,
): WeeklyDigest {
  const from = now - windowDays * DAY;
  const recent = attempts.filter((a) => a.at >= from);
  const scored = recent.filter((a) => a.slot !== 'stretch');

  const correct = scored.filter((a) => a.correct).length;
  const totalMs = recent.reduce((sum, a) => sum + Math.min(a.latencyMs, 60_000), 0);

  // Sessions aren't stamped on attempts, so infer them from gaps: anything
  // more than 30 minutes after the previous attempt starts a new sitting.
  let sessions = 0;
  let lastAt = -Infinity;
  for (const a of [...recent].sort((x, y) => x.at - y.at)) {
    if (a.at - lastAt > 30 * 60_000) sessions++;
    lastAt = a.at;
  }

  const bySkill = new Map<SkillId, { attempts: number; correct: number }>();
  for (const a of scored) {
    const row = bySkill.get(a.skillId) ?? { attempts: 0, correct: 0 };
    row.attempts++;
    if (a.correct) row.correct++;
    bySkill.set(a.skillId, row);
  }

  const perSkill = [...bySkill.entries()]
    .filter(([id]) => skillExists(id))
    .map(([skillId, row]) => ({
      skillId,
      name: getSkill(skillId).name,
      attempts: row.attempts,
      accuracyPct: Math.round((row.correct / row.attempts) * 100),
      level: skillStates[skillId]?.level ?? 1,
      proficient: skillStates[skillId]?.proficient === true,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  const errorCounts = new Map<ErrorType, number>();
  for (const a of scored) {
    if (a.correct || a.errorType === 'correct') continue;
    errorCounts.set(a.errorType, (errorCounts.get(a.errorType) ?? 0) + 1);
  }
  const topErrors = [...errorCounts.entries()]
    .map(([errorType, count]) => ({ errorType, label: ERROR_LABELS[errorType], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const stretch = recent.filter((a) => a.slot === 'stretch');

  return {
    from,
    to: now,
    totalAttempts: scored.length,
    correct,
    accuracyPct: scored.length > 0 ? Math.round((correct / scored.length) * 100) : 0,
    sessions,
    minutes: Math.round(totalMs / 60_000),
    hintRatePct:
      scored.length > 0
        ? Math.round((scored.filter((a) => a.hintsUsed > 0).length / scored.length) * 100)
        : 0,
    perSkill,
    topErrors,
    stretchAttempted: stretch.length,
    stretchWins: stretch.filter((a) => a.correct).length,
    // Six attempts is the floor for calling something a struggle rather than
    // a bad morning.
    strugglingWith: perSkill
      .filter((s) => s.attempts >= 6 && s.accuracyPct < 60)
      .map((s) => s.name),
    newlyProficient: perSkill.filter((s) => s.proficient).map((s) => s.name),
  };
}

/** The static deployment keeps parent reporting entirely on-device. */
export async function fetchWeeklySummary(
  _digest: WeeklyDigest,
  _signal?: AbortSignal,
): Promise<string | null> {
  return null;
}
