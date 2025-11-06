import { NgFor } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  addOutline,
  clipboardOutline,
  copyOutline,
  refreshOutline,
} from 'ionicons/icons';
import { KeyboardShortcutsComponent } from './ui/keyboard-shortcuts/keyboard-shortcuts.component';
import { TaskListComponent } from './ui/task-list/task-list.component';

interface Project {
  id: string;
  name: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonIcon,
    IonHeader,
    IonToolbar,
    NgFor,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonTitle,
    IonContent,
    IonFooter,
    TaskListComponent,
    KeyboardShortcutsComponent,
  ],
})
export class HomePage implements OnInit {
  @ViewChild(TaskListComponent) taskListComponent?: TaskListComponent;

  projects: Project[] = [];
  selectedProjectId = '';
  currentTasksString = '';

  readonly addProjectSegmentValue = '__add_project__';

  private readonly projectsStorageKey = 'taskList:projects';
  private readonly legacyStorageKey = 'taskList';
  private readonly projectKeyPrefix = 'taskList:';

  constructor() {
    addIcons({
      addCircleOutline,
      copyOutline,
      clipboardOutline,
      refreshOutline,
      addOutline,
    });
  }

  ngOnInit() {
    this.initializeProjects();
  }

  handleTaskListChange(combinedList: string) {
    this.currentTasksString = combinedList;
    localStorage.setItem(
      this.buildProjectKey(this.selectedProjectId),
      combinedList
    );
  }

  onProjectSegmentChange(event: CustomEvent) {
    const value = event.detail.value as string;
    if (!value) {
      return;
    }

    if (value === this.addProjectSegmentValue) {
      this.addProject();
      return;
    }

    if (value !== this.selectedProjectId) {
      this.switchProject(value);
    }
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private initializeProjects() {
    const storedProjectsRaw = localStorage.getItem(this.projectsStorageKey);
    let storedProjects: Project[] | null = null;
    let needsPersist = false;

    if (storedProjectsRaw) {
      try {
        const parsed = JSON.parse(storedProjectsRaw);
        if (Array.isArray(parsed)) {
          // Check if it's the new format (array of objects with id and name)
          if (
            parsed.length > 0 &&
            typeof parsed[0] === 'object' &&
            'id' in parsed[0]
          ) {
            storedProjects = parsed.filter(
              (item: unknown): item is Project =>
                typeof item === 'object' &&
                item !== null &&
                'id' in item &&
                'name' in item &&
                typeof (item as Project).id === 'string' &&
                typeof (item as Project).name === 'string' &&
                (item as Project).id.trim().length > 0 &&
                (item as Project).name.trim().length > 0
            );
          } else {
            // Legacy format: array of strings - migrate to new format
            storedProjects = this.migrateLegacyProjects(parsed);
            needsPersist = true; // Mark that we need to persist the migrated data
          }
        }
      } catch (error) {
        console.error('Failed to parse stored projects:', error);
      }
    }

    if (!storedProjects || storedProjects.length === 0) {
      // Check for legacy string-based projects in localStorage
      const legacyList = localStorage.getItem(this.legacyStorageKey);
      const primaryId = this.generateUuid();
      const primaryKey = this.buildProjectKey(primaryId);

      // Check if there's existing data under old 'Primary' key
      const oldPrimaryKey = this.buildProjectKey('Primary');
      const existingPrimary = localStorage.getItem(oldPrimaryKey);
      const initialList = legacyList ?? existingPrimary ?? '';

      this.projects = [{ id: primaryId, name: 'Primary' }];
      this.persistProjects();
      localStorage.setItem(primaryKey, initialList);

      // Clean up old keys
      if (legacyList !== null) {
        localStorage.removeItem(this.legacyStorageKey);
      }
      if (existingPrimary !== null) {
        localStorage.removeItem(oldPrimaryKey);
      }

      this.selectedProjectId = primaryId;
      this.currentTasksString = initialList;
      return;
    }

    const uniqueProjects = this.deduplicateProjects(storedProjects);
    const primaryProject = uniqueProjects.find((p) => p.name === 'Primary');

    if (!primaryProject) {
      uniqueProjects.unshift({ id: this.generateUuid(), name: 'Primary' });
      needsPersist = true;
    }

    this.projects = uniqueProjects;

    // Always persist if we migrated or added Primary
    if (needsPersist) {
      this.persistProjects();
    }

    this.selectedProjectId = this.projects[0].id;
    this.currentTasksString = this.getProjectTasks(this.selectedProjectId);
  }

  private migrateLegacyProjects(legacyProjects: unknown[]): Project[] {
    const stringProjects = legacyProjects.filter(
      (item: unknown): item is string =>
        typeof item === 'string' && item.trim().length > 0
    );

    return stringProjects.map((name) => {
      const id = this.generateUuid();
      const oldKey = this.buildProjectKey(name);
      const newKey = this.buildProjectKey(id);

      // Migrate data from old key to new key
      const existingData = localStorage.getItem(oldKey);
      if (existingData !== null) {
        localStorage.setItem(newKey, existingData);
        localStorage.removeItem(oldKey);
      }

      return { id, name };
    });
  }

  private deduplicateProjects(projects: Project[]): Project[] {
    const seen = new Map<string, Project>();
    for (const project of projects) {
      if (!seen.has(project.id)) {
        seen.set(project.id, project);
      }
    }
    return Array.from(seen.values());
  }

  private switchProject(projectId: string) {
    this.flushPendingTaskChanges();
    this.selectedProjectId = projectId;
    this.currentTasksString = this.getProjectTasks(projectId);
  }

  private addProject() {
    this.flushPendingTaskChanges();
    const newProjectName = this.generateNextProjectName();
    const newProjectId = this.generateUuid();
    const newProject: Project = { id: newProjectId, name: newProjectName };
    this.projects = [...this.projects, newProject];
    this.persistProjects();
    this.selectedProjectId = newProjectId;
    this.currentTasksString = '';
    localStorage.setItem(this.buildProjectKey(newProjectId), '');
  }

  private generateNextProjectName(): string {
    const baseName = 'Project';
    const usedNumbers = new Set<number>();

    this.projects.forEach((project) => {
      const match = project.name.match(/^Project (\d+)$/);
      if (match) {
        const parsed = Number.parseInt(match[1], 10);
        if (!Number.isNaN(parsed)) {
          usedNumbers.add(parsed);
        }
      }
    });

    let candidate = 2;
    while (usedNumbers.has(candidate)) {
      candidate += 1;
    }

    return `${baseName} ${candidate}`;
  }

  private getProjectTasks(projectId: string): string {
    const stored = localStorage.getItem(this.buildProjectKey(projectId));
    return stored ?? '';
  }

  private persistProjects() {
    localStorage.setItem(
      this.projectsStorageKey,
      JSON.stringify(this.projects)
    );
  }

  private buildProjectKey(projectId: string) {
    return `${this.projectKeyPrefix}${projectId}`;
  }

  private flushPendingTaskChanges() {
    this.taskListComponent?.flushPendingChanges();
  }
}
