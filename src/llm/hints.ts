import type { ErrorType, Problem } from '../engine/types';

/**
 * The GitHub Pages edition is deliberately local-only. Its authored hint
 * ladder is always available and no child-play session makes an LLM request.
 */
export interface HintRequest {
  problem: Problem;
  given: string;
  errorType: ErrorType;
}

export async function fetchAlternateHint(
  _request: HintRequest,
  _signal?: AbortSignal,
): Promise<null> {
  return null;
}

export async function hintServiceAvailable(): Promise<false> {
  return false;
}
