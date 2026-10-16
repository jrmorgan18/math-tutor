import { dinoById } from '../content/dinosaurs';
import type { Setup } from './dnaLab';

export const HYBRID_MODEL_VERSION = 'genesis-hybrid-1';
export const HYBRID_PARTS = ['head', 'back', 'tail'] as const;
export type HybridPart = typeof HYBRID_PARTS[number];
export interface HybridGenome {
  donorSpeciesId: string;
  head: 'base' | 'donor';
  back: 'base' | 'donor';
  tail: 'base' | 'donor';
}
export function validHybrid(base: string, raw: unknown): raw is HybridGenome {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const h = raw as HybridGenome;
  return Object.keys(h).length === 4 && typeof h.donorSpeciesId === 'string' && !!dinoById(base) && !!dinoById(h.donorSpeciesId) && base !== h.donorSpeciesId
    && HYBRID_PARTS.every(p => h[p] === 'base' || h[p] === 'donor') && HYBRID_PARTS.some(p => h[p] === 'donor');
}
export const newHybrid = (donorSpeciesId: string): HybridGenome => ({ donorSpeciesId, head: 'donor', back: 'donor', tail: 'donor' });
export function partSources(base: string, h?: HybridGenome) {
  const source = (p: HybridPart) => h?.[p] === 'donor' ? h.donorSpeciesId : base;
  return { body: base, head: source('head'), back: source('back'), tail: source('tail') };
}
export function hybridLabel(base: string, h?: HybridGenome): string {
  const name = dinoById(base)?.name ?? base;
  return h ? `${name} + ${dinoById(h.donorSpeciesId)?.name ?? h.donorSpeciesId}` : name;
}
export const samplePace = (id: string) => ['compsognathus', 'gallimimus', 'velociraptor'].includes(id) ? 7 : ['ankylosaurus', 'brachiosaurus', 'stegosaurus'].includes(id) ? 10 : 8.5;
export function hybridPace(base: string, h?: HybridGenome): number {
  const donorShare = h ? HYBRID_PARTS.filter(p => h[p] === 'donor').length / 4 : 0;
  return samplePace(base) * (1 - donorShare) + samplePace(h?.donorSpeciesId ?? base) * donorShare;
}
export function sampleColor(base: string, h?: HybridGenome): string {
  const a = dinoById(base)?.color ?? '#73ae71';
  if (!h) return a;
  const b = dinoById(h.donorSpeciesId)?.color ?? a;
  const mix = [1, 3, 5].map(i => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, '0'));
  return '#' + mix.join('');
}
export function featureFor(part: HybridPart, speciesId: string): string {
  if (part === 'head') return speciesId === 'triceratops' ? 'Three horns and frill' : speciesId === 'pteranodon' ? 'Long beak and crest' : ['trex','velociraptor','indominus','dilophosaurus','spinosaurus'].includes(speciesId) ? 'Toothy jaws' : 'Rounded snout';
  if (part === 'back') return speciesId === 'ankylosaurus' ? 'Armored back' : speciesId === 'stegosaurus' ? 'Back plates' : speciesId === 'spinosaurus' ? 'Tall sail' : speciesId === 'pteranodon' ? 'Wings' : 'Smooth back';
  return speciesId === 'ankylosaurus' ? 'Club tail' : speciesId === 'stegosaurus' ? 'Spiked tail' : 'Balancing tail';
}
export const BATTLE_STATS = ['power', 'armor', 'speed', 'agility', 'stamina', 'reach'] as const;
export const SHARED_BATTLE_SPECIES = ['trex','spinosaurus','stegosaurus','ankylosaurus','triceratops'] as const;
/** A bounded design budget, not the battle game's damage or timing values. */
export function battleStats(base: string, setup: Setup): Record<typeof BATTLE_STATS[number], number> {
  const p = partSources(base, setup.hybrid), t = setup.traits;
  const weights = {
    power: 5 + (['trex','indominus','triceratops'].includes(p.head) ? 2 : 0) + (p.tail === 'ankylosaurus' ? 1 : 0) + (t.mass - 1) * 3,
    armor: 5 + (p.back === 'ankylosaurus' ? 3 : p.back === 'stegosaurus' ? 1 : 0) + (t.mass - 1) * 2,
    speed: 5 + (10 - hybridPace(base, setup.hybrid)) * .8 + (t.legs - 1) * 4 - (t.mass - 1) * 3,
    agility: 5 + (t.legs - 1) * 2 - (t.mass - 1) * 2 - (t.tail - 1) * 2,
    stamina: 5 + (t.mass - 1) * 2,
    reach: 5 + (t.tail - 1) * 4 + (['stegosaurus','ankylosaurus'].includes(p.tail) ? 2 : 0),
  };
  const total = BATTLE_STATS.reduce((sum, k) => sum + Math.max(1, weights[k]), 0);
  const stats = { power:1, armor:1, speed:1, agility:1, stamina:1, reach:1 };
  for (let remaining = 24; remaining > 0; remaining--) {
    const best = BATTLE_STATS.filter(k => stats[k] < 9).sort((a,b) => (Math.max(1,weights[b]) / total * 30 - stats[b]) - (Math.max(1,weights[a]) / total * 30 - stats[a]))[0]!;
    stats[best]++;
  }
  return stats;
}
export function buildBattleBlueprint(base: string, setup: Setup) {
  if (!validHybrid(base, setup.hybrid)) throw new Error('Choose two different earned samples and inherit a partner feature.');
  const h = setup.hybrid, sources = partSources(base, h);
  const hasRoster = (id: string) => SHARED_BATTLE_SPECIES.some(s => s === id);
  return {
    game: 'Dinosaur_Battle' as const,
    status: 'design-reference' as const,
    parents: [base, h.donorSpeciesId].map(speciesId => ({ speciesId, name: dinoById(speciesId)!.name })),
    anatomy: { body: base, head: sources.head, back: sources.back, tail: sources.tail },
    features: HYBRID_PARTS.map(part => ({ part, sourceSpeciesId: sources[part], description: featureFor(part, sources[part]) })),
    colors: { body: setup.appearance.color === 'sample' ? sampleColor(base, h) : ({ mint:'#69d6b1', coral:'#f28b78', violet:'#b5a0f5' })[setup.appearance.color], accent: dinoById(h.donorSpeciesId)!.color, pattern: setup.appearance.pattern },
    stats: battleStats(base, setup),
    statBudget: { min:1 as const, max:9 as const, total:30 as const },
    suggestedBaseRosterId: hasRoster(base) ? base : hasRoster(h.donorSpeciesId) ? h.donorSpeciesId : 'custom',
    unresolvedSpeciesIds: [base, h.donorSpeciesId].filter(id => !hasRoster(id)),
    implementationRequired: true as const,
  };
}
export type BattleBlueprint = ReturnType<typeof buildBattleBlueprint>;
