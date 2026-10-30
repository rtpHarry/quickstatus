import { applyTaskActivity, dailyMetrics, metricDateRange, rebuildProjectMetrics } from './project-metrics';
import { TaskActivity, TaskFacts, TaskTrackingBaseline } from './task-activity.types';

describe('project task metrics', () => {
  const facts = (status = '❌', extra: Partial<TaskFacts> = {}): TaskFacts => ({
    status, hasText: true, sectionHeading: false, created: null, ...extra,
  });
  const baseline = (tasks: TaskTrackingBaseline['tasks'] = []): TaskTrackingBaseline => ({
    schemaVersion: 1, projectId: 'one', timestamp: '2026-10-01T12:00:00Z', localDate: '2026-10-01', tasks,
  });
  const event = (id: number, taskId: number, type: TaskActivity['type'], before: TaskFacts | null,
    after: TaskFacts | null, localDate = '2026-10-01'): TaskActivity => ({
    schemaVersion: 1, id, taskId, type, before, after, projectId: 'one', localDate,
    timestamp: `${localDate}T12:00:00Z`, source: 'normal',
  });

  it('splits old/new completions without counting baseline green ticks', () => {
    const initial = baseline([{ taskId: 1, facts: facts() }, { taskId: 2, facts: facts('✅') }]);
    const result = rebuildProjectMetrics(initial, [
      event(1, 3, 'entered', null, facts()), event(2, 3, 'status-changed', facts(), facts('✅')),
      event(3, 1, 'status-changed', facts(), facts('✅')),
    ]);
    expect(result.summaries[0]).toEqual(jasmine.objectContaining({
      created: 1, completed: 2, completedNew: 1, completedExisting: 1, remaining: 0, closingCompleted: 3,
    }));
  });

  it('reverses only same-day credits and counts repeated completions once', () => {
    const events = [event(1, 1, 'status-changed', facts(), facts('✅')),
      event(2, 1, 'status-changed', facts('✅'), facts('☑️')),
      event(3, 1, 'status-changed', facts('☑️'), facts('✅'))];
    const initial = baseline([{ taskId: 1, facts: facts() }]);
    expect(rebuildProjectMetrics(initial, events.slice(0, 2)).summaries[0].completed).toBe(0);
    const result = rebuildProjectMetrics(initial, [...events,
      event(4, 1, 'status-changed', facts('✅'), facts(), '2026-10-03')]);
    expect(result.summaries[0].completed).toBe(1);
    const history = metricDateRange('one', '2026-10-01', '2026-10-03', result.summaries);
    expect(history.map((day) => [day.created, day.completed, day.remaining])).toEqual([[0, 1, 0], [0, 0, 0], [0, 0, 1]]);
  });

  it('retains activity/cohorts through deletion and undo, excluding non-task rows', () => {
    const initial = baseline([{ taskId: 1, facts: facts('☑️') },
      { taskId: 2, facts: facts('❌', { sectionHeading: true }) },
      { taskId: 3, facts: facts('❌', { hasText: false }) }]);
    const result = rebuildProjectMetrics(initial, [event(1, 4, 'entered', null, facts()),
      event(2, 4, 'status-changed', facts(), facts('✅')), event(3, 4, 'deleted', facts('✅'), null),
      event(4, 4, 'restored', null, facts('✅')), event(5, 4, 'deleted', facts('✅'), null)]);
    expect(result.summaries[0]).toEqual(jasmine.objectContaining({ created: 1, completed: 1, remaining: 1, closingTotal: 1 }));
    expect(result.projection.tasks[4].arrivalDate).toBe('2026-10-01');
  });

  it('heading/blank reentry is new work once per identity/day, not completion', () => {
    const heading = facts('✅', { sectionHeading: true });
    const result = rebuildProjectMetrics(baseline([{ taskId: 1, facts: heading }]), [
      event(1, 1, 'entered', heading, facts('✅')), event(2, 1, 'membership-changed', facts('✅'), heading),
      event(3, 1, 'entered', heading, facts('✅')), event(4, 1, 'status-changed', facts('✅'), facts()),
      event(5, 1, 'status-changed', facts(), facts('✅')),
    ]);
    expect(result.summaries[0]).toEqual(jasmine.objectContaining({ created: 1, completed: 1, completedNew: 1 }));
  });

  it('paste arrives completed without earning a completion, and project queries isolate data', () => {
    const result = rebuildProjectMetrics(baseline(), [{ ...event(1, 1, 'entered', null, facts('✅')), source: 'paste' }]);
    expect(result.summaries[0]).toEqual(jasmine.objectContaining({ created: 1, completed: 0, closingCompleted: 1 }));
    expect(dailyMetrics('other', '2026-10-01', result.summaries)).toBeUndefined();
    expect(dailyMetrics('one', '2026-09-30', result.summaries)).toBeUndefined();
  });

  it('valid baseline dates classify cohorts; missing or invalid dates mean existing', () => {
    const initial = baseline([null, '2026/10/01', '2026/02/30'].map((created, i) => ({ taskId: i + 1, facts: facts('❌', { created }) })));
    const result = rebuildProjectMetrics(initial, initial.tasks.map(({ taskId, facts: before }, i) =>
      event(i + 1, taskId, 'status-changed', before, { ...before, status: '✅' })));
    expect(result.summaries[0]).toEqual(jasmine.objectContaining({ created: 0, completedNew: 1, completedExisting: 2 }));
  });

  it('incremental summaries match replay including an idle day and later deletion', () => {
    const initial = baseline();
    const events = [event(1, 1, 'entered', null, facts()), event(2, 1, 'status-changed', facts(), facts('✅')),
      event(3, 1, 'deleted', facts('✅'), null, '2026-10-03')];
    let incremental = rebuildProjectMetrics(initial, []);
    events.forEach((action) => incremental = applyTaskActivity(incremental.projection, [action], incremental.summaries));
    expect(incremental).toEqual(rebuildProjectMetrics(initial, events));
    expect(dailyMetrics('one', '2026-10-02', incremental.summaries)).toEqual(jasmine.objectContaining({ completed: 0, closingTotal: 1 }));
    expect(incremental.summaries[0].completed).toBe(1);
    expect(incremental.summaries[1].closingTotal).toBe(0);
  });

  it('keeps event local dates when UTC ordering spans another calendar day', () => {
    const action = { ...event(1, 1, 'entered', null, facts(), '2026-10-02'), timestamp: '2026-10-01T16:30:00Z' };
    const result = rebuildProjectMetrics(baseline(), [action]);
    expect(result.summaries[1].localDate).toBe('2026-10-02');
    expect(result.summaries[1].created).toBe(1);
  });
});
