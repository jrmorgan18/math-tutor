import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { DINOSAURS, gateLabel, isGateOpen, type Dinosaur } from '../../content/dinosaurs';
import { getSkill } from '../../engine/skills';

/**
 * The collection screen.
 *
 * Locked species are shown as greyed silhouettes *with their requirement
 * spelled out*, not hidden. Seeing "Spinosaurus — locked until you are
 * confident with Feeding Time (division)" is the whole motivational engine:
 * the reward for learning division is visible weeks before he can claim it.
 */
export function Paddock() {
  const profile = useStore((s) => s.profile);
  const setScreen = useStore((s) => s.setScreen);
  const setTarget = useStore((s) => s.setSequencingTarget);
  const isProficient = useStore((s) => s.isProficient);
  const [open, setOpen] = useState<Dinosaur | null>(null);

  if (!profile) return null;

  const gateOpen = (d: Dinosaur) => isGateOpen(d, profile.hatched, isProficient);
  const requirement = (d: Dinosaur) => gateLabel(d, (id) => getSkill(id).labName);

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn btn-ghost" style={{ minHeight: 44, padding: '0 12px' }} onClick={() => setScreen('home')}>
          ‹ Back
        </button>
        <div className="pill">
          {profile.hatched.length} / {DINOSAURS.length}
        </div>
      </div>

      <h2>Paddock</h2>
      <p className="small dim" style={{ marginBottom: 16 }}>
        Each genome needs a different skill before the sequencer will accept it.
        DNA alone is never enough.
      </p>

      <div className="dino-grid" style={{ paddingBottom: 20 }}>
        {DINOSAURS.map((d) => {
          const hatched = profile.hatched.includes(d.id);
          const unlocked = gateOpen(d);
          const cls = hatched ? 'dino hatched' : unlocked ? 'dino' : 'dino locked';
          return (
            <button key={d.id} className={cls} onClick={() => setOpen(d)}>
              <div className="dino-glyph">{hatched ? d.glyph : unlocked ? d.glyph : '🥚'}</div>
              <div className="dino-name">{hatched ? d.name : unlocked ? d.name : '???'}</div>
              <div className="dino-gate">
                {hatched
                  ? 'Sequenced'
                  : unlocked
                    ? `${d.cost} fragments — ready`
                    : `Needs ${requirement(d)}`}
              </div>
            </button>
          );
        })}
      </div>

      {open ? (
        <div className="celebrate" onClick={() => setOpen(null)}>
          <div className="celebrate-card" onClick={(e) => e.stopPropagation()}>
            <div className="celebrate-glyph">
              {profile.hatched.includes(open.id) || gateOpen(open) ? open.glyph : '🥚'}
            </div>
            <h2 style={{ marginTop: 10 }}>
              {profile.hatched.includes(open.id) || gateOpen(open) ? open.name : 'Unidentified genome'}
            </h2>

            {profile.hatched.includes(open.id) ? (
              <>
                <div className="small dim" style={{ marginBottom: 12 }}>
                  {open.say} · {open.period} · {open.diet} · {open.length}
                </div>
                <p className="small" style={{ textAlign: 'left' }}>
                  {open.fact}
                </p>
              </>
            ) : gateOpen(open) ? (
              <>
                <p className="small dim">
                  Ready to sequence. Needs {open.cost} DNA fragments.
                </p>
                <button
                  className="btn btn-primary btn-wide"
                  onClick={() => {
                    setTarget(open.id);
                    setOpen(null);
                  }}
                >
                  Sequence this one next
                </button>
              </>
            ) : (
              <p className="small dim">
                Locked. The sequencer will not accept this genome until you are
                confident with <strong>{requirement(open)}</strong>.
              </p>
            )}

            <button className="btn btn-ghost btn-wide" style={{ marginTop: 12 }} onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
