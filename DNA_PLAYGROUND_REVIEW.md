# DNA Playground local handoff

Implemented in Math_Tutor only. Dinosaur_Battle was inspected as read-only reference. The initial implementation was verified locally; publishing was subsequently authorized by the user.

- Daily access reuses Paddock admission, including existing completed profiles and admission across midnight.
- Earned samples come only from hatched catalog species. Experiments do not spend math DNA, change collection or proficiency, or grant rewards.
- First-person 2.5D bench includes sample rack, specimen scanner, large controls, animated test chamber and notebook.
- Tail/legs/mass editing, cosmetic color/pattern, original reset, changed-variable indicator, optional unscored prediction.
- Deterministic Dino Dash (three tracks) and Balance Lab (three bends; stable/wobble/soft tumble). Original/current/previous result cards, plus a fair-condition dash ghost.
- Per-profile IndexedDB creations: save, reopen/edit, duplicate, named delete confirmation; quota retry preserves existing records. Limits: 24 new creations, latest 12 runs. Unsaved setup edits are drafts.
- Versioned JSON export, bounded battle-neutral traits, shared appearance data, recorded conditions/results, strict runtime semantic validation, JSON Schema, dependency-free shape-check CLI and synthetic example. No personal profile or learning data.

Verification on October 14, 2026:

- npm test: 196 tests across 12 files passed, including 15 new lab tests.
- npm run build: TypeScript and Vite production build passed.
- tests/dna-lab-tablet-check.mjs: complete isolated Chromium loop passed at 768×1024 and 1024×768. Exercises actual session completion with capped DNA, access, earned samples, touch/keyboard sliders, experiments/comparisons, all balance outcomes, predictions, saving/reopening/editing/duplication/deletion, actual download/runtime validation, quota failure/retry, reload, reduced motion, unchanged learning records and existing navigation. No page errors or horizontal overflow.
- Existing tests/paddock-tablet-check.mjs passed after shared art changes, including real touch drag, toys, photos, reload/export and preserved learning.
- git diff --check passed.
- Screenshot evidence: .qa/dna-lab/bench-portrait.png, balance-landscape.png and notebook-landscape.png. Browser-download sample: .qa/dna-lab/mint-runner.json. All QA profiles and exports are synthetic.

Contract and future importer guidance: docs/DNA_PLAYGROUND.md. Export schema: docs/dinosaur-export.schema.json. Synthetic example: docs/dinosaur-export.example.json. Model version genesis-toy-1 and export schema genesis-lab/dinosaur v1. Verified shared battle species: trex, spinosaurus, stegosaurus, ankylosaurus, triceratops; all other Genesis IDs remain unresolved. No battle integration exists. A later adapter must derive and test balanced combat behavior from bounded traits rather than treating simulation results as combat stats.

Limits: lightweight cartoon SVGs, fictional ground tests for all catalog species including flying/sea reptiles, local-device storage, and draft edits requiring explicit Run and Save. At the initial handoff, incubation, hybrids, direct transfer and cross-playground rewards were future enhancements. The hybrid update is documented below.

## Hybrid update — October 15, 2026

Implemented in Math_Tutor using Dinosaur_Battle as read-only reference. The
Battle game itself is unchanged; the exported build prompt is the handoff for
adding the custom fighter there.

- Create hybrid combines two different hatched samples. The chosen body stays
  with the first parent; head/back/tail can inherit from either, with at least
  one partner feature. Shared SVG previews and animations show mixed features.
- Hybrids use model genesis-hybrid-1 and optional lineage fields. Profile schema
  7 preserves old notebook entries, v1 simulations/exports, rewards and history.
- Saved hybrids export v2 JSON with parentage, anatomy, colors/pattern, trial
  history, fixed-budget design attributes and exact/unresolved Battle roster IDs.
- Export Battle prompt downloads a self-contained text build request with the
  full same JSON, verified Battle source references and fighter tuning guidance.
  It is a design/build handoff, not a plug-in fighter or direct import.
- Added strict hybrid schema, synthetic JSON and matching prompt examples, plus
  v1/v2 CLI shape checks and runtime checks for model and blueprint consistency.
- npm test: 207 tests across 12 files passed, including 26 DNA Playground tests.
  Covers all 182 distinct catalog parent pairs, earned-parent restrictions,
  inherited artwork, fixed stat budget, legacy compatibility, unchanged learning,
  persistence/import/export, storage failure, tampering and build-prompt privacy.
- npm run build: passed. git diff --check: passed.
- The tablet loop verifies actual hybrid creation, part choices, test-before-save,
  save/reopen/edit/duplicate/delete, both real download types, reload persistence,
  unchanged learning, reduced motion and existing single-sample functionality.
- Portrait/landscape screenshot evidence: .qa/dna-lab/hybrid-portrait.png and
  hybrid-landscape.png; browser downloads: clubback.json and
  clubback-battle-prompt.txt. All test profiles and exports are synthetic.

Physical iPad/Safari testing remains a device check. Direct battle-game imports,
fighter implementation and combat balancing happen in Dinosaur_Battle after
using the exported file or prompt. Publishing was authorized by the user on October 16, 2026; the existing GitHub Pages workflow deploys main.
