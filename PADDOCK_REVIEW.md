# Paddock review handoff

Prepared for the user-authorized GitHub Pages rollout on 2026-10-14.

Finish any complete math session today and choose **Enter the Paddock** on Home.
Existing profiles with today's `lastSessionDay` qualify immediately. The original
collection and factual dinosaur details remain accessible from Home and Paddock.

The single SVG habitat includes shade, grass, a pond, rocks and a flying perch.
Up to six hatched species can play together. Food, ball and brush are reusable;
the five requested species have individual reactions, and all fourteen catalog
species have art and a behavior fallback. Touch/mouse dragging uses pointer
capture, with cancellation rollback, tap placement and keyboard alternatives.
The habitat has no clock, needs decay, DNA spending/rewards or proficiency effects.

Photos freeze the visible scene and save as 800×480 JPEGs. The local profile's
scrapbook supports thumbnails, a larger modal image, 60-character titles and a
separate deletion confirmation. Twelve photos, each capped at 180,000 encoded
characters, bound normal export image overhead to about 2.2 MB. Photos travel
with the profile in existing backups/export/import/reset undo; old albums are
not silently evicted. Failed saves roll back and report storage trouble.
Schema 5 adds an empty habitat to earlier profiles and uses the existing
pre-migration snapshot. No new dependency or external asset is required.

Verification:

- `npm test`: 181 tests passed across 11 files, including 17 Paddock tests.
- `npm run build`: TypeScript and production Vite build passed.
- `git diff --check`: passed.
- `tests/paddock-tablet-check.mjs`: isolated synthetic profile, real IndexedDB,
  768×1024 portrait and 1024×768 landscape. Verified actual session unlock at
  the DNA cap, old-profile migration, collection facts, hatched-only choices,
  repeated food, brushing, tail-ball reactions, true touch drag and cancel,
  tap positioning, keyboard brushing/movement, reduced motion, photo capture,
  title/view/delete confirmation, quota failure rollback, reload, export,
  daily relocking and equality of all learning fields and attempts before/after play.
- Existing `tests/tablet-check.mjs` regression checks also passed, including new and resumed remainder-sharing questions.
- Visually inspected portrait/landscape habitat and scrapbook screenshots in
  ignored `.qa/paddock-portrait.png`, `.qa/paddock-landscape.png` and
  `.qa/paddock-scrapbook-portrait.png`.

Limits: physical iPad/Safari testing remains outstanding. Audio is deliberately
omitted. One habitat and one instance of each toy/species are supported. Photos
are capped-resolution local images; imports/exports remain device snapshot
transfers rather than synchronization. DNA Lab remains future work.

Remainder questions now explicitly keep eggs whole, use as many as possible and set extras aside. Saved questions receive the corrected prose without changing their numbers, answers or progress.

See README's Paddock section for repeatable browser-test commands and controls.
