// Standard OHLC candlestick rendering (Investopedia / StockCharts convention): a
// wick from high to low, and a body spanning open-close, colored by direction --
// bullish (close >= open) vs bearish (close < open). Every bar here already carries
// real o/h/l/c (SPY's own daily bars, or GSPC's yearly rollup -- lib/ohlc_agg.py's
// o=first/h=max/l=min/c=last, never synthesized), so this only draws what's real.
//
// Color convention: filled colored bodies (green=bullish, red=bearish), the modern
// (TradingView/ThinkorSwim-style) convention rather than the older black-fill/
// hollow-body Western style -- chosen for legibility against this dashboard's dark
// theme, where a solid black body would vanish and a hollow (outline-only) bullish
// body reads poorly at the sub-2px candle widths a multi-year daily chart requires.
// Direction is still the same either way: this never changes which candles are
// "up" vs "down", only how that's colored.
//
// Candle width: derived from the actual median pixel gap between consecutive bars
// in the CURRENT zoom (not a fixed constant), so candles stay proportionate whether
// showing 18 months of daily bars or a century of yearly ones, and never overlap
// even as spacing changes with irregular calendars (weekends/holidays) or zoom.
const BULLISH_COLOR = '#3ecf71';
const BEARISH_COLOR = '#e6455d';
const MIN_WICK_WIDTH = 1;

function medianGap(xs) {
  if (xs.length < 2) return 6;
  const gaps = [];
  for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || 6;
}

export default function Candlesticks({ bars, x, y, bodyWidthFraction = 0.62 }) {
  if (!bars.length) return null;
  const xs = bars.map((b) => x(new Date(b.d)));
  const gap = medianGap(xs);
  const bodyWidth = Math.max(1, gap * bodyWidthFraction);

  return (
    <g className="candlesticks">
      {bars.map((b, i) => {
        const up = b.c >= b.o;
        const color = up ? BULLISH_COLOR : BEARISH_COLOR;
        const cx = xs[i];
        const yOpen = y(b.o);
        const yClose = y(b.c);
        const yHigh = y(b.h);
        const yLow = y(b.l);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(MIN_WICK_WIDTH, Math.abs(yClose - yOpen));
        return (
          <g key={b.d} className={up ? 'candle candle--up' : 'candle candle--down'}>
            <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={MIN_WICK_WIDTH} />
            <rect
              x={cx - bodyWidth / 2} y={bodyTop}
              width={bodyWidth} height={bodyHeight}
              fill={color}
            />
          </g>
        );
      })}
    </g>
  );
}
