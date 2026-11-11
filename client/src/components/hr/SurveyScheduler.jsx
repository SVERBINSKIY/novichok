import { useState } from 'react';
import { api } from '../../lib/api.js';
import { texts as t } from '../../texts.js';

export default function SurveyScheduler({ employee, pulses, onScheduled }) {
  const pending = pulses.filter(pulse => !pulse.responded_at);
  const [pulseId, setPulseId] = useState(pending[0]?.id || '');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigned, setAssigned] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const schedule = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api(`/api/hr/employees/${employee.id}/pulses/${pulseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ due_date: dueDate })
      });
      setAssigned(result);
      await onScheduled();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copyInvitation = async () => {
    try {
      const url = `${window.location.origin}${assigned.url}`;
      await navigator.clipboard.writeText(`${t.hr.surveyInvite(employee.name)}\n${url}`);
      setError('');
      window.alert(t.hr.surveyInviteCopied);
    } catch {
      setError(t.hr.copyError);
    }
  };

  return <section className="survey-scheduler">
    <h3>{t.hr.scheduleSurvey}</h3>
    <p className="muted">{t.hr.scheduleSurveyHint}</p>
    {pending.length ? <form onSubmit={schedule}>
      <label>{t.hr.surveyToSchedule}
        <select value={pulseId} onChange={event => setPulseId(event.target.value)} required>
          {pending.map(pulse => <option key={pulse.id} value={pulse.id}>{t.hr.dayN(pulse.day)} · {pulse.due_date}</option>)}
        </select>
      </label>
      <label>{t.hr.surveyDate}
        <input type="date" min={new Date().toISOString().slice(0, 10)} value={dueDate} onChange={event => setDueDate(event.target.value)} required />
      </label>
      <button className="button secondary" type="submit" disabled={busy || !pulseId}>{busy ? t.common.loading : t.hr.schedule}</button>
    </form> : <p className="muted">{t.hr.noPendingSurveys}</p>}
    {assigned && <div className="assigned-survey">
      <p>{t.hr.surveyAssigned(assigned.day, assigned.due_date)}</p>
      <button className="button secondary" onClick={copyInvitation}>{t.hr.copySurveyInvite}</button>
    </div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
