import { Component, OnInit } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { KeyboardShortcutsComponent } from './ui/keyboard-shortcuts/keyboard-shortcuts.component';
import { TaskListComponent } from './ui/task-list/task-list.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    TaskListComponent,
    KeyboardShortcutsComponent,
  ],
})
export class HomePage implements OnInit {
  initialCombinedList: string = '';

  constructor() {}

  ngOnInit() {
    const savedList = localStorage.getItem('taskList');
    if (savedList) {
      this.initialCombinedList = savedList;
    }
  }

  handleTaskListChange(combinedList: string) {
    console.log('Task list changed:', combinedList);
    localStorage.setItem('taskList', combinedList);
  }
}
