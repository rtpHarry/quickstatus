import { AfterViewInit, ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Tagify, { TagifySettings } from '@yaireo/tagify';
import { TagifyComponent, TagifyService } from 'ngx-tagify';
import { fromTagifyText, tagDelimiters, taskTagSuggestions, toTagifyText } from './task-tag-text';

@Component({
  selector: 'app-task-text-editor',
  standalone: true,
  imports: [FormsModule, TagifyComponent],
  providers: [TagifyService],
  templateUrl: './task-text-editor.component.html',
  styleUrls: ['./task-text-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskTextEditorComponent implements AfterViewInit {
  @Input() set text(value: string) {
    if (value !== this.currentText) {
      this.currentText = value;
      this.editorValue = toTagifyText(value);
    }
  }
  @Output() textChange = new EventEmitter<string>();
  @Output() editorKeydown = new EventEmitter<KeyboardEvent>();

  editorValue = '';
  private currentText = '';
  private ready!: () => void;
  private readonly editorReady = new Promise<void>((resolve) => {
    this.ready = resolve;
  });

  readonly settings: TagifySettings = {
    mode: 'mix',
    pattern: /@/,
    mixTagsInterpolator: tagDelimiters,
    whitelist: [...taskTagSuggestions],
    enforceWhitelist: true,
    duplicates: true,
    editTags: 1,
    backspace: 'edit',
    placeholder: 'Enter task',
    dropdown: { enabled: 0, position: 'text', highlightFirst: true },
    hooks: {
      beforeKeyDown: (event, { tagify }) => this.handleKeydown(event, tagify),
      beforePaste: (_event, { pastedText }) => Promise.resolve(pastedText.replace(/[\r\n]+/g, ' ')),
    },
  };

  constructor(private tagifyService: TagifyService) {}

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

  preventLineBreak(event: Event): void {
    if (event instanceof InputEvent && ['insertParagraph', 'insertLineBreak'].includes(event.inputType)) {
      event.preventDefault();
    }
  }

  private handleKeydown(event: KeyboardEvent, tagify: Tagify): Promise<void> {
    // Tagify owns suggestion navigation and tag edits; the row owns list shortcuts.
    const editingTag = (event.target as HTMLElement).closest('.tagify__tag');
    // A closed dropdown still has a parent in Tagify's detached HTML document.
    const suggestionsOpen = document.body.contains(tagify.DOM.dropdown);
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
