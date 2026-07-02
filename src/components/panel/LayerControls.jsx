// Presentation-only layer toggles shared by both panels. Sits between the header
// strip (count-state badge / agreement score) and the chart, so it doesn't compete
// with either.
//
// Three independent groups, EW and Hurst both structured the same way (one checkbox
// per degree + all/none) since both resolve multiple independent degrees that are
// each worth toggling on their own to compare nested structure:
//   - Elliott Wave: one checkbox per degree that actually produced a labeled
//     structure (Intermediate/Minor/Minute -- see lib/ew_count.py). Invalidation
//     level is treated as part of this layer by the caller (shown whenever at least
//     one EW degree is on). Locked anchors (GSC lines on the deep-history panel) are
//     NOT controlled by this -- the caller simply never wires them to `ewOn`.
//   - Hurst: one checkbox per cycle degree actually present in this panel's data.
//   - FLD: its own separate switch, never bundled with EW (a distinct price-
//     confirmation read, not a wave count or a cycle arc). Omitted entirely when a
//     panel has no FLD data (the deep-history panel).
function ToggleGroup({ label, items, on = {}, onToggle, onSetAll }) {
  if (items.length === 0) return null;
  return (
    <div className="layer-toggle-group">
      <span className="layer-toggle-group-label">{label}:</span>
      {items.map(({ key, label: itemLabel }) => (
        <label key={key} className="layer-toggle">
          <input
            type="checkbox"
            checked={!!on[key]}
            onChange={(e) => onToggle(key, e.target.checked)}
          />
          {itemLabel}
        </label>
      ))}
      <span className="layer-toggle-all-none">
        <button type="button" onClick={() => onSetAll(true)}>all</button>
        /
        <button type="button" onClick={() => onSetAll(false)}>none</button>
      </span>
    </div>
  );
}

// Two-way segmented switch, not a checkbox: "candlesticks" and "lines" are mutually
// exclusive presentation MODES of the exact same OHLC bars (no data changes between
// them), which reads more clearly as a switch than as an independent toggle.
function ChartModeSwitch({ mode, onChange }) {
  return (
    <div className="chart-mode-switch" role="radiogroup" aria-label="chart style">
      <button
        type="button"
        className={mode === 'candlestick' ? 'chart-mode-option chart-mode-option--active' : 'chart-mode-option'}
        aria-pressed={mode === 'candlestick'}
        onClick={() => onChange('candlestick')}
      >
        Candlesticks
      </button>
      <button
        type="button"
        className={mode === 'line' ? 'chart-mode-option chart-mode-option--active' : 'chart-mode-option'}
        aria-pressed={mode === 'line'}
        onClick={() => onChange('line')}
      >
        Lines
      </button>
    </div>
  );
}

export default function LayerControls({
  chartMode,
  onChangeChartMode,
  ewDegrees = [], // [{ key, label }]
  ewOn = {},
  onToggleEw,
  onSetAllEw,
  hurstCycles = [], // [{ key, label }]
  hurstOn = {},
  onToggleHurst,
  onSetAllHurst,
  showFld = false,
  fldOn,
  onToggleFld,
}) {
  return (
    <div className="layer-controls">
      {chartMode && <ChartModeSwitch mode={chartMode} onChange={onChangeChartMode} />}
      <ToggleGroup label="Elliott Wave" items={ewDegrees} on={ewOn} onToggle={onToggleEw} onSetAll={onSetAllEw} />
      <ToggleGroup label="Hurst" items={hurstCycles} on={hurstOn} onToggle={onToggleHurst} onSetAll={onSetAllHurst} />

      {showFld && (
        <label className="layer-toggle layer-toggle--fld">
          <input type="checkbox" checked={fldOn} onChange={(e) => onToggleFld(e.target.checked)} />
          FLD
        </label>
      )}
    </div>
  );
}
