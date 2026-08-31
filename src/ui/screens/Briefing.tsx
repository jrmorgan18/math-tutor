import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { buildSession, estimateMinutes } from '../../engine/scheduler';
import { getSkill } from '../../engine/skills';

/**
 * The mission briefing shown before a session starts.
 *
 * Purely presentational — no engine state changes here, `buildSession` is
 * only previewed (the real plan for `beginSession` is built fresh with its
 * own random seed when he actually taps through, same as Home's preview).
 * The point is entirely about framing: naming what today's expedition is
 * *for* before he's in the middle of it, the way a real mission briefing
 * would.
 */
const BRIEFING_LINES = [
  'Dr. {name}, the lab needs fresh samples today.',
  'Suit up, Dr. {name} — the excavation site is waiting.',
  'New readings just came in. Let’s get to work, Dr. {name}.',
  'The sequencer is primed. Time to earn some DNA, Dr. {name}.',
  'Dr. {name}, today’s expedition has a few tricky specimens on it.',
  'Ready when you are, Dr. {name}. The dig site won’t excavate itself.',
];

export function Briefing() {
  const profile = useStore((s) => s.profile);
  const beginSession = useStore((s) => s.beginSession);
  const setScreen = useStore((s) => s.setScreen);
  const selectedMission = useStore((s) => s.selectedMission);

  const plan = useMemo(
    () =>
      profile
        ? buildSession(profile.skillStates, Date.now(), 1, {
            focusStrand: selectedMission?.strand,
            includeBoss: (profile.sessionsCompleted + 1) % 3 === 0,
          })
        : [],
    [profile, selectedMission],
  );
  // A fresh line each visit is more alive than a fixed one — this is UI
  // flavor text, not engine content, so plain Math.random is fine here.
  const line = useMemo(
    () => BRIEFING_LINES[Math.floor(Math.random() * BRIEFING_LINES.length)] ?? BRIEFING_LINES[0],
    [],
  );

  if (!profile) return null;

  const minutes = estimateMinutes(plan);
  const focus = [
    ...new Set(
      plan.filter((p) => p.slot === 'working' || p.slot === 'new').map((p) => p.skillId),
    ),
  ]
    .slice(0, 4)
    .map((id) => getSkill(id).labName);
  const stretchCount = plan.filter((p) => p.slot === 'stretch').length;

  return (
    <div className="app">
      <div className="spacer" />
      <div className="center" style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 60 }}>{profile.avatar}</div>
        <h2>{(line ?? '').replace('{name}', profile.name)}</h2>
      </div>

      <div className="card">
        <h3>{selectedMission?.title ?? 'Today’s targets'}</h3>
        {selectedMission ? (
          <p className="small dim" style={{ marginTop: 0 }}>
            {selectedMission.description}
          </p>
        ) : null}
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {focus.map((f) => (
            <li key={f} className="small" style={{ marginBottom: 6 }}>
              {f}
            </li>
          ))}
        </ul>
        {stretchCount > 0 ? (
          <p className="small dim" style={{ marginTop: 10, marginBottom: 0 }}>
            Plus {stretchCount} research challenge{stretchCount > 1 ? 's' : ''} — those
            are meant to be hard.
          </p>
        ) : null}
      </div>

      <p className="small dim center">
        {plan.length} questions · about {minutes} minutes
      </p>

      <div className="spacer" />
      <button
        className="btn btn-primary btn-wide btn-lg"
        style={{ marginBottom: 10 }}
        onClick={beginSession}
      >
        Begin expedition
      </button>
      <button
        className="btn btn-ghost btn-wide"
        style={{ marginBottom: 14 }}
        onClick={() => setScreen('home')}
      >
        Not yet
      </button>
    </div>
  );
}
