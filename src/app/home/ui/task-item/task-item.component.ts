import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Task, taskAgeInDays } from '../task-list/task-list.utils';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCol,
  IonGrid,
  IonIcon,
  IonInput,
  IonItem,
  IonRow,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { lockClosedOutline, lockOpenOutline, textOutline } from 'ionicons/icons';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    IonIcon,
    IonRow,
    IonItem,
    IonInput,
  ],
})
export class TaskItemComponent implements OnInit, OnDestroy {
  @Input() task!: Task;
  @Output() taskChange = new EventEmitter<Task>();
  private ageRefreshTimer?: ReturnType<typeof setInterval>;

  get ageBadge(): { text: string; label: string } | null {
    const days = taskAgeInDays(this.task.created);
    if (days === null) {
      return null;
    }

    if (days === 0) {
      return { text: 'today', label: 'today' };
    }

    return {
      text: String(days),
      label: `${days} ${days === 1 ? 'day' : 'days'}`,
    };
  }

  @Output() enterKey = new EventEmitter<void>();
  @Output() deleteKey = new EventEmitter<void>();
  @Output() upArrow = new EventEmitter<void>();
  @Output() downArrow = new EventEmitter<void>();

  constructor(private changeDetectorRef: ChangeDetectorRef) {
    addIcons({
      lockClosedOutline,
      lockOpenOutline,
      textOutline,
    });
  }

  ngOnInit() {
    this.ageRefreshTimer = setInterval(() => this.changeDetectorRef.markForCheck(), 60000);
  }

  ngOnDestroy() {
    clearInterval(this.ageRefreshTimer);
  }

  private updateTask(change: Partial<Task>) {
    this.task = { ...this.task, ...change };
    this.taskChange.emit(this.task);
  }

  onTextChange(text: string) {
    this.updateTask({ text });
  }

  selectStatus(status: string) {
    if (this.task.sectionHeading || this.task.status === status) {
      return;
    }
    this.updateTask({ status });
  }

  togglePrivate() {
    // Handle graceful upgrade for existing data without private field
    this.updateTask({ private: !(this.task.private ?? false) });
  }

  toggleSectionHeading() {
    this.updateTask({ sectionHeading: !(this.task.sectionHeading ?? false) });
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
    const key = event.key.toLowerCase();

    if (isCtrlPressed && key === 'p') {
      event.preventDefault();
      this.togglePrivate();
    } else if (isCtrlPressed && key === 'h') {
      event.preventDefault();
      this.toggleSectionHeading();
    } else if (isDeleteKey) {
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
