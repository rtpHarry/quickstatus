import { Component, OnInit } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TaskListComponent } from './ui/task-list/task-list.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, TaskListComponent],
})
export class HomePage implements OnInit {
  initialList: { status: string; text: string }[] = [];

  constructor() {}

  ngOnInit() {
    const savedList = localStorage.getItem('taskList');
    if (savedList) {
      this.initialList = JSON.parse(savedList);
    }
  }

  handleTaskChange(task: { status: string; text: string }) {
    const updatedList = [...this.initialList, task];
    localStorage.setItem('taskList', JSON.stringify(updatedList));
    this.initialList = updatedList;
  }
}
