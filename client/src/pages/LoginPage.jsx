import { useState } from 'react';
import { api } from '../lib/api.js';
import { texts as t } from '../texts.js';
import Header from '../components/common/Header.jsx';

export default function LoginPage({ role, go, onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const login = async event => {
    event.preventDefault();
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ role, password }) });
      onSuccess?.(role);
      go(`/${role}`);
    } catch {
      setError(t.login.error);
    }
  };

  const demo = async () => {
    try {
      await api(`/api/auth/demo/${role}`, { method: 'POST' });
      onSuccess?.(role);
      go(`/${role}`);
    } catch (e) {
      setError(e.message);
    }
  };

  return <main className="login-page">
    <Header go={go} />
    <form className="login-card" onSubmit={login}>
      <span className="eyebrow">{t.welcomeLabel}</span>
      <h1>{t.login.title(role)}</h1>
      <label>{t.login.password}<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="button primary wide" type="submit">{t.login.submit}</button>
      <button className="button secondary wide" type="button" onClick={demo}>{t.login.demo}</button>
      <button className="text-button" type="button" onClick={() => go('/')}>{t.login.back}</button>
    </form>
  </main>;
}
