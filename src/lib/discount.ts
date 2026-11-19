import { vnd } from './format';

/** Giảm giá (bản 19/11, migration 0063). Ba cách:
 *  - pct: 5% hoặc 10% mỗi phần, cho cả đơn hoặc N phần giá cao nhất;
 *  - per_part: bớt một số tiền mỗi phần (mặc định 5.000 đ), cho cả đơn hoặc N phần giá cao nhất;
 *  - order: một khoản cho tổng đơn, chia vào từng phần theo giá (làm tròn xuống).
 *  Máy chủ (fn_post_order) tính lại y hệt; app chỉ tính để hiện trước khi lưu. */
export type Pct = 5 | 10;
export const PCTS: Pct[] = [5, 10];
export type DiscLine = { price: number; qty: number };
export type Disc =
  | null
  | { kind: 'pct'; pct: Pct; parts: number | null }
  | { kind: 'per_part'; amount: number; parts: number | null }
  | { kind: 'order'; amount: number };
export type DiscKind = 'pct' | 'per_part' | 'order';

/** Mở Giảm giá lên là chọn sẵn cách này (Tùng 19/11). */
export const DEFAULT_DISC: Disc = { kind: 'per_part', amount: 5000, parts: null };
export const PER_PART_QUICK = [2000, 3000, 5000, 10000];
export const ORDER_QUICK = [5000, 10000, 15000, 20000];
export const AMOUNT_STEP = 1000;

export const unitDisc = (price: number, pct: number) => Math.round((price * pct) / 100);
/** Mức giảm của một dòng đã lưu trước 0063 (chưa có discount_kind), suy từ số tiền giảm mỗi phần. */
export const pctOf = (price: number, unit: number): Pct => (price > 0 && Math.round((unit * 100) / price) <= 7 ? 5 : 10);

export const grossOf = (lines: DiscLine[]) => lines.reduce((s, l) => s + (l.qty > 0 ? l.qty * l.price : 0), 0);
export const partsOf = (lines: DiscLine[]) => lines.reduce((s, l) => s + Math.max(0, l.qty), 0);
const partsSel = (d: Disc) => (d && d.kind !== 'order' ? d.parts : null);

/** Số phần được giảm của từng dòng, cùng thứ tự với `lines`. Giá cao trước; cùng giá thì dòng đứng trước được trước. */
export function allocate(lines: DiscLine[], d: Disc): number[] {
  const out = lines.map(() => 0);
  if (!d) return out;
  const p = partsSel(d);
  let left = p == null ? Infinity : p;
  lines
    .map((l, i) => ({ ...l, i }))
    .filter((l) => l.qty > 0)
    .sort((a, b) => b.price - a.price || a.i - b.i)
    .forEach((l) => {
      const k = Math.min(l.qty, left);
      if (k <= 0) return;
      out[l.i] = k;
      left -= k;
    });
  return out;
}

/** Tiền giảm mỗi phần của từng dòng. */
export function unitsOf(lines: DiscLine[], d: Disc): number[] {
  if (!d) return lines.map(() => 0);
  if (d.kind === 'pct') return lines.map((l) => unitDisc(l.price, d.pct));
  if (d.kind === 'per_part') return lines.map(() => d.amount);
  const g = grossOf(lines);
  return lines.map((l) => (g > 0 ? Math.floor((d.amount * l.price) / g) : 0));
}

/** Tiền giảm của từng dòng (số phần được giảm × tiền giảm mỗi phần). */
export function lineDiscs(lines: DiscLine[], d: Disc): number[] {
  const ks = allocate(lines, d);
  const us = unitsOf(lines, d);
  return lines.map((_, i) => ks[i] * us[i]);
}

/** Tổng tiền giảm của đơn. Kiểu tổng đơn: đúng số đã nhập (phần lẻ vài đồng tính ở mức đơn). */
export function discTotal(lines: DiscLine[], d: Disc): number {
  if (!d) return 0;
  if (d.kind === 'order') return d.amount;
  return lineDiscs(lines, d).reduce((a, b) => a + b, 0);
}

/** Giảm mỗi phần tối đa: giá của món rẻ nhất trong các phần được giảm. */
export function maxPerPart(lines: DiscLine[], d: Disc): number {
  const ks = allocate(lines, d ?? { kind: 'pct', pct: 10, parts: null });
  const prices = lines.filter((_, i) => ks[i] > 0).map((l) => l.price);
  return prices.length ? Math.min(...prices) : 0;
}

/** Lỗi khiến không lưu được (máy chủ cũng chặn y hệt). null = hợp lệ. */
export function discError(lines: DiscLine[], d: Disc): string | null {
  if (!d || d.kind === 'pct') return null;
  if (!(d.amount > 0)) return 'Số tiền giảm phải lớn hơn 0.';
  if (d.kind === 'order') {
    const g = grossOf(lines);
    return d.amount > g ? `Giảm ${vnd(d.amount)} lớn hơn tạm tính ${vnd(g)}. Nhập số nhỏ hơn. Nếu muốn cho không cả đơn, chọn Tặng ở bước nhận tiền.` : null;
  }
  const max = maxPerPart(lines, d);
  return d.amount > max ? `Tối đa ${vnd(max)} mỗi phần, vì món rẻ nhất được giảm giá ${vnd(max)}.` : null;
}

/** Phần gửi lên máy chủ. Chọn số phần bằng hoặc hơn cả đơn thì coi như giảm cả đơn. */
export function discPayload(d: Disc, totalParts: number, reason: string) {
  if (!d) return {};
  const why = reason.trim() || null;
  if (d.kind === 'order') return { discount_kind: 'order', discount_amount: d.amount, discount_reason: why };
  const parts = d.parts != null && d.parts < totalParts ? d.parts : null;
  if (d.kind === 'pct') return { discount_kind: 'pct', discount_pct: d.pct, discount_parts: parts, discount_reason: why };
  return { discount_kind: 'per_part', discount_amount: d.amount, discount_parts: parts, discount_reason: why };
}

/** Nhãn ngắn, vd "Giảm 5% · cả đơn", "Giảm 5.000 đ/phần · 2 phần", "Giảm 10.000 đ tổng đơn". */
export function discLabel(d: Disc, discParts: number, totalParts: number): string {
  if (!d) return 'Giảm giá';
  if (d.kind === 'order') return `Giảm ${vnd(d.amount)} tổng đơn`;
  const scope = discParts >= totalParts ? 'cả đơn' : `${discParts} phần`;
  return d.kind === 'pct' ? `Giảm ${d.pct}% · ${scope}` : `Giảm ${vnd(d.amount)}/phần · ${scope}`;
}

/** Nhãn của một dòng, vd "Giảm 10% · 2 phần × 3.000 đ". */
export function lineLabel(d: Disc, k: number, unit: number): string {
  if (!d) return '';
  if (d.kind === 'order') return `Phần chia từ giảm tổng đơn · ${k} phần × ${vnd(unit)}`;
  return `${d.kind === 'pct' ? `Giảm ${d.pct}%` : 'Giảm'} · ${k} phần × ${vnd(unit)}`;
}

type SavedLine = { unit_price_vnd: number; qty: number; discount_qty: number; discount_unit_vnd: number };
/** Dựng lại lựa chọn giảm giá từ đơn đã lưu. 'old' = đơn giảm một số tiền theo cách trước 16/11 (không chia vào dòng). */
export function discFromOrder(o: { discount_vnd: number; discount_kind?: string | null; discount_value?: number | null }, lines: SavedLine[]): Disc | 'old' {
  if (!o.discount_vnd) return null;
  const dq = lines.reduce((a, l) => a + (l.discount_qty || 0), 0);
  const all = lines.reduce((a, l) => a + l.qty, 0);
  const parts = dq && dq < all ? dq : null;
  if (o.discount_kind === 'order' && o.discount_value) return { kind: 'order', amount: o.discount_value };
  if (o.discount_kind === 'per_part' && o.discount_value) return { kind: 'per_part', amount: o.discount_value, parts };
  if (o.discount_kind === 'pct' && (o.discount_value === 5 || o.discount_value === 10)) return { kind: 'pct', pct: o.discount_value, parts };
  if (!dq) return 'old';
  const dl = lines.find((l) => l.discount_qty > 0)!;
  return { kind: 'pct', pct: pctOf(dl.unit_price_vnd, dl.discount_unit_vnd), parts };
}

/** Nhãn giảm của một đơn đã lưu (hóa đơn, chi tiết đơn). */
export function savedLabel(o: { discount_vnd: number; discount_kind?: string | null; discount_value?: number | null }, lines: SavedLine[]): string {
  const d = discFromOrder(o, lines);
  if (d === 'old') return `Giảm ${vnd(o.discount_vnd)}`;
  const dq = lines.reduce((a, l) => a + (l.discount_qty || 0), 0);
  const all = lines.reduce((a, l) => a + l.qty, 0);
  return discLabel(d, dq, all);
}
