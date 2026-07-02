import { useEffect, useRef, useState } from 'react';
import { scaleLog, scaleUtc } from 'd3-scale';
import { extent } from 'd3-array';
import { format } from 'd3-format';
import { utcYear } from 'd3-time';
import { utcFormat } from 'd3-time-format';
import { ZoomTransform } from 'd3-zoom';
import Candlesticks from './Candlesticks';

const priceFormat = format(',.2~f');
const defaultXFormat = utcFormat('%Y');

const MIN_K = 1;
const MAX_K = 40;

// Clamp so the LEFT edge of the visible window never reveals a date before
// `minDateVal` (e.g. GSPC's real 1927 data start, or SPY's extended-lookback
// boundary) -- panning/zooming further left just stops there instead of showing
// empty space. Only the left edge is bounded; the right side is left free since
// panels already extend it deliberately (scenario cone, projected Hurst windows).
function clampView(v, baseXScale, minDateVal, marginLeft) {
  if (!minDateVal) return v;
  const maxTx = marginLeft - v.kx * baseXScale(minDateVal);
  return v.tx > maxTx ? { ...v, tx: maxTx } : v;
}

function touchDist(t0, t1) {
  return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
}

function isFiniteView(v) {
  return Number.isFinite(v.kx) && Number.isFinite(v.ky) && Number.isFinite(v.tx) && Number.isFinite(v.ty);
}

const DOUBLE_TAP_MS = 350;
const TAP_MOVE_TOLERANCE = 12; // px -- a touch this size or smaller counts as a tap, not a drag

// Log-scale price axis + the base plot (a close-price line, or full OHLC
// candlesticks -- see `mode`). Owns the x/y scales and hands them to `children` (a
// render-prop function) so overlay layers (Hurst arcs, FLD, scenario cone) share
// exactly the same coordinate mapping instead of each recomputing scales.
//
// `xTickInterval` is a d3-time interval (e.g. `utcYear.every(5)` or `utcMonth.every(2)`)
// -- each panel passes the one appropriate to its own time span (century vs 24 months)
// rather than this component guessing from domain width, which is what produced the
// earlier "1930/1940/…" (too coarse) and repeated-year (wrong granularity) bugs.
// `getXTickInterval(xMin, xMax)`, when given, overrides it PER RENDER from the
// currently visible domain -- so a panel can thin its ticks as the user zooms out
// (e.g. monthly at the 18-month default, every 2-3 months panned wider) instead of
// one fixed interval turning into 40+ overlapping labels at full zoom-out.
//
// `xTickLabel(tickDate)`, when given, returns {primary, secondary} for a two-line
// tick label (secondary may be null): SPY uses primary="Jan", secondary="2025" only
// under January and June, so the year isn't repeated on every single month tick.
// Without it, ticks render one line via `xTickFormat` (GSPC's plain years).
//
// Responsive width: the SVG uses a viewBox + width:100% (not a fixed pixel width), so
// it fills its container; the `width`/`height` props still define the internal
// coordinate system everything else (scales, overlays) is computed in.
//
// Zoom/pan: mouse-wheel zoom (anchored at the cursor) and click-drag pan are handled
// here with plain React pointer events (not d3's own DOM-binding zoom behavior, to
// avoid D3 and React fighting over the same nodes). `d3-zoom`'s ZoomTransform is used
// only for its correct rescaleX/rescaleY math -- the resulting rescaled x/y scales are
// what get used for EVERYTHING (ticks, gridlines, the price line, and every overlay
// via the render-prop), so panning/zooming moves the whole chart together.
//
// `initialDomain` (optional [start, end]) lets `bars` cover a WIDER range than what's
// shown by default -- e.g. SPY passes 36 months of bars but an 18-month initialDomain,
// so the extra 18 months exist for panning into but aren't visible on first load.
// `minDate` bounds how far left that pan/zoom can go (see clampTransform above).
export default function PriceLogAxisChart({
  bars,
  width = 960,
  height = 460,
  margin = { top: 24, right: 32, bottom: 32, left: 64 },
  extraDates = [],
  extraValues = [],
  xTickInterval = utcYear.every(1),
  getXTickInterval,
  xTickFormat = defaultXFormat,
  xTickLabel,
  yPadFrac = 0.08,
  minDate,
  initialDomain,
  mode = 'line', // 'line' | 'candlestick' -- same bars, same scales, just how the base plot draws
  children,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null); // { startClientX, startClientY, startTransform } while dragging
  const touchRef = useRef(null); // { mode: 'pan', prevX, prevY } | { mode: 'pinch', prevDist, prevMidX, prevMidY }
  const tapStartRef = useRef(null); // { time, x, y } -- for detecting a tap vs a drag
  const lastTapRef = useRef(null); // { time, x, y } -- for detecting a SECOND tap (double-tap reset)

  const dates = bars.map((b) => new Date(b.d));
  const lows = bars.map((b) => (b.l ?? b.c)).filter((v) => v > 0);
  const highs = bars.map((b) => (b.h ?? b.c)).filter((v) => v > 0);

  // extraDates/extraValues widen the x/y domain (e.g. to fit a forward-looking
  // scenario cone) without adding synthetic price bars -- the price line itself is
  // never extended past real data.
  const baseX = scaleUtc()
    .domain(extent([...dates, ...extraDates]))
    .range([margin.left, width - margin.right]);

  // Padded directly in log space, proportional to the actual visible range -- NOT
  // `.nice()`, which on a log scale snaps to the enclosing power-of-10 (e.g. any
  // domain within 100-1000 becomes exactly [100,1000]), which is what made SPY's
  // axis look hardcoded regardless of the real ~500-800 data range.
  const [rawLo, rawHi] = extent([...lows, ...highs, ...extraValues]);
  const baseY = scaleLog()
    .domain([rawLo / (1 + yPadFrac), rawHi * (1 + yPadFrac)])
    .range([height - margin.bottom, margin.top]);

  const minDateResolved = minDate ? new Date(minDate) : (bars.length ? new Date(bars[0].d) : null);

  // The "home" view: X either fits the full bars range (kx=1) or, if initialDomain
  // was given, pre-zooms into just that sub-range -- but Y ALWAYS starts at the full
  // price range (ky=1, ty=0). X and Y factors are tracked separately precisely so the
  // 18-month X fit never leaks into Y: a shared uniform k anchored at the top was
  // what pushed the lower price range below the bottom axis on first load / after a
  // double-click reset.
  function computeInitialView() {
    const identity = { kx: 1, ky: 1, tx: 0, ty: 0 };
    if (!initialDomain) return identity;
    const [start, end] = initialDomain.map((d) => (d instanceof Date ? d : new Date(d)));
    const span = baseX(end) - baseX(start);
    if (!(span > 0)) return identity;
    const kx = (width - margin.right - margin.left) / span;
    const tx = margin.left - kx * baseX(start);
    return clampView({ kx, ky: 1, tx, ty: 0 }, baseX, minDateResolved, margin.left);
  }

  const [view, setView] = useState(computeInitialView);
  const homeViewRef = useRef(view);

  // Refs so the wheel/drag handlers (attached once) always see the latest values
  // without needing to re-attach on every render.
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const baseXRef = useRef(baseX);
  baseXRef.current = baseX;
  const minDateRef = useRef(minDateResolved);
  minDateRef.current = minDateResolved;

  // Rejects a non-finite view outright rather than committing it to state: dividing
  // by a momentarily-zero element rect (e.g. a gesture starting the instant the chart
  // mounts, before layout settles -- reproduced via a touch simulation during
  // testing) produces Infinity/NaN that, once written to `view`, corrupts every scale
  // downstream and crashes the component on the next render. A bad gesture sample
  // is simply dropped; the NEXT real sample (once the rect is valid) resumes normally.
  function safeSetView(v) {
    if (isFiniteView(v)) setView(v);
  }

  const x = new ZoomTransform(view.kx, view.tx, 0).rescaleX(baseX);
  const y = new ZoomTransform(view.ky, 0, view.ty).rescaleY(baseY);

  const linePath = bars
    .map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(new Date(b.d))} ${y(b.c)}`)
    .join(' ');

  const yTicks = y.ticks(6);
  const [xMin, xMax] = x.domain();
  const tickInterval = getXTickInterval ? getXTickInterval(xMin, xMax) : xTickInterval;
  // .floor()/.ceil() can land slightly outside [xMin, xMax] -- filter back to the
  // real domain so a tick never renders past the SVG edge (was clipping "Nov 2024"
  // to "ov 2024").
  const xTicks = tickInterval
    .range(tickInterval.floor(xMin), tickInterval.offset(tickInterval.ceil(xMax), 1))
    .filter((t) => t >= xMin && t <= xMax);

  // React's synthetic onWheel is attached passive (preventDefault silently fails,
  // so the page would scroll AND zoom at once) -- a native, explicitly non-passive
  // listener is required to actually stop that. Attached once; reads the latest
  // transform/baseX/minDate via refs so the listener itself never needs to be
  // re-attached.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    function onWheel(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (width / rect.width);
      const py = (e.clientY - rect.top) * (height / rect.height);
      const v = viewRef.current;
      const factor = Math.exp(-e.deltaY * 0.0018);
      const kx1 = Math.min(MAX_K, Math.max(MIN_K, v.kx * factor));
      const ky1 = Math.min(MAX_K, Math.max(MIN_K, v.ky * factor));
      // Keep the data point under the cursor visually fixed while the scales change.
      const tx1 = px - ((px - v.tx) * kx1) / v.kx;
      const ty1 = py - ((py - v.ty) * ky1) / v.ky;
      const next = clampView({ kx: kx1, ky: ky1, tx: tx1, ty: ty1 }, baseXRef.current, minDateRef.current, margin.left);
      safeSetView(next);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [width, height, margin.left]);

  // Touch: pinch-to-zoom (2 fingers) and drag-to-pan (1 finger), the touch
  // equivalents of the wheel/mouse-drag handlers above -- same reasoning applies
  // (React's synthetic touch events are passive too, so a native, non-passive
  // listener is required to actually stop the browser's own scroll/pinch-zoom from
  // fighting with this chart's own zoom). `touch-action: none` in CSS backs this up
  // by telling the browser up front not to reserve the gesture for itself.
  //
  // Re-syncs the tracked gesture on every touchstart/touchend/touchcancel (not just
  // the initial touchstart) because the finger COUNT changes mid-gesture -- e.g.
  // lifting one finger during a pinch leaves one still down, which must continue as
  // a pan from THAT finger's current position, not jump using stale pinch state.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;

    function localPoint(t, rect) {
      return {
        x: (t.clientX - rect.left) * (width / rect.width),
        y: (t.clientY - rect.top) * (height / rect.height),
      };
    }

    function syncGesture(touches, rect) {
      if (touches.length === 1) {
        const p = localPoint(touches[0], rect);
        touchRef.current = { mode: 'pan', prevX: p.x, prevY: p.y };
      } else if (touches.length >= 2) {
        const p0 = localPoint(touches[0], rect);
        const p1 = localPoint(touches[1], rect);
        touchRef.current = {
          mode: 'pinch',
          prevDist: touchDist(touches[0], touches[1]),
          prevMidX: (p0.x + p1.x) / 2,
          prevMidY: (p0.y + p1.y) / 2,
        };
      } else {
        touchRef.current = null;
      }
    }

    function onTouchStart(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.touches.length === 1 && !tapStartRef.current) {
        const p = localPoint(e.touches[0], rect);
        tapStartRef.current = { time: Date.now(), x: p.x, y: p.y };
      }
      syncGesture(e.touches, rect);
    }

    function onTouchMove(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const g = touchRef.current;
      if (!g) return;
      const v = viewRef.current;
      if (g.mode === 'pan' && e.touches.length === 1) {
        const p = localPoint(e.touches[0], rect);
        const dx = p.x - g.prevX;
        const dy = p.y - g.prevY;
        safeSetView(clampView({ ...v, tx: v.tx + dx, ty: v.ty + dy }, baseXRef.current, minDateRef.current, margin.left));
        touchRef.current = { mode: 'pan', prevX: p.x, prevY: p.y };
      } else if (g.mode === 'pinch' && e.touches.length >= 2) {
        const p0 = localPoint(e.touches[0], rect);
        const p1 = localPoint(e.touches[1], rect);
        const dist = touchDist(e.touches[0], e.touches[1]);
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        // A degenerate previous distance (e.g. the gesture started with both fingers
        // reported at the same point) would divide-by-zero into Infinity/NaN --
        // skip applying a zoom just this once, but still refresh prevDist/prevMid from
        // the CURRENT (presumably valid) reading so the very next move can resume
        // normally instead of getting permanently stuck on a broken baseline.
        if (g.prevDist > 0) {
          const factor = dist / g.prevDist;
          const kx1 = Math.min(MAX_K, Math.max(MIN_K, v.kx * factor));
          const ky1 = Math.min(MAX_K, Math.max(MIN_K, v.ky * factor));
          const tx1 = midX - ((midX - v.tx) * kx1) / v.kx;
          const ty1 = midY - ((midY - v.ty) * ky1) / v.ky;
          safeSetView(clampView({ kx: kx1, ky: ky1, tx: tx1, ty: ty1 }, baseXRef.current, minDateRef.current, margin.left));
        }
        touchRef.current = { mode: 'pinch', prevDist: dist, prevMidX: midX, prevMidY: midY };
      }
    }

    function onTouchEnd(e) {
      const rect = el.getBoundingClientRect();
      if (e.touches.length === 0 && tapStartRef.current) {
        const start = tapStartRef.current;
        const moved = Math.hypot(
          (e.changedTouches[0] ? localPoint(e.changedTouches[0], rect).x : start.x) - start.x,
          (e.changedTouches[0] ? localPoint(e.changedTouches[0], rect).y : start.y) - start.y,
        );
        const isTap = moved <= TAP_MOVE_TOLERANCE && Date.now() - start.time < 500;
        if (isTap) {
          const last = lastTapRef.current;
          if (last && Date.now() - last.time < DOUBLE_TAP_MS && Math.hypot(start.x - last.x, start.y - last.y) <= TAP_MOVE_TOLERANCE * 2) {
            setView(homeViewRef.current);
            lastTapRef.current = null; // consumed -- a third quick tap starts a fresh pair, not another reset
          } else {
            lastTapRef.current = { time: Date.now(), x: start.x, y: start.y };
          }
        }
        tapStartRef.current = null;
      }
      syncGesture(e.touches, rect);
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [width, height, margin.left]);

  function handleMouseDown(e) {
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startView: view };
  }

  function handleMouseMove(e) {
    if (!dragRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.startClientX) * (width / rect.width);
    const dy = (e.clientY - dragRef.current.startClientY) * (height / rect.height);
    const v0 = dragRef.current.startView;
    const next = clampView({ ...v0, tx: v0.tx + dx, ty: v0.ty + dy }, baseX, minDateResolved, margin.left);
    safeSetView(next);
  }

  function endDrag() {
    dragRef.current = null;
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      className="price-log-axis-chart"
      role="img"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={() => setView(homeViewRef.current)}
    >
      {yTicks.map((t) => (
        <g key={`y-${t}`}>
          <line
            x1={margin.left} x2={width - margin.right}
            y1={y(t)} y2={y(t)}
            className="grid-line"
          />
          <text x={margin.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="axis-label">
            {priceFormat(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => {
        const label = xTickLabel ? xTickLabel(t) : { primary: xTickFormat(t), secondary: null };
        return (
          <g key={`x-${t.toISOString()}`}>
            <line
              x1={x(t)} x2={x(t)}
              y1={margin.top} y2={height - margin.bottom}
              className="grid-line-x"
            />
            <text x={x(t)} y={height - margin.bottom + 16} textAnchor="middle" className="axis-label">
              {label.primary}
            </text>
            {label.secondary && (
              <text x={x(t)} y={height - margin.bottom + 31} textAnchor="middle" className="axis-label axis-label--secondary">
                {label.secondary}
              </text>
            )}
          </g>
        );
      })}
      {mode === 'candlestick'
        ? <Candlesticks bars={bars} x={x} y={y} />
        : <path d={linePath} className="price-line" fill="none" />}
      {typeof children === 'function' ? children({ x, y, width, height, margin }) : children}
    </svg>
  );
}
