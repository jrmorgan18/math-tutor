import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DINOSAURS } from '../src/content/dinosaurs';
import { initialSkillStates } from '../src/engine/mastery';
import { battleBuildPrompt, boundTraits, changes, defaultConditions, deleteCreation, emptyLab, earnedSamples, exportDinosaur, FIXED_SEED, MAX_CREATIONS, MAX_RUNS, migrateLab, MODEL_VERSION, originalSetup, putCreation, simulate, validateExport, validCreation, type Creation } from '../src/play/dnaLab';
import { battleStats, BATTLE_STATS, buildBattleBlueprint, featureFor, hybridPace, HYBRID_MODEL_VERSION, newHybrid, partSources, sampleColor, validHybrid } from '../src/play/hybrids';
import { hasPlayAccess } from '../src/play/paddock';
import { exportAll, importAll, loadAttempts, loadProfile, newProfile, saveLearningCheckpoint, todayKey } from '../src/store/db';
import { useStore } from '../src/store/useStore';
import example from '../docs/dinosaur-export.example.json';
import schema from '../docs/dinosaur-export.schema.json';
import hybridExample from '../docs/dinosaur-hybrid-export.example.json';
import hybridSchema from '../docs/dinosaur-hybrid-export.schema.json';
import { execFileSync } from 'node:child_process';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DinosaurArt } from '../src/ui/components/HabitatArt';
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

const hybridCreation = (id = 'hybrid-1'): Creation => {
  const setup = { ...originalSetup(), hybrid:newHybrid('ankylosaurus') };
  return { id, name:'Armored Stego', speciesId:'stegosaurus', ...setup, modelVersion:HYBRID_MODEL_VERSION, runs:[simulate('stegosaurus',setup,defaultConditions())] };
};
describe('earned hybrid creation and compatibility', () => {
  it('requires two different hatched parents and at least one inherited partner feature', () => {
    const c = hybridCreation();
    expect(() => putCreation(emptyLab(),['stegosaurus'],c)).toThrow(/parents/);
    expect(() => putCreation(emptyLab(),['ankylosaurus'],c)).toThrow(/earned/);
    expect(putCreation(emptyLab(),['stegosaurus','ankylosaurus'],c).creations).toHaveLength(1);
    for (const patch of [{donorSpeciesId:'stegosaurus'},{donorSpeciesId:'unknown'},{head:'invalid'},{head:'base',back:'base',tail:'base'},{extra:'private'}]) {
      const h = { ...c.hybrid!, ...patch };
      expect(validHybrid(c.speciesId,h)).toBe(false);
      expect(() => simulate(c.speciesId,{ ...c,hybrid:h as never },defaultConditions())).toThrow();
    }
  });
  it('supports every pair of catalog parents with deterministic bounded results and attributes', () => {
    for (const base of DINOSAURS) for (const donor of DINOSAURS.filter(d => d.id !== base.id)) {
      const setup = { ...originalSetup(), hybrid:newHybrid(donor.id) };
      const run = simulate(base.id,setup,defaultConditions());
      expect(run).toEqual(simulate(base.id,setup,defaultConditions()));
      expect(run.modelVersion).toBe(HYBRID_MODEL_VERSION);
      expect(run.result.seconds).toBeGreaterThan(0);
      const c: Creation = { id:'pair',name:'Pair',speciesId:base.id,...setup,modelVersion:HYBRID_MODEL_VERSION,runs:[run] };
      expect(validCreation(c)).toBe(true); expect(validateExport(exportDinosaur(c))).toBe(true);
      const stats = battleStats(base.id,setup);
      expect(Object.values(stats).reduce((a,b)=>a+b,0)).toBe(30);
      for (const key of BATTLE_STATS) { expect(Number.isInteger(stats[key])).toBe(true); expect(stats[key]).toBeGreaterThanOrEqual(1); expect(stats[key]).toBeLessThanOrEqual(9); }
    }
  });
  it('records the selected sources and makes inheritance affect the visible silhouette', () => {
    const c=hybridCreation(); c.hybrid={...c.hybrid!,head:'base'};
    expect(partSources(c.speciesId,c.hybrid)).toEqual({body:'stegosaurus',head:'stegosaurus',back:'ankylosaurus',tail:'ankylosaurus'});
    expect(featureFor('tail','ankylosaurus')).toBe('Club tail');
    const output=renderToStaticMarkup(createElement(DinosaurArt,{id:c.speciesId,setup:c}));
    expect(output).toContain('data-hybrid-back="ankylosaurus"'); expect(output).toContain('data-hybrid-tail="ankylosaurus"');
    expect(output).toContain('cx="-72"'); // Actual club-tail art, beyond metadata.
    expect(sampleColor('stegosaurus',c.hybrid)).not.toBe(sampleColor('stegosaurus'));
  });
  it('uses inherited parts to mix baseline pace while preserving every v1 result', () => {
    const setup={...originalSetup(),hybrid:newHybrid('compsognathus')};
    expect(hybridPace('stegosaurus',setup.hybrid)).toBe(7.75);
    expect(hybridPace('stegosaurus',{...setup.hybrid,head:'base',back:'base'})).toBe(9.25);
    expect(simulate('stegosaurus',setup,defaultConditions()).result.seconds).toBe(7.75);
    expect(exportDinosaur(example.creation as Creation)).toEqual(example);
    const changed={...setup,hybrid:{...setup.hybrid,tail:'base' as const}};
    expect(changes(setup,changed)).toEqual(['tail DNA']);
  });
  it('preserves old notebook entries, new hybrid histories and unrelated learning across migration/export/import', async () => {
    const p=profile(); p.version=6; p.hatched.push('stegosaurus','ankylosaurus');
    p.dnaLab=putCreation(emptyLab(),p.hatched,creation());
    const attempts=[{id:'retained-hybrid-attempt'}] as never[];
    await saveLearningCheckpoint(p,attempts,{unfinished:true}); useStore.setState({profile:p,attempts});
    const next=putCreation(p.dnaLab,p.hatched,hybridCreation()); await useStore.getState().saveLab(next);
    const {dnaLab:_before,...before}=p; const {dnaLab:_after,...after}=useStore.getState().profile!;
    expect(after).toEqual(before); expect(await loadAttempts()).toEqual(attempts);
    expect(disk.records.get('genesis-lab:active-session')).toEqual({unfinished:true});
    expect((await loadProfile())!.dnaLab.creations).toEqual(next.creations);
    const backup=await exportAll(); await importAll(backup);
    expect((await loadProfile())!.dnaLab.creations).toEqual(next.creations);
    expect(migrateLab(next)).toEqual(next);
    expect(next.creations[0]).toEqual(creation());
  });
  it('rejects stale morphology, mixed-parent histories and fabricated hybrid model results', () => {
    const c=hybridCreation();
    for (const mutate of [
      (x:Creation)=>{ x.hybrid!.head='base'; },
      (x:Creation)=>{ x.runs[0]!.hybrid!.donorSpeciesId='trex'; },
      (x:Creation)=>{ x.runs[0]!.result.seconds=0; },
      (x:Creation)=>{ x.modelVersion=MODEL_VERSION; },
    ]) { const bad=structuredClone(c);mutate(bad);expect(validCreation(bad)).toBe(false); }
  });
  it('retains saved creations unchanged when a hybrid save runs out of storage', async () => {
    const p=profile();p.hatched.push('stegosaurus','ankylosaurus');p.dnaLab=putCreation(emptyLab(),p.hatched,creation());
    await saveLearningCheckpoint(p,[],null);useStore.setState({profile:p});disk.fail=true;
    await expect(useStore.getState().saveLab(putCreation(p.dnaLab,p.hatched,hybridCreation()))).rejects.toThrow();
    expect(useStore.getState().profile).toEqual(p);expect((await loadProfile())!.dnaLab).toEqual(p.dnaLab);
  });
});

describe('hybrid Battle handoff', () => {
  it('keeps v1 exports and validates the standalone v2 schema and synthetic example', () => {
    expect(validateExport(example)).toBe(true);expect(validateExport(hybridExample)).toBe(true);
    expect(hybridSchema.properties.version.const).toBe(2);
    expect(hybridSchema.properties.creation.properties.modelVersion.const).toBe(HYBRID_MODEL_VERSION);
    for(const file of ['docs/dinosaur-export.example.json','docs/dinosaur-hybrid-export.example.json']) expect(execFileSync(process.execPath,['scripts/validate-dinosaur-export.mjs',file],{encoding:'utf8'})).toContain('Valid Genesis Lab export shape');
  });
  it('exports reproducible parentage, anatomy, colors, bounded stats and honest Battle roster references', () => {
    const c=hybridCreation(),data=exportDinosaur(c);
    expect(data.version).toBe(2);expect(data.battleBlueprint).toEqual(buildBattleBlueprint(c.speciesId,c));
    expect(data.battleBlueprint!.anatomy.tail).toBe('ankylosaurus');
    expect(data.battleBlueprint!.suggestedBaseRosterId).toBe('stegosaurus');
    expect(data.battleBlueprint!.unresolvedSpeciesIds).toEqual([]);
    expect(data.battleBlueprint!.implementationRequired).toBe(true);
    const setup={...originalSetup(),hybrid:newHybrid('pteranodon')};
    const bp=buildBattleBlueprint('compsognathus',setup);
    expect(bp.suggestedBaseRosterId).toBe('custom');expect(bp.unresolvedSpeciesIds).toEqual(['compsognathus','pteranodon']);
  });
  it('rejects tampered Battle attributes, unrecognized fields and incompatible versions', () => {
    const data=exportDinosaur(hybridCreation());
    for(const mutate of [
      (x:typeof data)=>{x.battleBlueprint!.stats.power=9;},
      (x:typeof data)=>{x.battleBlueprint!.anatomy.tail='trex';},
      (x:typeof data)=>{x.battleBlueprint!.colors.body='#ffffff';},
      (x:typeof data)=>{Object.assign(x.battleBlueprint!,{private:'hidden'});},
      (x:typeof data)=>{x.version=1;},
    ]) {const bad=structuredClone(data);mutate(bad);expect(validateExport(bad)).toBe(false);}
  });
  it('provides a self-contained build prompt without profile, learning or executable data', () => {
    const c=Object.assign(hybridCreation(),{profile:profile(),attempts:[1]});
    const prompt=battleBuildPrompt(c);
    expect(prompt).toContain('src/core/types.ts');expect(prompt).toContain('src/data/roster.ts');
    expect(prompt).toContain('quick/heavy/special');expect(prompt).toContain('not battle damage');
    expect(prompt).toContain('Club tail');expect(prompt).toContain('"version": 2');
    for(const privateValue of ['Synthetic test learner','skillStates','totalDna','genesis-lab:profile']) expect(prompt).not.toContain(privateValue);
    expect(()=>battleBuildPrompt(creation())).toThrow(/hybrid/);
    const reordered=JSON.parse(JSON.stringify(exportDinosaur(c)));
    reordered.battleBlueprint={...reordered.battleBlueprint,colors:{pattern:reordered.battleBlueprint.colors.pattern,accent:reordered.battleBlueprint.colors.accent,body:reordered.battleBlueprint.colors.body}};
    expect(validateExport(reordered)).toBe(true);
  });
});
