// Run with a local Vite dev server. PLAYWRIGHT_PACKAGE can point to a bundled
// playwright/index.mjs when Playwright is not installed in this repository.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_PACKAGE
  ? pathToFileURL(process.env.PLAYWRIGHT_PACKAGE).href : 'playwright');
const url = process.env.GENESIS_URL ?? 'http://127.0.0.1:5175';
const output = process.env.GENESIS_QA_OUTPUT ?? '.qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.GENESIS_BROWSER_CHANNEL,
  executablePath: process.env.GENESIS_BROWSER_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => console.log(`Request failed: ${request.url()} ${request.failure()?.errorText}`));
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log('Local app loaded.');
  await page.waitForFunction(() => window.__lab?.getState().screen !== 'loading');
  await page.evaluate(async () => {
    const { newProfile } = await import('/src/store/db.ts');
    const { initialSkillStates } = await import('/src/engine/mastery.ts');
    const profile = newProfile('Tablet test', initialSkillStates());
    profile.placementDone = true; profile.soundOn = false; profile.readAloud = false;
    profile.discoveries = ['fact-raptor-tail', 'test-unavailable', 'fact-raptor-tail', 'fact-raptor-tail'];
    window.__lab.setState({ profile, screen: 'home' });
  });
  await page.getByRole('button', { name: 'All discoveries (4)' }).tap();
  assert.equal(await page.locator('.discovery-chip').count(), 4);
  await page.locator('.discovery-chip').first().tap();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /tail/i);
  assert.equal(await dialog.locator('button').evaluate(el => el === document.activeElement), true);
  await page.screenshot({ path: `${output}/discovery-landscape.png` });
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await page.locator('.discovery-chip').first().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Enter');
  await dialog.waitFor();
  await page.setViewportSize({ width: 768, height: 1024 });
  assert.equal(await dialog.evaluate(el => el.getBoundingClientRect().right <= innerWidth), true);
  await page.screenshot({ path: `${output}/discovery-portrait.png` });
  await page.getByRole('button', { name: 'Close discovery' }).tap();
  await page.getByRole('button', { name: 'Back to recent discoveries' }).tap();
  console.log('Discovery touch, focus and tablet layouts passed.');

  // Use an isolated synthetic session and real generated questions.
  const setProblem = async (skillId, level, representation) => page.evaluate(async ({ skillId, level, representation }) => {
    const { generate } = await import('/src/engine/generators/index.ts');
    const state = window.__lab.getState();
    if (!state.session) state.beginSession();
    const current = window.__lab.getState();
    const problem = generate(skillId, level, 42);
    if (representation) problem.representation = representation;
    const item = { slot: 'working', skillId, level, seed: Math.floor(Math.random() * 100000) };
    window.__lab.setState({ screen: 'session', session: { ...current.session, plan: [item], index: 0,
      problem: { ...problem, seed: item.seed }, phase: 'answering', hintsUsed: 0, automaticHints: 0,
      requestedHints: 0, pending: [], lastResult: null, itemStartedAt: Date.now() } });
    return problem.answer;
  }, { skillId, level, representation });

  const expected = await setProblem('add-100', 3, { kind: 'columns', columns: 2, carry: true });
  await page.getByRole('button', { name: 'Got it', exact: true }).tap();
  const ones = expected.at(-1), tens = expected.at(-2);
  // Same-task clicks reproduce React batching during rapid entry.
  await page.evaluate(({ ones, tens }) => {
    const keys = [...document.querySelectorAll('.key')];
    keys.find(el => el.textContent.trim() === ones).click();
    keys.find(el => el.textContent.trim() === tens).click();
  }, { ones, tens });
  assert.equal((await page.locator('.colpad-box-digit').allTextContents()).join(''), expected);
  await page.getByRole('button', { name: 'Undo last column' }).tap();
  assert.equal((await page.locator('.colpad-box-digit').allTextContents()).join(''), ones);
  await page.getByRole('button', { name: tens, exact: true }).tap();
  await page.screenshot({ path: `${output}/column-entry-portrait.png` });
  await page.getByRole('button', { name: 'Submit answer' }).tap();
  assert.equal(await page.evaluate(() => window.__lab.getState().session.lastResult.correct), true);

  await setProblem('add-20', 1, { kind: 'numeric' });
  await page.getByRole('button', { name: '0', exact: true }).tap();
  await page.getByRole('button', { name: '7', exact: true }).tap();
  assert.equal(await page.evaluate(() => window.__lab.getState().session.phase), 'answering');
  assert.equal(await page.locator('.answer-box').innerText(), '7');
  await page.getByRole('button', { name: 'Delete', exact: true }).tap();
  await page.getByRole('button', { name: '1', exact: true }).tap();
  await page.getByRole('button', { name: '2', exact: true }).tap();
  assert.equal(await page.locator('.answer-box').innerText(), '12');

  await setProblem('skip-count', 1, { kind: 'numberline', from: 0, to: 50, step: 5 });
  for (const target of await page.locator('.nlpad-tick').all()) {
    const box = await target.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
  }
  await page.locator('.nlpad-tick').filter({ hasText: '10' }).tap();
  assert.equal(await page.evaluate(() => window.__lab.getState().session.phase), 'answering');
  await page.locator('.nlpad-tick').last().tap();
  assert.equal(await page.locator('.build-count').innerText(), '50');
  await page.screenshot({ path: `${output}/number-line-portrait.png` });

  await setProblem('word-1step', 1, { kind: 'numeric' });
  const operation = await page.evaluate(() => window.__lab.getState().session.problem.operationChoice.answer);
  await page.getByRole('button', { name: operation, exact: true }).tap();
  assert.equal(await page.locator('.keypad').isVisible(), true);

  // Supported telemetry stays separate from learner-initiated help.
  await setProblem('add-20', 1, { kind: 'numeric' });
  await page.evaluate(() => window.__lab.getState().revealHintsTo(1));
  await page.getByRole('button', { name: 'Another hint' }).tap();
  await page.evaluate(async () => {
    const s = window.__lab.getState();
    await s.submitAnswer(s.session.problem.answer);
  });
  const support = await page.evaluate(() => window.__lab.getState().session.pending.at(-1));
  assert.equal(support.automaticHints, 1); assert.equal(support.requestedHints, 1);

  for (const label of ['rectangle', 'hexagon']) {
    await setProblem('shapes-2d', 4, { kind: 'numeric' });
    await page.evaluate(async label => {
      const { generate } = await import('/src/engine/generators/index.ts');
      let problem;
      for (let seed = 1; seed < 100; seed++) {
        const p = generate('shapes-2d', 4, seed);
        if (p.questionVisual.label === label) { problem = p; break; }
      }
      const s = window.__lab.getState();
      window.__lab.setState({ session: { ...s.session, problem, hintsUsed: 0 } });
    }, label);
    assert.equal(await page.locator('.viz-poly-symmetry').count(), 0);
    await page.getByRole('button', { name: 'I’m stuck' }).tap();
    assert.equal(await page.locator('.viz-poly-symmetry').count(), label === 'rectangle' ? 2 : 6);
    await page.screenshot({ path: `${output}/symmetry-${label}-portrait.png` });
  }

  // Wrong answers cannot grow a run without a limit or start retry chains.
  await setProblem('add-20', 1, { kind: 'numeric' });
  const bounds = await page.evaluate(async () => {
    const state = window.__lab.getState();
    const item = state.session.plan[0];
    const plan = Array.from({ length: 18 }, (_, i) => ({ ...item, seed: i + 1000 }));
    window.__lab.setState({ session: { ...state.session, plan } });
    let largest = 18, previousLength = 18;
    while (window.__lab.getState().session.problem) {
      const s = window.__lab.getState();
      const item = s.session.plan[s.session.index];
      await s.submitAnswer('9999');
      const next = window.__lab.getState();
      if (item.retry) assertRetryLength(next.session.plan.length, previousLength);
      previousLength = next.session.plan.length; largest = Math.max(largest, previousLength);
      await next.nextItem();
    }
    function assertRetryLength(a, b) { if (a !== b) throw new Error('A retry started another retry.'); }
    return largest;
  });
  assert.ok(bounds <= 21);

  // Optional local reference validation reads exports, never writes or copies them.
  for (const path of (process.env.GENESIS_REFERENCE_EXPORTS ?? '').split(';').filter(Boolean)) {
    const exported = JSON.parse(await readFile(path, 'utf8'));
    const result = await page.evaluate(async data => {
      const { loadProfile, loadAttempts, loadBackup, loadActiveSession, loadActivePlacement, exportAll, saveLearningCheckpoint } = await import('/src/store/db.ts');
      const { setMany } = await import('/node_modules/idb-keyval/dist/index.js');
      const savedSession = { ...window.__lab.getState().session, phase: 'feedback', preservationMarker: 'unfinished work' };
      const savedPlacement = { preservationMarker: 'placement snapshot' };
      await setMany([['genesis-lab:profile', data.profile], ['genesis-lab:attempts', data.attempts],
        ['genesis-lab:active-session', savedSession], ['genesis-lab:active-placement', savedPlacement]]);
      const profile = await loadProfile();
      const backup = await loadBackup();
      const storedAttempts = await loadAttempts();
      const secondLoad = await loadProfile();
      const exportedAgain = JSON.parse(await exportAll());
      const preserved = Object.keys(data.profile).filter(key => key !== 'version' && key !== 'skillStates');
      const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      await saveLearningCheckpoint(profile, storedAttempts, savedSession);
      return { preserved: preserved.every(key => equal(profile[key], data.profile[key])),
        allAttemptsPreserved: equal(data.attempts, storedAttempts) && equal(data.attempts, exportedAgain.attempts) && equal(data.attempts, await loadAttempts()),
        backupPreserved: equal(backup.profile, data.profile) && equal(backup.attempts, data.attempts),
        sessionsPreserved: equal(savedSession, await loadActiveSession()) && equal(savedPlacement, await loadActivePlacement()),
        reloadStable: equal(profile, secondLoad),
        originalSkillsPreserved: Object.entries(data.profile.skillStates).every(([id, state]) => equal(state, profile.skillStates[id].legacyState)),
        previouslyUnlockedRemainOpen: Object.entries(data.profile.skillStates).every(([id, state]) => !state.unlocked || profile.skillStates[id].unlocked),
        fraction: profile.skillStates['fraction-of-set'], addition: profile.skillStates['add-20'] };
    }, exported);
    assert.equal(result.preserved, true);
    for (const key of ['allAttemptsPreserved', 'backupPreserved', 'sessionsPreserved', 'reloadStable', 'originalSkillsPreserved', 'previouslyUnlockedRemainOpen']) {
      assert.equal(result[key], true, key);
    }
    assert.equal(result.fraction.demonstratedLevel, 1);
    assert.equal(result.fraction.level, 2);
    assert.equal(result.fraction.proficient, false);
    // Addition unlocks from existing top-tier accuracy, regardless of old timing.
    assert.equal(result.addition.proficient, true);
    console.log('Reference export: all saved rewards, profile fields, original skill records, attempt history, migration backup and session snapshots preserved; reload and checkpoint stable.');
  }
  assert.deepEqual(errors, []);
  console.log('Tablet checks passed: discovery touch/focus, portrait/landscape, rapid entry/correction, numeric confirmation, number-line targets, operation selection, support telemetry, symmetry and retry/session bounds.');
} finally {
  await context.close(); await browser.close();
}
