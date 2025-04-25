import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonModal,
  IonRow,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { helpCircleOutline } from 'ionicons/icons';

@Component({
  selector: 'app-keyboard-shortcuts',
  templateUrl: './keyboard-shortcuts.component.html',
  styleUrls: ['./keyboard-shortcuts.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButtons,
    IonTitle,
    IonToolbar,
    IonHeader,
    IonGrid,
    IonRow,
    IonCol,
    IonModal,
    IonButton,
    IonIcon,
  ],
})
export class KeyboardShortcutsComponent implements OnInit {
  @ViewChild(IonModal) modal!: IonModal;

  constructor() {
    addIcons({
      helpCircleOutline,
    });
  }

  ngOnInit() {}

  dismissModal() {
    this.modal.dismiss();
  }
}
