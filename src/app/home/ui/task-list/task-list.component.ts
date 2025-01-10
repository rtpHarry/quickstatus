import { NgForOf } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
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
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
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
    IonItemSliding,
    IonItemOption,
    IonItemOptions,
    TaskItemComponent,
    FormsModule,
  ],
})
export class TaskListComponent implements OnInit {
  @Input() set tasksString(value: string) {
    this.tasks = this.parseTasks(value);
  }
  @Output() listChange = new EventEmitter<string>();

  tasks: { status: string; text: string }[] = [];
  pastedContent = '';

  @ViewChild(IonModal) modal!: IonModal;

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

  ngOnInit() {}

  addTask() {
    this.tasks.push({ status: '❌', text: '' });
    this.emitListChange();
  }

  reorderTasks(event: any) {
    const itemMove = this.tasks.splice(event.detail.from, 1)[0];
    this.tasks.splice(event.detail.to, 0, itemMove);
    event.detail.complete();
    this.emitListChange();
  }

  onTaskChange(updatedTask: any, index: number) {
    this.tasks[index] = updatedTask;
    this.emitListChange();
  }

  deleteTask(index: number) {
    this.tasks.splice(index, 1);
    this.emitListChange();
  }

  async copyTasksToClipboard() {
    const combined = this.tasks.map((t) => `${t.status}  ${t.text}`).join('\n');
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(combined)
        .then(() => {
          this.showToast('List copied to clipboard');
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
            this.tasks = [{ status: '❌', text: '' }];
            this.emitListChange();
          },
        },
      ],
    });

    await alert.present();
  }

  cancelPaste() {
    this.modal.dismiss(null, 'cancel');
  }

  confirmPaste() {
    try {
      this.tasks = this.parseTasks(this.pastedContent);
    } catch (e) {
      console.error('Failed to parse tasks:', e);
    }
    this.modal.dismiss();
  }

  onWillDismiss(event: CustomEvent<OverlayEventDetail>) {
    if (event.detail.role === 'confirm') {
      this.emitListChange();
    }
  }

  private parseTasks(value: string): { status: string; text: string }[] {
    return value.split('\n').map((item) => {
      const [status, ...textParts] = item.split(/\s+/);
      return { status, text: textParts.join(' ') };
    });
  }

  private emitListChange() {
    const combined = this.tasks.map((t) => `${t.status} ${t.text}`).join('\n');
    this.listChange.emit(combined);
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
