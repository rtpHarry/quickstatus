import { Task } from '../ui/task-list/task-list.utils';

/** Analytics facts deliberately exclude task text and privacy settings. */
export interface TaskFacts {
  status: string;
  hasText: boolean;
  sectionHeading: boolean;
  created: string | null;
}

export type TaskActivityType = 'entered' | 'status-changed' | 'membership-changed' | 'deleted' | 'restored';
export type TaskActivitySource = 'normal' | 'paste' | 'reset' | 'project-delete' | 'undo';

export interface TaskActivityDraft {
  taskId: number;
  type: TaskActivityType;
  source: TaskActivitySource;
  before: TaskFacts | null;
  after: TaskFacts | null;
}

export interface TaskActivity extends TaskActivityDraft {
  schemaVersion: 1;
  id: number;
  projectId: string;
  timestamp: string;
  localDate: string;
}

export interface TaskTrackingBaseline {
  schemaVersion: 1;
  projectId: string;
  timestamp: string;
  localDate: string;
  tasks: { taskId: number; facts: TaskFacts }[];
}

/** Reducer state retains deleted identities for cohort/undo history. */
export interface ProjectTaskProjection {
  schemaVersion: 1;
  projectId: string;
  reducerVersion: 1;
  lastEventId: number;
  tasks: Record<string, { facts: TaskFacts; arrivalDate: string | null; deleted: boolean }>;
}

export interface ProjectDailySummary {
  schemaVersion: 1;
  projectId: string;
  localDate: string;
  lastEventId: number;
  created: number;
  completed: number;
  completedNew: number;
  completedExisting: number;
  remaining: number;
  closingCompleted: number;
  closingTotal: number;
  /** Identity credits make repeated toggles idempotent within a day. */
  createdTaskIds: number[];
  completionCredits: { taskId: number; isNew: boolean }[];
}

export interface ProjectActivityMutation {
  projectId: string;
  /** null removes the list; archiveProject also hides its project metadata. */
  tasks: string | null;
  events: TaskActivityDraft[];
  archiveProject?: boolean;
}

export interface CommittedProjectActivity {
  projectId: string;
  events: TaskActivity[];
}

export const baselineKey = (projectId: string): string => `baseline:${projectId}`;
export const projectionKey = (projectId: string): string => `projection:${projectId}`;
export const dailySummaryKey = (projectId: string, localDate: string): string => `daily:${projectId}:${localDate}`;

export function localActivityDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function taskFacts(task: Task): TaskFacts {
  return {
    status: task.status,
    hasText: task.text.trim().length > 0,
    sectionHeading: task.sectionHeading === true,
    created: task.created ?? null,
  };
}

export function isTaskActivity(value: unknown): value is TaskActivity {
  if (!isRecord(value)) return false;
  return value['schemaVersion'] === 1 && isId(value['id']) && isId(value['taskId'])
    && typeof value['projectId'] === 'string' && value['projectId'].length > 0
    && typeof value['timestamp'] === 'string' && Number.isFinite(Date.parse(value['timestamp']))
    && typeof value['localDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value['localDate'])
    && ['entered', 'status-changed', 'membership-changed', 'deleted', 'restored'].includes(value['type'] as string)
    && ['normal', 'paste', 'reset', 'project-delete', 'undo'].includes(value['source'] as string)
    && (value['before'] === null || isTaskFacts(value['before']))
    && (value['after'] === null || isTaskFacts(value['after']))
    && (value['before'] !== null || value['after'] !== null);
}

export function isTrackingBaseline(value: unknown): value is TaskTrackingBaseline {
  if (!isRecord(value) || !Array.isArray(value['tasks'])) return false;
  return value['schemaVersion'] === 1 && typeof value['projectId'] === 'string'
    && typeof value['timestamp'] === 'string' && Number.isFinite(Date.parse(value['timestamp']))
    && typeof value['localDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value['localDate'])
    && value['tasks'].every((task) => isRecord(task) && isId(task['taskId']) && isTaskFacts(task['facts']))
    && new Set(value['tasks'].map((task) => task.taskId)).size === value['tasks'].length;
}

function isTaskFacts(value: unknown): value is TaskFacts {
  return isRecord(value) && typeof value['status'] === 'string'
    && typeof value['hasText'] === 'boolean' && typeof value['sectionHeading'] === 'boolean'
    && (value['created'] === null || typeof value['created'] === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
