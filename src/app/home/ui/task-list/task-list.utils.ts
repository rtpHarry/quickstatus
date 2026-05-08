export interface Task {
  status: string;
  text: string;
  private?: boolean;
  sectionTitle?: boolean;
}

export interface TaskDeleteEvent {
  index: number;
  task: Task;
  nextFocusIndex: number;
}

export function createEmptyTask(): Task {
  return { status: '❌', text: '', private: false, sectionTitle: false };
}

export function ensureTaskListHasPlaceholder(tasks: Task[]): Task[] {
  return tasks.length > 0 ? tasks : [createEmptyTask()];
}

export function parseTasksString(value: string): Task[] {
  if (!value || value.trim() === '') {
    return [createEmptyTask()];
  }

  return value.split('\n').map((item) => {
    const isPrivate = item.includes('🔒');
    const isSectionTitle = item.includes('🏷️');
    const cleanItem = item.replace('🔒', '').replace('🏷️', '').trim();
    const [status, ...textParts] = cleanItem.split(/\s+/);
    const taskStatus = status && status.trim() !== '' ? status : '❌';

    return {
      status: taskStatus,
      text: textParts.join(' '),
      private: isPrivate,
      sectionTitle: isSectionTitle,
    };
  });
}

export function stringifyTasks(tasks: Task[]): string {
  return ensureTaskListHasPlaceholder(tasks)
    .map((task) => {
      const privateFlag = task.private ?? false ? '🔒' : '';
      const sectionTitleFlag = task.sectionTitle ?? false ? '🏷️' : '';
      return `${task.status} ${task.text} ${sectionTitleFlag} ${privateFlag}`.trim();
    })
    .join('\n');
}
