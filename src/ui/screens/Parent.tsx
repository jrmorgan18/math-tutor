import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { SKILLS, STRAND_NAMES, getSkill } from '../../engine/skills';
import { ERROR_COACHING, ERROR_LABELS } from '../../engine/errors';
import { progressToward } from '../../engine/mastery';
import { AVATAR_OPTIONS, exportAll, importAll } from '../../store/db';
import { buildWeeklyDigest } from '../../llm/weeklySummary';
import type { Attempt, ErrorType, SkillState } from '../../engine/types';

export function Parent() {
  const profile = useStore((s) => s.profile);
  const attempts = useStore((s) => s.attempts);
  const setScreen = useStore((s) => s.setScreen);
  const reset = useStore((s) => s.reset);
  const toggleSound = useStore((s) => s.toggleSound);
  const toggleReadAloud = useStore((s) => s.toggleReadAloud);
  const setAvatar = useStore((s) => s.setAvatar);
  const restoreFromBackup = useStore((s) => s.restoreFromBackup);
  const backupInfo = useStore((s) => s.backupInfo);
  const [tab, setTab] = useState<'progress' | 'struggles' | 'weekly' | 'settings'>('progress');
  const importInputRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<{ at: number; reason: string; name: string } | null>(null);

  // Refreshed whenever the settings tab is opened, so the timestamp shown is
  // never a stale one from before the last export/import.
  useEffect(() => {
    if (tab === 'settings') void backupInfo().then(setBackup);
  }, [tab, backupInfo]);

  /** Error-type tallies over the last 200 attempts — recent, not lifetime. */
  const struggles = useMemo(() => {
    const recent = attempts
      .slice(-200)
      .filter((a) => !a.correct && a.slot !== 'stretch');
    const bySkill = new Map<string, Map<ErrorType, number>>();
    for (const a of recent) {
      const inner = bySkill.get(a.skillId) ?? new Map<ErrorType, number>();
      inner.set(a.errorType, (inner.get(a.errorType) ?? 0) + 1);
      bySkill.set(a.skillId, inner);
    }
    return [...bySkill.entries()]
      .map(([skillId, counts]) => {
        const total = [...counts.values()].reduce((x, y) => x + y, 0);
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        return { skillId, total, topError: top?.[0] ?? 'other', topCount: top?.[1] ?? 0 };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [attempts]);

  const stats = useMemo(() => {
    const totalMs = attempts.reduce((sum, a) => sum + Math.min(a.latencyMs, 60_000), 0);
    const scored = attempts.filter((a) => a.slot !== 'stretch');
    const correct = scored.filter((a) => a.correct).length;
    const stretch = attempts.filter((a) => a.slot === 'stretch');
    const stretchWins = stretch.filter((a) => a.correct).length;
    return {
      attempts: scored.length,
      accuracy: scored.length > 0 ? Math.round((correct / scored.length) * 100) : 0,
      minutes: Math.round(totalMs / 60_000),
      hintRate:
        scored.length > 0
          ? Math.round((scored.filter((a) => a.hintsUsed > 0).length / scored.length) * 100)
          : 0,
      stretchAttempted: stretch.length,
      stretchWins,
    };
  }, [attempts]);

  if (!profile) return null;

  const download = async () => {
    const json = await exportAll();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `genesis-lab-${profile.name}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Restore a backup onto a device that already has a profile — unlike the
   * Welcome-screen version of this, an existing profile here means an import
   * is destructive, so it's confirmed before touching anything.
   */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (
      !confirm(
        'Import this backup? It will replace all progress currently on this device — that cannot be undone.',
      )
    ) {
      return;
    }
    try {
      const text = await file.text();
      await importAll(text);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn btn-ghost" style={{ minHeight: 44, padding: '0 12px' }} onClick={() => setScreen('home')}>
          ‹ Back
        </button>
        <div className="small dim">Parent view</div>
      </div>

      <div className="tabs">
        <button className={tab === 'progress' ? 'tab active' : 'tab'} onClick={() => setTab('progress')}>
          Progress
        </button>
        <button className={tab === 'struggles' ? 'tab active' : 'tab'} onClick={() => setTab('struggles')}>
          Sticking points
        </button>
        <button className={tab === 'weekly' ? 'tab active' : 'tab'} onClick={() => setTab('weekly')}>
          This week
        </button>
        <button className={tab === 'settings' ? 'tab active' : 'tab'} onClick={() => setTab('settings')}>
          Settings
        </button>
      </div>

      {tab === 'weekly' ? (
        <WeeklyTab attempts={attempts} skillStates={profile.skillStates} />
      ) : null}

      {tab === 'progress' ? (
        <>
          <div className="card">
            <div className="row between">
              <Stat label="Sessions" value={String(profile.sessionsCompleted)} />
              <Stat label="Questions" value={String(stats.attempts)} />
              <Stat label="Accuracy" value={`${stats.accuracy}%`} />
              <Stat label="Minutes" value={String(stats.minutes)} />
            </div>
          </div>

          <div className="card">
            <h3>Reaching for hard things</h3>
            <p className="small dim" style={{ margin: 0 }}>
              He has attempted <strong>{stats.stretchAttempted}</strong> stretch
              questions above his level and solved{' '}
              <strong>{stats.stretchWins}</strong>. Misses here are free and are
              excluded from accuracy, combos, mastery, and the rival score.
            </p>
          </div>

          {Object.entries(STRAND_NAMES).map(([strand, label]) => {
            const skills = SKILLS.filter((s) => s.strand === strand);
            if (skills.length === 0) return null;
            return (
              <div className="card" key={strand}>
                <h3>{label}</h3>
                {skills.map((skill) => {
                  const state = profile.skillStates[skill.id];
                  if (!state) return null;
                  const pct = Math.round(progressToward(state) * 100);
                  return (
                    <div className="mastery-row" key={skill.id}>
                      <div className="mastery-name">
                        {skill.name}
                        {state.attempts > 0 ? (
                          <div className="small dim">
                            Independent {Math.round((state.independentAccuracy ?? 0) * 100)}%
                            {state.supportedAttempts > 0
                              ? ` · With support ${Math.round((state.supportedAccuracy ?? 0) * 100)}%`
                              : ''}
                            {state.retryAttempts > 0
                              ? ` · Transfer ${state.retrySuccesses}/${state.retryAttempts}`
                              : ''}
                          </div>
                        ) : null}
                        <div className="bar" style={{ marginTop: 5 }}>
                          <div
                            className={
                              state.mastered ? 'bar-fill green' : 'bar-fill'
                            }
                            style={{ width: `${state.unlocked ? pct : 0}%` }}
                          />
                        </div>
                      </div>
                      <span
                        className={
                          state.mastered
                            ? 'badge mastered'
                            : state.proficient
                              ? 'badge proficient'
                              : state.unlocked
                                ? 'badge'
                                : 'badge locked'
                        }
                      >
                        {state.mastered
                          ? 'Mastered'
                          : state.proficient
                            ? 'Proficient'
                            : state.unlocked
                              ? `Level ${state.level}`
                              : 'Locked'}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <p className="small dim" style={{ paddingBottom: 20 }}>
            <strong>Proficient</strong> means accuracy and speed are there, and it
            unlocks the next skill. <strong>Mastered</strong> additionally means
            he still had it two spaced reviews later — that is the honest signal
            that it stuck.
          </p>
        </>
      ) : null}

      {tab === 'struggles' ? (
        <>
          {struggles.length === 0 ? (
            <div className="card">
              <p className="small dim" style={{ margin: 0 }}>
                Nothing to report yet — he needs a few sessions before the
                patterns mean anything.
              </p>
            </div>
          ) : (
            struggles.map((s) => (
              <div className="card" key={s.skillId}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <strong>{getSkill(s.skillId).name}</strong>
                  <span className="badge">{s.total} misses</span>
                </div>
                <div className="small" style={{ marginBottom: 6 }}>
                  Most common: <strong>{ERROR_LABELS[s.topError as ErrorType]}</strong>{' '}
                  ({s.topCount}×)
                </div>
                <p className="small dim" style={{ margin: 0 }}>
                  {ERROR_COACHING[s.topError as ErrorType] ||
                    'No specific pattern — the misses look scattered rather than systematic.'}
                </p>
              </div>
            ))
          )}
          <div className="card">
            <h3>Hint usage</h3>
            <p className="small dim" style={{ margin: 0 }}>
              He asks for a hint on {stats.hintRate}% of questions. Somewhere
              around 10–25% is healthy. Near zero usually means he would rather
              guess than ask; very high means the working level is set too hard.
            </p>
          </div>
        </>
      ) : null}

      {tab === 'settings' ? (
        <>
          <div className="card">
            <h3>Avatar</h3>
            <div className="avatar-grid">
              {AVATAR_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className={emoji === profile.avatar ? 'avatar-choice selected' : 'avatar-choice'}
                  onClick={() => setAvatar(emoji)}
                  aria-label={`Choose ${emoji} as your avatar`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="row between" style={{ marginBottom: 14 }}>
              <span>Sound effects</span>
              <button className="btn" style={{ minHeight: 46 }} onClick={toggleSound}>
                {profile.soundOn ? 'On' : 'Off'}
              </button>
            </div>
            <div className="row between">
              <div className="grow">
                <div>Read word problems aloud</div>
                <div className="small dim">
                  Recommended. Otherwise word problems test reading, not maths.
                </div>
              </div>
              <button className="btn" style={{ minHeight: 46 }} onClick={toggleReadAloud}>
                {profile.readAloud ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          <div className="card">
            <h3>Data</h3>
            <p className="small dim">
              Everything is stored on this device only. To move progress to
              another device (like his tablet), export a backup here, get the
              file onto the other device, then import it there — from this
              screen if it already has a profile, or the “restore a backup”
              link on the sign-in screen if it’s brand new. This is a one-time
              copy, not ongoing sync: if he plays on both devices afterward,
              they’ll drift apart independently.
            </p>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn grow" onClick={() => void download()}>
                Export backup
              </button>
              <button className="btn grow" onClick={() => importInputRef.current?.click()}>
                Import backup
              </button>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => void handleImportFile(e)}
            />
          </div>

          <div className="card">
            <h3>Undo</h3>
            <p className="small dim">
              The app snapshots his progress automatically before anything
              destructive — a reset, an import, or a schema change when the app
              updates. This restores that snapshot.
            </p>
            {backup ? (
              <div className="backup-notice">
                Snapshot of <strong>{backup.name}</strong> taken{' '}
                {new Date(backup.at).toLocaleString()} (before: {backup.reason}).
              </div>
            ) : (
              <p className="small dim">No snapshot stored yet.</p>
            )}
            <button
              className="btn btn-wide"
              disabled={!backup}
              onClick={() => {
                if (
                  confirm(
                    'Restore the last snapshot? This replaces the progress currently on this device.',
                  )
                ) {
                  void restoreFromBackup().then((ok) => {
                    alert(ok ? 'Restored.' : 'Nothing to restore.');
                  });
                }
              }}
            >
              Restore last snapshot
            </button>
          </div>

          <div className="card">
            <h3>Danger zone</h3>
            <p className="small dim">
              A snapshot is taken first, so this is undoable from the Undo card
              above right up until the next reset or import.
            </p>
            <button
              className="btn btn-wide"
              onClick={() => {
                if (
                  confirm(
                    'Erase all progress and start over?\n\nA snapshot is saved first, so this can be undone from "Restore last snapshot" — but only until the next reset or import.',
                  )
                ) {
                  void reset();
                }
              }}
            >
              Erase everything
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * The weekly note.
 *
 * The digest is computed and displayed locally on the device.
 */
function WeeklyTab({
  attempts,
  skillStates,
}: {
  attempts: Attempt[];
  skillStates: Record<string, SkillState>;
}) {
  const digest = useMemo(
    () => buildWeeklyDigest(attempts, skillStates),
    [attempts, skillStates],
  );
  if (digest.totalAttempts === 0) {
    return (
      <div className="card">
        <h3>This week</h3>
        <p className="small dim" style={{ margin: 0 }}>
          No sessions in the last seven days, so there is nothing to report yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row between">
          <Stat label="Sessions" value={String(digest.sessions)} />
          <Stat label="Questions" value={String(digest.totalAttempts)} />
          <Stat label="Accuracy" value={`${digest.accuracyPct}%`} />
          <Stat label="Minutes" value={String(digest.minutes)} />
        </div>
      </div>

      <div className="card">
        <h3>Written note</h3>
        <p className="small dim" style={{ margin: 0 }}>
          This report is generated on this device from recorded sessions. It never sends play or progress data to a service.
        </p>
      </div>

      <div className="card">
        <h3>What he worked on</h3>
        {digest.perSkill.map((s) => (
          <div key={s.skillId} className="row between" style={{ padding: '7px 0' }}>
            <div>
              <div style={{ fontSize: 15 }}>{s.name}</div>
              <div className="small dim">
                {s.attempts} questions · tier {s.level}
                {s.proficient ? ' · proficient' : ''}
              </div>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 18,
                color:
                  s.accuracyPct >= 80
                    ? 'var(--green)'
                    : s.accuracyPct < 60
                      ? 'var(--red)'
                      : 'var(--text)',
              }}
            >
              {s.accuracyPct}%
            </div>
          </div>
        ))}
      </div>

      {digest.topErrors.length > 0 ? (
        <div className="card">
          <h3>Most common mistakes</h3>
          {digest.topErrors.map((e) => (
            <div key={e.errorType} className="row between" style={{ padding: '6px 0' }}>
              <span style={{ fontSize: 15 }}>{e.label}</span>
              <span className="mono dim">{e.count}</span>
            </div>
          ))}
          <p className="small dim" style={{ marginBottom: 0 }}>
            {ERROR_COACHING[digest.topErrors[0]!.errorType]}
          </p>
        </div>
      ) : null}

      <div className="card">
        <h3>Reaching for hard things</h3>
        <p className="small dim" style={{ margin: 0 }}>
          {digest.stretchAttempted} stretch questions attempted this week,{' '}
          {digest.stretchWins} solved. Misses cost him nothing and are reported
          separately from his working accuracy.
        </p>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="center grow">
      <div style={{ fontSize: 26, fontWeight: 700 }} className="mono">
        {value}
      </div>
      <div className="small dim">{label}</div>
    </div>
  );
}
