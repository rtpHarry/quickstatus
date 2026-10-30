import { Injectable } from '@angular/core';
import { idbRequest, openProjectDatabase, projectStoreNames, transactionDone } from './project-storage.database';
import { LegacyStorageBackup, Project, ProjectStorageBackup, ProjectStorageSnapshot, StoredProject } from './project-storage.types';

@Injectable({ providedIn: 'root' })
export class ProjectStorageService {
  private readonly projectsKey = 'taskList:projects';
  private readonly legacyKey = 'taskList';
  private readonly taskPrefix = 'taskList:';
  private pending: Promise<unknown> = Promise.resolve();
  private database?: Promise<IDBDatabase>;

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
    return this.write(['projects', 'lists'], async (transaction) => {
      const store = transaction.objectStore('projects');
      const position = await idbRequest(store.count());
      store.add({ ...copy, position });
      transaction.objectStore('lists').add({ projectId: copy.id, tasks: '' });
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
    return this.write([...projectStoreNames], (transaction) => this.writeBackup(transaction, copy));
  }

  private write(stores: string[], operation: (transaction: IDBTransaction) => void | Promise<void>): Promise<void> {
    return this.enqueue(async () => {
      const db = await this.getDatabase();
      const transaction = db.transaction(stores, 'readwrite');
      const done = transactionDone(transaction);
      try {
        await operation(transaction);
        await done;
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
    if (!events.every((event) => this.isRecord(event) && this.isId(event['id'])
      && typeof event['projectId'] === 'string' && ids.has(event['projectId'])
      && typeof event['localDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event['localDate']))
      || new Set(events.map((event) => event.id)).size !== events.length
      || events.some((event) => event.id >= (metadata['nextEventId'] as number))) return invalid();
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
