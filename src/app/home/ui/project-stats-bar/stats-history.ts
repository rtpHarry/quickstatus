import { ProjectDailySummary } from '../../analytics/task-activity.types';

export interface HistoryRow extends ProjectDailySummary {
  start: number;
  change: number;
  baselineDay: boolean;
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatHistoryDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDate();
  const suffix = day >= 11 && day <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th');
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][value.getUTCDay()];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][value.getUTCMonth()];
  return `${weekday} ${day}${suffix} ${month} ${date.slice(2, 4)}`;
}

export function signedChange(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
}

/** Read the previous closing backlog, never infer it from additions/completions. */
export function historyRows(summaries: ProjectDailySummary[], from: string, opening: number,
  baselineDate?: string): HistoryRow[] {
  const ordered = [...summaries].sort((a, b) => a.localDate.localeCompare(b.localDate));
  return ordered.map((day, index) => {
    const start = index ? ordered[index - 1].remaining : opening;
    return { ...day, start, change: day.completed - day.created, baselineDay: day.localDate === baselineDate };
  }).filter(day => day.localDate >= from).reverse();
}
