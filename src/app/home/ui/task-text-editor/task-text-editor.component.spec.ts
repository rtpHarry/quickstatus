import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { TagifyService } from 'ngx-tagify';
import { TaskTextEditorComponent } from './task-text-editor.component';
import { BehaviorSubject } from 'rxjs';
import { ProjectStorageService } from '../../data/project-storage.service';
import { fromTagifyText } from './task-tag-text';

describe('Task text tag editor', () => {
  let fixture: ComponentFixture<TaskTextEditorComponent>;
  let originalDisplay: string;
  let suggestions: BehaviorSubject<string[]>;
  let addSuggestions: jasmine.Spy;

  beforeEach(() => {
    // Ionic hides the body until its app hydrates; this isolated fixture has no IonApp.
    originalDisplay = document.body.style.display;
    document.body.style.display = 'block';
    suggestions = new BehaviorSubject(['M', 'RTP']);
    addSuggestions = jasmine.createSpy('addAutocompleteTags').and.callFake(async (tags: string[]) => {
      suggestions.next([...new Set([...suggestions.value, ...tags])]);
    });
    TestBed.configureTestingModule({
      imports: [TaskTextEditorComponent],
      providers: [{
        provide: ProjectStorageService,
        useValue: {
          autocompleteTags$: suggestions.asObservable(),
          addAutocompleteTags: addSuggestions,
          get autocompleteTags() {
            return suggestions.value;
          },
        },
      }],
    });
    fixture = TestBed.createComponent(TaskTextEditorComponent);
  });

  afterEach(() => {
    fixture.destroy();
    document.body.style.display = originalDisplay;
  });

  function editor() {
    return fixture.debugElement.injector.get(TagifyService).get('task')!;
  }

  function typeText(text: string): void {
    const input = editor().DOM.input;
    input.focus();
    input.textContent = text;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(input.firstChild!, text.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('accepts a new mixed-case inline tag, remembers it and keeps the caret ready for task text', fakeAsync(() => {
    fixture.detectChanges();
    tick(100);
    const changed = spyOn(fixture.componentInstance.textChange, 'emit');
    typeText('Work @neW-tag');
    tick(200);
    expect(editor().DOM.dropdown.textContent).toContain('NEW TAG: NEW-TAG');
    expect(addSuggestions).not.toHaveBeenCalled();
    const rowKey = spyOn(fixture.componentInstance.editorKeydown, 'emit');
    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(300);
    fixture.detectChanges();
    tick(100);

    expect(rowKey).not.toHaveBeenCalled();
    expect(editor().getTagElms().map((tag) => tag.getAttribute('value'))).toEqual(['NEW-TAG']);
    expect(addSuggestions).toHaveBeenCalledOnceWith(['NEW-TAG']);
    expect(suggestions.value).toContain('NEW-TAG');
    expect(changed.calls.mostRecent().args[0]).toBe('@NEW-TAG Work ');
    document.execCommand('insertText', false, 'next');
    tick(200);
    expect(changed.calls.mostRecent().args[0]).toBe('@NEW-TAG Work next');
  }));

  for (const text of ['matthew@rtp', 'Contact matthew@rtp', 'word@rtp', '(@rtp']) {
    it(`does not open tag suggestions inside ${text}`, fakeAsync(() => {
      fixture.detectChanges();
      tick(100);
      typeText(text);
      tick(200);
      expect(document.body.contains(editor().DOM.dropdown)).toBeFalse();
      expect(editor().value).toEqual([]);
      expect(editor().DOM.input.textContent).toBe(text);
      expect(addSuggestions).not.toHaveBeenCalled();
    }));
  }

  for (const text of ['@rt', 'Work @rt', 'Work\u00A0@rt']) {
    it(`opens tag suggestions at a valid boundary in ${text}`, fakeAsync(() => {
      fixture.detectChanges();
      tick(100);
      typeText(text);
      tick(200);
      expect(document.body.contains(editor().DOM.dropdown)).toBeTrue();
      expect(editor().DOM.dropdown.textContent).toContain('RTP');
      editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      tick(300);
      expect(editor().value.map((tag) => tag.value)).toEqual(['RTP']);
    }));
  }

  it('creates the first tag when autocomplete is empty', fakeAsync(() => {
    suggestions.next([]);
    fixture.detectChanges();
    tick(100);
    typeText('@first');
    tick(200);
    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(300);
    expect(editor().value.map((tag) => tag.value)).toEqual(['FIRST']);
    expect(addSuggestions).toHaveBeenCalledOnceWith(['FIRST']);
  }));

  it('previews a new uppercase tag first but highlights the closest existing match for Enter', fakeAsync(() => {
    suggestions.next(['ASO', 'SOKA']);
    fixture.detectChanges();
    tick(100);
    typeText('@so');
    tick(200);
    const options = Array.from(editor().DOM.dropdown.querySelectorAll('[role="option"]'));
    expect(options.map((option) => option.textContent)).toEqual(['NEW TAG: SO', 'SOKA', 'ASO']);
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(300);
    expect(editor().value.map((tag) => tag.value)).toEqual(['SOKA']);
    expect(addSuggestions).not.toHaveBeenCalled();
  }));

  it('selects the new-tag preview with Down then Enter even when several existing tags match', fakeAsync(() => {
    suggestions.next(['ASO', 'SOKA']);
    fixture.detectChanges();
    tick(100);
    typeText('@so');
    tick(200);
    const input = editor().DOM.input;
    const rowKey = spyOn(fixture.componentInstance.editorKeydown, 'emit');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    tick(100);
    expect(editor().DOM.dropdown.querySelector('[aria-selected="true"]')?.textContent).toBe('NEW TAG: SO');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(300);
    expect(editor().value.map((tag) => tag.value)).toEqual(['SO']);
    expect(addSuggestions).toHaveBeenCalledOnceWith(['SO']);
    expect(rowKey).not.toHaveBeenCalled();
  }));

  it('keeps matching saved suggestions and avoids remembering a casing duplicate', fakeAsync(() => {
    fixture.detectChanges();
    tick(100);
    typeText('@rt');
    tick(200);
    expect(editor().DOM.dropdown.textContent).toContain('RTP');
    typeText('@rtp');
    tick(200);
    expect(editor().DOM.dropdown.textContent).not.toContain('NEW TAG:');
    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(300);
    expect(editor().value.map((tag) => tag.value)).toEqual(['RTP']);
    expect(addSuggestions).not.toHaveBeenCalled();
  }));

  it('keeps a new tag on its task and reports an autocomplete save failure', fakeAsync(() => {
    addSuggestions.and.rejectWith(new Error('Storage unavailable'));
    fixture.detectChanges();
    tick(100);
    typeText('@new');
    tick(200);
    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(300);
    fixture.detectChanges();
    expect(editor().value.map((tag) => tag.value)).toEqual(['NEW']);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('could not save');
  }));

  for (const pending of ['@', '@so']) {
    for (const method of ['keyboard', 'mouse']) {
      it(`dismisses an existing tag selected by ${method} after typing ${pending}`, fakeAsync(() => {
        suggestions.next(['SO', 'RTP']);
        fixture.componentRef.setInput('text', '@SO Work ');
        fixture.detectChanges();
        tick(100);
        const tagify = editor();
        const input = tagify.DOM.input;
        input.focus();
        const selection = window.getSelection()!;
        selection.selectAllChildren(input);
        selection.collapseToEnd();
        document.execCommand('insertText', false, pending);
        tick(200);

        const option = tagify.DOM.dropdown.querySelector<HTMLElement>('[value="SO"]')!;
        expect(option).not.toBeNull();
        if (pending === '@') {
          expect(tagify.DOM.dropdown.textContent).toContain('RTP');
        }
        if (method === 'keyboard') {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        } else {
          option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        }
        tick(300);

        expect(tagify.value.map((tag) => tag.value)).toEqual(['SO']);
        expect(document.body.contains(tagify.DOM.dropdown)).toBeFalse();
        expect(fromTagifyText(fixture.componentInstance.editorValue)).toBe('@SO Work ');
        expect(addSuggestions).not.toHaveBeenCalled();
        document.execCommand('insertText', false, 'next');
        tick(200);
        expect(input.textContent).toContain('Work next');
      }));
    }
  }

  it('refreshes dynamic suggestions and renders removed tags as plain text without changing the task', fakeAsync(() => {
    suggestions.next(['Client', 'personal']);
    fixture.componentRef.setInput('text', '@PERSONAL @CLIENT Work');
    fixture.detectChanges();
    tick(100);
    expect(editor().getTagElms().map((tag) => tag.getAttribute('value'))).toEqual(['PERSONAL', 'CLIENT']);
    const changed = spyOn(fixture.componentInstance.textChange, 'emit');

    suggestions.next(['personal']);
    fixture.detectChanges();
    tick(200);
    expect(editor().whitelist).toEqual(['PERSONAL']);
    expect(editor().getTagElms().map((tag) => tag.getAttribute('value'))).toEqual(['PERSONAL']);
    expect(editor().DOM.input.textContent).toContain('@CLIENT Work');
    expect(changed).not.toHaveBeenCalled();
  }));

  it('deduplicates leading tags on load, preserving brackets, emails, inline tags and literal HTML', fakeAsync(() => {
    const text = '@M @M Task [M] [[RTP]] a@M.com <b> & @RTP';
    fixture.componentRef.setInput('text', text);
    const changed = spyOn(fixture.componentInstance.textChange, 'emit');
    fixture.detectChanges();
    tick(100);
    expect(editor().getTagElms().map((tag) => tag.getAttribute('value'))).toEqual(['M']);
    expect(editor().DOM.input.textContent).toContain('Task [M] [[RTP]] a@M.com <b> & @RTP');
    expect(editor().DOM.input.querySelector('b')).toBeNull();
    expect(editor().DOM.input.textContent).toContain('<b> &');
    expect(changed).toHaveBeenCalledWith('@M Task [M] [[RTP]] a@M.com <b> & @RTP');
  }));

  it('keeps an escaped inline mention as text after reload and suggestion refresh', fakeAsync(() => {
    suggestions.next(['MATTHEW', 'RTP']);
    fixture.detectChanges();
    tick(100);
    typeText('lets check out @matthew');
    tick(200);
    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    tick(100);
    expect(document.body.contains(editor().DOM.dropdown)).toBeFalse();
    document.execCommand('insertText', false, ' and things');
    tick(200);
    const text = fromTagifyText(fixture.componentInstance.editorValue);
    expect(text).toBe('lets check out @matthew and things');

    fixture.destroy();
    fixture = TestBed.createComponent(TaskTextEditorComponent);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    tick(100);
    expect(editor().getTagElms().length).toBe(0);
    expect(editor().DOM.input.textContent).toBe(text);
    suggestions.next(['MATTHEW', 'RTP', 'OTHER']);
    fixture.detectChanges();
    tick(200);
    expect(editor().getTagElms().length).toBe(0);
    expect(editor().DOM.input.textContent).toBe(text);
  }));

  it('moves the caret to the end on each programmatic focus', async () => {
    fixture.componentRef.setInput('text', '@M @RTP Work');
    fixture.detectChanges();
    await fixture.componentInstance.focus();
    expect(editor().getTagElms().length).toBe(2);
    const input = editor().DOM.input;
    input.focus();
    const selection = window.getSelection()!;
    selection.collapse(input, 0);

    await fixture.componentInstance.focus();
    const beforeCaret = document.createRange();
    beforeCaret.selectNodeContents(input);
    beforeCaret.setEnd(selection.anchorNode!, selection.anchorOffset);
    expect(beforeCaret.toString()).toBe(input.textContent ?? '');
    expect(selection.isCollapsed).toBeTrue();

    // Revisiting a row also overrides a selection the browser remembered.
    selection.collapse(input, 0);
    await fixture.componentInstance.focus();
    expect(selection.anchorNode).toBe(input);
    expect(selection.anchorOffset).toBe(input.childNodes.length);
  });

  it('moves an accepted tag to the start and saves readable @ text', fakeAsync(() => {
    fixture.componentRef.setInput('text', 'Work ');
    fixture.detectChanges();
    tick(100);
    const changed = spyOn(fixture.componentInstance.textChange, 'emit');
    typeText('Work @RTP');
    tick(200);
    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(200);
    expect(changed).toHaveBeenCalled();
    const text = changed.calls.mostRecent().args[0]!;
    expect(text).toContain('Work');
    expect(text).toContain('@RTP');
    expect(text.trim()).toBe('@RTP Work');
    expect(text).not.toContain('"value"');
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    expect(editor().getTagElms().length).toBe(1);
  }));

  it('sorts all accepted tags at the start and leaves the focused caret at the end', fakeAsync(() => {
    fixture.componentRef.setInput('text', '@RTP Work details [M] a@M.com <b>');
    fixture.detectChanges();
    tick(100);
    const tagify = editor();
    const input = tagify.DOM.input;
    input.focus();
    const range = document.createRange();
    const description = Array.from(input.childNodes).find((node) => node.textContent?.includes('Work details'))!;
    range.setStart(description, description.textContent!.indexOf('details'));
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const changed = spyOn(fixture.componentInstance.textChange, 'emit');
    document.execCommand('insertText', false, '@M');
    tick(200);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(200);

    fixture.componentRef.setInput('text', changed.calls.mostRecent().args[0]);
    fixture.detectChanges();
    tick(200);
    const text = changed.calls.mostRecent().args[0]!;
    expect(text).toBe('@M @RTP Work details [M] a@M.com <b> ');
    expect(tagify.getTagElms().map((tag) => tag.getAttribute('value'))).toEqual(['M', 'RTP']);
    expect(input.querySelector('b')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(selection.isCollapsed).toBeTrue();
    expect(selection.anchorNode).toBe(input);
    expect(selection.anchorOffset).toBe(input.childNodes.length);
    document.execCommand('insertText', false, 'next');
    tick(200);
    expect(changed.calls.mostRecent().args[0]).toBe(text + 'next');
  }));

  it('leaves a space for typing after accepting a tag in an empty row', fakeAsync(() => {
    fixture.detectChanges();
    tick(100);
    const changed = spyOn(fixture.componentInstance.textChange, 'emit');
    typeText('@RTP');
    tick(200);
    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(200);
    fixture.detectChanges();
    tick(100);
    document.execCommand('insertText', false, 'Task');
    tick(200);
    expect(changed.calls.mostRecent().args[0]).toBe('@RTP Task');
  }));

  it('offers the two suggestions after @ and leaves navigation to the dropdown', fakeAsync(() => {
    fixture.detectChanges();
    tick(100);
    const tagify = editor();
    const input = tagify.DOM.input;
    typeText('Work @');
    tick(200);
    expect(tagify.DOM.dropdown.textContent).toContain('RTP');
    expect(tagify.DOM.dropdown.textContent).toContain('M');
    const dropdownContent = tagify.DOM.dropdown.querySelector('.tagify__dropdown__wrapper')!;
    expect(getComputedStyle(dropdownContent).backgroundColor).toBe('rgb(255, 255, 255)');
    const rowKey = spyOn(fixture.componentInstance.editorKeydown, 'emit');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    tick(100);
    expect(rowKey).not.toHaveBeenCalled();
  }));

  it('lets the row consume Enter when suggestions are closed, without inserting a newline', fakeAsync(() => {
    fixture.componentRef.setInput('text', 'Work');
    fixture.detectChanges();
    tick(100);
    editor().dropdown.hide(true);
    fixture.componentInstance.editorKeydown.subscribe((event) => event.preventDefault());
    const input = editor().DOM.input;
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    tick(100);
    expect(event.defaultPrevented).toBeTrue();
    expect(input.textContent).toBe('Work');
  }));

  it('runs a row shortcut once while the suggestions dropdown is open', fakeAsync(() => {
    fixture.detectChanges();
    tick(100);
    typeText('Work @');
    tick(200);
    const rowKey = spyOn(fixture.componentInstance.editorKeydown, 'emit').and.callFake((event) => event!.preventDefault());
    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }));
    tick(100);
    expect(rowKey).toHaveBeenCalledTimes(1);
  }));

  it('blocks browser line-break input and flattens multiline paste', fakeAsync(() => {
    fixture.detectChanges();
    tick(100);
    for (const inputType of ['insertParagraph', 'insertLineBreak']) {
      const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
      editor().DOM.input.dispatchEvent(event);
      expect(event.defaultPrevented).toBeTrue();
    }
    typeText('Work ');
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'first\nsecond');
    editor().DOM.input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    tick(200);
    expect(editor().DOM.input.textContent).toContain('first second');
    expect(editor().DOM.input.getAttribute('aria-multiline')).toBe('false');
  }));

  it('keeps accepted tags non-editable on click and double-click', fakeAsync(() => {
    fixture.componentRef.setInput('text', '@M Work');
    fixture.detectChanges();
    tick(100);
    const tagify = editor();
    const label = tagify.getTagElms()[0].querySelector<HTMLElement>('.tagify__tag-text')!;
    for (const type of ['click', 'dblclick']) {
      label.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      tick(100);
      expect(label.isContentEditable).toBeFalse();
    }
    expect(tagify.getTagElms().length).toBe(1);
  }));

  it('deletes an accepted tag on Backspace instead of editing it', fakeAsync(() => {
    fixture.componentRef.setInput('text', '@M Work');
    fixture.detectChanges();
    tick(100);
    const tagify = editor();
    const tag = tagify.getTagElms()[0];
    tagify.DOM.input.focus();
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(tag.nextSibling!, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    tagify.DOM.input.dispatchEvent(backspace);
    tick(100);
    // Synthetic key events do not perform the browser's default deletion.
    if (!backspace.defaultPrevented) {
      document.execCommand('delete');
    }
    tick(200);
    expect(tagify.getTagElms().length).toBe(0);
    expect(tagify.DOM.input.textContent).toContain('Work');
    expect(tagify.DOM.input.querySelector('.tagify__tag--editable')).toBeNull();
  }));
});
