import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
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
  IonTextarea,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  addOutline,
  arrowUndoOutline,
  createOutline,
  refreshOutline,
  reorderThreeOutline,
} from 'ionicons/icons';
import { KeyboardShortcutsComponent } from './ui/keyboard-shortcuts/keyboard-shortcuts.component';
import { TaskListComponent } from './ui/task-list/task-list.component';
import { ProjectStatsBarComponent } from './ui/project-stats-bar/project-stats-bar.component';
import { ExportAction, ExportMenuComponent } from './ui/export-menu/export-menu.component';
import {
  createEmptyTask,
  parseTasksString,
  stringifyTasks,
  Task,
  TaskDeleteEvent,
} from './ui/task-list/task-list.utils';

import { ProjectStorageService } from './data/project-storage.service';
import { Project } from './data/project-storage.types';
import { TaskActivityDraft } from './analytics/task-activity.types';
import { restoredTaskEvent, taskRemovalEvents } from './analytics/task-actions';
import { ProjectAnalyticsService } from './analytics/project-analytics.service';

interface DeletedTaskEntry {
  projectId: string;
  index: number;
  task: Task;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    AsyncPipe,
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
    IonTextarea,
    FormsModule,
    IonContent,
    IonFooter,
    IonModal,
    IonList,
    IonItem,
    IonReorder,
    IonReorderGroup,
    TaskListComponent,
    ProjectStatsBarComponent,
    ExportMenuComponent,
    KeyboardShortcutsComponent,
  ],
})
export class HomePage implements OnInit {
  @ViewChild(TaskListComponent) taskListComponent?: TaskListComponent;
  @ViewChild('reorderModal') reorderModal?: IonModal;
  @ViewChild('restoreModal') restoreModal?: IonModal;
  @ViewChild(IonSegment) segment?: IonSegment;

  projects: Project[] = [];
  selectedProjectId = '';
  currentTasksString = '';
  reorderProjects: Project[] = [];
  deleteHistoryByProject: Record<string, DeletedTaskEntry[]> = {};

  readonly addProjectSegmentValue = '__add_project__';
  readonly reorderProjectSegmentValue = '__reorder_projects__';

  storageBusy = true;
  restoreContent = '';
  restoreError = '';

  constructor(
    private alertController: AlertController,
    private changeDetectorRef: ChangeDetectorRef,
    private storage: ProjectStorageService,
    readonly analytics: ProjectAnalyticsService
  ) {
    addIcons({
      addCircleOutline,
      arrowUndoOutline,
      refreshOutline,
      addOutline,
      createOutline,
      reorderThreeOutline,
    });
  }

  ngOnInit() {
    void this.runStorageAction(async () => {
      const snapshot = await this.storage.initialize();
      this.projects = snapshot.projects;
      this.projects.forEach((project) => this.deleteHistoryByProject[project.id] = []);
      this.selectedProjectId = this.projects[0].id;
      this.currentTasksString = snapshot.tasks[this.selectedProjectId];
      await this.analytics.selectProject(this.selectedProjectId);
    });
  }

  async openRestoreBackup() {
    if (this.storageBusy) return;
    this.restoreContent = '';
    this.restoreError = '';
    await this.restoreModal?.present();
  }

  async handleExportAction(action: ExportAction): Promise<void> {
    if (this.storageBusy) {
      return;
    }

    if (action === 'import') {
      await this.openRestoreBackup();
      return;
    }

    if (!this.selectedProjectId || !this.taskListComponent) {
      return;
    }

    switch (action) {
      case 'export':
        await this.taskListComponent.copyBackupToClipboard();
        break;
      case 'copy':
        await this.taskListComponent.copyTasksToClipboard();
        break;
      case 'copy-private':
        await this.taskListComponent.copyTasksToClipboard(true);
        break;
      case 'paste':
        await this.taskListComponent.openPaste();
        break;
    }
  }

  async cancelRestoreBackup() {
    if (!this.storageBusy) await this.restoreModal?.dismiss();
  }

  async confirmRestoreBackup() {
    if (this.storageBusy || !this.restoreContent.trim()) return;
    this.storageBusy = true;
    this.restoreError = '';
    this.changeDetectorRef.markForCheck();
    try {
      await this.flushPendingTaskChanges();
      await this.storage.restoreBackupText(this.restoreContent);
      const snapshot = await this.storage.initialize();
      this.projects = snapshot.projects;
      this.deleteHistoryByProject = {};
      this.projects.forEach((project) => this.deleteHistoryByProject[project.id] = []);
      this.selectedProjectId = this.projects[0].id;
      this.currentTasksString = snapshot.tasks[this.selectedProjectId];
      await this.analytics.selectProject(this.selectedProjectId);
      this.restoreContent = '';
      await this.restoreModal?.dismiss();
    } catch (error) {
      this.restoreError = error instanceof Error ? error.message : 'Unable to restore backup';
    } finally {
      this.storageBusy = false;
      this.changeDetectorRef.markForCheck();
    }
  }

  handleTaskListChange(combinedList: string) {
    this.currentTasksString = combinedList;
    this.changeDetectorRef.markForCheck();
  }

  async handleTaskDeleteRequest(event: TaskDeleteEvent) {
    if (!this.selectedProjectId || this.storageBusy) return;
    const projectId = this.selectedProjectId;
    await this.runStorageAction(async () => {
      await this.flushPendingTaskChanges();
      const tasks = parseTasksString(this.currentTasksString);
      const deletedTask = tasks[event.index] ?? event.task;
      if (!deletedTask) return;

      tasks.splice(event.index, 1);
      if (tasks.length === 0) {
        const [id] = await this.storage.allocateTaskIds(1);
        tasks.push(createEmptyTask(id));
      }
      await this.persistTaskString(projectId, stringifyTasks(tasks), taskRemovalEvents([deletedTask], 'normal'));
      this.pushDeletedTask({ projectId, index: event.index, task: { ...deletedTask } });
      this.taskListComponent?.setPendingFocusIndex(event.nextFocusIndex);
    });
  }

  async undoDelete() {
    if (this.storageBusy) return;
    const projectId = this.selectedProjectId;
    const history = this.deleteHistoryByProject[projectId];
    if (!history?.length) return;

    await this.runStorageAction(async () => {
      await this.flushPendingTaskChanges();
      const deletedEntry = history[history.length - 1];
      if (!deletedEntry) return;
      const tasks = parseTasksString(this.currentTasksString);
      const isPlaceholderOnly =
        tasks.length === 1 && tasks[0].text === '' && tasks[0].status === '❌' &&
        !(tasks[0].private ?? false) && !(tasks[0].sectionHeading ?? false);
      const workingTasks = isPlaceholderOnly ? [] : [...tasks];
      const insertIndex = Math.min(Math.max(deletedEntry.index, 0), workingTasks.length);
      workingTasks.splice(insertIndex, 0, { ...deletedEntry.task });
      const events = [...(isPlaceholderOnly ? taskRemovalEvents(tasks, 'undo') : []),
        restoredTaskEvent(deletedEntry.task)];
      await this.persistTaskString(projectId, stringifyTasks(workingTasks), events);
      history.pop();
      this.taskListComponent?.setPendingFocusIndex(insertIndex);
    });
  }

  hasUndoHistoryForActiveProject(): boolean {
    return (
      (this.deleteHistoryByProject[this.selectedProjectId]?.length ?? 0) > 0
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
              void this.renameProject(currentProject.id, newName);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  private async renameProject(projectId: string, newName: string) {
    const projectIndex = this.projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) {
      return;
    }

    await this.runStorageAction(async () => {
      const projects = this.projects.map((project) =>
        project.id === projectId ? { ...project, name: newName } : project
      );
      await this.storage.saveProjects(projects);
      this.projects = projects;
    });
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
            void this.deleteProject(currentProject.id);
          },
        },
      ],
    });

    await alert.present();
  }

  private async deleteProject(projectId: string) {
    if (!this.projects.some((project) => project.id === projectId)) return;
    await this.runStorageAction(async () => {
      await this.flushPendingTaskChanges();
      const tasks = parseTasksString(await this.storage.getProjectTasks(projectId));
      await this.storage.commitTaskActivity({ projectId, tasks: null, archiveProject: true,
        events: taskRemovalEvents(tasks, 'project-delete') });
      this.projects = this.projects.filter((project) => project.id !== projectId);
      delete this.deleteHistoryByProject[projectId];
      this.selectedProjectId = this.projects[0].id;
      this.currentTasksString = await this.storage.getProjectTasks(this.selectedProjectId);
      await this.analytics.selectProject(this.selectedProjectId);
    });
  }

  async showReorderProjectsDialog() {
    // Make a copy of projects for reordering
    this.reorderProjects = [...this.projects];
    await this.reorderModal?.present();

    // Reset segment back to selected project (it was changed to reorder button value)
    setTimeout(() => {
      if (this.segment) {
        this.segment.value = this.selectedProjectId;
      }
    }, 0);
  }

  handleReorder(event: any) {
    const itemMove = this.reorderProjects.splice(event.detail.from, 1)[0];
    this.reorderProjects.splice(event.detail.to, 0, itemMove);
    event.detail.complete();
  }

  async saveReorder() {
    await this.runStorageAction(async () => {
      const projects = [...this.reorderProjects];
      await this.storage.saveProjects(projects);
      this.projects = projects;
      await this.reorderModal?.dismiss();
    });
  }

  async cancelReorder() {
    await this.reorderModal?.dismiss();
  }

  private async switchProject(projectId: string) {
    if (this.storageBusy) return;
    await this.runStorageAction(async () => {
      await this.flushPendingTaskChanges();
      const tasks = await this.storage.getProjectTasks(projectId);
      this.selectedProjectId = projectId;
      this.currentTasksString = tasks;
      await this.analytics.selectProject(projectId);
    });
  }

  private async addProject() {
    if (this.storageBusy) return;
    const project: Project = {
      id: this.storage.newProjectId(),
      name: this.generateNextProjectName(),
    };
    await this.runStorageAction(async () => {
      await this.flushPendingTaskChanges();
      await this.storage.createProject(project);
      this.projects = [...this.projects, project];
      this.deleteHistoryByProject[project.id] = [];
      this.selectedProjectId = project.id;
      this.currentTasksString = await this.storage.getProjectTasks(project.id);
      await this.analytics.selectProject(project.id);
      if (this.segment) this.segment.value = project.id;
    });
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

  private async persistTaskString(projectId: string, taskString: string, events: TaskActivityDraft[]) {
    await this.storage.commitTaskActivity({ projectId, tasks: taskString, events });
    if (projectId === this.selectedProjectId) {
      this.currentTasksString = taskString;
      this.changeDetectorRef.markForCheck();
    }
  }

  private async runStorageAction(action: () => Promise<void>): Promise<void> {
    this.storageBusy = true;
    this.changeDetectorRef.markForCheck();
    try {
      await action();
    } catch (error) {
      await this.showStorageError(error);
    } finally {
      this.storageBusy = false;
      this.changeDetectorRef.markForCheck();
    }
  }

  private async showStorageError(error: unknown): Promise<void> {
    console.error('Project storage operation failed:', error);
    const alert = await this.alertController.create({
      header: 'Unable to save or load tasks',
      message: 'Your latest changes may not be saved. Please try again before leaving the app.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  private pushDeletedTask(entry: DeletedTaskEntry) {
    this.deleteHistoryByProject[entry.projectId] ??= [];
    this.deleteHistoryByProject[entry.projectId].push(entry);
  }

  private async flushPendingTaskChanges(): Promise<void> {
    await this.taskListComponent?.flushPendingChanges();
  }
}
