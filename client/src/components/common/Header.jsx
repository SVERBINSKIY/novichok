import { texts as t } from '../../texts.js';

export default function Header({ go, right }) {
  return <header className="topbar">
    <button className="brand" onClick={() => go('/')} aria-label={t.brand}>{t.brand}<span>90</span></button>
    {right}
  </header>;
}
