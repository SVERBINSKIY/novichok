export default function MetricCard({ label, value, hint }) {
  return <article className="metric-card">
    <div className="metric-label">{label}{hint && <button className="hint" title={hint} aria-label={hint}>?</button>}</div>
    <strong>{value}</strong>
  </article>;
}
