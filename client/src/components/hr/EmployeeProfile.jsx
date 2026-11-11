import { texts as t } from '../../texts.js';
import SurveyScheduler from './SurveyScheduler.jsx';
import RiskBadge from '../common/RiskBadge.jsx';

export default function EmployeeProfile({ profile, onClose, onTerminate, onSurveyScheduled }) {
  return <aside className="profile-card">
    <div className="profile-head"><div><span className="eyebrow">{t.hr.profileKicker}</span><h2>{profile.name}</h2><p>{profile.department} · {profile.job_title}</p></div><button className="icon-button" aria-label={t.hr.closeProfile} onClick={onClose}>×</button></div>
    <RiskBadge level={profile.status === t.hr.statusValues.fired ? 'green' : profile.risk.level} />
    {profile.risk.reasons.length > 0 && <div className="attention-box"><b>{t.labels.whyAttention}</b><ul>{profile.risk.reasons.map(item => <li key={item}>{item}</li>)}</ul></div>}
    <div className="profile-meta"><span>{profile.phone}</span><span>{profile.location} · {profile.shift}</span><span>{t.labels.leaveDate(profile.start_date)}</span></div>
    {profile.status === t.hr.statusValues.active && <SurveyScheduler employee={profile} pulses={profile.pulses} onScheduled={onSurveyScheduled} />}
    <h3>{t.hr.graph}</h3>
    {profile.pulses.some(item => item.responded_at) ? <div className="rating-chart" aria-label={t.hr.graph}>
      {profile.pulses.filter(item => item.responded_at).map(item => {
        const values = [item.mood, item.clarity, item.reality, item.future];
        return <div className="rating-point" key={item.id}>
          <div className="rating-bars">{values.map((value, index) => value === null || value === undefined ? null : <span key={index}
            className={`rating-bar rating-${index}`} title={t.hr.ratingValue(t.hr.graphLegend[index], value)}
            aria-label={t.hr.ratingValue(t.hr.graphLegend[index], value)} style={{ height: `${value * 13}px` }} />)}</div>
          <small>{t.hr.dayN(item.day)}</small>
        </div>;
      })}
    </div> : <p className="muted">{t.hr.noPulses}</p>}
    <div className="chart-legend">{t.hr.graphLegend.map((label, index) => <span key={label}><i className={`rating-key rating-${index}`} />{label}</span>)}</div>
    <h3>{t.hr.pulseHistory}</h3>
    {profile.pulses.some(item => item.responded_at) ? <div className="pulse-history">{profile.pulses.filter(item => item.responded_at).map(item => <div className="pulse-history-row" key={item.id}><b>{t.hr.dayN(item.day)}</b><span>{t.hr.mood} {item.mood}/5</span><span>{t.hr.clarity} {item.clarity ?? '—'}/5</span><span>{item.tags.join(', ')}</span>{item.comment && <small>{item.comment}</small>}</div>)}</div> : <p className="muted">{t.hr.noPulses}</p>}
    <h3>{t.hr.mentorReview}</h3>
    {profile.mentorReviews.length ? profile.mentorReviews.map(review => <div className="timeline-item" key={review.id}><b>{t.hr.dayN(review.day)}</b><span>{t.hr.mentorTasks}: {review.reached_tasks ? t.hr.reached : t.hr.notReached} · {t.hr.mentorRisk}: {t.hr.mentorRiskLabel(review.risk)}</span>{review.comment && <p>{review.comment}</p>}</div>) : <p className="muted">{t.hr.noMentor}</p>}
    <h3>{t.hr.attendance}</h3>
    {profile.attendanceEvents.length ? profile.attendanceEvents.map(event => <div className="timeline-item" key={event.id}><b>{t.hr.attendanceType(event.type)}</b><small>{event.event_date}</small>{event.comment && <p>{event.comment}</p>}</div>) : <p className="muted">{t.hr.noAttendance}</p>}
    <h3>{t.hr.actions}</h3>
    {profile.actions.length ? profile.actions.map(item => <div className="timeline-item" key={item.id}><b>{t.hr.actionType(item.type)}</b><small>{item.action_date} · {t.hr.resultLabel(item.result)}</small>{item.text && <p>{item.text}</p>}</div>) : <p className="muted">{t.hr.noHistory}</p>}
    {profile.status !== t.hr.statusValues.fired && <button className="button danger-outline wide" onClick={onTerminate}>{t.hr.terminate}</button>}
  </aside>;
}
