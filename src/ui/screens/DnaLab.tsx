import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { todayKey } from '../../store/db';
import { hasPlayAccess } from '../../play/paddock';
import { dinoById } from '../../content/dinosaurs';
import { battleBuildPrompt, changes, cleanSetup, COLORS, defaultConditions, deleteCreation, earnedSamples, exportDinosaur, MAX_CREATIONS, MAX_RUNS, originalSetup, PATTERNS, putCreation, simulate, TRAITS, type Conditions, type Creation, type LabState, type Run, type Setup, type Traits } from '../../play/dnaLab';
import { battleStats, BATTLE_STATS, featureFor, hybridLabel, HYBRID_PARTS, newHybrid, partSources, validHybrid, type HybridGenome, type HybridPart } from '../../play/hybrids';
import { DinosaurArt } from '../components/HabitatArt';
import { sfx } from '../audio';
import './DnaLab.css';
const uid = () => globalThis.crypto?.randomUUID?.() ?? 'lab-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const summary = (r: Run) => r.conditions.experiment === 'dash' ? r.result.seconds.toFixed(2) + ' s' + (r.conditions.track === 'hurdles' ? ' · ' + r.result.cleared + '/3 hurdles' : '') : ({ stable: 'Stable turn', wobble: 'A little wobble', tumble: 'Soft-mat tumble' })[r.result.stability];
const conditionLabel = (r: Run) => r.conditions.experiment === 'dash' ? r.conditions.track + ' track' : r.conditions.turn + ' bend';
function Preview({ species, setup }: { species: string; setup: Setup }) {
  return <svg viewBox="-120 -100 240 160" role="img" aria-label={hybridLabel(species, setup.hybrid) + ' preview: tail ' + setup.traits.tail + ', legs ' + setup.traits.legs + ', mass ' + setup.traits.mass + ', ' + setup.appearance.color + ', ' + setup.appearance.pattern}><DinosaurArt id={species} setup={setup}/></svg>;
}
function ResultCard({ label, run }: { label: string; run: Run }) {
  return <article className="dna-result"><span className="small">{label} · {conditionLabel(run)}</span><strong>{summary(run)}</strong><div className="dna-result-dino"><Preview species={run.speciesId} setup={run}/></div><small>Tail {run.traits.tail}× · Legs {run.traits.legs}× · Mass {run.traits.mass}×</small></article>;
}
export function DnaLab() {
  const profile = useStore(s => s.profile), setScreen = useStore(s => s.setScreen), saveLab = useStore(s => s.saveLab);
  const [admitted] = useState(() => !!profile && hasPlayAccess(profile, todayKey()));
  const samples = earnedSamples(profile?.hatched ?? []);
  const [species, setSpecies] = useState(samples[0]?.id ?? '');
  const [setup, setSetup] = useState<Setup>(originalSetup);
  const designStats = useMemo(() => setup.hybrid && species ? battleStats(species,setup) : null, [species,setup]);
  const [conditions, setConditions] = useState<Conditions>(defaultConditions);
  const [runs, setRuns] = useState<Run[]>([]);
  const [name, setName] = useState('My first invention');
  const [editing, setEditing] = useState<string | null>(null);
  const [prediction, setPrediction] = useState('');
  const [notice, setNotice] = useState('Choose your DNA sample.');
  const [busy, setBusy] = useState(false), [running, setRunning] = useState(false), [progress, setProgress] = useState(0);
  const [animation, setAnimation] = useState<{ run: Run; reference: Run } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(m.matches); m.addEventListener('change', update); return () => m.removeEventListener('change', update); }, []);
  useEffect(() => {
    if (!running || !animation) return;
    if (reduced) {
      setProgress(1); setRunning(false); setNotice(summary(animation.run) + '. Change one trait and try again!');
      sfx.correct(useStore.getState().profile?.soundOn ?? false); return;
    }
    let frame = 0, start = 0;
    const duration = animation.run.conditions.experiment === 'dash' ? Math.max(animation.run.result.seconds, animation.reference.result.seconds) * 320 : 2500;
    const tick = (time: number) => {
      if (!start) start = time;
      const p = Math.min(1, (time - start) / duration); setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
      else { setRunning(false); setNotice(summary(animation.run) + '. Change one trait and try again!'); sfx.correct(useStore.getState().profile?.soundOn ?? false); }
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [running, animation, reduced]);
  const previous = [...runs].reverse().find(r => r.conditions.experiment === conditions.experiment);
  const original: Setup = { ...originalSetup(), ...(setup.hybrid ? { hybrid:setup.hybrid } : {}) };
  const baseline = species ? simulate(species, original, conditions) : null;
  const latest = runs[runs.length - 1];
  const changed = latest ? changes(setup, latest) : changes(setup, original);
  const conditionsChanged = latest && JSON.stringify(latest.conditions) !== JSON.stringify(conditions);
  const readyToSave = !!latest && changes(setup, latest).length === 0 && !conditionsChanged;
  const notebook = profile?.dnaLab ?? { creations: [] };
  async function commit(next: LabState, message: string): Promise<boolean> {
    setBusy(true);
    try { await saveLab(next); setNotice(message); return true; }
    catch { setNotice('The device could not save. Your saved creations are safe. Free some storage and try again.'); return false; }
    finally { setBusy(false); }
  }
  function selectSample(id: string) {
    const donor = setup.hybrid ? (setup.hybrid.donorSpeciesId !== id ? setup.hybrid.donorSpeciesId : samples.find(d => d.id !== id)?.id) : undefined;
    setSpecies(id); setSetup({ ...originalSetup(), ...(donor ? { hybrid:{ ...setup.hybrid!, donorSpeciesId:donor } } : {}) }); setRuns([]); setEditing(null); setName(donor ? 'My new hybrid' : 'My ' + (dinoById(id)?.name ?? 'dinosaur')); setAnimation(null); setProgress(0); setPrediction(''); setNotice(donor ? 'Body DNA changed. Choose your partner features, then run a test.' : 'Change one trait. Then run your experiment.'); sfx.tap(profile?.soundOn ?? false);
  }
  function changeGenome(genome?: HybridGenome) {
    if (genome && !validHybrid(species, genome)) { setNotice('Keep at least one partner feature to make a hybrid.'); return; }
    setSetup({ ...cleanSetup(setup), hybrid:genome }); setRuns([]); setAnimation(null); setProgress(0); setPrediction('');
    setNotice(genome ? 'DNA mixed! Choose the head, back and tail you like, then test your hybrid.' : 'Back to one sample. Your saved hybrids stay in the notebook.');
  }
  function open(c: Creation) { setSpecies(c.speciesId); setSetup(cleanSetup(c)); setRuns([...c.runs]); setConditions({ ...c.runs[c.runs.length - 1]!.conditions }); setName(c.name); setEditing(c.id); setAnimation(null); setPrediction(''); setNotice('Creation reopened. Change one trait or run it again.'); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function runExperiment() {
    if (!species || running || busy) return;
    document.querySelector('.dna-window')?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    const run = simulate(species, setup, conditions);
    // A ghost always uses these exact conditions, so speed/stability comparisons are fair.
    const reference = previous && JSON.stringify(previous.conditions) === JSON.stringify(conditions) ? previous : baseline!;
    setAnimation({ run, reference }); setProgress(0); setRunning(true); setRuns([...runs.slice(-(MAX_RUNS - 1)), run]); setNotice('Test chamber running…'); sfx.tap(profile?.soundOn ?? false);
  }
  async function saveCreation() {
    if (!profile || !readyToSave) return;
    const c: Creation = { id: editing ?? uid(), name: name.trim() || 'My dinosaur', speciesId: species, ...cleanSetup(setup), modelVersion: latest!.modelVersion, runs };
    try { if (await commit(putCreation(notebook, profile.hatched, c), 'Creation saved in your notebook!')) setEditing(c.id); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not save.'); }
  }
  function download(c: Creation, prompt = false) {
    try {
      const text = prompt ? battleBuildPrompt(c) : JSON.stringify(exportDinosaur(c), null, 2);
      const url = URL.createObjectURL(new Blob([text], { type: prompt ? 'text/plain' : 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = (prompt ? 'battle-build-' : 'genesis-dinosaur-') + c.id + (prompt ? '.txt' : '.json'); document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(prompt ? 'Battle build prompt downloaded. A parent can paste it into the Dinosaur Battle project.' : c.hybrid ? 'Hybrid exported with parentage, body parts, colors and Battle design attributes.' : 'Dinosaur exported. A parent can share this file with the battle game later.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not export.'); }
  }
  if (!profile) return null;
  if (!admitted) return <div className="app"><button className="btn" onClick={() => setScreen('home')}>‹ Return to lab</button><h1>DNA Playground</h1><p>Finish today’s expedition to open your experiment bench.</p><button className="btn" onClick={() => setScreen('collection')}>Collection</button></div>;
  const motion = animation;
  const active = motion?.run ?? latest;
  const isDash = (motion?.run.conditions.experiment ?? conditions.experiment) === 'dash';
  const secondsMax = motion ? Math.max(motion.run.result.seconds, motion.reference.result.seconds) : 1;
  const position = (r: Run) => reduced ? (progress === 1 ? 790 : 150) : 150 + Math.min(1, progress * secondsMax / r.result.seconds) * 640;
  const rotation = active && !isDash && progress > .25 ? active.result.stability === 'tumble' ? Math.min(75, (progress - .25) * 150) : active.result.stability === 'wobble' && !reduced ? Math.sin(progress * 30) * 16 - Math.sin(progress * Math.PI) * 12 : -Math.sin(progress * Math.PI) * 12 : 0;
  const bendFraction = Math.max(0, Math.min(1, (progress - .22) / .48));
  const bendRise = bendFraction * bendFraction * (3 - 2 * bendFraction);
  const falls = active?.result.stability === 'tumble' && progress > .55;
  const balanceX = falls ? 590 + (progress - .55) / .45 * 90 : progress <= .5 ? 160 + progress * 780 : 550 + (progress - .5) * 600;
  const balanceY = falls ? 110 + (progress - .55) / .45 * 95 : 205 - 145 * bendRise;
  return <div className="app dna-app">
    <header className="topbar"><button className="btn btn-ghost" disabled={busy} onClick={() => setScreen('home')}>‹ Return to lab</button><span className="pill">Free play · Open today</span><button className="btn" disabled={busy} onClick={() => setScreen('collection')}>Collection</button></header>
    <div className="dna-title"><span className="dna-eyebrow">GENESIS · EXPERIMENT BENCH 01</span><h1>DNA Playground</h1><p className="small dim">You’re the scientist. What will you discover?</p></div>
    <p role="status" className="dna-notice">{notice}</p>
    <div className="dna-bench">
      <section className="dna-window" aria-label="Test chamber">
        <div className="dna-panel-label"><span>◎ TEST CHAMBER</span><span>{running ? 'TEST IN PROGRESS' : 'READY FOR YOU'}</span></div>
        <svg className="dna-chamber" viewBox="0 0 1000 300" role="img" aria-label={running ? 'Animated experiment in progress' : active ? summary(active) : 'Empty test chamber. Choose a sample and run an experiment.'}>
          <defs><linearGradient id="chamber-bg" x2="0" y2="1"><stop stopColor="#102b38"/><stop offset="1" stopColor="#2d5860"/></linearGradient><pattern id="chamber-grid" width="60" height="40" patternUnits="userSpaceOnUse"><path d="M60 0H0V40" stroke="#96dddc" opacity=".12" fill="none"/></pattern></defs>
          <rect width="1000" height="300" fill="url(#chamber-bg)"/><rect width="1000" height="300" fill="url(#chamber-grid)"/>
          <path d="M0 240 L1000 240 L1000 300 L0 300Z" fill="#416471"/><path d="M0 243H1000" stroke="#b7e4e0" strokeWidth="3"/>
          {isDash ? <><path d="M100 270H900" stroke="#d5de8d" strokeWidth="4" strokeDasharray="35 25"/><path d="M880 60V240" stroke="#a9d4ca" strokeWidth="5"/><path d="M880 65h48v32h-48" fill="#e8d78e"/>
            {(motion?.run.conditions.track ?? conditions.track) === 'hurdles' && [350,550,750].map(x => <g key={x}><path d={'M' + x + ' 240v-36h45v36'} fill="none" stroke="#e6aa79" strokeWidth="8"/></g>)}
            {(motion?.run.conditions.track ?? conditions.track) === 'grippy' && <path d="M120 240H850" stroke="#d7be8f" strokeWidth="12" strokeDasharray="5 5"/>}
          </> : <><path d="M160 253Q500 253 520 160Q560 65 870 80" fill="none" stroke="#b8dddd" strokeWidth="30" opacity=".35"/><rect x="530" y="239" width="300" height="32" rx="16" fill="#a88bd2"/><text x="680" y="292" textAnchor="middle" fill="#e1d2fc" fontSize="17">SOFT LANDING MAT</text></>}
          {species && <>
            {motion && isDash && <g transform={'translate(' + position(motion.reference) + ' 135) scale(1.12)'} opacity=".4"><DinosaurArt id={species} setup={motion.reference}/><text x="0" y="60" textAnchor="middle" fill="white" fontSize="15">comparison</text></g>}
            <g transform={'translate(' + (isDash && motion ? position(motion.run) : !isDash ? balanceX : 170) + ' ' + (isDash ? 203 - (motion?.run.conditions.track === 'hurdles' && running && !reduced ? Math.max(0, Math.sin(progress * Math.PI * 6)) * (motion.run.result.cleared * 9) : 0) : balanceY) + ') rotate(' + rotation + ') scale(1.2)'}><g className={running && isDash && !reduced ? 'dna-runner' : ''}><DinosaurArt id={species} setup={motion?.run ?? setup}/></g></g>
          </>}
          <text x="35" y="35" fill="#d0ece4" fontSize="19">{isDash ? 'DINO DASH' : 'BALANCE LAB'} · {isDash ? (motion?.run.conditions.track ?? conditions.track).toUpperCase() : (motion?.run.conditions.turn ?? conditions.turn).toUpperCase()}</text>
        </svg>
        <div className="dna-chamber-caption"><span>{running ? 'Watch your dinosaur…' : active ? summary(active) : 'Ready for your first experiment'}</span><span className="small">Repeatable test · Same course every run</span></div>
      </section>
      <section className="dna-rack" aria-label="DNA sample rack"><div className="dna-panel-label">01 / CHOOSE YOUR DNA SAMPLE</div><div className="dna-samples">{samples.map(d => <button key={d.id} className={'dna-sample ' + (species === d.id ? 'selected' : '')} aria-pressed={species === d.id} disabled={running || busy} onClick={() => selectSample(d.id)}><span className="dna-vial" style={{ background: d.color }}><span>🧬</span></span><strong>{d.name}</strong><small>Reusable sample</small></button>)}</div>{!samples.length && <p>Hatch your first dinosaur to get a reusable DNA sample. Field notes do not unlock samples.</p>}</section>
      <section className="dna-hybrid-panel" aria-label="Hybrid creator">
        <div className="dna-panel-label">HYBRID CREATOR / MIX TWO FRIENDS</div>
        <p className="small dim">Keep the body of your chosen dinosaur. Borrow a head, back or tail from another!</p>
        <fieldset disabled={running || busy || !species}>
          <legend className="sr-only">Creation mode</legend>
          <div className="dna-test-tabs"><button className={'btn ' + (!setup.hybrid ? 'selected' : '')} aria-pressed={!setup.hybrid} onClick={() => changeGenome()}>Single sample</button><button className={'btn ' + (setup.hybrid ? 'selected' : '')} aria-pressed={!!setup.hybrid} disabled={samples.length < 2} onClick={() => { if (!setup.hybrid) { changeGenome(newHybrid(samples.find(d => d.id !== species)!.id)); setName('My new hybrid'); setEditing(null); } }}>Create hybrid</button></div>
          {samples.length < 2 && <p className="small dim">Hatch two different dinosaurs to mix their reusable samples.</p>}
          {setup.hybrid && <>
            <p className="dna-parentage"><strong>{hybridLabel(species, setup.hybrid)}</strong><span>Body: {dinoById(species)?.name}</span></p>
            <label>Partner dinosaur<select aria-label="Partner dinosaur" value={setup.hybrid.donorSpeciesId} onChange={e => changeGenome({ ...setup.hybrid!, donorSpeciesId:e.target.value })}>{samples.filter(d => d.id !== species).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <div className="dna-inheritance">{HYBRID_PARTS.map((part: HybridPart) => <label key={part}><span>{part.charAt(0).toUpperCase() + part.slice(1)} DNA</span><select aria-label={`${part} DNA`} value={setup.hybrid![part]} onChange={e => changeGenome({ ...setup.hybrid!, [part]:e.target.value })}><option value="base">{dinoById(species)?.name}</option><option value="donor">{dinoById(setup.hybrid!.donorSpeciesId)?.name}</option></select><small>{featureFor(part, partSources(species, setup.hybrid)[part])}</small></label>)}</div>
            <div className="dna-hybrid-card" aria-label="Hybrid design attributes"><strong>Hybrid design card</strong><div className="dna-stat-grid">{BATTLE_STATS.map(stat => <div key={stat}><span>{stat}</span><strong>{designStats![stat]}<small>/9</small></strong><meter min="0" max="9" value={designStats![stat]} aria-label={stat}/></div>)}</div><p className="small">Every hybrid shares 30 design points. Different strengths make different friends!</p></div>
          </>}
        </fieldset>
      </section>
      {species && <>
        <section className="dna-scanner" aria-label="Specimen scanner"><div className="dna-panel-label">SPECIMEN SCANNER / {dinoById(species)?.name}</div><div className="dna-preview-pair"><div><span className="small">Original</span><Preview species={species} setup={original}/><small>Tail 1× · Legs 1× · Mass 1×</small></div><div><span className="small">Your setup</span><Preview species={species} setup={setup}/><small>{setup.appearance.color} · {setup.appearance.pattern}</small></div></div><div className="dna-change" role="status">{changed.length ? changed.length + ' changed: ' + changed.join(', ') : 'Traits match ' + (latest ? 'the last run' : 'the original')}{conditionsChanged ? ' · Test conditions changed' : ''}</div><p className="small dim">Try changing one trait at a time.</p><div className="row"><button className="btn" disabled={running || busy} onClick={() => { setSetup(cleanSetup(original)); setNotice('Original traits restored.'); }}>Reset to original</button>{latest && <button className="btn btn-ghost" disabled={running || busy} onClick={() => setSetup(cleanSetup(latest))}>Use last run’s traits</button>}</div></section>
        <section className="dna-controls" aria-label="Trait controls"><div className="dna-panel-label">02 / CHANGE ONE TRAIT</div><fieldset disabled={running || busy}><legend className="sr-only">Fictional trait blocks</legend>{(Object.keys(TRAITS) as (keyof Traits)[]).map(k => <label key={k} className="dna-trait"><span><strong>{TRAITS[k].label}</strong><output>{setup.traits[k].toFixed(1)}×</output></span><input aria-label={TRAITS[k].label} type="range" min={TRAITS[k].min} max={TRAITS[k].max} step={TRAITS[k].step} value={setup.traits[k]} onChange={e => { setSetup({ ...setup, traits: { ...setup.traits, [k]: Number(e.target.value) } }); sfx.tap(profile.soundOn); }}/><small>{TRAITS[k].effect}</small></label>)}<div className="dna-appearance"><label>Color<select aria-label="Color" value={setup.appearance.color} onChange={e => setSetup({ ...setup, appearance: { ...setup.appearance, color: e.target.value as Setup['appearance']['color'] } })}>{COLORS.map(c => <option key={c} value={c}>{c === 'sample' ? 'Original sample' : c}</option>)}</select></label><label>Pattern<select aria-label="Pattern" value={setup.appearance.pattern} onChange={e => setSetup({ ...setup, appearance: { ...setup.appearance, pattern: e.target.value as Setup['appearance']['pattern'] } })}>{PATTERNS.map(p => <option key={p}>{p}</option>)}</select></label></div><small>Color and pattern decorate your dinosaur.</small></fieldset></section>
        <section className="dna-test-controls" aria-label="Experiment controls"><div className="dna-panel-label">03 / RUN YOUR EXPERIMENT</div><fieldset disabled={running || busy}><legend className="sr-only">Choose an experiment</legend><div className="dna-test-tabs">{(['dash','balance'] as const).map(experiment => <button key={experiment} className={'btn ' + (conditions.experiment === experiment ? 'selected' : '')} aria-pressed={conditions.experiment === experiment} onClick={() => { setConditions({ ...conditions, experiment }); setAnimation(null); setProgress(0); }}>{experiment === 'dash' ? 'Dino Dash' : 'Balance Lab'}</button>)}</div>{conditions.experiment === 'dash' ? <label>Track conditions<select aria-label="Track conditions" value={conditions.track} onChange={e => setConditions({ ...conditions, track: e.target.value as Conditions['track'] })}><option value="smooth">Smooth track</option><option value="grippy">Grippy track</option><option value="hurdles">Three soft hurdles</option></select></label> : <label>Turn sharpness<select aria-label="Turn sharpness" value={conditions.turn} onChange={e => setConditions({ ...conditions, turn: e.target.value as Conditions['turn'] })}><option value="gentle">Gentle bend</option><option value="medium">Medium bend</option><option value="sharp">Sharp bend</option></select></label>}<label className="dna-prediction">What do you think will happen? <small>Optional · No score</small><input value={prediction} maxLength={80} placeholder="I think…" onChange={e => setPrediction(e.target.value)}/></label><button className="btn dna-run-btn" onClick={runExperiment}>▶ Run your experiment</button></fieldset>{running && <p className="small">Experiment running…</p>}</section>
      </>}
      <section className="dna-comparisons" aria-label="Experiment comparisons"><div className="dna-panel-label">04 / WHAT CHANGED?</div>{latest && !running ? <><div className="dna-results"><ResultCard label="Current run" run={latest}/>{runs.slice(0,-1).reverse().find(r => r.conditions.experiment === latest.conditions.experiment) && <ResultCard label="Previous run" run={runs.slice(0,-1).reverse().find(r => r.conditions.experiment === latest.conditions.experiment)!}/>}<ResultCard label="Original · same test" run={simulate(species, { ...originalSetup(), ...(latest.hybrid ? { hybrid:latest.hybrid } : {}) }, latest.conditions)}/></div><p className="small">{latest.result.explanation}</p>{runs.slice(0,-1).reverse().find(r => r.conditions.experiment === latest.conditions.experiment) && <p className="small dim">Compare the track or bend labels too. Different conditions can change the result.</p>}</> : <p className="dim small">{running ? 'Watching the experiment. Results appear when it finishes.' : 'Run a test to compare your invention with its original.'}</p>}</section>
    </div>
    <section className="dna-notebook" aria-label="Experiment notebook"><div className="dna-panel-label">YOUR EXPERIMENT NOTEBOOK <span>{notebook.creations.length} / {MAX_CREATIONS}</span></div><p className="small">Name and save a creation. It stays separate from your dinosaur collection.</p>{species && <div className="dna-save-row"><label>Creation name<input value={name} maxLength={40} disabled={busy || running} onChange={e => setName(e.target.value)}/></label><button className="btn btn-primary" disabled={!readyToSave || running || busy || (!editing && notebook.creations.length >= MAX_CREATIONS)} onClick={() => void saveCreation()}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save creation'}</button></div>}{species && !readyToSave && <p className="small dim">Run this setup before saving it.</p>}<div className="dna-saved-grid">{notebook.creations.map(c => <article key={c.id} className="dna-saved"><Preview species={c.speciesId} setup={c}/><h2>{c.name}</h2><p className="small dim">{hybridLabel(c.speciesId, c.hybrid)} · {summary(c.runs[c.runs.length - 1]!)}</p><div><button className="btn" disabled={running || busy || (!profile.hatched.includes(c.speciesId) || !!c.hybrid && !profile.hatched.includes(c.hybrid.donorSpeciesId))} onClick={() => open(c)}>Reopen {c.name}</button><button className="btn" disabled={running || busy || notebook.creations.length >= MAX_CREATIONS} onClick={async () => { try { const copy = { ...c, id: uid(), name: (c.name.slice(0, 33) + ' copy') }; await commit(putCreation(notebook, profile.hatched, copy), 'Copy saved. Reopen it to experiment.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not copy.'); } }}>Duplicate {c.name}</button><button className="btn" disabled={busy} onClick={() => download(c)}>{c.hybrid ? 'Export hybrid' : 'Export dinosaur'}</button>{c.hybrid && <button className="btn" disabled={busy} onClick={() => download(c, true)}>Export Battle prompt</button>}<button className="btn btn-ghost" disabled={busy || running} onClick={() => { setDeleteId(c.id); dialog.current?.showModal(); }}>Delete {c.name}</button></div></article>)}</div>{notebook.creations.length === 0 && <p className="dim small">Your first invention belongs here.</p>}</section>
    <p className="small dim center dna-fiction">This is a pretend dinosaur simulator. Real genetics is much more complex. These experiments are fictional, including tests of flying and sea reptiles.</p>
    <dialog ref={dialog} className="dna-delete-dialog" aria-labelledby="dna-delete-title" onClose={() => setDeleteId(null)}><h2 id="dna-delete-title">Delete this creation?</h2><p>{notebook.creations.find(c => c.id === deleteId)?.name} will leave your notebook.</p><button autoFocus className="btn" onClick={() => dialog.current?.close()}>Keep creation</button><button className="btn" disabled={busy} onClick={async () => { if (deleteId && await commit(deleteCreation(notebook, deleteId), 'Creation deleted.')) { if (editing === deleteId) setEditing(null); dialog.current?.close(); } }}>Yes, delete creation</button></dialog>
  </div>;
}
