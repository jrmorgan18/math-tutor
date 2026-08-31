import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { AnswerPad } from '../components/AnswerPad';
import { ProblemView } from '../components/ProblemView';
import { totalProbeEstimate } from '../../engine/placement';
import { sfx } from '../audio';

/**
 * The clearance test.
 *
 * Deliberately gives no right/wrong feedback. It is a staircase — it *has* to
 * push him until he fails, and telling a six-year-old "wrong" four times in a
 * row at the start of a new app is how you lose him on day one. Framed as
 * calibration, with a progress bar and no scoring, it reads as the machine
 * measuring him rather than him being tested.
 */
export function Placement() {
  const placement = useStore((s) => s.placement);
  const profile = useStore((s) => s.profile);
  const answerPlacement = useStore((s) => s.answerPlacement);
  const reset = useStore((s) => s.reset);
  const [entry, setEntry] = useState('');
  // See the note in Session.tsx: a ref keeps rapid taps from dropping digits.
  const entryRef = useRef('');
  const setEntryBoth = (next: string) => {
    entryRef.current = next;
    setEntry(next);
  };

  const key = `${placement?.asked}-${placement?.problem?.seed}`;
  useEffect(() => {
    entryRef.current = '';
    setEntry('');
  }, [key]);

  if (!placement || !placement.problem || !profile) return null;

  const max = totalProbeEstimate();
  const pct = Math.min(100, (placement.asked / max) * 100);

  const submit = (value: string) => {
    sfx.tap(profile.soundOn);
    answerPlacement(value);
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="grow">
          <div className="small dim" style={{ marginBottom: 6 }}>
            Calibrating · question {placement.asked + 1}
          </div>
          <div className="bar">
            <div className="bar-fill cyan" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <ProblemView
        problem={placement.problem}
        readAloud={profile.readAloud}
        entry={
          placement.problem.representation.kind === 'numeric'
            ? { value: entry, state: 'idle' }
            : null
        }
      />

      <div className="spacer" />

      <p className="small dim center" style={{ marginBottom: 10 }}>
        Some of these are meant to be too hard. Just have a go — a wrong answer
        here helps the machine as much as a right one.
      </p>

      <AnswerPad
        representation={placement.problem.representation}
        value={entry}
        disabled={false}
        soundOn={profile.soundOn}
        reveal={null}
        onDigit={(digit) => setEntryBoth((entryRef.current + digit).slice(0, 4))}
        onBackspace={() => setEntryBoth(entryRef.current.slice(0, -1))}
        onReplace={(next) => setEntryBoth(next.slice(0, 4))}
        onSubmit={submit}
      />

      <button
        className="btn btn-ghost btn-wide small"
        style={{ minHeight: 46 }}
        onClick={() => submit('')}
      >
        I don’t know this one
      </button>

      {/*
        Escape hatch. Settings — and therefore "erase everything" — live behind
        the home screen, so without this a half-finished clearance test is a
        dead end: the only ways out are finishing it or clearing browser
        storage by hand. That matters most for the adult who tried the app
        first and now wants a clean profile for their child. Deliberately small
        and low-contrast, behind a confirm, so it is not a tempting mid-test tap.
      */}
      <button
        className="btn btn-ghost btn-wide small dim"
        style={{ minHeight: 40, marginBottom: 14, fontSize: 14, fontWeight: 400 }}
        onClick={() => {
          if (confirm('Erase this profile and start the clearance test over from the beginning?')) {
            void reset();
          }
        }}
      >
        Not you? Start over
      </button>
    </div>
  );
}
