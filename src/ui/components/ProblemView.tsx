import { useEffect } from 'react';
import type { Problem } from '../../engine/types';
import { cancelSpeech, speak, speechAvailable } from '../tts';
import { isStackable, StackedProblem } from './StackedProblem';
import { HintVisualView } from './HintVisualView';

interface Props {
  problem: Problem;
  readAloud: boolean;
  /** Numeric answers show a live entry box; choices do not. */
  entry?: { value: string; state: 'idle' | 'correct' | 'wrong' } | null;
}

export function ProblemView({ problem, readAloud, entry }: Props) {
  // Word problems are the ones that actually need reading aloud; short
  // equations do not, and auto-speaking "seven plus five" on every fluency
  // drill would be maddening.
  const isProse = problem.prompt.length > 40;
  const isGrid = (problem.subPrompt ?? '').includes('●');

  useEffect(() => {
    if (!isProse) return;
    const text = `${problem.prompt} ${problem.subPrompt ?? ''}`;
    speak(text, readAloud);
    return () => cancelSpeech();
    // Re-read only when the question itself changes.
  }, [problem.seed, problem.skillId, isProse, readAloud, problem.prompt, problem.subPrompt]);

  const stacked = isStackable(problem);

  return (
    <div className="problem">
      {stacked ? (
        <StackedProblem problem={problem} />
      ) : (
        <div className={isProse ? 'problem-text prose' : 'problem-text'}>
          {problem.prompt}
        </div>
      )}

      {/* Part of the question itself, e.g. the dots in "how many dots?" */}
      {problem.questionVisual ? <HintVisualView visual={problem.questionVisual} /> : null}

      {problem.subPrompt ? (
        <div className={isGrid ? 'problem-sub grid' : 'problem-sub'}>
          {problem.subPrompt}
        </div>
      ) : null}

      {speechAvailable() && (isProse || isGrid) ? (
        <button
          className="btn btn-ghost small"
          style={{ minHeight: 44, padding: '0 16px' }}
          onClick={() =>
            speak(`${problem.prompt} ${problem.subPrompt ?? ''}`, true)
          }
        >
          🔊 Read it to me
        </button>
      ) : null}

      {entry ? (
        <div
          className={
            entry.state === 'idle' ? 'answer-box' : `answer-box ${entry.state}`
          }
        >
          {entry.value.length > 0 ? (
            entry.value
          ) : (
            <span className="placeholder">?</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
