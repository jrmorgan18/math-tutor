import type { Representation } from './types';

/** Semantic edits operate on the authoritative entry, including rapid taps. */
export function editEntry(value: string, action: string, representation: Representation): string {
  if (action === 'backspace') return representation.kind === 'columns' ? value.slice(1) : value.slice(0, -1);
  const limit = representation.kind === 'columns' ? representation.columns : 4;
  if (value.length >= limit) return value;
  if (representation.kind === 'columns') return action + value;
  return (value === '0' ? action : value + action).slice(0, limit);
}

export class SolveClock {
  private started: number;
  private elapsed = 0;
  private active = true;
  private reliable = true;
  constructor(now: number) { this.started = now; }
  pause(now: number) {
    if (this.active) this.elapsed += Math.max(0, now - this.started);
    this.active = false;
    this.reliable = false;
  }
  resume(now: number) { if (!this.active) { this.started = now; this.active = true; } }
  read(now: number) {
    const latencyMs = this.elapsed + (this.active ? Math.max(0, now - this.started) : 0);
    return { latencyMs, timingReliable: this.reliable && latencyMs <= 45_000 };
  }
}
