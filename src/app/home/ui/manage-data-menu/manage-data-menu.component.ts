import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IonActionSheet, IonButton, IonIcon } from '@ionic/angular/standalone';
import { ActionSheetButton, OverlayEventDetail } from '@ionic/core/components';
import { addIcons } from 'ionicons';
import { optionsOutline } from 'ionicons/icons';

export type ManageDataAction = 'import' | 'export' | 'copy' | 'copy-private' | 'paste';

@Component({
  selector: 'app-manage-data-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonActionSheet, IonButton, IonIcon],
  templateUrl: './manage-data-menu.component.html',
  styleUrls: ['./manage-data-menu.component.scss'],
})
export class ManageDataMenuComponent {
  @Input() busy = false;
  @Input() hasProject = false;
  @Output() actionSelected = new EventEmitter<ManageDataAction>();

  isOpen = false;
  buttons: ActionSheetButton<ManageDataAction>[] = [];

  constructor() {
    addIcons({ optionsOutline });
  }

  open(): void {
    if (this.busy) {
      return;
    }

    this.buttons = [
      { text: 'Import Backup', data: 'import' },
      { text: 'Export Backup', data: 'export', disabled: !this.hasProject },
      { text: 'Copy List', data: 'copy', disabled: !this.hasProject },
      { text: 'Copy List Including Private', data: 'copy-private', disabled: !this.hasProject },
      { text: 'Paste List', data: 'paste', disabled: !this.hasProject },
      { text: 'Cancel', role: 'cancel' },
    ];
    this.isOpen = true;
  }

  onDismiss(event: CustomEvent<OverlayEventDetail<ManageDataAction>>): void {
    this.isOpen = false;
    const action = event.detail.data;

    if (event.detail.role !== 'cancel' && action && !this.busy) {
      this.actionSelected.emit(action);
    }
  }
}
