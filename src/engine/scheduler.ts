import { conceptProficient, practiceLevel } from './evidence';
import { Rng, randomSeed } from './rng';
import { generate } from './generators';
import { getSkill, SKILLS, STRAND_NAMES, topoSortedSkills } from './skills';
import type {
  BossMeta,
  ErrorType,
  SessionSlot,
  SkillId,
  SkillState,
  StrandId,
} from './types';

export interface PlannedItem {
  slot: SessionSlot;
  skillId: SkillId;
  level: number;
  seed: number;
  /**
   * Inserted immediately after a miss: same skill and level, fresh numbers.
   * Applying the correction while it is still fresh is what makes it stick,
   * and it means a miss ends on a success rather than on being told the
   * answer. Never chains — a retry that is missed again just moves on.
   */
  retry?: boolean;
  remediationStage?: 'concrete' | 'faded' | 'transfer';
  targetError?: ErrorType;
  boss?: BossMeta;
}

export interface MissionChoice {
  id: string;
  strand: StrandId;
  title: string;
  description: string;
  focusSkillIds: SkillId[];
}

export interface SessionOptions {
  focusStrand?: StrandId;
  /** The caller makes this occasional, normally every third completed run. */
  includeBoss?: boolean;
}

/**
 * The session mix. This is the single most important set of numbers in the
 * app: it is what stops the session degenerating into a review of things he
 * already knows.
 *
 * warmup   — mastered material, fast, to get him in the door with a win
 * review   — spaced retrieval of older skills that are due
 * working  — the 2-4 skills currently at the edge of his ability
 * new      — the next thing in the graph, freshly unlocked
 * stretch  — deliberately above his level; failure is free
 */
const MIX: Array<{ slot: SessionSlot; count: number }> = [
  { slot: 'warmup', count: 2 },
  { slot: 'review', count: 2 },
  { slot: 'working', count: 9 },
  { slot: 'new', count: 2 },
  { slot: 'stretch', count: 2 },
];

/** How many distinct skills may be active at once. */
const MAX_WORKING_SKILLS = 4;

const MISSION_TITLES: Record<StrandId, string> = {
  number: 'Decode the fossil map',
  addsub: 'Balance the amber vault',
  multdiv: 'Provision the hatchery',
  fractions: 'Repair the specimen tanks',
  measurement: 'Survey the dig site',
  geometry: 'Design the dinosaur paddock',
  reasoning: 'Crack the gene sequencer',
};

/** Two useful, distinct choices; both still include balanced review elsewhere. */
export function buildMissionChoices(
  states: Record<SkillId, SkillState>,
  now = Date.now(),
  seed = randomSeed(),
): [MissionChoice, MissionChoice] {
  const rng = new Rng(seed);
  const groups = new Map<StrandId, SkillState[]>();
  for (const skill of SKILLS) {
    const state = states[skill.id];
    if (!state?.unlocked || (state.mastered && conceptProficient(state))) continue;
    const list = groups.get(skill.strand) ?? [];
    list.push(state);
    groups.set(skill.strand, list);
  }

  const ranked = [...groups.entries()]
    .map(([strand, skillStates]) => ({
      strand,
      skillStates: [...skillStates].sort((a, b) => statePriority(b, now) - statePriority(a, now)),
      score: Math.max(...skillStates.map((s) => statePriority(s, now))) + rng.next() * 4,
    }))
    .sort((a, b) => b.score - a.score);

  // A healthy profile always has several rooted strands. Keep a defensive
  // fallback so corrupt/legacy data still gets two tappable choices.
  const first = ranked[0] ?? {
    strand: 'addsub' as StrandId,
    skillStates: [states['add-20']].filter((s): s is SkillState => !!s),
    score: 0,
  };
  const second = ranked.find((x) => x.strand !== first.strand) ?? ranked[1] ?? {
    strand: 'reasoning' as StrandId,
    skillStates: [states['function-machine']].filter((s): s is SkillState => !!s),
    score: 0,
  };

  const toMission = (row: typeof first): MissionChoice => {
    const focusSkillIds = row.skillStates.slice(0, 2).map((s) => s.skillId);
    const names = focusSkillIds.map((id) => getSkill(id).labName);
    return {
      id: `mission:${row.strand}`,
      strand: row.strand,
      title: MISSION_TITLES[row.strand],
      description:
        names.length > 0
          ? `Focus on ${names.join(' and ')} with review from the rest of the lab.`
          : `Explore ${STRAND_NAMES[row.strand]}.`,
      focusSkillIds,
    };
  };

  return [toMission(first), toMission(second)];
}

export function buildSession(
  states: Record<SkillId, SkillState>,
  now = Date.now(),
  seed = randomSeed(),
  options: SessionOptions = {},
): PlannedItem[] {
  const rng = new Rng(seed);
  const all = SKILLS.map((s) => states[s.id]).filter(
    (s): s is SkillState => s !== undefined,
  );
  const unlocked = all.filter((s) => s.unlocked);

  // ---- pools ------------------------------------------------------------
  const workingPool = pickWorkingSet(unlocked, now, options.focusStrand);
  const workingIds = new Set(workingPool.map((s) => s.skillId));

  const reviewPool = unlocked
    .filter((s) => s.attempts > 0 && s.dueAt <= now && (!workingIds.has(s.skillId) || conceptProficient(s)))
    .sort((a, b) => a.dueAt - b.dueAt);

  const warmupPool = unlocked
    .filter((s) => (s.accuracy ?? 0) >= 0.75 && s.attempts >= 4)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0));

  const newPool = unlocked
    .filter((s) => s.attempts === 0 && !s.placementSeen)
    .sort(
      (a, b) =>
        Number(getSkill(b.skillId).strand === options.focusStrand) -
          Number(getSkill(a.skillId).strand === options.focusStrand) ||
        (b.placementLevel ?? 0) - (a.placementLevel ?? 0) ||
        getSkill(a.skillId).requires.length - getSkill(b.skillId).requires.length,
    );

  const items: PlannedItem[] = [];

  for (const { slot, count } of MIX) {
    for (let i = 0; i < count; i++) {
      const item = pickFor(slot, i, {
        rng,
        states,
        workingPool,
        reviewPool,
        warmupPool,
        newPool,
      });
      if (item) items.push(item);
    }
  }

  let ordered = interleave(items, rng);

  if (options.includeBoss) {
    ordered = insertBossInvestigation(ordered, states, options.focusStrand, rng);
  }

  ordered = applyMisconceptionStages(ordered, states).map(retargetPlannedItem);

  // Always finish on something he can do. A session that ends in a failure is
  // a session he is slower to come back to tomorrow.
  const closer = warmupPool[0] ?? workingPool[0];
  if (closer) {
    ordered.push({
      slot: 'warmup',
      skillId: closer.skillId,
      level: Math.max(1, practiceLevel(closer) - (closer.attempts > 0 ? 0 : 1)),
      seed: rng.int(1, 2 ** 30),
    });
  }

  return ordered;
}

interface PickCtx {
  rng: Rng;
  states: Record<SkillId, SkillState>;
  workingPool: SkillState[];
  reviewPool: SkillState[];
  warmupPool: SkillState[];
  newPool: SkillState[];
}

function pickFor(slot: SessionSlot, i: number, ctx: PickCtx): PlannedItem | null {
  const { rng } = ctx;
  const seed = rng.int(1, 2 ** 30);

  switch (slot) {
    case 'warmup': {
      const pool = ctx.warmupPool.length > 0 ? ctx.warmupPool : ctx.workingPool;
      const s = pool[i % Math.max(1, pool.length)];
      if (!s) return null;
      // Warm-ups sit one tier below his working level: confidence, not challenge.
      return { slot, skillId: s.skillId, level: Math.max(1, practiceLevel(s) - 1), seed };
    }

    case 'review': {
      const s = ctx.reviewPool[i % Math.max(1, ctx.reviewPool.length)];
      // Nothing due yet is the normal case in week one — fall through to more
      // working-set practice rather than padding with filler.
      if (!s) return null;
      return { slot, skillId: s.skillId, level: practiceLevel(s), seed };
    }

    case 'working': {
      const s = ctx.workingPool[i % Math.max(1, ctx.workingPool.length)];
      if (!s) return null;
      return { slot, skillId: s.skillId, level: practiceLevel(s), seed };
    }

    case 'new': {
      const s = ctx.newPool[i % Math.max(1, ctx.newPool.length)];
      if (!s) return null;
      return { slot, skillId: s.skillId, level: 1, seed };
    }

    case 'stretch': {
      // Preference order: a genuinely new skill just beyond the frontier,
      // then a harder tier of something he is already working on.
      const frontier = nextLockedSkill(ctx.states);
      if (frontier && i === 0) {
        return { slot, skillId: frontier, level: 1, seed };
      }
      const s = ctx.workingPool[i % Math.max(1, ctx.workingPool.length)];
      if (!s) return null;
      const skill = getSkill(s.skillId);
      return {
        slot,
        skillId: s.skillId,
        level: Math.min(skill.maxLevel, practiceLevel(s) + 1),
        seed,
      };
    }
    case 'boss':
      // Boss chapters are injected as a linked sequence after interleaving.
      return null;
  }
}

/**
 * The 2-4 skills that get the bulk of the session. Prefers skills already in
 * progress over untouched ones, and skills that are overdue over fresh ones,
 * so he finishes things rather than collecting half-learned fragments.
 */
function pickWorkingSet(
  unlocked: SkillState[],
  now: number,
  focusStrand?: StrandId,
): SkillState[] {
  const candidates = unlocked.filter((s) => !(s.mastered && conceptProficient(s)));
  const scored = candidates.map((s) => ({
    state: s,
    score:
      statePriority(s, now) +
      (getSkill(s.skillId).strand === focusStrand ? 70 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);

  const selected: SkillState[] = [];
  const selectedIds = new Set<SkillId>();
  const usedStrands = new Set<StrandId>();

  // The chosen mission gets two seats when it has enough useful work.
  for (const row of scored) {
    if (selected.length >= 2) break;
    if (getSkill(row.state.skillId).strand !== focusStrand) continue;
    selected.push(row.state);
    selectedIds.add(row.state.skillId);
    usedStrands.add(getSkill(row.state.skillId).strand);
  }

  // Then take the strongest candidate from different strands. This removes
  // the old stable-sort bias toward the first four entries in SKILLS.
  for (const row of scored) {
    if (selected.length >= MAX_WORKING_SKILLS) break;
    const strand = getSkill(row.state.skillId).strand;
    if (selectedIds.has(row.state.skillId) || usedStrands.has(strand)) continue;
    selected.push(row.state);
    selectedIds.add(row.state.skillId);
    usedStrands.add(strand);
  }

  for (const row of scored) {
    if (selected.length >= MAX_WORKING_SKILLS) break;
    if (selectedIds.has(row.state.skillId)) continue;
    selected.push(row.state);
    selectedIds.add(row.state.skillId);
  }
  return selected;
}

function statePriority(state: SkillState, now: number): number {
  let score = 0;
  if (state.attempts > 0 && !state.proficient) score += 100;
  if (state.dueAt <= now && state.lastSeenAt !== null) score += 40;
  if (state.proficient && !state.mastered) score += 20;
  score += Math.max(0, 20 - state.attempts);
  // Placement frontiers should appear immediately, without pretending those
  // few probes were ordinary practice attempts.
  score += (state.placementLevel ?? 0) * 12;
  if (dominantMisconception(state)) score += 45;
  return score;
}

/**
 * The next skill in topological order whose prerequisites are all at least
 * partly under way. This is the "extend his horizon" pick — something he has
 * not formally unlocked, offered as a research challenge.
 */
function nextLockedSkill(states: Record<SkillId, SkillState>): SkillId | null {
  for (const skill of topoSortedSkills()) {
    const state = states[skill.id];
    if (!state || state.unlocked) continue;
    const nearlyReady = skill.requires.every(
      (r) => (states[r]?.accuracy ?? 0) >= 0.6,
    );
    if (nearlyReady) return skill.id;
  }
  return null;
}

/** A misconception becomes actionable after it appears twice in the last six misses. */
export function dominantMisconception(state: SkillState): ErrorType | null {
  const recent = state.recentErrors.slice(-6);
  const counts = new Map<ErrorType, number>();
  for (const error of recent) {
    if (error === 'transposition' || error === 'timeout' || state.remediation?.[error]?.resolved) continue;
    counts.set(error, (counts.get(error) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return (ranked[0]?.[1] ?? 0) >= 2 ? (ranked[0]?.[0] ?? null) : null;
}

/**
 * Search deterministically for a generated variant carrying the structural tag
 * that matches the diagnosed error. The stored seed is the selected seed, so
 * reconstruction remains exact.
 */
export function retargetPlannedItem(item: PlannedItem): PlannedItem {
  if (!item.targetError || item.remediationStage === 'concrete') return item;
  const wanted = targetTag(item.targetError);
  if (!wanted) return item;
  for (let offset = 0; offset < 40; offset++) {
    const seed = item.seed + offset;
    const problem = generate(item.skillId, item.level, seed);
    if (problem.meta?.tags?.includes(wanted)) return { ...item, seed };
  }
  return item;
}

function targetTag(error: ErrorType): string | null {
  if (error === 'regrouping') return 'regrouping';
  if (error === 'place-value' || error === 'off-by-ten') return 'place-value';
  return null;
}

/**
 * Recurring errors receive concrete support, then a faded cue, then an
 * independent transfer item. These are ordinary scheduled items, so the
 * sequence can continue across sessions even when the triggering miss was
 * yesterday.
 */
function applyMisconceptionStages(
  items: PlannedItem[],
  states: Record<SkillId, SkillState>,
): PlannedItem[] {
  const stages = ['concrete', 'faded', 'transfer'] as const;
  const seen = new Map<SkillId, number>();
  return items.map((item) => {
    if (item.slot !== 'working') return item;
    const state = states[item.skillId];
    if (!state) return item;
    const targetError = dominantMisconception(state);
    if (!targetError) return item;
    const index = seen.get(item.skillId) ?? state.remediation?.[targetError]?.stage ?? 0;
    seen.set(item.skillId, index + 1);
    if (index >= stages.length) return item;
    const remediationStage = stages[index];
    return {
      ...item,
      level: remediationStage === 'concrete' ? Math.max(1, item.level - 1) : item.level,
      remediationStage,
      targetError,
    };
  });
}

/** Insert a linked two-part investigation without lengthening the session. */
function insertBossInvestigation(
  items: PlannedItem[],
  states: Record<SkillId, SkillState>,
  focusStrand: StrandId | undefined,
  rng: Rng,
): PlannedItem[] {
  const candidates = ['add-100', 'add-20']
    .map((id) => states[id])
    .filter((s): s is SkillState => !!s?.unlocked);
  const bossState =
    candidates.find((s) => getSkill(s.skillId).strand === focusStrand) ?? candidates[0];
  if (!bossState) return items;

  const storySeed = rng.int(1, 2 ** 30);
  const id = `boss-${storySeed}`;
  const chapters: PlannedItem[] = [1, 2].map((step) => ({
    slot: 'boss',
    skillId: bossState.skillId,
    level: bossState.level,
    seed: storySeed + step,
    boss: { id, step, total: 2, storySeed },
  }));

  const trimmed = [...items];
  let removed = 0;
  for (let i = trimmed.length - 1; i >= 0 && removed < chapters.length; i--) {
    if (trimmed[i]?.slot !== 'working') continue;
    trimmed.splice(i, 1);
    removed++;
  }
  if (removed < chapters.length) return items;
  const at = Math.max(2, Math.floor(trimmed.length * 0.58));
  trimmed.splice(at, 0, ...chapters);
  return trimmed;
}

/**
 * Spread the slots through the session rather than running them in blocks, and
 * avoid two questions on the same skill back to back — consecutive repeats let
 * him pattern-match the last answer instead of reading the new question.
 */
function interleave(items: PlannedItem[], rng: Rng): PlannedItem[] {
  const warmups = items.filter((i) => i.slot === 'warmup');
  const rest = rng.shuffle(items.filter((i) => i.slot !== 'warmup'));

  const out: PlannedItem[] = [...warmups];
  const pending = [...rest];

  while (pending.length > 0) {
    const lastSkill = out.at(-1)?.skillId;
    let idx = pending.findIndex((p) => p.skillId !== lastSkill);
    if (idx === -1) idx = 0; // only repeats left; accept one
    out.push(pending.splice(idx, 1)[0] as PlannedItem);
  }

  return out;
}

/** Rough wall-clock estimate, used for the "about N minutes" label. */
export function estimateMinutes(items: PlannedItem[]): number {
  const seconds = items.reduce((total, item) => {
    const skill = getSkill(item.skillId);
    return total + (item.slot === 'boss' ? 50 : skill.fluency ? 12 : 38);
  }, 0);
  return Math.max(5, Math.round(seconds / 60));
}
