export const vnd = (n: number | null | undefined) =>
  `${Math.round(n ?? 0).toLocaleString('vi-VN')} đ`;

/** 16.400.000 → "16,4 tr" ; 760.000 → "760.000 đ" */
export const vndShort = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`
    : vnd(n);

export const num = (n: number | null | undefined, digits = 0) =>
  (n ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: digits });

export const unitLabel = (u: string) => (u === 'cai' ? 'cái' : u);

export const qty = (n: number | null | undefined, unit: string) => `${num(n, 1)} ${unitLabel(unit)}`;

/** Ngày nghiệp vụ theo giờ Việt Nam, dạng YYYY-MM-DD */
export function vnToday(offsetDays = 0): string {
  const now = new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return now.toISOString().slice(0, 10);
}

export function ddmm(d: string) {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export function weekdayLabel(d: string) {
  const date = new Date(`${d}T12:00:00+07:00`);
  return `${WEEKDAYS[date.getUTCDay()]}, ${ddmm(d)}`;
}

export function timeHM(ts: string) {
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
}

export function dateVN(ts: string) {
  return new Date(ts).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export const uuid = () =>
  (crypto as any).randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
