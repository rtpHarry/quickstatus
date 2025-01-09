import { NgForOf } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {
  IonButton,
  IonIcon,
  IonItem,
  IonList,
  IonReorder,
  IonReorderGroup,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addCircleOutline, copyOutline } from 'ionicons/icons';
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
  @Input() tasks: { status: string; text: string }[] = [];
  @Output() listChange = new EventEmitter<string>();
  @Output() taskChange = new EventEmitter<{ status: string; text: string }>();

  constructor(private toastController: ToastController) {
    addIcons({ addCircleOutline, copyOutline });
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
