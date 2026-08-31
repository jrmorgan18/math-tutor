/** Core types for the learning engine. */

export type StrandId =
  | 'number'
  | 'addsub'
  | 'multdiv'
  | 'fractions'
  | 'measurement'
  | 'geometry'
  | 'reasoning';

export type SkillId = string;

/** Structural labels used to select a problem for a particular misconception. */
export type ConceptTag = string;

/** How the learner answers. */
export type Representation =
  | { kind: 'numeric' }
  | { kind: 'choice'; options: string[] }
  /**
   * Build the answer by tapping cells/dots rather than typing a number. Varies
   * the physical action across a session, and for small quantities it is a
   * more honest test of the concept than recalling a digit.
   */
  | { kind: 'build'; mode: 'tenframe' | 'array'; max: number }
  /**
   * Enter a column sum one column at a time, right to left — ones first, then
   * tens, carrying as you go. Typing `81` as a single number hides whether he
   * actually carried or just knew the fact; entering the ones digit first and
   * being asked what to carry makes the algorithm itself the thing being
   * practised. `columns` is how many digits the answer has.
   */
  | { kind: 'columns'; columns: number; carry: boolean }
  /**
   * Drag a marker along a number line instead of typing. For a child who can
   * *place* 47 but stumbles writing it, this separates number sense from
   * numeral recall — and it is the only input where being close is visible
   * feedback in itself.
   */
  | { kind: 'numberline'; from: number; to: number; step: number };

/**
 * A picture that can accompany a hint.
 *
 * This is the concrete/pictorial half of concrete -> pictorial -> abstract.
 * Prose hints only work for a learner who already half-understands; a child
 * meeting an idea for the first time needs to *see* it. "A missing addend is
 * a subtraction in disguise" teaches nothing on its own — the same hint with
 * a bar model and the terms stacked for subtraction teaches the whole idea.
 */
export type HintVisual =
  /** Column arithmetic, right-aligned, optionally showing the result. */
  | {
      kind: 'stacked';
      top: number;
      bottom: number;
      op: '+' | '-';
      result?: number;
      /** Draw attention to the column where the carry/borrow happens. */
      highlight?: 'ones' | 'tens';
    }
  /**
   * A number line from `from` to `to`. Jumps are computed to show the
   * bridging strategy (hop to the next ten, then the rest) rather than a
   * single opaque leap.
   */
  | { kind: 'numberline'; from: number; to: number; unknownLabel?: string }
  /** Two ten-frames: `a` dots, then `b` more, making the make-a-ten visible. */
  | { kind: 'tenframe'; a: number; b: number }
  | { kind: 'array'; rows: number; cols: number }
  /**
   * Part-whole bar model. `null` marks the unknown. This is the single most
   * important representation for missing-addend and word problems — it makes
   * "which operation do I need?" a thing you can see instead of guess.
   */
  | { kind: 'barmodel'; whole: number | null; parts: Array<number | null> }
  /** N circles with `per` dots in each. */
  | { kind: 'groups'; groups: number; per: number }
  /**
   * Base-ten columns. Place value is exactly the kind of idea that is
   * invisible in pure symbols — seeing 407 as 4 hundreds / 0 tens / 7 ones
   * is what makes the zero stop being a mystery.
   */
  | {
      kind: 'placevalue';
      hundreds: number;
      tens: number;
      ones: number;
      highlight?: 'hundreds' | 'tens' | 'ones';
    }
  /**
   * A shape cut into `parts` equal pieces with `shaded` of them filled. The
   * whole of early fractions is "equal pieces of one whole" — a picture makes
   * that obvious and the notation 3/4 does not.
   */
  | {
      kind: 'fractionbar';
      parts: number;
      shaded: number;
      shape: 'bar' | 'circle';
      /** Optional second shape, for comparing two fractions side by side. */
      compare?: { parts: number; shaded: number };
    }
  /** An analogue clock face. `minute` is 0-59. */
  | { kind: 'clock'; hour: number; minute: number }
  /** Coins laid out, values in cents. Drawn to relative size, labelled. */
  | { kind: 'coins'; values: number[]; total?: number }
  /**
   * A polygon. `sideLabels` drives the perimeter work — the numbers have to
   * sit on the edges they describe or the picture teaches nothing.
   */
  | {
      kind: 'shape';
      sides: number;
      label?: string;
      sideLabels?: number[];
      /** Mark the line of symmetry, for the symmetry levels. */
      symmetry?: boolean;
    }
  /** A ruler/bar measured in units, for length comparison. */
  | { kind: 'ruler'; lengths: number[]; unit: string };

/** One rung of the hint ladder: words, optionally with a picture. */
export interface Hint {
  text: string;
  visual?: HintVisual;
}

export interface Skill {
  id: SkillId;
  strand: StrandId;
  /** Short label for the parent dashboard. */
  name: string;
  /** Kid-facing name, used in the session UI. */
  labName: string;
  /** Skill ids that must be mastered before this unlocks. */
  requires: SkillId[];
  /** Number of difficulty tiers, 1..maxLevel. */
  maxLevel: number;
  /**
   * Expected solve time in ms at each level, used to distinguish fluent recall
   * from correct-but-effortful. Index 0 is level 1.
   */
  latencyBandMs: number[];
  /**
   * True for skills where speed is a legitimate goal (fact fluency). Timers and
   * speed feedback only ever appear on these — never on new concepts.
   */
  fluency: boolean;
}

/** A single generated question, ready to render. */
export interface Problem {
  skillId: SkillId;
  level: number;
  /** Stable id so an attempt can be traced back to the exact question. */
  seed: number;
  /** The question text shown to the learner. */
  prompt: string;
  /** Optional second line, e.g. a hint at the representation. */
  subPrompt?: string;
  /**
   * A picture that is part of the *question itself* rather than a hint —
   * "how many dots?" needs the dots on screen before he can answer.
   */
  questionVisual?: HintVisual;
  /** Canonical correct answer as a string, compared after normalisation. */
  answer: string;
  representation: Representation;
  /**
   * Progressive hints. Index 0 is the gentlest nudge; the last entry is the
   * fully worked solution. The UI never skips ahead to the end — though it
   * may *start* partway down when his wrong answer tells us which rung is
   * actually relevant (see engine/adaptiveHints.ts).
   */
  hints: Hint[];
  /** Context tag used to vary theming and for the parent dashboard. */
  flavor?: 'dino' | 'space' | 'soccer' | 'music' | 'lab';
  /**
   * Structural facts about the question, used to classify *how* a wrong answer
   * was wrong. Knowing he dropped a carry is actionable; knowing he was wrong
   * is not.
   */
  meta?: {
    operands?: number[];
    op?: '+' | '-' | '×' | '÷';
    /** What mathematical structure this particular variant exercises. */
    tags?: ConceptTag[];
  };
}

export type ErrorType =
  | 'correct'
  | 'off-by-one'
  | 'off-by-ten'
  | 'regrouping'
  | 'place-value'
  | 'operation-reversed'
  | 'transposition'
  | 'near-miss'
  | 'likely-guess'
  | 'timeout'
  | 'other';

export interface Attempt {
  id: string;
  skillId: SkillId;
  level: number;
  seed: number;
  /** What the learner typed or selected. */
  given: string;
  expected: string;
  correct: boolean;
  errorType: ErrorType;
  latencyMs: number;
  /** How far down the hint ladder they went, 0 = unaided. */
  hintsUsed: number;
  /** Which slot of the session mix produced this problem. */
  slot: SessionSlot;
  at: number;
  /**
   * His own tap-choice guess at why he got it wrong (only set on misses),
   * from content/remediation.ts's ReflectBucket. Kept as a plain string here
   * rather than importing the content type, so the engine layer doesn't
   * depend on content — compared against the real classification wherever
   * it's read.
   */
  selfDiagnosis?: 'operation' | 'slip' | 'stuck' | 'unsure';
  /** True for an inserted apply-it-again item after a miss. */
  retry?: boolean;
  /** Support is deliberately faded across concrete -> pictorial -> transfer. */
  remediationStage?: 'concrete' | 'faded' | 'transfer';
  /** Misconception this item was selected to address. */
  targetError?: ErrorType;
  /** Structural tags copied from the generated problem for later diagnosis. */
  conceptTags?: ConceptTag[];
  /** Present when this attempt is one chapter of a linked boss investigation. */
  boss?: BossMeta;
}

export type SessionSlot = 'warmup' | 'review' | 'working' | 'new' | 'stretch' | 'boss';

export interface BossMeta {
  id: string;
  step: number;
  total: number;
  /** Shared seed: every chapter reconstructs the same story and quantities. */
  storySeed: number;
}

/** Per-skill mastery state, persisted. */
export interface SkillState {
  skillId: SkillId;
  level: number;
  /** Recency-weighted accuracy in [0,1]. Null until first attempt. */
  accuracy: number | null;
  medianLatencyMs: number | null;
  /** Rolling window of the last 10 latencies, used for the median. */
  recentLatencies: number[];
  /** Total attempts ever. */
  attempts: number;
  /** Performance without any revealed hint. This is the proficiency signal. */
  independentAccuracy: number | null;
  independentAttempts: number;
  /** Performance after asking for or automatically receiving support. */
  supportedAccuracy: number | null;
  supportedAttempts: number;
  /** Whether immediate application after remediation is transferring. */
  retryAttempts: number;
  retrySuccesses: number;
  /** Small rolling window used to target recurring misconceptions. */
  recentErrors: ErrorType[];
  /** Consecutive correct at the current level, drives level-ups. */
  streak: number;
  /** Consecutive wrong, drives the auto-drop safety net. */
  missStreak: number;
  /** Spaced-repetition interval in days. */
  intervalDays: number;
  /** Next time this skill is due for review, epoch ms. */
  dueAt: number;
  /** Count of spaced reviews passed at >= 7 day intervals. */
  retentionChecks: number;
  /**
   * Accuracy + latency + top level all cleared. Reachable in days, and this is
   * what unlocks downstream skills and dinosaur species — so progress never
   * stalls waiting on the calendar.
   */
  proficient: boolean;
  /**
   * Proficient *and* retained across two spaced reviews. This is the honest
   * "he knows it" signal: it governs when a skill stops consuming session time
   * and is what the parent dashboard reports.
   */
  mastered: boolean;
  /** Unlocked once every prerequisite is proficient. */
  unlocked: boolean;
  lastSeenAt: number | null;
  /** Placement evidence is kept separate from real practice evidence. */
  placementSeen: boolean;
  placementLevel: number | null;
}
