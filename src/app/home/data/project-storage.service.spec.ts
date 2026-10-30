import { openProjectDatabase, projectDatabaseName } from './project-storage.database';
import { ProjectStorageService } from './project-storage.service';
import { createEmptyTask, parseTasksString, stringifyTasks } from '../ui/task-list/task-list.utils';
import { dailySummaryKey, localActivityDate, TaskActivityDraft, taskFacts } from '../analytics/task-activity.types';

/** Real browser IndexedDB checks; no Angular fixture or application build needed. */
describe('ProjectStorageService IndexedDB migration and restore', () => {
  let service: ProjectStorageService;
  let savedLegacy: Record<string, string>;

  beforeEach(async () => {
    savedLegacy = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)!;
      if (key === 'taskList' || key.startsWith('taskList:')) savedLegacy[key] = localStorage.getItem(key)!;
    }
    Object.keys(savedLegacy).forEach((key) => localStorage.removeItem(key));
    await deleteDatabase();
    service = new ProjectStorageService();
  });

  afterEach(async () => {
    // The test instance owns this connection; close it before deleting the test DB.
    const connection = await (service as unknown as { database?: Promise<IDBDatabase> }).database;
    connection?.close();
    await deleteDatabase();
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) keys.push(localStorage.key(index)!);
    keys.filter((key) => key === 'taskList' || key.startsWith('taskList:'))
      .forEach((key) => localStorage.removeItem(key));
    Object.entries(savedLegacy).forEach(([key, value]) => localStorage.setItem(key, value));
  });

  it('imports once and keeps newer IndexedDB edits instead of replaying localStorage', async () => {
    localStorage.setItem('taskList:projects', JSON.stringify([{ id: 'one', name: 'One' }]));
    localStorage.setItem('taskList:one', '❌ legacy');
    expect(parseTasksString((await service.initialize()).tasks['one'])[0]).toEqual(jasmine.objectContaining({ text: 'legacy', id: 1 }));
    await service.setProjectTasks('one', '✅ changed');
    expect(parseTasksString((await service.initialize()).tasks['one'])[0].text).toBe('changed');
    expect(localStorage.getItem('taskList:one')).toBe('❌ legacy');
  });

  it('migrates legacy project-name keys without removing the source', async () => {
    localStorage.setItem('taskList:projects', JSON.stringify(['Work']));
    localStorage.setItem('taskList:Work', '☑️ old format');
    const snapshot = await service.initialize();
    expect(snapshot.projects[0].name).toBe('Work');
    expect(parseTasksString(snapshot.tasks[snapshot.projects[0].id])[0].text).toBe('old format');
    expect(localStorage.getItem('taskList:Work')).toBe('☑️ old format');
  });

  it('round trips every store, including archived projects, counters and history', async () => {
    const initial = await service.initialize();
    const id = initial.projects[0].id;
    await service.createProject({ id: 'archive', name: 'Archived project' });
    await service.deleteProject('archive');
    const backup = await service.exportBackup();
    backup.tasks[id] = '✅ snapshot [id:1]';
    backup.metadata['nextTaskId'] = 42;
    backup.metadata['nextEventId'] = 2;
    backup.events = [{ schemaVersion: 1, id: 1, taskId: 2, projectId: 'archive',
      localDate: '2026-10-30', timestamp: '2026-10-30T12:00:00.000Z', type: 'deleted', source: 'normal',
      before: taskFacts(createEmptyTask(2)), after: null }];
    backup.analytics['baseline'] = { projectId: id, tracked: true };
    await service.restoreBackup(backup);
    const normalized = await service.exportBackup();
    expect(normalized.events).toEqual(backup.events);
    expect(normalized.metadata).toEqual(backup.metadata);
    const exported = await service.exportBackupText();
    await service.setProjectTasks(id, '❌ later');
    await service.restoreBackupText(exported);
    expect(await service.exportBackup()).toEqual(normalized);
    expect((await service.initialize()).projects.length).toBe(1);
  });

  it('rejects invalid snapshots and rolls back a write-time failure', async () => {
    await service.initialize();
    const before = await service.exportBackup();
    const invalid = JSON.parse(JSON.stringify(before));
    invalid.metadata.nextEventId = 0;
    await expectAsync(service.restoreBackup(invalid)).toBeRejected();
    expect(await service.exportBackup()).toEqual(before);
    // Bypass validation to force failure after clear()/add() have been queued.
    const duplicate = JSON.parse(JSON.stringify(before));
    duplicate.projects.push(duplicate.projects[0]);
    const internal = service as unknown as {
      write: (stores: string[], action: (tx: IDBTransaction) => void) => Promise<void>;
      writeBackup: (tx: IDBTransaction, backup: unknown) => void;
    };
    await expectAsync(internal.write(['projects', 'lists', 'metadata', 'events', 'analytics'],
      (transaction) => internal.writeBackup(transaction, duplicate))).toBeRejected();
    expect(await service.exportBackup()).toEqual(before);
  });

  it('accepts legacy JSON and escaped console snippets without executing them', async () => {
    await service.initialize();
    const legacy = { 'taskList:projects': JSON.stringify([{ id: 'old', name: 'Old' }]),
      'taskList:old': '❌ backtick ` and ${literal} and \\ newline\n☑️ second' };
    const json = JSON.stringify(legacy, null, 2);
    await service.restoreBackupText(json);
    expect(parseTasksString((await service.exportSnapshot()).tasks['old']).map(({ id, ...task }) => task))
      .toEqual(parseTasksString(legacy['taskList:old']));
    const escaped = json.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    await service.restoreBackupText('(() => { const backup = JSON.parse(`' + escaped
      + '`); throw new Error("must never execute"); })();');
    expect(parseTasksString((await service.exportSnapshot()).tasks['old']).map(({ id, ...task }) => task))
      .toEqual(parseTasksString(legacy['taskList:old']));
  });

  it('leaves a failed first migration retryable without modifying legacy data', async () => {
    localStorage.setItem('taskList:projects', '{invalid');
    await expectAsync(service.initialize()).toBeRejected();
    const db = await openProjectDatabase();
    const transaction = db.transaction('metadata', 'readonly');
    const initialized = await new Promise((resolve) => {
      const request = transaction.objectStore('metadata').get('initialized');
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    expect(initialized).toBeUndefined();
    localStorage.setItem('taskList:projects', JSON.stringify([{ id: 'retry', name: 'Retry' }]));
    localStorage.setItem('taskList:retry', '❌ retained');
    expect(parseTasksString((await service.initialize()).tasks['retry'])[0].text).toBe('retained');
  });

  it('[task IDs] reserves across connections without reusing deleted task IDs', async () => {
    const snapshot = await service.initialize();
    const projectId = snapshot.projects[0].id;
    const first = parseTasksString(snapshot.tasks[projectId])[0].id!;
    const other = new ProjectStorageService();
    try {
      const [left, right] = await Promise.all([service.allocateTaskIds(2), other.allocateTaskIds(2)]);
      expect(new Set([first, ...left, ...right]).size).toBe(5);
      await service.setProjectTasks(projectId, stringifyTasks([createEmptyTask(left[0])]));
      await service.setProjectTasks(projectId, '❌ deleted row replaced');
      const [next] = await other.allocateTaskIds(1);
      expect(next).toBeGreaterThan(Math.max(...left, ...right));
      const backup = await service.exportBackup();
      backup.tasks[projectId] = stringifyTasks([createEmptyTask(next)]);
      await service.restoreBackup(backup);
      expect(parseTasksString((await service.initialize()).tasks[projectId])[0].id).toBe(next);
      expect((await service.allocateTaskIds(1))[0]).toBe(next + 1);
    } finally {
      const connection = await (other as unknown as { database?: Promise<IDBDatabase> }).database;
      connection?.close();
    }
  });

  it('[task IDs] creates stable placeholders and backfills legacy task rows', async () => {
    localStorage.setItem('taskList:projects', JSON.stringify([{ id: 'legacy', name: 'Legacy' }]));
    localStorage.setItem('taskList:legacy', '❌ existing without id');
    const legacyTask = parseTasksString((await service.initialize()).tasks['legacy'])[0];
    expect(legacyTask.text).toBe('existing without id');
    expect(legacyTask.id).toBeDefined();
    await service.createProject({ id: 'new', name: 'New' });
    const first = parseTasksString(await service.getProjectTasks('new'))[0].id;
    expect(first).toBeDefined();
    expect(parseTasksString((await service.initialize()).tasks['new'])[0].id).toBe(first);
  });

  it('[task ID backfill] normalizes startup and legacy restore atomically and idempotently', async () => {
    const projects = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    localStorage.setItem('taskList:projects', JSON.stringify(projects));
    localStorage.setItem('taskList:a', '✅ preserved [id:20]\n❌ missing');
    localStorage.setItem('taskList:b', '☑️ duplicate [id:20]\n❌ invalid [id:0]');
    const first = await service.initialize();
    expect(parseTasksString(first.tasks['a']).map((task) => task.id)).toEqual([20, 21]);
    expect(parseTasksString(first.tasks['b']).map((task) => task.id)).toEqual([22, 23]);
    const backup = await service.exportBackup();
    expect(backup.metadata['nextTaskId']).toBe(24);
    expect(await service.initialize()).toEqual(first);
    expect(await service.exportBackup()).toEqual(backup);
    await service.restoreSnapshot({ projects, tasks: {
      a: '❌ restored [id:100]', b: '☑️ another [id:100]\n❌ missing',
    } });
    expect(parseTasksString(await service.getProjectTasks('b')).map((task) => task.id)).toEqual([101, 102]);
    expect((await service.allocateTaskIds(1))[0]).toBe(103);
  });

  it('[activity] captures the tracking baseline once, without synthetic events', async () => {
    localStorage.setItem('taskList:projects', JSON.stringify([{ id: 'one', name: 'One' }]));
    localStorage.setItem('taskList:one', '✅ existing complete [created:2026/10/01]');
    await service.initialize();
    const baseline = await service.getTrackingBaseline('one');
    expect(baseline?.tasks[0].facts).toEqual({
      status: '✅', hasText: true, sectionHeading: false, created: '2026/10/01',
    });
    expect(JSON.stringify(baseline)).not.toContain('existing complete');
    await service.initialize();
    expect(await service.getTrackingBaseline('one')).toEqual(baseline);
    expect(await service.getTaskActivity('one')).toEqual([]);
  });

  it('[activity] saves task, event and counter together and publishes only durable activity', async () => {
    const initial = await service.initialize();
    const projectId = initial.projects[0].id;
    const task = parseTasksString(initial.tasks[projectId])[0];
    const after = { ...task, text: 'new task' };
    const draft: TaskActivityDraft = {
      taskId: task.id!, type: 'entered', source: 'normal', before: taskFacts(task), after: taskFacts(after),
    };
    let committed = 0;
    const subscription = service.committedActivity$.subscribe(() => committed++);
    try {
      const result = service.commitTaskActivity({ projectId, tasks: stringifyTasks([after]), events: [draft] });
      expect(committed).toBe(0);
      const [event] = await result;
      expect(committed).toBe(1);
      expect(event.id).toBe(1);
      expect((await service.exportBackup()).metadata['nextEventId']).toBe(2);
      expect(await service.getProjectTasks(projectId)).toBe(stringifyTasks([after]));
      expect(await service.getTaskActivity(projectId, event.localDate, event.localDate)).toEqual([event]);
      expect(await service.getTaskActivity('another-project')).toEqual([]);
      expect(JSON.stringify(event)).not.toContain('new task');
      expect(await service.getDailySummary(projectId, event.localDate)).toEqual(jasmine.objectContaining({
        created: 1, completed: 0, remaining: 1, closingTotal: 1,
      }));
      const saved = await service.getDailySummary(projectId, event.localDate);
      await service.restoreBackup(await service.exportBackup());
      expect(await service.getDailySummary(projectId, event.localDate)).toEqual(saved);
    } finally { subscription.unsubscribe(); }
  });

  it('[activity] aborts task, event, counter and projection writes without a notification', async () => {
    const initial = await service.initialize();
    const projectId = initial.projects[0].id;
    const task = parseTasksString(initial.tasks[projectId])[0];
    const before = await service.exportBackup();
    let committed = 0;
    const subscription = service.committedActivity$.subscribe(() => committed++);
    const internal = service as unknown as {
      write: (stores: string[], operation: (transaction: IDBTransaction) => Promise<unknown>) => Promise<unknown>;
    };
    const original = internal.write.bind(service);
    // Throw after derived summary writes are queued, before the enclosing commit.
    spyOn(internal, 'write').and.callFake((stores, operation) => original(stores, async (tx) => {
      await operation(tx);
      expect(await new Promise((resolve) => {
        const request = tx.objectStore('analytics').get(dailySummaryKey(projectId, localActivityDate()));
        request.onsuccess = () => resolve(request.result.created);
      })).toBe(1);
      throw new Error('forced transaction failure');
    }));
    try {
      await expectAsync(service.commitTaskActivity({
        projectId, tasks: stringifyTasks([{ ...task, text: 'must roll back' }]),
        events: [{ taskId: task.id!, type: 'entered', source: 'normal',
          before: taskFacts(task), after: taskFacts({ ...task, text: 'must roll back' }) }],
      })).toBeRejected();
      expect(await service.exportBackup()).toEqual(before);
      expect(committed).toBe(0);
    } finally { subscription.unsubscribe(); }
  });
  it('replaces the last project atomically and preserves its task history', async () => {
    const initial = await service.initialize();
    const oldProject = initial.projects[0];
    const task = parseTasksString(initial.tasks[oldProject.id])[0];
    const populated = { ...task, text: 'Existing task' };
    await service.commitTaskActivity({
      projectId: oldProject.id,
      tasks: stringifyTasks([populated]),
      events: [{
        taskId: task.id!,
        type: 'entered',
        source: 'normal',
        before: taskFacts(task),
        after: taskFacts(populated),
      }],
    });

    const tasks = await service.replaceLastProject(oldProject.id, {
      id: 'replacement',
      name: 'Replacement',
    });
    const snapshot = await service.exportSnapshot();
    const backup = await service.exportBackup();

    expect(snapshot.projects).toEqual([{ id: 'replacement', name: 'Replacement' }]);
    expect(snapshot.tasks['replacement']).toBe(tasks);
    expect(parseTasksString(tasks)[0].id).not.toBe(task.id);
    expect(backup.projects.find((project) => project.id === oldProject.id)?.archived).toBeTrue();
    expect((await service.getTaskActivity(oldProject.id)).map((event) => event.type))
      .toEqual(['entered', 'deleted']);
    expect((await service.getDailySummary(oldProject.id, localActivityDate()))?.remaining).toBe(0);
    expect(await service.getTrackingBaseline('replacement')).toBeDefined();
  });

  it('rolls back the deletion and events if the replacement cannot be created', async () => {
    const initial = await service.initialize();
    const oldProject = initial.projects[0];
    await service.createProject({ id: 'taken', name: 'Archived' });
    await service.deleteProject('taken');
    const before = await service.exportBackup();
    let notifications = 0;
    const subscription = service.committedActivity$.subscribe(() => notifications++);

    try {
      await expectAsync(service.replaceLastProject(oldProject.id, {
        id: 'taken',
        name: 'Collision forces creation failure',
      })).toBeRejected();
      expect(await service.exportBackup()).toEqual(before);
      expect(notifications).toBe(0);
    } finally {
      subscription.unsubscribe();
    }
  });
});

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(projectDatabaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Test database is still open'));
  });
}
