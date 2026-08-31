import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { generate } from '../../engine/generators';
import { generateBossProblem } from '../../engine/generators/boss';
import { getSkill, skillExists } from '../../engine/skills';
import { remediationLine } from '../../content/remediation';
import { dinoById } from '../../content/dinosaurs';
import { EXPEDITION_REWARD_DNA } from '../../content/expeditions';
import { sfx } from '../audio';
import { discoveryById } from '../../content/discoveries';

/**
 * The end-of-session recap.
 *
 * Reconstructs each missed problem from its stored `(skillId, level, seed)`
 * rather than needing the full Problem object — the same "any past question
 * can be reconstructed exactly" property that makes the pure-generator design
 * useful elsewhere (see engine/generators). That's what lets this screen show
 * a real, correct remediation line for a question that was answered several
 * items ago without the store having to carry the full Problem forward.
 */
export function Recap() {
  const session = useStore((s) => s.session);
  const profile = useStore((s) => s.profile);
  const closeRecap = useStore((s) => s.closeRecap);

  const summary = useMemo(() => {
    if (!session) return null;
    const scored = session.pending.filter((attempt) => attempt.slot !== 'stretch');
    const total = scored.length;
    const correct = scored.filter((attempt) => attempt.correct).length;

    // Up to 3 misses worth reviewing together, most recent first, deduped so
    // the same skill doesn't take two of the three slots.
    const seen = new Set<string>();
    const reviewItems: { skillId: string; line: string }[] = [];
    for (let i = session.pending.length - 1; i >= 0 && reviewItems.length < 3; i--) {
      const a = session.pending[i];
      if (!a || a.correct || seen.has(a.skillId)) continue;
      seen.add(a.skillId);
      const problem = a.boss
        ? generateBossProblem(a.boss, a.skillId, a.level)
        : generate(a.skillId, a.level, a.seed);
      reviewItems.push({
        skillId: a.skillId,
        line: remediationLine(problem, a.errorType) || 'Worth another look together.',
      });
    }

    return { total, correct, reviewItems };
  }, [session]);

  if (!session || !profile || !summary) return null;

  const accuracy =
    summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0;
  const hatchedDinos = session.hatchedThisSession
    .map((id) => dinoById(id))
    .filter((d): d is NonNullable<typeof d> => !!d);
  const isRecord = session.newRecord?.accuracy || session.newRecord?.dna;
  const discoveries = session.discoveriesThisSession
    .map(discoveryById)
    .filter((item): item is NonNullable<typeof item> => !!item);

  return (
    <div className="app">
      <div className="spacer" />
      <div className="center" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 50 }}>🧪</div>
        <h1 style={{ fontSize: 26 }}>Expedition complete</h1>
      </div>

      <div className="card">
        <div className="row between">
          <Stat label="Correct" value={`${summary.correct} / ${summary.total}`} />
          <Stat label="Accuracy" value={`${accuracy}%`} />
          <Stat label="DNA earned" value={`+${session.dnaEarned}`} />
        </div>
      </div>

      {isRecord ? (
        <div className="card" style={{ borderColor: 'var(--amber)' }}>
          <h3>New record</h3>
          <p className="small" style={{ margin: 0 }}>
            {session.newRecord?.accuracy ? 'Best accuracy in one expedition yet. ' : ''}
            {session.newRecord?.dna ? 'Most DNA earned in one expedition yet.' : ''}
          </p>
        </div>
      ) : null}

      {/* The week-long goal landing is a bigger moment than the session's own
          stats, so it gets its own callout above the collection. */}
      {session.expeditionCompleted ? (
        <div className="card" style={{ borderColor: 'var(--green)' }}>
          <h3>🏆 This week’s dig is complete</h3>
          <p className="small" style={{ margin: 0 }}>
            You turned up all week <em>and</em> cracked something new. The lab
            council has released <strong>+{EXPEDITION_REWARD_DNA} DNA</strong> from
            the research grant.
          </p>
        </div>
      ) : null}

      {session.skillsAdvanced.length > 0 ? (
        <div className="card">
          <h3>Cracked today</h3>
          <p className="small dim" style={{ marginTop: 0 }}>
            You got good enough at these that the lab now trusts you with them.
          </p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {session.skillsAdvanced
              .filter((id) => skillExists(id))
              .map((id) => (
                <div key={id} className="pill">
                  ⭐ {getSkill(id).labName}
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {hatchedDinos.length > 0 ? (
        <div className="card">
          <h3>Hatched today</h3>
          <div className="row" style={{ gap: 18 }}>
            {hatchedDinos.map((d) => (
              <div key={d.id} className="center">
                <div style={{ fontSize: 34 }}>{d.glyph}</div>
                <div className="small dim">{d.name}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {discoveries.length > 0 ? (
        <div className="card" style={{ borderColor: 'var(--cyan)' }}>
          <h3>New lab discoveries</h3>
          {discoveries.map((item) => (
            <div key={item.id} className="row" style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 28 }}>{item.glyph}</span>
              <div>
                <strong>{item.title}</strong>
                <div className="small dim">{item.text}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {summary.reviewItems.length > 0 ? (
        <div className="card">
          <h3>Let’s remember this</h3>
          {summary.reviewItems.map((r) => (
            <div key={r.skillId} className="small" style={{ marginBottom: 10 }}>
              <strong>{getSkill(r.skillId).labName}:</strong> {r.line}
            </div>
          ))}
        </div>
      ) : null}

      <div className="spacer" />
      <button
        className="btn btn-primary btn-wide btn-lg"
        style={{ marginBottom: 14 }}
        onClick={() => {
          sfx.tap(profile.soundOn);
          closeRecap();
        }}
      >
        Back to the lab
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="center grow">
      <div style={{ fontSize: 24, fontWeight: 700 }} className="mono">
        {value}
      </div>
      <div className="small dim">{label}</div>
    </div>
  );
}
