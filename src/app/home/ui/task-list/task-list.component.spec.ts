import { TaskListComponent } from './task-list.component';
import { ProjectActivityMutation } from '../../analytics/task-activity.types';
import { parseTasksString, Task } from './task-list.utils';
import { DefaultIterableDiffer } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProjectStorageService } from '../../data/project-storage.service';

describe('Rendered new row focus', () => {
  it('keeps the moved editor focused through repeated Cmd arrows and save feedback', async () => {
    const display = document.body.style.display;
    document.body.style.display = 'block';
    const commit = jasmine.createSpy('commitTaskActivity').and.resolveTo([]);
    TestBed.configureTestingModule({
      imports: [TaskListComponent],
      providers: [{ provide: ProjectStorageService, useValue: { commitTaskActivity: commit, autocompleteTags: [], autocompleteTags$: of([]) } }],
    });
    const fixture = TestBed.createComponent(TaskListComponent);
    try {
      fixture.componentRef.setInput('projectId', 'test');
      fixture.componentRef.setInput('tasksString', '❌ First [id:1]\n❌ Second [id:2]\n❌ Third [id:3]');
      fixture.componentInstance.listChange.subscribe((value) => {
        fixture.componentRef.setInput('tasksString', value);
      });
      fixture.detectChanges();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const input = fixture.nativeElement.querySelectorAll('.tagify__input')[1] as HTMLElement;
      input.focus();
      for (const [key, ids] of [
        ['ArrowUp', [2, 1, 3]],
        ['ArrowDown', [1, 2, 3]],
        ['ArrowDown', [1, 3, 2]],
        ['ArrowDown', [1, 3, 2]],
      ] as const) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true, cancelable: true }));
        fixture.detectChanges();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        expect(fixture.componentInstance.tasks.map((task) => task.id)).toEqual([...ids]);
        expect(document.activeElement).toBe(input);
      }
      expect(commit).toHaveBeenCalledTimes(3);
    } finally {
      fixture.destroy();
      document.body.style.display = display;
    }
  });

  it('keeps the new editor ready for typing after Enter and save feedback settle', async () => {
    const display = document.body.style.display;
    document.body.style.display = 'block';
    TestBed.configureTestingModule({
      imports: [TaskListComponent],
      providers: [{ provide: ProjectStorageService, useValue: {
        autocompleteTags: [], autocompleteTags$: of([]),
        allocateTaskIds: async () => [2],
        commitTaskActivity: async () => [],
      } }],
    });
    const fixture = TestBed.createComponent(TaskListComponent);
    try {
      fixture.componentRef.setInput('projectId', 'test');
      fixture.componentRef.setInput('tasksString', '❌ Existing [id:1]');
      fixture.componentInstance.listChange.subscribe((value) => {
        fixture.componentRef.setInput('tasksString', value);
      });
      fixture.detectChanges();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const first = fixture.nativeElement.querySelector('.tagify__input') as HTMLElement;
      first.focus();
      expect(document.activeElement).toBe(first);
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await fixture.componentInstance.flushPendingChanges();
      fixture.detectChanges();
      // Let the queued editor and Ionic row initialization settle after creation.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      const next = fixture.nativeElement.querySelectorAll('.tagify__input')[1] as HTMLElement;
      expect(document.activeElement).toBe(next);
      expect(next.contains(window.getSelection()!.anchorNode)).toBeTrue();
      document.execCommand('insertText', false, 'New task');
      expect(next.textContent).toContain('New task');
    } finally {
      fixture.destroy();
      document.body.style.display = display;
    }
  });
});

describe('New task row identities', () => {
  function setup() {
    let next = 100;
    const mutations: ProjectActivityMutation[] = [];
    const storage = {
      allocateTaskIds: async (count: number) => Array.from({ length: count }, () => next++),
      commitTaskActivity: async (mutation: ProjectActivityMutation) => {
        mutations.push(mutation);
        return [];
      },
    };
    const changeDetector = {
      markForCheck: () => undefined,
      detectChanges: () => undefined,
    };
    const component = new TaskListComponent(
      {} as never,
      changeDetector as never,
      storage as never
    );
    component.projectId = 'project-a';
    component.tasksString = '❌ Existing [id:1]';
    return { component, storage, mutations, changeDetector };
  }

  it('[focus] retains the input row through immutable typing and save feedback', async () => {
    const { component } = setup();
    component.tasksString = '❌ [id:1]';
    const differ = new DefaultIterableDiffer<Task>(component.trackTask);
    differ.diff(component.tasks);
    component.listChange.subscribe((value) => {
      component.tasksString = value;
    });

    for (const text of ['A', 'Ab', 'Abc']) {
      component.onTaskChange({ ...component.tasks[0], text }, 0);
      const changes = differ.diff(component.tasks);
      const recreatedRows: unknown[] = [];
      changes?.forEachAddedItem((row) => recreatedRows.push(row));
      changes?.forEachRemovedItem((row) => recreatedRows.push(row));
      expect(recreatedRows).toEqual([]);
    }

    await component.flushPendingChanges();
    expect(component.tasks[0].text).toBe('Abc');
    expect(differ.diff(component.tasks)).toBeNull();
    component.ngOnDestroy();
  });

  it('[focus] renders an asynchronously inserted row before focusing its input', async () => {
    const { component, changeDetector } = setup();
    const calls: string[] = [];
    const focusInput = jasmine.createSpy('focusInput').and.callFake(async () => {
      calls.push('focus');
    });
    spyOn(changeDetector, 'detectChanges').and.callFake(() => {
      calls.push('render');
      component.taskItems = {
        get: (index: number) => index === 1 ? { focusInput } : undefined,
      } as never;
    });

    await component.addTask(0);

    expect(component.tasks.map((task) => task.id)).toEqual([1, 100]);
    expect(calls).toEqual(['render', 'focus']);
    expect(focusInput).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it('moves one row at a time, saves identity and restores focus without wrapping', async () => {
    const { component, mutations, changeDetector } = setup();
    component.tasksString = '❌ First [id:1]\n❌ Second [id:2]\n❌ Third [id:3]';
    const focusInput = jasmine.createSpy('focusInput').and.resolveTo();
    const get = jasmine.createSpy('get').and.returnValue({ focusInput });
    component.taskItems = { get } as never;
    const render = spyOn(changeDetector, 'detectChanges');
    component.listChange.subscribe((value) => {
      component.tasksString = value;
    });

    component.moveTask(1, -1);
    expect(component.tasks.map((task) => task.id)).toEqual([2, 1, 3]);
    expect(render).toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(0);
    expect(focusInput).toHaveBeenCalledTimes(1);
    component.moveTask(0, -1);
    component.moveTask(2, 1);
    expect(mutations.length).toBe(1);
    component.moveTask(0, 1);
    component.moveTask(1, 1);
    await component.flushPendingChanges();
    expect(component.tasks.map((task) => task.id)).toEqual([1, 3, 2]);
    expect(parseTasksString(mutations[2].tasks!).map((task) => task.id)).toEqual([1, 3, 2]);
    expect(mutations.every((mutation) => mutation.events.length === 0)).toBeTrue();
    expect(get).toHaveBeenCalledWith(2);
    component.ngOnDestroy();
  });

  it('[task IDs] waits for queued additions and preserves identity through edits and reorder', async () => {
    const { component } = setup();
    const emitted: string[] = [];
    component.listChange.subscribe((value) => emitted.push(value));
    void component.addTask();
    void component.addTask();
    await component.flushPendingChanges();
    expect(component.tasks.map((task) => task.id)).toEqual([1, 100, 101]);
    component.onTaskChange({ ...component.tasks[1], text: 'Edited' }, 1);
    component.reorderTasks({ detail: { from: 1, to: 0, complete: () => undefined } });
    await component.flushPendingChanges();
    expect(parseTasksString(emitted[emitted.length - 1])[0].id).toBe(100);
    component.ngOnDestroy();
  });

  it('[task IDs] replaces pasted identities and excludes markers from public copy', async () => {
    const { component } = setup();
    component.modal = { dismiss: async () => true } as never;
    component.pastedContent = '❌ Incoming [id:1]\n☑️ Other [id:999]';
    await component.confirmPaste();
    expect(component.tasks.map((task) => task.id)).toEqual([100, 101]);
    const copy = spyOn(component, 'copyTextToClipboard');
    await component.copyTasksToClipboard();
    expect(copy.calls.mostRecent().args[0]).toBe('❌  Incoming\n☑️  Other');
    component.ngOnDestroy();
  });

  it('[lifecycle] records each rapid status transition immediately in the originating project', async () => {
    const { component, mutations } = setup();
    for (const status of ['✅', '❌', '✅']) {
      component.onTaskChange({ ...component.tasks[0], status }, 0);
    }
    expect(mutations.length).toBe(3);
    expect(mutations.map((mutation) => mutation.events[0].before!.status)).toEqual(['❌', '✅', '❌']);
    component.projectId = 'project-b';
    await component.flushPendingChanges();
    expect(mutations.every((mutation) => mutation.projectId === 'project-a')).toBeTrue();
    component.ngOnDestroy();
  });

  it('[lifecycle] records first content once, and heading/blank membership transitions', async () => {
    const { component, mutations } = setup();
    component.tasksString = '❌ [id:1]';
    component.onTaskChange({ ...component.tasks[0], text: 'N' }, 0);
    component.onTaskChange({ ...component.tasks[0], text: 'New task' }, 0);
    await component.flushPendingChanges();
    expect(mutations.reduce<string[]>((types, mutation) => types.concat(mutation.events.map((event) => event.type)), [])).toEqual(['entered']);
    component.onTaskChange({ ...component.tasks[0], sectionHeading: true }, 0);
    component.onTaskChange({ ...component.tasks[0], sectionHeading: false }, 0);
    component.onTaskChange({ ...component.tasks[0], text: '' }, 0);
    await component.flushPendingChanges();
    expect(mutations.reduce<string[]>((types, mutation) => types.concat(mutation.events.map((event) => event.type)), []))
      .toEqual(['entered', 'membership-changed', 'entered', 'membership-changed']);
    component.ngOnDestroy();
  });

  it('[lifecycle] records paste replacement without treating an imported green tick as a completion', async () => {
    const { component, mutations } = setup();
    component.modal = { dismiss: async () => true } as never;
    component.pastedContent = '✅ Incoming [id:1]\n❌ Heading 🏷️';
    await component.confirmPaste();
    expect(mutations[0].events.map((event) => [event.type, event.source]))
      .toEqual([['deleted', 'paste'], ['entered', 'paste']]);
    expect(mutations[0].events[1].taskId).toBe(100);
    expect(mutations[0].events[1].after!.status).toBe('✅');
    component.ngOnDestroy();
  });

});
