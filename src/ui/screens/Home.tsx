import { useEffect, useState } from 'react';
import { hasPlayAccess } from '../../play/paddock';
import { useStore, DAILY_DNA_CAP } from '../../store/useStore';
import {
  buildMissionChoices,
  buildSession,
  estimateMinutes,
} from '../../engine/scheduler';
import { dinoById, gateLabel, nextTarget } from '../../content/dinosaurs';
import { getSkill } from '../../engine/skills';
import { todayKey } from '../../store/db';
import { ExpeditionCard } from '../components/ExpeditionCard';
import { Discoveries } from '../components/Discoveries';

/**
 * Pick a stable "today's fact" from his hatched collection — stable within a
 * day (and across re-renders as DNA ticks up), but different once he hatches
 * something new or a new day starts. A cheap string hash rather than
 * Math.random() so it doesn't reshuffle on every render.
 */
function dailyFactIndex(seed: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % count;
}

export function Home() {
  const [day, setDay] = useState(todayKey());
  useEffect(() => {
    const timer = window.setInterval(() => setDay(todayKey()), 10_000);
    const refresh = () => setDay(todayKey());
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const profile = useStore((s) => s.profile);
  const setScreen = useStore((s) => s.setScreen);
  const chooseMission = useStore((s) => s.chooseMission);
  const isProficient = useStore((s) => s.isProficient);
  if (!profile) return null;

  const missionSeed = dailyFactIndex(todayKey(), 2 ** 30);
  const missions = buildMissionChoices(profile.skillStates, Date.now(), missionSeed);
  const bossToday = (profile.sessionsCompleted + 1) % 3 === 0;
  const missionPlans = missions.map((mission, i) =>
    buildSession(profile.skillStates, Date.now(), missionSeed + i + 1, {
      focusStrand: mission.strand,
      includeBoss: bossToday,
    }),
  );
  const doneToday = profile.lastSessionDay === todayKey();

  const suggestion = nextTarget(profile.hatched, isProficient);
  const active = profile.sequencing ? dinoById(profile.sequencing.dinoId) : null;

  // Show a progress card whenever there is *something* he can work toward,
  // whether or not sequencing has formally started. An unlocked target with no
  // card would leave the home screen with nothing to aim at.
  const target = active
    ? { dino: active, progress: profile.sequencing?.progress ?? 0 }
    : suggestion?.unlocked
      ? { dino: suggestion.dino, progress: 0 }
      : null;

  const dnaLeftToday =
    profile.dailyDnaDay === todayKey()
      ? Math.max(0, DAILY_DNA_CAP - profile.dailyDna)
      : DAILY_DNA_CAP;

  const factDino =
    profile.hatched.length > 0
      ? dinoById(
          profile.hatched[
            dailyFactIndex(`${todayKey()}-${profile.hatched.length}`, profile.hatched.length)
          ] as string,
        )
      : null;

  return (
    <div className="app">
      <div className="topbar">
        <div className="row">
          <span style={{ fontSize: 30 }}>{profile.avatar}</span>
          <div>
            <h1 style={{ fontSize: 24 }}>Genesis Lab</h1>
            <div className="small dim">Dr. {profile.name}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="pill">🔥 {profile.streakDays}</div>
          {/* Lifetime fragments collected. A number that only ever goes up is
              the motivating one; the spendable pool is an implementation
              detail he should never have to reason about. */}
          <div className="pill">🧬 {profile.totalDna}</div>
          <div className="pill">🔬 {profile.labLevel}</div>
        </div>
      </div>

      {/* ---------------------------------------- this week's expedition */}
      <ExpeditionCard expedition={profile.expedition} />

      {/* ------------------------------------------- sequencing target */}
      {target ? (
        <div className="card">
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="row">
              <span style={{ fontSize: 34 }}>{target.dino.glyph}</span>
              <div>
                <div style={{ fontWeight: 700 }}>{target.dino.name}</div>
                <div className="small dim mono">
                  {target.progress} / {target.dino.cost} fragments
                </div>
              </div>
            </div>
          </div>
          <div className="bar">
            <div
              className="bar-fill"
              style={{
                width: `${Math.min(100, (target.progress / target.dino.cost) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : suggestion && !suggestion.unlocked ? (
        <div className="card">
          <h3>Next genome</h3>
          <div className="row">
            <span style={{ fontSize: 34, filter: 'grayscale(1) brightness(0.5)' }}>
              {suggestion.dino.glyph}
            </span>
            <div>
              <div style={{ fontWeight: 700 }}>{suggestion.dino.name}</div>
              <div className="small dim">
                Locked until you are confident with{' '}
                <strong>
                  {gateLabel(suggestion.dino, (id) => getSkill(id).labName)}
                </strong>
                .
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ today's work */}
      <div className="card">
        <h3>Today’s expedition</h3>
        <p className="small dim" style={{ marginBottom: 12 }}>
          Choose which problem the lab tackles. Both missions still include review
          from other strands.
        </p>
        <div className="mission-grid">
          {missions.map((mission, i) => {
            const plan = missionPlans[i] ?? [];
            return (
              <button
                key={mission.id}
                className="mission-choice"
                onClick={() => chooseMission(mission)}
              >
                <strong>{mission.title}</strong>
                <span>{mission.description}</span>
                <small>
                  {plan.length} questions · about {estimateMinutes(plan)} minutes
                  {plan.some((item) => item.slot === 'boss') ? ' · boss investigation' : ''}
                </small>
              </button>
            );
          })}
        </div>
        {doneToday ? (
          <p className="small dim center" style={{ margin: '10px 0 0' }}>
            You have already done today’s work. {dnaLeftToday > 0
              ? `${dnaLeftToday} DNA fragments remain today.`
              : 'The DNA tanks are full, so extra research now unlocks field notes, lab upgrades, and badges.'}
          </p>
        ) : null}
      </div>

      <Discoveries ids={profile.discoveries} labLevel={profile.labLevel} />

      <section className="card paddock-entry" aria-label="Dinosaur playground">
        <div className="row between"><h2>🌿 Paddock</h2><span className="pill">{hasPlayAccess(profile, day) ? 'Open today' : 'Locked today'}</span></div>
        <p className="small dim">{hasPlayAccess(profile, day) ? 'Your dinosaurs are ready to play. Bring a ball, share a snack, take a photo.' : 'Finish today’s expedition to play with your dinosaurs.'}</p>
        <button className="btn btn-primary btn-wide" disabled={!hasPlayAccess(profile, day)} onClick={() => setScreen('paddock')}>Enter the Paddock</button>
      </section>

      {/* -------------------------------------------------- field notes */}
      {factDino ? (
        <div className="card">
          <h3>Today’s dinosaur fact</h3>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span style={{ fontSize: 28 }}>{factDino.glyph}</span>
            <p className="small dim" style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text)' }}>{factDino.name}:</strong>{' '}
              {factDino.fact}
            </p>
          </div>
        </div>
      ) : null}

      <div className="spacer" />

      <div className="row" style={{ gap: 10, marginBottom: 14 }}>
        <button className="btn grow" onClick={() => setScreen('collection')}>
          🦕 Collection ({profile.hatched.length})
        </button>
        <button className="btn" onClick={() => setScreen('parent')}>
          ⚙️
        </button>
      </div>
    </div>
  );
}
