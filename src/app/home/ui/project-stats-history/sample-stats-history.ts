import { localActivityDate, ProjectDailySummary } from '../../analytics/task-activity.types';
import { historyRows, HistoryRow, shiftDate } from './stats-history';

/** Display-only fixtures: no task identities or analytics records are persisted. */
export function sampleStatsHistory(projectId: string, today = localActivityDate()): HistoryRow[] {
  const opening = 24;
  const from = shiftDate(today, -6);
  const activity = [
    { created: 4, completedNew: 1, completedExisting: 5 },
    { created: 8, completedNew: 2, completedExisting: 1 },
    { created: 0, completedNew: 0, completedExisting: 0 },
    { created: 2, completedNew: 1, completedExisting: 7 },
    { created: 6, completedNew: 6, completedExisting: 0 },
    { created: 1, completedNew: 0, completedExisting: 4 },
    { created: 5, completedNew: 4, completedExisting: 2 },
  ];
  let remaining = opening;
  let closingCompleted = 0;
  const summaries: ProjectDailySummary[] = activity.map((day, index) => {
    const completed = day.completedNew + day.completedExisting;
    remaining += day.created - completed;
    closingCompleted += completed;
    return {
      schemaVersion: 1,
      projectId,
      localDate: shiftDate(from, index),
      lastEventId: 0,
      ...day,
      completed,
      remaining,
      closingCompleted,
      closingTotal: remaining + closingCompleted,
      createdTaskIds: [],
      completionCredits: [],
    };
  });
  return historyRows(summaries, from, opening, from);
}
