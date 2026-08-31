/**
 * Sound design, synthesised with the Web Audio API so there are no asset files
 * to load or ship. Sound matters more than it looks like it should: the
 * difference between a silent correct answer and a bright two-note chime is
 * most of the felt reward in a session.
 *
 * The "wrong" sound is deliberately soft and low rather than a buzzer. A harsh
 * error sound teaches him to fear attempting things.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers suspend the context until a user gesture; sessions always start
  // with a tap, so resuming here is safe.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOptions {
  freq: number;
  start: number;
  duration: number;
  gain?: number;
  type?: OscillatorType;
}

function tone(ac: AudioContext, { freq, start, duration, gain = 0.14, type = 'sine' }: ToneOptions) {
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const t0 = ac.currentTime + start;
  vol.gain.setValueAtTime(0, t0);
  vol.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(vol).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sfx = {
  /** Bright rising third. */
  correct(enabled: boolean) {
    if (!enabled) return;
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 660, start: 0, duration: 0.13 });
    tone(ac, { freq: 880, start: 0.09, duration: 0.2 });
  },

  /** Soft low fall. Gentle on purpose. */
  wrong(enabled: boolean) {
    if (!enabled) return;
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 300, start: 0, duration: 0.16, gain: 0.09, type: 'triangle' });
    tone(ac, { freq: 232, start: 0.1, duration: 0.22, gain: 0.09, type: 'triangle' });
  },

  /** Keypad tick — very short, very quiet. */
  tap(enabled: boolean) {
    if (!enabled) return;
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 520, start: 0, duration: 0.045, gain: 0.05, type: 'square' });
  },

  /** DNA fragment collected. */
  dna(enabled: boolean) {
    if (!enabled) return;
    const ac = audio();
    if (!ac) return;
    tone(ac, { freq: 990, start: 0, duration: 0.08, gain: 0.08 });
    tone(ac, { freq: 1320, start: 0.05, duration: 0.1, gain: 0.06 });
  },

  /** Genome complete — the big one. Rising arpeggio into a held fifth. */
  hatch(enabled: boolean) {
    if (!enabled) return;
    const ac = audio();
    if (!ac) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(ac, { freq: f, start: i * 0.11, duration: 0.3, gain: 0.13 }));
    tone(ac, { freq: 784, start: 0.46, duration: 0.7, gain: 0.1, type: 'triangle' });
    tone(ac, { freq: 1047, start: 0.46, duration: 0.7, gain: 0.09, type: 'triangle' });
  },

  /** End of session. */
  finish(enabled: boolean) {
    if (!enabled) return;
    const ac = audio();
    if (!ac) return;
    [523, 659, 784].forEach((f, i) =>
      tone(ac, { freq: f, start: i * 0.13, duration: 0.28, gain: 0.11 }),
    );
  },
};
