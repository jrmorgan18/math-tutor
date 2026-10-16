# Genesis Lab

An adaptive maths tutor for a 7-year-old working about a year ahead of his class.
Runs locally in the browser; everything is stored on the device.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 181 tests
npm run build      # static output in dist/
```

---

## Progress is not allowed to be lost

This is the first rule of the codebase, and it is first because it was
already broken once: a stored profile was destroyed by a careless reset during
testing, and a session's real work went with it.

Three things now stand between a learner and that happening again:

1. **Migrations may add and repair, but never discard.** `migrateProfile` in
   `store/db.ts` upgrades any recognisable profile to the current schema
   whatever version it claims, and `reconcileSkillStates` folds new skills into
   a stored profile while preserving earned assets and history. Version 4 rebuilds difficulty evidence from the retained attempt log; earlier higher levels remain labelled as awaiting verification.
   The old code returned `null` on a version mismatch — which silently threw
   the profile away and sent him back through placement. **`placementDone` is
   carried across untouched: nobody re-sits a test they have already passed.**
2. **A snapshot is taken before anything destructive** — a reset, an import, or
   a schema migration — and Settings → Undo restores it. Nothing here is worth
   so little that deleting it should be silent and final.
3. **`reset` is not reachable from the dev console handle.** `window.__lab`
   exists on the same origin as the real profile, so a "just cleaning up after
   testing" reset there wipes actual progress. It exposes `restore` instead:
   the thing you urgently need from a console is the undo, not the delete.

`tests/migration.test.ts` holds this down with a realistic v1 profile —
mid-progress, placement done — and asserts every scalar, every per-skill
mastery field, and `placementDone` survive intact.

### Enabling the Claude hints (optional)

```bash
cp .env.example .env
```

Then edit `.env`:

```
GENESIS_LAB_ANTHROPIC_KEY=sk-ant-api03-...
```

Restart `npm run dev`. On startup the server prints which key it is using:

```
[hint] Claude hints enabled — key …iwAA via GENESIS_LAB_ANTHROPIC_KEY (from .env)
```

Without a key the app is fully usable — the hint button just falls back to the
authored hint ladder, and the server says so at startup.

> **Why `GENESIS_LAB_ANTHROPIC_KEY` and not `ANTHROPIC_API_KEY`?**
> Vite's `loadEnv` applies `.env` values first and then overwrites them with
> `process.env`. So a generic `ANTHROPIC_API_KEY` exported in your shell for
> another project would silently override the one in this project's `.env`, and
> this app's usage would bill to that key with no warning. The project-specific
> name cannot collide. `ANTHROPIC_API_KEY` still works as a fallback, and the
> server warns when it is being picked up from your shell.

---

## The one design rule

Most kids' maths apps are drill apps: sample from a fixed pool, reward speed,
reward volume. A capable child finds the cheap path — grind easy problems,
collect points, learn nothing new.

Four decisions prevent that, and they drive the whole codebase:

1. **Difficulty is tracked per skill, not globally** (`engine/mastery.ts`), and
   the scheduler deliberately keeps him at the edge of his ability.
2. **Rewards are gated behind new-skill proficiency, not volume**
   (`content/dinosaurs.ts`). Grinding addition can never unlock the dinosaur
   that needs division. A daily DNA cap makes grinding stop paying entirely.
3. **Every session contains something new and something too hard**
   (`engine/scheduler.ts`), and a missed stretch item costs him nothing.
4. **Mastery requires retention over time**, not one good day.

---

## How it fits together

```
engine/          pure, testable, no React
  skills.ts        the skill graph (DAG, prerequisites, difficulty tiers)
  generators/      one pure generator per skill: (level, seed) -> Problem
  mastery.ts       accuracy, latency banding, spaced repetition, unlocks
  scheduler.ts     composes a session from the slot mix
  placement.ts     per-strand adaptive staircase
  errors.ts        classifies *how* an answer was wrong
  predict.ts       derives the "bigger or smaller?" pre-answer calibration question
  hintBuilders.ts  terse constructors for hints and their visuals
  adaptiveHints.ts decides which rung the ladder opens at, given his mistake

content/         dinosaur roster, word-problem templates, remediation text,
                 personalization (swaps generic species names for his own),
                 weekly dig sites
store/           IndexedDB persistence + zustand + migration/backup
ui/              screens and components
llm/             the one runtime Claude call
```

### Generators are pure and never wrong

Every problem comes from a deterministic generator taking `(level, seed)`. The
LLM never computes anything. `tests/generators.test.ts` checks ~50,000 generated
problems: answers recomputed from their own operands, choice options unique and
containing the answer, difficulty tiers meaning what they claim (level 4
subtraction always needs a borrow, division levels 1–3 always divide exactly).

Because generators are pure, an attempt record stores only
`(skillId, level, seed)` — any past question can be reconstructed exactly.

### Understanding, fluency and retention

- **Proficient** — independent accuracy and demonstrated top difficulty cleared. Requires at least eight total attempts, six independent non-retry evidence items, and at least three at the top tier with 85% accuracy.
  This is what unlocks downstream skills and dinosaurs, so progress never
  stalls waiting on the calendar.
- **Mastered** — proficient *and* still correct across two reviews at least a
  week apart. This is the honest "he knows it" signal, and it governs when a
  skill stops consuming session time.

**Fluency** is a separate goal for fact skills. Only reliable, uninterrupted top-tier timings contribute; elapsed wall time never gates mathematical proficiency or rewards.

### The session mix

| Slot | Count | Purpose |
|---|---|---|
| `warmup` | 2 | Mastered material. Opens with a win. |
| `review` | 2 | Spaced retrieval of skills that are due. |
| `working` | 9 | The 2–4 skills at the edge of his ability. |
| `new` | 2 | Next thing in the graph, freshly unlocked. |
| `stretch` | 2 | Above his level. **Misses are free.** |

Plus a closing warm-up item, because a session that ends in failure is one he
is slower to come back to. `stretch` misses are discarded by `applyAttempt` —
they cannot drop his tier, dent his accuracy, reset his review schedule, break
his combo, lower visible accuracy, or score for the rival.

Before each run he chooses between two useful missions with different focus
strands. The chosen strand gets extra weight, but the working set stays balanced
across several strands. Every third completed run replaces two ordinary items
with a linked two-part **boss investigation** ending in a multi-step field problem.

Sessions now open with a **mission briefing** (`ui/screens/Briefing.tsx`)
naming the day's focus skills, and close with a **recap**
(`ui/screens/Recap.tsx`): accuracy, DNA earned, any dinosaurs hatched, and up
to three "let's remember this" call-outs reconstructed from the misses in that
session. Recap rebuilds each missed problem from its stored
`(skillId, level, seed)` rather than needing the full object carried
forward — the same "any past question can be reconstructed exactly" property
the pure-generator design buys everywhere else.

### Hints are pictures, not paragraphs

This is the core of the tutoring layer. Prose hints only work for a learner
who already half-understands — "a missing addend is a subtraction in
disguise" teaches nothing to a child who doesn't already know it. Every hint
can carry a `HintVisual`, so the ladder walks concrete → pictorial → abstract
instead of restating symbols in words.

`45 + ___ = 54` now steps through:

1. a **number line** bridging 45 → 50 → 54, showing the hop-to-the-next-ten
   strategy rather than one opaque leap;
2. a **bar model** with 54 as the whole and 45 and `?` as the parts — this is
   what makes "why is it a subtraction?" something he can *see*;
3. the terms **stacked for subtraction**, `54 − 45 = 9`.

Available visuals: `stacked` (column arithmetic), `numberline` (with computed
bridging jumps), `tenframe` (make-a-ten made literal), `array`, `barmodel`
(part-whole), `groups`, and `placevalue` (base-ten columns — which is what
finally makes the zero in 407 stop being a mystery).

**Visuals are held to the same correctness bar as the generators.**
`tests/visuals.test.ts` checks every visual on every problem: a `stacked`
visual that states a result must state the *right* result, a `barmodel`'s
parts must sum to its whole, ten-frames can't overflow, and arrays are capped
at `MAX_DOTS` so a picture never degrades into a wall you have to count. A
visual showing wrong numbers would be worse than no visual — it would teach
the wrong thing, with more authority than prose.

### The ladder adapts, and a miss gets a second go

Once he has already answered wrong, the gentle opening nudge is wasted — we
know something specific. `engine/adaptiveHints.ts` opens the ladder at the
rung that addresses his actual error (a dropped carry lands on the stacked
columns; a reversed operation lands on the part-whole bar). It never
auto-reveals the final worked solution — that still has to be asked for.

A miss on real working material also **inserts a fresh problem of the same
kind immediately after**, so the explanation he just read gets used rather
than filed away. A recurring misconception gets a concrete → faded cue →
independent transfer sequence, using structural tags to select a matching
problem variant. Independent and supported accuracy, plus retry transfer, are
tracked separately. Retries pay reduced DNA and never chain.

### Momentum and a rival

A flat list of 21 questions has no shape. Two additions give it one: a
**combo** counter with escalating feedback and bonus DNA at 3/6/10/15, and
**Dr. Wu**, a deterministic rival lab scoring alongside him at ~74% accuracy.
Wu is **accuracy-based and never timed** — a clock would reintroduce time
pressure on brand-new concepts, which the rest of the design carefully
avoids — and sits out warm-ups so the score reflects real work.

### Tap-only Socratic questioning

Two interstitials in `ui/screens/Session.tsx`, both zero-cost and offline —
no free text, no speech recognition, because neither is reliable enough for a
seven-year-old's voice and a wrong guess parsed as a different word would be
worse than no tutor at all:

- **Predict** (`engine/predict.ts`) — before a `new` or `stretch` item, a tap
  question: "will the answer be bigger or smaller than X?" Forcing a
  commitment before the answer is revealed is what makes a question Socratic;
  free text isn't the load-bearing part. Derived from the problem's operands
  with a sanity check against the real computed answer, so it can never be
  mislabelled — the same correctness bar the generators hold themselves to.
- **Reflect** (`content/remediation.ts`) — after a miss, "where do you think
  it went wrong?" with four tap options. Compared against the real classified
  error type; the response affirms a correct self-diagnosis or gently
  corrects a wrong one. This is the single highest-value thing in this layer
  — noticing your own error is the skill that actually transfers — and his
  choice is logged onto the attempt (`Attempt.selfDiagnosis`) for the parent
  dashboard.

Both feed into **remediation** (`content/remediation.ts`): short, warm,
second-person text keyed by operation and error type ("carry" vs "borrow"
language differs for addition vs subtraction), with a generic fallback. This
is the hand-authored "high-quality canned response" layer — it's what closed
off the case for spending API budget on real-time Socratic dialogue.

---

## The LLM layer

One runtime call, in `llm/hints.ts`, wired in as the rung *before* the worked
solution — so he has to have read the nudge and the strategy and still be stuck.

**The model is handed the correct answer and the worked solution and told not
to compute anything.** Every number it might need is already in the prompt, so
a model arithmetic slip cannot produce a wrong hint. It is also forbidden from
stating the answer, and a regex guard discards the hint if it leaks it anyway.

Measured cost: **~0.074¢ per hint** (453 in / 57 out on Haiku 4.5). At a heavy
20 hints/day that is about **$0.45/month**. The dev server logs the cost of
every call so you can watch real spend during playtests.

The API key lives in `.env` and is read only by dev-server middleware in
`vite.config.ts` — it never reaches the browser. That middleware exposes the
same `POST /api/hint` contract a Cloudflare Worker will expose later, so moving
to the tablet is a base-URL change rather than a rewrite.

---

## Deliberate choices worth knowing

- **Read-aloud is on by default** for word problems, every hint as it's
  revealed, and the worked-through explanation on a miss (each with a small
  🔊 replay button) — everything instructional, not just the question text.
  His maths runs further ahead than his reading, so without TTS these screens
  measure decoding, not arithmetic.
- **Timers only ever appear on fluency skills** he is already good at. Timing a
  new concept teaches anxiety.
- **Wrong answers never subtract DNA.** Loss aversion at seven means tears.
- **Two misses in a row auto-drops the difficulty tier.**
- **The keypad, not the OS keyboard.** A software keyboard covers the question.
  Two rapid taps land in the same React batch — the pad owns the current
  value in a `ref`, not derived state, or the second tap silently drops a
  digit.
- **Some small-sum questions are *built*, not typed** — he taps out the
  quantity on a ten-frame. Mostly to break the monotony of twenty-one
  identical keypad entries, but for small amounts making the quantity is
  also a more honest demonstration than recalling a digit.
- **The first dinosaur is ungated** so the reward loop is taught by
  experiencing it in session one; everything after it needs a new skill.
- **Column-stacked visuals** (`ui/components/StackedProblem.tsx`) for
  add-100/sub-100, driven off `problem.meta` — never parsed from the prompt
  string, so it can't drift out of sync with what's actually being asked.
- **Word problems personalize against his real collection**
  (`content/personalize.ts`): "Each Velociraptor has…" becomes "Each
  Stegosaurus has…" once he's hatched one. Pure post-processing on the
  rendered prompt at the session-generation call sites — the generators
  themselves never see profile state, so they stay pure and testable.
- **An avatar and a mission briefing** open the loop with a little more
  ceremony; a **personal-best** callout on the recap screen (best session
  accuracy / most DNA earned in one expedition) gives him something to beat
  that isn't just "yesterday."

---

## Beyond the core loop

### Three more strands

`fractions`, `measurement` and `geometry` are populated: halves/quarters/thirds
and fractions of an amount; money, telling the time, and length; shapes,
symmetry and perimeter. Each brings its own visual — a fraction bar or pie, a
clock face with a *continuously moving* hour hand (parking it on the hour
teaches the wrong reading at half past), real-proportioned US coins, polygons
drawn to the proportions of their side labels, and a ruler.

`fraction-parts`, `shapes-2d` and `measure-length` are deliberately **rooted**
— no prerequisites — so they are reachable immediately rather than gated
behind unrelated arithmetic. They are also *not* in `PLACEMENT_STRANDS`: each
strand adds up to six questions to the placement test, and this is genuinely
new material rather than something he arrives with, so starting at level 1 is
honest rather than condescending.

### Three ways to answer that are not a keypad

- **Column entry** (`{ kind: 'columns' }`) on the regrouping levels of
  add/sub-100 — ones column first, then tens. Typing `81` in one go hides
  whether he carried or simply knew the fact; filling the columns makes the
  algorithm itself the thing being practised.
- **Number-line input** (`{ kind: 'numberline' }`) on skip counting — tap where
  the next one goes. Skip counting *is* regular spacing, and this separates
  "knows the sequence" from "can write the numeral", which a keypad conflates.
- **Build mode** now also on `sub-20` and `mult-concept` level 1, not just
  `add-20`.

Both new modes are held to the same bar as everything else:
`tests/generators.test.ts` checks that a column answer has exactly as many
boxes as digits (one too few is unenterable, one too many never enables submit)
and that a number-line answer always lands exactly on a real, tappable tick.

### Weekly digs

A session has an arc; a week did not. `content/expeditions.ts` gives one — a
named real dig site per week, and a goal of **turning up four times and pushing
one skill to proficiency**. Deliberately not a DNA target, which would be
farmable on warm-ups, and not a question count, which would reward speed over
thought. An unfinished week is simply replaced rather than carried over as a
debt; a goal that accumulates guilt is worse than no goal at seven.

### After the DNA tanks are full

The daily cap still protects the economy, but extra play no longer produces a
dead "storage full" message. Every three correct post-cap answers unlock a
field note, cosmetic lab upgrade, or badge on an endless discovery track.

### Resuming safely

Placement and active sessions are checkpointed in IndexedDB. Profile state,
the attempt log, and the active session are committed together, so a reload or
crash resumes the exact item instead of restarting placement or leaving parent
analytics out of sync with mastery.

### The weekly parent note

`llm/weeklySummary.ts`, in the parent view's "This week" tab. Same discipline
as the hints: **every figure is computed in TypeScript and handed to the model
finished**, and it is told not to compute anything. The digest renders with or
without an API key — the model adds interpretation, never data — and the
prompt asks for an honest read, because a note that says everything is fine
when it is not is worse than no note for someone using it to decide what to sit
down and help with.

### Offline

A service worker (`public/sw.js`) precaches the shell, so the app works on a
tablet with no signal — everything except the optional Claude hint call is
local anyway. Registered in production builds only: a worker caching module
output in dev produces stale-code bugs that look like application bugs.

---

## Not built yet

General-purpose two-step word problems beyond boss investigations, a second
reasoning strand, and GitHub Pages deployment
(the Vite `base` is still `'./'` — set it to `'/<repo-name>/'` when a repo
exists). Column entry currently accepts the digits without asking him to state
the carry itself, which is the obvious next turn of the screw.

## Paddock playground

Finish one math session today, then choose **Enter the Paddock** on Home.
The existing Dinosaur Collection remains available from Home and the Paddock,
including sequencing choices and factual notes. Daily access uses the existing
local-date `lastSessionDay` completion record, so older learners who already
finished today qualify immediately. Leaving and returning tomorrow requires a
new completed session; an admitted visit has no timer or forced exit.

Choose a hatched friend, then tap the grass to bring it in. Up to six distinct
species can play together. Select and tap a new spot, drag with touch or mouse,
or focus a friend/toy and use arrow keys. Keyboard users can select a tray item,
focus the habitat, move the placement spot with arrow keys and press Enter.
Choose Brush and tap a friend (or press Enter on a focused friend) to brush it.
Food is replenished by placing it again. Moving or replacing the ball starts a
new chase. Stegosaurus seeks shade; Pteranodon returns to the perch; the other
friends wander gently. These are fictional play behaviors, separate from the
collection's factual notes. All catalog species have play art and behavior.
No needs decay while away, no chores and no DNA/proficiency changes occur.

**Take photo** captures only the SVG landscape, dinosaurs and toys as a local
800×480 JPEG. The scrapbook has thumbnails, a larger view, editable titles and
a separate confirmation before deletion. It holds 12 photos, with a maximum
180,000 encoded characters per photo. Full albums never automatically evict
older pictures; storage failures roll back the attempted save and show a message.
Audio is omitted, so play works silently with every existing sound preference.
Reduced-motion preferences disable transitions and happy wiggles.

### Storage and backup treatment

Profile schema 5 adds `paddock` alongside existing learning fields. Old profiles
receive an empty habitat; DNA, hatch records, discoveries, attempts, placement
completion and session history keep their existing treatment. Runtime movement
is only simulated while the habitat is visible. Positions, toys and photos
persist in IndexedDB; reload stops pending actions and greets happy friends.
The app currently has one active profile. Paddock data lives inside that profile,
so replacement/reset does not attach another learner's photos to the new profile.

Safety snapshots, Settings Undo, JSON exports and imports **include the habitat
and scrapbook**. Normal maximum photo overhead is about 2.2 MB of encoded image
data per export, plus JSON framing and existing learning history. Imported albums
are not silently truncated on load. There are no uploads, automatic downloads,
extra storage keys or network assets. The existing reset/import confirmation
and rolling pre-change backup also protect the new profile fields.

### Paddock verification

`tests/paddock.test.ts` covers daily completed-session admission (including a
full run at the DNA cap), hatched-only availability, all catalog species, toy
responses, six-friend limits, untouched learning state, old-profile migration,
export/import/reset/undo, quota failure rollback and scrapbook limits/deletion.
The persistence tests use an in-memory IndexedDB API substitute; browser checks
exercise real IndexedDB in a fresh temporary Chromium profile.

Run `node tests/paddock-tablet-check.mjs` against Vite (default port 5176), using
the same Playwright environment variables as `tests/tablet-check.mjs`.
`GENESIS_URL` selects another local port. Checks cover 768×1024 portrait and
1024×768 landscape, session completion, collection details, repeated toys,
real touch drag/cancel, tap placement, keyboard interaction, reduced motion,
photo capture/title/view/deletion, reload, exports and daily relocking.
Screenshots are saved in ignored `.qa/` (or `GENESIS_QA_OUTPUT`).
Physical iPad/Safari verification remains a device check. Publishing uses the
existing GitHub Pages workflow on main. DNA Playground is documented below.


## DNA Playground

A daily-access scientist bench with earned samples, fictional trait editing, deterministic Dino Dash and Balance Lab, per-profile creation notebooks, two-parent hybrids and portable JSON/build-prompt export. Finish today’s session to enter; play uses no math DNA. See [the feature and export contract](docs/DNA_PLAYGROUND.md), [JSON Schema](docs/dinosaur-export.schema.json) and [synthetic example](docs/dinosaur-export.example.json). Saved hybrids export their parentage, inherited body parts, colors and bounded Battle design attributes, plus a self-contained build prompt. See [the hybrid JSON example](docs/dinosaur-hybrid-export.example.json) and [Battle build prompt](docs/dinosaur-hybrid-build-prompt.example.txt). No battle importer is implemented.
