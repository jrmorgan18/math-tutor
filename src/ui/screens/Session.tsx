import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { AnswerPad } from '../components/AnswerPad';
import { ProblemView } from '../components/ProblemView';
import { HintVisualView } from '../components/HintVisualView';
import { sfx } from '../audio';
import { cancelSpeech, speak } from '../tts';
import { fetchAlternateHint, hintServiceAvailable } from '../../llm/hints';
import { getSkill } from '../../engine/skills';
import { derivePredict } from '../../engine/predict';
import { openingRung } from '../../engine/adaptiveHints';
import {
  reflectResponse,
  remediationHint,
  REFLECT_OPTIONS,
  type ReflectBucket,
} from '../../content/remediation';

const SLOT_LABEL: Record<string, string> = {
  warmup: 'Warm-up',
  review: 'Recall check',
  working: 'Excavation',
  new: 'New sample',
  stretch: 'Research challenge',
  boss: 'Boss investigation',
};

/** Slots where the predict interstitial is worth the extra tap. */
const PREDICT_SLOTS = new Set(['new', 'stretch']);

export function Session() {
  const session = useStore((s) => s.session);
  const profile = useStore((s) => s.profile);
  const submitAnswer = useStore((s) => s.submitAnswer);
  const useHint = useStore((s) => s.useHint);
  const revealHintsTo = useStore((s) => s.revealHintsTo);
  const recordSelfDiagnosis = useStore((s) => s.recordSelfDiagnosis);
  const nextItem = useStore((s) => s.nextItem);
  const abandonSession = useStore((s) => s.abandonSession);

  const [entry, setEntry] = useState('');
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [predictPick, setPredictPick] = useState<'Bigger' | 'Smaller' | null>(null);
  const [reflectPick, setReflectPick] = useState<ReflectBucket | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * The authoritative current entry. React state alone is not enough: two
   * rapid taps land in the same render batch and would both read the same
   * stale value, silently dropping a digit.
   */
  const entryRef = useRef('');

  const setEntryBoth = (next: string) => {
    entryRef.current = next;
    setEntry(next);
  };

  useEffect(() => {
    void hintServiceAvailable().then(setAiAvailable);
  }, []);

  const itemKey = `${session?.index}-${session?.problem?.seed}`;
  useEffect(() => {
    entryRef.current = '';
    setEntry('');
    setAiHint(null);
    setAiLoading(false);
    setPredictPick(null);
    setReflectPick(null);
    abortRef.current?.abort();
  }, [itemKey]);

  /**
   * On a retry item, open the ladder at the rung that addresses the mistake
   * he just made rather than the generic nudge — he has already seen the
   * nudge and it didn't help.
   */
  const priorAttempt = session?.pending.at(-1);
  useEffect(() => {
    const s = useStore.getState().session;
    const item = s?.plan[s.index];
    if (!s?.problem || !item) return;
    if (item.remediationStage === 'concrete') {
      revealHintsTo(2);
      return;
    }
    if (item.remediationStage === 'faded') {
      revealHintsTo(1);
      return;
    }
    if (!item.retry || !priorAttempt || priorAttempt.correct) return;
    const rung = openingRung(s.problem, priorAttempt.errorType);
    if (rung > 0) revealHintsTo(rung);
    // Runs once per item, when a retry item first appears.
  }, [itemKey, priorAttempt, revealHintsTo]);

  // ---- read-aloud for instructional text -------------------------------
  const readAloud = profile?.readAloud ?? false;
  const hintsUsedNow = session?.hintsUsed ?? 0;

  useEffect(() => {
    if (!readAloud) return;
    const p = session?.problem;
    if (!p || hintsUsedNow === 0) return;
    const latest = p.hints[hintsUsedNow - 1];
    if (latest) speak(latest.text, true);
  }, [hintsUsedNow, itemKey, readAloud, session?.problem]);

  useEffect(() => {
    if (!readAloud || !aiHint) return;
    speak(aiHint, true);
  }, [aiHint, readAloud]);

  const showingReflect =
    session?.phase === 'feedback' &&
    session.lastResult?.correct === false &&
    reflectPick === null;

  useEffect(() => {
    if (!readAloud) return;
    if (session?.phase !== 'feedback' || !session.lastResult || session.lastResult.correct) return;
    if (showingReflect) return;
    const p = session.problem;
    if (!p) return;
    const remediation = remediationHint(p, session.lastResult.errorType).text;
    const worked = p.hints.at(-1)?.text ?? '';
    speak(`${remediation} ${worked}`.trim(), true);
  }, [session?.phase, session?.lastResult, showingReflect, readAloud, session?.problem]);

  if (!session || !profile || !session.problem) return null;

  const { problem, plan, index, hintsUsed, phase, lastResult } = session;
  const item = plan[index];
  const soundOn = profile.soundOn;
  const cannedShown = problem.hints.slice(0, hintsUsed);
  const ladderExhausted = hintsUsed >= problem.hints.length;

  const predict = item && PREDICT_SLOTS.has(item.slot) ? derivePredict(problem) : null;
  const predictPending = phase === 'answering' && predict !== null && predictPick === null;

  const submit = (value: string, timedOut = false) => {
    cancelSpeech();
    const correct =
      !timedOut && value.trim().toLowerCase() === problem.answer.trim().toLowerCase();
    if (timedOut) sfx.wrong(soundOn);
    else if (correct) {
      // Escalating feedback as the run builds — this is the moment-to-moment
      // momentum a flat question list has none of.
      if (session.combo + 1 >= 6) sfx.dna(soundOn);
      sfx.correct(soundOn);
    } else sfx.wrong(soundOn);
    void submitAnswer(value, timedOut);
  };

  const requestHint = async () => {
    const nextRung = hintsUsed + 1;
    const isLastRung = nextRung >= problem.hints.length;

    if (isLastRung && aiAvailable && !aiHint) {
      setAiLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const text = await fetchAlternateHint(
        { problem, given: entry, errorType: 'other' },
        controller.signal,
      );
      setAiLoading(false);
      if (text) {
        setAiHint(text);
        return;
      }
    }
    useHint();
  };

  const pickReflect = (bucket: ReflectBucket) => {
    sfx.tap(soundOn);
    recordSelfDiagnosis(bucket);
    setReflectPick(bucket);
  };

  const answered = phase === 'feedback';
  const remediation = lastResult && !lastResult.correct
    ? remediationHint(problem, lastResult.errorType)
    : null;
  const learnerRivalScore = session.pending.filter(
    (attempt) =>
      attempt.correct && attempt.slot !== 'warmup' && attempt.slot !== 'stretch',
  ).length;

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn btn-ghost" style={{ minHeight: 44, padding: '0 12px' }} onClick={() => void abandonSession()}>
          ✕
        </button>
        {/* Score against Dr. Wu — accuracy only, never a clock. */}
        <div className="pill rival-pill">
          <span>You {learnerRivalScore}</span>
          <span className="dim">·</span>
          <span className="dim">Wu {session.rivalScore}</span>
        </div>
        <div className="pill small">
          {index + 1} / {plan.length}
        </div>
      </div>

      <div className="session-progress">
        {plan.map((p, i) => {
          const attempt = session.pending[i];
          const cls =
            i === index
              ? 'tick current'
                    : attempt
                ? attempt.correct
                  ? 'tick done'
                  : p.slot === 'stretch'
                    ? 'tick stretch'
                    : 'tick miss'
                : 'tick';
          return <div key={i} className={p.retry ? `${cls} tick-retry` : cls} />;
        })}
      </div>

      <div className="row between" style={{ marginBottom: 4 }}>
        <div className="small dim">
          {item?.retry ? 'Try one more' : SLOT_LABEL[item?.slot ?? 'working']} ·{' '}
          {getSkill(problem.skillId).labName}
          {item?.slot === 'stretch' ? ' · meant to be hard' : ''}
        </div>
        {session.combo >= 3 ? (
          <div className="combo-badge">🔥 {session.combo} in a row</div>
        ) : null}
      </div>

      <ProblemView
        problem={problem}
        readAloud={profile.readAloud}
        entry={
          // Build mode shows its own count, so it doesn't need the answer box.
          problem.representation.kind === 'numeric' && !predictPending
            ? {
                value: answered && lastResult ? (entry || '—') : entry,
                state: answered && lastResult ? (lastResult.correct ? 'correct' : 'wrong') : 'idle',
              }
            : null
        }
      />

      {/* --------------------------------------------------- predict */}
      {!answered && predictPending && predict ? (
        <div className="interstitial">
          <div className="interstitial-question">{predict.question}</div>
          <div className="interstitial-choices">
            {predict.options.map((option) => (
              <button
                key={option}
                className="interstitial-choice"
                onClick={() => {
                  sfx.tap(soundOn);
                  setPredictPick(option as 'Bigger' | 'Smaller');
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ----------------------------------------------------- reflect */}
      {showingReflect ? (
        <div className="interstitial">
          <div className="interstitial-question">Where do you think it went wrong?</div>
          <div className="interstitial-choices stack">
            {REFLECT_OPTIONS.map((opt) => (
              <button key={opt.id} className="interstitial-choice" onClick={() => pickReflect(opt.id)}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------- hints */}
      {!answered && !predictPending && cannedShown.length > 0
        ? cannedShown.map((hint, i) => (
            <div className="hint" key={i}>
              <button className="hint-speak" onClick={() => speak(hint.text, true)} aria-label="Read this hint aloud">
                🔊
              </button>
              <span className="hint-label">
                {i === 0 ? 'Nudge' : i === 1 ? 'Strategy' : 'Worked through'}
              </span>
              {hint.text}
              {hint.visual ? <HintVisualView visual={hint.visual} /> : null}
            </div>
          ))
        : null}

      {!answered && !predictPending && aiHint ? (
        <div className="hint ai">
          <button className="hint-speak" onClick={() => speak(aiHint, true)} aria-label="Read this hint aloud">
            🔊
          </button>
          <span className="hint-label">Another way to see it</span>
          {aiHint}
        </div>
      ) : null}

      {/* ----------------------------------------------- feedback */}
      {answered && lastResult && !showingReflect ? (
        <div className={lastResult.correct ? 'feedback correct' : 'feedback wrong'}>
          <div className="feedback-title">
            {lastResult.correct
              ? item?.retry
                ? 'Got it that time.'
                : item?.slot === 'stretch'
                  ? 'You cracked the hard one.'
                  : 'Correct'
              : 'Not this time'}
          </div>

          {predictPick ? (
            <div className="small dim" style={{ marginBottom: 6 }}>
              Your guess: {predictPick} —{' '}
              {predict && predictPick === predict.correctAnswer
                ? 'right!'
                : `actually it was ${predict?.correctAnswer.toLowerCase() ?? predictPick.toLowerCase()}.`}
            </div>
          ) : null}

          {lastResult.correct ? (
            <>
              {lastResult.dna > 0 ? (
                <div className="small">
                  +{lastResult.dna} DNA fragments
                  {session.lastComboBonus > 0 ? (
                    <strong> · {session.combo} in a row bonus!</strong>
                  ) : null}
                </div>
              ) : (
                lastResult.discoveryId ? (
                  <div className="small">
                    🔬 New lab discovery unlocked. It will be waiting in your lab.
                  </div>
                ) : (
                  <div className="small dim">
                    DNA tanks full · field research {lastResult.discoveryProgress} / 3
                    toward the next discovery.
                  </div>
                )
              )}
            </>
          ) : (
            <>
              {reflectPick ? (
                <div className="small dim" style={{ marginBottom: 8 }}>
                  {reflectResponse(reflectPick, lastResult.errorType)}
                </div>
              ) : null}
              <div className="small" style={{ marginBottom: 8 }}>
                The answer was <strong>{lastResult.expected}</strong>.
              </div>
              <div className="hint" style={{ margin: '0 0 8px' }}>
                <button
                  className="hint-speak"
                  onClick={() =>
                    speak(`${remediation?.text ?? ''} ${problem.hints.at(-1)?.text ?? ''}`, true)
                  }
                  aria-label="Read this explanation aloud"
                >
                  🔊
                </button>
                <div>{remediation?.text}</div>
                {remediation?.visual ? <HintVisualView visual={remediation.visual} /> : null}
                <div className="dim" style={{ marginTop: 6 }}>
                  {problem.hints.at(-1)?.text}
                </div>
              </div>
              {item?.slot === 'stretch' ? (
                <div className="small dim" style={{ marginTop: 8 }}>
                  This one was above your level on purpose. It costs you nothing.
                </div>
              ) : null}
              {plan[index + 1]?.retry ? (
                <div className="small" style={{ marginTop: 8 }}>
                  Here comes a similar one — let’s use what you just saw.
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="spacer" />

      {/* -------------------------------------------------- input */}
      {!answered ? (
        predictPending ? null : (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <button
                className="btn btn-ghost grow"
                disabled={aiLoading || (ladderExhausted && !!aiHint)}
                onClick={() => void requestHint()}
              >
                {aiLoading ? 'Thinking…' : hintsUsed === 0 ? '💡 I’m stuck' : '💡 Another hint'}
              </button>
              {ladderExhausted ? (
                <button className="btn btn-ghost" onClick={() => submit('', true)}>
                  Skip
                </button>
              ) : null}
            </div>

            <AnswerPad
              representation={problem.representation}
              value={entry}
              disabled={false}
              soundOn={soundOn}
              reveal={null}
              onDigit={(digit) => {
                const next = (entryRef.current + digit).slice(0, 4);
                setEntryBoth(next);
                // Auto-submit saves a tap on single-digit keypad answers, but
                // must never fire in build mode — there he is still adjusting
                // the count and every tap would submit.
                if (
                  problem.representation.kind === 'numeric' &&
                  problem.answer.length === 1 &&
                  next.length === 1
                ) {
                  submit(next);
                }
              }}
              onBackspace={() => setEntryBoth(entryRef.current.slice(0, -1))}
              onReplace={(next) => setEntryBoth(next.slice(0, 4))}
              onSubmit={(value) => submit(value)}
            />
          </>
        )
      ) : showingReflect ? null : (
        <button className="btn btn-primary btn-wide btn-lg" onClick={() => void nextItem()} style={{ marginBottom: 14 }}>
          {index + 1 >= plan.length ? 'Finish' : 'Next'}
        </button>
      )}
    </div>
  );
}
