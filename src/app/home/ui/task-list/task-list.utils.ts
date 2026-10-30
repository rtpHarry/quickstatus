const privateFlagMarker = '🔒';
const sectionHeadingFlagMarker = '🏷️';

export interface Task {
  id?: number;
  status: string;
  text: string;
  private?: boolean;
  sectionHeading?: boolean;
  created?: string;
}

export interface TaskDeleteEvent {
  index: number;
  task: Task;
  nextFocusIndex: number;
}

export function createEmptyTask(id?: number): Task {
  return { ...(id !== undefined ? { id } : {}), status: '❌', text: '', private: false, sectionHeading: false, created: formatCreatedDate() };
}

export function ensureTaskListHasPlaceholder(tasks: Task[]): Task[] {
  return tasks.length > 0 ? tasks : [createEmptyTask()];
}

export function parseTasksString(value: string): Task[] {
  if (!value || value.trim() === '') {
    return [createEmptyTask()];
  }

  return value.split('\n').map((item) => {
    const { cleanItem, isPrivate, isSectionHeading, created, id } =
      extractTrailingFlags(item);
    const [status, ...textParts] = cleanItem.split(/\s+/);
    const taskStatus = status && status.trim() !== '' ? status : '❌';

    return {
      status: taskStatus,
      text: textParts.join(' '),
      private: isPrivate,
      sectionHeading: isSectionHeading,
      ...(created ? { created } : {}),
      ...(id !== undefined ? { id } : {}),
    };
  });
}

export function stringifyTasks(tasks: Task[]): string {
  return ensureTaskListHasPlaceholder(tasks)
    .map((task) => {
      const privateFlag = task.private ?? false ? privateFlagMarker : '';
      const sectionHeadingFlag =
        task.sectionHeading ?? false ? sectionHeadingFlagMarker : '';
      const createdFlag = task.created ? ` [created:${task.created}]` : '';
      const idFlag = task.id !== undefined ? ` [id:${task.id}]` : '';
      return `${task.status} ${task.text} ${sectionHeadingFlag} ${privateFlag}`.trim() + createdFlag + idFlag;
    })
    .join('\n');
}

/** Keep the first valid occurrence of each ID, allocating above all supplied IDs. */
export function normalizeTaskListIds(
  lists: Record<string, string>,
  nextTaskId: number
): { changedLists: Record<string, string>; nextTaskId: number } {
  if (!Number.isSafeInteger(nextTaskId) || nextTaskId < 1) {
    throw new Error('Invalid task ID counter');
  }
  const parsed = Object.keys(lists).sort().map((projectId) => ({
    projectId,
    tasks: parseTasksString(lists[projectId]),
    lines: lists[projectId].trim() ? lists[projectId].split('\n') : [''],
  }));
  for (const { tasks } of parsed) {
    for (const task of tasks) {
      if (task.id !== undefined) nextTaskId = Math.max(nextTaskId, task.id + 1);
    }
  }
  if (!Number.isSafeInteger(nextTaskId)) throw new Error('Task ID counter exhausted');

  const seen = new Set<number>();
  const changedLists: Record<string, string> = Object.create(null);
  for (const { projectId, tasks, lines } of parsed) {
    let changed = false;
    tasks.forEach((task, index) => {
      if (task.id === undefined || seen.has(task.id)) {
        if (!Number.isSafeInteger(nextTaskId + 1)) throw new Error('Task ID counter exhausted');
        task.id = nextTaskId++;
        lines[index] = lists[projectId].trim() === ''
          ? stringifyTasks([task]) : replaceTrailingTaskId(lines[index], task.id);
        changed = true;
      }
      seen.add(task.id);
    });
    if (changed) changedLists[projectId] = lines.join('\n');
  }
  return { changedLists, nextTaskId };
}

/** Change identity metadata without reformatting the original task text/flags. */
function replaceTrailingTaskId(line: string, id: number): string {
  let remaining = line;
  let suffix = '';
  while (true) {
    const flag = remaining.match(/(?:\s+\[id:[^\]\r\n]*\]|\s+\[created:\d{4}\/\d{2}\/\d{2}\]|\s*(?:🔒|🏷️))\s*$/);
    if (!flag) break;
    if (!flag[0].trim().startsWith('[id:')) suffix = flag[0] + suffix;
    remaining = remaining.slice(0, -flag[0].length);
  }
  return remaining + suffix + ` [id:${id}]`;
}

function extractTrailingFlags(item: string): {
  cleanItem: string;
  isPrivate: boolean;
  isSectionHeading: boolean;
  created?: string;
  id?: number;
} {
  let cleanItem = item.trim();
  let isPrivate = false;
  let isSectionHeading = false;
  let created: string | undefined;
  let id: number | undefined;

  while (true) {
    const idFlag = cleanItem.match(/\s\[id:([^\]\r\n]*)\]$/);
    if (idFlag) {
      const candidate = /^\d+$/.test(idFlag[1]) ? Number(idFlag[1]) : NaN;
      if (id === undefined && Number.isSafeInteger(candidate) && candidate > 0) id = candidate;
      cleanItem = cleanItem.slice(0, -idFlag[0].length).trim();
      continue;
    }
    const dateFlag = cleanItem.match(/\s\[created:(\d{4}\/\d{2}\/\d{2})\]$/);
    if (dateFlag && created === undefined) {
      created = dateFlag[1];
      cleanItem = cleanItem.slice(0, -dateFlag[0].length).trim();
      continue;
    }

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

  return { cleanItem, isPrivate, isSectionHeading, created, id };
}

export function formatCreatedDate(date = new Date()): string {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

export function taskAgeInDays(created?: string, today = new Date()): number | null {
  if (!created || !/^\d{4}\/\d{2}\/\d{2}$/.test(created)) {
    return null;
  }
  const [year, month, day] = created.split('/').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  // Compare calendar dates, avoiding daylight-saving and UTC timezone shifts.
  const currentDate = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((currentDate - date.getTime()) / 86400000));
}
