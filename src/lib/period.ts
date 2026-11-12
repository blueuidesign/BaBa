import { monthLabel } from './reports';
import { ddmm, vnToday } from './format';

export type Range = 'day' | 'week' | 'month' | 'all';

/** '2026-11-01' + n tháng */
export function addMonths(m: string, n: number) {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number) {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
/** Thứ Hai của tuần chứa ngày d */
export function mondayOf(d: string) {
  const x = new Date(`${d}T12:00:00Z`);
  return addDays(d, -((x.getUTCDay() + 6) % 7));
}
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Kỳ báo cáo (quyết định 12/11): Ngày · Tuần · Tháng · Toàn bộ; off lùi về kỳ trước (‹ ›).
 *  Trả [từ, tới (không gồm), kỳ trước từ, kỳ trước tới, nhãn] */
export function rangeOf(r: Range, off: number, allFrom: string): [string, string, string | null, string | null, string] {
  const today = vnToday();
  const thisMonth = today.slice(0, 7) + '-01';
  if (r === 'day') {
    const d = addDays(today, off);
    return [d, addDays(d, 1), addDays(d, -1), d, off === 0 ? `Hôm nay · ${ddmm(d)}` : `${WD[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${ddmm(d)}`];
  }
  if (r === 'week') {
    const w = addDays(mondayOf(today), 7 * off);
    return [w, addDays(w, 7), addDays(w, -7), w, `${off === 0 ? 'Tuần này' : 'Tuần'} ${ddmm(w)} – ${ddmm(addDays(w, 6))}`];
  }
  if (r === 'month') {
    const m = addMonths(thisMonth, off);
    return [m, addMonths(m, 1), addMonths(m, -1), m, `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`];
  }
  return [allFrom, addMonths(thisMonth, 1), null, null, `Từ ${monthLabel(allFrom)}`];
}

