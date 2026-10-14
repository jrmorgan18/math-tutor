import type { HintVisual } from '../../engine/types';
import { computeJumps } from '../../engine/hintBuilders';

/**
 * Renders the picture attached to a hint.
 *
 * Everything here is SVG or plain divs — no images to ship, scales cleanly on
 * a tablet, and readable in the app's dark palette. Each renderer is
 * deliberately dumb: it draws exactly the numbers it is handed and computes
 * nothing about the maths, so a visual can never disagree with the problem it
 * belongs to.
 */
export function HintVisualView({ visual }: { visual: HintVisual }) {
  switch (visual.kind) {
    case 'stacked':
      return <Stacked v={visual} />;
    case 'numberline':
      return <NumberLine v={visual} />;
    case 'tenframe':
      return <TenFrames v={visual} />;
    case 'array':
      return <DotArray v={visual} />;
    case 'barmodel':
      return <BarModel v={visual} />;
    case 'groups':
      return <Groups v={visual} />;
    case 'placevalue':
      return <PlaceValue v={visual} />;
    case 'fractionbar':
      return <FractionShape v={visual} />;
    case 'clock':
      return <ClockFace v={visual} />;
    case 'coins':
      return <CoinRow v={visual} />;
    case 'shape':
      return <Polygon v={visual} />;
    case 'ruler':
      return <RulerBars v={visual} />;
  }
}

/* ------------------------------------------------------------- fractions */

function FractionShape({ v }: { v: Extract<HintVisual, { kind: 'fractionbar' }> }) {
  const one = (parts: number, shaded: number, key: string) =>
    v.shape === 'circle' ? (
      <PieShape key={key} parts={parts} shaded={shaded} />
    ) : (
      <div key={key} className="viz-fracbar">
        {Array.from({ length: parts }, (_, i) => (
          <div key={i} className={i < shaded ? 'viz-frac-part filled' : 'viz-frac-part'} />
        ))}
      </div>
    );

  return (
    <div className="viz viz-fraction">
      <div className="viz-fraction-row">
        {one(v.parts, v.shaded, 'a')}
        {v.compare ? <span className="viz-frac-vs">vs</span> : null}
        {v.compare ? one(v.compare.parts, v.compare.shaded, 'b') : null}
      </div>
      <div className="viz-caption">
        {v.shaded} of {v.parts} equal pieces
        {v.compare ? ` · ${v.compare.shaded} of ${v.compare.parts} equal pieces` : ''}
      </div>
    </div>
  );
}

/** Circle cut into equal wedges — the other everyday fraction picture. */
function PieShape({ parts, shaded }: { parts: number; shaded: number }) {
  const R = 34;
  const C = 40;
  const wedge = (i: number) => {
    const a0 = (i / parts) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / parts) * Math.PI * 2 - Math.PI / 2;
    const x0 = C + R * Math.cos(a0);
    const y0 = C + R * Math.sin(a0);
    const x1 = C + R * Math.cos(a1);
    const y1 = C + R * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
  };

  return (
    <svg viewBox="0 0 80 80" className="viz-svg viz-pie" role="img" aria-label={`${shaded} of ${parts} parts shaded`}>
      {Array.from({ length: parts }, (_, i) => (
        <path
          key={i}
          d={wedge(i)}
          className={i < shaded ? 'viz-frac-wedge filled' : 'viz-frac-wedge'}
        />
      ))}
    </svg>
  );
}

/* ----------------------------------------------------------------- clock */

function ClockFace({ v }: { v: Extract<HintVisual, { kind: 'clock' }> }) {
  const C = 60;
  const R = 52;
  // The hour hand moves continuously — at half past it sits between numbers.
  // Drawing it parked on the hour would teach the wrong reading.
  const hourAngle = ((v.hour % 12) + v.minute / 60) * 30 - 90;
  const minuteAngle = v.minute * 6 - 90;
  const hand = (angle: number, len: number) => ({
    x2: C + len * Math.cos((angle * Math.PI) / 180),
    y2: C + len * Math.sin((angle * Math.PI) / 180),
  });
  const hh = hand(hourAngle, 27);
  const mm = hand(minuteAngle, 42);

  return (
    <div className="viz">
      <svg viewBox="0 0 120 120" className="viz-svg viz-clock" role="img" aria-label="Clock face">
        <circle cx={C} cy={C} r={R} className="viz-clock-face" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = ((i + 1) * 30 - 90) * (Math.PI / 180);
          return (
            <text
              key={i}
              x={C + (R - 11) * Math.cos(a)}
              y={C + (R - 11) * Math.sin(a) + 4}
              textAnchor="middle"
              className="viz-label"
            >
              {i + 1}
            </text>
          );
        })}
        {/* Minute ticks: the five-minute counting is only learnable if the
            marks he counts are actually on the face. */}
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i * 6 - 90) * (Math.PI / 180);
          const inner = i % 5 === 0 ? R - 5 : R - 3;
          return (
            <line
              key={`t${i}`}
              x1={C + inner * Math.cos(a)}
              y1={C + inner * Math.sin(a)}
              x2={C + R * Math.cos(a)}
              y2={C + R * Math.sin(a)}
              className={i % 5 === 0 ? 'viz-clock-tick major' : 'viz-clock-tick'}
            />
          );
        })}
        <line x1={C} y1={C} x2={hh.x2} y2={hh.y2} className="viz-clock-hand hour" />
        <line x1={C} y1={C} x2={mm.x2} y2={mm.y2} className="viz-clock-hand minute" />
        <circle cx={C} cy={C} r={3} className="viz-clock-pin" />
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------------- money */

/**
 * Relative sizes match real US coins (a dime really is smaller than a penny),
 * because "the small silver one is worth more than the big brown one" is a
 * genuinely counter-intuitive fact worth showing rather than flattening.
 * Absolute sizes are set so the value stays legible on a tablet.
 */
const COIN_META: Record<number, { label: string; name: string; size: number; tone: string }> = {
  1: { label: '1¢', name: 'penny', size: 40, tone: 'copper' },
  5: { label: '5¢', name: 'nickel', size: 46, tone: 'silver' },
  10: { label: '10¢', name: 'dime', size: 36, tone: 'silver' },
  25: { label: '25¢', name: 'quarter', size: 54, tone: 'silver' },
};

function CoinRow({ v }: { v: Extract<HintVisual, { kind: 'coins' }> }) {
  return (
    <div className="viz">
      <div className="viz-coins">
        {v.values.map((c, i) => {
          const meta = COIN_META[c] ?? { label: `${c}¢`, name: `${c} cents`, size: 44, tone: 'silver' };
          return (
            <div
              key={i}
              className={`viz-coin ${meta.tone}`}
              style={{ width: meta.size, height: meta.size }}
              title={meta.name}
            >
              {meta.label}
            </div>
          );
        })}
      </div>
      <div className="viz-caption">
        {v.total !== undefined ? `Total: ${v.total}¢` : `${v.values.length} coins`}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- polygons */

export function symmetryAxes(points: Array<readonly [number, number]>, rectangle = false) {
  const n = points.length;
  const midpoint = (i: number): readonly [number, number] => {
    const a = points[i % n]!; const b = points[(i + 1) % n]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const axes: Array<[readonly [number, number], readonly [number, number]]> = [];
  if (n % 2 === 0) {
    for (let i = 0; i < n / 2; i++) {
      if (!rectangle) axes.push([points[i]!, points[i + n / 2]!]);
      axes.push([midpoint(i), midpoint(i + n / 2)]);
    }
  } else {
    for (let i = 0; i < n; i++) axes.push([points[i]!, midpoint(i + (n - 1) / 2)]);
  }
  return axes;
}

function Polygon({ v }: { v: Extract<HintVisual, { kind: 'shape' }> }) {
  const C = 60;
  const R = 44;
  const n = Math.max(3, v.sides);

  /**
   * A four-sided shape with side labels is drawn to its real proportions
   * rather than as a regular polygon.
   *
   * Otherwise a rectangle labelled 4 and 11 renders as a square, and the
   * picture flatly contradicts the lesson it exists to teach — that opposite
   * sides match *and the adjacent ones do not*. A visual that disagrees with
   * the maths is worse than no visual at all.
   */
  const rect =
    n === 4 && v.sideLabels?.length === 4
      ? { w: v.sideLabels[0] as number, h: v.sideLabels[1] as number }
      : n === 4 && v.label === 'rectangle' ? { w: 8, h: 5 } : null;

  let points: Array<readonly [number, number]>;
  if (rect) {
    // Fit the longer side to the full box and scale the other to match.
    const longest = Math.max(rect.w, rect.h);
    const halfW = (R * rect.w) / longest;
    const halfH = (R * rect.h) / longest;
    points = [
      [C - halfW, C - halfH],
      [C + halfW, C - halfH],
      [C + halfW, C + halfH],
      [C - halfW, C + halfH],
    ];
  } else if (n === 3 && v.sideLabels?.length === 3) {
    const [a, b, c] = v.sideLabels as [number, number, number];
    const x = (c * c + a * a - b * b) / (2 * a);
    const y = Math.sqrt(Math.max(0, c * c - x * x));
    const lo = Math.min(0, x), hi = Math.max(a, x);
    const scale = 2 * R / Math.max(hi - lo, y, 1);
    const raw = [[0, 0], [a, 0], [x, -y]];
    points = raw.map(([px, py]) => [C + (px! - (lo + hi) / 2) * scale, C + (py! + y / 2) * scale] as const);
  } else {
    // Point-down start angle so a triangle sits on a flat base and a square
    // reads as a square rather than a diamond.
    const rotate = n % 2 === 0 ? Math.PI / n : -Math.PI / 2;
    points = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + rotate;
      return [C + R * Math.cos(a), C + R * Math.sin(a)] as const;
    });
  }

  return (
    <div className="viz">
      <svg viewBox="0 0 120 120" className="viz-svg viz-shape" role="img" aria-label={v.label ?? `${n}-sided shape`}>
        <polygon points={points.map(([x, y]) => `${x},${y}`).join(' ')} className="viz-poly" />
        {v.symmetry ? symmetryAxes(points, v.label === 'rectangle').map(([start, end], i) => (
          <line key={`sym${i}`} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]}
            className="viz-poly-symmetry" />
        )) : null}
        {v.sideLabels?.map((len, i) => {
          const [x0, y0] = points[i] as readonly [number, number];
          const [x1, y1] = points[(i + 1) % n] as readonly [number, number];
          const mx = (x0 + x1) / 2;
          const my = (y0 + y1) / 2;
          // Push the label outward from the centre so it clears the edge.
          const dx = mx - C;
          const dy = my - C;
          const d = Math.max(1, Math.hypot(dx, dy));
          return (
            <text
              key={`lab${i}`}
              x={mx + (dx / d) * 13}
              y={my + (dy / d) * 13 + 4}
              textAnchor="middle"
              className="viz-label viz-label-accent"
            >
              {len}
            </text>
          );
        })}
      </svg>
      {v.label ? <div className="viz-caption">{v.label}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- ruler */

function RulerBars({ v }: { v: Extract<HintVisual, { kind: 'ruler' }> }) {
  const max = Math.max(1, ...v.lengths);
  const W = 300;
  const padX = 14;
  const scale = (W - padX * 2) / max;
  const tickEvery = max > 40 ? 10 : max > 20 ? 5 : 1;

  return (
    <div className="viz">
      <svg
        viewBox={`0 0 ${W} ${34 + v.lengths.length * 22}`}
        className="viz-svg"
        role="img"
        aria-label={`Lengths: ${v.lengths.join(', ')} ${v.unit}`}
      >
        {v.lengths.map((len, i) => (
          <g key={i}>
            <rect
              x={padX}
              y={10 + i * 22}
              width={len * scale}
              height={13}
              rx={3}
              className={i === 0 ? 'viz-ruler-bar' : 'viz-ruler-bar alt'}
            />
            <text x={padX + len * scale + 6} y={21 + i * 22} className="viz-label">
              {len}
            </text>
          </g>
        ))}
        {/* Scale underneath, so the bars are read off a ruler rather than
            compared by eye alone. */}
        <line
          x1={padX}
          y1={16 + v.lengths.length * 22}
          x2={padX + max * scale}
          y2={16 + v.lengths.length * 22}
          stroke="var(--text-dim)"
          strokeWidth="2"
        />
        {Array.from({ length: Math.floor(max / tickEvery) + 1 }, (_, i) => i * tickEvery).map((t) => (
          <g key={`tk${t}`}>
            <line
              x1={padX + t * scale}
              y1={12 + v.lengths.length * 22}
              x2={padX + t * scale}
              y2={20 + v.lengths.length * 22}
              stroke="var(--text-dim)"
              strokeWidth="1.5"
            />
            <text
              x={padX + t * scale}
              y={31 + v.lengths.length * 22}
              textAnchor="middle"
              className="viz-label"
            >
              {t}
            </text>
          </g>
        ))}
      </svg>
      <div className="viz-caption">Measured in {v.unit}</div>
    </div>
  );
}

/* ---------------------------------------------------------- place value */

function PlaceValue({ v }: { v: Extract<HintVisual, { kind: 'placevalue' }> }) {
  const cols: Array<{ key: 'hundreds' | 'tens' | 'ones'; label: string; count: number; worth: number }> = [
    { key: 'hundreds', label: 'hundreds', count: v.hundreds, worth: 100 },
    { key: 'tens', label: 'tens', count: v.tens, worth: 10 },
    { key: 'ones', label: 'ones', count: v.ones, worth: 1 },
  ];
  // Drop a leading empty hundreds column for two-digit numbers, but never a
  // middle zero — that zero is the whole lesson.
  const visible = v.hundreds === 0 ? cols.slice(1) : cols;

  return (
    <div className="viz">
      <div className="viz-pv">
        {visible.map((c) => (
          <div
            key={c.key}
            className={c.key === v.highlight ? 'viz-pv-col highlight' : 'viz-pv-col'}
          >
            <div className="viz-pv-label">{c.label}</div>
            <div className="viz-pv-digit">{c.count}</div>
            <div className="viz-pv-worth">{c.count * c.worth}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- stacked */

function Stacked({ v }: { v: Extract<HintVisual, { kind: 'stacked' }> }) {
  const width = Math.max(String(v.top).length, String(v.bottom).length, String(v.result ?? '').length);
  const pad = (n: number | undefined) =>
    n === undefined ? '' : String(n).padStart(width, ' ');

  return (
    <div className="viz viz-stacked mono">
      <div className="viz-stacked-row">
        <span className="viz-stacked-op" />
        <span>{pad(v.top)}</span>
      </div>
      <div className="viz-stacked-row">
        <span className="viz-stacked-op">{v.op}</span>
        <span>{pad(v.bottom)}</span>
      </div>
      <div className="viz-stacked-rule" />
      {v.result !== undefined ? (
        <div className="viz-stacked-row viz-stacked-result">
          <span className="viz-stacked-op" />
          <span>{pad(v.result)}</span>
        </div>
      ) : (
        <div className="viz-stacked-row viz-stacked-unknown">
          <span className="viz-stacked-op" />
          <span>{'?'.padStart(width, ' ')}</span>
        </div>
      )}
      {v.highlight ? (
        <div className="viz-caption">
          Look at the {v.highlight} column {v.op === '+' ? 'to carry' : 'to borrow'}.
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- number line */

function NumberLine({ v }: { v: Extract<HintVisual, { kind: 'numberline' }> }) {
  const jumps = computeJumps(v.from, v.to);
  const lo = Math.min(v.from, v.to);
  const hi = Math.max(v.from, v.to);
  const span = Math.max(1, hi - lo);

  const W = 300;
  const H = 78;
  const padX = 26;
  const baseY = 56;
  const x = (n: number) => padX + ((n - lo) / span) * (W - padX * 2);

  // Cumulative jump boundaries, so each arc is drawn between real values.
  const stops: number[] = [v.from];
  let cursor = v.from;
  const dir = v.to >= v.from ? 1 : -1;
  for (const j of jumps) {
    cursor += j * dir;
    stops.push(cursor);
  }

  return (
    <div className="viz">
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label={`Number line from ${v.from} to ${v.to}`}>
        <line x1={padX} y1={baseY} x2={W - padX} y2={baseY} stroke="var(--text-dim)" strokeWidth="2" />
        {stops.map((s, i) => (
          <g key={`${s}-${i}`}>
            <line x1={x(s)} y1={baseY - 6} x2={x(s)} y2={baseY + 6} stroke="var(--text)" strokeWidth="2" />
            <text x={x(s)} y={baseY + 20} textAnchor="middle" className="viz-label">
              {i === stops.length - 1 && v.unknownLabel ? v.unknownLabel : s}
            </text>
          </g>
        ))}
        {stops.slice(0, -1).map((s, i) => {
          const next = stops[i + 1] as number;
          const midX = (x(s) + x(next)) / 2;
          const arcTop = baseY - 26;
          return (
            <g key={`arc-${i}`}>
              <path
                d={`M ${x(s)} ${baseY - 8} Q ${midX} ${arcTop} ${x(next)} ${baseY - 8}`}
                fill="none"
                stroke="var(--cyan)"
                strokeWidth="2.5"
              />
              <text x={midX} y={arcTop - 2} textAnchor="middle" className="viz-label viz-label-accent">
                {dir > 0 ? '+' : '−'}{Math.abs(next - s)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------- ten frames */

function TenFrames({ v }: { v: Extract<HintVisual, { kind: 'tenframe' }> }) {
  // `a` fills first, then `b` continues into the same frames — which is what
  // makes "you need N more to finish the ten" visible rather than asserted.
  const total = Math.min(20, v.a + v.b);
  const cell = (i: number) => (i < v.a ? 'a' : i < total ? 'b' : 'empty');

  const frame = (offset: number) => (
    <div className="viz-tenframe">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`viz-cell viz-cell-${cell(offset + i)}`} />
      ))}
    </div>
  );

  return (
    <div className="viz viz-tenframes">
      {frame(0)}
      {total > 10 ? frame(10) : null}
      <div className="viz-caption">
        {v.a} and {v.b} more
        {v.a + v.b > 10 ? ` — ${10 - v.a} of them finish the ten` : ''}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- array */

function DotArray({ v }: { v: Extract<HintVisual, { kind: 'array' }> }) {
  return (
    <div className="viz">
      <div className="viz-array" style={{ gridTemplateColumns: `repeat(${v.cols}, 1fr)` }}>
        {Array.from({ length: v.rows * v.cols }, (_, i) => (
          <div key={i} className="viz-dot" />
        ))}
      </div>
      <div className="viz-caption">
        {v.rows} rows of {v.cols}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- bar model */

function BarModel({ v }: { v: Extract<HintVisual, { kind: 'barmodel' }> }) {
  // Width each part gets. Known parts are sized proportionally; an unknown
  // part takes whatever is left, so the picture stays honest about scale.
  const known = v.parts.filter((p): p is number => p !== null);
  const knownSum = known.reduce((a, b) => a + b, 0);
  const unknownCount = v.parts.length - known.length;
  const total = v.whole ?? knownSum + unknownCount * (knownSum / Math.max(1, known.length));
  const remainder = Math.max(0, total - knownSum);

  const widthOf = (p: number | null) =>
    p === null
      ? `${(remainder / unknownCount / total) * 100}%`
      : `${(p / total) * 100}%`;

  return (
    <div className="viz viz-barmodel">
      <div className="viz-bar viz-bar-whole">
        {v.whole === null ? <span className="viz-unknown">?</span> : v.whole}
      </div>
      <div className="viz-bar-row">
        {v.parts.map((p, i) => (
          <div key={i} className="viz-bar viz-bar-part" style={{ width: widthOf(p) }}>
            {p === null ? <span className="viz-unknown">?</span> : p}
          </div>
        ))}
      </div>
      <div className="viz-caption">The two parts together make the whole.</div>
    </div>
  );
}

/* -------------------------------------------------------------- groups */

function Groups({ v }: { v: Extract<HintVisual, { kind: 'groups' }> }) {
  return (
    <div className="viz">
      <div className="viz-groups">
        {Array.from({ length: v.groups }, (_, g) => (
          <div key={g} className="viz-group">
            {Array.from({ length: v.per }, (_, i) => (
              <div key={i} className="viz-dot" />
            ))}
          </div>
        ))}
      </div>
      <div className="viz-caption">
        {v.groups} groups of {v.per}
      </div>
    </div>
  );
}
