import { describe, expect, it } from 'vitest';
import { addDays, addMonths, mondayOf } from '../period';

describe('tính kỳ báo cáo', () => {
  it('cộng ngày qua ranh giới tháng và năm', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // năm nhuận
  });

  it('cộng tháng luôn trả về ngày đầu tháng', () => {
    expect(addMonths('2026-11-01', 1)).toBe('2026-12-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('tuần bắt đầu từ thứ Hai', () => {
    expect(mondayOf('2026-11-17')).toBe('2026-11-16'); // thứ Ba
    expect(mondayOf('2026-11-16')).toBe('2026-11-16'); // thứ Hai
    expect(mondayOf('2026-11-22')).toBe('2026-11-16'); // Chủ nhật vẫn thuộc tuần đó
  });
});
