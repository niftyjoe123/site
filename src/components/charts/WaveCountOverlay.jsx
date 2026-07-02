import LabelTag from './LabelTag';

// Renders rule-validated wave counts (lib/ew_count.py's find_all_impulses) directly
// on the price line: a thin connecting path through the real pivots, with a
// degree-marker label (I/II/III.. or 1/2/3.. or i/ii/iii.., marked circled/paren/plain
// per Elliott's own degree-notation convention -- see ew_count.py's MARKING_BY_SCALE)
// sitting AT each pivot's own (date, price), the way a textbook Elliott Wave diagram
// labels sit on each peak/trough. Corrective (A-B-C) structures render the same way,
// just with a lighter dash so impulse vs. correction stays visually distinguishable
// at a glance without needing a second color.
//
// `waveCountsByScale` is {scale: {state, structures, correctives, marking}} for every
// scale this tool can resolve (see build_dashboard_*.py); `activeScales` is which of
// those are currently toggled on (mirrors the Hurst per-cycle toggle group). Each
// scale can contain MANY structures spanning the whole history.
//
// `minDate`, when given (SPY's 18-month display window; omitted entirely on GSPC's
// full-history view), drops any label dated before it and only draws a structure if
// 2+ labels survive -- otherwise a structure that started years before the window
// would draw a dashed line and a clipped label fragment sneaking in from off-screen,
// which read as a stray, unexplained mark rather than real structure.
//
// `forming` (when the tool reports one): a real confirmed pivot that is a legitimate
// origin for a NEW structure that hasn't validated yet (e.g. the 2009-03 low after
// Supercycle (V) 2007 on ^GSPC). Rendered deliberately open-ended: an open (unfilled)
// circle at the origin, a sparse-dashed polyline through only the REAL confirmed
// pivots since, and a short fading tail past the last real pivot pointing at nothing.
// `partial_labels` carries progressive wave numbers (1..4, never a 5) for pivots the
// checkable hard rules still allow -- rendered exactly like validated-structure wave
// labels so an in-progress count reads the way published wave charts draw one (the
// completed waves numbered, the final wave pending). `preceding` pivots (skipped when
// the origin slid past a contradicted hypothesis) draw as a fainter dashed path with
// no numbers: real turns, no impulse claim.
function FormingMarker({ x, y, forming, color, marking, minDate }) {
  const toPt = (p) => ({ ...p, px: x(new Date(p.d)), py: y(p.price) });
  const inWin = (p) => !minDate || p.d >= minDate;
  const preceding = (forming.preceding ?? []).filter(inWin).map(toPt);
  const pts = [forming.origin, ...(forming.pivots_since ?? [])].filter(inWin).map(toPt);
  if (pts.length === 0) return null;
  const waveByDate = new Map(
    (forming.partial_labels ?? []).filter((l) => l.wave !== '0').map((l) => [l.d, l.wave])
  );
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <g className="wave-count-forming">
      {preceding.length > 0 && (
        <path
          d={[...preceding, pts[0]].map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ')}
          stroke={color} strokeWidth={0.8} strokeDasharray="1,4" fill="none" opacity={0.3}
        />
      )}
      {pts.length > 1 && (
        <path d={path} stroke={color} strokeWidth={1} strokeDasharray="2,5" fill="none" opacity={0.55} />
      )}
      {/* open-ended tail: a short dashed horizontal continuation past the last real
          pivot -- direction-neutral (flat), asserting only "still in progress" */}
      <path
        d={`M ${last.px} ${last.py} L ${last.px + 26} ${last.py}`}
        stroke={color} strokeWidth={1} strokeDasharray="2,5" fill="none" opacity={0.35}
      />
      <circle cx={pts[0].px} cy={pts[0].py} r={4} fill="none" stroke={color} strokeWidth={1.5} />
      {pts.map((p, i) => {
        const wave = waveByDate.get(p.d);
        if (!wave) return null;
        return (
          <g key={i}>
            <circle cx={p.px} cy={p.py} r={2.5} fill={color} />
            <LabelTag x={p.px} y={p.py - 9} anchor="middle" color={color} marking={marking} fontSize={10}>
              {wave}
            </LabelTag>
          </g>
        );
      })}
      <LabelTag x={pts[0].px} y={pts[0].py + 18} anchor="middle" color={color} marking="none" fontSize={9}>
        forming — not validated
      </LabelTag>
    </g>
  );
}

export default function WaveCountOverlay({ x, y, waveCountsByScale = {}, activeScales = [], colorByScale = {}, minDate }) {
  return (
    <g className="wave-count-overlay">
      {activeScales.map((scale) => {
        const wc = waveCountsByScale[scale];
        if (!wc || wc.state !== 'labeled') return null;
        const color = colorByScale[scale] ?? '#e63950';
        const marking = wc.marking;
        const runs = [
          ...wc.structures.map((s) => ({ kind: 'impulse', labels: s.labels })),
          ...(wc.correctives ?? []).map((c) => ({ kind: 'corrective', labels: c.labels })),
        ];
        const structureRuns = runs.map((run, ri) => {
          const labels = minDate ? run.labels.filter((l) => l.d >= minDate) : run.labels;
          if (labels.length < 2) return null;
          const points = labels.map((l) => ({ ...l, px: x(new Date(l.d)), py: y(l.price) }));
          const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ');
          const isCorrective = run.kind === 'corrective';
          return (
            <g key={`${scale}-${run.kind}-${ri}`} className={`wave-count-${run.kind}`}>
              <path
                d={path}
                stroke={color}
                strokeWidth={isCorrective ? 1 : 1.2}
                strokeDasharray={isCorrective ? '1,3' : '2,2'}
                fill="none"
                opacity={isCorrective ? 0.5 : 0.7}
              />
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.px} cy={p.py} r={2.5} fill={color} />
                  {p.wave !== '0' && (
                    <LabelTag
                      x={p.px}
                      y={p.py - 9}
                      anchor="middle"
                      color={color}
                      marking={marking}
                      fontSize={10}
                    >
                      {p.wave}
                    </LabelTag>
                  )}
                </g>
              ))}
            </g>
          );
        });
        return (
          <g key={scale}>
            {structureRuns}
            {wc.forming && (
              <FormingMarker x={x} y={y} forming={wc.forming} color={color} marking={marking} minDate={minDate} />
            )}
          </g>
        );
      })}
    </g>
  );
}
