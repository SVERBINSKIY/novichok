import { texts as t } from '../../texts.js';

export default function RiskBadge({ level }) {
  const icon = level === 'red' ? '!' : level === 'yellow' ? '◌' : '✓';
  return <span className={`risk-badge ${level}`}>
    <span aria-hidden="true">{icon}</span>{t.risk[level] || t.risk.green}
  </span>;
}
