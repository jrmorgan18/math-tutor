import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DINOSAURS } from '../src/content/dinosaurs';
import { initialSkillStates } from '../src/engine/mastery';
import { addPhoto, bringDinosaur, deletePhoto, earnedDinosaurs, emptyPaddock, hasPlayAccess, MAX_DINOS, MAX_PHOTOS, MAX_PHOTO_LENGTH, migratePaddock, moveResident, PERCH, placeToy, SHADE, stepHabitat, type Photo } from '../src/play/paddock';
import { exportAll, importAll, loadAttempts, loadBackup, loadProfile, migrateProfile, newProfile, PROFILE_VERSION, resetAll, restoreBackup, saveLearningCheckpoint, saveProfile, todayKey } from '../src/store/db';
import { useStore } from '../src/store/useStore';

const disk = vi.hoisted(() => ({ records: new Map<string, unknown>(), fail: false }));
vi.mock('idb-keyval', () => ({
  get: async (key: string) => structuredClone(disk.records.get(key)),
  set: async (key: string, value: unknown) => { if (disk.fail) throw new DOMException('Full', 'QuotaExceededError'); disk.records.set(key, structuredClone(value)); },
  del: async (key: string) => { disk.records.delete(key); },
  setMany: async (entries: [string, unknown][]) => { if (disk.fail) throw new DOMException('Full', 'QuotaExceededError'); for (const [key, value] of entries) disk.records.set(key, structuredClone(value)); },
}));
const profile = () => ({ ...newProfile('Synthetic learner', initialSkillStates()), placementDone: true, dna: 42, totalDna: 900, hatched: ['compsognathus', 'stegosaurus', 'pteranodon', 'ankylosaurus', 'triceratops'], discoveries: ['fact-raptor-tail'], sessionsCompleted: 3 });
const photo = (id = 'photo-1'): Photo => ({ id, at: 1, title: 'My dinosaurs', image: 'data:image/jpeg;base64,YQ==' });
beforeEach(() => {
  disk.records.clear(); disk.fail = false;
  useStore.setState({ profile: null, session: null, attempts: [], placement: null, screen: 'home', celebrating: null });
});

describe('daily admission is actual session completion', () => {
  it('recognizes existing completion and renews the gate on a new local day', () => {
    const p = { ...profile(), lastSessionDay: '2026-10-14' };
    expect(hasPlayAccess(p, '2026-10-14')).toBe(true);
    expect(hasPlayAccess(p, '2026-10-15')).toBe(false);
    expect(hasPlayAccess({ ...p, lastSessionDay: null }, '2026-10-14')).toBe(false);
    expect(todayKey(new Date(2026, 9, 14, 0, 1))).toBe('2026-10-14');
  });
  it('proficiency, discoveries, lab level and capped DNA cannot admit an unfinished run', async () => {
    const p = { ...profile(), lastSessionDay: null, labLevel: 100, dailyDna: 150, dailyDnaDay: todayKey() };
    for (const s of Object.values(p.skillStates)) s.proficient = true;
    useStore.setState({ profile: p }); useStore.getState().beginSession();
    await useStore.getState().submitAnswer(useStore.getState().session!.problem!.answer);
    expect(hasPlayAccess(useStore.getState().profile!, todayKey())).toBe(false);
    await useStore.getState().abandonSession();
    expect(hasPlayAccess(useStore.getState().profile!, todayKey())).toBe(false);
  });
  it('finishing a full run opens play even with no available math DNA', async () => {
    useStore.setState({ profile: { ...profile(), dailyDna: 150, dailyDnaDay: todayKey() } });
    useStore.getState().beginSession();
    while (useStore.getState().session?.problem) {
      const s = useStore.getState(); await s.submitAnswer(s.session!.problem!.answer); await useStore.getState().nextItem();
    }
    expect(useStore.getState().screen).toBe('recap');
    expect(useStore.getState().profile!.sessionsCompleted).toBe(4);
    expect(hasPlayAccess(useStore.getState().profile!, todayKey())).toBe(true);
    expect(hasPlayAccess((await loadProfile())!, todayKey())).toBe(true);
  });
});

describe('earned friends and toys', () => {
  it('only hatched genomes appear; field notes and sequencing do not grant friends', () => {
    const p = profile(); p.hatched = ['compsognathus', 'unknown']; p.sequencing = { dinoId: 'velociraptor', progress: 89 };
    expect(earnedDinosaurs(p.hatched).map(d => d.id)).toEqual(['compsognathus']);
    expect(bringDinosaur(emptyPaddock(), p.hatched, 'velociraptor', { x: 300, y: 300 }).residents).toEqual([]);
  });
  it('supports every catalog species and enforces duplicates and performance limit', () => {
    for (const d of DINOSAURS) expect(bringDinosaur(emptyPaddock(), [d.id], d.id, { x: 500, y: 300 }).residents[0]?.id).toBe(d.id);
    let habitat = emptyPaddock(); const ids = DINOSAURS.map(d => d.id);
    for (const id of [...ids, ...ids]) habitat = bringDinosaur(habitat, ids, id, { x: -500, y: 900 });
    expect(habitat.residents).toHaveLength(MAX_DINOS);
    expect(habitat.residents[0]).toMatchObject({ x: 65, y: 535 });
  });
  it('a nearby friend approaches food, eats, and happily eats a second snack', () => {
    let h = bringDinosaur(emptyPaddock(), ['stegosaurus'], 'stegosaurus', { x: 250, y: 330 });
    for (let round = 0; round < 2; round++) {
      h = placeToy(h, 'food', { x: 340 + round * 50, y: 330 });
      expect(h.residents[0]!.activity).toBe('food');
      for (let beat = 1; beat <= 4; beat++) h = stepHabitat(h, beat);
      expect(h.toys.find(t => t.kind === 'food')?.active).toBe(false);
      expect(h.residents[0]!.mood).toContain('Yum!');
    }
  });
  it('tail bats, horn pushes, scampers and aerial play differ visibly', () => {
    const outcomes = new Map<string, number>();
    for (const id of ['ankylosaurus', 'triceratops', 'compsognathus', 'pteranodon']) {
      let h = bringDinosaur(emptyPaddock(), [id], id, { x: 400, y: 350 });
      h = placeToy(h, 'ball', { x: 450, y: 350 });
      expect(h.residents[0]!.mood.length).toBeGreaterThan(10);
      h = stepHabitat(h, 1);
      outcomes.set(id, h.toys[0]!.x);
      expect(h.residents[0]!.mood).toContain('♥');
    }
    expect(outcomes.get('ankylosaurus')).toBeGreaterThan(outcomes.get('triceratops')!);
    expect(outcomes.get('triceratops')).toBeGreaterThan(outcomes.get('compsognathus')!);
  });
  it('Stegosaurus enjoys shade and brush, Pteranodon flies to the perch', () => {
    let h = bringDinosaur(emptyPaddock(), ['stegosaurus','pteranodon'], 'stegosaurus', { x: 200, y: 350 });
    h = bringDinosaur(h, ['pteranodon'], 'pteranodon', { x: 600, y: 330 });
    h = placeToy(h, 'brush', { x: 200, y: 350 });
    expect(h.residents[0]!.mood).toContain('Best brush');
    h = stepHabitat(h, 8);
    expect(h.residents[0]!.target).toEqual(SHADE);
    expect(h.residents[1]!.target).toEqual(PERCH);
  });
  it('generic future friends play; held friends stay under the pointer', () => {
    let h = bringDinosaur(emptyPaddock(), ['gallimimus'], 'gallimimus', { x: 300, y: 300 });
    h = placeToy(h, 'ball', { x: 700, y: 300 });
    expect(stepHabitat(h, 1, 'gallimimus').residents[0]).toEqual(h.residents[0]);
    expect(stepHabitat(h, 1).residents[0]!.x).toBeGreaterThan(300);
  });
  it('Compsognathus sometimes interrupts a long chase to look at a butterfly', () => {
    let h = bringDinosaur(emptyPaddock(), ['compsognathus'], 'compsognathus', { x: 300, y: 350 });
    h = placeToy(h, 'ball', { x: 800, y: 350 });
    const distracted = stepHabitat(h, 5).residents[0]!;
    expect(distracted.mood).toContain('butterfly');
    expect(distracted.activity).toBe('idle');
    expect(distracted.x).toBeLessThan(300);
  });
});

describe('local persistence and preservation', () => {
  it('adds a habitat to old profiles without losing existing records or requiring placement', async () => {
    const old = { ...profile(), version: 4, paddock: undefined, lastSessionDay: todayKey(), unrelatedField: 'keep me' };
    await saveProfile(old as unknown as ReturnType<typeof profile>);
    const migrated = (await loadProfile())!;
    expect(migrated.version).toBe(PROFILE_VERSION);
    expect(migrated.paddock).toEqual(emptyPaddock());
    for (const key of ['name','dna','totalDna','hatched','discoveries','sessionsCompleted','placementDone','unrelatedField']) expect((migrated as unknown as Record<string, unknown>)[key]).toEqual((old as unknown as Record<string, unknown>)[key]);
    expect(hasPlayAccess(migrated, todayKey())).toBe(true);
    expect((await loadBackup())!.profile).toEqual(old);
    expect(migrateProfile(migrated)).toEqual(migrated);
  });
  it('play changes only habitat, preserving DNA, mastery, attempts and resumable work', async () => {
    const p = profile(); const attempts = [{ id: 'retained-attempt' }] as never[];
    await saveLearningCheckpoint(p, attempts, { marker: 'unfinished expedition' });
    useStore.setState({ profile: p, attempts });
    let h = bringDinosaur(p.paddock, p.hatched, 'stegosaurus', { x: 300, y: 350 });
    h = placeToy(h, 'ball', { x: 340, y: 350 }); h = stepHabitat(h, 1);
    await useStore.getState().savePaddock(addPhoto(h, photo()));
    const after = useStore.getState().profile!;
    const { paddock: _before, ...learningBefore } = p; const { paddock: _after, ...learningAfter } = after;
    expect(learningAfter).toEqual(learningBefore); expect(await loadAttempts()).toEqual(attempts);
    expect(disk.records.get('genesis-lab:active-session')).toEqual({ marker: 'unfinished expedition' });
    const reload = (await loadProfile())!;
    expect(reload.paddock.residents[0]).toMatchObject({ id: 'stegosaurus', x: h.residents[0]!.x, y: h.residents[0]!.y });
    expect(reload.paddock.photos).toEqual([photo()]);
  });
  it('bounded scrapbook, arrangement and old learning records round-trip through export/import and undo', async () => {
    const p = profile(); p.paddock = addPhoto(bringDinosaur(p.paddock, p.hatched, 'pteranodon', PERCH), photo());
    const attempts = [{ id: 'original attempt' }] as never[];
    await saveLearningCheckpoint(p, attempts, null);
    const exported = await exportAll();
    await importAll(exported);
    expect((await loadProfile())!.paddock).toEqual(migratePaddock(p.paddock)); expect(await loadAttempts()).toEqual(attempts);
    await resetAll(); expect(await loadProfile()).toBeNull();
    expect((await restoreBackup())!.paddock.photos).toEqual(p.paddock.photos);
    const other = { ...profile(), name: 'Different learner', createdAt: p.createdAt + 1, paddock: emptyPaddock() };
    await importAll(JSON.stringify({ profile: other }));
    expect((await loadProfile())!.paddock.photos).toEqual([]);
    expect((await restoreBackup())!.paddock.photos).toEqual(p.paddock.photos);
  });
  it('quota failure rolls back a new photo while preserving saved photos and learning data', async () => {
    const p = profile(); p.paddock = addPhoto(p.paddock, photo('safe-photo'));
    await saveProfile(p); useStore.setState({ profile: p }); disk.fail = true;
    await expect(useStore.getState().savePaddock(addPhoto(p.paddock, photo('failed-photo')))).rejects.toThrow();
    expect(useStore.getState().profile).toEqual(p); expect((await loadProfile())!.paddock.photos).toEqual([photo('safe-photo')]);
  });
  it('never simulates neglect on reload and keeps arrangements across new days', () => {
    const h = bringDinosaur(emptyPaddock(), ['compsognathus'], 'compsognathus', { x: 400, y: 320 });
    const reloaded = migratePaddock({ ...h, residents: [{ ...h.residents[0], mood: 'Yum! ♥', target: { x: 900, y: 500 } }] });
    expect(reloaded.residents[0]).toMatchObject({ x: 400, y: 320, target: null, mood: 'Happy to be here' });
    expect(moveResident(reloaded, 'compsognathus', { x: 600, y: 320 }).residents[0]!.x).toBe(600);
  });
});

describe('scrapbook limits and deletion', () => {
  it('never automatically evicts photos; deletion targets just the chosen photo', () => {
    let h = emptyPaddock(); for (let i = 0; i < MAX_PHOTOS; i++) h = addPhoto(h, photo(`photo-${i}`));
    expect(() => addPhoto(h, photo('overflow'))).toThrow(/full/);
    expect(h.photos).toHaveLength(MAX_PHOTOS);
    const deleted = deletePhoto(h, 'photo-5');
    expect(deleted.photos).toHaveLength(MAX_PHOTOS - 1); expect(h.photos).toHaveLength(MAX_PHOTOS);
    expect(deleted.photos.some(p => p.id === 'photo-5')).toBe(false);
    expect(addPhoto(deleted, photo('new')).photos).toHaveLength(MAX_PHOTOS);
  });
  it('rejects oversized and external images and bounds edited titles', () => {
    expect(() => addPhoto(emptyPaddock(), { ...photo(), image: 'data:image/jpeg;base64,' + 'a'.repeat(MAX_PHOTO_LENGTH) })).toThrow(/large/);
    expect(() => addPhoto(emptyPaddock(), { ...photo(), image: 'https://example.com/photo.jpg' })).toThrow();
    expect(addPhoto(emptyPaddock(), { ...photo(), title: 'a'.repeat(100) }).photos[0]!.title).toHaveLength(60);
  });
});
