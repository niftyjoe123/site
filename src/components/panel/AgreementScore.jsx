// N-of-M lens agreement + pivot-independence (spec §5): shown side by side so
// "9 lenses agree" that's really "one pivot set viewed 9 ways" is visible as such.
export default function AgreementScore({ agreement }) {
  if (!agreement || agreement.n_lenses === 0) {
    return <div className="agreement-score agreement-score--empty">no directional lenses available yet</div>;
  }
  return (
    <div className="agreement-score">
      <div className="agreement-score-main">
        <strong>{agreement.n_agree}</strong> of <strong>{agreement.n_lenses}</strong> lenses agree ({agreement.direction})
      </div>
      <div className="agreement-score-independence">
        pivot-independence: <strong>{agreement.pivot_independence}</strong> distinct pivot set{agreement.pivot_independence === 1 ? '' : 's'}
        {agreement.pivot_scales?.length ? ` (${agreement.pivot_scales.join(', ')})` : ''}
      </div>
      <ul className="agreement-score-lenses">
        {agreement.lenses.map((l) => (
          <li key={l.name}>
            {l.name}: <span className={`direction direction--${l.direction}`}>{l.direction}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
