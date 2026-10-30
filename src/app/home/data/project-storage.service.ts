import { Injectable } from '@angular/core';
import { LegacyStorageBackup, Project, ProjectStorageSnapshot } from './project-storage.types';

@Injectable({ providedIn: 'root' })
export class ProjectStorageService {
  private readonly projectsKey = 'taskList:projects';
  private readonly legacyKey = 'taskList';
  private readonly taskPrefix = 'taskList:';
  private pending: Promise<unknown> = Promise.resolve();

  /** All operations share a queue, including reads and backup export. */
  private enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  initialize(): Promise<ProjectStorageSnapshot> {
    return this.enqueue(() => {
      let projects: Project[] = [];
      const raw = localStorage.getItem(this.projectsKey);
      let parsed: unknown;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch (error) {
          console.error('Failed to parse stored projects:', error);
        }
      }
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
          projects = parsed.filter((item): item is Project => this.isProject(item));
        } else {
          projects = parsed.filter((name): name is string =>
            typeof name === 'string' && name.trim().length > 0
          ).map((name) => {
            const id = this.newProjectId();
            const oldKey = this.taskKey(name);
            const tasks = localStorage.getItem(oldKey);
            if (tasks !== null) {
              localStorage.setItem(this.taskKey(id), tasks);
              localStorage.removeItem(oldKey);
            }
            return { id, name };
          });
        }
      }

      const uniqueProjects = new Map<string, Project>();
      projects.forEach((project) => {
        if (!uniqueProjects.has(project.id)) uniqueProjects.set(project.id, project);
      });
      projects = [...uniqueProjects.values()];
      if (projects.length === 0) {
        const id = this.newProjectId();
        const tasks = localStorage.getItem(this.legacyKey)
          ?? localStorage.getItem(this.taskKey('Primary')) ?? '';
        projects = [{ id, name: 'Primary' }];
        localStorage.setItem(this.taskKey(id), tasks);
        localStorage.removeItem(this.legacyKey);
        localStorage.removeItem(this.taskKey('Primary'));
      }
      localStorage.setItem(this.projectsKey, JSON.stringify(projects));
      this.removeOrphanedLists(projects);
      return this.readSnapshot();
    });
  }

  newProjectId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = (Math.random() * 16) | 0;
      return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
  }

  getProjectTasks(projectId: string): Promise<string> {
    return this.enqueue(() => localStorage.getItem(this.taskKey(projectId)) ?? '');
  }

  setProjectTasks(projectId: string, tasks: string): Promise<void> {
    return this.enqueue(() => localStorage.setItem(this.taskKey(projectId), tasks));
  }

  saveProjects(projects: Project[]): Promise<void> {
    const copy = projects.map((project) => ({ ...project }));
    return this.enqueue(() => localStorage.setItem(this.projectsKey, JSON.stringify(copy)));
  }

  createProject(project: Project): Promise<void> {
    const copy = { ...project };
    return this.mutateSnapshot((snapshot) => {
      snapshot.projects.push(copy);
      snapshot.tasks[copy.id] = '';
    });
  }

  deleteProject(projectId: string): Promise<void> {
    return this.mutateSnapshot((snapshot) => {
      snapshot.projects = snapshot.projects.filter((project) => project.id !== projectId);
      delete snapshot.tasks[projectId];
    });
  }

  /** Future transactional boundary. LocalStorage itself is NOT transactional. */
  private mutateSnapshot(mutate: (snapshot: ProjectStorageSnapshot) => void): Promise<void> {
    return this.enqueue(() => {
      const snapshot = this.readSnapshot();
      mutate(snapshot);
      this.writeSnapshot(snapshot);
    });
  }

  exportSnapshot(): Promise<ProjectStorageSnapshot> {
    return this.enqueue(() => this.readSnapshot());
  }

  restoreSnapshot(snapshot: ProjectStorageSnapshot): Promise<void> {
    // Validate and capture before queuing so callers cannot mutate queued data.
    const copy: ProjectStorageSnapshot = JSON.parse(JSON.stringify(snapshot));
    if (!Array.isArray(copy.projects) || copy.projects.length === 0
      || !copy.projects.every((project) => this.isProject(project))
      || new Set(copy.projects.map((project) => project.id)).size !== copy.projects.length
      || !copy.tasks || typeof copy.tasks !== 'object'
      || !copy.projects.every((project) => typeof copy.tasks[project.id] === 'string')) {
      return Promise.reject(new Error('Invalid project storage snapshot'));
    }
    return this.enqueue(() => this.writeSnapshot(copy));
  }

  async exportLegacyBackup(): Promise<LegacyStorageBackup> {
    const snapshot = await this.exportSnapshot();
    const backup: LegacyStorageBackup = { [this.projectsKey]: JSON.stringify(snapshot.projects) };
    snapshot.projects.forEach((project) => {
      backup[this.taskKey(project.id)] = snapshot.tasks[project.id];
    });
    return backup;
  }

  async createRestoreSnippet(): Promise<string> {
    const backup = JSON.stringify(await this.exportLegacyBackup(), null, 2);
    const escaped = backup.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return `(() => {
  const backup = JSON.parse(\`${escaped}\`);
  Object.keys(backup).forEach((key) => {
    localStorage.setItem(key, backup[key]);
  });
  location.reload();
})();`;
  }

  private readSnapshot(): ProjectStorageSnapshot {
    const projects: Project[] = JSON.parse(localStorage.getItem(this.projectsKey) ?? '[]');
    const tasks: Record<string, string> = Object.create(null);
    projects.forEach((project) => {
      tasks[project.id] = localStorage.getItem(this.taskKey(project.id)) ?? '';
    });
    return { projects, tasks };
  }

  private writeSnapshot(snapshot: ProjectStorageSnapshot): void {
    snapshot.projects.forEach((project) => {
      localStorage.setItem(this.taskKey(project.id), snapshot.tasks[project.id]);
    });
    localStorage.setItem(this.projectsKey, JSON.stringify(snapshot.projects));
    this.removeOrphanedLists(snapshot.projects);
  }

  private removeOrphanedLists(projects: Project[]): void {
    const keys = new Set(projects.map((project) => this.taskKey(project.id)));
    Object.keys(localStorage).filter((key) => key.startsWith(this.taskPrefix)
      && key !== this.projectsKey && !keys.has(key))
      .forEach((key) => localStorage.removeItem(key));
  }

  private taskKey(projectId: string): string {
    return `${this.taskPrefix}${projectId}`;
  }

  private isProject(value: unknown): value is Project {
    if (typeof value !== 'object' || value === null) return false;
    const project = value as Project;
    return typeof project.id === 'string' && project.id.trim().length > 0
      && typeof project.name === 'string' && project.name.trim().length > 0;
  }
}
