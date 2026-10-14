import type { Skill, SkillId } from './types';

/**
 * The skill graph.
 *
 * Prerequisites form a DAG, so the scheduler can never serve something the
 * learner has no foundation for, and new skills unlock automatically as their
 * prerequisites reach mastery. `requires` is what makes progress feel earned
 * rather than arbitrary — and it is what the dinosaur unlocks hang off.
 *
 * Adding a skill here is safe for an existing learner: `reconcileSkillStates`
 * merges new entries into a stored profile without touching what is already
 * there, so new content never costs progress or re-triggers placement.
 */
export const SKILLS: Skill[] = [
  // ---------------------------------------------------------------- number
  {
    id: 'place-value-3',
    strand: 'number',
    name: 'Place value to 1,000',
    labName: 'Sample Sorting',
    requires: [],
    maxLevel: 4,
    latencyBandMs: [12000, 12000, 14000, 16000],
    fluency: false,
  },
  {
    id: 'skip-count',
    strand: 'number',
    name: 'Skip counting',
    labName: 'Fossil Rows',
    requires: [],
    maxLevel: 4,
    latencyBandMs: [10000, 10000, 12000, 12000],
    fluency: false,
  },
  {
    id: 'compare-numbers',
    strand: 'number',
    name: 'Comparing numbers',
    labName: 'Size Scanner',
    requires: ['place-value-3'],
    maxLevel: 3,
    latencyBandMs: [8000, 9000, 10000],
    fluency: false,
  },

  // ---------------------------------------------------------------- addsub
  {
    id: 'add-20',
    strand: 'addsub',
    name: 'Addition within 20',
    labName: 'Amber Count',
    requires: [],
    maxLevel: 3,
    latencyBandMs: [5000, 4000, 3000],
    fluency: true,
  },
  {
    id: 'sub-20',
    strand: 'addsub',
    name: 'Subtraction within 20',
    labName: 'Amber Split',
    requires: ['add-20'],
    maxLevel: 3,
    latencyBandMs: [6000, 4500, 3500],
    fluency: true,
  },
  {
    id: 'add-100',
    strand: 'addsub',
    name: 'Addition within 100',
    labName: 'Bone Tally',
    requires: ['add-20', 'place-value-3'],
    maxLevel: 4,
    latencyBandMs: [12000, 14000, 16000, 18000],
    fluency: false,
  },
  {
    id: 'sub-100',
    strand: 'addsub',
    name: 'Subtraction within 100',
    labName: 'Bone Sort',
    requires: ['sub-20', 'place-value-3'],
    maxLevel: 4,
    latencyBandMs: [12000, 14000, 18000, 20000],
    fluency: false,
  },
  {
    id: 'missing-addend',
    strand: 'addsub',
    name: 'Missing number equations',
    labName: 'Broken Sequence',
    requires: ['add-20'],
    maxLevel: 4,
    latencyBandMs: [10000, 12000, 14000, 16000],
    fluency: false,
  },

  // --------------------------------------------------------------- multdiv
  {
    id: 'mult-concept',
    strand: 'multdiv',
    name: 'Equal groups and arrays',
    labName: 'Nest Grids',
    requires: [],
    maxLevel: 3,
    latencyBandMs: [14000, 15000, 16000],
    fluency: false,
  },
  {
    id: 'mult-2-5-10',
    strand: 'multdiv',
    name: 'Times tables: 2, 5, 10',
    labName: 'DNA Strands I',
    requires: ['mult-concept'],
    maxLevel: 3,
    latencyBandMs: [7000, 5000, 4000],
    fluency: true,
  },
  {
    id: 'mult-3-4',
    strand: 'multdiv',
    name: 'Times tables: 3, 4',
    labName: 'DNA Strands II',
    requires: ['mult-2-5-10'],
    maxLevel: 3,
    latencyBandMs: [8000, 6000, 4500],
    fluency: true,
  },
  {
    id: 'div-share',
    strand: 'multdiv',
    name: 'Division as fair sharing',
    labName: 'Feeding Time',
    requires: ['mult-2-5-10'],
    maxLevel: 4,
    latencyBandMs: [15000, 16000, 18000, 20000],
    fluency: false,
  },

  // ------------------------------------------------------------- fractions
  /**
   * Rooted deliberately (no prerequisites). Naming a half or a quarter from a
   * picture needs no arithmetic at all — gating it behind division would hide
   * an accessible, genuinely new idea behind an unrelated wall.
   */
  {
    id: 'fraction-parts',
    strand: 'fractions',
    name: 'Halves, quarters and thirds',
    labName: 'Amber Splitter',
    requires: [],
    maxLevel: 4,
    latencyBandMs: [14000, 15000, 16000, 18000],
    fluency: false,
  },
  {
    id: 'fraction-of-set',
    strand: 'fractions',
    name: 'Fractions of an amount',
    labName: 'Herd Division',
    requires: ['fraction-parts', 'mult-2-5-10'],
    maxLevel: 4,
    latencyBandMs: [18000, 20000, 22000, 25000],
    fluency: false,
  },

  // ----------------------------------------------------------- measurement
  {
    id: 'money-count',
    strand: 'measurement',
    name: 'Counting money',
    labName: 'Grant Funding',
    // Introductory coin pictures are accessible before advanced skip counting.
    requires: [],
    maxLevel: 4,
    latencyBandMs: [16000, 18000, 20000, 22000],
    fluency: false,
  },
  {
    id: 'time-clock',
    strand: 'measurement',
    name: 'Telling the time',
    labName: 'Expedition Clock',
    requires: [],
    maxLevel: 4,
    latencyBandMs: [16000, 18000, 20000, 22000],
    fluency: false,
  },
  {
    id: 'measure-length',
    strand: 'measurement',
    name: 'Length and measuring',
    labName: 'Field Callipers',
    requires: [],
    maxLevel: 3,
    latencyBandMs: [15000, 17000, 19000],
    fluency: false,
  },

  // -------------------------------------------------------------- geometry
  {
    id: 'shapes-2d',
    strand: 'geometry',
    name: 'Shapes and their properties',
    labName: 'Fossil Shapes',
    requires: [],
    maxLevel: 4,
    latencyBandMs: [12000, 14000, 16000, 18000],
    fluency: false,
  },
  {
    id: 'perimeter',
    strand: 'geometry',
    name: 'Perimeter',
    labName: 'Paddock Fencing',
    requires: ['shapes-2d', 'add-100'],
    maxLevel: 3,
    latencyBandMs: [20000, 22000, 25000],
    fluency: false,
  },

  // ------------------------------------------------------------- reasoning
  {
    id: 'function-machine',
    strand: 'reasoning',
    name: 'Find the rule',
    labName: 'Gene Sequencer',
    requires: ['add-20'],
    maxLevel: 4,
    latencyBandMs: [18000, 20000, 22000, 25000],
    fluency: false,
  },
  {
    id: 'word-1step',
    strand: 'reasoning',
    name: 'Word problems',
    labName: 'Field Reports',
    requires: ['add-20'],
    maxLevel: 4,
    latencyBandMs: [25000, 28000, 30000, 35000],
    fluency: false,
  },
];

export const STRAND_NAMES: Record<string, string> = {
  number: 'Numbers & Place Value',
  addsub: 'Addition & Subtraction',
  multdiv: 'Multiplication & Division',
  fractions: 'Fractions',
  measurement: 'Measurement, Money & Time',
  geometry: 'Geometry',
  reasoning: 'Reasoning & Problem Solving',
};

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: SkillId): Skill {
  const skill = BY_ID.get(id);
  if (!skill) throw new Error(`Unknown skill: ${id}`);
  return skill;
}

export function skillExists(id: SkillId): boolean {
  return BY_ID.has(id);
}

/** Skills that list `id` as a prerequisite. */
export function dependentsOf(id: SkillId): Skill[] {
  return SKILLS.filter((s) => s.requires.includes(id));
}

/**
 * Topological order, so seeding and unlock propagation always visit
 * prerequisites first. Throws on a cycle, which would be a data bug.
 */
export function topoSortedSkills(): Skill[] {
  const out: Skill[] = [];
  const seen = new Set<SkillId>();
  const visiting = new Set<SkillId>();

  const visit = (skill: Skill) => {
    if (seen.has(skill.id)) return;
    if (visiting.has(skill.id)) {
      throw new Error(`Cycle in skill graph at ${skill.id}`);
    }
    visiting.add(skill.id);
    for (const req of skill.requires) visit(getSkill(req));
    visiting.delete(skill.id);
    seen.add(skill.id);
    out.push(skill);
  };

  for (const skill of SKILLS) visit(skill);
  return out;
}
