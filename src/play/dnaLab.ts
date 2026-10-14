import { dinoById } from '../content/dinosaurs';
import { earnedDinosaurs } from './paddock';

export const MODEL_VERSION = 'genesis-toy-1';
export const EXPORT_SCHEMA = 'genesis-lab/dinosaur';
export const FIXED_SEED = 2718;
export const MAX_CREATIONS = 24;
export const MAX_RUNS = 12;
export const TRAITS = {
  tail: { min: .6, max: 1.6, step: .1, label: 'Tail length', effect: 'A longer tail helps balance, but takes longer to swing around.' },
  legs: { min: .7, max: 1.4, step: .1, label: 'Leg length', effect: 'Long legs clear hurdles and run faster. Tall dinosaurs wobble more.' },
  mass: { min: .6, max: 1.6, step: .1, label: 'Body mass', effect: 'A heavier body grips the track and stays low, but runs slower.' },
} as const;
export const COLORS = ['sample', 'mint', 'coral', 'violet'] as const;
export const PATTERNS = ['plain', 'spots', 'stripes'] as const;
export interface Traits { tail: number; legs: number; mass: number }
export interface Appearance { color: typeof COLORS[number]; pattern: typeof PATTERNS[number] }
export interface Setup { traits: Traits; appearance: Appearance }
export interface Conditions { experiment: 'dash' | 'balance'; track: 'smooth' | 'grippy' | 'hurdles'; turn: 'gentle' | 'medium' | 'sharp' }
export interface Run extends Setup {
  speciesId: string; conditions: Conditions; seed: number; modelVersion: typeof MODEL_VERSION;
  result: { seconds: number; cleared: number; stability: 'stable' | 'wobble' | 'tumble'; explanation: string };
}
export interface Creation extends Setup { id: string; name: string; speciesId: string; modelVersion: typeof MODEL_VERSION; runs: Run[] }
export interface LabState { creations: Creation[] }
export const emptyLab = (): LabState => ({ creations: [] });
export const originalSetup = (): Setup => ({ traits: { tail: 1, legs: 1, mass: 1 }, appearance: { color: 'sample', pattern: 'plain' } });
export const defaultConditions = (): Conditions => ({ experiment: 'dash', track: 'smooth', turn: 'gentle' });
export const earnedSamples = earnedDinosaurs;
export function boundTraits(raw: Traits): Traits {
  const limit = (key: keyof Traits) => Math.round(Math.max(TRAITS[key].min, Math.min(TRAITS[key].max, Number.isFinite(raw[key]) ? raw[key] : 1)) * 10) / 10;
  return { tail: limit('tail'), legs: limit('legs'), mass: limit('mass') };
}
const round = (x: number) => Math.round(x * 100) / 100;
/** A toy model: no biology claims, no learning-store dependencies, no random outcomes. */
export function simulate(speciesId: string, setup: Setup, conditions: Conditions): Run {
  if (!dinoById(speciesId)) throw new Error('Choose an earned DNA sample.');
  if (!validConditions(conditions)) throw new Error('Choose a test chamber condition.');
  const traits = boundTraits(setup.traits);
  const { tail, legs, mass } = traits;
  // Species changes only the baseline pace; relative sliders always follow the same rules.
  const pace = ['compsognathus', 'gallimimus', 'velociraptor'].includes(speciesId) ? 7 : ['ankylosaurus', 'brachiosaurus', 'stegosaurus'].includes(speciesId) ? 10 : 8.5;
  const gripPenalty = conditions.track === 'grippy' ? Math.max(0, 1.25 - mass) * 2 : 0;
  const cleared = conditions.track === 'hurdles' ? Math.max(0, Math.min(3, Math.floor((legs - .7) * 5 + (1.6 - mass)))) : 0;
  const seconds = round(pace / (1 + (legs - 1) * .55) + (mass - 1) * 2 + (tail - 1) * .8 + gripPenalty + (conditions.track === 'hurdles' ? (3 - cleared) * 1.2 : 0));
  const sharpness = { gentle: .25, medium: .65, sharp: 1.05 }[conditions.turn];
  // Tail inertia eventually outweighs its counterbalance; mass lowers the centre of gravity.
  const risk = sharpness + (legs - 1) * .85 - (mass - 1) * .45 - (tail - 1) * .7 + Math.max(0, tail - 1.25) * 2.4;
  const stability = risk < .58 ? 'stable' : risk < 1.05 ? 'wobble' : 'tumble';
  const explanation = conditions.experiment === 'dash'
    ? conditions.track === 'hurdles' ? 'Longer legs clear more hurdles; extra mass slows the run.' : conditions.track === 'grippy' ? 'Extra mass helps grip this track, but also adds weight.' : 'Longer legs speed up the run; extra mass and tail length slow it down.'
    : 'Tail balance helps until the tail gets very long. Tall legs and sharp bends add wobble; mass keeps the body low.';
  return { speciesId, traits, appearance: { ...setup.appearance }, conditions: { ...conditions }, seed: FIXED_SEED, modelVersion: MODEL_VERSION, result: { seconds, cleared, stability, explanation } };
}
export function changes(a: Setup, b: Setup): string[] {
  return [...(Object.keys(TRAITS) as (keyof Traits)[]).filter(k => a.traits[k] !== b.traits[k]).map(k => TRAITS[k].label), ...(a.appearance.color !== b.appearance.color ? ['Color'] : []), ...(a.appearance.pattern !== b.appearance.pattern ? ['Pattern'] : [])];
}
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const exact = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
function validSetup(x: unknown): x is Setup {
  if (!object(x) || !object(x.traits) || !object(x.appearance)) return false;
  const t = x.traits, a = x.appearance;
  return exact(t, ['tail','legs','mass']) && (Object.keys(TRAITS) as (keyof Traits)[]).every(k => typeof t[k] === 'number' && Number.isFinite(t[k]) && (t[k] as number) >= TRAITS[k].min && (t[k] as number) <= TRAITS[k].max && Math.abs((t[k] as number) * 10 - Math.round((t[k] as number) * 10)) < 1e-8)
    && exact(a, ['color','pattern']) && COLORS.includes(a.color as Appearance['color']) && PATTERNS.includes(a.pattern as Appearance['pattern']);
}
function validConditions(x: unknown): x is Conditions {
  return object(x) && exact(x, ['experiment','track','turn']) && ['dash','balance'].includes(x.experiment as string) && ['smooth','grippy','hurdles'].includes(x.track as string) && ['gentle','medium','sharp'].includes(x.turn as string);
}
function validRun(x: unknown, speciesId: string): x is Run {
  if (!object(x) || !exact(x, ['speciesId','traits','appearance','conditions','seed','modelVersion','result']) || !validSetup(x) || !validConditions(x.conditions) || x.speciesId !== speciesId || x.seed !== FIXED_SEED || x.modelVersion !== MODEL_VERSION || !object(x.result)) return false;
  const expected = simulate(speciesId, x, x.conditions).result;
  return exact(x.result, ['seconds','cleared','stability','explanation']) && Object.entries(expected).every(([key,value]) => x.result && (x.result as Record<string,unknown>)[key] === value);
}
export function validCreation(x: unknown): x is Creation {
  return object(x) && exact(x, ['id','name','speciesId','traits','appearance','modelVersion','runs']) && validSetup(x) && typeof x.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(x.id) && typeof x.name === 'string' && x.name.trim().length > 0 && x.name.length <= 40 && typeof x.speciesId === 'string' && !!dinoById(x.speciesId) && x.modelVersion === MODEL_VERSION && Array.isArray(x.runs) && x.runs.length > 0 && x.runs.length <= MAX_RUNS && x.runs.every(r => validRun(r, x.speciesId as string)) && changes(x, x.runs[x.runs.length - 1]!).length === 0;
}
export function migrateLab(raw: unknown): LabState {
  if (!object(raw) || !Array.isArray(raw.creations)) return emptyLab();
  const seen = new Set<string>();
  // Do not evict valid existing creations on load. Limit only new additions.
  return { creations: raw.creations.filter((c): c is Creation => { if (!validCreation(c) || seen.has(c.id)) return false; seen.add(c.id); return true; }).map(c => structuredClone(c)) };
}
export function putCreation(lab: LabState, hatched: string[], creation: Creation): LabState {
  if (!hatched.includes(creation.speciesId) || !validCreation(creation)) throw new Error('Run this earned sample before saving.');
  const exists = lab.creations.some(c => c.id === creation.id);
  if (!exists && lab.creations.length >= MAX_CREATIONS) throw new Error('Your notebook is full. Delete a creation to make room.');
  return { creations: exists ? lab.creations.map(c => c.id === creation.id ? structuredClone(creation) : c) : [...lab.creations, structuredClone(creation)] };
}
export function deleteCreation(lab: LabState, id: string): LabState { return { creations: lab.creations.filter(c => c.id !== id) }; }
export interface DinosaurExport { schema: typeof EXPORT_SCHEMA; version: 1; fictionalLabCreation: true; creation: Creation }
export function exportDinosaur(creation: Creation): DinosaurExport {
  // Construct a whitelist, never serialize any part of a profile.
  const clean: Creation = { id: creation.id, name: creation.name, speciesId: creation.speciesId, modelVersion: creation.modelVersion, traits: { ...creation.traits }, appearance: { ...creation.appearance }, runs: creation.runs.map(r => ({ speciesId: r.speciesId, traits: { ...r.traits }, appearance: { ...r.appearance }, conditions: { ...r.conditions }, seed: r.seed, modelVersion: r.modelVersion, result: { seconds: r.result.seconds, cleared: r.result.cleared, stability: r.result.stability, explanation: r.result.explanation } })) };
  const payload: DinosaurExport = { schema: EXPORT_SCHEMA, version: 1, fictionalLabCreation: true, creation: clean };
  if (!validateExport(payload)) throw new Error('This creation cannot be exported. Run and save it again.');
  return payload;
}
export function validateExport(raw: unknown): raw is DinosaurExport {
  return object(raw) && exact(raw, ['schema','version','fictionalLabCreation','creation']) && raw.schema === EXPORT_SCHEMA && raw.version === 1 && raw.fictionalLabCreation === true && validCreation(raw.creation);
}
