import { texts as t } from '../../texts.js';

export default function TerminationDialog({ reason, setReason, onCancel, onConfirm }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="termination-heading">
    <h2 id="termination-heading">{t.hr.terminateTitle}</h2><p>{t.hr.terminateConfirm}</p>
    <label>{t.hr.reason}<select value={reason} onChange={e => setReason(e.target.value)}><option value="">{t.labels.chooseReason}</option>{t.exitReasons.map(item => <option key={item}>{item}</option>)}</select></label>
    <div className="modal-actions"><button className="button secondary" onClick={onCancel}>{t.hr.cancel}</button><button className="button danger" disabled={!reason} onClick={onConfirm}>{t.hr.confirm}</button></div>
  </section></div>;
}
