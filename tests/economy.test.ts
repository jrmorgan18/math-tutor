import { describe, expect, it } from 'vitest';
import { advancePostCapDiscovery, applyDna } from '../src/store/useStore';
import { newProfile, type Profile } from '../src/store/db';
import { initialSkillStates } from '../src/engine/mastery';
import { DINOSAURS, dinoById, isGateOpen, nextTarget } from '../src/content/dinosaurs';
import type { SkillId, SkillState } from '../src/engine/types';

const DAY = '2026-08-16';

function profileWith(proficient: SkillId[] = [], over: Partial<Profile> = {}): Profile {
  const states = initialSkillStates();
  for (const id of proficient) {
    states[id] = { ...(states[id] as SkillState), proficient: true, unlocked: true };
  }
  return { ...newProfile('Test', states), ...over };
}

const comp = dinoById('compsognathus')!;
const galli = dinoById('gallimimus')!;

describe('dinosaur gating', () => {
  it('has exactly one ungated starter species', () => {
    const starters = DINOSAURS.filter((d) => d.gate === 'none');
    expect(starters.length).toBe(1);
    // It must also be the cheapest, or the starter is not what he reaches first.
    const cheapest = [...DINOSAURS].sort((a, b) => a.cost - b.cost)[0];
    expect(starters[0]?.id).toBe(cheapest?.id);
  });

  it('every gate refers to a real skill', () => {
    const ids = new Set(Object.keys(initialSkillStates()));
    for (const d of DINOSAURS) {
      if (d.gate === 'all' || d.gate === 'none') continue;
      expect(ids.has(d.gate), `${d.id} -> ${d.gate}`).toBe(true);
    }
  });

  it('keeps every non-starter locked for a brand-new learner', () => {
    const p = profileWith();
    const open = DINOSAURS.filter((d) =>
      isGateOpen(d, p.hatched, (id) => p.skillStates[id]?.proficient === true),
    );
    expect(open.map((d) => d.id)).toEqual(['compsognathus']);
  });

  it('opens a species only when its own skill becomes proficient', () => {
    const before = profileWith();
    expect(isGateOpen(galli, before.hatched, (id) => before.skillStates[id]?.proficient === true)).toBe(false);

    const after = profileWith(['add-20']);
    expect(isGateOpen(galli, after.hatched, (id) => after.skillStates[id]?.proficient === true)).toBe(true);
  });

  it('gates the hybrid behind collecting everything else', () => {
    const indominus = dinoById('indominus')!;
    const allButOne = DINOSAURS.filter((d) => d.id !== 'indominus').map((d) => d.id).slice(0, -1);
    expect(isGateOpen(indominus, allButOne, () => true)).toBe(false);

    const everything = DINOSAURS.filter((d) => d.id !== 'indominus').map((d) => d.id);
    expect(isGateOpen(indominus, everything, () => true)).toBe(true);
  });
});

describe('DNA economy', () => {
  it('banks fragments when nothing is unlocked, rather than losing them', () => {
    // Everything hatched except gated species: no valid target.
    const p = profileWith([], { hatched: ['compsognathus'] });
    const { profile: after, hatched } = applyDna(p, 20, DAY, 0);
    expect(hatched).toEqual([]);
    expect(after.dna).toBe(20);
    expect(after.totalDna).toBe(20);
  });

  it('applies fragments banked during a locked stretch once a gate opens', () => {
    // 50 banked with nothing to spend them on...
    let p = profileWith([], { hatched: ['compsognathus'], dna: 50, totalDna: 50 });
    // ...then add-20 becomes proficient, opening Gallimimus (40).
    p = {
      ...p,
      skillStates: {
        ...p.skillStates,
        'add-20': { ...(p.skillStates['add-20'] as SkillState), proficient: true },
      },
    };
    const { profile: after, hatched } = applyDna(p, 0 + 5, DAY, 0);
    // 50 banked + 5 new = 55, Gallimimus costs 40 -> hatch, 15 rolls on.
    expect(hatched).toEqual(['gallimimus']);
    expect(after.dna).toBe(15);
  });

  it('hatches when the genome completes and carries the surplus forward', () => {
    const p = profileWith(['add-20']);
    const { profile: after, hatched } = applyDna(p, comp.cost + 10, DAY, 0);
    expect(hatched).toEqual(['compsognathus']);
    // add-20 is proficient so Gallimimus is next and takes the surplus.
    expect(after.sequencing?.dinoId).toBe('gallimimus');
    expect(after.sequencing?.progress).toBe(10);
    expect(after.dna).toBe(0);
  });

  it('can complete two genomes from a single large award', () => {
    const p = profileWith(['add-20']);
    const { hatched } = applyDna(p, comp.cost + galli.cost, DAY, 0);
    expect(hatched).toEqual(['compsognathus', 'gallimimus']);
  });

  it('never loses a fragment — everything is banked, in progress, or spent', () => {
    let p = profileWith(['add-20', 'place-value-3', 'sub-20']);
    let awarded = 0;
    for (let i = 0; i < 40; i++) {
      const award = 7;
      awarded += award;
      p = applyDna(p, award, DAY, 0).profile;
    }
    const spent = p.hatched.reduce((sum, id) => sum + (dinoById(id)?.cost ?? 0), 0);
    const inProgress = p.sequencing?.progress ?? 0;
    expect(p.dna + inProgress + spent).toBe(awarded);
    expect(p.totalDna).toBe(awarded);
  });

  it('tracks lifetime total separately from the spendable pool', () => {
    const p = profileWith(['add-20']);
    const { profile: after } = applyDna(p, comp.cost, DAY, 0);
    expect(after.totalDna).toBe(comp.cost);
    // Fully consumed by the hatch, so nothing is left banked.
    expect(after.dna).toBe(0);
    expect(after.hatched).toContain('compsognathus');
  });

  it('records the daily total so the cap can be enforced', () => {
    const p = profileWith(['add-20']);
    const { profile: after } = applyDna(p, 12, DAY, 100);
    expect(after.dailyDna).toBe(112);
    expect(after.dailyDnaDay).toBe(DAY);
  });

  it('a zero award changes nothing but the day stamp', () => {
    const p = profileWith(['add-20'], { dna: 5, totalDna: 5 });
    const { profile: after, hatched } = applyDna(p, 0, DAY, 0);
    expect(hatched).toEqual([]);
    expect(after.dna).toBe(5);
    expect(after.totalDna).toBe(5);
  });

  it('suggests the cheapest reachable species, or the cheapest locked one', () => {
    const fresh = profileWith();
    const first = nextTarget(fresh.hatched, (id) => fresh.skillStates[id]?.proficient === true);
    expect(first?.dino.id).toBe('compsognathus');
    expect(first?.unlocked).toBe(true);

    const stuck = profileWith([], { hatched: ['compsognathus'] });
    const next = nextTarget(stuck.hatched, (id) => stuck.skillStates[id]?.proficient === true);
    expect(next?.unlocked).toBe(false);
    expect(next?.dino.id).toBe('gallimimus');
  });

  it('turns continued post-cap work into an endless discovery track', () => {
    let p = profileWith([], { dailyDna: 150, dailyDnaDay: DAY });
    let latest: string | null = null;
    for (let i = 0; i < 3; i++) {
      const result = advancePostCapDiscovery(p, DAY);
      p = result.profile;
      latest = result.discoveryId;
    }
    expect(latest).toBe('fact-raptor-tail');
    expect(p.labLevel).toBe(1);
    expect(p.discoveries).toEqual(['fact-raptor-tail']);
    expect(p.postCapCorrect).toBe(0);
  });
});
