const { buildAttendanceDateRange } = require('../utils/attendanceDateUtils');

describe('buildAttendanceDateRange', () => {
  it('normalizes ISO datetime strings to a full-day UTC range', () => {
    const range = buildAttendanceDateRange('2026-09-08T18:30:00.000Z');

    expect(range).not.toBeNull();
    expect(range.start.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-08T23:59:59.999Z');
  });

  it('normalizes date-only strings to a full-day UTC range', () => {
    const range = buildAttendanceDateRange('2026-09-08');

    expect(range).not.toBeNull();
    expect(range.start.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-08T23:59:59.999Z');
  });
});
