import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { TagifyService } from 'ngx-tagify';
import { TaskTextEditorComponent } from './task-text-editor.component';

describe('Task text tag editor', () => {
  let fixture: ComponentFixture<TaskTextEditorComponent>;
  let originalDisplay: string;

  beforeEach(() => {
    // Ionic hides the body until its app hydrates; this isolated fixture has no IonApp.
    originalDisplay = document.body.style.display;
    document.body.style.display = 'block';
    TestBed.configureTestingModule({ imports: [TaskTextEditorComponent] });
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

  it('loads known @ tags, preserving brackets, emails, repeated tags and literal HTML', fakeAsync(() => {
    const text = '@M @M Task [M] [[RTP]] a@M.com <b> & @RTP';
    fixture.componentRef.setInput('text', text);
    const changed = spyOn(fixture.componentInstance.textChange, 'emit');
    fixture.detectChanges();
    tick(100);
    expect(editor().getTagElms().length).toBe(3);
    expect(editor().DOM.input.querySelector('b')).toBeNull();
    expect(editor().DOM.input.textContent).toContain('<b> &');
    expect(changed).not.toHaveBeenCalled();
  }));

  it('saves inserted tags as @ text without moving tags or leaking Tagify JSON', fakeAsync(() => {
    fixture.componentRef.setInput('text', 'Work ');
    fixture.detectChanges();
    tick(100);
    const changed = spyOn(fixture.componentInstance.textChange, 'emit');
    typeText('Work @R');
    tick(200);
    editor().DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tick(200);
    expect(changed).toHaveBeenCalled();
    const text = changed.calls.mostRecent().args[0]!;
    expect(text).toContain('Work');
    expect(text).toContain('@RTP');
    expect(text.indexOf('@RTP')).toBeGreaterThan(text.indexOf('Work'));
    expect(text).not.toContain('"value"');
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    expect(editor().getTagElms().length).toBe(1);
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

  it('allows Backspace to enter tag editing without invoking row shortcuts', fakeAsync(() => {
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
    tagify.DOM.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    tick(100);
    const label = tag.querySelector<HTMLElement>('.tagify__tag-text')!;
    expect(label.isContentEditable).toBeTrue();
    const rowKey = spyOn(fixture.componentInstance.editorKeydown, 'emit');
    label.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    tick(100);
    expect(rowKey).not.toHaveBeenCalled();
  }));
});
