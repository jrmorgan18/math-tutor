import type { SkillId } from '../engine/types';

/**
 * The dinosaur roster — the reward economy.
 *
 * Every species is gated on a *skill*, not on a quantity of practice. Grinding
 * easy problems earns DNA but can never unlock the next dinosaur; only
 * becoming proficient at something new can. That single rule is what keeps the
 * app from turning into a points farm, and it is why the collection screen
 * shows locked silhouettes with their requirement spelled out: the reward for
 * learning division is visible long before he can claim it.
 *
 * Fact cards are real palaeontology. Pronunciations are included because he
 * will want to say the names out loud.
 */

export interface Dinosaur {
  id: string;
  name: string;
  say: string;
  /** DNA fragments needed to complete the genome. */
  cost: number;
  /**
   * Must be proficient at this skill before sequencing can begin.
   * `'none'` is the starter species — reachable in the first session so the
   * reward loop is taught by experiencing it rather than described. `'all'`
   * requires every other genome.
   */
  gate: SkillId | 'all' | 'none';
  period: string;
  diet: 'Carnivore' | 'Herbivore' | 'Omnivore' | 'Piscivore';
  length: string;
  /** Two or three sentences he will actually enjoy reading. */
  fact: string;
  /** Emoji stand-in until real art lands. */
  glyph: string;
  /** Paddock card accent colour. */
  color: string;
}

export const DINOSAURS: Dinosaur[] = [
  {
    id: 'compsognathus',
    name: 'Compsognathus',
    say: 'komp-sog-NAY-thus',
    cost: 30,
    // Ungated on purpose: the first dinosaur has to be reachable inside the
    // first session, or the mechanic is only ever a promise.
    gate: 'none',
    period: 'Late Jurassic',
    diet: 'Carnivore',
    length: '1 metre',
    fact: 'About the size of a turkey, and one of the smallest dinosaurs ever found. One fossil still had its last meal inside it — a fast little lizard.',
    glyph: '🦎',
    color: '#7bc96f',
  },
  {
    id: 'gallimimus',
    name: 'Gallimimus',
    say: 'gal-ih-MY-mus',
    cost: 40,
    gate: 'add-20',
    period: 'Late Cretaceous',
    diet: 'Omnivore',
    length: '6 metres',
    fact: 'Its name means "chicken mimic". It could run around 50 kilometres an hour, which is faster than any human who has ever lived.',
    glyph: '🪶',
    color: '#e8b04b',
  },
  {
    id: 'stegosaurus',
    name: 'Stegosaurus',
    say: 'STEG-oh-SORE-us',
    cost: 50,
    gate: 'place-value-3',
    period: 'Late Jurassic',
    diet: 'Herbivore',
    length: '9 metres',
    fact: 'The plates on its back were not solid armour — they were full of blood vessels and may have been used to shed heat or flash colour. Its tail spikes have a name: the thagomizer.',
    glyph: '🦕',
    color: '#5fa8d3',
  },
  {
    id: 'parasaurolophus',
    name: 'Parasaurolophus',
    say: 'PAR-uh-sore-OL-oh-fus',
    cost: 60,
    gate: 'skip-count',
    period: 'Late Cretaceous',
    diet: 'Herbivore',
    length: '10 metres',
    fact: 'The long crest on its head was hollow and connected to its nose. Scientists built a model of it and blew air through — it sounds like a giant foghorn.',
    glyph: '🎺',
    color: '#c98bdb',
  },
  {
    id: 'triceratops',
    name: 'Triceratops',
    say: 'try-SERRA-tops',
    cost: 70,
    gate: 'add-100',
    period: 'Late Cretaceous',
    diet: 'Herbivore',
    length: '9 metres',
    fact: 'Its skull could be over 2 metres long — about as tall as a door. It lived at the very end of the age of dinosaurs, alongside T. rex.',
    glyph: '🦏',
    color: '#e0724f',
  },
  {
    id: 'ankylosaurus',
    name: 'Ankylosaurus',
    say: 'an-KIE-loh-SORE-us',
    cost: 70,
    gate: 'sub-100',
    period: 'Late Cretaceous',
    diet: 'Herbivore',
    length: '8 metres',
    fact: 'A walking tank, armoured even over its eyelids. The club on its tail was solid bone and could swing hard enough to break a predator’s leg bones.',
    glyph: '🛡️',
    color: '#8d99ae',
  },
  {
    id: 'dilophosaurus',
    name: 'Dilophosaurus',
    say: 'die-LOAF-oh-SORE-us',
    cost: 80,
    gate: 'mult-concept',
    period: 'Early Jurassic',
    diet: 'Carnivore',
    length: '7 metres',
    fact: 'It had two thin crests along its skull. The films give it a frill and venom — real fossils show neither, and it was far bigger than the movie version.',
    glyph: '🦖',
    color: '#4fb0a5',
  },
  {
    id: 'velociraptor',
    name: 'Velociraptor',
    say: 'veh-LOSS-ih-rap-tor',
    cost: 90,
    gate: 'mult-2-5-10',
    period: 'Late Cretaceous',
    diet: 'Carnivore',
    length: '2 metres',
    fact: 'It was covered in feathers and stood about as tall as a large turkey. Fossil arm bones show quill knobs — the same anchor points birds have for wing feathers today.',
    glyph: '🦅',
    color: '#d94f4f',
  },
  {
    id: 'pteranodon',
    name: 'Pteranodon',
    say: 'tuh-RAN-oh-don',
    cost: 90,
    gate: 'compare-numbers',
    period: 'Late Cretaceous',
    diet: 'Piscivore',
    length: '6 metre wingspan',
    fact: 'Not a dinosaur at all — a flying reptile, and a cousin of dinosaurs. It had no teeth and probably scooped fish from the sea while gliding.',
    glyph: '🦇',
    color: '#6c8ed4',
  },
  {
    id: 'brachiosaurus',
    name: 'Brachiosaurus',
    say: 'BRACK-ee-oh-SORE-us',
    cost: 110,
    gate: 'mult-3-4',
    period: 'Late Jurassic',
    diet: 'Herbivore',
    length: '22 metres',
    fact: 'Its front legs were longer than its back legs, so it stood tilted upward like a giraffe. Its heart had to pump blood up a neck 9 metres long.',
    glyph: '🌿',
    color: '#6aa84f',
  },
  {
    id: 'mosasaurus',
    name: 'Mosasaurus',
    say: 'MOES-uh-SORE-us',
    cost: 120,
    gate: 'missing-addend',
    period: 'Late Cretaceous',
    diet: 'Carnivore',
    length: '17 metres',
    fact: 'A sea reptile, more closely related to modern snakes and monitor lizards than to dinosaurs. It had a second set of teeth on the roof of its mouth.',
    glyph: '🌊',
    color: '#3d7ea6',
  },
  {
    id: 'spinosaurus',
    name: 'Spinosaurus',
    say: 'SPINE-oh-SORE-us',
    cost: 130,
    gate: 'div-share',
    period: 'Late Cretaceous',
    diet: 'Piscivore',
    length: '15 metres',
    fact: 'The largest meat-eating dinosaur known, and the only one we think actually swam. Its tail was shaped like a paddle and it mostly hunted enormous fish.',
    glyph: '🐊',
    color: '#b5651d',
  },
  {
    id: 'trex',
    name: 'Tyrannosaurus rex',
    say: 'tie-RAN-oh-SORE-us REX',
    cost: 160,
    gate: 'word-1step',
    period: 'Late Cretaceous',
    diet: 'Carnivore',
    length: '12 metres',
    fact: 'Its bite was the strongest of any land animal ever — hard enough to crush bone. Its tiny arms were not weak: each could lift roughly 200 kilograms.',
    glyph: '🦖',
    color: '#c0392b',
  },
  {
    id: 'indominus',
    name: 'Indominus rex',
    say: 'in-DOM-ih-nus REX',
    cost: 250,
    gate: 'all',
    period: 'Laboratory hybrid',
    diet: 'Carnivore',
    length: '15 metres',
    fact: 'Not a real dinosaur — a made-up hybrid from the films. Sequencing it needs every other genome in the lab finished first. Nobody has ever built one.',
    glyph: '🧬',
    color: '#8e44ad',
  },
];

export const DINOSAURS_BY_ID = new Map(DINOSAURS.map((d) => [d.id, d]));

export function dinoById(id: string): Dinosaur | undefined {
  return DINOSAURS_BY_ID.get(id);
}

/** Single source of truth for whether a species can be sequenced yet. */
export function isGateOpen(
  d: Dinosaur,
  hatched: string[],
  isProficient: (skillId: SkillId) => boolean,
): boolean {
  if (d.gate === 'none') return true;
  if (d.gate === 'all') {
    return DINOSAURS.filter((x) => x.id !== 'indominus').every((x) =>
      hatched.includes(x.id),
    );
  }
  return isProficient(d.gate);
}

/** Human-readable requirement, for the locked state in the UI. */
export function gateLabel(d: Dinosaur, skillName: (id: SkillId) => string): string {
  if (d.gate === 'none') return 'Ready to sequence';
  if (d.gate === 'all') return 'every other genome in the lab';
  return skillName(d.gate);
}

/**
 * The next dinosaur worth working toward: the cheapest one not yet hatched
 * whose skill gate he has already cleared. If none are open, returns the
 * cheapest locked one so the UI can show him what to aim at and why.
 */
export function nextTarget(
  hatched: string[],
  isProficient: (skillId: SkillId) => boolean,
): { dino: Dinosaur; unlocked: boolean } | null {
  const remaining = DINOSAURS.filter((d) => !hatched.includes(d.id));
  if (remaining.length === 0) return null;

  const gateOpen = (d: Dinosaur) => isGateOpen(d, hatched, isProficient);

  const open = remaining.filter(gateOpen).sort((a, b) => a.cost - b.cost);
  if (open.length > 0) return { dino: open[0] as Dinosaur, unlocked: true };
  return { dino: remaining.sort((a, b) => a.cost - b.cost)[0] as Dinosaur, unlocked: false };
}
