import {
  currentExpedition,
  digSiteById,
  expeditionComplete,
  expeditionProgress,
  EXPEDITION_REWARD_DNA,
} from '../../content/expeditions';
import { getSkill, skillExists } from '../../engine/skills';
import type { Expedition } from '../../store/db';

/**
 * The week's dig site.
 *
 * A session has an arc but a week did not, so this supplies one. Both goals
 * are things he cannot fake: turning up, and pushing a skill forward. A DNA
 * target would have been farmable on warm-ups, which is the one behaviour the
 * whole design refuses to pay for.
 */
export function ExpeditionCard({ expedition }: { expedition: Expedition | null }) {
  const e = currentExpedition(expedition);
  const site = digSiteById(e.siteId);
  const done = expeditionComplete(e);
  const progress = expeditionProgress(e);

  const sessionsMet = e.sessionsDone >= e.goalSessions;
  const skillsMet = e.skillsAdvanced.length >= e.goalNewSkills;

  // A skill can be retired from the graph between weeks; don't crash on it.
  const advancedNames = e.skillsAdvanced
    .filter((id) => skillExists(id))
    .map((id) => getSkill(id).labName);

  return (
    <div className="expedition-card" style={{ borderColor: done ? site.color : undefined }}>
      <div className="expedition-head">
        <span className="expedition-glyph">{site.glyph}</span>
        <div className="grow">
          <div className="expedition-name" style={{ color: site.color }}>
            {site.name}
          </div>
          {/* "Expedition" already means one session everywhere else in the
              app, so the week-long goal is a *dig* — otherwise the home screen
              says "expedition" twice meaning two different spans of time. */}
          <div className="expedition-week">This week’s dig</div>
        </div>
      </div>

      <div className="expedition-blurb">{site.blurb}</div>

      <div className="expedition-goals">
        <div className={sessionsMet ? 'expedition-goal met' : 'expedition-goal'}>
          <div className="expedition-goal-label">Expeditions out</div>
          <div className="expedition-goal-value">
            {Math.min(e.sessionsDone, e.goalSessions)} / {e.goalSessions}
          </div>
        </div>
        <div className={skillsMet ? 'expedition-goal met' : 'expedition-goal'}>
          <div className="expedition-goal-label">New skill cracked</div>
          <div className="expedition-goal-value">
            {Math.min(e.skillsAdvanced.length, e.goalNewSkills)} / {e.goalNewSkills}
          </div>
        </div>
      </div>

      <div className="expedition-bar">
        <div
          className="expedition-bar-fill"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {advancedNames.length > 0 ? (
        <div className="small dim" style={{ marginTop: 8 }}>
          Cracked so far: {advancedNames.join(', ')}
        </div>
      ) : null}

      {done ? (
        <div className="expedition-done">
          🏆 Dig complete — +{EXPEDITION_REWARD_DNA} DNA
        </div>
      ) : null}
    </div>
  );
}
