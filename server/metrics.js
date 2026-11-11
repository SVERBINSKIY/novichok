const DAY = 24 * 60 * 60 * 1000;
const MIN_GROUP_SIZE = 5;

function datePlus(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

function monthOf(date) {
  return date.slice(0, 7);
}

function endOfMonth(month) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
}

function isEarlyExit(employee) {
  return employee.status === 'уволен'
    && employee.exit_date
    && employee.exit_date < datePlus(employee.start_date, 90);
}

function summarizeRetention(employees, today) {
  return [30, 60, 90].map(day => {
    const eligible = employees.filter(employee => datePlus(employee.start_date, day) <= today);
    const retained = eligible.filter(employee => !employee.exit_date || employee.exit_date >= datePlus(employee.start_date, day));
    return {
      day,
      eligible: eligible.length,
      retained: retained.length,
      rate: eligible.length ? retained.length / eligible.length : null
    };
  });
}

function groupedEarlyExit(employees, field, today) {
  const eligible = employees.filter(employee => datePlus(employee.start_date, 90) <= today);
  const groups = new Map();
  for (const employee of eligible) {
    const key = employee[field] || 'Не указано';
    const group = groups.get(key) || { name: key, total: 0, early: 0 };
    group.total += 1;
    if (isEarlyExit(employee)) group.early += 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(group => ({ ...group, rate: group.total ? group.early / group.total : 0, hidden: group.total < MIN_GROUP_SIZE }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total);
}

export function buildMetrics({ employees = [], pulses = [], actions = [], today = new Date().toISOString().slice(0, 10) }) {
  const recent = employees.filter(employee => employee.start_date >= datePlus(today, -365));
  const mature = recent.filter(employee => datePlus(employee.start_date, 90) <= today);
  const early = mature.filter(isEarlyExit);
  const exited = recent.filter(employee => employee.status === 'уволен' && employee.exit_date);
  const isLow = (value, threshold) => value !== null && value !== undefined && Number(value) <= threshold;
  const signals14 = pulses.filter(pulse => pulse.responded_at && pulse.responded_at >= datePlus(today, -14)
    && (isLow(pulse.mood, 3) || isLow(pulse.clarity, 3) || isLow(pulse.reality, 2)
      || isLow(pulse.future, 3) || pulse.has_contact === 'нет'));
  const closedSignals = signals14.filter(pulse => actions.some(action => action.employee_id === pulse.employee_id
    && action.action_date >= pulse.responded_at
    && ['дозвонился', 'вопрос решён', 'нужна эскалация'].includes(action.result)));
  const reasons = new Map();
  const tags = new Map();

  for (const employee of exited) {
    if (employee.exit_reason) reasons.set(employee.exit_reason, (reasons.get(employee.exit_reason) || 0) + 1);
  }
  for (const pulse of pulses) {
    if (!pulse.responded_at || pulse.responded_at < datePlus(today, -365)) continue;
    for (const tag of pulse.tags || []) tags.set(tag, (tags.get(tag) || 0) + 1);
  }

  const departments = groupedEarlyExit(recent, 'department', today);
  const locations = groupedEarlyExit(recent, 'location', today);
  const cohorts = new Map();
  for (const employee of recent) {
    const key = monthOf(employee.start_date);
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(employee);
  }
  const monthly = [...cohorts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, people]) => {
    const eligible = people.filter(employee => datePlus(employee.start_date, 90) <= today);
    const isMature = datePlus(endOfMonth(month), 90) <= today;
    const exits = eligible.filter(isEarlyExit).length;
    return {
      month,
      total: isMature ? eligible.length : 0,
      early: isMature ? exits : 0,
      rate: isMature && eligible.length ? exits / eligible.length : null,
      mature: isMature
    };
  });
  const avgTenure = exited.length
    ? Math.round(exited.reduce((sum, employee) => sum + Math.max(0, Math.round((Date.parse(`${employee.exit_date}T00:00:00Z`) - Date.parse(`${employee.start_date}T00:00:00Z`)) / DAY)), 0) / exited.length)
    : null;

  return {
    kpis: {
      newcomers12m: recent.length,
      earlyExitRate: mature.length ? early.length / mature.length : null,
      matureEmployees: mature.length,
      averageExitDays: avgTenure,
      redNow: 0,
      actionCloseRate14d: signals14.length ? closedSignals.length / signals14.length : null
    },
    retentionByDepartment: [...new Set(recent.map(employee => employee.department))]
      .map(department => ({ department, curve: summarizeRetention(recent.filter(employee => employee.department === department), today) }))
      .filter(group => group.curve.some(point => point.eligible >= MIN_GROUP_SIZE)),
    retentionByLocation: [...new Set(recent.map(employee => employee.location))]
      .map(location => ({ location, curve: summarizeRetention(recent.filter(employee => employee.location === location), today) }))
      .filter(group => group.curve.some(point => point.eligible >= MIN_GROUP_SIZE)),
    topReasons: [...reasons.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    topTags: [...tags.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    hotDepartments: departments,
    hotLocations: locations,
    cohorts: monthly,
    privacyNote: 'Слишком мало данных, чтобы не раскрывать отдельных людей'
  };
}

export { MIN_GROUP_SIZE, summarizeRetention };
