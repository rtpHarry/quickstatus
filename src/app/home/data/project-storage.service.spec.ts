import { openProjectDatabase, projectDatabaseName } from './project-storage.database';
import { ProjectStorageService } from './project-storage.service';
import { createEmptyTask, parseTasksString, stringifyTasks } from '../ui/task-list/task-list.utils';

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
    expect((await service.initialize()).tasks['one']).toBe('❌ legacy');
    await service.setProjectTasks('one', '✅ changed');
    expect((await service.initialize()).tasks['one']).toBe('✅ changed');
    expect(localStorage.getItem('taskList:one')).toBe('❌ legacy');
  });

  it('migrates legacy project-name keys without removing the source', async () => {
    localStorage.setItem('taskList:projects', JSON.stringify(['Work']));
    localStorage.setItem('taskList:Work', '☑️ old format');
    const snapshot = await service.initialize();
    expect(snapshot.projects[0].name).toBe('Work');
    expect(snapshot.tasks[snapshot.projects[0].id]).toBe('☑️ old format');
    expect(localStorage.getItem('taskList:Work')).toBe('☑️ old format');
  });

  it('round trips every store, including archived projects, counters and history', async () => {
    const initial = await service.initialize();
    const id = initial.projects[0].id;
    await service.createProject({ id: 'archive', name: 'Archived project' });
    await service.deleteProject('archive');
    const backup = await service.exportBackup();
    backup.tasks[id] = '✅ snapshot';
    backup.metadata['nextTaskId'] = 42;
    backup.metadata['nextEventId'] = 2;
    backup.events = [{ id: 1, projectId: 'archive', localDate: '2026-10-30', type: 'test' }];
    backup.analytics['baseline'] = { projectId: id, tracked: true };
    await service.restoreBackup(backup);
    const exported = await service.exportBackupText();
    await service.setProjectTasks(id, '❌ later');
    await service.restoreBackupText(exported);
    expect(await service.exportBackup()).toEqual(backup);
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
    expect((await service.exportSnapshot()).tasks['old']).toBe(legacy['taskList:old']);
    const escaped = json.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    await service.restoreBackupText('(() => { const backup = JSON.parse(`' + escaped
      + '`); throw new Error("must never execute"); })();');
    expect((await service.exportSnapshot()).tasks['old']).toBe(legacy['taskList:old']);
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
    expect((await service.initialize()).tasks['retry']).toBe('❌ retained');
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

  it('[task IDs] creates stable placeholders without backfilling legacy task rows', async () => {
    localStorage.setItem('taskList:projects', JSON.stringify([{ id: 'legacy', name: 'Legacy' }]));
    localStorage.setItem('taskList:legacy', '❌ existing without id');
    expect((await service.initialize()).tasks['legacy']).toBe('❌ existing without id');
    await service.createProject({ id: 'new', name: 'New' });
    const first = parseTasksString(await service.getProjectTasks('new'))[0].id;
    expect(first).toBeDefined();
    expect(parseTasksString((await service.initialize()).tasks['new'])[0].id).toBe(first);
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
