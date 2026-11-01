import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { taskRemovalEvents } from '../analytics/task-actions';
import { applyTaskActivity, dailyMetrics, metricDateRange, rebuildProjectMetrics } from '../analytics/project-metrics';
import { baselineKey, CommittedProjectActivity, dailySummaryKey, isTaskActivity, isTrackingBaseline, localActivityDate, ProjectActivityMutation, ProjectDailySummary, ProjectTaskProjection, projectionKey, TaskActivity, taskFacts, TaskTrackingBaseline } from '../analytics/task-activity.types';
import { createEmptyTask, normalizeTaskListIds, parseTasksString, stringifyTasks } from '../ui/task-list/task-list.utils';
import { idbRequest, openProjectDatabase, projectStoreNames, transactionDone } from './project-storage.database';
import { LegacyStorageBackup, Project, ProjectStorageBackup, ProjectStorageSnapshot, StoredProject } from './project-storage.types';

@Injectable({ providedIn: 'root' })
export class ProjectStorageService {
  private readonly projectsKey = 'taskList:projects';
  private readonly legacyKey = 'taskList';
  private readonly taskPrefix = 'taskList:';
  private pending: Promise<unknown> = Promise.resolve();
  private database?: Promise<IDBDatabase>;
  private readonly restoredSubject = new Subject<void>();
  readonly restored$ = this.restoredSubject.asObservable();
  private readonly activitySubject = new Subject<CommittedProjectActivity>();
  /** Only successful atomic activity mutations publish, after their commit. */
  readonly committedActivity$ = this.activitySubject.asObservable();

  /** Reads and exports wait for already submitted writes. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  private getDatabase(): Promise<IDBDatabase> {
    return this.database ??= openProjectDatabase().catch((error) => {
      this.database = undefined;
      throw error;
    });
  }

  initialize(): Promise<ProjectStorageSnapshot> {
    return this.enqueue(async () => {
      const db = await this.getDatabase();
      const transaction = db.transaction([...projectStoreNames], 'readwrite');
      const done = transactionDone(transaction);
      try {
        const metadata = transaction.objectStore('metadata');
        const initialized = await idbRequest(metadata.get('initialized'));
        if (!initialized) {
          // Only synchronous localStorage reads here: no unrelated awaits in a transaction.
          const legacy = this.readLegacyStorage();
          const snapshot = this.fromLegacy(legacy, false);
          this.writeBackup(transaction, this.baselineBackup(snapshot));
        }
        await this.normalizeStoredTaskIds(transaction);
        await this.ensureTrackingBaselines(transaction);
        await this.ensureProjectMetrics(transaction);
        await done;
      } catch (error) {
        try { transaction.abort(); } catch { /* It may already have aborted. */ }
        await done.catch(() => undefined);
        throw error;
      }
      return this.readSnapshot(db);
    });
  }

  newProjectId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = (Math.random() * 16) | 0;
      return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
  }

  /** Reservations commit before returning; gaps are intentional after cancelled actions. */
  allocateTaskIds(count: number): Promise<number[]> {
    return this.write(['metadata'], (transaction) => this.reserveTaskIds(transaction, count));
  }

  private async reserveTaskIds(transaction: IDBTransaction, count: number): Promise<number[]> {
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid task ID reservation');
    const metadata = transaction.objectStore('metadata');
    const next = await idbRequest(metadata.get('nextTaskId'));
    if (!this.isId(next) || !Number.isSafeInteger(next + count)) throw new Error('Task ID counter exhausted or invalid');
    metadata.put(next + count, 'nextTaskId');
    return Array.from({ length: count }, (_, index) => next + index);
  }

  /** Lists and the allocator are repaired together, without generating activity. */
  private async normalizeStoredTaskIds(transaction: IDBTransaction): Promise<void> {
    const lists = transaction.objectStore('lists');
    const metadata = transaction.objectStore('metadata');
    const [rows, next] = await Promise.all([
      idbRequest(lists.getAll()),
      idbRequest(metadata.get('nextTaskId')),
    ]);
    const normalized = normalizeTaskListIds(
      this.recordFromEntries<string>(rows.map((row) => [row.projectId, row.tasks])), next
    );
    Object.entries(normalized.changedLists).forEach(([projectId, tasks]) => lists.put({ projectId, tasks }));
    if (normalized.nextTaskId !== next) metadata.put(normalized.nextTaskId, 'nextTaskId');
  }

  private async ensureTrackingBaselines(transaction: IDBTransaction): Promise<void> {
    const rows = await idbRequest<{ projectId: string; tasks: string }[]>(transaction.objectStore('lists').getAll());
    for (const row of rows) await this.ensureProjectBaseline(transaction, row.projectId, row.tasks);
  }

  private async ensureProjectBaseline(transaction: IDBTransaction, projectId: string, tasks: string): Promise<void> {
    const analytics = transaction.objectStore('analytics');
    const key = baselineKey(projectId);
    const existing = await idbRequest(analytics.get(key));
    if (existing !== undefined) {
      if (!isTrackingBaseline(existing) || existing.projectId !== projectId) throw new Error('Invalid tracking baseline');
      return;
    }
    const now = new Date();
    const baseline: TaskTrackingBaseline = {
      schemaVersion: 1, projectId, timestamp: now.toISOString(), localDate: localActivityDate(now),
      tasks: parseTasksString(tasks).map((task) => {
        if (!this.isId(task.id)) throw new Error('Tracking baseline requires task IDs');
        return { taskId: task.id, facts: taskFacts(task) };
      }),
    };
    analytics.add(baseline, key);
  }

  /** Replay once for pre-metrics data; routine mutations only reduce new events. */
  private async ensureProjectMetrics(transaction: IDBTransaction, force = false, projectId?: string): Promise<void> {
    const analytics = transaction.objectStore('analytics');
    const baselines = projectId
      ? [await idbRequest<TaskTrackingBaseline>(analytics.get(baselineKey(projectId)))]
      : await idbRequest<TaskTrackingBaseline[]>(analytics.getAll(IDBKeyRange.bound('baseline:', 'baseline:\uffff')));
    for (const baseline of baselines) {
      const existing = await idbRequest<ProjectTaskProjection | undefined>(analytics.get(projectionKey(baseline.projectId)));
      if (!force && existing?.reducerVersion === 2) continue;
      const events = await idbRequest<TaskActivity[]>(transaction.objectStore('events').index('projectDate')
        .getAll(IDBKeyRange.bound([baseline.projectId, ''], [baseline.projectId, '\uffff'])));
      const rebuilt = rebuildProjectMetrics(baseline, events);
      const prefix = `daily:${baseline.projectId}:`;
      const keys = await idbRequest(analytics.getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff')));
      keys.forEach((key) => analytics.delete(key));
      analytics.put(rebuilt.projection, projectionKey(baseline.projectId));
      rebuilt.summaries.forEach((day) => analytics.put(day, dailySummaryKey(baseline.projectId, day.localDate)));
    }
  }

  /** Step 6 supplies action facts; task state and history become durable together. */
  commitTaskActivity(mutation: ProjectActivityMutation): Promise<TaskActivity[]> {
    const copy: ProjectActivityMutation = JSON.parse(JSON.stringify(mutation));
    const now = new Date();
    return this.write([...projectStoreNames], async (transaction) => {
      return this.applyTaskActivity(transaction, copy, now);
    }).then((events) => {
      // Do not expose the returned records to subscribers/callers by shared reference.
      this.activitySubject.next({ projectId: copy.projectId, events: structuredClone(events) });
      return events;
    });
  }

  private async applyTaskActivity(
    transaction: IDBTransaction,
    copy: ProjectActivityMutation,
    now: Date
  ): Promise<TaskActivity[]> {
    const invalidTasks = copy.tasks !== null && typeof copy.tasks !== 'string';
    const removalWithoutArchive = copy.tasks === null && !copy.archiveProject;
    if (!Array.isArray(copy.events) || invalidTasks || removalWithoutArchive) {
      throw new Error('Invalid task activity mutation');
    }
    const projects = transaction.objectStore('projects');
    const project = await idbRequest<StoredProject | undefined>(projects.get(copy.projectId));
    if (!project || project.archived) {
      throw new Error('Activity requires an active project');
    }
    const lists = transaction.objectStore('lists');
    const previous = await idbRequest<{ tasks: string } | undefined>(lists.get(copy.projectId));
    if (!previous) {
      throw new Error('Activity requires an existing task list');
    }
    await this.ensureProjectBaseline(transaction, copy.projectId, previous.tasks);
    const metadata = transaction.objectStore('metadata');
    const next = await idbRequest(metadata.get('nextEventId'));
    if (!this.isId(next) || !Number.isSafeInteger(next + copy.events.length)) {
      throw new Error('Event ID counter exhausted or invalid');
    }
    const events: TaskActivity[] = copy.events.map((draft, index) => ({
      ...draft, schemaVersion: 1, id: next + index, projectId: copy.projectId,
      timestamp: now.toISOString(), localDate: localActivityDate(now),
    }));
    if (!events.every(isTaskActivity)) {
      throw new Error('Invalid task activity');
    }
    if (copy.tasks === null) {
      lists.delete(copy.projectId);
    } else {
      lists.put({ projectId: copy.projectId, tasks: copy.tasks });
    }
    if (copy.archiveProject) {
      projects.put({ ...project, archived: true });
    }
    await this.ensureProjectMetrics(transaction, false, copy.projectId);
    events.forEach((event) => transaction.objectStore('events').add(event));
    metadata.put(next + events.length, 'nextEventId');
    const analytics = transaction.objectStore('analytics');
    // Callers supply facts, never derived totals. Derivation shares this transaction.
    const projection = await idbRequest<ProjectTaskProjection>(analytics.get(projectionKey(copy.projectId)));
    // Drops and undo can revise an addition on an earlier date. Retain all identity
    // credits so these adjustments share the same atomic transaction as the list.
    const prefix = `daily:${copy.projectId}:`;
    const summaries = await idbRequest<ProjectDailySummary[]>(analytics
      .getAll(IDBKeyRange.bound(prefix, prefix + '\uffff')));
    const reduced = applyTaskActivity(projection, events, summaries);
    analytics.put(reduced.projection, projectionKey(copy.projectId));
    reduced.summaries.forEach((day) => analytics.put(day, dailySummaryKey(copy.projectId, day.localDate)));
    return events;
  }

  getTaskActivity(projectId: string, fromDate = '', toDate = '\uffff'): Promise<TaskActivity[]> {
    return this.enqueue(async () => {
      const db = await this.getDatabase();
      const transaction = db.transaction('events', 'readonly');
      const done = transactionDone(transaction);
      const range = IDBKeyRange.bound([projectId, fromDate], [projectId, toDate]);
      const events = await idbRequest<TaskActivity[]>(transaction.objectStore('events').index('projectDate').getAll(range));
      await done;
      return events.sort((left, right) => left.id - right.id);
    });
  }

  getTrackingBaseline(projectId: string): Promise<TaskTrackingBaseline | undefined> {
    return this.getAnalyticsRecord(baselineKey(projectId));
  }

  getTaskProjection(projectId: string): Promise<ProjectTaskProjection | undefined> {
    return this.getAnalyticsRecord(projectionKey(projectId));
  }

  getDailySummary(projectId: string, localDate: string): Promise<ProjectDailySummary | undefined> {
    return this.enqueue(async () => {
      const db = await this.getDatabase();
      const tx = db.transaction('analytics', 'readonly');
      const done = transactionDone(tx);
      const prefix = `daily:${projectId}:`;
      const cursor = await idbRequest(tx.objectStore('analytics').openCursor(
        IDBKeyRange.bound(prefix, dailySummaryKey(projectId, localDate)), 'prev'));
      const result = cursor ? dailyMetrics(projectId, localDate, [cursor.value]) : undefined;
      await done;
      return result;
    });
  }

  getDailyHistory(projectId: string, fromDate: string, toDate: string): Promise<ProjectDailySummary[]> {
    return this.enqueue(async () => {
      const db = await this.getDatabase();
      const tx = db.transaction('analytics', 'readonly');
      const done = transactionDone(tx);
      const prefix = `daily:${projectId}:`;
      const summaries = await idbRequest<ProjectDailySummary[]>(tx.objectStore('analytics')
        .getAll(IDBKeyRange.bound(prefix, dailySummaryKey(projectId, toDate))));
      await done;
      return metricDateRange(projectId, fromDate, toDate, summaries);
    });
  }

  private getAnalyticsRecord<T>(key: string): Promise<T | undefined> {
    return this.enqueue(async () => {
      const db = await this.getDatabase();
      const transaction = db.transaction('analytics', 'readonly');
      const done = transactionDone(transaction);
      const value = await idbRequest<T | undefined>(transaction.objectStore('analytics').get(key));
      await done;
      return value;
    });
  }

  getProjectTasks(projectId: string): Promise<string> {
    return this.enqueue(async () => {
      const db = await this.getDatabase();
      const transaction = db.transaction('lists', 'readonly');
      const done = transactionDone(transaction);
      const row = await idbRequest(transaction.objectStore('lists').get(projectId));
      await done;
      return row?.tasks ?? '';
    });
  }

  setProjectTasks(projectId: string, tasks: string): Promise<void> {
    return this.write(['lists'], (transaction) => {
      transaction.objectStore('lists').put({ projectId, tasks });
    });
  }

  saveProjects(projects: Project[]): Promise<void> {
    const copy = projects.map((project, position) => ({ ...project, position }));
    return this.write(['projects'], (transaction) => {
      copy.forEach((project) => transaction.objectStore('projects').put(project));
    });
  }

  createProject(project: Project): Promise<void> {
    const copy = { ...project };
    return this.write([...projectStoreNames], async (transaction) => {
      await this.createProjectInTransaction(transaction, copy);
    });
  }

  private async createProjectInTransaction(
    transaction: IDBTransaction,
    project: Project
  ): Promise<string> {
    const store = transaction.objectStore('projects');
    const position = await idbRequest(store.count());
    const [id] = await this.reserveTaskIds(transaction, 1);
    const tasks = stringifyTasks([createEmptyTask(id)]);

    store.add({ ...project, position });
    transaction.objectStore('lists').add({ projectId: project.id, tasks });
    await this.ensureProjectBaseline(transaction, project.id, tasks);
    await this.ensureProjectMetrics(transaction, false, project.id);
    return tasks;
  }

  /** The old project stays active unless its replacement commits successfully. */
  replaceLastProject(projectId: string, replacement: Project): Promise<string> {
    const project = { ...replacement, name: replacement.name.trim() };
    const now = new Date();

    return this.write([...projectStoreNames], async (transaction) => {
      if (!project.id || !project.name || project.id === projectId) {
        throw new Error('A replacement project needs a new ID and a name');
      }

      const projects = await idbRequest<StoredProject[]>(
        transaction.objectStore('projects').getAll()
      );
      const active = projects.filter((entry) => !entry.archived);
      if (active.length !== 1 || active[0].id !== projectId) {
        throw new Error('Only the last active project can be replaced');
      }

      const row = await idbRequest<{ tasks: string } | undefined>(
        transaction.objectStore('lists').get(projectId)
      );
      if (!row) {
        throw new Error('The project task list is missing');
      }

      const events = await this.applyTaskActivity(transaction, {
        projectId,
        tasks: null,
        archiveProject: true,
        events: taskRemovalEvents(parseTasksString(row.tasks), 'project-delete'),
      }, now);
      const tasks = await this.createProjectInTransaction(transaction, project);
      return { tasks, events };
    }).then(({ tasks, events }) => {
      this.activitySubject.next({ projectId, events: structuredClone(events) });
      return tasks;
    });
  }

  deleteProject(projectId: string): Promise<void> {
    return this.write(['projects', 'lists'], async (transaction) => {
      const store = transaction.objectStore('projects');
      const project = await idbRequest(store.get(projectId));
      if (project) store.put({ ...project, archived: true });
      transaction.objectStore('lists').delete(projectId);
    });
  }

  exportSnapshot(): Promise<ProjectStorageSnapshot> {
    return this.enqueue(async () => this.readSnapshot(await this.getDatabase()));
  }

  /** Compatibility API for legacy snapshots: restore as baseline, never activity. */
  restoreSnapshot(snapshot: ProjectStorageSnapshot): Promise<void> {
    return this.restoreBackup(this.baselineBackup(snapshot));
  }

  exportBackup(): Promise<ProjectStorageBackup> {
    return this.enqueue(async () => {
      const db = await this.getDatabase();
      const transaction = db.transaction([...projectStoreNames], 'readonly');
      const done = transactionDone(transaction);
      const [projects, lists, metadataKeys, metadataValues, events, analyticsKeys, analyticsValues] = await Promise.all([
        idbRequest(transaction.objectStore('projects').getAll()),
        idbRequest(transaction.objectStore('lists').getAll()),
        idbRequest(transaction.objectStore('metadata').getAllKeys()),
        idbRequest(transaction.objectStore('metadata').getAll()),
        idbRequest(transaction.objectStore('events').getAll()),
        idbRequest(transaction.objectStore('analytics').getAllKeys()),
        idbRequest(transaction.objectStore('analytics').getAll()),
      ]);
      await done;
      return {
        format: 'quickstatus-backup', version: 1, projects,
        tasks: this.recordFromEntries<string>(lists.map((row) => [row.projectId, row.tasks])),
        metadata: this.recordFromEntries(metadataKeys.map((key, index) => [String(key), metadataValues[index]])),
        events,
        analytics: this.recordFromEntries(analyticsKeys.map((key, index) => [String(key), analyticsValues[index]])),
      };
    });
  }

  async exportBackupText(): Promise<string> {
    return JSON.stringify(await this.exportBackup(), null, 2);
  }

  /** Accept JSON snapshots or extract the JSON literal from our old console snippet. */
  restoreBackupText(text: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = this.parseBackupText(text);
      if (this.isRecord(parsed) && parsed['format'] === 'quickstatus-backup') {
        return this.restoreBackup(parsed);
      }
      if (!this.isRecord(parsed) || !Object.values(parsed).every((value) => typeof value === 'string')) {
        throw new Error('Unrecognized backup format');
      }
      return this.restoreSnapshot(this.fromLegacy(parsed as LegacyStorageBackup, true));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  restoreBackup(backup: unknown): Promise<void> {
    let copy: ProjectStorageBackup;
    try {
      copy = this.validateBackup(JSON.parse(JSON.stringify(backup)));
    } catch (error) {
      return Promise.reject(error);
    }
    return this.write([...projectStoreNames], async (transaction) => {
      this.writeBackup(transaction, copy);
      await this.normalizeStoredTaskIds(transaction);
      await this.ensureTrackingBaselines(transaction);
      await this.ensureProjectMetrics(transaction, true);
    }).then(() => { this.restoredSubject.next(); });
  }

  private write<T>(stores: string[], operation: (transaction: IDBTransaction) => T | Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const db = await this.getDatabase();
      const transaction = db.transaction(stores, 'readwrite');
      const done = transactionDone(transaction);
      try {
        const result = await operation(transaction);
        await done;
        return result;
      } catch (error) {
        try { transaction.abort(); } catch { /* It may already have aborted. */ }
        await done.catch(() => undefined);
        throw error;
      }
    });
  }

  private async readSnapshot(db: IDBDatabase): Promise<ProjectStorageSnapshot> {
    const transaction = db.transaction(['projects', 'lists'], 'readonly');
    const done = transactionDone(transaction);
    const [storedProjects, lists] = await Promise.all([
      idbRequest<StoredProject[]>(transaction.objectStore('projects').getAll()),
      idbRequest(transaction.objectStore('lists').getAll()),
    ]);
    await done;
    return {
      projects: storedProjects.filter((project) => !project.archived)
        .sort((a, b) => a.position - b.position).map(({ id, name }) => ({ id, name })),
      tasks: this.recordFromEntries<string>(lists.map((row) => [row.projectId, row.tasks])),
    };
  }

  private baselineBackup(snapshot: ProjectStorageSnapshot): ProjectStorageBackup {
    return {
      format: 'quickstatus-backup', version: 1,
      projects: snapshot.projects.map((project, position) => ({ ...project, position })),
      tasks: snapshot.tasks,
      metadata: { initialized: true, nextTaskId: 1, nextEventId: 1 },
      events: [], analytics: {},
    };
  }

  private writeBackup(transaction: IDBTransaction, backup: ProjectStorageBackup): void {
    projectStoreNames.forEach((name) => transaction.objectStore(name).clear());
    backup.projects.forEach((project) => transaction.objectStore('projects').add(project));
    Object.entries(backup.tasks).forEach(([projectId, tasks]) =>
      transaction.objectStore('lists').add({ projectId, tasks }));
    Object.entries(backup.metadata).forEach(([key, value]) => transaction.objectStore('metadata').add(value, key));
    backup.events.forEach((event) => transaction.objectStore('events').add(event));
    Object.entries(backup.analytics).forEach(([key, value]) => transaction.objectStore('analytics').add(value, key));
  }

  private validateBackup(value: unknown): ProjectStorageBackup {
    const invalid = () => { throw new Error('Invalid or unsupported Quick Status backup'); };
    if (!this.isRecord(value) || value['format'] !== 'quickstatus-backup' || value['version'] !== 1) return invalid();
    const { projects, tasks, metadata, events, analytics } = value;
    if (!Array.isArray(projects) || projects.length === 0 || !this.isRecord(tasks)
      || !this.isRecord(metadata) || !Array.isArray(events) || !this.isRecord(analytics)) return invalid();
    if (!projects.every((project) => this.isProject(project) && this.isRecord(project)
      && Number.isSafeInteger(project['position']) && (project['position'] as number) >= 0
      && (project['archived'] === undefined || typeof project['archived'] === 'boolean'))
      || new Set(projects.map((project) => project.id)).size !== projects.length
      || !projects.some((project) => !project.archived)) return invalid();
    const ids = new Set(projects.map((project) => project.id));
    if (!Object.entries(tasks).every(([id, text]) => ids.has(id) && typeof text === 'string')
      || !projects.filter((project) => !project.archived).every((project) => typeof tasks[project.id] === 'string')
      || metadata['initialized'] !== true
      || !this.isId(metadata['nextTaskId']) || !this.isId(metadata['nextEventId'])) return invalid();
    if (!events.every((event) => isTaskActivity(event) && ids.has(event.projectId))
      || new Set(events.map((event) => event.id)).size !== events.length
      || events.some((event) => event.id >= (metadata['nextEventId'] as number))) return invalid();
    if (!Object.entries(analytics).every(([key, record]) => !key.startsWith('baseline:')
      || (isTrackingBaseline(record) && ids.has(record.projectId) && key === baselineKey(record.projectId)))) return invalid();
    return value as unknown as ProjectStorageBackup;
  }

  private readLegacyStorage(): LegacyStorageBackup {
    const backup: LegacyStorageBackup = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && (key === this.legacyKey || key.startsWith(this.taskPrefix))) {
        backup[key] = localStorage.getItem(key)!;
      }
    }
    return backup;
  }

  /** Pure conversion: migration never edits or deletes the legacy source. */
  private fromLegacy(backup: LegacyStorageBackup, strict: boolean): ProjectStorageSnapshot {
    const raw = backup[this.projectsKey];
    let entries: unknown = [];
    if (raw) entries = JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error('Invalid legacy projects');
    const projects: Project[] = [];
    const tasks: Record<string, string> = Object.create(null);
    for (const entry of entries) {
      const project = this.isProject(entry) ? { ...entry }
        : typeof entry === 'string' && entry.trim() ? { id: this.newProjectId(), name: entry } : null;
      if (!project) {
        if (strict) throw new Error('Invalid legacy project');
        continue;
      }
      if (projects.some((existing) => existing.id === project.id)) {
        if (strict) throw new Error('Duplicate legacy project ID');
        continue;
      }
      const key = this.taskPrefix + (typeof entry === 'string' ? entry : project.id);
      if (strict && typeof backup[key] !== 'string') throw new Error('Legacy backup is missing a task list');
      projects.push(project);
      tasks[project.id] = backup[key] ?? '';
    }
    if (projects.length === 0) {
      const fallback = backup[this.legacyKey] ?? backup[this.taskPrefix + 'Primary'];
      if (strict && fallback === undefined) throw new Error('No projects in legacy backup');
      const project = { id: this.newProjectId(), name: 'Primary' };
      projects.push(project);
      tasks[project.id] = fallback ?? '';
    }
    return { projects, tasks };
  }

  private parseBackupText(text: string): unknown {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    const prefix = trimmed.match(/const backup = JSON\.parse\(\s*`/);
    if (!prefix || prefix.index === undefined) throw new Error('Paste a Quick Status backup');
    let literal = '';
    for (let index = prefix.index + prefix[0].length; index < trimmed.length; index++) {
      const character = trimmed[index];
      if (character === '`') return JSON.parse(literal);
      if (character === '\\') {
        const escaped = trimmed[++index];
        if (!['\\', '`', '$'].includes(escaped)) throw new Error('Invalid legacy backup escape');
        literal += escaped;
      } else {
        literal += character;
      }
    }
    throw new Error('Incomplete legacy backup');
  }

  private isId(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }

  private recordFromEntries<T>(entries: [string, T][]): Record<string, T> {
    const record: Record<string, T> = Object.create(null);
    entries.forEach(([key, value]) => record[key] = value);
    return record;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isProject(value: unknown): value is Project {
    if (!this.isRecord(value)) return false;
    return typeof value['id'] === 'string' && value['id'].trim().length > 0
      && typeof value['name'] === 'string' && value['name'].trim().length > 0;
  }
}
