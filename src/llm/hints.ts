import { ERROR_LABELS } from '../engine/errors';
import type { ErrorType, Problem } from '../engine/types';

/**
 * Runtime "explain it a different way" support, backed by Claude Haiku.
 *
 * The single most important design decision here: **the model is given the
 * correct answer and the full worked solution up front.** It is never asked to
 * compute anything. Every number it could need is already in the prompt, so a
 * model arithmetic slip cannot produce a wrong hint — the worst failure mode
 * is a badly phrased explanation, not a wrong one.
 *
 * It is also explicitly forbidden from stating the answer, because this fires
 * *before* the final rung of the canned hint ladder. If the call fails, is
 * rate-limited, or no API key is configured, the UI silently falls back to the
 * authored hints and nothing breaks. The app is fully usable offline.
 */

const SYSTEM = `You are a warm, patient maths tutor for a 6-to-7-year-old boy who is working a year or so ahead of his class. He loves dinosaurs, space, Star Wars, soccer and music, and he wants to be a scientist.

He is stuck on a problem and the standard hints have not landed, so you are explaining it a different way.

Rules, in order of importance:
1. NEVER state the final answer. He is going to try again immediately after reading this. Giving him the answer wastes the question.
2. NEVER do any arithmetic of your own. Every number you need is supplied to you. Do not compute, check or restate totals.
3. Explain the *approach*, not the result. Offer one concrete way to picture or start the problem.
4. Two or three short sentences. Simple words. Second-person, talking directly to him.
5. Suggest something physical or visual where you can: counting on fingers, drawing dots, splitting into tens, thinking of a number line.
6. Be encouraging without being gushing. No exclamation marks stacked up, no "great job" for being stuck.
7. Plain text only. No markdown, no headings, no bullet points, no emoji.`;

export interface HintRequest {
  problem: Problem;
  given: string;
  errorType: ErrorType;
}

/**
 * Returns a fresh explanation, or null if unavailable for any reason.
 * Callers must treat null as normal, not as an error.
 */
export async function fetchAlternateHint(
  req: HintRequest,
  signal?: AbortSignal,
): Promise<string | null> {
  const { problem, given, errorType } = req;

  const wrongAnswerNote =
    given.trim().length > 0 && errorType !== 'timeout'
      ? `He answered "${given}", which is wrong. The way it is wrong looks like: ${ERROR_LABELS[errorType]}.`
      : 'He has not managed to start.';

  const user = [
    `Question shown to him: ${problem.prompt}`,
    problem.subPrompt ? `Extra line: ${problem.subPrompt}` : '',
    ``,
    wrongAnswerNote,
    ``,
    `For your reference only — do NOT repeat these to him:`,
    `- The correct answer is ${problem.answer}.`,
    `- The worked solution is: ${problem.hints.at(-1)?.text ?? ''}`,
    `- Hints he has already read and which did not help: ${problem.hints
      .slice(0, -1)
      .map((x) => x.text)
      .join(' | ')}`,
    ``,
    `Explain a different way to think about this, without giving away the answer.`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: SYSTEM, user }),
      signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { text?: string };
    const text = data.text?.trim();
    if (!text) return null;

    // Last line of defence: if the model leaked the answer despite the
    // instruction, discard it and fall back to the authored ladder rather than
    // handing him the number.
    if (leaksAnswer(text, problem.answer)) return null;

    return text;
  } catch {
    // Offline, aborted, no key, upstream error — all the same to the caller.
    return null;
  }
}

/**
 * Reject a hint that contains the answer as a standalone number. Word
 * boundaries matter: for an answer of 12, the text "count in 2s" must not trip
 * the check, but "you get 12" must.
 */
function leaksAnswer(text: string, answer: string): boolean {
  const trimmed = answer.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const pattern = new RegExp(`(?<!\\d)${trimmed}(?!\\d)`);
  return pattern.test(text);
}

/**
 * Whether the hint service is reachable, used to hide the button when not.
 *
 * Probes with a GET, which the endpoint answers without touching the API —
 * 405 means a key is configured and ready, 503 means it is not. Costs nothing.
 */
export async function hintServiceAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/hint', { method: 'GET' });
    return res.status === 405;
  } catch {
    return false;
  }
}
