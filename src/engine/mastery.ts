import { getSkill, SKILLS, topoSortedSkills } from './skills';
import type { Attempt, SkillId, SkillState } from './types';
import { conceptProficient, demonstratedLevel, isIndependent } from './evidence';

const DAY = 86_400_000;

/** How fast accuracy responds to recent performance. */
const ACCURACY_ALPHA = 0.25;
/** Correct-in-a-row at the current level needed to move up a tier. */
const LEVEL_UP_STREAK = 3;
/** Wrong-in-a-row before the difficulty safety net drops a tier. */
const LEVEL_DOWN_STREAK = 2;
/** Accuracy floor for proficiency. */
const PROFICIENT_ACCURACY = 0.85;
/** Minimum attempts before proficiency can be claimed at all. */
const MIN_ATTEMPTS = 8;
/** Independent evidence required before support-assisted work can become proficiency. */
const MIN_INDEPENDENT_ATTEMPTS = 6;
/** Spaced reviews at >= this gap that must be passed for true mastery. */
const RETENTION_GAP_DAYS = 7;
const RETENTION_CHECKS_NEEDED = 2;
const MAX_INTERVAL_DAYS = 35;
const RECENT_ERROR_WINDOW = 8;

export function initialSkillState(skillId: SkillId): SkillState {
  const skill = getSkill(skillId);
  return {
    skillId,
    level: 1,
    levelEvidence: {},
    demonstratedLevel: 0,
    evidenceVerified: true,
    fluent: false,
    retentionAnchorAt: null,
    remediation: {},
    accuracy: null,
    medianLatencyMs: null,
    recentLatencies: [],
    attempts: 0,
    independentAccuracy: null,
    independentAttempts: 0,
    supportedAccuracy: null,
    supportedAttempts: 0,
    retryAttempts: 0,
    retrySuccesses: 0,
    recentErrors: [],
    streak: 0,
    missStreak: 0,
    intervalDays: 1,
    dueAt: 0,
    retentionChecks: 0,
    proficient: false,
    mastered: false,
    // Roots of the graph are open from day one; everything else waits.
    unlocked: skill.requires.length === 0,
    lastSeenAt: null,
    placementSeen: false,
    placementLevel: null,
  };
}

export function initialSkillStates(): Record<SkillId, SkillState> {
  const out: Record<SkillId, SkillState> = {};
  for (const skill of SKILLS) out[skill.id] = initialSkillState(skill.id);
  return out;
}

/**
 * Bring a stored skill-state map up to date with the current skill graph
 * without losing a single thing he has earned.
 *
 * This is the function that makes shipping new content safe. Adding a skill
 * must never cost him progress or send him back through placement, so the rule
 * is strictly additive: every skill he already has keeps its exact state, and
 * only genuinely new skills get a fresh one. A skill that has been *removed*
 * from the graph is dropped, because keeping state for a skill with no
 * generator would crash the scheduler — but that is the only deletion.
 *
 * Individual fields are repaired rather than trusted: a profile written by an
 * older build can be missing a field added since, and a missing number that
 * silently becomes `undefined` corrupts every downstream average.
 */
export function reconcileSkillStates(
  existing: Record<SkillId, SkillState> | null | undefined,
): Record<SkillId, SkillState> {
  const out: Record<SkillId, SkillState> = {};
  for (const skill of SKILLS) {
    const prior = existing?.[skill.id];
    out[skill.id] = prior ? repairSkillState(skill.id, prior) : initialSkillState(skill.id);
  }
  return out;
}

/** Fill any field missing from an older-format record, keeping what is there. */
function repairSkillState(skillId: SkillId, prior: Partial<SkillState>): SkillState {
  const base = initialSkillState(skillId);
  const skill = getSkill(skillId);
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.max(1, num(prior.intervalDays, 1)));
  const lastSeenAt =
    typeof prior.lastSeenAt === 'number' && Number.isFinite(prior.lastSeenAt)
      ? prior.lastSeenAt
      : null;
  const rawDueAt = num(prior.dueAt, 0);
  const dueAt =
    lastSeenAt === null
      ? rawDueAt
      : Math.min(rawDueAt, lastSeenAt + MAX_INTERVAL_DAYS * DAY);

  return {
    ...base,
    levelEvidence: prior.levelEvidence ?? {},
    demonstratedLevel: prior.demonstratedLevel ?? 0,
    evidenceVerified: prior.evidenceVerified === true,
    legacyLevel: prior.legacyLevel ?? (prior.evidenceVerified ? undefined : prior.level),
    legacyState: prior.legacyState ?? (prior.evidenceVerified ? undefined : { ...prior }),
    fluent: prior.fluent === true,
    retentionAnchorAt: prior.retentionAnchorAt ?? null,
    remediation: prior.remediation ?? {},
    skillId,
    // Clamp: maxLevel can shrink when a skill is retuned, and a level past the
    // end would generate an out-of-range problem.
    level: Math.min(Math.max(Math.round(num(prior.level, base.level)), 1), skill.maxLevel),
    accuracy:
      typeof prior.accuracy === 'number' && Number.isFinite(prior.accuracy)
        ? Math.min(Math.max(prior.accuracy, 0), 1)
        : null,
    medianLatencyMs:
      typeof prior.medianLatencyMs === 'number' && Number.isFinite(prior.medianLatencyMs)
        ? prior.medianLatencyMs
        : null,
    recentLatencies: Array.isArray(prior.recentLatencies)
      ? prior.recentLatencies.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(-10)
      : [],
    attempts: Math.max(0, Math.round(num(prior.attempts, 0))),
    // Retain legacy aggregates for historical reporting. Difficulty claims are
    // separately verified from actual independent attempts before new unlocks.
    independentAccuracy:
      typeof prior.independentAccuracy === 'number' && Number.isFinite(prior.independentAccuracy)
        ? Math.min(Math.max(prior.independentAccuracy, 0), 1)
        : typeof prior.accuracy === 'number' && Number.isFinite(prior.accuracy)
          ? Math.min(Math.max(prior.accuracy, 0), 1)
          : null,
    independentAttempts: Math.max(
      0,
      Math.round(num(prior.independentAttempts, num(prior.attempts, 0))),
    ),
    supportedAccuracy:
      typeof prior.supportedAccuracy === 'number' && Number.isFinite(prior.supportedAccuracy)
        ? Math.min(Math.max(prior.supportedAccuracy, 0), 1)
        : null,
    supportedAttempts: Math.max(0, Math.round(num(prior.supportedAttempts, 0))),
    retryAttempts: Math.max(0, Math.round(num(prior.retryAttempts, 0))),
    retrySuccesses: Math.max(0, Math.round(num(prior.retrySuccesses, 0))),
    recentErrors: Array.isArray(prior.recentErrors)
      ? prior.recentErrors.slice(-RECENT_ERROR_WINDOW)
      : [],
    streak: Math.max(0, Math.round(num(prior.streak, 0))),
    missStreak: Math.max(0, Math.round(num(prior.missStreak, 0))),
    intervalDays,
    dueAt,
    retentionChecks: Math.max(0, Math.round(num(prior.retentionChecks, 0))),
    proficient: prior.proficient === true,
    mastered: prior.mastered === true,
    // An existing skill keeps its unlocked flag; a root skill is always open.
    unlocked: prior.unlocked === true || skill.requires.length === 0,
    lastSeenAt,
    placementSeen: prior.placementSeen === true,
    placementLevel:
      typeof prior.placementLevel === 'number' && Number.isFinite(prior.placementLevel)
        ? Math.min(Math.max(Math.round(prior.placementLevel), 1), skill.maxLevel)
        : null,
  };
}

/**
 * Fold one attempt into a skill's state.
 *
 * Returns a new object; callers persist the result. Hint usage counts as a
 * partial success — it keeps accuracy honest without punishing him for asking,
 * which is the behaviour we actively want to encourage.
 */
export function applyAttempt(
  state: SkillState,
  attempt: Attempt,
  now = Date.now(),
): SkillState {
  const skill = getSkill(state.skillId);
  const next: SkillState = { ...state, recentLatencies: [...state.recentLatencies] };

  /**
   * Stretch items sit deliberately above his level, so a miss there carries no
   * information about the skill and must not drag accuracy down, drop his
   * tier, or reset his review schedule. A *correct* stretch answer still
   * counts for him. This asymmetry is what makes "have a go at the hard one"
   * a genuinely free offer rather than a trap.
   */
  if (attempt.slot === 'stretch' && !attempt.correct) return next;

  // Asking for help then solving it scores 0.6 rather than 1.0. Getting it
  // wrong after hints still scores 0.
  const score = attempt.correct ? (attempt.hintsUsed > 0 ? 0.6 : 1) : 0;

  next.attempts += 1;
  next.accuracy =
    state.accuracy === null
      ? score
      : state.accuracy + ACCURACY_ALPHA * (score - state.accuracy);

  const supported = !isIndependent(attempt);
  if (supported) {
    next.supportedAttempts = state.supportedAttempts + 1;
    next.supportedAccuracy = ewma(state.supportedAccuracy, attempt.correct ? 1 : 0);
  } else if (!attempt.retry) {
    next.independentAttempts = state.independentAttempts + 1;
    next.independentAccuracy = ewma(state.independentAccuracy, attempt.correct ? 1 : 0);
  }

  if (attempt.retry) {
    next.retryAttempts = state.retryAttempts + 1;
    next.retrySuccesses = state.retrySuccesses + (attempt.correct ? 1 : 0);
  }

  if (!attempt.correct) {
    next.recentErrors = [...state.recentErrors, attempt.errorType].slice(-RECENT_ERROR_WINDOW);
  }

  if (attempt.correct && !supported && !attempt.retry && attempt.timingReliable === true && attempt.level === skill.maxLevel) {
    next.recentLatencies.push(attempt.latencyMs);
    if (next.recentLatencies.length > 10) next.recentLatencies.shift();
    next.medianLatencyMs = median(next.recentLatencies);
  }

  // Each tier has its own independent, non-retry evidence.
  next.levelEvidence = { ...state.levelEvidence };
  const eligible = !supported && !attempt.retry;
  if (eligible) {
    const row = next.levelEvidence[attempt.level] ?? { attempts: 0, correct: 0, streak: 0 };
    next.levelEvidence[attempt.level] = {
      attempts: row.attempts + 1,
      correct: row.correct + Number(attempt.correct),
      streak: attempt.correct ? row.streak + 1 : 0,
    };
    next.evidenceVerified = true;
    next.demonstratedLevel = demonstratedLevel(next);
    if ((next.demonstratedLevel ?? 0) > (state.demonstratedLevel ?? 0)) {
      next.level = Math.min(skill.maxLevel, (next.demonstratedLevel ?? 0) + 1);
    }
    if (attempt.correct && attempt.level === state.level &&
        (next.levelEvidence[attempt.level]?.streak ?? 0) >= LEVEL_UP_STREAK &&
        (next.demonstratedLevel ?? 0) >= attempt.level) {
      next.level = Math.min(skill.maxLevel, attempt.level + 1);
    }
    if (!attempt.correct && attempt.level === state.level) {
      next.missStreak = state.missStreak + 1;
      if (next.missStreak >= LEVEL_DOWN_STREAK) {
        next.level = Math.max(1, attempt.level - 1);
        next.missStreak = 0;
      }
    } else if (attempt.correct) next.missStreak = 0;
    next.streak = next.levelEvidence[attempt.level]?.streak ?? 0;
  }

  // Recurrence reopens support; independent transfer retires historical errors.
  next.remediation = { ...state.remediation };
  for (const error of new Set(state.recentErrors)) {
    next.remediation[error] ??= { stage: 0, successes: 0, resolved: false };
  }
  if (!attempt.correct && attempt.errorType !== 'timeout' && attempt.errorType !== 'transposition') {
    next.remediation[attempt.errorType] = { stage: 0, successes: 0, resolved: false };
  } else if (attempt.correct) {
    for (const [error, outcome] of Object.entries(next.remediation)) {
      if (!outcome || outcome.resolved) continue;
      const relevant = attempt.targetError === error ||
        (error === 'regrouping' ? attempt.conceptTags?.includes('regrouping') :
          error === 'place-value' || error === 'off-by-ten' ? attempt.conceptTags?.includes('place-value') : true);
      if (!relevant) continue;
      const stage = attempt.remediationStage === 'concrete' ? 1 :
        attempt.remediationStage === 'faded' ? 2 : outcome.stage;
      const successes = outcome.successes + (eligible && attempt.level >= (state.demonstratedLevel ?? 1) ? 1 : 0);
      next.remediation[error as keyof typeof next.remediation] = {
        stage: eligible ? 2 : Math.max(outcome.stage, stage), successes, resolved: successes >= 3,
      };
    }
  }

  // ---- spaced repetition ----------------------------------------------
  const topEvidence = next.levelEvidence?.[skill.maxLevel];
  const independentEvidenceCount = Object.values(next.levelEvidence ?? {}).reduce((sum, row) => sum + row.attempts, 0);
  next.proficient = next.attempts >= MIN_ATTEMPTS &&
    independentEvidenceCount >= MIN_INDEPENDENT_ATTEMPTS &&
    (next.independentAccuracy ?? 0) >= PROFICIENT_ACCURACY &&
    (topEvidence?.attempts ?? 0) >= LEVEL_UP_STREAK &&
    (topEvidence ? topEvidence.correct / topEvidence.attempts : 0) >= PROFICIENT_ACCURACY &&
    (next.demonstratedLevel ?? 0) >= skill.maxLevel;
  next.fluent = skill.fluency && next.proficient && next.recentLatencies.length >= 6 &&
    next.medianLatencyMs !== null && next.medianLatencyMs <= latencyBandFor(state.skillId, skill.maxLevel);

  // Anchor to verification, not every practice touch: daily practice cannot
  // forever push a seven-day check into the future. Supported work never passes it.
  const anchor = state.retentionAnchorAt ?? state.lastSeenAt;
  const retentionEligible = eligible && attempt.level === skill.maxLevel && next.proficient;
  if (retentionEligible && attempt.correct) {
    if (anchor !== null && now - anchor >= RETENTION_GAP_DAYS * DAY) {
      next.retentionChecks = state.retentionChecks + 1;
      next.retentionAnchorAt = now;
    } else if (state.retentionAnchorAt == null) next.retentionAnchorAt = now;
  }
  if (eligible && !attempt.correct) {
    next.intervalDays = 1;
    next.retentionChecks = 0;
    next.retentionAnchorAt = now;
    next.dueAt = now + DAY;
  } else if (eligible && attempt.correct && attempt.level >= (state.demonstratedLevel ?? 1)) {
    if (state.lastSeenAt === null) {
      next.dueAt = now + DAY;
    } else if (now >= state.dueAt) {
      next.intervalDays = nextInterval(state.intervalDays);
      next.dueAt = now + next.intervalDays * DAY;
    }
  }
  if (next.proficient && next.retentionChecks < RETENTION_CHECKS_NEEDED) {
    next.dueAt = Math.min(next.dueAt, (next.retentionAnchorAt ?? now) + RETENTION_GAP_DAYS * DAY);
  }
  next.lastSeenAt = now;
  next.mastered = next.proficient && next.retentionChecks >= RETENTION_CHECKS_NEEDED;

  return next;
}

function ewma(previous: number | null, value: number): number {
  return previous === null ? value : previous + ACCURACY_ALPHA * (value - previous);
}

function nextInterval(current: number): number {
  if (current <= 1) return 3;
  if (current <= 3) return 7;
  if (current <= 7) return 16;
  return MAX_INTERVAL_DAYS;
}

/**
 * Open up any skill whose prerequisites are all proficient. Runs in
 * topological order so a chain can unlock in a single pass.
 */
export function propagateUnlocks(
  states: Record<SkillId, SkillState>,
): Record<SkillId, SkillState> {
  const next = { ...states };
  for (const skill of topoSortedSkills()) {
    const state = next[skill.id];
    if (!state || state.unlocked) continue;
    const ready = skill.requires.every((r) => conceptProficient(next[r]));
    if (ready) next[skill.id] = { ...state, unlocked: true };
  }
  return next;
}

export function latencyBandFor(skillId: SkillId, level: number): number {
  const skill = getSkill(skillId);
  const idx = Math.min(Math.max(level, 1), skill.maxLevel) - 1;
  return skill.latencyBandMs[idx] ?? skill.latencyBandMs.at(-1) ?? 15000;
}

/**
 * Hard ceiling before an item is scored as a timeout. Generous — three times
 * the fluency band — because sitting and thinking is not failure.
 */
export function timeoutMsFor(skillId: SkillId, level: number): number {
  return Math.max(45_000, latencyBandFor(skillId, level) * 3);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return (((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2) | 0;
}

/** 0..1 progress toward proficiency, for progress bars. */
export function progressToward(state: SkillState): number {
  const skill = getSkill(state.skillId);
  const levelPart = (state.demonstratedLevel ?? 0) / skill.maxLevel;
  const accPart = Math.min(1, (state.independentAccuracy ?? 0) / PROFICIENT_ACCURACY);
  const attemptPart = Math.min(1, state.attempts / MIN_ATTEMPTS);
  return Math.min(1, levelPart * 0.5 + accPart * 0.3 + attemptPart * 0.2);
}
