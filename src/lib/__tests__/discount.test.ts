import { describe, expect, it } from 'vitest';
import { allocate, discError, discFromOrder, discLabel, discPayload, discTotal, lineDiscs, pctOf, unitDisc, type Disc } from '../discount';

// App tính giảm giá để hiện trước khi lưu; máy chủ (fn_post_order) tính lại.
// Các con số ở đây trùng với tests/db/t_01_ghi_don.sql và t_08_giam_theo_tien.sql để hai bên không lệch nhau.
const lines = [
  { price: 15000, qty: 2 }, // Mầm Đỏ
  { price: 30000, qty: 1 }  // Matcha
];
const pct = (p: 5 | 10, parts: number | null): Disc => ({ kind: 'pct', pct: p, parts });

describe('giảm 5% hoặc 10% theo phần', () => {
  it('giảm cả đơn: mọi phần đều được giảm', () => {
    expect(allocate(lines, pct(10, null))).toEqual([2, 1]);
    expect(discTotal(lines, pct(10, null))).toBe(6000);
  });

  it('giảm 1 phần: rơi vào phần giá cao nhất', () => {
    expect(allocate(lines, pct(10, 1))).toEqual([0, 1]);
    expect(discTotal(lines, pct(10, 1))).toBe(3000);
  });

  it('giảm 5% cho 2 phần: Matcha rồi 1 Mầm Đỏ, tổng 2.250', () => {
    expect(allocate(lines, pct(5, 2))).toEqual([1, 1]);
    expect(discTotal(lines, pct(5, 2))).toBe(2250);
  });

  it('cùng giá thì dòng đứng trước được giảm trước', () => {
    expect(allocate([{ price: 20000, qty: 1 }, { price: 20000, qty: 3 }], pct(10, 2))).toEqual([1, 1]);
  });

  it('không giảm thì mọi dòng bằng 0; dòng số lượng 0 bị bỏ qua', () => {
    expect(allocate(lines, null)).toEqual([0, 0]);
    expect(allocate([{ price: 30000, qty: 0 }, { price: 15000, qty: 1 }], pct(10, 1))).toEqual([0, 1]);
  });

  it('số phần xin giảm nhiều hơn số phần có: chỉ giảm số phần có', () => {
    expect(allocate(lines, pct(10, 9))).toEqual([2, 1]);
  });

  it('tiền giảm mỗi phần làm tròn tới đồng; suy lại mức giảm từ dòng cũ', () => {
    expect(unitDisc(15000, 5)).toBe(750);
    expect(pctOf(30000, 1500)).toBe(5);
    expect(pctOf(30000, 3000)).toBe(10);
  });
});

describe('giảm theo tiền mỗi phần', () => {
  it('5.000 đ mỗi phần, tất cả phần: 15.000', () => {
    expect(discTotal(lines, { kind: 'per_part', amount: 5000, parts: null })).toBe(15000);
  });
  it('một phần: rơi vào Matcha', () => {
    const d: Disc = { kind: 'per_part', amount: 5000, parts: 1 };
    expect(lineDiscs(lines, d)).toEqual([0, 5000]);
  });
  it('không quá giá món rẻ nhất được giảm', () => {
    expect(discError(lines, { kind: 'per_part', amount: 16000, parts: null })).toMatch('Tối đa 15.000');
    expect(discError(lines, { kind: 'per_part', amount: 16000, parts: 1 })).toBeNull();
  });
});

describe('giảm một khoản cho tổng đơn', () => {
  it('10.000 trên đơn 60.000: chia theo giá, tổng đúng 10.000', () => {
    const d: Disc = { kind: 'order', amount: 10000 };
    expect(discTotal(lines, d)).toBe(10000);
    expect(lineDiscs(lines, d)).toEqual([5000, 5000]);
  });
  it('không quá tạm tính', () => {
    expect(discError(lines, { kind: 'order', amount: 60001 })).toMatch('lớn hơn tạm tính');
    expect(discError(lines, { kind: 'order', amount: 60000 })).toBeNull();
  });
});

describe('gửi lên máy chủ và đọc lại', () => {
  it('chọn đủ số phần thì coi như giảm cả đơn', () => {
    expect(discPayload(null, 3, '')).toEqual({});
    expect(discPayload(pct(10, 3), 3, ' khách quen ')).toEqual({ discount_kind: 'pct', discount_pct: 10, discount_parts: null, discount_reason: 'khách quen' });
    expect(discPayload({ kind: 'per_part', amount: 5000, parts: 1 }, 3, '')).toEqual({ discount_kind: 'per_part', discount_amount: 5000, discount_parts: 1, discount_reason: null });
    expect(discPayload({ kind: 'order', amount: 10000 }, 3, '')).toEqual({ discount_kind: 'order', discount_amount: 10000, discount_reason: null });
  });
  it('dựng lại từ đơn đã lưu, kể cả đơn trước 0063', () => {
    const saved = [{ unit_price_vnd: 30000, qty: 1, discount_qty: 1, discount_unit_vnd: 1500 }, { unit_price_vnd: 15000, qty: 2, discount_qty: 0, discount_unit_vnd: 0 }];
    expect(discFromOrder({ discount_vnd: 1500 }, saved)).toEqual(pct(5, 1));
    expect(discFromOrder({ discount_vnd: 5000, discount_kind: 'per_part', discount_value: 5000 }, saved)).toEqual({ kind: 'per_part', amount: 5000, parts: 1 });
    expect(discFromOrder({ discount_vnd: 3000 }, saved.map((l) => ({ ...l, discount_qty: 0 })))).toBe('old');
  });
  it('nhãn ngắn', () => {
    expect(discLabel(pct(5, null), 3, 3)).toBe('Giảm 5% · cả đơn');
    expect(discLabel({ kind: 'per_part', amount: 5000, parts: 2 }, 2, 3)).toMatch(/^Giảm 5\.000\s?đ\/phần · 2 phần$/);
  });
});
