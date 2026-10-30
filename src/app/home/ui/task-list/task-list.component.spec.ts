import { TaskListComponent } from './task-list.component';
import { ProjectActivityMutation } from '../../analytics/task-activity.types';
import { parseTasksString } from './task-list.utils';

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
    const component = new TaskListComponent({} as never, {} as never,
      { markForCheck: () => undefined } as never, storage as never);
    component.projectId = 'project-a';
    component.tasksString = '❌ Existing [id:1]';
    return { component, storage, mutations };
  }

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
