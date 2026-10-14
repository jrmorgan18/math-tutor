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

Limits: lightweight cartoon SVGs, fictional ground tests for all catalog species including flying/sea reptiles, local-device storage, and draft edits requiring explicit Run and Save. Incubation, hybrids, direct transfer and cross-playground rewards remain future enhancements.
