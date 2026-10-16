// Local-only, isolated synthetic profile. Never touches the user's browser data.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_PACKAGE ? pathToFileURL(process.env.PLAYWRIGHT_PACKAGE).href : 'playwright');
const output = process.env.GENESIS_QA_OUTPUT ?? '.qa/dna-lab';
const url = process.env.GENESIS_URL ?? 'http://127.0.0.1:5178';
await mkdir(output, { recursive:true });
const browser = await chromium.launch({ headless:true, executablePath:process.env.GENESIS_BROWSER_EXECUTABLE, channel:process.env.GENESIS_BROWSER_CHANNEL });
const context = await browser.newContext({ viewport:{width:768,height:1024}, hasTouch:true, isMobile:true, timezoneId:'America/New_York', acceptDownloads:true });
const page = await context.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const lab = () => page.evaluate(() => window.__lab.getState().profile.dnaLab);
const learning = () => page.evaluate(() => { const { dnaLab,...p }=window.__lab.getState().profile; return { p,attempts:window.__lab.getState().attempts }; });
const run = async () => { await page.getByRole('button',{name:'Run your experiment'}).tap(); await page.locator('.dna-results').waitFor({state:'visible'}); };
const slider = async (label, steps) => { const el=page.getByRole('slider',{name:label}); await el.focus(); await el.press('Home'); for (let i=0;i<steps;i++) await el.press('ArrowRight'); };
const saved = name => page.locator('.dna-saved').filter({has:page.getByRole('heading',{name,exact:true})});
try {
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__lab?.getState().screen !== 'loading');
  await page.evaluate(async () => {
    const { newProfile }=await import('/src/store/db.ts'); const { initialSkillStates }=await import('/src/engine/mastery.ts');
    const { setMany }=await import('/node_modules/idb-keyval/dist/index.js');
    const p=newProfile('DNA synthetic QA',initialSkillStates()); p.version=5; delete p.dnaLab; p.placementDone=true; p.soundOn=false;p.readAloud=false;
    p.hatched=['compsognathus','stegosaurus','pteranodon','ankylosaurus','triceratops'];p.discoveries=['fact-raptor-tail'];p.dna=27;p.totalDna=800;p.labLevel=99;
    const { todayKey }=await import('/src/store/db.ts');p.dailyDna=150;p.dailyDnaDay=todayKey();
    await setMany([['genesis-lab:profile',p],['genesis-lab:attempts',[]]]);
  });
  await page.reload(); await page.getByRole('button',{name:'Enter DNA Playground'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Enter DNA Playground'}).isDisabled(),true);
  await page.evaluate(()=>window.__lab.getState().setScreen('dna-lab'));
  assert.equal(await page.locator('.dna-bench').count(),0); await page.getByRole('button',{name:'Return to lab'}).tap();
  // Complete a real session with the math DNA tank already full.
  await page.evaluate(async () => {
    window.__lab.getState().beginSession();
    for (let i=0;i<30&&window.__lab.getState().session?.problem;i++) {const s=window.__lab.getState();await s.submitAnswer(s.session.problem.answer);await window.__lab.getState().nextItem();}
  });
  await page.getByRole('button',{name:'Back to the lab'}).tap();
  const before=await learning();
  await page.getByRole('button',{name:'Enter DNA Playground'}).tap();
  assert.equal(await page.locator('.dna-sample').count(),5); assert.equal(await page.locator('.dna-sample').filter({hasText:'Velociraptor'}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  await page.screenshot({path:output+'/bench-portrait.png',fullPage:true});
  // Original, then one variable; baseline and current cards remain visible.
  await run(); assert.equal(await page.locator('.dna-result').count(),2);
  const base=await page.locator('.dna-result').first().innerText(); assert.match(base,/7.00 s/);
  const leg=page.getByRole('slider',{name:'Leg length'}); await leg.scrollIntoViewIfNeeded();
  const rect=await leg.boundingBox();await page.touchscreen.tap(rect.x+rect.width*.8,rect.y+rect.height/2);
  assert.match(await page.locator('.dna-change').innerText(),/1 changed: Leg length/);
  await slider('Leg length',6); // 1.3x
  await page.getByLabel('What do you think will happen?',{exact:false}).fill('It might run faster.');
  await run(); assert.equal(await page.locator('.dna-result').count(),3);
  assert.match(await page.locator('.dna-result').nth(1).innerText(),/7.00 s/);
  assert.ok(Number((await page.locator('.dna-result').first().innerText()).match(/([0-9.]+) s/)[1])<7);
  await page.getByLabel('Color',{exact:true}).selectOption('mint'); await page.getByLabel('Pattern',{exact:true}).selectOption('spots');
  await page.getByLabel('Track conditions').selectOption('hurdles'); await run();
  assert.match(await page.locator('.dna-result').first().innerText(),/3.3 hurdles/);
  await page.getByLabel('Creation name').fill('Mint runner'); await page.getByRole('button',{name:'Save creation',exact:true}).tap();
  await saved('Mint runner').waitFor(); assert.equal((await lab()).creations.length,1);
  const savedId=(await lab()).creations[0].id;
  // Export is the actual browser download and validates against the shared runtime.
  const downloadPromise=page.waitForEvent('download'); await saved('Mint runner').getByRole('button',{name:'Export dinosaur'}).tap();
  const download=await downloadPromise;await download.saveAs(output+'/mint-runner.json');
  const data=JSON.parse(await readFile(output+'/mint-runner.json','utf8'));
  assert.equal(data.creation.id,savedId);assert.equal(data.creation.traits.legs,1.3);assert.equal(data.creation.appearance.pattern,'spots');
  assert.equal(await page.evaluate(async payload=>(await import('/src/play/dnaLab.ts')).validateExport(payload),data),true);
  assert.ok(!JSON.stringify(data).includes('DNA synthetic QA')); assert.ok(!JSON.stringify(data).includes('skillStates'));
  await page.reload(); await page.getByRole('button',{name:'Enter DNA Playground'}).tap(); await saved('Mint runner').waitFor();
  await saved('Mint runner').getByRole('button',{name:'Reopen Mint runner',exact:true}).tap();
  assert.equal(await page.getByRole('slider',{name:'Leg length'}).inputValue(),'1.3');
  assert.equal(await page.getByLabel('Pattern',{exact:true}).inputValue(),'spots');
  await saved('Mint runner').getByRole('button',{name:'Duplicate Mint runner',exact:true}).tap();await saved('Mint runner copy').waitFor();
  assert.equal((await lab()).creations.length,2);assert.notEqual((await lab()).creations[1].id,savedId);
  // Reopened creation changes the same stable ID, including all three balance outcomes.
  await page.getByRole('button',{name:'Balance Lab',exact:true}).tap();
  await slider('Leg length',3);await page.getByLabel('Turn sharpness').selectOption('gentle');await run();
  assert.match(await page.locator('.dna-result').first().innerText(),/Stable turn/);
  await page.getByLabel('Turn sharpness').selectOption('medium');await run();assert.match(await page.locator('.dna-result').first().innerText(),/little wobble/);
  await slider('Leg length',7);await page.getByLabel('Turn sharpness').selectOption('sharp');await run();assert.match(await page.locator('.dna-result').first().innerText(),/Soft-mat tumble/);
  await page.setViewportSize({width:1024,height:768});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);await page.screenshot({path:output+'/balance-landscape.png',fullPage:true});
  // Simulated quota failure preserves the notebook; retry uses the same setup.
  await page.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Synthetic quota failure','QuotaExceededError');};});
  await page.getByRole('button',{name:'Save changes',exact:true}).tap();
  await page.waitForFunction(()=>document.querySelector('.dna-notice').textContent.includes('could not save'));
  assert.equal((await lab()).creations[0].traits.legs,1.3);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut;});
  await page.getByRole('button',{name:'Save changes',exact:true}).tap();await page.waitForFunction(()=>window.__lab.getState().profile.dnaLab.creations[0].traits.legs===1.4);
  assert.equal((await lab()).creations[0].id,savedId);
  await page.getByRole('button',{name:'Reset to original'}).tap();assert.equal(await page.getByRole('slider',{name:'Leg length'}).inputValue(),'1');
  await page.emulateMedia({reducedMotion:'reduce'});
  await run();assert.equal(await page.locator('.dna-runner').count(),0);
  await page.getByRole('button',{name:'Use last run’s traits'}).tap();
  // Named, deliberate deletion: cancellation keeps the copy.
  await saved('Mint runner copy').getByRole('button',{name:'Delete Mint runner copy',exact:true}).tap();
  const dialog=page.getByRole('dialog'); await dialog.getByRole('button',{name:'Keep creation'}).tap();assert.equal((await lab()).creations.length,2);
  await saved('Mint runner copy').getByRole('button',{name:'Delete Mint runner copy',exact:true}).tap();
  await dialog.getByRole('button',{name:'Yes, delete creation'}).tap();await dialog.waitFor({state:'hidden'});assert.equal((await lab()).creations.length,1);
  assert.deepEqual(await learning(),before);
  await page.screenshot({path:output+'/notebook-landscape.png',fullPage:true});
  // Create a real two-parent hybrid, then hand its complete design to Battle.
  await page.locator('.dna-sample').filter({hasText:'Stegosaurus'}).tap();
  await page.getByRole('button',{name:'Create hybrid',exact:true}).tap();
  await page.getByRole('combobox',{name:'Partner dinosaur',exact:true}).selectOption('ankylosaurus');
  assert.equal(await page.getByRole('combobox',{name:'Partner dinosaur',exact:true}).locator('option[value="stegosaurus"]').count(),0);
  await page.getByRole('combobox',{name:'head DNA',exact:true}).selectOption('base');
  assert.equal(await page.locator('.dna-preview-pair [data-hybrid-tail="ankylosaurus"]').count(),2);
  assert.match(await page.locator('.dna-inheritance').innerText(),/Armored back/);
  assert.match(await page.locator('.dna-inheritance').innerText(),/Club tail/);
  assert.equal(await page.getByRole('button',{name:'Save creation',exact:true}).isDisabled(),true);
  await run(); await page.getByLabel('Creation name').fill('Clubback');
  await page.getByRole('button',{name:'Save creation',exact:true}).tap();await saved('Clubback').waitFor();
  const hybridId=(await lab()).creations.find(c=>c.name==='Clubback').id;
  const hybridDownloadPromise=page.waitForEvent('download');await saved('Clubback').getByRole('button',{name:'Export hybrid',exact:true}).tap();
  const hybridDownload=await hybridDownloadPromise;await hybridDownload.saveAs(output+'/clubback.json');
  const hybridData=JSON.parse(await readFile(output+'/clubback.json','utf8'));
  assert.equal(hybridData.version,2);assert.equal(hybridData.creation.hybrid.donorSpeciesId,'ankylosaurus');
  assert.equal(hybridData.battleBlueprint.anatomy.head,'stegosaurus');assert.equal(hybridData.battleBlueprint.anatomy.tail,'ankylosaurus');
  assert.equal(Object.values(hybridData.battleBlueprint.stats).reduce((a,b)=>a+b,0),30);
  assert.equal(await page.evaluate(async d=>(await import('/src/play/dnaLab.ts')).validateExport(d),hybridData),true);
  const promptDownloadPromise=page.waitForEvent('download');await saved('Clubback').getByRole('button',{name:'Export Battle prompt',exact:true}).tap();
  const promptDownload=await promptDownloadPromise;await promptDownload.saveAs(output+'/clubback-battle-prompt.txt');
  const prompt=await readFile(output+'/clubback-battle-prompt.txt','utf8');
  assert.match(prompt,/Dinosaur_Battle/);assert.match(prompt,/src\/core\/types.ts/);assert.match(prompt,/Club tail/);
  assert.deepEqual(JSON.parse(prompt.split('Full portable design:\n')[1]),hybridData);
  assert.ok(!prompt.includes('DNA synthetic QA'));
  await page.setViewportSize({width:768,height:1024});await page.getByRole('region',{name:'Hybrid creator'}).scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:output+'/hybrid-portrait.png',fullPage:true});
  await page.reload();await page.getByRole('button',{name:'Enter DNA Playground'}).tap();
  await saved('Clubback').getByRole('button',{name:'Reopen Clubback',exact:true}).tap();
  assert.equal(await page.getByRole('button',{name:'Create hybrid',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('combobox',{name:'Partner dinosaur',exact:true}).inputValue(),'ankylosaurus');
  assert.equal(await page.getByRole('combobox',{name:'head DNA',exact:true}).inputValue(),'base');
  assert.equal(await page.getByRole('combobox',{name:'tail DNA',exact:true}).inputValue(),'donor');
  // Switching inheritance invalidates the last test; a new run is required.
  await page.getByRole('combobox',{name:'head DNA',exact:true}).selectOption('donor');
  assert.equal(await page.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true);
  await run();await page.getByRole('button',{name:'Save changes',exact:true}).tap();
  assert.equal((await lab()).creations.find(c=>c.id===hybridId).hybrid.head,'donor');
  await saved('Clubback').getByRole('button',{name:'Duplicate Clubback',exact:true}).tap();await saved('Clubback copy').waitFor();
  await saved('Clubback copy').getByRole('button',{name:'Delete Clubback copy',exact:true}).tap();
  await page.getByRole('dialog').getByRole('button',{name:'Keep creation',exact:true}).tap();assert.equal((await lab()).creations.length,3);
  await saved('Clubback copy').getByRole('button',{name:'Delete Clubback copy',exact:true}).tap();
  await page.getByRole('dialog').getByRole('button',{name:'Yes, delete creation',exact:true}).tap();
  await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal((await lab()).creations.length,2);
  assert.deepEqual(await learning(),before);
  await page.setViewportSize({width:1024,height:768});await page.getByRole('region',{name:'Hybrid creator'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:output+'/hybrid-landscape.png',fullPage:true});
  await page.getByRole('button',{name:'Single sample',exact:true}).tap();
  assert.equal(await page.getByRole('combobox',{name:'Partner dinosaur',exact:true}).count(),0);
  // Shared art and existing navigation still work.
  await page.getByRole('button',{name:'Collection',exact:true}).tap();await page.getByRole('button',{name:'Back',exact:false}).tap();
  await page.getByRole('button',{name:'Enter the Paddock'}).tap();assert.equal(await page.locator('.habitat').count(),1);
  await page.getByRole('button',{name:'Return to lab'}).tap();await page.getByRole('button',{name:'⚙️',exact:true}).tap();
  await page.getByRole('button',{name:'Back',exact:false}).tap();
  await page.getByRole('button',{name:'Enter DNA Playground'}).tap();
  // No sample is admitted just by having a field note; empty earned samples are safe.
  await page.evaluate(()=>window.__lab.setState({profile:{...window.__lab.getState().profile,hatched:[]}}));
  assert.equal(await page.locator('.dna-sample').count(),0);assert.match(await page.locator('.dna-rack').innerText(),/Hatch your first dinosaur/);
  await page.getByRole('button',{name:'Return to lab'}).tap();
  await page.evaluate(()=>window.__lab.setState({profile:{...window.__lab.getState().profile,hatched:['compsognathus','stegosaurus','pteranodon']}}));
  await page.getByRole('button',{name:'Enter DNA Playground'}).tap();
  await page.evaluate(async()=>{const {saveProfile}=await import('/src/store/db.ts');const p={...window.__lab.getState().profile,lastSessionDay:'2000-01-01'};window.__lab.setState({profile:p});await saveProfile(p);});
  assert.equal(await page.locator('.dna-bench').count(),1); // admitted visit lasts
  await page.getByRole('button',{name:'Return to lab'}).tap();assert.equal(await page.getByRole('button',{name:'Enter DNA Playground'}).isDisabled(),true);
  assert.equal((await lab()).creations.length,2);
  await page.reload(); assert.equal(await page.getByRole('button',{name:'Enter DNA Playground'}).isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('DNA tablet checks passed: daily gate, experiments and legacy exports, hybrid parents/parts/art, design attributes, save/reopen/edit/duplicate/delete, JSON + self-contained Battle prompt downloads, reload, reduced motion, quota retry, unchanged learning and existing navigation.');
} catch(e) {await page.screenshot({path:output+'/failure.png',fullPage:true});throw e;}
finally {await context.close();await browser.close();}
