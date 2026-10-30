import { ProjectDailySummary, ProjectTaskProjection, TaskActivity, TaskFacts, TaskTrackingBaseline } from './task-activity.types';

const eligible = (facts: TaskFacts): boolean => facts.hasText && !facts.sectionHeading;

function creationDate(created: string | null): string | null {
  if (!created || !/^\d{4}\/\d{2}\/\d{2}$/.test(created)) return null;
  const date = created.replace(/\//g, '-');
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function baselineProjection(baseline: TaskTrackingBaseline): ProjectTaskProjection {
  const tasks: ProjectTaskProjection['tasks'] = {};
  baseline.tasks.forEach(({ taskId, facts }) => tasks[taskId] = {
    facts: { ...facts }, arrivalDate: creationDate(facts.created), deleted: false,
  });
  return {
    schemaVersion: 1, reducerVersion: 1, projectId: baseline.projectId, lastEventId: 0,
    tasks,
  };
}

export function closingSummary(projection: ProjectTaskProjection, localDate: string): ProjectDailySummary {
  const tasks = Object.values(projection.tasks).filter((task) => !task.deleted && eligible(task.facts));
  const completed = tasks.filter((task) => task.facts.status === '✅').length;
  return {
    schemaVersion: 1, projectId: projection.projectId, localDate, lastEventId: projection.lastEventId,
    created: 0, completed: 0, completedNew: 0, completedExisting: 0,
    remaining: tasks.length - completed, closingCompleted: completed, closingTotal: tasks.length,
    createdTaskIds: [], completionCredits: [],
  };
}

/** Pure incremental reducer: inputs are never mutated. */
export function applyTaskActivity(
  previous: ProjectTaskProjection, events: TaskActivity[], summaries: ProjectDailySummary[]
): { projection: ProjectTaskProjection; summaries: ProjectDailySummary[] } {
  const projection = structuredClone(previous);
  const days = new Map(summaries.map((summary) => [summary.localDate, structuredClone(summary)]));
  for (const event of [...events].sort((a, b) => a.id - b.id)) {
    if (event.projectId !== projection.projectId) throw new Error('Analytics project mismatch');
    if (event.id <= projection.lastEventId) continue;
    const day = days.get(event.localDate) ?? closingSummary(projection, event.localDate);
    const task = projection.tasks[event.taskId] ?? {
      facts: event.before ?? event.after!, arrivalDate: creationDate((event.before ?? event.after!).created), deleted: false,
    };
    if (event.type === 'entered' && event.after && eligible(event.after)) {
      task.arrivalDate = event.localDate;
      if (!day.createdTaskIds.includes(event.taskId)) day.createdTaskIds.push(event.taskId);
    }
    if (event.type === 'status-changed' && event.before && event.after
      && eligible(event.before) && eligible(event.after)) {
      if (event.before.status !== '✅' && event.after.status === '✅') {
        if (!day.completionCredits.some((credit) => credit.taskId === event.taskId)) {
          day.completionCredits.push({ taskId: event.taskId, isNew: task.arrivalDate === event.localDate });
        }
      } else if (event.before.status === '✅' && event.after.status !== '✅') {
        day.completionCredits = day.completionCredits.filter((credit) => credit.taskId !== event.taskId);
      }
    }
    if (event.after) task.facts = { ...event.after };
    task.deleted = event.after === null;
    projection.tasks[event.taskId] = task;
    projection.lastEventId = event.id;
    const closing = closingSummary(projection, event.localDate);
    Object.assign(day, {
      lastEventId: event.id, created: day.createdTaskIds.length,
      completed: day.completionCredits.length,
      completedNew: day.completionCredits.filter((credit) => credit.isNew).length,
      completedExisting: day.completionCredits.filter((credit) => !credit.isNew).length,
      remaining: closing.remaining, closingCompleted: closing.closingCompleted, closingTotal: closing.closingTotal,
    });
    days.set(event.localDate, day);
  }
  return { projection, summaries: [...days.values()].sort((a, b) => a.localDate.localeCompare(b.localDate)) };
}

export function rebuildProjectMetrics(baseline: TaskTrackingBaseline, events: TaskActivity[]) {
  const projection = baselineProjection(baseline);
  return applyTaskActivity(projection, events, [closingSummary(projection, baseline.localDate)]);
}

/** Idle dates carry closing state; daily activity never carries forward. */
export function dailyMetrics(projectId: string, localDate: string, summaries: ProjectDailySummary[]): ProjectDailySummary | undefined {
  const previous = summaries.filter((day) => day.projectId === projectId && day.localDate <= localDate)
    .sort((a, b) => b.localDate.localeCompare(a.localDate))[0];
  if (!previous) return undefined; // Before tracking began is unknown, not zero.
  if (previous.localDate === localDate) return structuredClone(previous);
  return { ...structuredClone(previous), localDate, created: 0, completed: 0,
    completedNew: 0, completedExisting: 0, createdTaskIds: [], completionCredits: [] };
}

export function metricDateRange(projectId: string, fromDate: string, toDate: string, summaries: ProjectDailySummary[]): ProjectDailySummary[] {
  const first = new Date(`${fromDate}T00:00:00Z`);
  const last = new Date(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime())
    || first.toISOString().slice(0, 10) !== fromDate || last.toISOString().slice(0, 10) !== toDate
    || first > last) throw new Error('Invalid analytics date range');
  const result: ProjectDailySummary[] = [];
  for (const day = first; day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    const summary = dailyMetrics(projectId, day.toISOString().slice(0, 10), summaries);
    if (summary) result.push(summary);
  }
  return result;
}
