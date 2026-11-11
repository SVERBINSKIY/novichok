import { texts } from '../client/src/texts.js';

const dayMs = 24 * 60 * 60 * 1000;

function daysBetween(left, right) {
  return Math.floor((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / dayMs);
}

export function assessRisk(employee, pulses = [], mentorReviews = [], attendanceEvents = [], today = new Date().toISOString().slice(0, 10)) {
  if (!employee || employee.status === 'уволен') return { level: 'green', reasons: [] };

  const reasons = [];
  const answers = pulses
    .filter(pulse => pulse.responded_at)
    .sort((a, b) => a.day - b.day);
  const last = answers.at(-1);
  const previous = answers.at(-2);
  const missed = pulses
    .filter(pulse => !pulse.responded_at && daysBetween(pulse.due_date, today) >= 3)
    .sort((a, b) => a.day - b.day);
  const orderedPulses = [...pulses].sort((a, b) => a.day - b.day);
  const hasTwoMisses = orderedPulses.some((pulse, index) => {
    const next = orderedPulses[index + 1];
    return next && !pulse.responded_at && !next.responded_at
      && daysBetween(pulse.due_date, today) >= 3
      && daysBetween(next.due_date, today) >= 3;
  });
  const recentEvents = attendanceEvents.filter(event => {
    const age = daysBetween(event.event_date, today);
    return age >= 0 && age < 14;
  }).length;
  const review30 = mentorReviews.find(review => Number(review.day) === 30);
  const adaptationDay = daysBetween(employee.start_date, today);
  const words = texts.riskReasons;

  if (last && last.future !== null && last.future !== undefined && Number(last.future) <= 2) {
    reasons.push(words.futureLow);
  }
  if (last && previous && Number(previous.mood) - Number(last.mood) >= 2) {
    reasons.push(words.moodDrop);
  }
  if (last && last.reality !== null && last.reality !== undefined
    && last.future !== null && last.future !== undefined
    && Number(last.reality) <= 2 && Number(last.future) <= 3) {
    reasons.push(words.realityAndFuture);
  }
  if (hasTwoMisses) reasons.push(words.missedPulses);
  if (review30 && (review30.risk === 'высокий' || Number(review30.reached_tasks) === 0)) {
    reasons.push(words.mentorRisk);
  }
  if (adaptationDay >= 3 && !employee.mentor_id) reasons.push(words.noMentor);
  if (recentEvents >= 3) reasons.push(words.attendanceRed);

  const redReasons = reasons.length;
  if (last && (Number(last.mood) === 3 || Number(last.clarity) === 3)) {
    reasons.push(words.moodOrClarity);
  }
  if (last && last.reality !== null && last.reality !== undefined && Number(last.reality) <= 2) {
    reasons.push(words.realityLow);
  }
  if (last && last.has_contact === 'нет') reasons.push(words.noContact);
  if (missed.length === 1) reasons.push(words.oneMissedPulse);
  if (recentEvents === 2) reasons.push(words.attendanceYellow);

  if (redReasons) return { level: 'red', reasons };
  if (reasons.length) return { level: 'yellow', reasons };
  return { level: 'green', reasons: [words.noSignal] };
}

export const daysBetweenDates = daysBetween;
