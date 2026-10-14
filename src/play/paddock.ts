import { DINOSAURS, dinoById } from '../content/dinosaurs';

// Fictional play rules, deliberately independent of mastery and the DNA economy.
export const MAX_DINOS = 6;
export const MAX_PHOTOS = 12;
export const MAX_PHOTO_LENGTH = 180_000; // at most ~2.2 MB of encoded images per export
export const PERCH = { x: 805, y: 225 };
export const SHADE = { x: 180, y: 330 };
export type ToyKind = 'food' | 'ball' | 'brush';
export interface Point { x: number; y: number }
export interface Resident extends Point {
  id: string;
  mood: string;
  target: Point | null;
  activity: 'idle' | 'food' | 'ball' | 'perch' | 'shade';
}
export interface Toy extends Point { kind: ToyKind; active: boolean }
export interface Photo { id: string; at: number; title: string; image: string }
export interface PaddockState { residents: Resident[]; toys: Toy[]; photos: Photo[] }
export const emptyPaddock = (): PaddockState => ({ residents: [], toys: [], photos: [] });
export function hasPlayAccess(profile: { lastSessionDay: string | null }, day: string) {
  return profile.lastSessionDay === day;
}
export function earnedDinosaurs(hatched: string[]) {
  return DINOSAURS.filter(d => hatched.includes(d.id));
}
export function clampPoint(p: Point): Point {
  return { x: Math.max(65, Math.min(935, p.x)), y: Math.max(210, Math.min(535, p.y)) };
}
export function migratePaddock(raw: unknown): PaddockState {
  if (!raw || typeof raw !== 'object') return emptyPaddock();
  const p = raw as Partial<PaddockState>;
  const validPoint = (v: Point) => v && Number.isFinite(v.x) && Number.isFinite(v.y);
  const ids = new Set<string>();
  return {
    residents: (Array.isArray(p.residents) ? p.residents : []).filter(r => {
      if (!r || !dinoById(r.id) || !validPoint(r) || ids.has(r.id)) return false;
      ids.add(r.id); return true;
    }).slice(0, MAX_DINOS).map(r => ({ id: r.id, ...clampPoint(r), mood: 'Happy to be here', target: null, activity: 'idle' })),
    toys: (Array.isArray(p.toys) ? p.toys : []).filter((t, i, all) => t && ['food', 'ball', 'brush'].includes(t.kind) && validPoint(t) && all.findIndex(v => v?.kind === t.kind) === i)
      .map(t => ({ kind: t.kind, ...clampPoint(t), active: t.active !== false })),
    // Do not evict existing photos on load. Limits apply to new captures.
    photos: (Array.isArray(p.photos) ? p.photos : []).filter(p => p && typeof p.id === 'string' && typeof p.image === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.image))
      .map(p => ({ ...p, title: typeof p.title === 'string' ? p.title.slice(0, 60) : 'A day in the Paddock' })),
  };
}
export function bringDinosaur(state: PaddockState, hatched: string[], id: string, point: Point): PaddockState {
  if (!hatched.includes(id) || !dinoById(id) || state.residents.some(r => r.id === id) || state.residents.length >= MAX_DINOS) return state;
  return { ...state, residents: [...state.residents, { id, ...clampPoint(point), mood: 'Hello, friend!', target: null, activity: 'idle' }] };
}
export function moveResident(state: PaddockState, id: string, point: Point): PaddockState {
  return { ...state, residents: state.residents.map(r => r.id === id ? { ...r, ...clampPoint(point), target: null, activity: 'idle' } : r) };
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function placeToy(state: PaddockState, kind: ToyKind, point: Point): PaddockState {
  const toy: Toy = { kind, ...clampPoint(point), active: true };
  const toys = [...state.toys.filter(t => t.kind !== kind), toy];
  const nearest = [...state.residents].sort((a, b) => distance(a, toy) - distance(b, toy))[0];
  const residents = state.residents.map(r => {
    if (kind === 'brush' && distance(r, toy) < 115) return { ...r, mood: r.id === 'stegosaurus' ? 'Best brush ever! ♥' : 'That tickles! ♥', target: null, activity: 'idle' as const };
    if (kind === 'food' && r.id === nearest?.id) return { ...r, mood: 'Snack time!', target: toy, activity: 'food' as const };
    if (kind === 'ball') return { ...r, mood: ballMood(r.id), target: toy, activity: 'ball' as const };
    return r;
  });
  return { ...state, toys, residents };
}
function ballMood(id: string): string {
  return ({ compsognathus: 'Catch it! … ooh, a butterfly!', ankylosaurus: 'Tail ready!', triceratops: 'Let’s give it a push!', pteranodon: 'I spy a moving ball!', stegosaurus: 'A gentle nudge…' } as Record<string, string>)[id] ?? 'Let’s chase!';
}
/** One gentle simulation step; no offline simulation or needs/decay. */
export function stepHabitat(state: PaddockState, beat: number, held: string | null = null): PaddockState {
  let toys = state.toys;
  let foodEaten = false;
  let ballHit = false;
  const ball = toys.find(t => t.kind === 'ball');
  const residents = state.residents.map(r => {
    if (held === r.id) return r;
    let next = { ...r };
    if (r.activity === 'food' && !toys.some(t => t.kind === 'food' && t.active)) next = { ...r, target: null, activity: 'idle' };
    if (next.activity === 'ball' && ball) next.target = ball;
    if (next.id === 'compsognathus' && next.activity === 'ball' && ball && beat % 5 === 0 && distance(next, ball) > 120) {
      next = { ...next, activity: 'idle', target: clampPoint({ x: next.x - 45, y: next.y - 25 }), mood: 'Ooh, a butterfly! Where did it go?' };
    }
    if (next.target) {
      const dist = distance(next, next.target);
      const speed = next.id === 'compsognathus' ? 70 : next.id === 'pteranodon' ? 90 : 40;
      const fraction = Math.min(1, speed / Math.max(dist, 1));
      next = { ...next, x: next.x + (next.target.x - next.x) * fraction, y: next.y + (next.target.y - next.y) * fraction };
      if (dist <= speed + 30) {
        if (next.activity === 'food') { foodEaten = true; next.mood = 'Yum! Thank you ♥'; }
        if (next.activity === 'ball' && ball && !ballHit && held !== 'ball') {
          ballHit = true;
          const strength = next.id === 'ankylosaurus' ? 145 : next.id === 'triceratops' ? 90 : 55;
          toys = toys.map(t => t.kind === 'ball' ? { ...t, ...clampPoint({ x: t.x + (t.x > 740 ? -strength : strength), y: t.y + (beat % 2 ? 30 : -30) }) } : t);
          next.mood = next.id === 'ankylosaurus' ? 'Tail bat! Wheee! ♥' : next.id === 'triceratops' ? 'Push! Rolling along ♥' : 'Got it! ♥';
        }
        if (next.activity === 'perch') next.mood = 'A lovely view from my perch';
        if (next.activity === 'shade') next.mood = 'Mmm, shady and cool';
        next.target = null; next.activity = 'idle';
      }
    } else if (beat % 8 === 0) {
      if (next.id === 'stegosaurus') next = { ...next, target: SHADE, activity: 'shade' };
      else if (next.id === 'pteranodon') next = { ...next, target: PERCH, activity: 'perch', mood: 'Off to my perch!' };
      else next = { ...next, target: clampPoint({ x: next.x + (beat % 16 ? 45 : -45), y: next.y + (beat % 24 ? 12 : -12) }), mood: next.id === 'compsognathus' ? 'Ooh, what’s over here?' : 'Just looking around' };
    }
    return next;
  });
  if (foodEaten) toys = toys.map(t => t.kind === 'food' ? { ...t, active: false } : t);
  if (toys === state.toys && residents.every((r, i) => {
    const prior = state.residents[i]!;
    return r.x === prior.x && r.y === prior.y && r.mood === prior.mood && r.activity === prior.activity && r.target === prior.target;
  })) return state;
  return { ...state, residents, toys };
}
export function addPhoto(state: PaddockState, photo: Photo): PaddockState {
  if (state.photos.length >= MAX_PHOTOS) throw new Error('Your scrapbook is full. Delete a photo to make room for a new one.');
  if (photo.image.length > MAX_PHOTO_LENGTH || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo.image)) throw new Error('This photo is too large to save. Please try again.');
  return { ...state, photos: [...state.photos, { ...photo, title: photo.title.slice(0, 60) }] };
}
export function deletePhoto(state: PaddockState, id: string): PaddockState {
  return { ...state, photos: state.photos.filter(p => p.id !== id) };
}
