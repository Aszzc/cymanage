const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function parseDate(value, label) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label}日期格式无效`);
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  if (new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error(`${label}日期无效`);
  return timestamp;
}

function sqliteDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
}

export function beijingDateRange(from, to) {
  const fromDay = parseDate(from, '开始'), toDay = parseDate(to, '结束');
  if (fromDay !== null && toDay !== null && fromDay > toDay) throw new Error('开始日期不能晚于结束日期');
  return {
    start: fromDay === null ? null : sqliteDate(fromDay - BEIJING_OFFSET_MS),
    end: toDay === null ? null : sqliteDate(toDay + DAY_MS - BEIJING_OFFSET_MS),
  };
}

export function beijingTodayRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]));
  const today = `${values.year}-${values.month}-${values.day}`;
  return beijingDateRange(today, today);
}
