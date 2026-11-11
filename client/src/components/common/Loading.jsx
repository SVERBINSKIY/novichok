import { texts as t } from '../../texts.js';

export default function Loading() {
  return <div className="loading" role="status">{t.common.loading}</div>;
}
