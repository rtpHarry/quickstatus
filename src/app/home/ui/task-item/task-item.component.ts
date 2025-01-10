import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
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
  @Input() task!: { status: string; text: string };
  @Output() taskChange = new EventEmitter<{ status: string; text: string }>();
  @Output() enterKey = new EventEmitter<void>();

  constructor() {}

  ngOnInit() {}

  emitChange() {
    this.taskChange.emit(this.task);
  }

  onInputChange() {
    this.emitChange();
  }

  emitEnterKey() {
    this.enterKey.emit();
  }
}
