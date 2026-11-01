import { baselineProjection, closingSummary } from '../../analytics/project-metrics';
import { TaskTrackingBaseline } from '../../analytics/task-activity.types';
import { formatHistoryDate, historyRows, shiftDate, signedChange } from './stats-history';

describe('stats history', () => {
  const baseline: TaskTrackingBaseline = {
    schemaVersion: 1, projectId: 'one', timestamp: '2026-11-01T12:00:00Z', localDate: '2026-11-01', tasks: [],
  };
  const day = (date: string, remaining: number) => ({
    ...closingSummary(baselineProjection(baseline), date), remaining,
  });

  it('formats ordinal dates including teen exceptions', () => {
    expect(formatHistoryDate('2026-11-01')).toBe('Sun 1st Nov 26');
    for (const [number, suffix] of [[2, 'nd'], [3, 'rd'], [11, 'th'], [12, 'th'], [13, 'th'], [21, 'st'], [22, 'nd'], [23, 'rd'], [31, 'st']]) {
      expect(formatHistoryDate(`2026-12-${String(number).padStart(2, '0')}`)).toContain(`${number}${suffix} Dec 26`);
    }
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31');
  });

  it('uses the preceding day outside the displayed range and sorts newest first', () => {
    const rows = historyRows([day('2026-11-03', 8), day('2026-11-01', 12), day('2026-11-02', 10)], '2026-11-02', 15);
    expect(rows.map(row => [row.localDate, row.start, row.remaining, row.change])).toEqual([
      ['2026-11-03', 10, 8, -2], ['2026-11-02', 12, 10, -2],
    ]);
  });

  it('measures backlog reduction independently of completion counts', () => {
    const rows = historyRows([
      { ...day('2026-11-01', 50), created: 3, completed: 8 },
      { ...day('2026-11-02', 20), created: 9, completed: 4 },
    ], '2026-11-01', 50);
    expect(rows.map(row => row.change)).toEqual([-30, 0]);
  });

  it('uses the baseline opening count, including changes unrelated to completion', () => {
    const rows = historyRows([day('2026-11-01', 7), day('2026-11-02', 9)], '2026-10-01', 10, '2026-11-01');
    expect(rows[1].start).toBe(10);
    expect(rows[1].baselineDay).toBeTrue();
    expect(rows[1].change).toBe(-3);
    expect(rows[0].change).toBe(2);
    expect(signedChange(2)).toBe('+2');
    expect(signedChange(-3)).toBe('−3');
    expect(signedChange(0)).toBe('0');
    expect(historyRows([], '2026-11-01', 0)).toEqual([]);
  });
});
