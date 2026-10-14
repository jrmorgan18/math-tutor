import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DINOSAURS } from '../src/content/dinosaurs';
import { initialSkillStates } from '../src/engine/mastery';
import { boundTraits, changes, defaultConditions, deleteCreation, emptyLab, earnedSamples, exportDinosaur, FIXED_SEED, MAX_CREATIONS, MAX_RUNS, migrateLab, MODEL_VERSION, originalSetup, putCreation, simulate, validateExport, type Creation } from '../src/play/dnaLab';
import { hasPlayAccess } from '../src/play/paddock';
import { exportAll, importAll, loadAttempts, loadProfile, newProfile, saveLearningCheckpoint, todayKey } from '../src/store/db';
import { useStore } from '../src/store/useStore';
import example from '../docs/dinosaur-export.example.json';
import schema from '../docs/dinosaur-export.schema.json';
const disk = vi.hoisted(() => ({ records: new Map<string, unknown>(), fail: false }));
vi.mock('idb-keyval', () => ({
  get: async (key: string) => structuredClone(disk.records.get(key)),
  set: async (key: string, value: unknown) => { if (disk.fail) throw new Error('Storage full'); disk.records.set(key, structuredClone(value)); },
  del: async (key: string) => { disk.records.delete(key); },
  setMany: async (entries: [string, unknown][]) => { if (disk.fail) throw new Error('Storage full'); for (const [key,value] of entries) disk.records.set(key, structuredClone(value)); },
}));
const creation = (id = 'synthetic-1'): Creation => ({ id, name: 'Mint runner', speciesId: 'compsognathus', ...originalSetup(), modelVersion: MODEL_VERSION, runs: [simulate('compsognathus', originalSetup(), defaultConditions())] });
const profile = () => ({ ...newProfile('Synthetic test learner', initialSkillStates()), placementDone: true, hatched: ['compsognathus'], dna: 42, totalDna: 900, sessionsCompleted: 3, lastSessionDay: todayKey(), discoveries: ['fact-raptor-tail'] });
beforeEach(() => { disk.records.clear(); disk.fail = false; useStore.setState({ profile: null, attempts: [], session: null, placement: null, screen: 'home' }); });
describe('DNA Playground access and earned samples', () => {
  it('uses today’s completed session alone, including legacy profiles', async () => {
    const p = { ...profile(), version: 5, dnaLab: undefined, labLevel: 0, dailyDna: 150 };
    await disk.records.set('genesis-lab:profile', p);
    const loaded = (await loadProfile())!;
    expect(loaded.dnaLab).toEqual(emptyLab()); expect(hasPlayAccess(loaded, todayKey())).toBe(true);
    expect(hasPlayAccess(loaded, '2000-01-01')).toBe(false);
    expect(hasPlayAccess({ lastSessionDay: null }, todayKey())).toBe(false);
  });
  it('offers only hatched catalog species, never a field note or unfinished sequence', () => {
    const p = profile(); p.sequencing = { dinoId: 'velociraptor', progress: 89 }; p.hatched.push('unknown');
    expect(earnedSamples(p.hatched).map(d => d.id)).toEqual(['compsognathus']);
    expect(() => putCreation(emptyLab(), [], creation())).toThrow(/earned/);
  });
});
describe('bounded, repeatable fictional model', () => {
  it('bounds nonfinite and out-of-range controls', () => {
    expect(boundTraits({ tail: -4, legs: 900, mass: NaN })).toEqual({ tail: .6, legs: 1.4, mass: 1 });
    expect(boundTraits({ tail: 1.234, legs: 1.111, mass: Infinity })).toEqual({ tail: 1.2, legs: 1.1, mass: 1 });
  });
  it('is deterministic across every species, extremes, tracks and bend settings', () => {
    for (const d of DINOSAURS) for (const track of ['smooth','grippy','hurdles'] as const) for (const turn of ['gentle','medium','sharp'] as const) for (const v of [.6,1,1.6]) {
      const setup = { ...originalSetup(), traits: boundTraits({ tail:v, legs:v, mass:v }) };
      const conditions = { experiment: 'dash' as const, track, turn };
      const a = simulate(d.id, setup, conditions);
      expect(a).toEqual(simulate(d.id, setup, conditions)); expect(a.seed).toBe(FIXED_SEED);
      expect(a.result.seconds).toBeGreaterThan(0); expect(a.result.cleared).toBeGreaterThanOrEqual(0); expect(a.result.cleared).toBeLessThanOrEqual(3);
    }
  });
  it('long legs speed up the dash and clear hurdles but add turn instability', () => {
    const setup = { ...originalSetup(), traits: { tail:1, legs:1.4, mass:1 } };
    const c = { ...defaultConditions(), track: 'hurdles' as const, turn: 'medium' as const };
    const base = simulate('compsognathus', originalSetup(), c), tall = simulate('compsognathus', setup, c);
    expect(tall.result.seconds).toBeLessThan(base.result.seconds); expect(tall.result.cleared).toBeGreaterThan(base.result.cleared);
    expect(base.result.stability).toBe('wobble'); expect(tall.result.stability).toBe('wobble');
    expect(simulate('compsognathus', setup, { ...c, turn:'sharp' }).result.stability).toBe('tumble');
  });
  it('mass trades smooth speed for grip and balance; a very long tail has inertia', () => {
    const heavy = { ...originalSetup(), traits: { tail:1, legs:1, mass:1.6 } };
    const base = simulate('trex', originalSetup(), defaultConditions());
    expect(simulate('trex', heavy, defaultConditions()).result.seconds).toBeGreaterThan(base.result.seconds);
    const grippy = { ...defaultConditions(), track:'grippy' as const };
    const light = { ...heavy, traits: { ...heavy.traits, mass:.6 } };
    expect(simulate('trex', light, grippy).result.seconds - simulate('trex', light, defaultConditions()).result.seconds).toBeGreaterThan(0);
    const bend = { ...defaultConditions(), experiment:'balance' as const, turn:'sharp' as const };
    expect(simulate('trex', heavy, bend).result.stability).toBe('wobble');
    expect(simulate('trex', { ...heavy, traits:{ tail:1.2, legs:1, mass:1 } }, bend).result.stability).toBe('wobble');
    expect(simulate('trex', { ...heavy, traits:{ tail:1.6, legs:1, mass:1 } }, bend).result.stability).toBe('tumble');
  });
  it('cosmetics change the shared preview/export settings without affecting physics', () => {
    const setup = { ...originalSetup(), appearance: { color:'mint' as const, pattern:'stripes' as const } };
    expect(simulate('trex', setup, defaultConditions()).result).toEqual(simulate('trex', originalSetup(), defaultConditions()).result);
    expect(changes(originalSetup(), setup)).toEqual(['Color','Pattern']);
  });
});
describe('notebook persistence, profile isolation and failures', () => {
  it('changes only the lab field, preserving learning, attempts, rewards and resumable work', async () => {
    const p = profile(), attempts = [{ id:'retained-attempt' }] as never[];
    await saveLearningCheckpoint(p, attempts, { unfinished:true }); useStore.setState({ profile:p, attempts });
    const next = putCreation(p.dnaLab, p.hatched, creation()); await useStore.getState().saveLab(next);
    const { dnaLab:_before, ...before } = p; const { dnaLab:_after, ...after } = useStore.getState().profile!;
    expect(after).toEqual(before); expect(await loadAttempts()).toEqual(attempts);
    expect(disk.records.get('genesis-lab:active-session')).toEqual({ unfinished:true });
    expect((await loadProfile())!.dnaLab).toEqual(next);
    const backup = await exportAll(); await importAll(backup); expect((await loadProfile())!.dnaLab).toEqual(next);
    await importAll(JSON.stringify({ profile: { ...profile(), name:'Another synthetic profile', dnaLab:emptyLab() } }));
    expect((await loadProfile())!.dnaLab.creations).toEqual([]);
  });
  it('keeps saved and in-memory records unchanged on a storage failure, then can retry', async () => {
    const p = profile(); p.dnaLab = putCreation(emptyLab(), p.hatched, creation());
    await saveLearningCheckpoint(p, [], null); useStore.setState({ profile:p }); disk.fail = true;
    const next = putCreation(p.dnaLab, p.hatched, creation('new'));
    await expect(useStore.getState().saveLab(next)).rejects.toThrow(/Storage/);
    expect(useStore.getState().profile).toEqual(p); expect((await loadProfile())!.dnaLab).toEqual(p.dnaLab);
    disk.fail = false; await useStore.getState().saveLab(next); expect((await loadProfile())!.dnaLab).toEqual(next);
  });
  it('updates stable IDs, duplicates independently and deletes only the named creation', () => {
    let lab = putCreation(emptyLab(), ['compsognathus'], creation());
    lab = putCreation(lab, ['compsognathus'], { ...creation(), name:'Renamed' }); expect(lab.creations).toHaveLength(1);
    lab = putCreation(lab, ['compsognathus'], creation('copy')); expect(lab.creations).toHaveLength(2);
    const next = deleteCreation(lab, 'synthetic-1'); expect(next.creations[0]!.id).toBe('copy'); expect(lab.creations).toHaveLength(2);
  });
  it('limits new creations and compact histories without evicting older valid creations', () => {
    let lab = emptyLab(); for (let i=0;i<MAX_CREATIONS;i++) lab=putCreation(lab,['compsognathus'],creation('item-'+i));
    expect(() => putCreation(lab,['compsognathus'],creation('overflow'))).toThrow(/full/);
    expect(putCreation(lab,['compsognathus'],{ ...creation('item-0'), name:'Edited' }).creations).toHaveLength(MAX_CREATIONS);
    expect(migrateLab({ creations:[...lab.creations,creation('legacy-extra')] }).creations).toHaveLength(MAX_CREATIONS+1);
    expect(() => putCreation(emptyLab(),['compsognathus'],{ ...creation(), runs:Array.from({length:MAX_RUNS+1},()=>creation().runs[0]!) })).toThrow();
  });
  it('handles missing and malformed lab fields and rejects stale or fabricated results', () => {
    expect(migrateLab(undefined)).toEqual(emptyLab()); expect(migrateLab({creations:[null,{},creation(),creation()]}).creations).toHaveLength(1);
    const c=creation(); c.runs[0]!.result.seconds=0; expect(migrateLab({creations:[c]})).toEqual(emptyLab());
    expect(validateExport({ ...exportDinosaur(creation()), version:99 })).toBe(false);
  });
});
describe('portable export contract', () => {
  it('validates the synthetic example and schema identifier', () => {
    expect(validateExport(example)).toBe(true); expect(schema.properties.schema.const).toBe(example.schema);
    expect(schema.properties.version.const).toBe(example.version);
  });
  it('whitelists only creation data, with no profile, learning records, storage, or assets', () => {
    const c = Object.assign(creation(), { profile:profile(), nameOfLearner:'Private', attempts:[1], assetUrl:'https://example.test' });
    const output = exportDinosaur(c), serialized=JSON.stringify(output);
    expect(validateExport(output)).toBe(true);
    for (const secret of ['Synthetic test learner','nameOfLearner','attempts','skillStates','totalDna','assetUrl','http','C:/','genesis-lab:profile']) expect(serialized).not.toContain(secret);
    expect(output.creation.traits).toEqual(c.traits); expect(output.creation.appearance).toEqual(c.appearance);
  });
  it('rejects extra data, unknown species, bad bounds, unsafe IDs and mismatched latest traits', () => {
    const p=exportDinosaur(creation());
    expect(validateExport({ ...p, profile:profile() })).toBe(false);
    for (const patch of [{speciesId:'unknown'},{id:'../unsafe'},{traits:{tail:99,legs:1,mass:1}},{traits:{tail:1.2,legs:1,mass:1}},{appearance:{color:'red',pattern:'plain'}}]) expect(validateExport({ ...p,creation:{ ...p.creation,...patch } })).toBe(false);
    const bad=structuredClone(p); Object.assign(bad.creation.runs[0]!,{script:'evil'}); expect(validateExport(bad)).toBe(false);
  });
});
