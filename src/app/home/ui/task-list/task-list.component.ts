import { NgForOf } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import {
  IonButton,
  IonItem,
  IonList,
  IonReorder,
  IonReorderGroup,
} from '@ionic/angular/standalone';
import { TaskItemComponent } from '../task-item/task-item.component';

@Component({
  selector: 'app-task-list',
  templateUrl: './task-list.component.html',
  styleUrls: ['./task-list.component.scss'],
  standalone: true,
  imports: [
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
  @Output() listChange = new EventEmitter<string>();
  tasks = [{ status: '☑️', text: 'dns for sophie' }];

  constructor() {}

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

  private emitListChange() {
    const combined = this.tasks.map((t) => `${t.status}  ${t.text}`).join('\n');
    this.listChange.emit(combined);
  }
}
