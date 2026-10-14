import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { useStore } from '../../store/useStore';
import { todayKey } from '../../store/db';
import { dinoById } from '../../content/dinosaurs';
import { addPhoto, bringDinosaur, clampPoint, deletePhoto, earnedDinosaurs, hasPlayAccess, MAX_DINOS, MAX_PHOTOS, moveResident, placeToy, stepHabitat, type PaddockState, type Point, type ToyKind } from '../../play/paddock';
import { DinosaurArt, Landscape, ToyArt } from '../components/HabitatArt';

const TOYS: { kind: ToyKind; label: string; icon: string }[] = [
  { kind: 'food', label: 'Food', icon: '🥬' }, { kind: 'ball', label: 'Ball', icon: '⚽' }, { kind: 'brush', label: 'Brush', icon: '🪮' },
];
const isToy = (id: string): id is ToyKind => TOYS.some(t => t.kind === id);

async function captureHabitat(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Freeze what is actually drawn, including an animal midway through a step.
  const originals = svg.querySelectorAll<SVGElement>('.habitat-resident, .dinosaur-art');
  clone.querySelectorAll<SVGElement>('.habitat-resident, .dinosaur-art').forEach((el, i) => {
    const original = originals[i];
    if (original) el.style.transform = getComputedStyle(original).transform;
  });
  clone.querySelectorAll('[data-ui]').forEach(el => el.remove());
  clone.querySelectorAll('[style]').forEach(el => { (el as SVGElement).style.transition = 'none'; (el as SVGElement).style.animation = 'none'; });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '1000'); clone.setAttribute('height', '600');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not take this photo. Try again.')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 480;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photos are unavailable in this browser.');
    context.drawImage(image, 0, 0, 800, 480);
    return canvas.toDataURL('image/jpeg', .78);
  } finally { URL.revokeObjectURL(url); }
}

export function Paddock() {
  const profile = useStore(s => s.profile);
  const setScreen = useStore(s => s.setScreen);
  const save = useStore(s => s.savePaddock);
  // Admission lasts until leaving the screen, including across midnight.
  const [admitted] = useState(() => !!profile && hasPlayAccess(profile, todayKey()));
  const [habitat, setHabitat] = useState<PaddockState>(() => profile ? { ...profile.paddock, residents: profile.paddock.residents.filter(r => profile.hatched.includes(r.id)) } : { residents: [], toys: [], photos: [] });
  const state = useRef(habitat);
  const [selected, select] = useState<string | null>(null);
  const [notice, setNotice] = useState('Everyone is happy. Let’s play!');
  const [busy, setBusy] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState('');
  const scene = useRef<SVGSVGElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const gesture = useRef<{ pointer: number; entity: string | null; start: Point; before: PaddockState; moved: boolean } | null>(null);
  const cursor = useRef<Point>({ x: 500, y: 380 });
  const mounted = useRef(true);
  const paused = useRef(false);
  paused.current = busy || photoId !== null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function display(next: PaddockState) { state.current = next; setHabitat(next); }
  async function commit(next: PaddockState, message?: string): Promise<boolean> {
    display(next);
    try { await save(next); if (message && mounted.current) setNotice(message); return true; }
    catch {
      if (mounted.current) { display(useStore.getState().profile?.paddock ?? next); setNotice('The device could not save. Free some storage and try again. Your saved photos are safe.'); }
      return false;
    }
  }
  useEffect(() => {
    if (!admitted) return;
    let beat = 0;
    const timer = window.setInterval(() => {
      if (document.hidden || gesture.current || paused.current) return;
      const next = stepHabitat(state.current, ++beat);
      if (next !== state.current) void commit(next);
    }, 1000);
    return () => clearInterval(timer);
    // Simulation reads refs so a render never restarts an animal's behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admitted]);

  function move(id: string, p: Point, source = state.current): PaddockState {
    return isToy(id) ? { ...source, toys: source.toys.map(t => t.kind === id ? { ...t, ...clampPoint(p) } : t) } : moveResident(source, id, p);
  }
  function place(p: Point) {
    if (!selected || !profile) return;
    let next = state.current;
    if (selected.startsWith('add:')) {
      const id = selected.slice(4);
      next = bringDinosaur(next, profile.hatched, id, p);
      select(id); setNotice(`${dinoById(id)?.name} says hello!`);
    } else if (isToy(selected)) next = placeToy(next, selected, p);
    else next = moveResident(next, selected, p);
    void commit(next);
  }
  function point(event: PointerEvent<SVGSVGElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return clampPoint({ x: (event.clientX - rect.left) / rect.width * 1000, y: (event.clientY - rect.top) / rect.height * 600 });
  }
  function down(event: PointerEvent<SVGSVGElement>) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    const entity = (event.target as Element).closest('[data-entity]')?.getAttribute('data-entity') ?? null;
    gesture.current = { pointer: event.pointerId, entity, start: point(event), before: state.current, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function drag(event: PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    const p = point(event);
    if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > 8) g.moved = true;
    if (g.moved && g.entity) display(move(g.entity, p));
  }
  function up(event: PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    gesture.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const p = point(event); cursor.current = p;
    if (g.moved && g.entity) {
      select(g.entity);
      void commit(isToy(g.entity) ? placeToy(state.current, g.entity, p) : moveResident(state.current, g.entity, p));
    } else if (g.entity) {
      // Touch browsers may snap a nearby tap onto an animal's large target.
      // A chosen toy still lands there, rather than silently changing selection.
      if (selected && isToy(selected)) void commit(placeToy(state.current, selected, p), selected === 'brush' ? 'A happy dinosaur! ♥' : undefined);
      else { select(g.entity); setNotice('Selected! Tap a new spot or drag to move.'); }
    } else place(p);
  }
  function cancel(event: PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (g?.pointer === event.pointerId) { gesture.current = null; display(g.before); }
  }
  function keyboard(event: KeyboardEvent<SVGElement>, id?: string) {
    if (event.key === 'Escape') { select(null); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (id && selected && isToy(selected) && !isToy(id)) {
        const resident = state.current.residents.find(r => r.id === id);
        if (resident) void commit(placeToy(state.current, selected, resident), selected === 'brush' ? 'A happy dinosaur! ♥' : undefined);
      } else if (id) select(id); else place(cursor.current);
      return;
    }
    const delta = ({ ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] } as Record<string, number[]>)[event.key];
    if (!delta) return;
    event.preventDefault(); event.stopPropagation();
    const target = id ? state.current.residents.find(r => r.id === id) ?? state.current.toys.find(t => t.kind === id) : cursor.current;
    if (!target) return;
    const p = clampPoint({ x: target.x + delta[0]!, y: target.y + delta[1]! }); cursor.current = p;
    if (id) { select(id); void commit(isToy(id) ? placeToy(state.current, id, p) : moveResident(state.current, id, p)); }
    else { setNotice(`Placement spot: ${Math.round(p.x / 10)}% across, ${Math.round(p.y / 6)}% down. Press Enter to place.`); }
  }
  async function takePhoto() {
    if (!scene.current || busy) return;
    setBusy(true);
    try {
      const image = await captureHabitat(scene.current);
      const id = globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const next = addPhoto(state.current, { id, at: Date.now(), title: 'A day in the Paddock', image });
      await commit(next, 'Photo saved in your scrapbook!');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not take a photo. Try again.'); }
    finally { setBusy(false); }
  }
  const photo = habitat.photos.find(p => p.id === photoId);
  if (!profile) return null;
  if (!admitted) return <div className="app"><div className="topbar"><button className="btn" onClick={() => setScreen('home')}>‹ Return to lab</button></div><h1>🌿 Paddock</h1><p>Finish today’s expedition to play with your dinosaurs.</p><button className="btn" onClick={() => setScreen('collection')}>View dinosaur collection</button></div>;
  const earned = earnedDinosaurs(profile.hatched);
  const selectedName = selected?.startsWith('add:') ? dinoById(selected.slice(4))?.name : selected && isToy(selected) ? TOYS.find(t => t.kind === selected)?.label : selected ? dinoById(selected)?.name : null;
  return <div className="app paddock-app">
    <header className="topbar"><button className="btn btn-ghost" onClick={() => setScreen('home')}>‹ Return to lab</button><span className="pill">Free play · Open today</span></header>
    <div className="row between paddock-heading"><div><h1>🌿 The Paddock</h1><p className="small dim">A little world for your dinosaurs.</p></div><button className="btn" onClick={() => setScreen('collection')}>Collection</button></div>
    <div className="paddock-workspace"><div className="paddock-world">
    <section className="habitat-shell" aria-label="Dinosaur habitat">
      <svg ref={scene} viewBox="0 0 1000 600" className="habitat" role="group" aria-label="Habitat. Select a dinosaur or toy, then tap to place. Arrow keys move the placement spot; Enter places." tabIndex={0}
        onPointerDown={down} onPointerMove={drag} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={e => keyboard(e)}>
        <Landscape/>
        {habitat.toys.map(t => <g key={t.kind} transform={`translate(${t.x} ${t.y})`} data-entity={t.kind} role="button" tabIndex={0} aria-label={`${t.kind} in habitat`} onKeyDown={e => { e.stopPropagation(); keyboard(e, t.kind); }}>
          <circle r="35" fill="transparent"/>{selected === t.kind && <circle data-ui="selection" r="32" fill="none" stroke="#fff9cf" strokeWidth="4" strokeDasharray="7 4"/>}<ToyArt kind={t.kind} active={t.active}/>
        </g>)}
        {habitat.residents.filter(r => profile.hatched.includes(r.id)).map(r => <g key={r.id} data-entity={r.id} role="button" tabIndex={0} aria-label={`${dinoById(r.id)?.name} in habitat`} style={{ transform: `translate(${r.x}px, ${r.y}px)`, transition: gesture.current ? 'none' : undefined }} className="habitat-resident" onKeyDown={e => { e.stopPropagation(); keyboard(e, r.id); }}>
          <rect x="-80" y="-80" width="160" height="130" rx="20" fill="transparent"/>
          {selected === r.id && <ellipse data-ui="selection" cy="32" rx="60" ry="16" fill="none" stroke="#fff9cf" strokeWidth="4" strokeDasharray="7 4"/>}
          <DinosaurArt id={r.id} happy={r.mood.includes('♥')}/>
          <text y="62" textAnchor="middle" fill="#f6f6dc" fontSize="18" fontFamily="system-ui" stroke="#304b37" strokeWidth="4" paintOrder="stroke">{dinoById(r.id)?.name}</text>
          {selected === r.id && <g data-ui="speech"><rect x="-135" y="-116" width="270" height="30" rx="15" fill="#f4f2d6"/><text y="-96" textAnchor="middle" fill="#314d36" fontFamily="system-ui" fontSize="14">{r.mood}</text></g>}
        </g>)}
      </svg>
      <div className="habitat-caption"><span className="small">{selectedName ? `${selectedName} selected · Tap a spot, or drag.` : 'Choose a dinosaur or a toy.'}</span><span className="small dim">{habitat.residents.length} / {MAX_DINOS} friends</span></div>
    </section>
    <p className="paddock-notice small" role="status" aria-live="polite">{notice}</p>
    </div>
    <div className="paddock-controls">
      <section className="card resident-selector"><h3>Bring a friend</h3><div className="resident-options">
        {earned.map(d => { const present = habitat.residents.some(r => r.id === d.id); const key = present ? d.id : `add:${d.id}`;
          return <button key={d.id} className={`resident-choice ${selected === key ? 'selected' : ''}`} aria-pressed={selected === key} disabled={!present && habitat.residents.length >= MAX_DINOS} onClick={() => { select(key); setNotice(present ? 'Tap a spot to move your friend.' : 'Tap the grass to bring your friend in.'); }}><svg viewBox="-85 -90 170 150" aria-hidden="true"><DinosaurArt id={d.id}/></svg><span>{d.name}</span><small>{present ? 'In habitat' : 'Tap to bring in'}</small></button>;
        })}
      </div>{earned.length === 0 && <p className="small dim">Your first hatched dinosaur will appear here. You can try the toys and take a landscape photo.</p>}
      {selected && !selected.startsWith('add:') && !isToy(selected) && <button className="btn btn-ghost" onClick={() => { void commit({ ...state.current, residents: state.current.residents.filter(r => r.id !== selected) }, 'Your friend is resting happily in the collection.'); select(null); }}>Return selected friend to collection</button>}
      </section>
      <section className="card toy-tray"><h3>Toy tray</h3><div className="toy-options">{TOYS.map(t => <button key={t.kind} className={`btn ${selected === t.kind ? 'selected' : ''}`} aria-pressed={selected === t.kind} onClick={() => { select(t.kind); setNotice(t.kind === 'brush' ? 'Tap a dinosaur to brush, or place the brush nearby.' : `Tap the grass to place the ${t.label.toLowerCase()}.`); }}><span aria-hidden="true">{t.icon}</span>{t.label}</button>)}</div><p className="small dim">Food brings a friend over. Ball starts a chase. Brush makes a happy dinosaur.</p><button className="btn btn-ghost" onClick={() => select(null)}>Done selecting</button></section>
    </div>
    </div>
    <section className="card scrapbook" aria-label="Photo scrapbook"><div className="row between"><div><h2>📷 Scrapbook</h2><span className="small dim">{habitat.photos.length} / {MAX_PHOTOS} photos · Saved on this device</span></div><button className="btn btn-primary" disabled={busy || habitat.photos.length >= MAX_PHOTOS} onClick={() => void takePhoto()}>{busy ? 'Taking photo…' : 'Take photo'}</button></div>
      {habitat.photos.length === 0 ? <p className="small dim">Make a scene you love, then take its first photo.</p> : <div className="photo-gallery">{habitat.photos.map(p => <button className="photo-thumb" key={p.id} aria-haspopup="dialog" onClick={() => { setPhotoId(p.id); setTitle(p.title); setConfirmDelete(false); dialog.current?.showModal(); }}><img src={p.image} alt={p.title}/><span>{p.title}</span></button>)}</div>}
    </section>
    <p className="small dim center">Pretend play, real friends. Dinosaur facts live in your collection.</p>
    <dialog ref={dialog} className="paddock-photo-dialog" aria-labelledby="photo-title" onClose={() => { setPhotoId(null); setConfirmDelete(false); }}>
      <h2 id="photo-title">Your Paddock photo</h2>{photo && <><img className="large-photo" src={photo.image} alt={photo.title}/><label className="small">Photo title<input value={title} maxLength={60} onChange={e => setTitle(e.target.value)} /></label><p className="small dim">{new Date(photo.at).toLocaleDateString()}</p><div className="photo-actions"><button className="btn" disabled={busy} onClick={async () => { setBusy(true); const ok = await commit({ ...state.current, photos: state.current.photos.map(p => p.id === photo.id ? { ...p, title: title.trim() || 'A day in the Paddock' } : p) }, 'Photo title saved.'); setBusy(false); if (ok) dialog.current?.close(); }}>Save title</button><button autoFocus className="btn btn-primary" onClick={() => dialog.current?.close()}>Close photo</button><button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete photo</button></div>{confirmDelete && <div className="delete-photo-confirm"><p>Delete this photo from your scrapbook?</p><button className="btn" onClick={() => setConfirmDelete(false)}>Keep photo</button><button className="btn" disabled={busy} onClick={async () => { setBusy(true); const ok = await commit(deletePhoto(state.current, photo.id), 'Photo deleted.'); setBusy(false); if (ok) dialog.current?.close(); }}>Yes, delete this photo</button></div>}</>}
    </dialog>
  </div>;
}
