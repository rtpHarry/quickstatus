import { TaskItemComponent } from './task-item.component';
import { fakeAsync, TestBed, tick, discardPeriodicTasks } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProjectStorageService } from '../../data/project-storage.service';

describe('Task age badge', () => {
  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 10, 6, 12));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('freezes completed age, resumes on reopening, and uses the next completion date', () => {
    const row = new TaskItemComponent({} as never);
    row.task = { status: '✅', text: 'Work', created: '2026/11/01' };
    row.completedOn = '2026-11-03';
    expect(row.ageBadge).toEqual({ text: '2', label: 'Completed in 2 days' });
    jasmine.clock().mockDate(new Date(2026, 10, 10, 12));
    expect(row.ageBadge?.text).toBe('2');
    row.task = { ...row.task, status: '☑️' };
    expect(row.ageBadge).toEqual({ text: '9', label: '9 days' });
    row.task = { ...row.task, status: '✅' };
    row.completedOn = '2026-11-10';
    expect(row.ageBadge).toEqual({ text: '9', label: 'Completed in 9 days' });
  });

  it('hides completed badges with unknown completion or creation dates', () => {
    const row = new TaskItemComponent({} as never);
    row.task = { status: '✅', text: 'Old task', created: '2026/11/01' };
    expect(row.ageBadge).toBeNull();
    row.completedOn = '2026-11-03';
    row.task = { ...row.task, created: undefined };
    expect(row.ageBadge).toBeNull();
  });

  it('distinguishes same-day completion from an active task created today', () => {
    const row = new TaskItemComponent({} as never);
    row.task = { status: '❌', text: 'Work', created: '2026/11/06' };
    expect(row.ageBadge).toEqual({ text: 'today', label: 'today' });
    row.task = { ...row.task, status: '✅' };
    row.completedOn = '2026-11-06';
    expect(row.ageBadge).toEqual({ text: '0', label: 'Completed the same day' });
  });
});

describe('Task item editor shortcuts', () => {
  it('delegates row focus to the editor', async () => {
    const component = new TaskItemComponent({} as never);
    const focus = jasmine.createSpy('focus').and.resolveTo();
    component.input = { focus } as never;
    await component.focusInput();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('places the caret at the end when focusing a heading', async () => {
    const component = new TaskItemComponent({} as never);
    const input = document.createElement('input');
    input.value = 'Heading';
    input.setSelectionRange(0, 0);
    component.headingInput = {
      getInputElement: async () => input,
      setFocus: async () => input.focus(),
    } as never;
    await component.focusInput();
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('prevents a newline when Enter creates a task', () => {
    const component = new TaskItemComponent({} as never);
    component.task = { text: 'Work', status: '❌' };
    const enter = spyOn(component.enterKey, 'emit');
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    component.handleKeydown(event);
    expect(event.defaultPrevented).toBeTrue();
    expect(enter).toHaveBeenCalledTimes(1);
  });
});

describe('Task row rendered editor', () => {
  let originalDisplay: string;

  beforeEach(() => {
    originalDisplay = document.body.style.display;
    document.body.style.display = 'block';
  });

  afterEach(() => {
    document.body.style.display = originalDisplay;
  });

  function createFixture(sectionHeading = false) {
    TestBed.configureTestingModule({
      imports: [TaskItemComponent],
      providers: [{
        provide: ProjectStorageService,
        useValue: { autocompleteTags: ['M', 'RTP'], autocompleteTags$: of(['M', 'RTP']) },
      }],
    });
    const fixture = TestBed.createComponent(TaskItemComponent);
    fixture.componentRef.setInput('task', { text: '@M Work', status: '❌', sectionHeading });
    fixture.detectChanges();
    return fixture;
  }

  function render(sectionHeading = false) {
    const fixture = createFixture(sectionHeading);
    tick(100);
    return fixture;
  }

  it('routes Enter and vertical arrows from the actual editor to the task row', fakeAsync(() => {
    const fixture = render();
    const row = fixture.componentInstance;
    const enter = spyOn(row.enterKey, 'emit');
    const up = spyOn(row.upArrow, 'emit');
    const down = spyOn(row.downArrow, 'emit');
    const input = fixture.nativeElement.querySelector('.tagify__input') as HTMLElement;
    input.focus();
    for (const key of ['Enter', 'ArrowUp', 'ArrowDown']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).withContext(key).toBeTrue();
      tick(100);
    }
    expect(enter).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
    expect(down).toHaveBeenCalledTimes(1);
    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('keeps the editor within a single compact line', fakeAsync(() => {
    const fixture = render();
    const editor = fixture.nativeElement.querySelector('app-task-text-editor') as HTMLElement;
    expect(editor.getBoundingClientRect().height).toBeLessThanOrEqual(44);
    const input = editor.querySelector('.tagify__input')!;
    expect(getComputedStyle(input).whiteSpace).toBe('pre');
    expect(getComputedStyle(input).lineHeight).toBe('28px');
    const label = editor.querySelector('.tagify__tag-text')!;
    expect(getComputedStyle(label).color).toBe('rgb(54, 91, 140)');
    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('uses an ordinary input for section headings', fakeAsync(() => {
    const fixture = render(true);
    expect(fixture.nativeElement.querySelector('app-task-text-editor')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-input')).not.toBeNull();
    expect(fixture.componentInstance.task.sectionHeading).toBeTrue();
    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('keeps long task text within the available width beside the row buttons', async () => {
    const fixture = createFixture();
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    // Wait for Ionic's real hydration before measuring the rendered grid.
    await Promise.all(Array.from(host.querySelectorAll('*')).map((element) => {
      const ionicElement = element as HTMLElement & { componentOnReady?: () => Promise<unknown> };
      return ionicElement.componentOnReady?.();
    }));
    const input = host.querySelector<HTMLElement>('.tagify__input')!;
    const actions = host.querySelector<HTMLElement>('.task-actions')!;
    const status = host.querySelector<HTMLElement>('.status-buttons')!;
    const column = host.querySelector<HTMLElement>('.task-text-column')!;

    for (const width of [600, 1000]) {
      host.style.width = `${width}px`;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const originalWidth = column.getBoundingClientRect().width;
      for (const text of ['Long task description '.repeat(100), 'x'.repeat(2000)]) {
        fixture.componentRef.setInput('task', { text, status: '❌' });
        fixture.detectChanges();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const editorBounds = input.getBoundingClientRect();
        const actionsBounds = actions.getBoundingClientRect();
        const statusBounds = status.getBoundingClientRect();
        expect(editorBounds.width).toBeGreaterThan(0);
        expect(column.getBoundingClientRect().width).toBeCloseTo(originalWidth, 0);
        expect(editorBounds.right).toBeLessThanOrEqual(actionsBounds.left);
        expect(actionsBounds.right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
        expect(actionsBounds.top).toBeLessThan(statusBounds.bottom);
        expect(input.scrollWidth).toBeGreaterThan(input.clientWidth);
        expect(editorBounds.height).toBeLessThanOrEqual(44);
      }
    }

    fixture.destroy();
  });

  it('retains keyboard focus when switching to a heading and back', async () => {
    TestBed.configureTestingModule({ imports: [TaskItemComponent] });
    const fixture = TestBed.createComponent(TaskItemComponent);
    fixture.componentRef.setInput('task', { text: 'Work @M', status: '❌' });
    fixture.detectChanges();
    const focus = spyOn(fixture.componentInstance, 'focusInput').and.callThrough();
    const editor = fixture.nativeElement.querySelector('.tagify__input') as HTMLElement;
    editor.focus();
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(focus).toHaveBeenCalledTimes(1);
    await focus.calls.mostRecent()?.returnValue;
    const heading = await fixture.componentInstance.headingInput!.getInputElement();
    expect(heading.matches(':focus')).toBeTrue();

    heading!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'h', ctrlKey: true, bubbles: true, cancelable: true, composed: true,
    }));
    fixture.detectChanges();
    expect(focus).toHaveBeenCalledTimes(2);
    await focus.calls.mostRecent()?.returnValue;
    const restoredEditor = fixture.nativeElement.querySelector('.tagify__input') as HTMLElement;
    expect(document.activeElement).toBe(restoredEditor);
    fixture.destroy();
  });
});
