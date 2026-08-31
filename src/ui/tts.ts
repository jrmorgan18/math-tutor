/**
 * Read-aloud, via the browser's built-in speech synthesis. Free, offline, no
 * API involved.
 *
 * This is not a nice-to-have. He reads at roughly a year ahead, but the maths
 * runs further ahead than that, so word problems will bottleneck on decoding
 * the sentence rather than on the arithmetic. Without read-aloud we would be
 * measuring his reading and calling it maths.
 */

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, enabled: boolean): void {
  if (!enabled || !speechAvailable()) return;
  cancelSpeech();

  // Strip the visual-only bits: dot grids and arrow tables read as noise.
  const cleaned = text
    .replace(/●/g, '')
    .replace(/→/g, ' becomes ')
    .replace(/×/g, ' times ')
    .replace(/÷/g, ' divided by ')
    .replace(/−/g, ' minus ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return;

  const utterance = new SpeechSynthesisUtterance(cleaned);
  // Slightly slower than default; children parse synthesised speech worse than
  // adults do, and rushing it defeats the point.
  utterance.rate = 0.92;
  utterance.pitch = 1.05;

  const voice = pickVoice();
  if (voice) utterance.voice = voice;

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function cancelSpeech(): void {
  if (!speechAvailable()) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return speechAvailable() && window.speechSynthesis.speaking;
}

/** Prefer a natural-sounding local English voice where one exists. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const preferred = [
    /natural/i,
    /google (uk|us) english/i,
    /samantha/i,
    /daniel/i,
  ];
  for (const pattern of preferred) {
    const match = voices.find((v) => v.lang.startsWith('en') && pattern.test(v.name));
    if (match) return match;
  }
  return voices.find((v) => v.lang.startsWith('en')) ?? null;
}

export { currentUtterance };
