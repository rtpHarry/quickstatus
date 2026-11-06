import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { settingsOutline } from 'ionicons/icons';
import { TagData, TagifySettings } from '@yaireo/tagify';
import { TagifyComponent, TagifyService } from 'ngx-tagify';
import { ProjectStorageService } from '../../data/project-storage.service';
import { taskTagPattern } from '../../data/task-tags';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  providers: [TagifyService],
  imports: [FormsModule, NgIf, TagifyComponent, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar],
})
export class SettingsComponent {
  @ViewChild(IonModal) modal?: IonModal;

  tags: TagData[] = [];
  saving = false;
  error = '';

  readonly tagSettings: TagifySettings = {
    delimiters: ',|\\n',
    pattern: taskTagPattern,
    editTags: false,
    backspace: true,
    duplicates: false,
    placeholder: 'Add a tag',
    dropdown: { enabled: false },
    transformTag: (tag) => {
      tag.value = tag.value.trim().replace(/^@/, '');
    },
  };

  constructor(
    private storage: ProjectStorageService,
    private tagifyService: TagifyService,
    private changeDetectorRef: ChangeDetectorRef
  ) {
    addIcons({ settingsOutline });
  }

  open(): void {
    this.tags = this.storage.autocompleteTags.sort((a, b) => a.localeCompare(b)).map((value) => ({ value }));
    this.error = '';
  }

  labelTagInput(): void {
    const input = this.tagifyService.get('autocomplete-tags')?.DOM.input;
    input?.setAttribute('aria-labelledby', 'autocomplete-tags-label');
    input?.setAttribute('aria-describedby', 'autocomplete-tags-help');
  }

  sortTags(): void {
    const editor = this.tagifyService.get('autocomplete-tags');
    if (!editor) {
      return;
    }
    const tags = editor.getTagElms().sort((a, b) => {
      return (a.getAttribute('value') ?? '').localeCompare(b.getAttribute('value') ?? '');
    });
    for (const tag of tags) {
      editor.DOM.scope.insertBefore(tag, editor.DOM.input);
    }
    editor.updateValueByDOMTags();
  }

  async save(): Promise<void> {
    if (this.saving) {
      return;
    }
    const editor = this.tagifyService.get('autocomplete-tags');
    const pending = editor?.DOM.input.textContent?.trim();
    if (pending) {
      editor?.addTags(pending);
      if (editor?.DOM.input.textContent?.trim()) {
        this.error = 'Use letters, numbers, underscores or hyphens for each tag.';
        return;
      }
    }
    this.saving = true;
    this.error = '';
    try {
      await this.storage.saveAutocompleteTags((editor?.value ?? this.tags).map((tag) => tag.value));
      await this.modal?.dismiss();
    } catch {
      this.error = 'Could not save settings. Please try again.';
    } finally {
      this.saving = false;
      this.changeDetectorRef.markForCheck();
    }
  }
}
