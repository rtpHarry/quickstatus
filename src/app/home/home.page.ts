import { Component, OnInit } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  clipboardOutline,
  copyOutline,
  refreshOutline,
} from 'ionicons/icons';
import { KeyboardShortcutsComponent } from './ui/keyboard-shortcuts/keyboard-shortcuts.component';
import { TaskListComponent } from './ui/task-list/task-list.component';

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
    IonTitle,
    IonContent,
    IonFooter,
    TaskListComponent,
    KeyboardShortcutsComponent,
  ],
})
export class HomePage implements OnInit {
  initialCombinedList: string = '';

  constructor() {
    addIcons({
      addCircleOutline,
      copyOutline,
      clipboardOutline,
      refreshOutline,
    });
  }

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
