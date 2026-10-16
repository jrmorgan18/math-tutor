# DNA Playground and export contract

The scientist sits at a 2.5D SVG experiment bench: sample rack, specimen scanner, large trait controls, test chamber and notebook. No engine, services or extra dependencies. All catalog species use shared vector previews. Flying/sea reptiles also run the explicitly fictional ground tests.

## Access and economy

Home and direct entry reuse Paddock's lastSessionDay === todayKey() admission. Completing a session admits existing profiles too, independent of speed, mastery, daily DNA cap and lab level. Admission lasts for that visit across midnight. Hatching supplies reusable samples; field notes and unfinished sequencing do not. Simulation imports no learning store. Saving only updates Profile.dnaLab; collection, DNA, attempts, progression and resumable learning remain unchanged.

## Model genesis-toy-1

All traits are dimensionless multipliers relative to that species' original cartoon sample, with increments of 0.1. They are not metres, kilograms or real reconstructed genetics.

| Trait | Range | Visible change | Toy effect |
| --- | --- | --- | --- |
| tail | 0.6–1.6 | Tail stretch | Longer tail slows dash; improves balance until inertia above 1.25 outweighs it. |
| legs | 0.7–1.4 | Leg stretch | Faster dash, more hurdles cleared, more wobble. |
| mass | 0.6–1.6 | Body area scales with mass | Slower on smooth ground; improves grip and lowers turn risk. |

Color: sample, mint, coral, violet. Pattern: plain, spots, stripes. Both are cosmetic. The original sample color is in src/content/dinosaurs.ts. Preview, animation, saved preview and export use the same Setup. Use Reset to original or Use last run’s traits to isolate a variable. Predictions are optional, unscored and not saved.

Dash has smooth, grippy and three-soft-hurdle tracks. Cartoon species baselines are 7, 8.5 or 10 simulated seconds. Legs, mass, tail and track penalties determine time. Hurdle clearance is 0–3; missed hurdles add 1.2 seconds each. The playback scales simulated time to 320 ms per second and races a ghost at its own result time. Ghost uses previous traits only when conditions match, otherwise original traits under the current conditions.

Balance offers gentle/medium/sharp bends. Deterministic risk thresholds produce stable (<0.58), wobble (<1.05) or gentle soft-mat tumble. The same conditions and Setup always produce the same result. Every run records seed 2718; v1 uses no randomness. Animation does not determine results. Results cards show previous conditions explicitly and always include the original with identical test conditions. Reduced motion removes stride/wobble animation and shows results immediately. Sound uses the existing profile switch and local synthesizer.

## Persistence and limits

Profile schema v6 adds dnaLab.creations in the existing IndexedDB profile, so backup, parent export/import, reset and restore remain profile-scoped. Old profiles gain an empty notebook without losing completion or rewards. New creations are limited to 24, with the latest 12 runs per creation. Valid existing creations are never evicted on load. Invalid/malformed records are rejected by migration; the existing pre-migration safety snapshot preserves the raw previous profile. Setup edits are drafts until Run and Save; unsaved edits are lost when leaving or reloading. Reopen edits the same ID; duplicate gets a new stable ID; delete requires a named confirmation. Save commits to disk before updating the visible notebook, so storage failure leaves existing creations intact and allows retry.

## Portable export v1

Export dinosaur downloads one standalone JSON object, with no profile or learning data. No URLs, asset dependencies, filesystem paths, browser-storage keys, executable code or combat stats are included. The preview is reconstructible from stable species ID + traits + appearance rather than an embedded picture. Creation names are user-entered; a parent should choose a nonpersonal creation name when sharing.

- Schema identifier: genesis-lab/dinosaur; version: 1; fictionalLabCreation: true.
- creation: stable id, name (1–40 characters), speciesId, bounded traits, appearance, modelVersion, and 1–12 runs.
- Each run records its own speciesId, traits, appearance, conditions, modelVersion, seed and result. The latest run matches the saved Setup. Historical runs may have different traits or conditions.
- JSON Schema: dinosaur-export.schema.json (Draft 2020-12, disallows unknown fields).
- Synthetic example: dinosaur-export.example.json (no actual learner data).
- Dependency-free shape validator: node scripts/validate-dinosaur-export.mjs dinosaur.json. Reads the checked-in schema and implements exactly its supported keyword subset; rejects unknown fields, invalid bounds/choices, unsupported versions and files over 100 KB. It is not a general-purpose JSON Schema engine.
- Runtime validator: validateExport in src/play/dnaLab.ts. It checks the schema shape, catalog IDs, bounds, step size, same-species histories, latest Setup and recomputes every result under its recorded model. JSON Schema checks shape; these extra consistency checks require the runtime validator or an equivalent implementation.

## Instructions for the future Dinosaur_Battle agent

1. Read the standalone JSON, require schema/version/modelVersion support, validate against the JSON Schema and the runtime semantic checks. Reject unsupported versions and unknown fields; never evaluate file contents as code. Cap file size (e.g. 100 KB) before parsing.
2. Species IDs were checked against Dinosaur_Battle/src/data/roster.ts and its definition files. Exact shared IDs: trex, spinosaurus, stegosaurus, ankylosaurus, triceratops. Genesis-only/unresolved: compsognathus, gallimimus, parasaurolophus, dilophosaurus, velociraptor, pteranodon, brachiosaurus, mosasaurus, indominus. Battle-only: baryonyx, suchomimus, scorpios-rex. indominus is not scorpios-rex. Do not silently substitute unresolved species.
3. The battle game uses DinosaurDefinition: moveSpeed, maxEnergy, dimensions, preferredDistance, jumpVelocity, gravity, visual colors/kind and per-move frame timing/damage. No existing lab import/customization contract was found. This export is portable source data, not a verified fighter definition.
4. Add a separate adapter later. Start from the roster's balanced base definition. Convert bounded dimensionless offsets into small, capped tradeoffs (e.g. mobility versus recovery or reach versus turning), with a fixed power budget and tests against baseline matchups. Do not directly turn lab seconds into combat speed, body mass into health, or hurdle clearance into damage. Cosmetic changes may map to visual colors/patterns. Use existing renderer/animation registry conventions rather than external assets.
5. Keep imported creations separate from earned roster progression. Retain creation ID for deduplication; sanitize display names; render text as text. Explicitly choose behavior for unresolved species. Verify gameplay balance before calling an import compatible.

No battle files were edited. Egg incubation, direct transfer and cross-playground rewards remain future work. Hybrid creation and the v2 handoff are described below. Extend model versions explicitly, keep old results interpretable, and keep admission/economy independent of playground features.

## Verification

npm test and npm run build. Tablet loop: tests/dna-lab-tablet-check.mjs; environment variables follow the existing paddock tablet check (PLAYWRIGHT_PACKAGE, GENESIS_URL, GENESIS_QA_OUTPUT, GENESIS_BROWSER_EXECUTABLE or GENESIS_BROWSER_CHANNEL). Run against local Vite only, using an isolated browser context and synthetic IndexedDB data.

## Hybrid creator (export v2)

Choose **Create hybrid** after hatching at least two different species. The sample
rack supplies the body; **Partner dinosaur** supplies a second earned sample.
Choose which parent supplies the head, back and tail. At least one feature must
come from the partner. Back plates, armor, sails, wings, horned/beaked/toothy heads,
and club/spiked tails visibly combine in the shared SVG preview and chamber.
Original sample color blends the parents' catalog colors; other colors and patterns
remain selectable. No sample is consumed and hybrids remain separate notebook
creations, never new hatched species or math rewards.

Run the hybrid, name it, then Save creation. Existing reopen/edit/duplicate/delete
and storage limits apply to both kinds of creation. Changing parentage or inherited
parts clears the draft run history and requires another test before saving. The
old saved entry is retained until Save succeeds. Reset to original resets the
trait multipliers/cosmetics while retaining the currently chosen hybrid genome.

Profile schema 7 preserves every valid v6 single-sample creation and adds optional
hybrid fields. The existing pre-migration snapshot protects the prior profile.
Hybrid data is included in profile backup/import/undo with the same notebook;
DNA, collected dinosaurs, attempt history, session completion and learning state
are untouched. Old single-sample results and v1 exports keep their original model
and format, including the checked-in v1 example.

### Hybrid model and lineage

Hybrid Setup adds `hybrid: { donorSpeciesId, head, back, tail }`. Each part value
is `base` or `donor`; the body always uses creation.speciesId. Parents must be
different known catalog species and both must be hatched to save. This is a
fictional parts recipe, not biological DNA percentages. Model `genesis-hybrid-1`
uses the existing trait/track formulas. Its baseline pace averages parent paces
by the four parts (body/head/back/tail). Each selected donor part supplies one
quarter of that fictional pace. Baseline comparison uses the same genome, course
and default multipliers, so changing a slider remains a controlled comparison.
Runs retain their genome, seed, version, conditions and computed result. Runtime
validation checks all results, the latest setup and consistent parentage.

### Exports for Dinosaur Battle

Saved hybrids have two explicit download actions:

- **Export hybrid**: standalone JSON with schema `genesis-lab/dinosaur`, version
  `2`, the full creation/run records and a derived `battleBlueprint`.
- **Export Battle prompt**: a self-contained text prompt with the same full JSON,
  ready to paste into the Dinosaur_Battle project. It references the inspected
  `src/core/types.ts`, `src/data/roster.ts`, fighter definitions and validation.

The blueprint includes both parent IDs/names; body/head/back/tail source IDs;
feature descriptions; resolved body/accent hex colors and pattern; and power,
armor, speed, agility, stamina and reach design attributes. Each attribute is an
integer from 1 to 9 and their total is always 30. Mass, legs, tail and inherited
features affect the allocation, so a hybrid has tradeoffs rather than every
attribute being strongest. These are design ratings, **not** Battle damage,
energy, dimensions, movement speed, gravity or move-frame timings.

The roster reference uses only exact shared species IDs. If neither parent exists
in Battle, suggestedBaseRosterId is `custom`; unresolvedSpeciesIds lists the
parents needing art or explicit mapping. No species is silently substituted.
`implementationRequired: true` and status `design-reference` make clear that this
is a fighter build brief. The prompt asks the Battle agent to implement a distinct
fighter and inherited silhouette, tune quick/heavy/special moves and hitboxes,
validate the definition, and test matchups while preserving existing fighters.
This feature does not modify Dinosaur_Battle or add an importer to it.

Contract files:

- `dinosaur-hybrid-export.schema.json`: strict JSON Schema v2.
- `dinosaur-hybrid-export.example.json`: synthetic Armored Stego design.
- `dinosaur-hybrid-build-prompt.example.txt`: matching self-contained build prompt.
- `node scripts/validate-dinosaur-export.mjs <file.json>` checks v1 or v2 shape,
  with the same 100 KB input limit. `validateExport` additionally recomputes model
  results and the entire blueprint, rejecting tampered or hidden fields. Object
  key ordering does not affect validation.

JSON and prompt exports whitelist creation data, with no learner/profile, math
DNA, attempt history, storage keys, credentials, executable content or network
assets. Creation names are user text; use a nonpersonal name when sharing.
