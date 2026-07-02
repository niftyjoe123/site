// Breadth block: McClellan osc/summation, A/D, TRIN. NH-NL is explicitly "data
// pending" (spec §7) rather than fabricated -- shown as such, not hidden.
export default function BreadthBlock({ breadth, mcclellan }) {
  if (!breadth) return null;
  const { latest, nh_nl: nhNl, trin_source: trinSource } = breadth;
  const { state: mccState } = mcclellan ?? {};

  return (
    <section className="breadth-block">
      <h3>Breadth &amp; McClellan</h3>
      {latest && (
        <table>
          <tbody>
            <tr><th>as of</th><td>{latest.d}</td></tr>
            <tr><th>advances / declines</th><td>{latest.adv} / {latest.dec}</td></tr>
            <tr><th>up-vol / down-vol</th><td>{latest.upv ?? '—'} / {latest.dnv ?? '—'}</td></tr>
            <tr><th>TRIN</th><td>{latest.trin ?? 'n/a'}</td></tr>
            <tr><th>A-D line</th><td>{latest.ad_line}</td></tr>
          </tbody>
        </table>
      )}
      {mccState && (
        <p className="mcclellan-regime">
          McClellan Summation: <strong>{mccState.summation_now?.toFixed(1)}</strong> ({mccState.regime}, neutral = {mccState.neutral})
        </p>
      )}
      <p className="trace-note">NH-NL: {nhNl}</p>
      <p className="trace-note">TRIN: {trinSource}</p>
    </section>
  );
}
