import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { texts as t } from '../texts.js';
import ErrorState from '../components/common/ErrorState.jsx';
import Header from '../components/common/Header.jsx';
import Loading from '../components/common/Loading.jsx';

export default function PulsePage({ token, go }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const load = useCallback(() => api(`/api/p/${token}`).then(result => {
    setData(result);
    setError('');
  }).catch(e => setError(e.message)), [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data?.pulse) return;
    const key = `novichok.draft.${token}.${data.pulse.id}`;
    try {
      const draft = localStorage.getItem(key);
      if (draft) {
        const saved = JSON.parse(draft);
        setAnswers(saved.answers || {});
        setStep(Number.isInteger(saved.step) ? saved.step : -1);
      } else {
        setAnswers({});
        setStep(-1);
      }
    } catch {
      setError(t.survey.draftError);
      setStep(-1);
    }
  }, [data?.pulse?.id, token]);
  useEffect(() => {
    if (!data?.pulse || step === -2 || done) return;
    try {
      localStorage.setItem(`novichok.draft.${token}.${data.pulse.id}`, JSON.stringify({ answers, step }));
    } catch {
      setError(t.survey.draftError);
    }
  }, [answers, data?.pulse?.id, done, step, token]);

  const questions = useMemo(() => {
    if (!data?.pulse) return [];
    const day = data.pulse.day;
    return [
      { key: 'mood', title: t.survey.mood, type: 'rating' },
      ...(day === 3 ? [] : [{ key: 'clarity', title: t.survey.clarity, type: 'rating' }]),
      ...([14, 30].includes(day) ? [{ key: 'reality', title: t.survey.reality, type: 'rating' }] : []),
      ...(day >= 14 ? [{ key: 'future', title: t.survey.future, type: 'rating' }] : []),
      { key: 'has_contact', title: t.survey.contact, type: 'yesno' }
    ];
  }, [data]);
  const lowSignal = Object.entries(answers).some(([key, value]) => key !== 'tags' && ['mood', 'clarity', 'reality', 'future'].includes(key) && Number(value) <= 3)
    || answers.has_contact === t.surveyData.no;
  const currentQuestion = step >= 0 && step < questions.length ? questions[step] : null;
  const setAnswer = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }));

  const submit = async () => {
    try {
      await api(`/api/p/${token}`, { method: 'POST', body: JSON.stringify(answers) });
      localStorage.removeItem(`novichok.draft.${token}.${data.pulse.id}`);
      setDone(true);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  if (!data && !error) return <main className="pulse-page"><Loading /></main>;
  if (error && !data) return <main className="pulse-page"><ErrorState error={error} retry={load} /><button className="text-button" onClick={() => go('/')}>{t.login.back}</button></main>;
  if (data.idle) return <main className="pulse-page"><Header go={go} /><section className="pulse-card center-state"><div className="success-icon">✓</div><h1>{t.survey.idleTitle}</h1><p>{t.survey.idleText}</p></section></main>;
  const elapsed = Math.max(0, Math.min(90, Math.floor((Date.now() - new Date(`${data.employee.start_date}T00:00:00`).getTime()) / 86400000)));
  if (done) return <main className="pulse-page"><Header go={go} /><section className="pulse-card center-state"><div className="success-icon">✓</div><div className="eyebrow">{t.survey.progress(data.progress + 1, 5)} · {t.labels.day(data.pulse.day)}</div><h1>{t.survey.thanks}</h1><p>{t.survey.followup}</p></section></main>;

  return <main className="pulse-page">
    <Header go={go} />
    <section className="pulse-card">
      <div className="pulse-meta"><span>{t.survey.day(elapsed)}</span><span>{step < 0 ? t.survey.timing(data.pulse.day) : t.survey.questionProgress(Math.min(step + 1, questions.length), questions.length + (lowSignal ? 1 : 0))}</span></div>
      <div className="progress-track"><span style={{ width: `${Math.min(100, ((Math.max(step, 0) + 1) / (questions.length + 1)) * 100)}%` }} /></div>
      {step === -1 ? <>
        <div className="welcome-icon">☀</div>
        <h1>{t.survey.greeting(data.employee.name)}</h1>
        <p className="demo-identity">{t.survey.demoIdentity(data.employee.name)}</p>
        <p className="lead">{t.survey.intro}</p>
        <div className="survey-purpose"><b>{t.survey.purposeTitle}</b><p>{t.survey.purpose}</p></div>
        <div className="privacy-box"><span aria-hidden="true">◉</span><p>{t.privacy}</p></div>
        <button className="button primary wide large" onClick={() => setStep(0)}>{t.survey.begin}<span aria-hidden="true">→</span></button>
      </> : <>
        <div className="question-count">{t.labels.question(Math.min(step + 1, questions.length), questions.length + (lowSignal ? 1 : 0))}</div>
        {currentQuestion && <>
          <h1 className="question-title">{currentQuestion.title}</h1>
          {currentQuestion.type === 'rating' ? <div className="rating-options">
            {t.survey.labels.map((label, index) => <button key={label} type="button" aria-pressed={answers[currentQuestion.key] === index + 1}
              className={`rating-option ${answers[currentQuestion.key] === index + 1 ? 'selected' : ''}`}
              onClick={() => setAnswer(currentQuestion.key, index + 1)}><b>{index + 1}</b><span>{label}</span></button>)}
          </div> : <div className="choice-options">
            {[t.survey.yes, t.survey.no].map(label => {
              const value = label === t.survey.yes ? t.surveyData.yes : t.surveyData.no;
              return <button key={value} type="button" aria-pressed={answers.has_contact === value}
                className={`choice-option ${answers.has_contact === value ? 'selected' : ''}`} onClick={() => setAnswer('has_contact', value)}>{label}</button>;
            })}
          </div>}
        </>}
        {step === questions.length && lowSignal && <>
          <h1 className="question-title">{t.survey.trouble}</h1>
          <div className="tag-list">{t.survey.tags.map(tag => <button key={tag} type="button" aria-pressed={(answers.tags || []).includes(tag)}
            className={`tag-chip ${(answers.tags || []).includes(tag) ? 'selected' : ''}`} onClick={() => setAnswer('tags', (answers.tags || []).includes(tag) ? answers.tags.filter(item => item !== tag) : [...(answers.tags || []), tag])}>{tag}</button>)}</div>
          <textarea maxLength="500" placeholder={t.survey.commentPlaceholder} value={answers.comment || ''} onChange={e => setAnswer('comment', e.target.value)} />
        </>}
        {step === questions.length && !lowSignal && <>
          <h1 className="question-title">{t.survey.add}</h1>
          <textarea maxLength="500" placeholder={t.survey.commentPlaceholder} value={answers.comment || ''} onChange={e => setAnswer('comment', e.target.value)} />
        </>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="survey-actions">
          {step > 0 && <button className="button secondary" onClick={() => setStep(step - 1)}>{t.survey.back}</button>}
          {step < questions.length && <button className="button primary" disabled={!currentQuestion || answers[currentQuestion.key] === undefined}
            onClick={() => setStep(step + 1)}>{t.survey.next}<span aria-hidden="true">→</span></button>}
          {step === questions.length && <button className="button primary" disabled={lowSignal && !(answers.tags || []).length} onClick={submit}>{t.survey.send}</button>}
        </div>
      </>}
    </section>
  </main>;
}
