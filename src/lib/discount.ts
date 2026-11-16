/** Giảm giá bản 16/11: chỉ một mức 10%, cho cả đơn hoặc cho N phần giá cao nhất.
 *  Máy chủ (fn_post_order) tính lại y hệt cách này; app chỉ tính để hiện trước khi lưu. */
export const DISC_PCT = 10;
export type DiscLine = { price: number; qty: number };
/** null = không giảm; parts null = cả đơn; parts N = N phần giá cao nhất. */
export type Disc = { parts: number | null } | null;

export const unitDisc = (price: number) => Math.round((price * DISC_PCT) / 100);

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

export const discTotal = (lines: DiscLine[], ks: number[]) => lines.reduce((s, l, i) => s + ks[i] * unitDisc(l.price), 0);

/** Phần gửi lên máy chủ. Chọn số phần bằng hoặc hơn cả đơn thì coi như giảm cả đơn. */
export function discPayload(d: Disc, totalParts: number, reason: string) {
  if (!d) return {};
  return { discount_pct: DISC_PCT, discount_parts: d.parts != null && d.parts < totalParts ? d.parts : null, discount_reason: reason.trim() || null };
}
