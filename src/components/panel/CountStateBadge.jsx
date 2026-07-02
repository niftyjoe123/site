// Header-strip count-state badge (spec §5): confirmed vs provisional-pending-review.
// Nothing the agent proposes is treated as confirmed until a human approves it (§3) --
// this badge is the one place that promise is made visible on every panel.
export default function CountStateBadge({ state, inheritedFrom }) {
  const isConfirmed = state === 'confirmed';
  return (
    <span className={`count-state-badge ${isConfirmed ? 'count-state-badge--confirmed' : 'count-state-badge--provisional'}`}>
      {isConfirmed ? 'confirmed' : 'provisional — pending review'}
      {inheritedFrom && <span className="count-state-badge-source"> (inherited from {inheritedFrom})</span>}
    </span>
  );
}
