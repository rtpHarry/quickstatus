import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCol,
  IonGrid,
  IonInput,
  IonItem,
  IonRow,
  IonSegment,
  IonSegmentButton,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-task-item',
  templateUrl: './task-item.component.html',
  styleUrls: ['./task-item.component.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonCol,
    CommonModule,
    FormsModule,
    IonGrid,
    IonRow,
    IonItem,
    IonSegment,
    IonSegmentButton,
    IonInput,
  ],
})
export class TaskItemComponent implements OnInit {
  @Input() task!: { status: string; text: string; private?: boolean };
  @Output() taskChange = new EventEmitter<{
    status: string;
    text: string;
    private?: boolean;
  }>();
  @Output() enterKey = new EventEmitter<void>();
  @Output() deleteKey = new EventEmitter<void>();
  @Output() upArrow = new EventEmitter<void>();
  @Output() downArrow = new EventEmitter<void>();

  constructor() {}

  ngOnInit() {}

  emitChange() {
    this.taskChange.emit(this.task);
  }

  onInputChange() {
    this.emitChange();
  }

  togglePrivate() {
    // Handle graceful upgrade for existing data without private field
    this.task.private = !(this.task.private ?? false);
    this.emitChange();
  }

  emitEnterKey() {
    this.enterKey.emit();
  }

  emitDeleteKey() {
    this.deleteKey.emit();
  }

  handleKeydown(event: KeyboardEvent) {
    const isDeleteKey = event.key === 'Backspace' || event.key === 'Delete';
    const isCtrlPressed = event.ctrlKey;
    const isEmpty = !this.task.text || this.task.text.trim() === '';

    if (isDeleteKey) {
      if (isCtrlPressed) {
        // Existing functionality: delete with Ctrl+Backspace/Delete
        event.preventDefault();
        this.emitDeleteKey();
      } else if (isEmpty) {
        // New functionality: delete empty item with Backspace/Delete
        event.preventDefault();
        this.emitDeleteKey();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.upArrow.emit();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.downArrow.emit();
    }
  }
}
