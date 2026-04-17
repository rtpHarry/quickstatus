import { NgForOf } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
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
  refreshOutline,
  trashOutline,
} from 'ionicons/icons';
import { TaskItemComponent } from '../task-item/task-item.component';
import {
  createEmptyTask,
  parseTasksString,
  stringifyTasks,
  Task,
  TaskDeleteEvent,
} from './task-list.utils';

@Component({
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
  private _lastTasksString = '';
  private pendingFocusIndex: number | null = null;

  @Input() set tasksString(value: string) {
    // Don't re-parse if the string hasn't actually changed
    // This prevents re-rendering when the parent passes back our own emitted value
    if (this._lastTasksString === value) {
      return;
    }
    this._lastTasksString = value;
    this.clearListChangeTimer();
    this.tasks = parseTasksString(value);
    this.focusPendingInput();
  }
  @Output() listChange = new EventEmitter<string>();
  @Output() deleteTaskRequest = new EventEmitter<TaskDeleteEvent>();

  tasks: Task[] = [];
  pastedContent = '';
  private listChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listChangeDebounceMs = 750;

  @ViewChild(IonModal) modal!: IonModal;
  @ViewChild('pasteTextarea') pasteTextarea!: IonTextarea;

  constructor(
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    addIcons({
      addCircleOutline,
      copyOutline,
      clipboardOutline,
      refreshOutline,
      trashOutline,
    });
  }

  ngOnDestroy() {
    this.clearListChangeTimer();
  }

  addTask(index?: number) {
    const newTask = createEmptyTask();
    if (index !== undefined) {
      this.tasks.splice(index + 1, 0, newTask);
      setTimeout(() => {
        const input = document.querySelectorAll('ion-input')[index + 1];
        if (input) {
          input.setFocus();
        }
      });
    } else {
      this.tasks.push(newTask);
      setTimeout(() => {
        const input =
          document.querySelectorAll('ion-input')[this.tasks.length - 1];
        if (input) {
          input.setFocus();
        }
      });
    }
    this.emitListChange();
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
        const inputs = document.querySelectorAll('ion-input');
        const prevInput = inputs[index - 1] as HTMLIonInputElement;
        if (prevInput) {
          prevInput.setFocus();
        }
      });
    }
  }

  handleDownArrow(index: number) {
    if (index < this.tasks.length - 1) {
      setTimeout(() => {
        const inputs = document.querySelectorAll('ion-input');
        const nextInput = inputs[index + 1] as HTMLIonInputElement;
        if (nextInput) {
          nextInput.setFocus();
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
    this.tasks[index] = updatedTask;
    this.scheduleListChangeEmit();
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

  async copyTasksToClipboard() {
    // Filter out private tasks when copying (handle graceful upgrade)
    const publicTasks = this.tasks.filter((t) => !(t.private ?? false));
    const combined = publicTasks
      .map((t) => `${t.status}  ${t.text}`)
      .join('\n');
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(combined)
        .then(() => {
          this.showToast('List copied to clipboard (private items excluded)');
        })
        .catch((err) => {
          console.error('Failed to copy: ', err);
          this.fallbackCopyTextToClipboard(combined);
        });
    } else {
      this.fallbackCopyTextToClipboard(combined);
    }
  }

  fallbackCopyTextToClipboard(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      this.showToast('List copied to clipboard');
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
  }

  async resetTasks() {
    const alert = await this.alertController.create({
      header: 'Reset List',
      message: 'Are you sure you want to reset the list?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Yes',
          handler: () => {
            this.tasks = [createEmptyTask()];
            this.emitListChange();
          },
        },
      ],
    });

    await alert.present();
  }

  cancelPaste() {
    this.pastedContent = '';
    this.modal.dismiss(null, 'cancel');
  }

  confirmPaste() {
    try {
      this.tasks = parseTasksString(this.pastedContent);
    } catch (e) {
      console.error('Failed to parse tasks:', e);
    }
    this.pastedContent = '';
    this.modal.dismiss();
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

  private emitListChange() {
    this.clearListChangeTimer();
    const combined = stringifyTasks(this.tasks);
    // Update the cached value so we don't re-parse when parent passes it back
    this._lastTasksString = combined;
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

  public flushPendingChanges(): void {
    if (this.listChangeTimer) {
      this.clearListChangeTimer();
      this.emitListChange();
    }
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
      const inputs = document.querySelectorAll('ion-input');
      if (inputs.length > focusIndex) {
        const inputToFocus = inputs[focusIndex] as HTMLIonInputElement;
        inputToFocus?.setFocus();
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
