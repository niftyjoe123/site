// A text label legible over gridlines, arcs, or the price line itself.
//
// Two render modes:
//  - `marking` set ('circle' | 'paren' | 'none'): Elliott-Wave degree label per Frost &
//    Prechter's own notation convention (dashboard's ew_count.py MARKING_BY_SCALE).
//    No filled rect -- a filled box over a dense, multi-label price chart on this
//    dashboard's black theme reads as clutter and (at the default white fill) as a
//    glaring, low-contrast box. Instead: a dark-haloed, colored glyph (stroke-outlined
//    text, no background fill needed for legibility), plus an actual drawn circle
//    for the 'circle' tier -- that circle-around-the-symbol IS the real convention
//    marking, not a bracket or other ASCII stand-in. 'paren' wraps the text in literal
//    "(" ")" characters (already applied server-side); 'none' is bare.
//  - `marking` omitted: legacy filled-pill caption style (GSC anchor dates, invalidation
//    levels, scenario-cone forecast text) -- unrelated to wave-degree notation, kept
//    background-filled since these are short informational captions, not dense
//    on-chart degree markers.
export default function LabelTag({
  x,
  y,
  children,
  anchor = 'start',
  fontSize = 11,
  color = '#222',
  background = 'rgba(255,255,255,0.88)',
  border,
  padX = 4,
  padY = 2,
  marking,
  haloColor = '#0a0a0a',
}) {
  const text = String(children);

  if (marking) {
    const dx = anchor === 'end' ? -fontSize * 0.3 : anchor === 'middle' ? 0 : fontSize * 0.3;
    const cx = x + dx;
    const cy = y - fontSize * 0.32;
    const r = Math.max(fontSize * 0.85, text.length * fontSize * 0.34 + fontSize * 0.3);
    return (
      <g className="label-tag label-tag--halo">
        {marking === 'circle' && (
          <circle cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.6)" stroke={color} strokeWidth={1.2} />
        )}
        <text
          x={cx} y={y}
          textAnchor="middle"
          fontSize={fontSize}
          fill={color}
          stroke={haloColor}
          strokeWidth={3}
          paintOrder="stroke"
          strokeLinejoin="round"
        >
          {text}
        </text>
      </g>
    );
  }

  const charWidth = fontSize * 0.62;
  const textWidth = text.length * charWidth;
  const rectX = anchor === 'end' ? x - textWidth - padX
    : anchor === 'middle' ? x - textWidth / 2 - padX
    : x - padX;
  const rectWidth = textWidth + padX * 2;
  const rectHeight = fontSize + padY * 2;
  const rectY = y - fontSize + padY * 0.2;

  return (
    <g className="label-tag">
      <rect
        x={rectX} y={rectY}
        width={rectWidth} height={rectHeight}
        fill={background}
        stroke={border}
        strokeWidth={border ? 1 : 0}
        rx={2}
      />
      <text x={x} y={y} textAnchor={anchor} fontSize={fontSize} fill={color}>
        {text}
      </text>
    </g>
  );
}
