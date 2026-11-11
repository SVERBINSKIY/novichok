import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { texts as t } from '../texts.js';
import Header from '../components/common/Header.jsx';
import Loading from '../components/common/Loading.jsx';

export default function HomePage({ go }) {
  const [demo, setDemo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => api('/api/public/demo').then(setDemo).catch(e => setError(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);

  const enter = async role => {
    try {
      await api(`/api/auth/demo/${role}`, { method: 'POST' });
      go(`/${role}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const reset = async () => {
    if (!window.confirm(t.home.resetConfirm)) return;
    setBusy(true);
    try {
      await api('/api/demo/reset', { method: 'POST' });
      await refresh();
      setError('');
      window.alert(t.home.resetDone);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return <main className="home-page">
    <Header go={go} right={<span className="demo-badge">{t.home.demo}</span>} />
    <section className="hero">
      <div className="eyebrow">{t.tagline}</div>
      <h1>{t.heroLineOne}<br /><span>{t.heroLineTwo}</span></h1>
      <p className="lead">{t.home.intro}</p>
      <p className="synthetic-note">{t.synthetic}</p>
    </section>
    <section className="user-guide" aria-labelledby="user-guide-title">
      <h2 id="user-guide-title">{t.home.userGuideTitle}</h2>
      <div className="user-guide-steps">
        <article><h3>{t.home.guideNewcomerTitle}</h3><p>{t.home.guideNewcomer}</p></article>
        <article><h3>{t.home.guideHrTitle}</h3><p>{t.home.guideHr}</p></article>
        <article><h3>{t.home.guideBossTitle}</h3><p>{t.home.guideBoss}</p></article>
      </div>
    </section>
    <section className="demo-grid" aria-label={t.home.demoEntries}>
      <article className="demo-card newcomer-card">
        <div className="card-kicker">{t.labels.newcomer}</div>
        <h2>{t.home.newcomer}</h2>
        <p>{t.home.newcomerDescription}</p>
        <div className="demo-links">
          {(demo?.newcomers || []).map((person, i) => <a key={person.id} className="demo-link" href={person.url} onClick={e => { e.preventDefault(); go(person.url); }}>
            <span className="status-dot" /><span className="demo-person">{t.home.demoLink(person.name, t.home.demoCases[i] || '')}</span><span aria-hidden="true">→</span>
          </a>)}
          {!demo && <Loading />}
        </div>
      </article>
      <article className="demo-card">
        <div className="card-kicker">{t.labels.hr}</div>
        <h2>{t.home.hrHeading}</h2>
        <p>{t.home.hrDescription}</p>
        <button className="button primary wide" onClick={() => enter('hr')}>{t.home.hr}<span aria-hidden="true">→</span></button>
      </article>
      <article className="demo-card">
        <div className="card-kicker">{t.labels.boss}</div>
        <h2>{t.home.bossHeading}</h2>
        <p>{t.home.bossDescription}</p>
        <button className="button primary wide" onClick={() => enter('boss')}>{t.home.boss}<span aria-hidden="true">→</span></button>
      </article>
    </section>
    <section className="how-it-works">
      <div><span className="eyebrow">{t.home.explanationTitle}</span><p>{t.home.explanation}</p></div>
      <div><span className="eyebrow">{t.home.walkthroughTitle}</span><p>{t.home.walkthrough}</p></div>
      <div className="demo-reminder"><span aria-hidden="true">ⓘ</span>{t.home.demoHint}</div>
    </section>
    <div className="home-footer">
      <span>{error && <span className="inline-error">{error}</span>}</span>
      <button className="text-button" disabled={busy} onClick={reset}>{t.home.reset}</button>
    </div>
  </main>;
}
