import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonHeader, IonInput, IonModal, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { Project } from '../../data/project-storage.types';

export interface ReplaceProjectRequest {
  projectId: string;
  name: string;
}

@Component({
  selector: 'app-replace-project-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonModal, IonTitle, IonToolbar],
  templateUrl: './replace-project-dialog.component.html',
  styleUrls: ['./replace-project-dialog.component.scss'],
})
export class ReplaceProjectDialogComponent {
  @Input() busy = false;
  @Input() error = '';
  @Output() confirmed = new EventEmitter<ReplaceProjectRequest>();
  @ViewChild(IonModal) modal?: IonModal;

  projectName = '';
  name = '';
  private projectId = '';

  constructor(private changeDetectorRef: ChangeDetectorRef) {}

  async open(project: Project, suggestedName: string): Promise<void> {
    this.projectId = project.id;
    this.projectName = project.name;
    this.name = suggestedName;
    this.changeDetectorRef.markForCheck();
    await this.modal?.present();
  }

  async close(): Promise<void> {
    await this.modal?.dismiss();
  }

  async cancel(): Promise<void> {
    if (!this.busy) {
      await this.close();
    }
  }

  submit(): void {
    const name = this.name.trim();
    if (this.busy || !name) {
      return;
    }

    this.confirmed.emit({ projectId: this.projectId, name });
  }
}
