import LabelTag from './LabelTag';

// Shaded look-ahead scenario bands (spec §0: "explicit scenario bands, never a single
// confident line"). Each entry in `scenarios` is repackaged directly from a real
// forecast tool's output (hurst_fld / mcclellan_summation target + tolerance +
// horizon_days) by build_dashboard_spy.py -- nothing here is computed in the browser.
//
// The dashed center line to `target` IS the projected price path implied by that same
// target/horizon -- not a new forecast, just the midline of the cone already being
// drawn, made visible instead of leaving the band empty.
export default function ScenarioCone({ x, y, lastDate, lastPrice, scenarios = [] }) {
  if (scenarios.length === 0) return null;

  const now = new Date(lastDate);

  return (
    <g className="scenario-cone">
      {scenarios.map((s, i) => {
        const future = new Date(now.getTime() + s.horizon_days * 24 * 60 * 60 * 1000);
        const x0 = x(now);
        const x1 = x(future);
        const yHi = y(s.target + s.tolerance);
        const yLo = y(s.target - s.tolerance);
        const yNow = y(lastPrice);
        const yTarget = y(s.target);
        const points = `${x0},${yNow} ${x1},${yHi} ${x1},${yLo}`;
        const fill = s.direction === 'up' ? 'rgba(46,158,79,0.15)' : 'rgba(192,57,43,0.15)';
        const stroke = s.direction === 'up' ? '#2e9e4f' : '#c0392b';
        return (
          <g key={`scenario-${i}`} className="scenario-band">
            <polygon points={points} fill={fill} stroke={stroke} strokeDasharray="3,3" />
            <path
              d={`M ${x0} ${yNow} L ${x1} ${yTarget}`}
              stroke={stroke}
              strokeWidth={1.6}
              strokeDasharray="7,4"
              fill="none"
              className="scenario-projected-price"
            />
            <LabelTag x={x1 + 4} y={yTarget} anchor="start" color={stroke} background="rgba(255,255,255,0.85)">
              {`${s.source}: ${s.target.toFixed(1)} ± ${s.tolerance.toFixed(1)}`}
            </LabelTag>
          </g>
        );
      })}
    </g>
  );
}
