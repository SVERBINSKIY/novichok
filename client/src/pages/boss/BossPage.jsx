import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { texts as t } from '../../texts.js';
import ErrorState from '../../components/common/ErrorState.jsx';
import Header from '../../components/common/Header.jsx';
import Loading from '../../components/common/Loading.jsx';
import MetricCard from '../../components/common/MetricCard.jsx';
import Percent from '../../components/common/Percent.jsx';

export default function BossPage({ go }) {
  const [metrics, setMetrics] = useState(null);
  const [retentionBreakdown, setRetentionBreakdown] = useState('department');
  const [error, setError] = useState('');
  const load = useCallback(() => api('/api/boss/metrics').then(setMetrics).catch(e => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }); go('/'); };
  if (error && !metrics) return <main className="app-shell"><Header go={go} /><ErrorState error={error} retry={load} /></main>;
  if (!metrics) return <main className="app-shell"><Header go={go} /><Loading /></main>;

  const comparables = metrics.hotDepartments.filter(group => !group.hidden);
  const highest = comparables[0];
  const others = comparables.slice(1);
  const otherRate = others.length ? others.reduce((sum, group) => sum + group.rate, 0) / others.length : null;
  const retention = retentionBreakdown === 'department' ? metrics.retentionByDepartment : metrics.retentionByLocation;
  const listBar = (items, { locations = false } = {}) => <div className="rank-list">{items.map(item => <div className="rank-row" key={item.name}>
    <span>{item.name}</span>{item.hidden ? <small>{t.boss.hidden}</small> : <><div className="bar-track"><span style={{ width: `${Math.max(3, (locations ? item.rate : (item.count || 0) / Math.max(1, ...items.map(entry => entry.count || 0))) * 100)}%` }} /></div><b>{locations ? <Percent value={item.rate} /> : item.count}</b></>}
  </div>)}</div>;

  return <main className="app-shell boss-shell">
    <Header go={go} right={<button className="text-button" onClick={logout}>{t.boss.logout}</button>} />
    <div className="workspace-head boss-head"><div><span className="eyebrow">{t.labels.bossOverview}</span><h1>{t.boss.title}</h1></div><span className="synthetic-note">{t.synthetic}</span></div>
    <section className="insight-banner"><span className="insight-icon">↗</span><p>{highest && otherRate !== null ? t.boss.insight(highest.name, Math.round(highest.rate * 100), Math.round(otherRate * 100)) : t.boss.noData}</p></section>
    <section className="metrics-grid">
      <MetricCard label={t.boss.newcomers} value={metrics.kpis.newcomers12m} />
      <MetricCard label={t.boss.early} value={<Percent value={metrics.kpis.earlyExitRate} />} hint={t.boss.tooltipEarly} />
      <MetricCard label={t.boss.average} value={metrics.kpis.averageExitDays === null ? '—' : t.labels.duration(metrics.kpis.averageExitDays)} />
      <MetricCard label={t.boss.red} value={metrics.kpis.redNow} />
      <MetricCard label={t.boss.closed} value={<Percent value={metrics.kpis.actionCloseRate14d} />} hint={t.boss.tooltipAction} />
    </section>
    <div className="boss-grid">
      <section className="dashboard-card retention-card"><h2>{t.boss.retention}</h2><p className="chart-meaning">{t.boss.retentionMeaning}</p>
        <div className="segmented-control" role="group" aria-label={t.boss.breakdown}>
          <button className={retentionBreakdown === 'department' ? 'selected' : ''} onClick={() => setRetentionBreakdown('department')}>{t.boss.byDepartment}</button>
          <button className={retentionBreakdown === 'location' ? 'selected' : ''} onClick={() => setRetentionBreakdown('location')}>{t.boss.byLocation}</button>
        </div>
        {retention.length ? <div className="retention-table"><div className="retention-row table-header"><span>{retentionBreakdown === 'department' ? t.boss.byDepartment : t.boss.byLocation}</span>{[30, 60, 90].map(day => <span key={day}>{t.labels.days(day)}</span>)}</div>
          {retention.map(group => (
            <div className="retention-row" key={retentionBreakdown === 'department' ? group.department : group.location}>
              <b>{retentionBreakdown === 'department' ? group.department : group.location}</b>
              {group.curve.map(point => (
                <span className={point.hidden ? 'hidden-cell' : ''} key={point.day}>
                  {point.hidden ? '—' : <>{Math.round(point.rate * 100)}<small>%</small></>}
                </span>
              ))}
            </div>
          ))}
        </div> : <p className="muted">{t.boss.hidden}</p>}
      </section>
      <section className="dashboard-card"><h2>{t.boss.reasons}</h2><p className="chart-meaning">{t.boss.reasonsPeriod}</p>{metrics.topReasons.length ? listBar(metrics.topReasons) : <p className="muted">{t.boss.noReasons}</p>}</section>
      <section className="dashboard-card"><h2>{t.boss.tags}</h2><p className="chart-meaning">{t.boss.tagsContext}</p>{metrics.topTags.length ? listBar(metrics.topTags) : <p className="muted">{t.boss.noReasons}</p>}</section>
      <section className="dashboard-card"><h2>{t.boss.hotspots}</h2><div className="hotspot-columns"><div><h3>{t.boss.departments}</h3>{listBar(metrics.hotDepartments, { locations: true })}</div><div><h3>{t.boss.locations}</h3>{listBar(metrics.hotLocations, { locations: true })}</div></div></section>
      <section className="dashboard-card cohorts-card"><h2>{t.boss.cohorts}</h2><p className="chart-meaning">{t.boss.cohortMeaning}</p><div className="cohort-bars">{metrics.cohorts.map(item => {
        const status = item.hidden ? t.boss.hidden : !item.mature ? t.boss.immature : `${Math.round(item.rate * 100)}%`;
        return <div className="cohort-column" key={item.month} aria-label={`${item.month}: ${status}`}>
          <div className="cohort-bar-track" title={status}>{item.hidden || !item.mature ? <span className="cohort-hidden" /> : <span style={{ height: `${Math.max(4, item.rate * 100)}%` }} />}</div>
          <b title={status}>{item.hidden || !item.mature ? '—' : <Percent value={item.rate} />}</b><small>{item.month.slice(2)}</small>
        </div>;
      })}</div></section>
    </div>
    <p className="privacy-footnote">{t.boss.privacyFootnote} {t.synthetic}</p>
  </main>;
}
