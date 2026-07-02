import { useEffect, useMemo, useState } from 'react';
import { utcMonth } from 'd3-time';
import { utcFormat } from 'd3-time-format';
import { loadSpyPanel } from '../lib/loadArtifacts';
import PriceLogAxisChart from '../components/charts/PriceLogAxisChart';
import FldOverlay from '../components/charts/FldOverlay';
import ScenarioCone from '../components/charts/ScenarioCone';
import HurstArcOverlay, { nestedDownsample, mergedTailGroups } from '../components/charts/HurstArcOverlay';
import WaveCountOverlay from '../components/charts/WaveCountOverlay';
import LabelTag from '../components/charts/LabelTag';
import RatioInset from '../components/charts/RatioInset';
import CountStateBadge from '../components/panel/CountStateBadge';
import AgreementScore from '../components/panel/AgreementScore';
import DowTheoryBlock from '../components/panel/DowTheoryBlock';
import BreadthBlock from '../components/panel/BreadthBlock';
import LayerControls from '../components/panel/LayerControls';

const FLD_DISPLAY_CYCLE = '80D';

const CYCLE_STYLE = {
  '20D': { color: '#8bd17c', dashColor: '#4a9e39', maxArcHeight: 40 },
  '40D': { color: '#7cc6d1', dashColor: '#2f8b98', maxArcHeight: 60 },
  '80D': { color: '#6b8cff', dashColor: '#3d5adf', maxArcHeight: 85 },
  '20W': { color: '#c98bff', dashColor: '#9a4fdb', maxArcHeight: 110 },
  '40W': { color: '#ffb46b', dashColor: '#d9822f', maxArcHeight: 135 },
};

// Toggle order = finest degree on the left, coarsest on the right (Minute, Minor,
// Intermediate), matching how the degrees nest upward.
const EW_SCALE_ORDER = ['micro', 'medium', 'slow'];
// Frost & Prechter's own degree color convention: Black-Intermediate, Blue-Minor,
// Pink-Minute. Hues kept, lightness adjusted where needed for legibility against this
// dashboard's black chart background (the convention assumes a white/paper chart) --
// "black" on black would simply be invisible, so Intermediate gets a light neutral.
const EW_COLOR = { slow: '#e8e8e8', medium: '#4a7dff', micro: '#ff5fa8' };

// Month-only tick labels ("Jan", "Mar", ...) with the year on a second line below,
// and only under January and June -- repeating "2025" on every tick was pure clutter,
// and the one-line "Jan 2025" format made each label so wide the axis felt crowded.
const MONTH_FORMAT = utcFormat('%b');
const YEAR_FORMAT = utcFormat('%Y');
const X_TICK_LABEL = (t) => ({
  primary: MONTH_FORMAT(t),
  secondary: (t.getUTCMonth() === 0 || t.getUTCMonth() === 5) ? YEAR_FORMAT(t) : null,
});
// Thin the ticks as the visible span grows (zooming out), so monthly ticks at the
// 18-month default view don't become 40+ overlapping labels at full zoom-out.
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
// Budget of 28: the default view (18mo of bars + the ~9mo scenario-cone extension
// ≈ 27 month-ticks) stays MONTHLY -- month names are short enough to fit, and only
// monthly ticks contain June, which needs to be present to carry its year label
// (d3's every(2) anchors on even months: Jan/Mar/May/..., never June). Zoomed out
// past that, ticks thin to every 2-3 months and the year rides on January alone.
const GET_X_TICK_INTERVAL = (xMin, xMax) => {
  const months = (xMax - xMin) / MS_PER_MONTH;
  return utcMonth.every(Math.max(1, Math.ceil(months / 28)));
};

export default function SpyPanelPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [ewOn, setEwOn] = useState(null);
  const [fldOn, setFldOn] = useState(true);
  const [hurstOn, setHurstOn] = useState(null);
  const [chartMode, setChartMode] = useState('line');

  useEffect(() => {
    loadSpyPanel().then(setData).catch((e) => setError(String(e)));
  }, []);

  const cycleKeys = useMemo(() => (data ? Object.keys(data.hurst.cycles) : []), [data]);
  const ewScaleKeys = useMemo(
    () => (data ? EW_SCALE_ORDER.filter((s) => data.local_wave_counts[s]?.state === 'labeled') : []),
    [data]
  );

  // Default: only the dominant (largest nominal wavelength) Hurst degree on, and both
  // panel-appropriate EW degrees (Minor and Minute -- the two degrees that actually fit
  // this panel's 18-month zoom) on; Intermediate stays off by default since its
  // structures tend to span multiple years and clutter this zoom level.
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
      ewScaleKeys.forEach((s) => { initial[s] = s === 'medium' || s === 'micro'; });
      setEwOn(initial);
    }
  }, [data, hurstOn, cycleKeys, ewOn, ewScaleKeys]);

  if (error) return <p className="error">Failed to load SPY panel: {error}</p>;
  if (!data || hurstOn === null || ewOn === null) return <p>Loading…</p>;

  const width = 1000;
  const height = 540;
  const margin = { top: 24, right: 32, bottom: 110, left: 64 };
  const lastBar = data.display_bars[data.display_bars.length - 1];
  const displayStart = data.display_bars[0].d;
  const activeCycles = cycleKeys.filter((k) => hurstOn[k]);
  const activeEwScales = ewScaleKeys.filter((s) => ewOn[s]);
  const anyEwOn = activeEwScales.length > 0;
  // 20D/40D share the "micro" pivot scale and 80D/20W share "medium" (same raw
  // trough list within each pair) -- downsample hierarchically over the FULL history
  // first, so nesting is stable, then the render loop below filters the (already
  // nested) result down to the visible window.
  const nestedTroughs = nestedDownsample(cycleKeys, data.hurst.cycles);
  // Flags when a coarser/finer pair (e.g. 20D/40D) has stopped visually
  // differentiating -- the shared ATR-based detector hasn't confirmed enough
  // distinct reversals lately to separate them (see mergedTailGroups docstring).
  const mergedGroups = mergedTailGroups(activeCycles, data.hurst.cycles, nestedTroughs);

  const fldState = data.hurst_fld.states[FLD_DISPLAY_CYCLE];
  const crossovers = [
    ...(fldState?.last_crossover ? [fldState.last_crossover] : []),
    ...(data.hurst_fld.forecast ?? []).filter((f) => f._cycle === FLD_DISPLAY_CYCLE),
  ];

  // Widen the chart's x/y domain so forward-looking elements (scenario cone,
  // projected Hurst boundaries) aren't clipped past the last real bar. Computed from
  // ALL cycles regardless of toggle state so the domain doesn't jump around as
  // toggles change.
  const lastDate = new Date(lastBar.d);
  const extraDates = [
    ...(data.scenario_cone ?? []).map((s) => new Date(lastDate.getTime() + s.horizon_days * 24 * 60 * 60 * 1000)),
    ...cycleKeys.map((k) => new Date(data.hurst.cycles[k].projected_next_trough_window.center.d)),
  ];
  const extraValues = (data.scenario_cone ?? []).flatMap((s) => [s.target - s.tolerance, s.target + s.tolerance]);

  // SPY's Hurst arc data is computed over SPY's full 30+ year history; display_bars
  // itself now covers an EXTENDED ~36mo window (reachable by panning/zooming left),
  // not just the ~18mo default view -- restrict to troughs/boundaries within that
  // extended window so arcs aren't drawn between off-screen points, without cutting
  // off the extra lookback the chart actually makes reachable.
  const inWindow = (d) => d >= displayStart;

  // Default view shows only the most recent ~18 months (data.default_view_start);
  // the rest of display_bars exists purely so panning/zooming left has real data
  // instead of empty space, clamped at displayStart (see minDate below).
  const initialDomainEnd = extraDates.length
    ? new Date(Math.max(...extraDates.map(Number)))
    : lastDate;

  return (
    <div className="spy-panel-page">
      <header className="panel-header">
        <h2>SPY — Reference Panel</h2>
        <CountStateBadge state={data.count_state.state} inheritedFrom={data.count_state.inherited_from} />
        <p className="generated-at">generated {data.generated_at} (source through {data.source.last_date})</p>
      </header>

      <AgreementScore agreement={data.agreement} />

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
        showFld
        fldOn={fldOn}
        onToggleFld={setFldOn}
      />

      <PriceLogAxisChart
        bars={data.display_bars}
        width={width}
        height={height}
        margin={margin}
        extraDates={extraDates}
        extraValues={extraValues}
        minDate={displayStart}
        initialDomain={[data.default_view_start, initialDomainEnd]}
        getXTickInterval={GET_X_TICK_INTERVAL}
        xTickLabel={X_TICK_LABEL}
        mode={chartMode}
      >
        {({ x, y, margin }) => (
          <>
            {activeCycles.map((cycle, i) => {
              const style = CYCLE_STYLE[cycle] ?? { color: '#888', dashColor: '#555', maxArcHeight: 60 };
              const cycleData = data.hurst.cycles[cycle];
              return (
                <HurstArcOverlay
                  key={cycle}
                  x={x}
                  y={y}
                  top={margin.top}
                  bottom={height - margin.bottom}
                  actualTroughs={nestedTroughs[cycle].filter((t) => inWindow(t.d))}
                  preDownsampled
                  boundaries={cycleData.boundaries.filter((b) => inWindow(b.d))}
                  nominalDaysTd={cycleData.nominal_days_td}
                  maxArcHeight={style.maxArcHeight}
                  tickRow={i}
                  color={style.color}
                  dashColor={style.dashColor}
                  label={cycle}
                />
              );
            })}
            {fldOn && (
              <FldOverlay
                x={x} y={y}
                series={data.hurst_fld.display_series[FLD_DISPLAY_CYCLE]}
                crossovers={crossovers}
              />
            )}
            <ScenarioCone
              x={x} y={y}
              lastDate={lastBar.d}
              lastPrice={lastBar.c}
              scenarios={data.scenario_cone}
            />
            <WaveCountOverlay
              x={x} y={y}
              waveCountsByScale={data.local_wave_counts}
              activeScales={activeEwScales}
              colorByScale={EW_COLOR}
              minDate={displayStart}
            />
            {anyEwOn && (
              <g className="invalidation-line">
                {/* No horizontal line here: the inherited invalidation level (4.4) is
                    in ^GSPC's own 1932 index points, not SPY's price scale (SPY never
                    traded near that number) -- drawing it as a price line on SPY's
                    chart would be actively misleading, not just imprecise. Disclosed
                    as text only; see counts/SPY.json's invalidation field. */}
                <LabelTag x={margin.left + 4} y={margin.top + 10} color="#444">
                  {`${data.count_state.state === 'confirmed' ? 'confirmed' : 'provisional'}: inherited from ${data.count_state.inherited_from} — invalidation tracked on S&P 500 (^GSPC) (index points, not shown on this price scale)`}
                </LabelTag>
              </g>
            )}
          </>
        )}
      </PriceLogAxisChart>
      <p className="trace-note">
        FLD cycle shown: {FLD_DISPLAY_CYCLE} (dashed). Shaded bands = scenario_cone
        (target ± tolerance from hurst_fld / mcclellan_summation forecasts that fired), with the
        projected price path drawn as its dashed center line. Hurst arcs/boundaries computed over
        SPY's full history; Elliott Wave degrees each scan SPY's ENTIRE history for every
        rule-validated structure (dashed paths), not just the most recent one. Shown by default: the
        trailing ~18 months. Scroll to zoom, drag to pan — another ~18 months of real price/arc/wave-count
        data sits just to the left before panning stops at the edge of what's loaded; double-click
        resets. Labels may stop short of today's price: that's not a rendering gap, it's the tool
        reporting that no confirmed-pivot window since the last labeled structure has yet satisfied all
        3 hard impulse rules (confirmed pivots also take time to lock in — a live, still-forming turn is
        never labeled until it's confirmed).
      </p>
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

      <div className="comparative-spine">
        <RatioInset
          title="SPY / RSP"
          ratio={data.comparative_spine.spy_rsp.ratio}
          divergence={data.comparative_spine.spy_rsp.divergence}
        />
        <RatioInset
          title="SPY / IWM"
          ratio={data.comparative_spine.spy_iwm.ratio}
          divergence={data.comparative_spine.spy_iwm.divergence}
        />
      </div>

      <div className="analysis-blocks">
        <DowTheoryBlock dowTheory={data.dow_theory} />
        <BreadthBlock breadth={data.breadth} mcclellan={data.mcclellan} />
      </div>
    </div>
  );
}
