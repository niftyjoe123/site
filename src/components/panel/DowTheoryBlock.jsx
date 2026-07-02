// Dow Theory confirmation block (Murphy Ch.2, "generals vs troops"): ^DJI vs ^DJT.
export default function DowTheoryBlock({ dowTheory }) {
  if (!dowTheory) return null;
  const { state, scale, dji_direction: dji, djt_direction: djt, dji_last_pivot: djiPivot, djt_last_pivot: djtPivot } = dowTheory;
  return (
    <section className="dow-theory-block">
      <h3>Dow Theory (^DJI vs ^DJT)</h3>
      <p className={`dow-theory-state dow-theory-state--${state}`}>{state.replace('_', ' ')}</p>
      <table>
        <tbody>
          <tr>
            <th>^DJI</th>
            <td>{dji ?? '—'}</td>
            <td>{djiPivot ? `${djiPivot.kind} ${djiPivot.price} @ ${djiPivot.d}` : 'insufficient data'}</td>
          </tr>
          <tr>
            <th>^DJT</th>
            <td>{djt ?? '—'}</td>
            <td>{djtPivot ? `${djtPivot.kind} ${djtPivot.price} @ ${djtPivot.d}` : 'insufficient data'}</td>
          </tr>
        </tbody>
      </table>
      <p className="trace-note">pivot scale: {scale}</p>
    </section>
  );
}
