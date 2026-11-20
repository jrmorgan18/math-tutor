import { Rng, numericChoices } from '../rng';
import { arrayIfSmall, clock, fractionbar, h, numberline } from '../hintBuilders';
import type { Problem } from '../types';
import { timeClock } from './measurement';

/** New skill IDs leave every historical generator's numbers and answers intact. */
export function clockReading(level: number, seed: number): Problem {
  if (level < 4) return { ...timeClock(level, seed), skillId: 'clock-reading' };
  const rng = new Rng(seed);
  const hour = rng.int(1, 12), minute = rng.pick([5, 10, 20, 25, 35, 40, 50, 55]);
  const answer = timeLabel(hour * 60 + minute);
  const options = new Set([answer, timeLabel((hour + 1) * 60 + minute), timeLabel(hour * 60 + minute + 5)]);
  while (options.size < 4) options.add(timeLabel(rng.int(1, 12) * 60 + rng.int(0, 11) * 5));
  return { skillId: 'clock-reading', level, seed, prompt: 'What time does this clock show?',
    questionVisual: clock(hour, minute), answer, representation: { kind: 'choice', options: rng.shuffle([...options]) },
    hints: [h('Read the long hand in steps of five minutes. Then find the hour the short hand has passed.'),
      h(`The long hand shows ${minute} minutes. Read the hour next.`, clock(hour, minute)),
      h(`The hour hand has passed ${hour}. The time is ${answer}.`, clock(hour, minute))],
    meta: { operands: [hour, minute], tags: ['clock-reading', 'five-minute-time'] } };
}

function timeLabel(total: number): string {
  return `${Math.floor(total / 60) % 12 || 12}:${String(total % 60).padStart(2, '0')}`;
}

export function elapsedTime(level: number, seed: number): Problem {
  const rng = new Rng(seed), hour = rng.int(1, 12);
  const minute = level === 1 ? rng.pick([0, 5, 10, 15, 20]) : rng.pick([35, 40, 45, 50, 55]);
  const duration = level === 1 ? rng.pick([5, 10, 15, 20]) : rng.pick([30, 35, 40, 45]);
  const start = hour * 60 + minute, end = start + duration;
  const answer = level === 3 ? String(duration) : timeLabel(end);
  return { skillId: 'elapsed-time', level, seed, flavor: 'dino',
    prompt: level === 3 ? `The dig starts at ${timeLabel(start)} and ends at ${timeLabel(end)}.` :
      `The dig starts at ${timeLabel(start)} and lasts ${duration} minutes.`,
    subPrompt: level === 3 ? 'How many minutes does it last?' : 'What time does it finish?', answer,
    representation: level === 3 ? { kind: 'numeric' } : { kind: 'choice', options: rng.shuffle([
      answer, timeLabel(end + 60), timeLabel(end + 5), timeLabel(end - 5)]) },
    hints: [h('Count forward in five-minute steps. When the minutes reach 60, start the next hour.'),
      h(`Start at ${timeLabel(start)}. ${60 - minute} minutes reaches the next hour.`, numberline(minute, minute + duration)),
      h(`${timeLabel(start)} plus ${duration} minutes is ${timeLabel(end)}. The dig lasts ${duration} minutes.`)],
    meta: level === 3 ? { operands: [end, start], op: '-', tags: ['elapsed-time', 'hour-boundary'] } :
      { operands: [start, duration], tags: ['elapsed-time', ...(level > 1 ? ['hour-boundary'] : [])] } };
}

export function mult68(level: number, seed: number): Problem {
  const rng = new Rng(seed), table = level === 1 ? 6 : rng.pick([6, 8]);
  const other = rng.int(2, level === 1 ? 6 : level === 2 ? 10 : 12);
  const [a, b] = rng.bool() ? [table, other] : [other, table], answer = a * b;
  const half = table / 2;
  return { skillId: 'mult-6-8', level, seed, prompt: `${a} × ${b}`, answer: String(answer),
    representation: { kind: 'numeric' }, hints: [h(`Use the ${half} times table, then double it.`),
      h(`${half} × ${other} = ${half * other}. Double that amount.`, arrayIfSmall(half, other)),
      h(`Double ${half * other} is ${answer}, so ${a} × ${b} = ${answer}.`, arrayIfSmall(table, other))],
    meta: { operands: [a, b], op: '×', tags: ['doubling', 'multiplication-fact'] } };
}

export function area(level: number, seed: number): Problem {
  const rng = new Rng(seed), rows = rng.int(2, 6), cols = rng.int(2, 8), first = rows * cols;
  const secondRows = rng.int(2, 5), secondCols = rng.int(2, 6), second = secondRows * secondCols;
  const answer = level === 3 ? first + second : first;
  return { skillId: 'area', level, seed, flavor: 'dino',
    prompt: level === 3 ? `One rectangular habitat floor is ${rows} m by ${cols} m. Another is ${secondRows} m by ${secondCols} m.` :
      level === 1 ? 'How many unit squares cover this habitat floor?' : `A rectangular habitat floor is ${rows} m by ${cols} m.`,
    subPrompt: level === 3 ? 'What is their total area in square metres?' : level === 2 ? 'What is its area in square metres?' : undefined,
    questionVisual: level < 3 ? { kind: 'squaregrid', rows, cols, showGrid: level === 1 } : undefined,
    answer: String(answer), representation: { kind: 'numeric' }, hints: [
      h('Area measures the surface inside the habitat in square units. Perimeter measures the fence around it.'),
      h(`There are ${rows} rows of ${cols} squares, so this floor covers ${first} square units.`, { kind: 'squaregrid', rows, cols, showGrid: true }),
      h(level === 3 ? `${rows} × ${cols} = ${first} and ${secondRows} × ${secondCols} = ${second}. Total: ${first} + ${second} = ${answer} square metres.` :
        `${rows} × ${cols} = ${answer} square units.`)],
    meta: level === 3 ? { operands: [first, second], op: '+', tags: ['area', 'multi-step'] } :
      { operands: [rows, cols], op: '×', tags: ['area', 'equal-rows'] } };
}

export function fractionEquivalence(level: number, seed: number): Problem {
  const rng = new Rng(seed), bottom = rng.pick([2, 3, 4]), top = rng.int(1, bottom - 1);
  const scale = rng.pick([2, 3]), parts = bottom * scale, marked = top * scale;
  const base = { skillId: 'fraction-equivalence', level, seed, flavor: 'lab' as const };
  if (level === 2) return { ...base, prompt: `${top}/${bottom} = ?/${parts}`, subPrompt: 'Which numerator completes the equivalent fraction?',
    answer: String(marked), representation: { kind: 'numeric' }, hints: [
      h('Cut every piece into the same number of smaller pieces. The amount stays the same.', fractionbar(bottom, top)),
      h(`Each original piece becomes ${scale} pieces. Multiply both numbers by ${scale}.`),
      h(`${top} × ${scale} = ${marked}, so ${top}/${bottom} = ${marked}/${parts}.`, fractionbar(parts, marked))],
    meta: { operands: [top, scale], op: '×', tags: ['fraction-equivalence'] } };
  const answer = `${marked}/${parts}`;
  const wrong = numericChoices(rng, marked, 4, 2).map(n => `${n}/${parts}`);
  return { ...base, prompt: level === 1 ? `Which fraction has the same value as ${top}/${bottom}?` : 'Which fraction labels the marked point?',
    questionVisual: level === 1 ? fractionbar(bottom, top) : { kind: 'fractionline', parts, marked },
    answer, representation: { kind: 'choice', options: wrong }, hints: [
      h(level === 1 ? 'The size of the shaded amount must stay the same.' : 'The line from 0 to 1 is one whole. Count equal intervals, not tick marks.'),
      h(`Split the whole into ${parts} equal pieces.`, fractionbar(parts, marked)),
      h(`${marked}/${parts} is the same amount as ${top}/${bottom}.`, { kind: 'fractionline', parts, marked })],
    meta: { operands: [marked, parts], tags: ['fraction-equivalence', ...(level === 3 ? ['fraction-number-line'] : [])] } };
}
