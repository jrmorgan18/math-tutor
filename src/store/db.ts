import { emptyLab, migrateLab, type LabState } from '../play/dnaLab';
import { del, get, set, setMany } from 'idb-keyval';
import { propagateUnlocks, reconcileSkillStates } from '../engine/mastery';
import { verifyLegacyEvidence } from '../engine/evidence';
import type { Attempt, SkillId, SkillState } from '../engine/types';
import { emptyPaddock, migratePaddock, type PaddockState } from '../play/paddock';

/**
 * Persistence.
 *
 * IndexedDB rather than localStorage because the attempt log grows without
 * bound and is the raw material for every diagnostic the parent dashboard
 * shows. Nothing here leaves the device.
 */

export interface Profile {
  version: number;
  name: string;
  /** Emoji avatar, chosen at sign-in and changeable from Settings. */
  avatar: string;
  createdAt: number;

  placementDone: boolean;
  skillStates: Record<SkillId, SkillState>;

  /** Unspent DNA fragments. */
  dna: number;
  /** Lifetime total, for the parent dashboard. */
  totalDna: number;
  /** Fragments banked toward the dinosaur currently being sequenced. */
  sequencing: { dinoId: string; progress: number } | null;
  hatched: string[];

  streakDays: number;
  /** YYYY-MM-DD of the last completed session, local time. */
  lastSessionDay: string | null;
  /** One missed day may be forgiven per week. */
  freezesLeft: number;
  sessionsCompleted: number;

  /** Daily earn cap state, so grinding easy material stops paying. */
  dailyDna: number;
  dailyDnaDay: string | null;

  /**
   * Best-ever single-session accuracy (0-1) and DNA earned, for the recap
   * screen's "new record" callout. A number he can beat is worth more to a
   * seven-year-old than a number that only ever goes up.
   */
  bestSessionAccuracy: number;
  bestSessionDna: number;

  /**
   * The current week's expedition — a multi-session goal, so progress has an
   * arc longer than one sitting. Null until the first session of a week.
   */
  expedition: Expedition | null;
  /** Expeditions completed all-time, for the badge shelf. */
  expeditionsCompleted: number;

  /** Non-currency rewards earned after the daily DNA tank is full. */
  discoveries: string[];
  labLevel: number;
  postCapCorrect: number;
  postCapDay: string | null;

  soundOn: boolean;
  readAloud: boolean;
  /** Local habitat and bounded scrapbook; included in safety backups and exports. */
  paddock: PaddockState;
  dnaLab: LabState;
}

/**
 * A week-long goal spanning several sessions.
 *
 * Deliberately measured in *sessions and new skills*, not DNA: a DNA target
 * would be farmable by grinding warm-ups, which is the one thing the whole
 * design refuses to reward.
 */
export interface Expedition {
  /** ISO-ish week key, e.g. "2026-W34". Identifies which week this is for. */
  weekKey: string;
  /** Which dig site / theme this week, purely cosmetic framing. */
  siteId: string;
  goalSessions: number;
  goalNewSkills: number;
  sessionsDone: number;
  /** Skill ids that reached proficiency during this expedition. */
  skillsAdvanced: string[];
  claimed: boolean;
}

/** Curated, kid-appropriate avatar choices — scientist/adventurer/dino themed. */
export const AVATAR_OPTIONS = [
  '🧑‍🔬', '🦖', '👨‍🚀', '🦕', '🥽', '🧬',
  '⚡', '🔬', '🌋', '🌟', '🛸', '🦴',
] as const;

const PROFILE_KEY = 'genesis-lab:profile';
const ATTEMPTS_KEY = 'genesis-lab:attempts';
/**
 * Rolling safety snapshot, written before anything destructive or irreversible
 * (a reset, an import, a schema migration). Progress that took weeks to earn
 * should never be one mis-click or one bad migration away from gone.
 */
const BACKUP_KEY = 'genesis-lab:backup';
const ACTIVE_SESSION_KEY = 'genesis-lab:active-session';
const ACTIVE_PLACEMENT_KEY = 'genesis-lab:active-placement';

export const PROFILE_VERSION = 6;

export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function newProfile(
  name: string,
  skillStates: Record<SkillId, SkillState>,
  avatar: string = AVATAR_OPTIONS[0],
): Profile {
  return {
    version: PROFILE_VERSION,
    name,
    avatar,
    createdAt: Date.now(),
    placementDone: false,
    skillStates,
    dna: 0,
    totalDna: 0,
    sequencing: null,
    hatched: [],
    streakDays: 0,
    lastSessionDay: null,
    freezesLeft: 1,
    sessionsCompleted: 0,
    dailyDna: 0,
    dailyDnaDay: null,
    bestSessionAccuracy: 0,
    bestSessionDna: 0,
    expedition: null,
    expeditionsCompleted: 0,
    discoveries: [],
    labLevel: 0,
    postCapCorrect: 0,
    postCapDay: null,
    soundOn: true,
    readAloud: true,
    paddock: emptyPaddock(),
    dnaLab: emptyLab(),
  };
}

/**
 * Bring a stored profile up to the current schema.
 *
 * The rule here is that a migration may *add* and may *repair*, but must never
 * discard. In particular `placementDone` is carried across untouched: sending
 * a child back through a placement test he already sat, because the app
 * shipped new content, would be an unforced insult.
 *
 * Returns null only when the stored value is not recognisably a profile at
 * all, in which case there is nothing to preserve.
 */
export function migrateProfile(raw: unknown, attempts?: Attempt[]): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<Profile> & Record<string, unknown>;
  // A profile has a name and a skill-state map. Anything else is not one.
  if (typeof p.name !== 'string' || typeof p.skillStates !== 'object' || !p.skillStates) {
    return null;
  }

  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  // Additive: new skills appear at level 1, existing ones keep their state,
  // then anything whose prerequisites he has already cleared opens up.
  const reconciled = reconcileSkillStates(p.skillStates as Record<SkillId, SkillState>);
  const skillStates = propagateUnlocks(attempts ? verifyLegacyEvidence(reconciled, attempts) : reconciled);

  return {
    ...p,
    version: PROFILE_VERSION,
    name: p.name,
    avatar: typeof p.avatar === 'string' && p.avatar ? p.avatar : AVATAR_OPTIONS[0],
    createdAt: num(p.createdAt, Date.now()),
    // Never re-run placement on someone who has already done it.
    placementDone: p.placementDone === true,
    skillStates,
    dna: Math.max(0, Math.round(num(p.dna, 0))),
    totalDna: Math.max(0, Math.round(num(p.totalDna, 0))),
    sequencing:
      p.sequencing && typeof p.sequencing === 'object' && typeof p.sequencing.dinoId === 'string'
        ? { dinoId: p.sequencing.dinoId, progress: Math.max(0, num(p.sequencing.progress, 0)) }
        : null,
    hatched: Array.isArray(p.hatched) ? p.hatched.filter((x): x is string => typeof x === 'string') : [],
    streakDays: Math.max(0, Math.round(num(p.streakDays, 0))),
    lastSessionDay: typeof p.lastSessionDay === 'string' ? p.lastSessionDay : null,
    freezesLeft: Math.max(0, Math.round(num(p.freezesLeft, 1))),
    sessionsCompleted: Math.max(0, Math.round(num(p.sessionsCompleted, 0))),
    dailyDna: Math.max(0, Math.round(num(p.dailyDna, 0))),
    dailyDnaDay: typeof p.dailyDnaDay === 'string' ? p.dailyDnaDay : null,
    bestSessionAccuracy: Math.min(1, Math.max(0, num(p.bestSessionAccuracy, 0))),
    bestSessionDna: Math.max(0, Math.round(num(p.bestSessionDna, 0))),
    expedition: migrateExpedition(p.expedition),
    expeditionsCompleted: Math.max(0, Math.round(num(p.expeditionsCompleted, 0))),
    discoveries: Array.isArray(p.discoveries)
      ? p.discoveries.filter((x): x is string => typeof x === 'string')
      : [],
    labLevel: Math.max(0, Math.round(num(p.labLevel, 0))),
    postCapCorrect: Math.max(0, Math.round(num(p.postCapCorrect, 0))),
    postCapDay: typeof p.postCapDay === 'string' ? p.postCapDay : null,
    soundOn: p.soundOn !== false,
    readAloud: p.readAloud !== false,
    paddock: migratePaddock(p.paddock),
    dnaLab: migrateLab(p.dnaLab),
  };
}

function migrateExpedition(raw: unknown): Expedition | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<Expedition>;
  if (typeof e.weekKey !== 'string') return null;
  return {
    ...e,
    weekKey: e.weekKey,
    siteId: typeof e.siteId === 'string' ? e.siteId : 'badlands',
    goalSessions: Math.max(1, Math.round(Number(e.goalSessions) || 4)),
    goalNewSkills: Math.max(0, Math.round(typeof e.goalNewSkills === 'number' ? e.goalNewSkills : 1)),
    sessionsDone: Math.max(0, Math.round(Number(e.sessionsDone) || 0)),
    skillsAdvanced: Array.isArray(e.skillsAdvanced)
      ? e.skillsAdvanced.filter((x): x is string => typeof x === 'string')
      : [],
    claimed: e.claimed === true,
  };
}

export async function loadProfile(): Promise<Profile | null> {
  const raw = await get<unknown>(PROFILE_KEY);
  if (!raw) return null;

  const storedVersion = (raw as Partial<Profile>).version;
  const migrated = migrateProfile(raw, await loadAttempts());
  if (!migrated) return null;

  // Persist the upgrade, but snapshot the old shape first — if a migration
  // ever gets something wrong, the pre-migration profile is still on disk.
  if (storedVersion !== PROFILE_VERSION) {
    await writeBackup(raw, `pre-migration from v${String(storedVersion ?? '?')}`);
    await set(PROFILE_KEY, migrated);
  }
  return migrated;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await set(PROFILE_KEY, profile);
}

export async function loadActiveSession<T>(): Promise<T | null> {
  return (await get<T | null>(ACTIVE_SESSION_KEY)) ?? null;
}

export async function loadActivePlacement<T>(): Promise<T | null> {
  return (await get<T | null>(ACTIVE_PLACEMENT_KEY)) ?? null;
}

/** Profile, attempt log, and resumable session commit in one IndexedDB transaction. */
export async function saveLearningCheckpoint<T>(
  profile: Profile,
  attempts: Attempt[],
  activeSession: T | null,
): Promise<void> {
  await setMany([
    [PROFILE_KEY, profile],
    [ATTEMPTS_KEY, attempts],
    [ACTIVE_SESSION_KEY, activeSession],
  ]);
}

export async function savePlacementCheckpoint<T>(placement: T | null): Promise<void> {
  await set(ACTIVE_PLACEMENT_KEY, placement);
}

export async function loadAttempts(): Promise<Attempt[]> {
  return (await get<Attempt[]>(ATTEMPTS_KEY)) ?? [];
}

/**
 * Append attempts without silently discarding earned learning history.
 */
export async function appendAttempts(attempts: Attempt[]): Promise<void> {
  const existing = await loadAttempts();
  const combined = [...existing, ...attempts];
  await set(ATTEMPTS_KEY, combined);
}

export interface BackupSnapshot {
  profile: unknown;
  attempts: Attempt[];
  at: number;
  reason: string;
  activeSession?: unknown;
  activePlacement?: unknown;
}

/**
 * Snapshot whatever is currently stored, before overwriting or deleting it.
 *
 * Deliberately stores the *raw* profile rather than a migrated one: the point
 * of a safety net is to preserve exactly what was there, including anything a
 * migration might have misread.
 */
async function writeBackup(profile: unknown, reason: string): Promise<void> {
  if (!profile) return;
  const [attempts, activeSession, activePlacement] = await Promise.all([
    loadAttempts(),
    loadActiveSession<unknown>(),
    loadActivePlacement<unknown>(),
  ]);
  const snapshot: BackupSnapshot = {
    profile,
    attempts,
    at: Date.now(),
    reason,
    activeSession,
    activePlacement,
  };
  await set(BACKUP_KEY, snapshot);
}

export async function loadBackup(): Promise<BackupSnapshot | null> {
  return (await get<BackupSnapshot>(BACKUP_KEY)) ?? null;
}

/**
 * Put the safety snapshot back. This is the undo for a reset or a bad import.
 */
export async function restoreBackup(): Promise<Profile | null> {
  const snapshot = await loadBackup();
  if (!snapshot) return null;
  const profile = migrateProfile(snapshot.profile, snapshot.attempts ?? []);
  if (!profile) return null;
  await set(PROFILE_KEY, profile);
  await set(ATTEMPTS_KEY, snapshot.attempts ?? []);
  await set(ACTIVE_SESSION_KEY, snapshot.activeSession ?? null);
  await set(ACTIVE_PLACEMENT_KEY, snapshot.activePlacement ?? null);
  return profile;
}

/**
 * Wipe local progress — but take a snapshot first, always.
 *
 * The snapshot is the difference between "start fresh" and "lose everything".
 * Nothing in this app is worth so little that deleting it should be silent and
 * final, and a reset is exactly the moment someone most wants an undo.
 */
export async function resetAll(): Promise<void> {
  const current = await get<unknown>(PROFILE_KEY);
  if (current) await writeBackup(current, 'reset');
  await del(PROFILE_KEY);
  await del(ATTEMPTS_KEY);
  await del(ACTIVE_SESSION_KEY);
  await del(ACTIVE_PLACEMENT_KEY);
}

/** Export everything as a JSON blob, for moving devices or keeping a backup. */
export async function exportAll(): Promise<string> {
  const [profile, attempts] = await Promise.all([loadProfile(), loadAttempts()]);
  return JSON.stringify({ profile, attempts }, null, 2);
}

/**
 * Restore a profile + attempt log from an exported backup. Used to move
 * progress onto a new device: export on the old one, hand the file across
 * (AirDrop, a cloud drive, USB — anything), import here on the new device.
 *
 * This is a one-time snapshot restore, not sync — it overwrites whatever is
 * currently on this device. If he plays on two devices going forward without
 * re-syncing, they'll diverge with no merge.
 */
export async function importAll(json: string): Promise<void> {
  let parsed: { profile: unknown; attempts?: Attempt[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file isn’t a valid backup — it doesn’t look like JSON.');
  }
  if (!parsed.profile) throw new Error('No profile found in that file.');

  // Migrate rather than reject on version mismatch: a backup taken before an
  // update is exactly the backup most worth being able to restore.
  const profile = migrateProfile(parsed.profile, Array.isArray(parsed.attempts) ? parsed.attempts : []);
  if (!profile) {
    throw new Error('That file doesn’t contain a profile this app can read.');
  }

  const current = await get<unknown>(PROFILE_KEY);
  if (current) await writeBackup(current, 'import');

  await set(PROFILE_KEY, profile);
  await set(ATTEMPTS_KEY, Array.isArray(parsed.attempts) ? parsed.attempts : []);
  await set(ACTIVE_SESSION_KEY, null);
  await set(ACTIVE_PLACEMENT_KEY, null);
}
