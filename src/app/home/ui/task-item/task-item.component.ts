import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { Task, taskAgeInDays } from '../task-list/task-list.utils';
import { TaskTextEditorComponent } from '../task-text-editor/task-text-editor.component';
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
    TaskTextEditorComponent,
    FormsModule,
    IonInput,
    IonGrid,
    IonIcon,
    IonRow,
    IonItem,
  ],
})
export class TaskItemComponent implements OnInit, OnDestroy {
  @Input() task!: Task;
  @Input() completedOn?: string;
  @Output() taskChange = new EventEmitter<Task>();
  @ViewChild(TaskTextEditorComponent) input?: TaskTextEditorComponent;
  @ViewChild(IonInput) headingInput?: IonInput;
  @ViewChild('moveHighlight') moveHighlight?: ElementRef<HTMLElement>;
  private moveAnimation?: Animation;
  private ageRefreshTimer?: ReturnType<typeof setInterval>;

  get ageBadge(): { text: string; label: string } | null {
    if (this.task.sectionHeading === true) {
      return null;
    }

    const completed = this.task.status === '✅';
    if (completed && !this.completedOn) {
      return null;
    }
    const referenceDate = completed ? new Date(`${this.completedOn}T12:00:00`) : new Date();
    if (!Number.isFinite(referenceDate.getTime())) {
      return null;
    }
    const days = taskAgeInDays(this.task.created, referenceDate);
    if (days === null) {
      return null;
    }

    if (days === 0) {
      if (completed) {
        return { text: '0', label: 'Completed the same day' };
      }
      return { text: 'today', label: 'today' };
    }

    return {
      text: String(days),
      label: `${completed ? 'Completed in ' : ''}${days} ${days === 1 ? 'day' : 'days'}`,
    };
  }

  @Output() enterKey = new EventEmitter<void>();
  @Output() deleteKey = new EventEmitter<void>();
  @Output() upArrow = new EventEmitter<void>();
  @Output() downArrow = new EventEmitter<void>();
  @Output() moveRow = new EventEmitter<-1 | 1>();

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
    this.moveAnimation?.cancel();
  }

  flashMove(): void {
    this.moveAnimation?.cancel();
    this.moveAnimation = this.moveHighlight?.nativeElement.animate(
      [{ opacity: 0.16 }, { opacity: 0 }],
      { duration: 800, easing: 'ease-out' }
    );
  }

  async focusInput(): Promise<void> {
    if (this.headingInput) {
      const input = await this.headingInput.getInputElement();
      await this.headingInput.setFocus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.scrollLeft = input.scrollWidth;
    } else {
      await this.input?.focus();
    }
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
    // The editor type changes, so render its replacement before restoring focus.
    this.changeDetectorRef.detectChanges();
    void this.focusInput();
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

    if (event.metaKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.moveRow.emit(event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.emitEnterKey();
    } else if (isCtrlPressed && key === 'p') {
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
