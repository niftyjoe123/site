import { scaleLinear, scaleUtc } from 'd3-scale';
import { extent } from 'd3-array';

// Small comparative-ratio inset (SPY/RSP, SPY/IWM) + divergence flag. `ratio` is
// lib.ratio.ratio_series output; `divergence` is lib.ratio.trend_divergence_flag output.
// Both are computed server-side -- this component only plots what it's given.
export default function RatioInset({ title, ratio = [], divergence, width = 300, height = 120 }) {
  const margin = { top: 8, right: 8, bottom: 18, left: 40 };
  if (ratio.length === 0) {
    return (
      <div className="ratio-inset ratio-inset--empty">
        <h4>{title}</h4>
        <p>no overlapping data</p>
      </div>
    );
  }

  const dates = ratio.map((r) => new Date(r.d));
  const values = ratio.map((r) => r.ratio);
  const x = scaleUtc().domain(extent(dates)).range([margin.left, width - margin.right]);
  const y = scaleLinear().domain(extent(values)).range([height - margin.bottom, margin.top]).nice();

  const path = ratio
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(new Date(r.d))} ${y(r.ratio)}`)
    .join(' ');

  const state = divergence?.state;
  const diverging = divergence?.diverging;

  return (
    <div className="ratio-inset">
      <h4>
        {title}
        {state === 'ok' && (
          <span className={diverging ? 'divergence-flag divergence-flag--on' : 'divergence-flag'}>
            {diverging ? 'diverging' : 'aligned'}
          </span>
        )}
        {state === 'insufficient_data' && <span className="divergence-flag">insufficient data</span>}
      </h4>
      <svg width={width} height={height}>
        <path d={path} fill="none" className="ratio-line" />
      </svg>
      {state === 'ok' && (
        <p className="ratio-inset-detail">
          price {(divergence.price_change * 100).toFixed(1)}% / ratio {(divergence.ratio_change * 100).toFixed(1)}%
          {' '}over {divergence.lookback} sessions (as of {divergence.as_of})
        </p>
      )}
    </div>
  );
}
