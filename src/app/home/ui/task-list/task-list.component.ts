import { NgForOf } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonModal,
  IonReorder,
  IonReorderGroup,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { OverlayEventDetail } from '@ionic/core/components';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  clipboardOutline,
  copyOutline,
  trashOutline,
} from 'ionicons/icons';
import { pastedTaskEvents, taskChangeEvents, taskRemovalEvents } from '../../analytics/task-actions';
import { TaskActivityDraft, TaskActivitySource } from '../../analytics/task-activity.types';
import { ProjectStorageService } from '../../data/project-storage.service';
import { TaskItemComponent } from '../task-item/task-item.component';
import {
  createEmptyTask,
  parseTasksString,
  stringifyTasks,
  Task,
  TaskDeleteEvent,
} from './task-list.utils';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-task-list',
  templateUrl: './task-list.component.html',
  styleUrls: ['./task-list.component.scss'],
  standalone: true,
  imports: [
    IonTitle,
    IonHeader,
    IonModal,
    IonToolbar,
    IonContent,
    IonTextarea,
    IonIcon,
    NgForOf,
    IonReorder,
    IonList,
    IonReorderGroup,
    IonItem,
    IonButton,
    IonButtons,
    TaskItemComponent,
    FormsModule,
  ],
})
export class TaskListComponent implements OnDestroy {
  private _lastTasksString: string | null = null;
  private pendingFocusIndex: number | null = null;

  @Input() set tasksString(value: string) {
    // Don't re-parse if the string hasn't actually changed
    // This prevents re-rendering when the parent passes back our own emitted value
    if (this._lastTasksString === value) {
      return;
    }
    this._lastTasksString = value;
    this.listVersion++;
    this.saveError = undefined;
    this.clearListChangeTimer();
    this.tasks = parseTasksString(value);
    this.focusPendingInput();
  }
  @Input() projectId = '';
  @Input() completionDates: Readonly<Record<number, string>> | null = null;
  @Output() listChange = new EventEmitter<string>();
  @Output() deleteTaskRequest = new EventEmitter<TaskDeleteEvent>();

  tasks: Task[] = [];
  pastedContent = '';
  private listChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listChangeDebounceMs = 750;
  private pendingRows: Promise<void> = Promise.resolve();
  private listVersion = 0;
  private pendingSave: Promise<void> = Promise.resolve();
  private saveError: unknown;

  @ViewChild(IonModal) modal!: IonModal;
  @ViewChild('pasteTextarea') pasteTextarea!: IonTextarea;
  @ViewChildren(TaskItemComponent) taskItems!: QueryList<TaskItemComponent>;

  constructor(
    private toastController: ToastController,
    private changeDetectorRef: ChangeDetectorRef,
    private storage: ProjectStorageService
  ) {
    addIcons({
      addCircleOutline,
      copyOutline,
      clipboardOutline,
      trashOutline,
    });
  }

  ngOnDestroy() {
    this.clearListChangeTimer();
  }

  trackTask(index: number, task: Task): number {
    return task.id ?? index;
  }

  async addTask(index?: number) {
    await this.queueRowCreation(([id]) => {
      const insertIndex = index !== undefined ? index + 1 : this.tasks.length;
      this.tasks.splice(insertIndex, 0, createEmptyTask(id));
      // The ID reservation completes asynchronously. Render the inserted row
      // before asking its input to take focus.
      this.changeDetectorRef.detectChanges();
      const newTaskItem = this.taskItems?.get(insertIndex);
      if (newTaskItem) {
        void newTaskItem.focusInput();
      }
    });
  }

  handleEnterKey(index: number) {
    this.addTask(index);
  }

  handleDeleteKey(index: number) {
    this.requestDeleteTask(index);
  }

  handleUpArrow(index: number) {
    if (index > 0) {
      setTimeout(() => {
        const previousRow = this.taskItems?.get(index - 1);
        if (previousRow) {
          void previousRow.focusInput();
        }
      });
    }
  }

  handleDownArrow(index: number) {
    if (index < this.tasks.length - 1) {
      setTimeout(() => {
        const nextRow = this.taskItems?.get(index + 1);
        if (nextRow) {
          void nextRow.focusInput();
        }
      });
    }
  }

  reorderTasks(event: any) {
    const itemMove = this.tasks.splice(event.detail.from, 1)[0];
    this.tasks.splice(event.detail.to, 0, itemMove);
    event.detail.complete();
    this.emitListChange();
  }

  onTaskChange(updatedTask: Task, index: number) {
    const events = taskChangeEvents(this.tasks[index], updatedTask);
    this.tasks[index] = updatedTask;
    if (events.length > 0) this.emitListChange(events);
    else this.scheduleListChangeEmit();
  }

  requestDeleteTask(index: number) {
    const task = this.tasks[index];
    if (!task) {
      return;
    }

    let nextFocusIndex = 0;
    if (index > 0) {
      nextFocusIndex = index - 1;
    } else if (this.tasks.length > 1) {
      nextFocusIndex = 0;
    }

    this.pendingFocusIndex = nextFocusIndex;
    this.deleteTaskRequest.emit({
      index,
      nextFocusIndex,
      task: { ...task },
    });
  }

  async copyTasksToClipboard(includePrivate = false) {
    await this.flushPendingChanges();
    const copiedTasks = this.tasks.filter((task) => includePrivate || !task.private);
    const combined = copiedTasks
      .map((t) =>
        t.sectionHeading === true
          ? `🏷️  Section: ${t.text}`
          : `${t.status}  ${t.text}`
      )
      .join('\n');
    this.copyTextToClipboard(
      combined,
      includePrivate
        ? 'List copied to clipboard (private items included)'
        : 'List copied to clipboard (private items excluded)'
    );
  }

  async copyBackupToClipboard() {
    await this.flushPendingChanges();
    try {
      const backup = await this.storage.exportBackupText();
      this.copyTextToClipboard(backup, 'Backup copied to clipboard. Use Manage Data → Import Backup to restore it.');
    } catch (error) {
      console.error('Failed to export backup:', error);
      await this.showToast('Unable to export backup');
    }
  }

  copyTextToClipboard(text: string, successMessage: string) {
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          this.showToast(successMessage);
        })
        .catch((err) => {
          console.error('Failed to copy: ', err);
          this.fallbackCopyTextToClipboard(text, successMessage);
        });
    } else {
      this.fallbackCopyTextToClipboard(text, successMessage);
    }
  }

  fallbackCopyTextToClipboard(text: string, successMessage = 'Copied to clipboard') {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      this.showToast(successMessage);
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
  }

  async openPaste(): Promise<void> {
    await this.flushPendingChanges();
    this.pastedContent = '';
    await this.modal.present();
  }

  cancelPaste() {
    this.pastedContent = '';
    this.modal.dismiss(null, 'cancel');
  }

  async confirmPaste() {
    const tasks = parseTasksString(this.pastedContent);
    const applied = await this.queueRowCreation((ids) => {
      this.tasks = tasks.map((task, index) => ({ ...task, id: ids[index] }));
    }, tasks.length, 'paste');
    if (applied) {
      this.pastedContent = '';
      await this.modal.dismiss();
    }
  }

  onWillDismiss(event: CustomEvent<OverlayEventDetail>) {
    if (event.detail.role === 'confirm') {
      this.emitListChange();
    }
  }

  onModalPresent() {
    setTimeout(() => {
      if (this.pasteTextarea) {
        this.pasteTextarea.setFocus();
      }
    }, 150);
  }

  private emitListChange(events: TaskActivityDraft[] = []) {
    // Also refresh when called from a parent button or an alert callback.
    this.changeDetectorRef.markForCheck();
    this.clearListChangeTimer();
    const combined = stringifyTasks(this.tasks);
    // Update the cached value so we don't re-parse when parent passes it back
    this._lastTasksString = combined;
    const projectId = this.projectId;
    // Submit synchronously so queued storage reads/backups wait for this save.
    this.pendingSave = this.storage.commitTaskActivity({ projectId, tasks: combined, events })
      .then(() => undefined);
    void this.pendingSave.catch(async (error) => {
      this.saveError = error;
      console.error('Failed to save task activity:', error);
      await this.showToast('Unable to save task changes');
    });
    this.listChange.emit(combined);
  }

  private scheduleListChangeEmit() {
    this.clearListChangeTimer();
    this.listChangeTimer = setTimeout(() => {
      this.listChangeTimer = null;
      this.emitListChange();
    }, this.listChangeDebounceMs);
  }

  private clearListChangeTimer() {
    if (this.listChangeTimer) {
      clearTimeout(this.listChangeTimer);
      this.listChangeTimer = null;
    }
  }

  public async flushPendingChanges(): Promise<void> {
    await this.pendingRows;
    if (this.listChangeTimer) {
      this.clearListChangeTimer();
      this.emitListChange();
    }
    await this.pendingSave;
    if (this.saveError) throw this.saveError;
  }

  private queueRowCreation(apply: (ids: number[]) => void, count = 1, source?: TaskActivitySource): Promise<boolean> {
    const version = this.listVersion;
    const result = this.pendingRows.then(async () => {
      const ids = await this.storage.allocateTaskIds(count);
      if (version !== this.listVersion) return false;
      const removed = source ? taskRemovalEvents(this.tasks, source) : [];
      apply(ids);
      const entered = source === 'paste' ? pastedTaskEvents(this.tasks) : [];
      this.emitListChange([...removed, ...entered]);
      await this.pendingSave;
      return true;
    }).catch(async (error) => {
      console.error('Failed to allocate task IDs:', error);
      await this.showToast('Unable to create task rows');
      return false;
    });
    this.pendingRows = result.then(() => undefined);
    return result;
  }

  public setPendingFocusIndex(index: number): void {
    this.pendingFocusIndex = index;
  }

  private focusPendingInput() {
    if (this.pendingFocusIndex === null) {
      return;
    }

    const focusIndex = this.pendingFocusIndex;
    this.pendingFocusIndex = null;

    setTimeout(() => {
      const row = this.taskItems?.get(focusIndex);
      if (row) {
        void row.focusInput();
      }
    });
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom',
    });
    toast.present();
  }
}
