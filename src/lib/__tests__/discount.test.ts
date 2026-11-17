import { describe, expect, it } from 'vitest';
import { allocate, discPayload, discTotal, pctOf, unitDisc } from '../discount';

// App tính giảm giá để hiện trước khi lưu; máy chủ (fn_post_order) tính lại.
// Các con số ở đây trùng với tests/db/t_01_ghi_don.sql để hai bên không lệch nhau.
const lines = [
  { price: 15000, qty: 2 }, // Mầm Đỏ
  { price: 30000, qty: 1 }  // Matcha
];

describe('giảm giá theo phần', () => {
  it('giảm cả đơn: mọi phần đều được giảm', () => {
    const ks = allocate(lines, { pct: 10, parts: null });
    expect(ks).toEqual([2, 1]);
    expect(discTotal(lines, ks, 10)).toBe(6000);
  });

  it('giảm 1 phần: rơi vào phần giá cao nhất', () => {
    const ks = allocate(lines, { pct: 10, parts: 1 });
    expect(ks).toEqual([0, 1]);
    expect(discTotal(lines, ks, 10)).toBe(3000);
  });

  it('giảm 5% cho 2 phần: Matcha rồi 1 Mầm Đỏ, tổng 2.250', () => {
    const ks = allocate(lines, { pct: 5, parts: 2 });
    expect(ks).toEqual([1, 1]);
    expect(discTotal(lines, ks, 5)).toBe(2250);
  });

  it('cùng giá thì dòng đứng trước được giảm trước', () => {
    const same = [{ price: 20000, qty: 1 }, { price: 20000, qty: 3 }];
    expect(allocate(same, { pct: 10, parts: 2 })).toEqual([1, 1]);
  });

  it('không giảm thì mọi dòng bằng 0; dòng số lượng 0 bị bỏ qua', () => {
    expect(allocate(lines, null)).toEqual([0, 0]);
    expect(allocate([{ price: 30000, qty: 0 }, { price: 15000, qty: 1 }], { pct: 10, parts: 1 })).toEqual([0, 1]);
  });

  it('số phần xin giảm nhiều hơn số phần có: chỉ giảm số phần có', () => {
    expect(allocate(lines, { pct: 10, parts: 9 })).toEqual([2, 1]);
  });

  it('tiền giảm mỗi phần làm tròn tới đồng', () => {
    expect(unitDisc(15000, 5)).toBe(750);
    expect(unitDisc(25000, 10)).toBe(2500);
  });

  it('suy lại mức giảm từ dòng đã lưu', () => {
    expect(pctOf(30000, 1500)).toBe(5);
    expect(pctOf(30000, 3000)).toBe(10);
  });

  it('gửi lên máy chủ: chọn đủ số phần thì coi như giảm cả đơn', () => {
    expect(discPayload(null, 3, '')).toEqual({});
    expect(discPayload({ pct: 10, parts: 3 }, 3, ' khách quen ')).toEqual({ discount_pct: 10, discount_parts: null, discount_reason: 'khách quen' });
    expect(discPayload({ pct: 5, parts: 1 }, 3, '')).toEqual({ discount_pct: 5, discount_parts: 1, discount_reason: null });
  });
});
