// Dashed FLD line through price + crossover markers (spec §4). `series` is the
// per-bar FLD display series computed by build_dashboard_spy.py (lib.hurst_fld.fld_series,
// sliced to the display window) -- never re-derived in the browser.
export default function FldOverlay({ x, y, series = [], crossovers = [], color = '#e08a00' }) {
  if (series.length === 0) return null;

  const path = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(new Date(p.d))} ${y(p.fld)}`)
    .join(' ');

  return (
    <g className="fld-overlay">
      <path d={path} stroke={color} fill="none" strokeDasharray="6,4" className="fld-line" />
      {crossovers.map((c, i) => {
        const d = c.date ?? c._cross_date;
        const price = c.price ?? c._price_cross;
        const direction = c.direction ?? c._direction;
        if (!d || price == null) return null;
        return (
          <circle
            key={`cross-${i}`}
            cx={x(new Date(d))}
            cy={y(price)}
            r={5}
            fill={direction === 'up' ? '#2e9e4f' : '#c0392b'}
            className="fld-cross-marker"
          />
        );
      })}
    </g>
  );
}
