import { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { dinoById } from '../../content/dinosaurs';
import { sfx } from '../audio';
import { speak } from '../tts';

/** The hatch moment. This is the payoff the whole reward economy points at. */
export function Celebration() {
  const celebrating = useStore((s) => s.celebrating);
  const dismiss = useStore((s) => s.dismissCelebration);
  const profile = useStore((s) => s.profile);

  const dino = celebrating ? dinoById(celebrating) : null;

  useEffect(() => {
    if (!dino || !profile) return;
    sfx.hatch(profile.soundOn);
    // Say the name — half the fun of dinosaurs is the words.
    speak(`${dino.name}. ${dino.fact}`, profile.readAloud);
  }, [dino?.id, profile?.soundOn, profile?.readAloud, dino, profile]);

  if (!dino) return null;

  return (
    <div className="celebrate" onClick={dismiss}>
      <div className="celebrate-card" onClick={(e) => e.stopPropagation()}>
        <div className="small dim" style={{ letterSpacing: '0.14em' }}>
          GENOME COMPLETE
        </div>
        <div className="celebrate-glyph">{dino.glyph}</div>
        <h2 style={{ marginBottom: 2 }}>{dino.name}</h2>
        <div className="small dim" style={{ marginBottom: 14 }}>
          {dino.say}
        </div>
        <div className="small dim" style={{ marginBottom: 12 }}>
          {dino.period} · {dino.diet} · {dino.length}
        </div>
        <p className="small" style={{ textAlign: 'left', marginBottom: 18 }}>
          {dino.fact}
        </p>
        <button className="btn btn-primary btn-wide btn-lg" onClick={dismiss}>
          Add to paddock
        </button>
      </div>
    </div>
  );
}
