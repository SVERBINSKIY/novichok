import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { usePath } from './hooks/usePath.js';
import { texts as t } from './texts.js';
import Header from './components/common/Header.jsx';
import Loading from './components/common/Loading.jsx';
import BossPage from './pages/boss/BossPage.jsx';
import HomePage from './pages/HomePage.jsx';
import HrPage from './pages/hr/HrPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PulsePage from './pages/PulsePage.jsx';

export default function App() {
  const [path, go] = usePath();
  const [sessionRole, setSessionRole] = useState(null);
  const [checkingSession, setCheckingSession] = useState(false);

  useEffect(() => {
    const role = path === '/hr' ? 'hr' : path === '/boss' ? 'boss' : null;
    if (!role) return;
    let active = true;
    setCheckingSession(true);
    api('/api/session').then(session => {
      if (active) setSessionRole(session.role);
    }).catch(() => {
      if (active) setSessionRole(null);
    }).finally(() => {
      if (active) setCheckingSession(false);
    });
    return () => { active = false; };
  }, [path]);

  if (path.startsWith('/p/')) return <PulsePage token={decodeURIComponent(path.split('/')[2] || '')} go={go} />;
  if (path === '/hr') return checkingSession ? <Loading /> : sessionRole === 'hr' ? <HrPage go={go} /> : <LoginPage role="hr" go={go} onSuccess={setSessionRole} />;
  if (path === '/boss') return checkingSession ? <Loading /> : sessionRole === 'boss' ? <BossPage go={go} /> : <LoginPage role="boss" go={go} onSuccess={setSessionRole} />;
  if (path === '/login/hr') return <LoginPage role="hr" go={go} onSuccess={setSessionRole} />;
  if (path === '/login/boss') return <LoginPage role="boss" go={go} onSuccess={setSessionRole} />;
  if (path.startsWith('/m/')) return <main className="pulse-page"><Header go={go} /><section className="pulse-card center-state"><h1>{t.mentor.title}</h1><p>{t.mentor.notReady}</p><button className="button secondary" onClick={() => go('/')}>{t.login.back}</button></section></main>;
  return <HomePage go={go} />;
}
