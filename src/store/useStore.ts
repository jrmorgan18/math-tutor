import { conceptProficient } from '../engine/evidence';
import { create } from 'zustand';
import { generate } from '../engine/generators';
import { generateBossProblem } from '../engine/generators/boss';
import { classify, normalise } from '../engine/errors';
import { applyAttempt, initialSkillStates, propagateUnlocks, timeoutMsFor } from '../engine/mastery';
import {
  advanceStrand,
  currentProbe,
  PLACEMENT_STRANDS,
  probeSeed,
  seedFromPlacement,
  startStrand,
  type StrandRun,
} from '../engine/placement';
import {
  buildSession,
  retargetPlannedItem,
  type MissionChoice,
  type PlannedItem,
} from '../engine/scheduler';
import { randomSeed, Rng } from '../engine/rng';
import type { Attempt, ErrorType, Problem, SessionSlot, SkillId } from '../engine/types';
import { DINOSAURS, dinoById, isGateOpen, nextTarget } from '../content/dinosaurs';
import { personalizeFlavor } from '../content/personalize';
import {
  currentExpedition,
  EXPEDITION_REWARD_DNA,
  expeditionComplete,
  recordSession,
} from '../content/expeditions';
import {
  loadActivePlacement,
  loadActiveSession,
  loadAttempts,
  loadBackup,
  loadProfile,
  newProfile,
  resetAll,
  restoreBackup,
  saveProfile,
  saveLearningCheckpoint,
  savePlacementCheckpoint,
  todayKey,
  type Profile,
} from './db';
import {
  discoveryForAward,
  POST_CAP_CORRECT_PER_DISCOVERY,
} from '../content/discoveries';

/**
 * DNA award per session slot.
 *
 * Deliberately steepest for `new` and `stretch`. Warm-ups on mastered material
 * pay least, so the fastest route to a dinosaur is always the hardest
 * material he can handle — never the easiest.
 */
const DNA_AWARD: Record<SessionSlot, number> = {
  warmup: 2,
  review: 3,
  working: 4,
  new: 6,
  stretch: 8,
  boss: 7,
};

/**
 * Daily earning ceiling. Without this, a determined seven-year-old can farm
 * warm-up questions all afternoon and unlock everything without learning
 * anything. He can keep playing past the cap; it just stops paying.
 */
const DAILY_DNA_CAP = 150;

/**
 * Combo thresholds and their bonus DNA. Momentum within a session is what a
 * flat list of 21 questions completely lacks — this gives the middle of a
 * session something to build toward that isn't the far-off dinosaur.
 */
const COMBO_BONUSES: Record<number, number> = { 3: 3, 6: 5, 10: 8, 15: 12 };

/**
 * How often Dr. Wu gets one right.
 *
 * Deliberately accuracy-based and never speed-based: a clock would
 * reintroduce time pressure on brand-new concepts, which the whole design
 * avoids. Wu is beatable but not a pushover — calibrated so a good session
 * wins and a sloppy one doesn't.
 */
const RIVAL_ACCURACY = 0.74;

/** Whether Dr. Wu answers item `index` correctly. Deterministic per session. */
function rivalAnswers(rivalSeed: number, index: number): boolean {
  return new Rng(rivalSeed + index * 7919).next() < RIVAL_ACCURACY;
}

/** Generate a session problem and personalize its flavor text against his collection. */
function generateForSession(item: PlannedItem, hatched: string[]) {
  const problem = item.boss
    ? generateBossProblem(item.boss, item.skillId, item.level)
    : generate(item.skillId, item.level, item.seed);
  return personalizeFlavor(problem, hatched, item.seed);
}

export type Screen =
  | 'loading'
  | 'welcome'
  | 'placement'
  | 'home'
  | 'briefing'
  | 'session'
  | 'recap'
  | 'paddock'
  | 'parent';

export interface SessionRun {
  plan: PlannedItem[];
  index: number;
  problem: Problem | null;
  itemStartedAt: number;
  hintsUsed: number;
  automaticHints?: number;
  requestedHints?: number;
  timingInterrupted?: boolean;
  phase: 'answering' | 'feedback';
  lastResult: {
    correct: boolean;
    errorType: ErrorType;
    dna: number;
    expected: string;
    discoveryId: string | null;
    discoveryProgress: number;
  } | null;
  pending: Attempt[];
  dnaEarned: number;
  correctCount: number;
  hatchedThisSession: string[];
  /** Consecutive correct answers right now, and the best run this session. */
  combo: number;
  bestCombo: number;
  /** Bonus DNA awarded by the most recent combo threshold, for the UI to flash. */
  lastComboBonus: number;
  /** Dr. Wu's running score — see `rivalAnswers`. */
  rivalScore: number;
  /** Seed for the rival's deterministic answers this session. */
  rivalSeed: number;
  /**
   * Skills that crossed into proficiency during this session. Feeds the weekly
   * expedition, and is the honest measure of "something moved forward today"
   * — unlike DNA, it cannot be earned by grinding what he already knows.
   */
  skillsAdvanced: string[];
  /**
   * Set once, by finishSession, comparing this session's result against the
   * *previous* best before that best was overwritten on the profile — so
   * Recap.tsx can say "new record" without re-deriving something that's
   * already been clobbered by the time it reads `profile`.
   */
  newRecord: { accuracy: boolean; dna: boolean } | null;
  /** Set by finishSession when this session completed the week's expedition. */
  expeditionCompleted: boolean;
  discoveriesThisSession: string[];
}

export interface PlacementRun {
  runs: StrandRun[];
  strandIdx: number;
  problem: Problem | null;
  asked: number;
  correct: number;
  startedAt: number;
}

interface Store {
  screen: Screen;
  profile: Profile | null;
  attempts: Attempt[];
  session: SessionRun | null;
  placement: PlacementRun | null;
  /** Set when a dinosaur completes, so the UI can play the hatch sequence. */
  celebrating: string | null;
  selectedMission: MissionChoice | null;

  init: () => Promise<void>;
  createProfile: (name: string, avatar: string) => Promise<void>;
  reset: () => Promise<void>;
  /** Undo the last reset/import. Returns false when there is nothing to undo. */
  restoreFromBackup: () => Promise<boolean>;
  /** Whether a restorable snapshot exists, for showing the undo affordance. */
  backupInfo: () => Promise<{ at: number; reason: string; name: string } | null>;
  setScreen: (screen: Screen) => void;
  toggleSound: () => void;
  toggleReadAloud: () => void;
  setAvatar: (avatar: string) => void;
  chooseMission: (mission: MissionChoice) => void;

  beginPlacement: () => void;
  answerPlacement: (given: string) => void;

  beginSession: () => void;
  submitAnswer: (given: string, timedOut?: boolean, timing?: { latencyMs: number; timingReliable: boolean; chosenOperation?: string }) => Promise<void>;
  useHint: () => void;
  revealHintsTo: (rung: number) => void;
  recordSelfDiagnosis: (bucket: Attempt['selfDiagnosis']) => void;
  nextItem: () => Promise<void>;
  abandonSession: () => Promise<void>;
  closeRecap: () => void;

  setSequencingTarget: (dinoId: string) => void;
  dismissCelebration: () => void;

  isProficient: (skillId: SkillId) => boolean;
}

export const useStore = create<Store>((set, get) => ({
  screen: 'loading',
  profile: null,
  attempts: [],
  session: null,
  placement: null,
  celebrating: null,
  selectedMission: null,

  async init() {
    const [profile, attempts, activeSession, activePlacement] = await Promise.all([
      loadProfile(),
      loadAttempts(),
      loadActiveSession<SessionRun>(),
      loadActivePlacement<PlacementRun>(),
    ]);
    if (!profile) {
      set({ screen: 'welcome', profile: null, attempts: [] });
      return;
    }
    const resumeSession = profile.placementDone && activeSession
      ? { ...activeSession, itemStartedAt: Date.now(), timingInterrupted: true } : null;
    const resumePlacement = !profile.placementDone ? activePlacement : null;
    set({
      profile,
      attempts,
      session: resumeSession,
      placement: resumePlacement,
      screen: resumeSession ? 'session' : profile.placementDone ? 'home' : 'placement',
    });
  },

  async createProfile(name, avatar) {
    const profile = newProfile(name.trim() || 'Scientist', initialSkillStates(), avatar);
    await saveProfile(profile);
    set({ profile, screen: 'placement', selectedMission: null });
    get().beginPlacement();
  },

  /**
   * Wipe local progress. `resetAll` snapshots first, so this is undoable via
   * `restoreFromBackup` right up until the next reset or import.
   */
  async reset() {
    await resetAll();
    set({
      profile: null,
      attempts: [],
      session: null,
      placement: null,
      selectedMission: null,
      screen: 'welcome',
    });
  },

  async restoreFromBackup() {
    const profile = await restoreBackup();
    if (!profile) return false;
    const attempts = await loadAttempts();
    set({
      profile,
      attempts,
      session: null,
      placement: null,
      selectedMission: null,
      screen: profile.placementDone ? 'home' : 'placement',
    });
    return true;
  },

  async backupInfo() {
    const snapshot = await loadBackup();
    if (!snapshot) return null;
    const name =
      snapshot.profile && typeof snapshot.profile === 'object'
        ? String((snapshot.profile as { name?: unknown }).name ?? 'Scientist')
        : 'Scientist';
    return { at: snapshot.at, reason: snapshot.reason, name };
  },

  setScreen(screen) {
    set({ screen });
  },

  toggleSound() {
    const { profile } = get();
    if (!profile) return;
    const next = { ...profile, soundOn: !profile.soundOn };
    set({ profile: next });
    void saveProfile(next);
  },

  toggleReadAloud() {
    const { profile } = get();
    if (!profile) return;
    const next = { ...profile, readAloud: !profile.readAloud };
    set({ profile: next });
    void saveProfile(next);
  },

  setAvatar(avatar) {
    const { profile } = get();
    if (!profile) return;
    const next = { ...profile, avatar };
    set({ profile: next });
    void saveProfile(next);
  },

  chooseMission(mission) {
    set({ selectedMission: mission, screen: 'briefing' });
  },

  // ------------------------------------------------------------- placement
  beginPlacement() {
    const runs = PLACEMENT_STRANDS.map(startStrand);
    const first = runs[0];
    const probe = first ? currentProbe(first) : null;
    const placement: PlacementRun = {
        runs,
        strandIdx: 0,
        problem: probe ? generate(probe.skillId, probe.level, probeSeed()) : null,
        asked: 0,
        correct: 0,
        startedAt: Date.now(),
      };
    set({ screen: 'placement', placement });
    void savePlacementCheckpoint(placement);
  },

  answerPlacement(given) {
    const state = get();
    const p = state.placement;
    if (!p || !p.problem) return;

    const correct = normalise(given) === normalise(p.problem.answer);
    const runs = [...p.runs];
    const active = runs[p.strandIdx];
    if (!active) return;

    runs[p.strandIdx] = advanceStrand(active, correct);

    // Walk to the next strand that still has probes left.
    let idx = p.strandIdx;
    while (idx < runs.length && runs[idx]?.done) idx++;

    if (idx >= runs.length) {
      // Placement complete — seed the profile and open the lab.
      const seeded = propagateUnlocks(seedFromPlacement(runs));
      const profile = get().profile;
      if (profile) {
        const next: Profile = { ...profile, placementDone: true, skillStates: seeded };
        void Promise.all([saveProfile(next), savePlacementCheckpoint(null)]);
        set({ profile: next, placement: null, screen: 'home' });
      }
      return;
    }

    const nextRun = runs[idx];
    const probe = nextRun ? currentProbe(nextRun) : null;
    const placement: PlacementRun = {
        ...p,
        runs,
        strandIdx: idx,
        asked: p.asked + 1,
        correct: p.correct + (correct ? 1 : 0),
        problem: probe ? generate(probe.skillId, probe.level, probeSeed()) : null,
      };
    set({ placement });
    void savePlacementCheckpoint(placement);
  },

  // --------------------------------------------------------------- session
  beginSession() {
    const { profile, selectedMission } = get();
    if (!profile) return;
    const plan = buildSession(profile.skillStates, Date.now(), randomSeed(), {
      focusStrand: selectedMission?.strand,
      includeBoss: (profile.sessionsCompleted + 1) % 3 === 0,
    });
    const first = plan[0];
    if (!first) return;

    const session: SessionRun = {
        plan,
        index: 0,
        problem: generateForSession(first, profile.hatched),
        itemStartedAt: Date.now(),
        hintsUsed: 0,
        automaticHints: 0,
        requestedHints: 0,
        phase: 'answering',
        lastResult: null,
        pending: [],
        dnaEarned: 0,
        correctCount: 0,
        hatchedThisSession: [],
        newRecord: null,
        combo: 0,
        bestCombo: 0,
        lastComboBonus: 0,
        rivalScore: 0,
        rivalSeed: randomSeed(),
        skillsAdvanced: [],
        expeditionCompleted: false,
        discoveriesThisSession: [],
      };
    set({ screen: 'session', session });
    void saveLearningCheckpoint(profile, get().attempts, session);
  },

  async submitAnswer(given, timedOut = false, timing) {
    const state = get();
    const s = state.session;
    const profile = state.profile;
    if (!s || !s.problem || !profile || s.phase !== 'answering') return;

    const item = s.plan[s.index];
    if (!item) return;

    const latencyMs = timing?.latencyMs ?? Date.now() - s.itemStartedAt;
    const correct = !timedOut && normalise(given) === normalise(s.problem.answer);
    const errorType = classify(s.problem, given, latencyMs, timedOut);

    const attempt: Attempt = {
      id: `${Date.now()}-${s.index}`,
      skillId: item.skillId,
      level: item.level,
      seed: item.seed,
      given,
      expected: s.problem.answer,
      correct,
      errorType,
      latencyMs,
      hintsUsed: s.hintsUsed,
      automaticHints: s.automaticHints,
      requestedHints: s.requestedHints,
      timingReliable: !s.timingInterrupted && (timing?.timingReliable ?? false),
      chosenOperation: timing?.chosenOperation,
      slot: item.slot,
      at: Date.now(),
      retry: item.retry,
      remediationStage: item.remediationStage,
      targetError: item.targetError,
      conceptTags: s.problem.meta?.tags,
      boss: item.boss,
    };

    // ---- mastery ---------------------------------------------------------
    const prior = profile.skillStates[item.skillId];
    let skillStates = profile.skillStates;
    let skillsAdvanced = s.skillsAdvanced;
    if (prior) {
      const updated = applyAttempt(prior, attempt);
      skillStates = propagateUnlocks({
        ...profile.skillStates,
        [item.skillId]: updated,
      });
      // The moment a skill crosses into proficiency is the one genuinely
      // new thing that happened this session — record it for the expedition.
      if (!prior.proficient && updated.proficient) {
        skillsAdvanced = [...s.skillsAdvanced, item.skillId];
      }
    }

    // ---- DNA -------------------------------------------------------------
    const day = todayKey();
    const sameDay = profile.dailyDnaDay === day;
    const earnedToday = sameDay ? profile.dailyDna : 0;
    const remainingToday = Math.max(0, DAILY_DNA_CAP - earnedToday);

    // ---- combo -----------------------------------------------------------
    const freeStretchMiss = item.slot === 'stretch' && !correct;
    const combo = correct ? s.combo + 1 : freeStretchMiss ? s.combo : 0;
    const comboBonus = correct ? (COMBO_BONUSES[combo] ?? 0) : 0;

    let award = 0;
    if (correct) {
      const base = DNA_AWARD[item.slot];
      // Hints halve the reward but never zero it — asking for help must stay
      // clearly better than guessing. A retry is a second bite, so it pays
      // less than getting it right first time but more than nothing.
      award = s.hintsUsed > 0 ? Math.max(1, Math.floor(base / 2)) : base;
      if (item.retry) award = Math.max(1, Math.floor(award / 2));
      award += comboBonus;
      award = Math.min(award, remainingToday);
    }

    // ---- Dr. Wu ----------------------------------------------------------
    // Wu sits out warm-ups (they're not a contest) so the score reflects the
    // real work.
    const rivalPlayed = item.slot !== 'warmup' && item.slot !== 'stretch';
    const rivalGotIt = rivalPlayed && rivalAnswers(s.rivalSeed, s.index);

    // ---- retry -----------------------------------------------------------
    // A miss on real working material earns an immediate second attempt at a
    // fresh problem of the same kind, so the explanation he just read gets
    // used rather than filed away.
    let plan = s.plan;
    if (
      !correct &&
      !item.retry &&
      !item.remediationStage &&
      s.plan.filter(p => p.retry).length < 3 && s.plan.length < 21 &&
      (item.slot === 'working' || item.slot === 'new') &&
      errorType !== 'likely-guess'
    ) {
      const updatedState = skillStates[item.skillId];
      const repeats = updatedState?.recentErrors
        .slice(-6)
        .filter((error) => error === errorType).length ?? 0;
      const stages = repeats >= 2
        ? (['concrete'] as const)
        : (['transfer'] as const);
      const retryItems: PlannedItem[] = stages.map((remediationStage) =>
        retargetPlannedItem({
          ...item,
          level:
            remediationStage === 'concrete' ? Math.max(1, item.level - 1) : item.level,
          seed: randomSeed(),
          retry: true,
          remediationStage,
          targetError: errorType,
        }),
      );
      plan = [
        ...s.plan.slice(0, s.index + 1),
        ...retryItems,
        ...s.plan.slice(s.index + 1),
      ];
    }

    let { profile: afterDna, hatched } = applyDna(
      { ...profile, skillStates },
      award,
      day,
      earnedToday,
    );

    let discoveryId: string | null = null;
    let discoveryProgress = 0;
    if (correct && remainingToday === 0) {
      const discovery = advancePostCapDiscovery(afterDna, day);
      afterDna = discovery.profile;
      discoveryId = discovery.discoveryId;
      discoveryProgress = discovery.progress;
    }

    const nextAttempts = [...state.attempts, attempt];
    const nextSession: SessionRun = {
        ...s,
        plan,
        phase: 'feedback',
        lastResult: {
          correct,
          errorType,
          dna: award,
          expected: s.problem.answer,
          discoveryId,
          discoveryProgress,
        },
        pending: [...s.pending, attempt],
        dnaEarned: s.dnaEarned + award,
        correctCount: s.correctCount + (correct ? 1 : 0),
        hatchedThisSession: [...s.hatchedThisSession, ...hatched],
        combo,
        bestCombo: Math.max(s.bestCombo, combo),
        lastComboBonus: comboBonus,
        rivalScore: s.rivalScore + (rivalGotIt ? 1 : 0),
        skillsAdvanced,
        discoveriesThisSession: discoveryId
          ? [...s.discoveriesThisSession, discoveryId]
          : s.discoveriesThisSession,
      };

    set({
      profile: afterDna,
      attempts: nextAttempts,
      celebrating: hatched[0] ?? null,
      session: nextSession,
    });
    await saveLearningCheckpoint(afterDna, nextAttempts, nextSession);
  },

  useHint() {
    const s = get().session;
    if (!s || !s.problem) return;
    // Never jump straight to the worked solution — the ladder is walked one
    // rung at a time.
    const max = s.problem.hints.length;
    const session = { ...s, hintsUsed: Math.min(max, s.hintsUsed + 1),
      requestedHints: (s.requestedHints ?? 0) + Number(s.hintsUsed < max) };
    set({ session });
    const { profile, attempts } = get();
    if (profile) void saveLearningCheckpoint(profile, attempts, session);
  },

  /**
   * Open the ladder partway down without him tapping for it — used on retry
   * items, where the rung that addresses his actual mistake is more useful
   * than the generic opener he already read. Never reveals the final worked
   * solution; that still has to be asked for.
   */
  revealHintsTo(rung) {
    const s = get().session;
    if (!s || !s.problem) return;
    const ceiling = Math.max(0, s.problem.hints.length - 1);
    const session = {
      ...s,
      hintsUsed: Math.max(s.hintsUsed, Math.min(rung, ceiling)),
      automaticHints: (s.automaticHints ?? 0) + Math.max(0, Math.min(rung, ceiling) - s.hintsUsed),
    };
    set({ session });
    const { profile, attempts } = get();
    if (profile) void saveLearningCheckpoint(profile, attempts, session);
  },

  /**
   * Attach his self-reported "where did it go wrong" guess to the attempt
   * that was just recorded. Safe to mutate in place: `pending` isn't written
   * to IndexedDB until nextItem/finishSession, so this always lands before
   * persistence.
   */
  recordSelfDiagnosis(bucket) {
    const s = get().session;
    if (!s || s.pending.length === 0) return;
    const pending = [...s.pending];
    const lastIdx = pending.length - 1;
    const last = pending[lastIdx];
    if (!last) return;
    const revised = { ...last, selfDiagnosis: bucket };
    pending[lastIdx] = revised;
    const attempts = get().attempts.map((attempt) =>
      attempt.id === revised.id ? revised : attempt,
    );
    const session = { ...s, pending };
    set({ session, attempts });
    const profile = get().profile;
    if (profile) void saveLearningCheckpoint(profile, attempts, session);
  },

  async nextItem() {
    const s = get().session;
    const profile = get().profile;
    if (!s) return;

    const index = s.index + 1;
    if (index >= s.plan.length) {
      await finishSession();
      return;
    }

    const item = s.plan[index];
    if (!item) {
      await finishSession();
      return;
    }

    const session: SessionRun = {
        ...s,
        index,
        problem: generateForSession(item, profile?.hatched ?? []),
        itemStartedAt: Date.now(),
        hintsUsed: 0,
        automaticHints: 0,
        requestedHints: 0,
        timingInterrupted: false,
        phase: 'answering',
        lastResult: null,
      };
    set({ session });
    const attempts = get().attempts;
    if (profile) await saveLearningCheckpoint(profile, attempts, session);
  },

  async abandonSession() {
    const { profile, attempts } = get();
    if (profile) await saveLearningCheckpoint(profile, attempts, null);
    set({ session: null, selectedMission: null, screen: 'home' });
  },

  /** Leave the recap screen and clear the finished session. */
  closeRecap() {
    set({ session: null, selectedMission: null, screen: 'home' });
  },

  setSequencingTarget(dinoId) {
    const { profile } = get();
    if (!profile || profile.hatched.includes(dinoId)) return;
    // Enforce the skill gate here too, not just in the UI — this is the rule
    // the whole reward design rests on, so it is checked at the boundary.
    const dino = dinoById(dinoId);
    if (!dino || !isGateOpen(dino, profile.hatched, (id) => conceptProficient(profile.skillStates[id]))) {
      return;
    }
    const next: Profile = {
      ...profile,
      sequencing: { dinoId, progress: profile.sequencing?.progress ?? 0 },
    };
    set({ profile: next });
    void saveProfile(next);
  },

  dismissCelebration() {
    set({ celebrating: null });
  },

  isProficient(skillId) {
    return conceptProficient(get().profile?.skillStates[skillId]);
  },
}));

/**
 * Route awarded DNA into the genome currently being sequenced, hatching and
 * rolling any surplus into the next one. Returns every dinosaur completed by
 * this award (normally zero or one).
 */
export function applyDna(
  profile: Profile,
  award: number,
  day: string,
  earnedToday: number,
): { profile: Profile; hatched: string[] } {
  let next: Profile = {
    ...profile,
    totalDna: profile.totalDna + award,
    dailyDna: earnedToday + award,
    dailyDnaDay: day,
  };

  if (award === 0) return { profile: next, hatched: [] };

  const hatched: string[] = [];
  /**
   * Fragments waiting to be allocated: this award plus anything banked while
   * no genome was unlocked. Without carrying the banked pool forward,
   * fragments earned during a locked stretch would be stranded permanently.
   */
  let pool = profile.dna + award;
  let guard = 0;

  while (pool > 0 && guard++ <= DINOSAURS.length) {
    // Auto-pick a target if none is set, so DNA is never earned into a void.
    let seq = next.sequencing;
    if (!seq) {
      const target = nextTarget(
        next.hatched,
        (id) => conceptProficient(next.skillStates[id]),
      );
      // Nothing unlocked to work toward: the fragments stay banked in `dna`
      // until a skill gate opens.
      if (!target || !target.unlocked) break;
      seq = { dinoId: target.dino.id, progress: 0 };
    }

    const dino = dinoById(seq.dinoId);
    if (!dino) {
      next = { ...next, sequencing: null };
      break;
    }

    const progress = seq.progress + pool;
    if (progress < dino.cost) {
      next = { ...next, sequencing: { dinoId: dino.id, progress } };
      pool = 0;
      break;
    }

    // Complete: hatch, and let the surplus roll into whatever comes next.
    hatched.push(dino.id);
    pool = progress - dino.cost;
    next = {
      ...next,
      hatched: [...next.hatched, dino.id],
      sequencing: null,
    };
  }

  // Whatever could not be allocated stays banked for when a gate opens.
  return { profile: { ...next, dna: pool }, hatched };
}

/** Turn continued play after the DNA cap into facts, upgrades, and badges. */
export function advancePostCapDiscovery(
  profile: Profile,
  day: string,
): { profile: Profile; discoveryId: string | null; progress: number } {
  const prior = profile.postCapDay === day ? profile.postCapCorrect : 0;
  const count = prior + 1;
  if (count < POST_CAP_CORRECT_PER_DISCOVERY) {
    return {
      profile: { ...profile, postCapDay: day, postCapCorrect: count },
      discoveryId: null,
      progress: count,
    };
  }

  const discovery = discoveryForAward(profile.labLevel);
  return {
    profile: {
      ...profile,
      postCapDay: day,
      postCapCorrect: 0,
      labLevel: profile.labLevel + 1,
      discoveries: [...profile.discoveries, discovery.id],
    },
    discoveryId: discovery.id,
    progress: 0,
  };
}

/**
 * Persist the session, update the streak and personal bests, and route to the
 * recap screen. Unlike abandoning mid-session, a completed session keeps its
 * `session` object alive (with `problem: null` as the "finished" marker) so
 * Recap.tsx can read `plan`/`pending`/`dnaEarned`/`hatchedThisSession` — it is
 * only cleared once he taps through recap via `closeRecap()`.
 */
async function finishSession(): Promise<void> {
  const { session, profile } = useStore.getState();
  if (!session || !profile) return;

  const day = todayKey();
  const { streakDays, freezesLeft } = advanceStreak(profile, day);

  const scoredAttempts = session.pending.filter((attempt) => attempt.slot !== 'stretch');
  const sessionAccuracy =
    scoredAttempts.length > 0
      ? scoredAttempts.filter((attempt) => attempt.correct).length / scoredAttempts.length
      : 0;

  // Only his second-and-later sessions can set a "record" — the first one
  // trivially beats a baseline of zero, and announcing a record on day one
  // means nothing to him.
  const hasBaseline = profile.sessionsCompleted > 0;
  const newRecord = {
    accuracy: hasBaseline && sessionAccuracy > profile.bestSessionAccuracy,
    dna: hasBaseline && session.dnaEarned > profile.bestSessionDna,
  };

  // ---- weekly expedition ------------------------------------------------
  // Rolls over to a fresh site automatically when the week changes; an
  // unfinished one is simply replaced rather than carried over as a debt.
  const expedition = recordSession(
    currentExpedition(profile.expedition),
    session.skillsAdvanced,
  );
  const justCompleted = expeditionComplete(expedition) && !expedition.claimed;

  const next: Profile = {
    ...profile,
    sessionsCompleted: profile.sessionsCompleted + 1,
    lastSessionDay: day,
    streakDays,
    freezesLeft,
    bestSessionAccuracy: Math.max(profile.bestSessionAccuracy, sessionAccuracy),
    bestSessionDna: Math.max(profile.bestSessionDna, session.dnaEarned),
    // The expedition bonus sits outside the daily cap on purpose: it is paid
    // for a week of turning up, which is exactly the behaviour the cap exists
    // to protect rather than to limit.
    dna: profile.dna + (justCompleted ? EXPEDITION_REWARD_DNA : 0),
    totalDna: profile.totalDna + (justCompleted ? EXPEDITION_REWARD_DNA : 0),
    expedition: justCompleted ? { ...expedition, claimed: true } : expedition,
    expeditionsCompleted: profile.expeditionsCompleted + (justCompleted ? 1 : 0),
  };
  const attempts = useStore.getState().attempts;
  await saveLearningCheckpoint(next, attempts, null);

  useStore.setState({
    profile: next,
    attempts,
    session: {
      ...session,
      phase: 'feedback',
      problem: null,
      newRecord,
      expeditionCompleted: justCompleted,
    },
    screen: 'recap',
  });
}

/**
 * Streak rules. A single missed day is forgiven once per week, because losing
 * a three-week streak to one sick day is exactly the kind of thing that makes
 * a seven-year-old abandon an app for good.
 */
function advanceStreak(
  profile: Profile,
  day: string,
): { streakDays: number; freezesLeft: number } {
  const last = profile.lastSessionDay;
  if (last === day) {
    return { streakDays: profile.streakDays, freezesLeft: profile.freezesLeft };
  }
  if (!last) return { streakDays: 1, freezesLeft: profile.freezesLeft };

  const gapDays = Math.round(
    (Date.parse(`${day}T00:00:00`) - Date.parse(`${last}T00:00:00`)) / 86_400_000,
  );

  if (gapDays === 1) {
    // Earn a freeze back every seventh consecutive day.
    const streakDays = profile.streakDays + 1;
    const freezesLeft =
      streakDays % 7 === 0 ? Math.min(2, profile.freezesLeft + 1) : profile.freezesLeft;
    return { streakDays, freezesLeft };
  }
  if (gapDays === 2 && profile.freezesLeft > 0) {
    return { streakDays: profile.streakDays + 1, freezesLeft: profile.freezesLeft - 1 };
  }
  return { streakDays: 1, freezesLeft: profile.freezesLeft };
}

export { DAILY_DNA_CAP, timeoutMsFor };

/**
 * Dev-only handle for poking at state from the browser console. Handy when
 * checking why a particular question was scheduled, or replaying a session.
 *
 * `reset` is deliberately *not* reachable through it. The dev handle exists on
 * the same origin as the real profile, so a "just cleaning up after testing"
 * reset here wipes actual progress — which is exactly how a real session's
 * worth of work was lost once already. Resetting is a deliberate act and
 * belongs in the parent screen behind a confirmation, not one keystroke away
 * in a console. `restoreBackup` is exposed instead, because the thing you
 * urgently need from a console is the undo, not the delete.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __lab?: unknown }).__lab = {
    getState: () => {
      const { reset: _reset, ...safe } = useStore.getState();
      return safe;
    },
    setState: useStore.setState,
    subscribe: useStore.subscribe,
    /** Undo for a reset or a bad import — see store/db.ts. */
    restore: () => useStore.getState().restoreFromBackup(),
    peekBackup: () => loadBackup(),
  };
}
