// Isolated local Chromium checks. Never loads or changes the user's browser profile.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_PACKAGE ? pathToFileURL(process.env.PLAYWRIGHT_PACKAGE).href : 'playwright');
const url = process.env.GENESIS_URL ?? 'http://127.0.0.1:5176';
const output = process.env.GENESIS_QA_OUTPUT ?? '.qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.GENESIS_BROWSER_EXECUTABLE, channel: process.env.GENESIS_BROWSER_CHANNEL });
const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
const page = await context.newPage(); const errors = [];
page.on('pageerror', e => errors.push(e.message));
const state = () => page.evaluate(() => window.__lab.getState().profile.paddock);
const clientPoint = async (x, y) => {
  const r = await page.locator('.habitat').boundingBox();
  return { x: r.x + x / 1000 * r.width, y: r.y + y / 600 * r.height };
};
const tapScene = async (x, y) => {
  await page.locator('.habitat').scrollIntoViewIfNeeded();
  const p = await clientPoint(x, y); await page.touchscreen.tap(p.x, p.y);
};
const tapResident = async id => { await page.getByRole('button', { name:`${id[0].toUpperCase() + id.slice(1)} in habitat`, exact:true }).tap(); };
const waitMood = (id, text) => page.waitForFunction(({ id, text }) => window.__lab.getState().profile.paddock.residents.find(r => r.id === id)?.mood.includes(text), { id, text });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__lab?.getState().screen !== 'loading');
  await page.evaluate(async () => {
    const { newProfile } = await import('/src/store/db.ts');
    const { initialSkillStates } = await import('/src/engine/mastery.ts');
    const { setMany } = await import('/node_modules/idb-keyval/dist/index.js');
    const profile = newProfile('Paddock QA', initialSkillStates());
    profile.version = 4; delete profile.paddock;
    profile.placementDone = true; profile.soundOn = false; profile.readAloud = false;
    profile.hatched = ['compsognathus','stegosaurus','pteranodon','ankylosaurus','triceratops'];
    profile.labLevel = 100; profile.discoveries = ['fact-raptor-tail']; profile.totalDna = 800; profile.dna = 27;
    profile.dailyDna = 150;
    const { todayKey } = await import('/src/store/db.ts'); profile.dailyDnaDay = todayKey();
    await setMany([['genesis-lab:profile', profile], ['genesis-lab:attempts', []]]);
  });
  await page.reload(); await page.getByRole('button', { name: 'Enter the Paddock' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Enter the Paddock' }).isDisabled(), true);
  assert.match(await page.locator('.paddock-entry').innerText(), /Finish today’s expedition to play with your dinosaurs/);
  await page.screenshot({ path: `${output}/paddock-locked-portrait.png`, fullPage: true });
  await page.getByRole('button', { name: 'Collection (5)' }).tap();
  await page.getByRole('button', { name: /Stegosaurus.*Sequenced/ }).tap();
  assert.match(await page.locator('.celebrate-card').innerText(), /blood vessels/);
  await page.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: '‹ Back', exact: true }).tap();
  // Guard direct navigation too, then finish an actual run (DNA tanks already full).
  await page.evaluate(() => window.__lab.getState().setScreen('paddock'));
  assert.equal(await page.locator('.habitat').count(), 0);
  await page.getByRole('button', { name: 'Return to lab' }).tap();
  await page.evaluate(async () => {
    window.__lab.getState().beginSession();
    for (let i = 0; i < 25 && window.__lab.getState().session?.problem; i++) {
      const s = window.__lab.getState(); await s.submitAnswer(s.session.problem.answer); await window.__lab.getState().nextItem();
    }
  });
  await page.getByRole('button', { name: 'Back to the lab' }).tap();
  const learningBefore = await page.evaluate(() => { const { paddock, ...p } = window.__lab.getState().profile; return { p, attempts: window.__lab.getState().attempts }; });
  await page.getByRole('button', { name: 'Enter the Paddock' }).tap();
  assert.equal(await page.locator('.resident-choice').count(), 5); // Raptor field note grants no raptor.
  const friends = [['compsognathus',280,390],['stegosaurus',180,320],['pteranodon',805,225],['ankylosaurus',540,450],['triceratops',700,340]];
  for (const [id,x,y] of friends) {
    await page.locator('.resident-choice').filter({ hasText: id[0].toUpperCase() + id.slice(1) }).tap(); await tapScene(x,y);
  }
  assert.equal((await state()).residents.length, 5);
  await page.getByRole('button', { name: 'Food', exact: true }).tap(); await tapScene(370,395);
  await waitMood('compsognathus', 'Yum!');
  assert.equal((await state()).toys.find(t => t.kind === 'food').active, false);
  await page.getByRole('button', { name: 'Food', exact: true }).tap(); await tapScene(380,420);
  await waitMood('compsognathus', 'Yum!');
  await page.getByRole('button', { name: 'Brush', exact: true }).tap(); await tapResident('stegosaurus');
  await waitMood('stegosaurus', 'Best brush');
  await page.getByRole('button', { name: 'Ball', exact: true }).tap(); await tapScene(620,450);
  await waitMood('ankylosaurus', 'Tail bat');
  // True touch drag with browser-generated Pointer Events and pointer capture.
  await page.locator('.habitat').scrollIntoViewIfNeeded();
  let r = (await state()).residents.find(r => r.id === 'triceratops');
  const from = await clientPoint(r.x,r.y), to = await clientPoint(700,500);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:from.x,y:from.y,id:1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:(from.x+to.x)/2,y:(from.y+to.y)/2,id:1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:to.x,y:to.y,id:1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  r = (await state()).residents.find(r => r.id === 'triceratops'); assert.ok(Math.abs(r.x - 700) < 5 && Math.abs(r.y - 500) < 5);
  // Pointer cancel restores the previous arrangement.
  r = (await state()).residents.find(r => r.id === 'triceratops');
  const start = await clientPoint(r.x,r.y), cancelled = await clientPoint(900,350);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:start.x,y:start.y,id:2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:cancelled.x,y:cancelled.y,id:2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchCancel', touchPoints:[] });
  assert.ok(Math.abs((await state()).residents.find(r => r.id === 'triceratops').x - r.x) < 5);
  await cdp.detach();
  // Tap-to-select then tap-to-move without dragging.
  await page.getByRole('button', { name:'Done selecting' }).tap();
  await tapResident('triceratops'); await tapScene(870,350);
  assert.ok(Math.abs((await state()).residents.find(r => r.id === 'triceratops').x - 870) < 5);
  // Keyboard brush and direct positioning, plus motion preference.
  await page.getByRole('button', { name: 'Brush', exact: true }).tap();
  await page.getByRole('button', { name: 'Stegosaurus in habitat', exact:true }).focus(); await page.keyboard.press('Enter');
  await waitMood('stegosaurus', 'Best brush');
  await page.getByRole('button', { name: 'Triceratops in habitat', exact:true }).focus();
  const oldX = (await state()).residents.find(r => r.id === 'triceratops').x;
  await page.keyboard.press('ArrowLeft'); assert.equal((await state()).residents.find(r => r.id === 'triceratops').x, oldX - 30);
  await page.emulateMedia({ reducedMotion:'reduce' });
  assert.equal(await page.locator('.habitat-resident').first().evaluate(e => getComputedStyle(e).transitionDuration), '0s');
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await page.getByRole('button', { name:'Take photo', exact:true }).tap();
  await page.getByRole('status').filter({ hasText:'Photo saved' }).waitFor();
  const photos = (await state()).photos; assert.equal(photos.length,1); assert.ok(photos[0].image.length > 20000 && photos[0].image.length < 180000);
  await page.locator('.photo-thumb').tap();
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  assert.equal(await dialog.locator('img').evaluate(e => e.complete && e.naturalWidth === 800), true);
  await page.screenshot({ path:`${output}/paddock-scrapbook-portrait.png` });
  await dialog.getByRole('textbox', { name:'Photo title' }).fill('Brooks’s happy dinosaurs');
  await dialog.getByRole('button', { name:'Save title' }).tap(); await dialog.waitFor({ state:'hidden' });
  // Arrange a calm, legible composition for the handoff screenshots.
  await page.evaluate(async () => {
    const { moveResident } = await import('/src/play/paddock.ts');
    let h = window.__lab.getState().profile.paddock;
    for (const [id,x,y] of [['compsognathus',330,450],['stegosaurus',180,330],['pteranodon',805,225],['ankylosaurus',550,450],['triceratops',760,360]]) h = moveResident(h,id,{x,y});
    await window.__lab.getState().savePaddock(h);
    // The mounted scene owns its current interaction state; remount to load this fixture.
    window.__lab.getState().setScreen('home');
  });
  await page.getByRole('button', { name:'Enter the Paddock' }).tap();
  await page.setViewportSize({ width:1024,height:768 });
  await page.evaluate(() => window.scrollTo(0,0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path:`${output}/paddock-landscape.png`, fullPage:true });
  await page.setViewportSize({ width:768,height:1024 });
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path:`${output}/paddock-portrait.png`, fullPage:true });
  const beforeReload = await state();
  const learningAfter = await page.evaluate(() => { const { paddock, ...p } = window.__lab.getState().profile; return { p, attempts:window.__lab.getState().attempts }; });
  assert.deepEqual(learningAfter,learningBefore);
  await page.getByRole('button', { name:'Return to lab' }).tap(); await page.reload();
  await page.getByRole('button', { name:'Enter the Paddock' }).tap();
  const reloaded = await state();
  assert.deepEqual(reloaded.photos,beforeReload.photos);
  assert.deepEqual(reloaded.residents.map(({id,x,y}) => ({id,x,y})),beforeReload.residents.map(({id,x,y}) => ({id,x,y})));
  const exported = await page.evaluate(async () => { const { exportAll } = await import('/src/store/db.ts'); return JSON.parse(await exportAll()); });
  assert.deepEqual(exported.profile.paddock.photos,beforeReload.photos);
  // Exercise an actual failed IndexedDB photo save; the earlier image must survive.
  await page.evaluate(() => {
    window.__qaOriginalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'genesis-lab:profile') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return window.__qaOriginalPut.call(this, value, key);
    };
  });
  await page.getByRole('button', { name:'Take photo', exact:true }).tap();
  await page.getByRole('status').filter({ hasText:'could not save' }).waitFor();
  assert.deepEqual((await state()).photos,beforeReload.photos);
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__qaOriginalPut; delete window.__qaOriginalPut; });
  await page.locator('.photo-thumb').tap();
  await dialog.getByRole('button', { name:'Delete photo', exact:true }).tap();
  assert.equal((await state()).photos.length,1);
  await dialog.getByRole('button', { name:'Keep photo' }).tap();
  await dialog.getByRole('button', { name:'Delete photo', exact:true }).tap();
  await dialog.getByRole('button', { name:'Yes, delete this photo' }).tap(); await dialog.waitFor({ state:'hidden' });
  assert.equal((await state()).photos.length,0);
  await page.reload(); await page.getByRole('button', { name:'Enter the Paddock' }).tap(); assert.equal((await state()).photos.length,0);
  // New day locks entry while preserving habitat. An already admitted visit continues.
  await page.evaluate(async () => { const { saveProfile } = await import('/src/store/db.ts'); const p = { ...window.__lab.getState().profile, lastSessionDay:'2000-01-01' }; window.__lab.setState({ profile:p }); await saveProfile(p); });
  assert.equal(await page.locator('.habitat').count(),1);
  await page.getByRole('button', { name:'Return to lab' }).tap();
  assert.equal(await page.getByRole('button', { name:'Enter the Paddock' }).isDisabled(),true);
  assert.equal((await state()).residents.length,5);
  assert.deepEqual(errors,[]);
  console.log('Paddock tablet checks passed: actual completion, old-profile access, collection facts, earned friends, repeated food, brush, tail-ball, touch drag/cancel, tap placement, keyboard, reduced motion, capture/gallery/title/delete, navigation, reload, exports, daily relocking and unchanged learning records.');
} catch (error) {
  const failed = await state();
  console.log('Failure habitat', JSON.stringify({ ...failed, photos:failed.photos.map(({ id,title,image }) => ({ id,title,imageLength:image.length })) }));
  await page.screenshot({ path:`${output}/paddock-check-failure.png`, fullPage:true });
  throw error;
} finally { await context.close(); await browser.close(); }
