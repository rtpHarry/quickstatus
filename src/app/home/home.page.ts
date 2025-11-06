import { Component, OnInit, ViewChild } from '@angular/core';
import { NgFor } from '@angular/common';
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

  projects: string[] = ['Primary'];
  selectedProject = 'Primary';
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
      this.buildProjectKey(this.selectedProject),
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

    if (value !== this.selectedProject) {
      this.switchProject(value);
    }
  }

  private initializeProjects() {
    const storedProjectsRaw = localStorage.getItem(this.projectsStorageKey);
    let storedProjects: string[] | null = null;

    if (storedProjectsRaw) {
      try {
        const parsed = JSON.parse(storedProjectsRaw);
        if (Array.isArray(parsed)) {
          storedProjects = parsed.filter(
            (item: unknown): item is string =>
              typeof item === 'string' && item.trim().length > 0
          );
        }
      } catch (error) {
        console.error('Failed to parse stored projects:', error);
      }
    }

    if (!storedProjects || storedProjects.length === 0) {
      const legacyList = localStorage.getItem(this.legacyStorageKey);
      const primaryKey = this.buildProjectKey('Primary');
      const existingPrimary = localStorage.getItem(primaryKey);
      const initialList = legacyList ?? existingPrimary ?? '';
      this.projects = ['Primary'];
      this.persistProjects();
      localStorage.setItem(primaryKey, initialList);
      if (legacyList !== null) {
        localStorage.removeItem(this.legacyStorageKey);
      }
      this.selectedProject = 'Primary';
      this.currentTasksString = initialList;
      return;
    }

    const uniqueProjects = Array.from(new Set(storedProjects));
    if (!uniqueProjects.includes('Primary')) {
      uniqueProjects.unshift('Primary');
    }
    this.projects = uniqueProjects;
    this.persistProjects();

    this.selectedProject = 'Primary';
    this.currentTasksString = this.getProjectTasks(this.selectedProject);
  }

  private switchProject(projectName: string) {
    this.flushPendingTaskChanges();
    this.selectedProject = projectName;
    this.currentTasksString = this.getProjectTasks(projectName);
  }

  private addProject() {
    this.flushPendingTaskChanges();
    const newProjectName = this.generateNextProjectName();
    this.projects = [...this.projects, newProjectName];
    this.persistProjects();
    this.selectedProject = newProjectName;
    this.currentTasksString = '';
    localStorage.setItem(this.buildProjectKey(newProjectName), '');
  }

  private generateNextProjectName(): string {
    const baseName = 'Project';
    const usedNumbers = new Set<number>();

    this.projects.forEach((project) => {
      const match = project.match(/^Project (\d+)$/);
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

  private getProjectTasks(projectName: string): string {
    const stored = localStorage.getItem(this.buildProjectKey(projectName));
    return stored ?? '';
  }

  private persistProjects() {
    localStorage.setItem(
      this.projectsStorageKey,
      JSON.stringify(this.projects)
    );
  }

  private buildProjectKey(projectName: string) {
    return `${this.projectKeyPrefix}${projectName}`;
  }

  private flushPendingTaskChanges() {
    this.taskListComponent?.flushPendingChanges();
  }
}
