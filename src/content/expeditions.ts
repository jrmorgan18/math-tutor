import type { Expedition } from '../store/db';

/**
 * Weekly expeditions.
 *
 * A session has an arc; a week did not. This gives one — a named dig site, a
 * goal that takes several sittings, and a reward at the end.
 *
 * The goal is measured in *sessions turned up for* and *skills pushed forward*,
 * never in DNA or question count. A DNA target would be farmable by grinding
 * warm-ups, and a question-count target rewards speed over thought — both are
 * exactly what the rest of the design refuses to pay for. Turning up and
 * moving something forward are the two behaviours actually worth rewarding.
 */

export interface DigSite {
  id: string;
  name: string;
  blurb: string;
  glyph: string;
  color: string;
}

export const DIG_SITES: DigSite[] = [
  {
    id: 'badlands',
    name: 'Hell Creek Badlands',
    blurb: 'Montana, USA. The very last rocks of the age of dinosaurs — this is where T. rex and Triceratops turn up.',
    glyph: '🏜️',
    color: '#e0724f',
  },
  {
    id: 'gobi',
    name: 'The Gobi Desert',
    blurb: 'Mongolia. Sandstorms buried whole animals mid-fight here — including a Velociraptor locked onto a Protoceratops.',
    glyph: '🏵️',
    color: '#e8b04b',
  },
  {
    id: 'liaoning',
    name: 'Liaoning Beds',
    blurb: 'China. Volcanic ash preserved feathers so well you can still see their colour bands.',
    glyph: '🪶',
    color: '#c98bdb',
  },
  {
    id: 'patagonia',
    name: 'Patagonia',
    blurb: 'Argentina. Home of the true giants — the biggest land animals that have ever lived.',
    glyph: '🗻',
    color: '#5fa8d3',
  },
  {
    id: 'jurassiccoast',
    name: 'The Jurassic Coast',
    blurb: 'England. Mary Anning found sea dragons in these cliffs when she was about your age.',
    glyph: '🌊',
    color: '#3d7ea6',
  },
  {
    id: 'morrison',
    name: 'Morrison Formation',
    blurb: 'Colorado, USA. A single quarry here held Stegosaurus, Allosaurus and Brachiosaurus together.',
    glyph: '⛰️',
    color: '#6aa84f',
  },
];

export function digSiteById(id: string): DigSite {
  return DIG_SITES.find((s) => s.id === id) ?? (DIG_SITES[0] as DigSite);
}

/**
 * ISO-week key, e.g. "2026-W34". Weeks start Monday, so a weekend session
 * belongs to the week it finishes rather than starting a new one.
 */
export function weekKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  // Thursday of the current week determines the ISO year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Deterministic site for a given week, so it's stable across reloads. */
function siteForWeek(key: string): DigSite {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return DIG_SITES[hash % DIG_SITES.length] as DigSite;
}

export const EXPEDITION_REWARD_DNA = 25;

/**
 * The current week's expedition, starting a new one when the week rolls over.
 *
 * An unfinished expedition is simply replaced — it does not carry over and it
 * costs nothing to have missed. A goal that accumulates guilt is worse than no
 * goal at all for a seven-year-old.
 */
export function currentExpedition(
  existing: Expedition | null,
  now = new Date(),
): Expedition {
  const key = weekKey(now);
  if (existing && existing.weekKey === key) return existing;
  const site = siteForWeek(key);
  return {
    weekKey: key,
    siteId: site.id,
    goalSessions: 4,
    goalNewSkills: 1,
    sessionsDone: 0,
    skillsAdvanced: [],
    claimed: false,
  };
}

export function expeditionComplete(e: Expedition): boolean {
  return e.sessionsDone >= e.goalSessions && e.skillsAdvanced.length >= e.goalNewSkills;
}

/** 0..1 across both goals combined, for the progress ring. */
export function expeditionProgress(e: Expedition): number {
  const sessions = Math.min(1, e.sessionsDone / Math.max(1, e.goalSessions));
  const skills = Math.min(1, e.skillsAdvanced.length / Math.max(1, e.goalNewSkills));
  return (sessions + skills) / 2;
}

/**
 * Fold a finished session into the week's expedition.
 *
 * `advanced` is the set of skills that reached proficiency during the session.
 * Recorded as a set so the same skill cannot be counted twice across a week.
 */
export function recordSession(e: Expedition, advanced: string[]): Expedition {
  const merged = new Set([...e.skillsAdvanced, ...advanced]);
  return {
    ...e,
    sessionsDone: e.sessionsDone + 1,
    skillsAdvanced: [...merged],
  };
}
