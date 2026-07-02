import { useEffect, useMemo, useState } from 'react';
import { utcYear } from 'd3-time';
import { utcFormat } from 'd3-time-format';
import { loadGspcDeepHistory } from '../lib/loadArtifacts';
import PriceLogAxisChart from '../components/charts/PriceLogAxisChart';
import HurstArcOverlay, { nestedDownsample, mergedTailGroups } from '../components/charts/HurstArcOverlay';
import WaveCountOverlay from '../components/charts/WaveCountOverlay';
import LabelTag from '../components/charts/LabelTag';
import LayerControls from '../components/panel/LayerControls';

const CYCLE_STYLE = {
  '18Y': { color: '#6b8cff', dashColor: '#3d5adf', maxArcHeight: 170 },
  '9Y': { color: '#c98bff', dashColor: '#9a4fdb', maxArcHeight: 120 },
  '54M': { color: '#ffb46b', dashColor: '#d9822f', maxArcHeight: 75 },
};

// Century-scale degrees only (lib/ew_count.py's percentage-ZigZag detector) -- at
// this zoom, Intermediate/Minor/Minute (the SPY panel's degrees) pack far too many
// structures into view to stay readable (see build_dashboard_gspc.py). Coarsest
// first: the first one that actually produced a structure is the default-on scale
// (Grand Supercycle often reports "none" -- ~98 years may not contain 6 confirmed
// 65%+ swings -- so the default should fall through to whichever coarsest degree
// really did validate).
const EW_SCALE_ORDER = ['grand_supercycle', 'supercycle', 'cycle', 'primary'];
// Frost & Prechter's own degree color convention: Olive-Supercycle, Teal-Cycle,
// Maroon-Primary (Grand Supercycle isn't in that chart -- it starts at Supercycle --
// so grand_supercycle's color is this project's own extension, a gold distinct from
// Supercycle's olive). Lightness adjusted from the literal named colors where needed
// for legibility against this dashboard's black chart background (the convention
// assumes a white/paper chart).
const EW_COLOR = {
  grand_supercycle: '#c9a227', supercycle: '#b5b52e', cycle: '#2fa3a3', primary: '#d1495b',
};

const X_TICK_INTERVAL = utcYear.every(5);
const X_TICK_FORMAT = utcFormat('%Y');

export default function DeepHistoryGspcPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [ewOn, setEwOn] = useState(null);
  const [hurstOn, setHurstOn] = useState(null); // initialized once data loads
  const [chartMode, setChartMode] = useState('line');

  useEffect(() => {
    loadGspcDeepHistory().then(setData).catch((e) => setError(String(e)));
  }, []);

  const cycleKeys = useMemo(() => (data ? Object.keys(data.hurst.cycles) : []), [data]);
  const ewScaleKeys = useMemo(
    () => (data ? EW_SCALE_ORDER.filter((s) => data.local_wave_counts[s]?.state === 'labeled') : []),
    [data]
  );

  // Default: only the dominant (largest nominal wavelength) Hurst degree on, and only
  // the coarsest (Intermediate) EW degree on, so the panel isn't cluttered on load.
  useEffect(() => {
    if (data && hurstOn === null) {
      const dominant = cycleKeys.reduce((best, k) =>
        data.hurst.cycles[k].nominal_days_td > (data.hurst.cycles[best]?.nominal_days_td ?? -1) ? k : best,
      cycleKeys[0]);
      const initial = {};
      cycleKeys.forEach((k) => { initial[k] = k === dominant; });
      setHurstOn(initial);
    }
    if (data && ewOn === null) {
      const initial = {};
      ewScaleKeys.forEach((s, i) => { initial[s] = i === 0; });
      setEwOn(initial);
    }
  }, [data, hurstOn, cycleKeys, ewOn, ewScaleKeys]);

  if (error) return <p className="error">Failed to load GSPC deep history: {error}</p>;
  if (!data || hurstOn === null || ewOn === null) return <p>Loading…</p>;

  const gscLabels = data.ew.grand_supercycle.labels;
  const supercycle = data.ew.supercycle;
  const width = 1000;
  const height = 600;
  const margin = { top: 24, right: 32, bottom: 110, left: 64 };
  const activeCycles = cycleKeys.filter((k) => hurstOn[k]);
  // 18Y/9Y/54M all share the "slow" pivot scale (same raw trough list) -- downsample
  // hierarchically so a coarser cycle's troughs are a real subset of the finer
  // cycle's, instead of each picking independently off the identical raw list.
  const nestedTroughs = nestedDownsample(activeCycles, data.hurst.cycles);
  // Flags when a coarser/finer pair (e.g. 9Y/18Y) has stopped visually differentiating
  // -- see mergedTailGroups docstring in HurstArcOverlay.jsx.
  const mergedGroups = mergedTailGroups(activeCycles, data.hurst.cycles, nestedTroughs);
  const activeEwScales = ewScaleKeys.filter((s) => ewOn[s]);
  const anyEwOn = activeEwScales.length > 0;

  // Widen the x-domain to fit each active cycle's projected next-trough boundary
  // (often decades past the last real bar for 18Y/9Y) so that dashed line and the
  // arc's projected tail aren't clipped off-screen.
  const extraDates = cycleKeys
    .filter((k) => hurstOn[k])
    .map((k) => new Date(data.hurst.cycles[k].projected_next_trough_window.center.d));

  return (
    <div className="deep-history-page">
      <h2>S&amp;P 500 (^GSPC) Deep History — Degree Confirmation Surface</h2>
      <p className="history-note">{data.source.history_note}</p>
      <p className="trace-note">
        {data.source.rows} rows, {data.source.first_date} → {data.source.last_date} (log price axis, yearly bars)
      </p>

      <LayerControls
        chartMode={chartMode}
        onChangeChartMode={setChartMode}
        ewDegrees={ewScaleKeys.map((s) => ({ key: s, label: data.local_wave_counts[s].degree }))}
        ewOn={ewOn}
        onToggleEw={(key, checked) => setEwOn((prev) => ({ ...prev, [key]: checked }))}
        onSetAllEw={(on) => {
          const next = {};
          ewScaleKeys.forEach((s) => { next[s] = on; });
          setEwOn(next);
        }}
        hurstCycles={cycleKeys.map((k) => ({ key: k, label: k }))}
        hurstOn={hurstOn}
        onToggleHurst={(key, checked) => setHurstOn((prev) => ({ ...prev, [key]: checked }))}
        onSetAllHurst={(on) => {
          const next = {};
          cycleKeys.forEach((k) => { next[k] = on; });
          setHurstOn(next);
        }}
        showFld={false}
      />

      <PriceLogAxisChart
        bars={data.yearly_bars}
        width={width}
        height={height}
        margin={margin}
        extraDates={extraDates}
        minDate={data.source.first_date}
        xTickInterval={X_TICK_INTERVAL}
        xTickFormat={X_TICK_FORMAT}
        mode={chartMode}
      >
        {({ x, y, margin }) =>
          <>
            {/* GSC anchor lines are LOCKED (project convention), not provisional --
                they stay visible regardless of the Elliott Wave toggle. */}
            {gscLabels.map((l) => {
              const sameSpot = gscLabels.filter((o) => o.d === l.d && o.price === l.price);
              const stackIndex = sameSpot.indexOf(l);
              return (
                <g key={l.wave}>
                  <line
                    x1={x(new Date(l.d))} x2={x(new Date(l.d))}
                    y1={margin.top} y2={height - margin.bottom}
                    stroke="#444" strokeDasharray="2,4"
                  />
                  <LabelTag
                    x={x(new Date(l.d)) + 4}
                    y={y(l.price) - stackIndex * 15}
                    color="#222"
                  >
                    {`${l.wave} ${l.kind} ${l.d}`}
                  </LabelTag>
                </g>
              );
            })}

            {anyEwOn && (
              <g className="invalidation-line">
                <line
                  x1={margin.left} x2={width - margin.right}
                  y1={y(data.invalidation.level)} y2={y(data.invalidation.level)}
                  stroke="#c0392b" strokeDasharray="8,3" opacity={0.7}
                />
                <LabelTag
                  x={width - margin.right}
                  y={y(data.invalidation.level) - 5}
                  anchor="end"
                  color="#c0392b"
                  background="rgba(255,255,255,0.9)"
                >
                  {`invalidation ${data.invalidation.level}`}
                </LabelTag>
              </g>
            )}

            <WaveCountOverlay
              x={x} y={y}
              waveCountsByScale={data.local_wave_counts}
              activeScales={activeEwScales}
              colorByScale={EW_COLOR}
            />

            {activeCycles.map((cycle, i) => {
              const style = CYCLE_STYLE[cycle] ?? { color: '#888', dashColor: '#555', maxArcHeight: 100 };
              return (
                <HurstArcOverlay
                  key={cycle}
                  x={x}
                  y={y}
                  top={margin.top}
                  bottom={height - margin.bottom}
                  actualTroughs={nestedTroughs[cycle]}
                  preDownsampled
                  boundaries={data.hurst.cycles[cycle].boundaries}
                  nominalDaysTd={data.hurst.cycles[cycle].nominal_days_td}
                  maxArcHeight={style.maxArcHeight}
                  tickRow={i}
                  color={style.color}
                  dashColor={style.dashColor}
                  label={cycle}
                />
              );
            })}
          </>
        }
      </PriceLogAxisChart>
      {mergedGroups.length > 0 && (
        <p className="trace-note trace-note--flag">
          {mergedGroups.map(({ cycles, sinceDate }) => (
            <span key={cycles.join('-')}>
              {cycles.join(' / ')} currently show identical troughs (since {sinceDate}): they share one
              ATR-based detector, and real reversals haven't cleared its confirmation threshold often
              enough lately to separate them. That's a real, temporary data gap — not lost structure, and
              not fabricated to look distinct.{' '}
            </span>
          ))}
        </p>
      )}

      <div className="cycle-legend">
        {cycleKeys.map((cycle) => {
          const style = CYCLE_STYLE[cycle] ?? { color: '#888' };
          return (
            <span key={cycle} className={hurstOn[cycle] ? 'cycle-legend-item' : 'cycle-legend-item cycle-legend-item--off'}>
              <span className="cycle-legend-swatch" style={{ background: style.color }} />
              {cycle} nominal ({data.hurst.cycles[cycle].nominal_days_td} trading days) — next window{' '}
              {data.hurst.cycles[cycle].projected_next_trough_window.lo.d} .. {data.hurst.cycles[cycle].projected_next_trough_window.hi.d}
            </span>
          );
        })}
        {ewScaleKeys.map((scale) => (
          <span key={scale} className={ewOn[scale] ? 'cycle-legend-item' : 'cycle-legend-item cycle-legend-item--off'}>
            <span className="cycle-legend-swatch" style={{ background: EW_COLOR[scale] }} />
            {data.local_wave_counts[scale].degree} wave count — {data.local_wave_counts[scale].structures.length} structures across full history
          </span>
        ))}
      </div>

      <section className="degree-panel">
        <h3>Grand Supercycle (fixed, project convention)</h3>
        <table>
          <tbody>
            {gscLabels.map((l) => (
              <tr key={l.wave}>
                <th>{l.wave} {l.kind}</th>
                <td>{l.d} @ {l.price}</td>
                <td className="trace-note">{l.granularity_note}{l.date_discrepancy_note ? ` — ${l.date_discrepancy_note}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {anyEwOn ? (
          <>
            <h3>
              Supercycle degree{' '}
              <span className={`count-state-badge count-state-badge--${supercycle.state === 'confirmed' ? 'confirmed' : 'provisional'}`}>
                {supercycle.state === 'confirmed' ? 'confirmed' : 'provisional — pending review'}
              </span>
            </h3>
            <p><strong>Primary (project-derived):</strong> {supercycle.primary_label.wave}</p>
            <p className="trace-note">{supercycle.primary_label.description}</p>

            <h4>Alternates (cited expert hypotheses)</h4>
            <ul className="alternates-list">
              {supercycle.alternates.map((a) => (
                <li key={a.source_url}>
                  <p>{a.label}</p>
                  <p className="trace-note">
                    <a href={a.source_url} target="_blank" rel="noreferrer">{a.source_url}</a>
                  </p>
                  <p className="trace-note">{a.caveat}</p>
                </li>
              ))}
            </ul>

            <p className="trace-note">
              Invalidation level: {data.invalidation.level} — {data.invalidation.basis}
            </p>

            <h4>Local wave counts (rule-validated, not the count of record)</h4>
            <p className="trace-note">
              Each toggled degree above scans the ENTIRE confirmed-pivot history for every non-overlapping
              stretch that satisfies Elliott's 3 hard impulse rules (wave 2 retracement, wave 3 not shortest,
              wave 4 no-overlap) -- shown as dashed paths on the chart. These use a percentage-ZigZag
              detector (20/35/50/65% confirmed reversals for Primary/Cycle/Supercycle/Grand Supercycle) rather
              than the ATR pivot scales, so real century-scale structure IS resolved here -- but this is still
              algorithmic pattern detection, not the human-reviewed, expert-cited Supercycle hypothesis above,
              and carries no promotion lifecycle. Degrees with no validated structure anywhere in the history
              (often Grand Supercycle -- ~98 years may not contain 6 confirmed 65%+ swings) aren't offered as
              a toggle at all.
            </p>

            <p className="approval-hint">
              Approving the top-level degree here promotes S&amp;P 500 (^GSPC)'s count to "confirmed" — SPY then
              inherits it. Nothing downstream is confirmed until this is (this build has no
              human-approval UI wired up yet; edit counts/GSPC.json's state/last_approved by hand).
            </p>
          </>
        ) : (
          <p className="trace-note">Elliott Wave layer hidden (Supercycle labels, alternates, invalidation level, local wave counts).</p>
        )}
      </section>

      <p className="generated-at">generated {data.generated_at}</p>
    </div>
  );
}
