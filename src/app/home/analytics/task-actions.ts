import { Task } from '../ui/task-list/task-list.utils';
import { TaskActivityDraft, TaskActivitySource, taskFacts } from './task-activity.types';

export function isRealTask(task: Task): boolean {
  return task.text.trim().length > 0 && task.sectionHeading !== true;
}

/** Call with snapshots captured before applying the change to the list. */
export function taskChangeEvents(before: Task, after: Task): TaskActivityDraft[] {
  const common = { taskId: requireTaskId(after), source: 'normal' as const,
    before: taskFacts(before), after: taskFacts(after) };
  if (!isRealTask(before) && isRealTask(after)) return [{ ...common, type: 'entered' }];
  if (common.before.hasText !== common.after.hasText
    || common.before.sectionHeading !== common.after.sectionHeading
    || JSON.stringify(common.before.tags) !== JSON.stringify(common.after.tags)) {
    return [{ ...common, type: 'membership-changed' }];
  }
  return before.status !== after.status ? [{ ...common, type: 'status-changed' }] : [];
}

export function taskRemovalEvents(tasks: Task[], source: TaskActivitySource): TaskActivityDraft[] {
  return tasks.map((task) => ({ taskId: requireTaskId(task), type: 'deleted', source,
    before: taskFacts(task), after: null }));
}

export function pastedTaskEvents(tasks: Task[]): TaskActivityDraft[] {
  return tasks.filter(isRealTask).map((task) => ({ taskId: requireTaskId(task),
    type: 'entered', source: 'paste', before: null, after: taskFacts(task) }));
}

export function restoredTaskEvent(task: Task): TaskActivityDraft {
  return { taskId: requireTaskId(task), type: 'restored', source: 'undo',
    before: null, after: taskFacts(task) };
}

function requireTaskId(task: Task): number {
  if (!Number.isSafeInteger(task.id) || task.id! < 1) throw new Error('Task action requires an ID');
  return task.id!;
}
