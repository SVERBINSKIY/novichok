import { texts as t } from '../../texts.js';

export default function ErrorState({ error, retry }) {
  return <div className="error-box" role="alert">
    <p>{error}</p>
    <button className="button secondary" onClick={retry}>{t.common.retry}</button>
  </div>;
}
