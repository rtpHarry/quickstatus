import { TaskItemComponent } from './task-item.component';
import { fakeAsync, TestBed, tick, discardPeriodicTasks } from '@angular/core/testing';

describe('Task item editor shortcuts', () => {
  it('delegates row focus to the editor', async () => {
    const component = new TaskItemComponent({} as never);
    const focus = jasmine.createSpy('focus').and.resolveTo();
    component.input = { focus } as never;
    await component.focusInput();
    expect(focus).toHaveBeenCalledTimes(1);
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

  function render(sectionHeading = false) {
    TestBed.configureTestingModule({ imports: [TaskItemComponent] });
    const fixture = TestBed.createComponent(TaskItemComponent);
    fixture.componentRef.setInput('task', { text: 'Work @M', status: '❌', sectionHeading });
    fixture.detectChanges();
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
    expect(getComputedStyle(label).color).toBe('rgb(255, 255, 255)');
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
});
