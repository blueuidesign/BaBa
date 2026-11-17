/** Giảm giá (bản 17/11): mức 5% hoặc 10%, cho cả đơn hoặc cho N phần giá cao nhất.
 *  Máy chủ (fn_post_order) tính lại y hệt cách này; app chỉ tính để hiện trước khi lưu. */
export type Pct = 5 | 10;
export const PCTS: Pct[] = [5, 10];
export type DiscLine = { price: number; qty: number };
/** null = không giảm; parts null = cả đơn; parts N = N phần giá cao nhất. */
export type Disc = { pct: Pct; parts: number | null } | null;

export const unitDisc = (price: number, pct: number) => Math.round((price * pct) / 100);
/** Mức giảm của một dòng đã lưu, suy từ số tiền giảm mỗi phần (5 hoặc 10). */
export const pctOf = (price: number, unit: number): Pct => (price > 0 && Math.round((unit * 100) / price) <= 7 ? 5 : 10);

/** Số phần được giảm của từng dòng, cùng thứ tự với `lines`. Giá cao trước; cùng giá thì dòng đứng trước được trước. */
export function allocate(lines: DiscLine[], d: Disc): number[] {
  const out = lines.map(() => 0);
  if (!d) return out;
  let left = d.parts == null ? Infinity : d.parts;
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

export const discTotal = (lines: DiscLine[], ks: number[], pct: number) => lines.reduce((s, l, i) => s + ks[i] * unitDisc(l.price, pct), 0);

/** Phần gửi lên máy chủ. Chọn số phần bằng hoặc hơn cả đơn thì coi như giảm cả đơn. */
export function discPayload(d: Disc, totalParts: number, reason: string) {
  if (!d) return {};
  return { discount_pct: d.pct, discount_parts: d.parts != null && d.parts < totalParts ? d.parts : null, discount_reason: reason.trim() || null };
}
