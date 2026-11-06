import { createEmptyTask } from '../ui/task-list/task-list.utils';
import { taskChangeEvents } from './task-actions';
import { historyTaskFacts, taskFacts } from './task-activity.types';

describe('Tag-aware history activity', () => {
  it('records tag changes on existing tasks without recording ordinary text edits', () => {
    const task = { ...createEmptyTask(1), text: 'Work' };
    const tagged = { ...task, text: '@personal Work' };
    expect(taskChangeEvents(task, tagged)[0].type).toBe('membership-changed');
    expect(taskChangeEvents(tagged, task)[0].type).toBe('membership-changed');
    expect(taskChangeEvents(task, { ...task, text: 'Reworded work' })).toEqual([]);
  });

  it('matches whole normalized tags and keeps older facts without tags eligible', () => {
    const task = { ...createEmptyTask(1), text: '@personal Work' };
    const facts = taskFacts(task);
    expect(historyTaskFacts(facts, ['PERSONAL']).hasText).toBeFalse();
    expect(historyTaskFacts(facts, ['PERSON']).hasText).toBeTrue();
    const { tags, ...legacyFacts } = facts;
    expect(historyTaskFacts(legacyFacts, ['PERSONAL']).hasText).toBeTrue();
  });
});
