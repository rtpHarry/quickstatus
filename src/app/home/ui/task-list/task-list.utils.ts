const privateFlagMarker = '🔒';
const sectionHeadingFlagMarker = '🏷️';

export interface Task {
  status: string;
  text: string;
  private?: boolean;
  sectionHeading?: boolean;
}

export interface TaskDeleteEvent {
  index: number;
  task: Task;
  nextFocusIndex: number;
}

export function createEmptyTask(): Task {
  return { status: '❌', text: '', private: false, sectionHeading: false };
}

export function ensureTaskListHasPlaceholder(tasks: Task[]): Task[] {
  return tasks.length > 0 ? tasks : [createEmptyTask()];
}

export function parseTasksString(value: string): Task[] {
  if (!value || value.trim() === '') {
    return [createEmptyTask()];
  }

  return value.split('\n').map((item) => {
    const { cleanItem, isPrivate, isSectionHeading } =
      extractTrailingFlags(item);
    const [status, ...textParts] = cleanItem.split(/\s+/);
    const taskStatus = status && status.trim() !== '' ? status : '❌';

    return {
      status: taskStatus,
      text: textParts.join(' '),
      private: isPrivate,
      sectionHeading: isSectionHeading,
    };
  });
}

export function stringifyTasks(tasks: Task[]): string {
  return ensureTaskListHasPlaceholder(tasks)
    .map((task) => {
      const privateFlag = task.private ?? false ? privateFlagMarker : '';
      const sectionHeadingFlag =
        task.sectionHeading ?? false ? sectionHeadingFlagMarker : '';
      return `${task.status} ${task.text} ${sectionHeadingFlag} ${privateFlag}`.trim();
    })
    .join('\n');
}

function extractTrailingFlags(item: string): {
  cleanItem: string;
  isPrivate: boolean;
  isSectionHeading: boolean;
} {
  let cleanItem = item.trim();
  let isPrivate = false;
  let isSectionHeading = false;

  while (true) {
    if (cleanItem.endsWith(privateFlagMarker)) {
      isPrivate = true;
      cleanItem = cleanItem.slice(0, -privateFlagMarker.length).trim();
      continue;
    }

    if (cleanItem.endsWith(sectionHeadingFlagMarker)) {
      isSectionHeading = true;
      cleanItem = cleanItem.slice(0, -sectionHeadingFlagMarker.length).trim();
      continue;
    }

    break;
  }

  return { cleanItem, isPrivate, isSectionHeading };
}
