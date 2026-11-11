export default function Percent({ value }) {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
}
