// Nested semicircles connecting the REAL detected troughs, all rising from a SHARED
// horizontal baseline (the bottom of the plot area) rather than each trough's own
// price -- matching the classic Hurst-cycle chart convention where every degree's
// arcs project from the same plane, so nested degrees visibly "diamond stack" at a
// shared trough instead of drifting to different heights because the real prices at
// those dates happen to differ.
//
// Drawn with SVG's elliptical-arc command with BOTH endpoints at the same y (the
// baseline) and rx=ry=half the x-gap -- a true semicircle whenever it fits. Very wide
// spans (an 18-year arc on a century chart) would otherwise tower far past the plot
// area, so the vertical radius is capped at `maxArcHeight`; because both endpoints
// stay level even when capped, the arc stays a symmetric dome (never the lopsided
// ellipse look that anchoring to differing real trough prices produced before).
//
// `actualTroughs` all come from the SAME "slow" pivot-scale detector regardless of
// nominal cycle (turn_targets.LADDER maps 18Y/9Y/54M -- and often several of SPY's
// cycles -- to one shared scale; see hurst_overlay.py). Drawing an arc between every
// consecutive pair would render ~200 tightly-packed micro-arcs that just retrace the
// price line, which is illegible AND misrepresents an 18-year cycle as if it turned
// every few months. `minGapDays` (derived from THIS cycle's own nominal_days_td, not
// invented) downsamples to troughs spaced at least that far apart before arcing
// between them -- a display-time filter on real data, not a new detector.
//
// NESTING: when several cycles share a pivot scale, Hurst's own principle is that a
// coarser cycle's trough IS one of the finer cycle's troughs (a bigger low is by
// definition also a smaller-degree low) -- so the caller (the page component) computes
// each group's downsampled lists HIERARCHICALLY via `nestedDownsample` below (coarser
// cycle downsamples from the next-finer cycle's OWN kept list, not independently from
// the raw list) and passes the already-final list here via `troughs` + `preDownsampled`.
// Independently downsampling each cycle from the raw list (the old behavior) could
// select different specific troughs per cycle even off the identical source data,
// since the greedy walk is sequential and a threshold difference earlier in the
// series cascades forward -- exactly the "why don't 18Y/9Y/54M troughs line up"
// mismatch this was rewritten to fix.
export const CALENDAR_DAYS_PER_TRADING_DAY = 7 / 5; // matches lib/hurst_fld.py's _CAL_PER_BAR

export function downsampleTroughs(troughs, minGapDays) {
  const kept = [];
  let lastDate = null;
  for (const t of troughs) {
    const d = new Date(t.d);
    if (!lastDate || (d - lastDate) / 86400000 >= minGapDays) {
      kept.push(t);
      lastDate = d;
    }
  }
  return kept;
}

// Groups `cycles` (keys into `cyclesData`, each {pivot_scale, nominal_days_td,
// actual_troughs}) by shared pivot_scale and sorts each group finest-to-coarsest --
// shared by nestedDownsample and mergedTailGroups below so both work off the exact
// same grouping.
function groupByPivotScale(cycles, cyclesData) {
  const byScale = new Map();
  for (const key of cycles) {
    const scale = cyclesData[key].pivot_scale;
    if (!byScale.has(scale)) byScale.set(scale, []);
    byScale.get(scale).push(key);
  }
  const groups = [...byScale.values()];
  for (const group of groups) {
    group.sort((a, b) => cyclesData[a].nominal_days_td - cyclesData[b].nominal_days_td);
  }
  return groups;
}

// Downsamples hierarchically so every coarser cycle's kept troughs are a genuine
// subset of the next-finer cycle's kept troughs (true nesting, not independent picks
// off the same raw list). Returns {cycleKey: downsampledTroughs[]}.
export function nestedDownsample(cycles, cyclesData, minGapFraction = 0.4) {
  const result = {};
  for (const group of groupByPivotScale(cycles, cyclesData)) {
    let current = [...cyclesData[group[0]].actual_troughs].sort((a, b) => new Date(a.d) - new Date(b.d));
    for (const key of group) {
      const minGapDays = cyclesData[key].nominal_days_td * CALENDAR_DAYS_PER_TRADING_DAY * minGapFraction;
      current = downsampleTroughs(current, minGapDays);
      result[key] = current;
    }
  }
  return result;
}

// Detects when a coarser cycle has stopped differentiating from its finest sibling:
// both share a pivot scale (so they read the SAME real confirmed-pivot list), and
// nesting means the coarser is always a subset of the finer -- but when the market
// goes quiet/volatile enough that the shared ATR-based detector stops confirming new
// reversals, the coarser cycle can end up keeping EVERY ONE of the finer cycle's
// recent troughs instead of the usual ~2:1 (or more) thinning. That's not lost
// structure or a downsampling bug (verified against real data: the underlying
// confirmed-pivot list itself is this sparse) -- it just means recent real reversals
// haven't cleared the confirmation threshold often enough to separate them, and the
// dashboard should say so rather than let two identical-looking arc sets pass
// silently. Returns [{cycles: [finest, ..., coarsest], sinceDate}] for each affected
// group, or [] if every active group is still differentiating normally.
export function mergedTailGroups(cycles, cyclesData, keptByCycle, lookback = 3) {
  const merged = [];
  for (const group of groupByPivotScale(cycles, cyclesData)) {
    if (group.length < 2) continue;
    const finestTail = (keptByCycle[group[0]] ?? []).slice(-lookback).map((t) => t.d);
    const coarsestTail = (keptByCycle[group[group.length - 1]] ?? []).slice(-lookback).map((t) => t.d);
    if (finestTail.length < lookback || coarsestTail.length < lookback) continue;
    if (finestTail.every((d, i) => d === coarsestTail[i])) {
      merged.push({ cycles: group, sinceDate: finestTail[0] });
    }
  }
  return merged;
}

// True semicircle (or, past maxHeight, a symmetric flatter dome) between x1 and x2,
// both endpoints pinned to the same baselineY. sweep=1 draws the arc over the TOP.
function domePath(x1, x2, baselineY, maxHeight) {
  const halfWidth = Math.abs(x2 - x1) / 2;
  const r = Math.min(halfWidth, maxHeight);
  return `M ${x1} ${baselineY} A ${halfWidth} ${r} 0 0 1 ${x2} ${baselineY}`;
}

export default function HurstArcOverlay({
  x,
  top,
  bottom,
  actualTroughs = [],
  preDownsampled = false,
  boundaries = [],
  nominalDaysTd,
  minGapFraction = 0.4,
  maxArcHeight = 140,
  tickRow = 0,
  color = '#6b8cff',
  dashColor = '#999',
  label,
}) {
  const sortedTroughs = [...actualTroughs].sort((a, b) => new Date(a.d) - new Date(b.d));
  // `preDownsampled`: the caller already ran nestedDownsample (see module docstring)
  // so sibling cycles nest correctly -- re-filtering here independently would undo
  // that guarantee, so this skips straight to using the given list as-is.
  const minGapDays = nominalDaysTd ? nominalDaysTd * CALENDAR_DAYS_PER_TRADING_DAY * minGapFraction : 0;
  const downsampled = preDownsampled ? sortedTroughs
    : (minGapDays > 0 ? downsampleTroughs(sortedTroughs, minGapDays) : sortedTroughs);

  const troughs = downsampled
    .map((t) => ({ x: x(new Date(t.d)), d: t.d }))
    .sort((a, b) => a.x - b.x);

  const baselineY = bottom;

  const arcs = [];
  for (let i = 0; i < troughs.length - 1; i++) {
    const a = troughs[i];
    const b = troughs[i + 1];
    if (b.x <= a.x) continue;
    arcs.push(
      <path
        key={`arc-${i}`}
        d={domePath(a.x, b.x, baselineY, maxArcHeight)}
        stroke={color}
        fill="none"
        className="hurst-arc"
      />
    );
  }

  // Projected continuation: from the last real trough toward the projected
  // next-trough window's time center. No future price exists to anchor a second
  // real endpoint, so this stays a clearly-dashed/translucent tail on the same
  // shared baseline -- a time cue, not a fabricated price forecast.
  const lastTrough = troughs[troughs.length - 1];
  const projectedBoundary = boundaries.find((b) => b.kind === 'projected');
  let projectedTail = null;
  if (lastTrough && projectedBoundary) {
    const px = x(new Date(projectedBoundary.d));
    if (px > lastTrough.x) {
      projectedTail = (
        <path
          d={domePath(lastTrough.x, px, baselineY, maxArcHeight)}
          stroke={color}
          fill="none"
          strokeDasharray="5,4"
          opacity={0.5}
          className="hurst-arc hurst-arc--projected"
        />
      );
    }
  }

  // Vertical lines at the REAL (downsampled) trough positions -- exactly where the
  // arcs above actually meet -- plus one lighter/dashed line at the projected
  // next-trough boundary, so the look-ahead gets a boundary marker too even though
  // no real trough exists there yet.
  const boundaryLines = troughs.map((t, i) => (
    <line
      key={`boundary-${i}`}
      x1={t.x} x2={t.x}
      y1={top} y2={bottom}
      stroke={dashColor}
      strokeDasharray="4,3"
      opacity={0.85}
      className="hurst-boundary"
    />
  ));
  if (lastTrough && projectedBoundary) {
    const px = x(new Date(projectedBoundary.d));
    if (px > lastTrough.x) {
      boundaryLines.push(
        <line
          key="boundary-projected"
          x1={px} x2={px}
          y1={top} y2={bottom}
          stroke={dashColor}
          strokeDasharray="4,3"
          opacity={0.45}
          className="hurst-boundary hurst-boundary--projected"
        />
      );
    }
  }

  const tickY = bottom + 8 + tickRow * 11;
  const troughTicks = troughs.map((t, i) => (
    <rect
      key={`tick-${i}`}
      x={t.x - 3.5} y={tickY - 3.5}
      width={7} height={7}
      transform={`rotate(45 ${t.x} ${tickY})`}
      fill={color}
      className="hurst-trough-tick"
    />
  ));

  return (
    <g className="hurst-arc-overlay" data-cycle={label}>
      {boundaryLines}
      {arcs}
      {projectedTail}
      {troughTicks}
    </g>
  );
}
