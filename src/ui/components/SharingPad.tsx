import { useRef, useState } from 'react';
import { sharingAnswer } from '../../engine/answerEntry';
import type { Representation } from '../../engine/types';
import { sfx } from '../audio';

export function SharingPad({ representation: r, disabled, soundOn, onSubmit }: {
  representation: Extract<Representation, { kind: 'sharing' }>;
  disabled: boolean;
  soundOn: boolean;
  onSubmit: (value: string) => void;
}) {
  const [counts, setCounts] = useState<number[]>(() => Array(r.nests).fill(0));
  const current = useRef(counts);
  const left = r.total - counts.reduce((sum, count) => sum + count, 0);
  const answer = sharingAnswer(counts, r.total, r.ask);
  const move = (index: number, delta: number) => {
    if (disabled) return;
    const values = current.current;
    const remaining = r.total - values.reduce((sum, count) => sum + count, 0);
    if ((delta > 0 && remaining === 0) || (delta < 0 && values[index] === 0)) return;
    const next = values.map((count, i) => i === index ? count + delta : count);
    current.current = next; setCounts(next); sfx.tap(soundOn);
  };
  const shareRound = () => {
    const values = current.current;
    if (disabled || r.total - values.reduce((sum, count) => sum + count, 0) < r.nests) return;
    const next = values.map(count => count + 1);
    current.current = next; setCounts(next); sfx.tap(soundOn);
  };
  return <div className="sharing-pad">
    <p className="small">Tap a nest to give it an egg. Make the nests equal, using as many eggs as you can.</p>
    <div className="sharing-basket" aria-live="polite"><strong>{left} eggs left aside</strong></div>
    <button className="btn btn-wide" style={{ marginTop: 10 }} disabled={disabled || left < r.nests}
      onClick={shareRound}>Give each nest one egg</button>
    <div className="sharing-nests">
      {counts.map((count, index) => <div className="sharing-nest" key={index}>
        <button className="sharing-deal" disabled={disabled || left === 0}
          aria-label={`Give an egg to nest ${index + 1}`} onClick={() => move(index, 1)}>
          <span>Nest {index + 1}</span>
          {r.showEggs ? <span className="sharing-eggs" aria-hidden="true">{count ? '🥚'.repeat(count) : '＋'}</span> : null}
          <strong>{count} eggs</strong>
        </button>
        <button className="btn btn-ghost small" disabled={disabled || count === 0}
          aria-label={`Take an egg from nest ${index + 1}`} onClick={() => move(index, -1)}>Take one back</button>
      </div>)}
    </div>
    <p className="small" aria-live="polite">{answer === null ? 'Give every nest the same number before checking.' :
      `${counts[0]} in each nest · ${left} left over. Is the sharing finished?`}</p>
    <button className="btn btn-primary btn-wide" disabled={disabled || answer === null}
      onClick={() => { const value = sharingAnswer(current.current, r.total, r.ask); if (value !== null) onSubmit(value); }}>
      Check my sharing
    </button>
  </div>;
}
