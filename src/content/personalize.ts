import { Rng } from '../engine/rng';
import type { Problem } from '../engine/types';
import { DINOSAURS } from './dinosaurs';

/**
 * Swap generic species names in dino-flavored word problems for one of his
 * own hatched dinosaurs — "Each Velociraptor has..." becomes "Each
 * Stegosaurus has..." once he's actually earned one.
 *
 * Pure post-processing on the *rendered* prompt string, applied at the
 * session-generation call sites in the store — never inside the generators
 * themselves. Generators take only `(level, seed)` and must stay pure and
 * testable in isolation; personalization depends on profile state they are
 * deliberately never given.
 *
 * Deliberately loose about biological accuracy (a personalized "claws"
 * problem may end up naming a herbivore) — the numbers in word problems are
 * already invented, and the real facts he learns live on the dinosaur cards,
 * not in word-problem flavor text.
 */
const SPECIES_PATTERN =
  /\b(Velociraptors?|Triceratops|T\. rex|Maiasaura|Allosaurus|Stegosaurus|Gallimimus|Compsognathus)\b/g;

export function personalizeFlavor(
  problem: Problem,
  hatchedIds: string[],
  seed: number,
): Problem {
  if (problem.flavor !== 'dino' || hatchedIds.length === 0) return problem;

  SPECIES_PATTERN.lastIndex = 0;
  if (!SPECIES_PATTERN.test(problem.prompt)) return problem;
  SPECIES_PATTERN.lastIndex = 0;

  const names = hatchedIds
    .map((id) => DINOSAURS.find((d) => d.id === id)?.name)
    .filter((n): n is string => !!n);
  if (names.length === 0) return problem;

  const chosen = new Rng(seed).pick(names);
  return { ...problem, prompt: problem.prompt.replace(SPECIES_PATTERN, chosen) };
}
