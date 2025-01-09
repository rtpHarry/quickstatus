import { NgForOf } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonIcon,
  IonItem,
  IonList,
  IonReorder,
  IonReorderGroup,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addCircleOutline, copyOutline, refreshOutline } from 'ionicons/icons';
import { TaskItemComponent } from '../task-item/task-item.component';

@Component({
  selector: 'app-task-list',
  templateUrl: './task-list.component.html',
  styleUrls: ['./task-list.component.scss'],
  standalone: true,
  imports: [
    IonIcon,
    NgForOf,
    IonReorder,
    IonList,
    IonReorderGroup,
    IonItem,
    IonButton,
    TaskItemComponent,
  ],
})
export class TaskListComponent implements OnInit {
  @Input() set tasksString(value: string) {
    this.tasks = value.split('\n').map((item) => {
      const [status, ...textParts] = item.split('  ');
      return { status, text: textParts.join(' ') };
    });
  }
  @Output() listChange = new EventEmitter<string>();

  tasks: { status: string; text: string }[] = [];

  constructor(
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    addIcons({ addCircleOutline, copyOutline, refreshOutline });
  }

  ngOnInit() {}

  addTask() {
    this.tasks.push({ status: '☑️', text: '' });
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
            this.tasks = [{ status: '☑️', text: '' }];
            this.emitListChange();
          },
        },
      ],
    });

    await alert.present();
  }

  private emitListChange() {
    const combined = this.tasks.map((t) => `${t.status}  ${t.text}`).join('\n');
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
