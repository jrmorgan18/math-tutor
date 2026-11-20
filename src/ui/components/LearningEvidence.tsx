import type { SkillLearningReport } from '../../engine/learning';

export function LearningSignals({ reports }: { reports: SkillLearningReport[] }) {
  const flagged = reports.filter(r => r.signals.length);
  if (!flagged.length) return null;
  return <div className="card learning-signals">
    <h3>Where the next lesson can help</h3>
    {flagged.map(report => <div key={report.skillId} className="learning-signal">
      <strong>{report.name}</strong>
      {report.signals.map(signal => <p key={signal.kind} className="small">{signal.text}</p>)}
    </div>)}
  </div>;
}

export function LearningEvidence({ report }: { report: SkillLearningReport }) {
  return <div className="learning-evidence small">
    <div>Independent: <strong>{report.independentCorrect}/{report.independentAttempts}</strong>
      {report.independentAttempts ? ` (${Math.round(report.independentCorrect / report.independentAttempts * 100)}%)` : ' · awaiting a fresh check'}
      {' · '}Support used: {report.supportedAttempts}/{report.attempts} regular questions</div>
    <div className="dim">Requested hints: {report.requestedSupport} · Automatic hints: {report.automaticSupport}
      {report.stretchAttempts ? ` · Stretch: ${report.stretchCorrect}/${report.stretchAttempts}` : ''}</div>
    <details>
      <summary>Evidence by difficulty</summary>
      <div className="learning-table-scroll"><table className="learning-table">
        <caption>Includes stretch questions; independent counts exclude retries and guided work.</caption>
        <thead><tr><th>Level</th><th>Correct</th><th>Independent</th><th>Requested hints</th></tr></thead>
        <tbody>{report.levels.map(row => <tr key={row.level}><th scope="row">{row.level}</th>
          <td>{row.correct}/{row.attempts}</td><td>{row.independentCorrect}/{row.independentAttempts}</td>
          <td>{row.requestedSupport}</td></tr>)}</tbody>
      </table></div>
    </details>
  </div>;
}
