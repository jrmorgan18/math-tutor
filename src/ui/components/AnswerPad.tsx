import { useState } from 'react';
import { sfx } from '../audio';
import type { Representation } from '../../engine/types';

/**
 * Answer input.
 *
 * Numeric answers get a large keypad rather than the OS keyboard: a software
 * keyboard on a tablet covers half the screen, hides the question, and puts
 * the digits in a layout built for adults typing prose. Choice answers get
 * full-width tap targets.
 *
 * Numeric entries are explicitly confirmed so accidental taps can be corrected.
 */

interface Props {
  representation: Representation;
  value: string;
  disabled: boolean;
  soundOn: boolean;
  /** Only set once answered, so choices can show what was right. */
  reveal: { picked: string; answer: string } | null;
  /**
   * Semantic events rather than a computed next-value. The pad must not
   * derive the new string from the `value` prop: two taps inside one React
   * batch would both read the same stale prop and silently drop a digit. The
   * parent owns the current value in a ref and applies these itself.
   */
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  /**
   * Set the whole entry at once. Needed by the modes that don't build their
   * answer left-to-right one digit at a time — a tapped quantity, or column
   * entry that fills right-to-left. Expressing those as a sequence of
   * backspaces is not just clumsy, it is wrong: one backspace cannot clear a
   * two-digit count, so the old value's leading digit survives into the new one.
   */
  onReplace: (next: string) => void;
  onSubmit: (value: string) => void;
}

export function AnswerPad({
  representation,
  value,
  disabled,
  soundOn,
  reveal,
  onDigit,
  onBackspace,
  onReplace,
  onSubmit,
}: Props) {
  const [demo, setDemo] = useState(() => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('column-demo-v1') !== 'seen');
  /**
   * Build mode: he taps out the quantity instead of typing a numeral.
   *
   * This exists mostly to break the monotony of twenty-one identical keypad
   * entries, but it earns its place pedagogically too — for small quantities,
   * making the amount is a more honest demonstration than recalling a digit.
   * `value` stays the source of truth (the count as a string), so submission,
   * scoring and error classification are all unchanged.
   */
  if (representation.kind === 'build') {
    const count = Number(value) || 0;
    const { max, mode } = representation;
    const setCount = (n: number) => {
      sfx.tap(soundOn);
      onReplace(n === 0 ? '' : String(n));
    };

    return (
      <div className="buildpad">
        <div className={mode === 'tenframe' ? 'build-tenframe' : 'build-array'}>
          {Array.from({ length: max }, (_, i) => (
            <button
              key={i}
              className={i < count ? 'build-cell filled' : 'build-cell'}
              disabled={disabled}
              aria-label={`Set to ${i + 1}`}
              // Tapping cell i means "make it this many" — far easier for a
              // child than toggling individual cells and losing count.
              onClick={() => setCount(i + 1 === count ? i : i + 1)}
            />
          ))}
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="build-count mono">{count}</div>
          <button
            className="btn btn-primary grow"
            disabled={disabled || value.length === 0}
            onClick={() => onSubmit(value)}
          >
            ✓ That’s my answer
          </button>
        </div>
      </div>
    );
  }

  /**
   * Column entry: ones first, then tens, right to left.
   *
   * Typing `81` as one number hides whether he carried or simply knew the
   * fact. Filling the ones column, seeing it overflow, and then writing the
   * tens makes the algorithm itself the thing being practised — which is the
   * whole point of teaching column arithmetic rather than mental recall.
   */
  if (representation.kind === 'columns') {
    const { columns } = representation;
    // `value` is the answer as normally written (left to right). Entry runs the
    // other way, so track how many columns are filled from the right.
    const filled = value.length;
    const digitsRightToLeft = value.split('').reverse();
    const activeColumn = filled; // 0 = ones, 1 = tens, ...

    const columnName = (i: number) => (i === 0 ? 'ones' : i === 1 ? 'tens' : 'hundreds');

    const press = (digit: string) => {
      if (disabled || filled >= columns) return;
      sfx.tap(soundOn);
      // Newest digit is the next column to the left, so it goes on the front.
      onDigit(digit);
    };

    return (
      <div className="colpad">
        {demo ? <div className="hint">
          <strong>Start on the right: ones → tens → hundreds.</strong>
          <p>Example: to enter 42, tap 2 in ones, then 4 in tens. The boxes show 42. Use ⌫ to undo the latest column before sending.</p>
          <button className="btn btn-ghost" onClick={() => { setDemo(false); sessionStorage.setItem('column-demo-v1', 'seen'); }}>Got it</button>
        </div> : <details className="small"><summary>How to fill columns</summary>For 42: enter 2 in ones, then 4 in tens. Use ⌫ to correct.</details>}
        <div className="colpad-prompt">← Fill from the right · ones first</div>
        <div className="colpad-boxes">
          {Array.from({ length: columns }, (_, i) => {
            // Render left to right, but index from the right.
            const fromRight = columns - 1 - i;
            const d = digitsRightToLeft[fromRight];
            const isActive = fromRight === activeColumn;
            return (
              <div
                key={i}
                aria-current={isActive ? 'step' : undefined}
                className={`colpad-box${d !== undefined ? ' filled' : ''}${isActive ? ' active' : ''}`}
              >
                <span className="colpad-box-label">{columnName(fromRight)}</span>
                <span className="colpad-box-digit mono">{d ?? ''}</span>
              </div>
            );
          })}
        </div>
        <div className="colpad-prompt">
          {filled >= columns
            ? 'All columns filled — check it and send it.'
            : `Which digit goes in the ${columnName(activeColumn)} column?`}
        </div>
        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              className="key"
              disabled={disabled || filled >= columns}
              onClick={() => press(d)}
            >
              {d}
            </button>
          ))}
          <button
            className="key"
            disabled={disabled || filled === 0}
            onClick={() => {
              sfx.tap(soundOn);
              // Undo the most recent column, which is the leftmost digit.
              onBackspace();
            }}
            aria-label="Undo last column"
          >
            ⌫
          </button>
          <button
            className="key"
            disabled={disabled || filled >= columns}
            onClick={() => press('0')}
          >
            0
          </button>
          <button
            className="key key-go"
            disabled={disabled || filled < columns}
            onClick={() => onSubmit(value)}
            aria-label="Submit answer"
          >
            ✓
          </button>
        </div>
      </div>
    );
  }

  /**
   * Number-line input: drag or tap a marker onto the right value.
   *
   * For a child who can *place* 47 confidently but stumbles writing the
   * numeral, this separates number sense from numeral recall. It is also the
   * only input where being close is visible feedback in itself.
   */
  if (representation.kind === 'numberline') {
    const { from, to, step } = representation;
    const span = Math.max(1, to - from);
    const picked = value === '' ? null : Number(value);
    const ticks = Math.floor(span / step) + 1;

    const choose = (n: number) => {
      if (disabled) return;
      sfx.tap(soundOn);
      onReplace(String(n));
    };

    return (
      <div className="nlpad">
        <div className="nlpad-scroll"><div className="nlpad-track" style={{ width: Math.max(300, (ticks - 1) * 48) }}>
          {Array.from({ length: ticks }, (_, i) => {
            const n = from + i * step;
            const pct = ((n - from) / span) * 100;
            // Only label the round numbers, or the line becomes unreadable.
            const labelled = n % (step * (ticks > 12 ? 5 : 2)) === 0 || i === 0 || i === ticks - 1;
            return (
              <button
                key={n}
                className={`nlpad-tick${picked === n ? ' picked' : ''}${labelled ? ' labelled' : ''}`}
                style={{ left: `${pct}%` }}
                disabled={disabled}
                aria-label={String(n)}
                onClick={() => choose(n)}
              >
                {labelled ? <span className="nlpad-tick-label">{n}</span> : null}
              </button>
            );
          })}
          <div className="nlpad-line" />
          {picked !== null ? (
            <div
              className="nlpad-marker"
              style={{ left: `${((picked - from) / span) * 100}%` }}
            >
              ▼
            </div>
          ) : null}
        </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="build-count mono">{picked ?? '—'}</div>
          <button
            className="btn btn-primary grow"
            disabled={disabled || picked === null}
            onClick={() => onSubmit(value)}
          >
            ✓ That’s my answer
          </button>
        </div>
      </div>
    );
  }

  if (representation.kind === 'choice') {
    const { options } = representation;
    // Long option text (repeated-addition expressions, rule descriptions)
    // needs the full width to stay readable.
    const wide = options.some((o) => o.length > 9);
    return (
      <div className={wide ? 'choices wide' : 'choices'}>
        {options.map((option) => {
          let cls = 'choice';
          if (reveal) {
            if (option === reveal.picked) {
              cls += option === reveal.answer ? ' picked-correct' : ' picked-wrong';
            } else if (option === reveal.answer) {
              cls += ' reveal';
            }
          }
          return (
            <button
              key={option}
              className={cls}
              disabled={disabled}
              onClick={() => {
                sfx.tap(soundOn);
                onSubmit(option);
              }}
            >
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  const press = (digit: string) => {
    if (disabled) return;
    sfx.tap(soundOn);
    onDigit(digit);
  };

  return (
    <div className="keypad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} className="key" disabled={disabled} onClick={() => press(d)}>
          {d}
        </button>
      ))}
      <button
        className="key"
        disabled={disabled || value.length === 0}
        onClick={() => {
          sfx.tap(soundOn);
          onBackspace();
        }}
        aria-label="Delete"
      >
        ⌫
      </button>
      <button className="key" disabled={disabled} onClick={() => press('0')}>
        0
      </button>
      <button
        className="key key-go"
        disabled={disabled || value.length === 0}
        onClick={() => onSubmit(value)}
        aria-label="Submit answer"
      >
        ✓
      </button>
    </div>
  );
}
