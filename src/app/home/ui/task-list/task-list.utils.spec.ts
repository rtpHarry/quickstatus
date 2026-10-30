import { normalizeTaskListIds, parseTasksString, stringifyTasks, Task } from './task-list.utils';

describe('Task IDs serialization', () => {
  it('[task IDs] round trips identity and existing flags without requiring IDs on legacy rows', () => {
    const task: Task = { id: 72, status: '☑️', text: 'Existing task', private: true,
      sectionHeading: true, created: '2026/10/30' };
    expect(parseTasksString(stringifyTasks([task]))[0]).toEqual(task);
    expect(parseTasksString('✅ Legacy task')[0]).toEqual({ status: '✅', text: 'Legacy task',
      private: false, sectionHeading: false });
    expect(parseTasksString('❌ Mixed flags [id:9] 🔒 [created:2026/10/30]')[0].id).toBe(9);
  });

  it('[task ID backfill] repairs IDs across projects without changing task data', () => {
    const lists = {
      b: '☑️ second [id:7]\n❌ invalid 🔒 [created:2026/10/29] [id:-2]',
      a: '✅  Keep  spaces [id:7]\n❌ missing 🏷️ [created:2026/10/28]\n❌ supplied later [id:40]',
    };
    const result = normalizeTaskListIds(lists, 10);
    const normalized = { ...lists, ...result.changedLists };
    expect(parseTasksString(normalized.a).map((task) => task.id)).toEqual([7, 41, 40]);
    expect(parseTasksString(normalized.b).map((task) => task.id)).toEqual([42, 43]);
    expect(normalized.a.split('\n')[0]).toBe(lists.a.split('\n')[0]);
    expect(normalized.b.split('\n')[1]).toBe('❌ invalid 🔒 [created:2026/10/29] [id:43]');
    expect(parseTasksString(normalized.b)[1]).toEqual({ id: 43, status: '❌', text: 'invalid',
      private: true, sectionHeading: false, created: '2026/10/29' });
    expect(result.nextTaskId).toBe(44);
    expect(normalizeTaskListIds(normalized, result.nextTaskId))
      .toEqual({ changedLists: {}, nextTaskId: 44 });
  });

  it('[task ID backfill] keeps counters ahead and treats invalid markers as metadata', () => {
    const result = normalizeTaskListIds({ a: '❌ zero [id:0]\n❌ invalid [id:nope]\n❌ huge [id:9007199254740992]' }, 80);
    expect(parseTasksString(result.changedLists['a']).map(({ id, text }) => ({ id, text })))
      .toEqual([{ id: 80, text: 'zero' }, { id: 81, text: 'invalid' }, { id: 82, text: 'huge' }]);
    expect(result.nextTaskId).toBe(83);
    expect(normalizeTaskListIds({ a: '❌ valid [id:8]' }, 90).nextTaskId).toBe(90);
    const blank = normalizeTaskListIds({ a: ' \n ' }, 1);
    expect(parseTasksString(blank.changedLists['a']).length).toBe(1);
    expect(normalizeTaskListIds(blank.changedLists, blank.nextTaskId).changedLists).toEqual({});
    expect(() => normalizeTaskListIds({ a: '❌ overflow [id:9007199254740991]' }, 1)).toThrow();
  });
});
