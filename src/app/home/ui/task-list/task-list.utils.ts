const privateFlagMarker = '🔒';
const sectionTitleFlagMarker = '🏷️';

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
    const { cleanItem, isPrivate, isSectionTitle } = extractTrailingFlags(item);
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
      const privateFlag = task.private ?? false ? privateFlagMarker : '';
      const sectionTitleFlag =
        task.sectionTitle ?? false ? sectionTitleFlagMarker : '';
      return `${task.status} ${task.text} ${sectionTitleFlag} ${privateFlag}`.trim();
    })
    .join('\n');
}

function extractTrailingFlags(item: string): {
  cleanItem: string;
  isPrivate: boolean;
  isSectionTitle: boolean;
} {
  let cleanItem = item.trim();
  let isPrivate = false;
  let isSectionTitle = false;

  while (true) {
    if (cleanItem.endsWith(privateFlagMarker)) {
      isPrivate = true;
      cleanItem = cleanItem.slice(0, -privateFlagMarker.length).trim();
      continue;
    }

    if (cleanItem.endsWith(sectionTitleFlagMarker)) {
      isSectionTitle = true;
      cleanItem = cleanItem.slice(0, -sectionTitleFlagMarker.length).trim();
      continue;
    }

    break;
  }

  return { cleanItem, isPrivate, isSectionTitle };
}
