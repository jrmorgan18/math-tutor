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

const SYSTEM = `You are writing a short weekly progress note for the parent of a 7-year-old boy called Brooks, who is using a maths practice app. The parent is technical and wants an honest read, not marketing.

Rules, in order of importance:
1. NEVER compute, recompute, or estimate any number. Every figure you need is given to you. If a number is not in the data, do not state it.
2. Be honest about weak spots. A note that says everything is going well when it is not is worse than useless — this parent is using it to decide what to sit down and help with.
3. Lead with what actually changed this week, not with praise.
4. Say specifically what to do next: one concrete thing worth practising together, tied to the error patterns in the data.
5. Six sentences maximum. Plain prose, no headings, no bullet points, no emoji, no markdown.
6. Refer to him by name. Address the parent as "you".
7. If the data covers very little activity, say so plainly rather than over-reading it.`;

/**
 * Ask the model to interpret the digest. Returns null when unavailable for any
 * reason — callers must treat that as normal and fall back to the digest alone.
 */
export async function fetchWeeklySummary(
  digest: WeeklyDigest,
  signal?: AbortSignal,
): Promise<string | null> {
  if (digest.totalAttempts === 0) return null;

  const lines = [
    `Window: the last 7 days.`,
    `Sessions: ${digest.sessions}. Questions answered: ${digest.totalAttempts}. Correct: ${digest.correct}. Overall accuracy: ${digest.accuracyPct}%.`,
    `Time on task: about ${digest.minutes} minutes. He asked for a hint on ${digest.hintRatePct}% of questions.`,
    `Deliberately-too-hard "stretch" questions: attempted ${digest.stretchAttempted}, got ${digest.stretchWins} right. Missing these costs him nothing by design.`,
    ``,
    `Per skill this week (skill, questions, accuracy, current difficulty tier of 4):`,
    ...digest.perSkill.map(
      (s) => `- ${s.name}: ${s.attempts} questions, ${s.accuracyPct}% correct, tier ${s.level}${s.proficient ? ', now proficient' : ''}`,
    ),
    ``,
    digest.topErrors.length > 0
      ? `Most common kinds of mistake: ${digest.topErrors.map((e) => `${e.label} (${e.count})`).join(', ')}.`
      : `No wrong answers recorded this week.`,
    digest.strugglingWith.length > 0
      ? `Flagged as struggling (under 60% with enough attempts to be meaningful): ${digest.strugglingWith.join(', ')}.`
      : `Nothing is currently flagged as a struggle.`,
    digest.newlyProficient.length > 0
      ? `Reached proficiency: ${digest.newlyProficient.join(', ')}.`
      : ``,
    ``,
    `Write the weekly note.`,
  ].filter(Boolean);

  try {
    const res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: SYSTEM, user: lines.join('\n'), maxTokens: 700 }),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch {
    return null;
  }
}
