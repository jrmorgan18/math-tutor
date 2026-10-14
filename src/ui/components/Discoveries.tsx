import { useRef, useState } from 'react';
import { discoveryById } from '../../content/discoveries';

export function Discoveries({ ids, labLevel }: { ids: string[]; labLevel: number }) {
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const itemFor = (id: string) => discoveryById(id) ?? {
    id, glyph: '🔬', title: 'Saved discovery', text: `This earned discovery (${id}) is saved in your collection. Its field note is unavailable in this version.`,
  };
  const selectedItem = selected ? itemFor(selected) : null;
  return (
    <section className="card" aria-label="Earned discoveries">
      <h3>{all ? 'All discoveries' : `Earned discoveries · Level ${labLevel}`}</h3>
      <p className="small dim">Your rewards stay here. Tap a discovery to read its full field note.</p>
      {ids.length === 0 ? <p>Your collection is waiting for its first discovery.</p> : (
        <div className="discovery-row">
          {(all ? ids : ids.slice(-3)).map((id, i) => {
            const item = itemFor(id);
            return <button className="discovery-chip" key={`${id}-${i}`} onClick={() => {
              setSelected(id);
              dialog.current?.showModal();
            }} aria-haspopup="dialog"><span>{item.glyph}</span><small>{item.title}</small></button>;
          })}
        </div>
      )}
      <button className="btn btn-ghost" onClick={() => setAll(!all)}>
        {all ? '‹ Back to recent discoveries' : `All discoveries (${ids.length})`}
      </button>
      <dialog ref={dialog} className="discovery-detail" aria-labelledby="discovery-title" onClose={() => setSelected(null)}>
        <h2 id="discovery-title">{selectedItem?.glyph} {selectedItem?.title}</h2>
        <p>{selectedItem?.text}</p>
        <button className="btn btn-primary" autoFocus onClick={() => dialog.current?.close()}>Close discovery</button>
      </dialog>
    </section>
  );
}
