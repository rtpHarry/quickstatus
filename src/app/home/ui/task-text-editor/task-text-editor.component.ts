import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Tagify, { TagifySettings } from '@yaireo/tagify';
import { TagifyComponent, TagifyService } from 'ngx-tagify';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProjectStorageService } from '../../data/project-storage.service';
import { normalizeTaskTag, normalizeTaskTags, taskTagPattern } from '../../data/task-tags';
import { fromTagifyText, leadingTaskTags, sortTaskTagsToStart, tagDelimiters, toTagifyText } from './task-tag-text';

@Component({
  selector: 'app-task-text-editor',
  standalone: true,
  imports: [FormsModule, NgIf, TagifyComponent],
  providers: [TagifyService],
  templateUrl: './task-text-editor.component.html',
  styleUrls: ['./task-text-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskTextEditorComponent implements AfterViewInit {
  @Input() set text(value: string) {
    if (value !== this.currentText) {
      this.currentText = value;
      this.editorValue = toTagifyText(value, this.storage.autocompleteTags);
    }
  }
  @Output() textChange = new EventEmitter<string>();
  @Output() editorKeydown = new EventEmitter<KeyboardEvent>();
  @ViewChild(TagifyComponent) private tagInput!: TagifyComponent;

  editorValue = '';
  tagSaveError = '';
  private currentText = '';
  private newTagShortcut?: { existing: HTMLElement; newTag: HTMLElement };
  private ready!: () => void;
  private readonly editorReady = new Promise<void>((resolve) => {
    this.ready = resolve;
  });

  readonly settings: TagifySettings = {
    mode: 'mix',
    // Match only the @ itself, at the start or after a space (including editor NBSPs).
    pattern: /(?<![^ \u00A0])@/,
    mixTagsInterpolator: tagDelimiters,
    whitelist: [],
    enforceWhitelist: false,
    validate: (tag) => taskTagPattern.test(tag.value) || 'Use letters, numbers, underscores or hyphens.',
    duplicates: true,
    transformTag: (tag) => {
      tag.value = normalizeTaskTag(tag.value);
    },
    editTags: false,
    backspace: true,
    placeholder: 'Enter task',
    dropdown: { enabled: 0, position: 'text', highlightFirst: true, sortby: 'startsWith', includeSelectedTags: true },
    templates: {
      dropdownItem: (item) => this.renderSuggestion(item.value),
    },
    callbacks: {
      'dropdown:show': () => this.highlightExistingSuggestion(),
      'dropdown:hide': () => {
        this.newTagShortcut = undefined;
      },
    },
    hooks: {
      suggestionClick: (_event, { tagify, tagData }) => {
        const value = tagData && normalizeTaskTag(tagData.value);
        if (value && tagify.value.some((tag) => normalizeTaskTag(tag.value) === value)) {
          this.dismissExistingTag(tagify);
          return Promise.reject();
        }
        return Promise.resolve();
      },
      beforeKeyDown: (event, { tagify }) => this.handleKeydown(event, tagify),
      beforePaste: (_event, { pastedText }) => Promise.resolve(pastedText.replace(/[\r\n]+/g, ' ')),
    },
  };

  constructor(
    private tagifyService: TagifyService,
    private storage: ProjectStorageService,
    private changeDetectorRef: ChangeDetectorRef
  ) {
    this.storage.autocompleteTags$.pipe(takeUntilDestroyed()).subscribe((tags) => {
      tags = normalizeTaskTags(tags);
      this.settings.whitelist = [...tags];
      const editor = this.tagifyService.get('task');
      if (!editor) {
        this.editorValue = toTagifyText(this.currentText, tags);
        return;
      }
      editor.whitelist = [...tags];
      const currentTags = new Set(editor.value.map((tag) => tag.value));
      const expectedTags = new Set(leadingTaskTags(this.currentText, tags).map((tag) => tag.value));
      if (currentTags.size === expectedTags.size && [...currentTags].every((tag) => expectedTags.has(tag))) {
        return;
      }
      this.editorValue = toTagifyText(this.currentText, tags);
      editor.dropdown.hide(true);
      editor.loadOriginalValues(this.editorValue);
      this.tagInput.value = editor.getMixedTagsAsString();
    });
  }

  ngAfterViewInit(): void {
    const editor = this.tagifyService.get('task');
    editor?.DOM.input.setAttribute('aria-label', 'Task text');
    editor?.DOM.input.setAttribute('aria-multiline', 'false');
    // Ionic's row elements finish their initial rendering after Angular's view hook.
    requestAnimationFrame(() => this.ready());
  }

  async focus(): Promise<void> {
    await this.editorReady;
    const input = this.tagifyService.get('task')?.DOM.input;
    if (input) {
      input.focus();
      const selection = window.getSelection();
      selection?.selectAllChildren(input);
      selection?.collapseToEnd();
      input.scrollLeft = input.scrollWidth;
    }
  }

  onEditorChange(value: string): void {
    this.editorValue = value;
    const text = fromTagifyText(value);
    if (text !== this.currentText) {
      this.currentText = text;
      this.textChange.emit(text);
    }
  }

  onTagAdded(): void {
    // Run after Tagify's queued insertion caret placement has finished.
    setTimeout(() => {
      const editor = this.tagifyService.get('task');
      if (!editor) {
        return;
      }
      const values = editor.value.map((tag) => tag.value);
      const known = this.storage.autocompleteTags;
      const additions = normalizeTaskTags(values).filter((value) => !known.includes(value));
      const text = sortTaskTagsToStart(editor.getMixedTagsAsString(), values);
      editor.loadOriginalValues(toTagifyText(text, [...known, ...additions]));
      // Report a view change through the wrapper so ngModel doesn't reload the DOM.
      this.tagInput.value = editor.getMixedTagsAsString();
      void this.focus();
      if (additions.length > 0) {
        this.tagSaveError = '';
        void this.storage.addAutocompleteTags(additions).catch(() => {
          this.tagSaveError = 'Tag added to task, but could not save it to autocomplete. Please try again.';
          this.changeDetectorRef.markForCheck();
        });
      }
    });
  }

  preventLineBreak(event: Event): void {
    if (event instanceof InputEvent && ['insertParagraph', 'insertLineBreak'].includes(event.inputType)) {
      event.preventDefault();
    }
  }

  private renderSuggestion(value: string): string {
    const normalized = normalizeTaskTag(value);
    const isNew = !normalizeTaskTags(this.storage.autocompleteTags).includes(normalized);
    const option = document.createElement('div');
    option.className = 'tagify__dropdown__item';
    option.setAttribute('value', value);
    option.setAttribute('role', 'option');
    option.tabIndex = 0;
    option.textContent = isNew ? 'NEW TAG: ' + normalized : normalized;
    if (isNew) {
      option.dataset['newTag'] = 'true';
    }
    return option.outerHTML;
  }

  private dismissExistingTag(editor: Tagify): void {
    // Tagify's mixed-mode replacement helper is missing from its published typings.
    const mixedEditor = editor as Tagify & {
      replaceTextWithNode(node: Node): void;
    };
    const replacement = document.createTextNode('');
    mixedEditor.replaceTextWithNode(replacement);
    editor.dropdown.hide(true);
    editor.DOM.input.focus();
    const selection = window.getSelection();
    selection?.collapse(replacement, 0);
    // Let Tagify refresh its mixed-mode state and report the cleared pending text.
    editor.DOM.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private highlightExistingSuggestion(): void {
    const editor = this.tagifyService.get('task');
    if (!editor) {
      return;
    }
    const options = Array.from(editor.DOM.dropdown.querySelectorAll<HTMLElement>('[role="option"]'));
    const existing = options.find((option) => !option.dataset['newTag']);
    const newTag = options.find((option) => option.dataset['newTag']);
    this.newTagShortcut = existing && newTag ? { existing, newTag } : undefined;
    if (existing) {
      this.highlightSuggestion(editor, existing);
    }
  }

  private highlightSuggestion(editor: Tagify, option: HTMLElement): void {
    // Tagify exposes this at runtime, but its published typings omit it.
    const dropdown = editor.dropdown as Tagify['dropdown'] & {
      highlightOption(element: HTMLElement, adjustScroll: boolean): void;
    };
    dropdown.highlightOption(option, false);
  }

  private handleKeydown(event: KeyboardEvent, tagify: Tagify): Promise<void> {
    // Tagify owns suggestion navigation and tag edits; the row owns list shortcuts.
    const editingTag = (event.target as HTMLElement).closest('.tagify__tag');
    // A closed dropdown still has a parent in Tagify's detached HTML document.
    const suggestionsOpen = document.body.contains(tagify.DOM.dropdown);
    if (!event.isComposing && suggestionsOpen && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      const shortcut = this.newTagShortcut;
      this.newTagShortcut = undefined;
      if (event.key === 'ArrowDown' && shortcut?.existing.getAttribute('aria-selected') === 'true') {
        event.preventDefault();
        event.stopPropagation();
        this.highlightSuggestion(tagify, shortcut.newTag);
        return Promise.reject();
      }
    }
    if (event.isComposing || editingTag || (suggestionsOpen && ['Enter', 'ArrowUp', 'ArrowDown', 'Escape', 'Tab'].includes(event.key))) {
      return Promise.resolve();
    }

    this.editorKeydown.emit(event);
    if (event.defaultPrevented) {
      // The dropdown also listens on window; don't run a row shortcut twice.
      event.stopPropagation();
      return Promise.reject();
    }
    return Promise.resolve();
  }
}
