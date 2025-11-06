import { NgFor, NgIf } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonReorder,
  IonReorderGroup,
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
  createOutline,
  refreshOutline,
  reorderThreeOutline,
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
    NgIf,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonTitle,
    IonContent,
    IonFooter,
    IonModal,
    IonList,
    IonItem,
    IonReorder,
    IonReorderGroup,
    TaskListComponent,
    KeyboardShortcutsComponent,
  ],
})
export class HomePage implements OnInit {
  @ViewChild(TaskListComponent) taskListComponent?: TaskListComponent;
  @ViewChild('reorderModal') reorderModal?: IonModal;

  projects: Project[] = [];
  selectedProjectId = '';
  currentTasksString = '';
  reorderProjects: Project[] = [];

  readonly addProjectSegmentValue = '__add_project__';
  readonly reorderProjectSegmentValue = '__reorder_projects__';

  private readonly projectsStorageKey = 'taskList:projects';
  private readonly legacyStorageKey = 'taskList';
  private readonly projectKeyPrefix = 'taskList:';

  constructor(private alertController: AlertController) {
    addIcons({
      addCircleOutline,
      copyOutline,
      clipboardOutline,
      refreshOutline,
      addOutline,
      createOutline,
      reorderThreeOutline,
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

    if (value === this.reorderProjectSegmentValue) {
      this.showReorderProjectsDialog();
      return;
    }

    if (value !== this.selectedProjectId) {
      this.switchProject(value);
    }
  }

  onEditIconClick(event: Event) {
    console.log('Edit icon clicked');
    event.stopPropagation();
    event.preventDefault();
    this.showRenameProjectDialog();
  }

  async showRenameProjectDialog() {
    const currentProject = this.projects.find(
      (p) => p.id === this.selectedProjectId
    );
    if (!currentProject) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Rename Project',
      message: 'Enter a new name for this project',
      inputs: [
        {
          name: 'projectName',
          type: 'text',
          placeholder: 'Project name',
          value: currentProject.name,
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.confirmDeleteProject();
            return false; // Prevent alert from closing
          },
        },
        {
          text: 'Save',
          handler: (data) => {
            const newName = data.projectName?.trim();
            if (newName && newName.length > 0) {
              this.renameProject(this.selectedProjectId, newName);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  private renameProject(projectId: string, newName: string) {
    const projectIndex = this.projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) {
      return;
    }

    this.projects[projectIndex] = {
      ...this.projects[projectIndex],
      name: newName,
    };
    this.persistProjects();
  }

  async confirmDeleteProject() {
    const currentProject = this.projects.find(
      (p) => p.id === this.selectedProjectId
    );
    if (!currentProject) {
      return;
    }

    // Prevent deleting the last project
    if (this.projects.length === 1) {
      const alert = await this.alertController.create({
        header: 'Cannot Delete',
        message: 'You must have at least one project.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    const alert = await this.alertController.create({
      header: 'Delete Project',
      message: `Are you sure you want to delete "${currentProject.name}"? All tasks in this project will be permanently deleted.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.deleteProject(this.selectedProjectId);
          },
        },
      ],
    });

    await alert.present();
  }

  private deleteProject(projectId: string) {
    const projectIndex = this.projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) {
      return;
    }

    // Remove project from array
    this.projects.splice(projectIndex, 1);
    this.persistProjects();

    // Clean up localStorage for this project
    const projectKey = this.buildProjectKey(projectId);
    localStorage.removeItem(projectKey);

    // Switch to another project (first available)
    this.selectedProjectId = this.projects[0].id;
    this.currentTasksString = this.getProjectTasks(this.selectedProjectId);
  }

  async showReorderProjectsDialog() {
    // Make a copy of projects for reordering
    this.reorderProjects = [...this.projects];
    await this.reorderModal?.present();
  }

  handleReorder(event: any) {
    const itemMove = this.reorderProjects.splice(event.detail.from, 1)[0];
    this.reorderProjects.splice(event.detail.to, 0, itemMove);
    event.detail.complete();
  }

  async saveReorder() {
    this.projects = [...this.reorderProjects];
    this.persistProjects();
    await this.reorderModal?.dismiss();
  }

  async cancelReorder() {
    await this.reorderModal?.dismiss();
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
