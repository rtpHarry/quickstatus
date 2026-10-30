import { TaskListComponent } from './task-list.component';
import { parseTasksString } from './task-list.utils';

describe('New task row identities', () => {
  function setup() {
    let next = 100;
    const storage = { allocateTaskIds: async (count: number) =>
      Array.from({ length: count }, () => next++) };
    const component = new TaskListComponent({} as never, {} as never,
      { markForCheck: () => undefined } as never, storage as never);
    component.tasksString = '❌ Existing [id:1]';
    return { component, storage };
  }

  it('[task IDs] waits for queued additions and preserves identity through edits and reorder', async () => {
    const { component } = setup();
    const emitted: string[] = [];
    component.listChange.subscribe((value) => emitted.push(value));
    void component.addTask();
    void component.addTask();
    await component.flushPendingChanges();
    expect(component.tasks.map((task) => task.id)).toEqual([1, 100, 101]);
    component.tasks[1].text = 'Edited';
    component.onTaskChange(component.tasks[1], 1);
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
});
