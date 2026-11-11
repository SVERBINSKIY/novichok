import { db } from './db.js';
import { texts } from '../client/src/texts.js';

const EARLY_EXIT_SHARE = 0.30;
const departments = texts.departments;
const locations = ['Склад Центральный', 'Магазин «Арена»', 'Магазин «Старт»', 'Магазин «Олимп»', 'Офис'];
const jobs = ['Кладовщик', 'Комплектовщик', 'Продавец-консультант', 'Кассир', 'Менеджер по продажам', 'Бухгалтер'];
const shifts = texts.shifts;
const firstNames = {
  male: ['Александр', 'Иван', 'Дмитрий', 'Михаил', 'Сергей', 'Павел', 'Артём', 'Никита', 'Максим', 'Егор'],
  female: ['Анна', 'Мария', 'Ольга', 'Елена', 'Ирина', 'Наталья', 'Дарья', 'Екатерина', 'Татьяна', 'Светлана']
};
const lastNames = {
  male: ['Ковалёв', 'Новиков', 'Волков', 'Орлов', 'Смирнов', 'Лебедев'],
  female: ['Соколова', 'Морозова', 'Павлова', 'Фёдорова', 'Кузнецова', 'Попова']
};
const causes = texts.exitReasons;
const problemTags = texts.survey.tags;
const today = new Date().toISOString().slice(0, 10);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

const reset = db.transaction(() => {
  db.exec('DELETE FROM hr_actions; DELETE FROM attendance_events; DELETE FROM mentor_reviews; DELETE FROM pulses; DELETE FROM employees; DELETE FROM improvements;');
  const addEmployee = db.prepare(`INSERT INTO employees
    (id, name, phone, department, location, job_title, shift, start_date, mentor_id, status, exit_date, exit_reason, token)
    VALUES (@id, @name, @phone, @department, @location, @job_title, @shift, @start_date, @mentor_id, @status, @exit_date, @exit_reason, @token)`);
  const addPulse = db.prepare(`INSERT INTO pulses
    (id, employee_id, day, due_date, responded_at, mood, clarity, reality, future, has_contact, tags, comment)
    VALUES (@id, @employee_id, @day, @due_date, @responded_at, @mood, @clarity, @reality, @future, @has_contact, @tags, @comment)`);
  const addEvent = db.prepare(`INSERT INTO attendance_events (id, employee_id, event_date, type, comment) VALUES (?, ?, ?, ?, ?)`);
  const addReview = db.prepare(`INSERT INTO mentor_reviews (id, employee_id, day, reached_tasks, risk, comment) VALUES (?, ?, ?, ?, ?, ?)`);
  const addAction = db.prepare(`INSERT INTO hr_actions (id, employee_id, action_date, type, result, text) VALUES (?, ?, ?, ?, ?, ?)`);
  const addImprovement = db.prepare('INSERT INTO improvements (id, action_date, department, text) VALUES (?, ?, ?, ?)');

  for (let i = 0; i < 120; i += 1) {
    const isDemo = i < 3;
    const gender = i % 2 === 0 ? 'male' : 'female';
    const nameIndex = Math.floor(i / 2);
    const seededRed = [4, 5, 6].includes(i);
    const daysAgo = i === 0 ? 3 : i === 1 ? 14 : i === 2 ? 10
      : seededRed ? 40 + (i - 4) * 15 : i === 68 ? 25 : 5 + ((i * 37) % 356);
    const startDate = addDays(today, -daysAgo);
    const department = departments[i % departments.length];
    const location = department === 'Склад' ? locations[0] : department === 'Офис' ? locations[4] : locations[1 + ((i * 7) % 3)];
    const earlyExit = !isDemo && i < Math.round(120 * EARLY_EXIT_SHARE);
    const terminated = earlyExit && daysAgo > 95;
    const exitDate = terminated ? addDays(startDate, 20 + ((i * 13) % 68)) : null;
    const id = `emp-${String(i + 1).padStart(3, '0')}`;
    const employee = {
      id,
      name: i === 0 ? 'Александр Ковалёв' : i === 1 ? 'Мария Соколова' : i === 2 ? 'Иван Новиков'
        : `${firstNames[gender][nameIndex % firstNames[gender].length]} ${lastNames[gender][Math.floor(nameIndex / 10) % lastNames[gender].length]}`,
      phone: `+375 29 000-00-${String(i % 90 + 10).slice(-2)}`,
      department,
      location,
      job_title: jobs[(i * 3) % jobs.length],
      shift: department === 'Склад' && i % 2 ? 'ночная' : shifts[(i * 5) % shifts.length],
      start_date: startDate,
      mentor_id: i < 3 ? `mentor-${i + 1}` : i === 11 ? null : `mentor-${(i % 6) + 1}`,
      status: terminated ? 'уволен' : 'работает',
      exit_date: exitDate,
      exit_reason: terminated ? causes[i % 4] : null,
      token: isDemo ? `demo-newcomer-token-${i + 1}-novichok` : `seed-newcomer-token-${String(i + 1).padStart(3, '0')}-novichok`
    };
    addEmployee.run(employee);

    for (const day of [3, 14, 30, 60, 85]) {
      const dueDate = addDays(startDate, day);
      let respondedAt = null;
      let mood = null;
      let clarity = null;
      let reality = null;
      let future = null;
      let hasContact = null;
      let tags = [];
      let comment = '';
      const demoCurrent = i === 0 ? day === 3 : i === 1 ? day === 14 : false;
      const available = dueDate <= today && (!exitDate || dueDate < exitDate);
      const missedDemo = i === 2 && day === 3;
      const deliberateGap = missedDemo || (i === 20 && day === 14);
      const answered = !demoCurrent && !deliberateGap && available && day <= daysAgo - 3;

      if (answered) {
        respondedAt = addDays(dueDate, Math.max(0, Math.min(1, Math.floor((daysAgo - day) / 2))));
        const decline = seededRed && day >= 14 && day <= 60;
        const reportedProblem = !decline && i >= 36 && i % 10 === 0 && day === 30;
        mood = decline ? (day >= 30 ? 2 : 4) : reportedProblem ? 3 : 4 + ((i + day) % 2);
        clarity = decline ? 3 : 4;
        reality = [14, 30].includes(day) ? (decline ? 2 : 4) : null;
        future = day >= 14 ? (decline && day >= 30 ? 2 : 4) : null;
        hasContact = i % 9 === 0 ? 'нет' : 'да';
        tags = decline ? [problemTags[i % problemTags.length]] : reportedProblem ? [texts.survey.tags[1]] : [];
        comment = decline ? 'Нужна помощь с адаптацией' : reportedProblem ? 'Нужна ясность по графику.' : '';
      }
      addPulse.run({
        id: `${id}-pulse-${day}`, employee_id: id, day, due_date: dueDate, responded_at: respondedAt,
        mood, clarity, reality, future, has_contact: hasContact, tags: JSON.stringify(tags), comment
      });
    }

    if (i % 7 === 0 && daysAgo > 40) {
      addReview.run(`${id}-review-30`, id, 30, seededRed ? 0 : 1, seededRed ? 'высокий' : 'низкий', '');
    }
    if (i % 17 === 0) {
      for (let event = 0; event < (i % 3) + 1; event += 1) {
        addEvent.run(`${id}-event-${event}`, id, addDays(today, -event * 3), event === 1 ? 'прогул' : 'опоздание', '');
      }
    }
  }

  addAction.run('seed-action-1', 'emp-005', addDays(today, -3), 'звонок', 'дозвонился', 'Обсудили первые задачи.');
  addAction.run('seed-action-2', 'emp-006', addDays(today, -2), 'звонок', 'вопрос решён', 'Уточнили график.');
  addAction.run('seed-action-3', 'emp-007', addDays(today, -1), 'звонок', 'не дозвонился', '');

  for (const [index, item] of [
    ['Склад', 'Добавили короткую памятку по комплектации заказов.'],
    ['Магазин', 'Перенесли вводный инструктаж на первую смену.'],
    [null, 'Собрали ответы новичков и уточнили, к кому обращаться по первым вопросам.']
  ].entries()) {
    addImprovement.run(`improvement-${index + 1}`, addDays(today, -12 + index * 3), item[0], item[1]);
  }
});

export function seedDatabase() {
  reset();
}

if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase();
  console.log('Синтетические данные обновлены.');
}
