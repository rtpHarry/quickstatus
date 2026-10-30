import { parseTasksString, stringifyTasks, Task } from './task-list.utils';

describe('Task IDs serialization', () => {
  it('[task IDs] round trips identity and existing flags without requiring IDs on legacy rows', () => {
    const task: Task = { id: 72, status: '☑️', text: 'Existing task', private: true,
      sectionHeading: true, created: '2026/10/30' };
    expect(parseTasksString(stringifyTasks([task]))[0]).toEqual(task);
    expect(parseTasksString('✅ Legacy task')[0]).toEqual({ status: '✅', text: 'Legacy task',
      private: false, sectionHeading: false });
    expect(parseTasksString('❌ Mixed flags [id:9] 🔒 [created:2026/10/30]')[0].id).toBe(9);
  });
});
