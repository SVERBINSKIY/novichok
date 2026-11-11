import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { texts as t } from '../../texts.js';
import EmployeeProfile from '../../components/hr/EmployeeProfile.jsx';
import TerminationDialog from '../../components/hr/TerminationDialog.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import Header from '../../components/common/Header.jsx';
import Loading from '../../components/common/Loading.jsx';
import RiskBadge from '../../components/common/RiskBadge.jsx';

const blankEmployee = () => ({
  name: '', phone: '', department: t.departments[0], location: '', job_title: '',
  shift: t.shifts[0], start_date: new Date().toISOString().slice(0, 10), mentor_id: ''
});

export default function HrPage({ go }) {
  const [section, setSection] = useState('today');
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [awaiting, setAwaiting] = useState([]);
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [risk, setRisk] = useState('');
  const [status, setStatus] = useState('');
  const [newEmployee, setNewEmployee] = useState(null);
  const [callTarget, setCallTarget] = useState(null);
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [termination, setTermination] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [todayData, people, due] = await Promise.all([
        api('/api/hr/today'),
        api(`/api/hr/employees?search=${encodeURIComponent(search)}&department=${encodeURIComponent(department)}&risk=${encodeURIComponent(risk)}&status=${encodeURIComponent(status)}`),
        api('/api/hr/awaiting')
      ]);
      setSummary(todayData);
      setEmployees(people);
      setAwaiting(due);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [search, department, risk, status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    api(`/api/hr/employees/${selected}`).then(setProfile).catch(e => setError(e.message));
  }, [selected]);

  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }); go('/'); };
  const addField = (key, value) => setNewEmployee(prev => ({ ...prev, [key]: value }));
  const saveNewEmployee = async event => {
    event.preventDefault();
    try {
      const saved = await api('/api/hr/employees', { method: 'POST', body: JSON.stringify(newEmployee) });
      setSelected(null);
      setNewEmployee({ ...newEmployee, saved });
      await load();
    } catch (e) { setError(e.message); }
  };
  const copyText = async (text, success) => {
    try { await navigator.clipboard.writeText(text); window.alert(success); }
    catch { setError(t.hr.copyError); }
  };
  const saveAction = async (employeeId, type, actionResult = '', text = '') => {
    try {
      await api(`/api/hr/employees/${employeeId}/actions`, { method: 'POST', body: JSON.stringify({ type, result: actionResult, text }) });
      setCallTarget(null); setNote(''); setResult('');
      await load();
      if (selected === employeeId) setProfile(await api(`/api/hr/employees/${employeeId}`));
    } catch (e) { setError(e.message); }
  };
  const terminate = async () => {
    if (!termination || !reason) return;
    try {
      await api(`/api/hr/employees/${termination}/terminate`, { method: 'POST', body: JSON.stringify({ reason }) });
      setTermination(null); setReason('');
      await load();
      if (selected === termination) setProfile(await api(`/api/hr/employees/${termination}`));
    } catch (e) { setError(e.message); }
  };
  const showProfile = id => { setSelected(id); setSection('people'); };
  const selectedEmployee = employees.find(item => item.id === selected);
  const tabs = [['today', t.hr.today], ['people', t.hr.people], ['awaiting', t.hr.awaiting]];

  return <main className="app-shell">
    <Header go={go} right={<button className="text-button" onClick={logout}>{t.hr.logout}</button>} />
    <div className="workspace-head">
      <div><span className="eyebrow">{t.labels.hrWorkspace}</span><h1>{t.hr.title}</h1></div>
      <div className="head-count">{t.hr.stale(summary?.staleSignals || 0)}</div>
    </div>
    <nav className="tabs" aria-label={t.hr.navigation}>{tabs.map(([key, label]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => { setSection(key); setSelected(null); }}>{label}{key === 'awaiting' && awaiting.length > 0 && <span className="tab-count">{awaiting.length}</span>}</button>)}</nav>
    {error && <ErrorState error={error} retry={load} />}
    {busy && !summary ? <Loading /> : <div className="hr-layout">
      <section className="main-column">
        {section === 'today' && <>
          <div className="section-title-row"><div><span className="eyebrow">{t.labels.todayPlan}</span><h2>{t.hr.today}</h2></div><button className="button primary" onClick={() => { setNewEmployee(blankEmployee()); setSection('add'); }}>{t.hr.add}<span aria-hidden="true">+</span></button></div>
          <p className="helper-text">{t.hr.todayHint}</p>
          {summary?.today.length ? <div className="signal-list">{summary.today.map(person => <article className={`signal-card ${person.risk.level}`} key={person.id}>
            <div className="signal-top"><RiskBadge level={person.risk.level} /><span className="muted">{person.department} · {t.labels.adaptationDay(person.adaptationDay)}</span></div>
            <button className="person-link" onClick={() => showProfile(person.id)}>{person.name}<span aria-hidden="true">↗</span></button>
            <p className="reason-line">{person.risk.reasons[0]}</p>
            <p className="ask-hint"><b>{t.hr.askAbout}:</b> {t.hr.askTopic(person.risk.reasons[0] || '')}</p>
            <div className="card-actions">
              <a className="button primary" href={`tel:${person.phone}`} onClick={() => { setCallTarget(person); setResult(''); }}>{t.hr.call}<span aria-hidden="true">↗</span></a>
              <button className="button secondary" onClick={() => { setCallTarget({ ...person, noteOnly: true }); setResult(''); }}>{t.hr.note}</button>
              <button className="quiet-button" onClick={() => saveAction(person.id, 'remind')}>{t.hr.tomorrow}</button>
            </div>
            {callTarget?.id === person.id && <div className="call-form">
              <strong>{callTarget.noteOnly ? t.hr.note : t.hr.calls}</strong>
              {!callTarget.noteOnly && <div className="result-tags">{t.hr.results.map(item => <button key={item} className={result === item ? 'selected' : ''} onClick={() => setResult(item)}>{item}</button>)}</div>}
              <label>{t.hr.callText}<textarea value={note} onChange={e => setNote(e.target.value)} /></label>
              <button className="button primary" disabled={!callTarget.noteOnly && !result} onClick={() => saveAction(person.id, callTarget.noteOnly ? t.hr.actionValues.note : t.hr.actionValues.call, result, note)}>{t.hr.saveAction}</button>
            </div>}
          </article>)}</div> : <div className="empty-state"><div className="success-icon">✓</div><h3>{t.hr.calm}</h3><p>{t.hr.empty}</p></div>}
        </>}
        {section === 'people' && <>
          <div className="section-title-row"><div><span className="eyebrow">{t.labels.peopleList}</span><h2>{t.hr.all}</h2></div><button className="button primary" onClick={() => { setNewEmployee(blankEmployee()); setSection('add'); }}>{t.hr.add}<span aria-hidden="true">+</span></button></div>
          <div className="filters">
            <input aria-label={t.hr.search} placeholder={t.hr.search} value={search} onChange={e => setSearch(e.target.value)} />
            <select aria-label={t.hr.department} value={department} onChange={e => setDepartment(e.target.value)}><option value="">{t.hr.department}: {t.hr.any}</option>{t.departments.map(item => <option key={item}>{item}</option>)}</select>
            <select aria-label={t.hr.risk} value={risk} onChange={e => setRisk(e.target.value)}><option value="">{t.hr.risk}: {t.hr.any}</option>{['red', 'yellow', 'green'].map(key => <option key={key} value={key}>{t.risk[key]}</option>)}</select>
            <select aria-label={t.hr.status} value={status} onChange={e => setStatus(e.target.value)}><option value="">{t.hr.status}: {t.hr.any}</option><option value={t.hr.statusValues.active}>{t.hr.active}</option><option value={t.hr.statusValues.fired}>{t.hr.fired}</option></select>
          </div>
          <div className="people-list">{employees.map(person => <button className={`person-row ${selected === person.id ? 'chosen' : ''}`} key={person.id} onClick={() => showProfile(person.id)}>
            <span className="person-avatar">{person.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><span className="person-info"><b>{person.name}</b><small>{person.department} · {person.location}</small></span><RiskBadge level={person.status === t.hr.statusValues.fired ? 'green' : person.risk.level} /><span className="arrow">→</span>
          </button>)}</div>
        </>}
        {section === 'awaiting' && <>
          <div className="section-title-row"><div><span className="eyebrow">{t.labels.reminders}</span><h2>{t.hr.awaiting}</h2></div></div>
          {awaiting.length ? <div className="people-list">{awaiting.map(item => <div className="awaiting-row" key={`${item.id}-${item.day}`}>
            <div><b>{item.name}</b><small>{item.department} · {t.labels.adaptationDay(item.day)} · {t.labels.late(item.daysLate)}</small></div>
            <button className="button secondary" onClick={() => copyText(`${t.hr.invite(item.name)}\n${window.location.origin}${item.url}`, t.hr.reminderCopied)}>{t.hr.copyReminder}</button>
          </div>)}</div> : <div className="empty-state"><p>{t.hr.noAwaiting}</p></div>}
        </>}
        {section === 'add' && newEmployee && <>
          <div className="section-title-row"><div><span className="eyebrow">{t.labels.newRecord}</span><h2>{t.hr.add}</h2></div></div>
          {newEmployee.saved ? <div className="saved-card"><div className="success-icon">✓</div><h2>{t.hr.saved}</h2><p>{t.hr.invite(newEmployee.saved.name)}</p><div className="copy-link">{window.location.origin}{newEmployee.saved.url}</div><button className="button primary" onClick={() => copyText(`${t.hr.invite(newEmployee.saved.name)}\n${window.location.origin}${newEmployee.saved.url}`, t.hr.copied)}>{t.hr.copyInvite}</button><a className="text-button" href={newEmployee.saved.url} onClick={e => { e.preventDefault(); go(newEmployee.saved.url); }}>{t.labels.openSurvey}</a></div> :
            <form className="form-card" onSubmit={saveNewEmployee}>
              <div className="form-grid">
                <label>{t.hr.name}<input required value={newEmployee.name} onChange={e => addField('name', e.target.value)} /></label>
                <label>{t.hr.phone}<input required type="tel" value={newEmployee.phone} onChange={e => addField('phone', e.target.value)} placeholder="+375 29 000-00-00" /></label>
                <label>{t.hr.department}<select value={newEmployee.department} onChange={e => addField('department', e.target.value)}>{t.departments.map(item => <option key={item}>{item}</option>)}</select></label>
                <label>{t.hr.location}<input required value={newEmployee.location} onChange={e => addField('location', e.target.value)} /></label>
                <label>{t.hr.job}<input required value={newEmployee.job_title} onChange={e => addField('job_title', e.target.value)} /></label>
                <label>{t.hr.shift}<select value={newEmployee.shift} onChange={e => addField('shift', e.target.value)}>{t.shifts.map(item => <option key={item}>{item}</option>)}</select></label>
                <label>{t.hr.start}<input required type="date" value={newEmployee.start_date} onChange={e => addField('start_date', e.target.value)} /></label>
                <label>{t.hr.mentor}<input value={newEmployee.mentor_id} onChange={e => addField('mentor_id', e.target.value)} /></label>
              </div>
              <button className="button primary" type="submit">{t.hr.save}</button>
            </form>}
        </>}
      </section>
      {selected && selectedEmployee && profile && <EmployeeProfile profile={profile} onClose={() => { setSelected(null); setProfile(null); }} onTerminate={() => setTermination(profile.id)}
        onSurveyScheduled={async () => setProfile(await api(`/api/hr/employees/${selected}`))} />}
    </div>}
    {termination && <TerminationDialog reason={reason} setReason={setReason} onCancel={() => setTermination(null)} onConfirm={terminate} />}
  </main>;
}
