import { supabase } from './supabase';

/** Loại chi phí. Mã khớp với check constraint của bảng expenses. */
export const EXPENSE_CATS: { id: string; name: string; color: string }[] = [
  { id: 'nhap_hang', name: 'Nhập hàng', color: '#296241' },
  { id: 'mat_bang', name: 'Mặt bằng', color: '#7FA88B' },
  { id: 'luong', name: 'Lương', color: '#D9822B' },
  { id: 'dien_nuoc', name: 'Điện nước, internet', color: '#1F6F9C' },
  { id: 'khac', name: 'Khác', color: '#9A9A9A' }
];
export const catName = (id: string | null | undefined) => EXPENSE_CATS.find((c) => c.id === id)?.name || 'Khác';
export const catColor = (id: string | null | undefined) => EXPENSE_CATS.find((c) => c.id === id)?.color || '#9A9A9A';

/** '2026-11-01' → 'tháng 11/2026'; short → 'T11/26' */
export function monthLabel(d: string, short = false) {
  const [y, m] = d.split('-');
  return short ? `T${Number(m)}/${y.slice(2)}` : `tháng ${Number(m)}/${y}`;
}

/** Danh sách tháng từ tháng hiện tại lùi về n tháng, dạng YYYY-MM-01 */
export function lastMonths(n: number, fromMonth: string) {
  const [y, m] = fromMonth.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const STATUS_VN: Record<string, string> = { active: 'Đã bán', reversed: 'Đã hoàn tác', reversal: 'Bản hoàn tác' };
const CHANNEL_VN: Record<string, string> = { counter: 'Tại quầy', voice: 'Đọc giọng nói', aggregate: 'Bổ sung cuối ngày' };

/** CSV: số để trần (Excel hiểu là số), chữ để trong ngoặc kép khi cần. Thêm BOM để Excel đọc đúng tiếng Việt. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (c: string | number | null | undefined) => {
    if (c == null) return '';
    if (typeof c === 'number') return String(c);
    return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n');
}

export function csvDownload(rows: (string | number | null | undefined)[][], filename: string) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[\\/:*?"<>|\s]+/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** File "Đơn hàng": mỗi dòng là một món của một đơn. Không gồm đơn đã hoàn tác. */
export async function exportOrders(outletId: string, from: string, to: string, product: (id: string) => { name: string } | undefined) {
  const { data, error } = await supabase
    .from('orders')
    .select('business_date,seq_in_day,placed_at,status,is_gift,channel,total_vnd,order_lines(product_id,qty,unit_price_vnd,line_total_vnd)')
    .eq('outlet_id', outletId)
    .eq('status', 'active')
    .gte('business_date', from)
    .lt('business_date', to)
    .order('placed_at');
  if (error) throw error;
  const rows: (string | number | null)[][] = [['Ngày', 'Đơn', 'Giờ', 'Trạng thái', 'Loại', 'Kênh', 'Món', 'Số chai', 'Đơn giá', 'Thành tiền']];
  (data || []).forEach((o: any) =>
    (o.order_lines || []).forEach((l: any) =>
      rows.push([
        o.business_date,
        o.seq_in_day,
        new Date(o.placed_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }),
        STATUS_VN[o.status] || o.status,
        o.is_gift ? 'Tặng' : 'Bán',
        CHANNEL_VN[o.channel] || o.channel,
        product(l.product_id)?.name || '',
        l.qty,
        o.is_gift ? 0 : l.unit_price_vnd,
        o.is_gift ? 0 : l.line_total_vnd
      ])
    )
  );
  return rows;
}

/** File "Theo tháng": doanh thu, chi phí, lợi nhuận từng tháng. Nhiều cơ sở thì thêm cột Cơ sở. */
export async function exportMonthly(outletIds: string[], names: Record<string, string>) {
  const { data, error } = await supabase.from('v_monthly_pnl').select('*').in('outlet_id', outletIds).order('month');
  if (error) throw error;
  const multi = outletIds.length > 1;
  const rows: (string | number | null)[][] = [[...(multi ? ['Cơ sở'] : []), 'Tháng', 'Doanh thu', 'Chi phí', 'Lợi nhuận', 'Số chai bán', 'Có số nhập tay']];
  (data || [])
    .sort((a: any, b: any) => (names[a.outlet_id] || '').localeCompare(names[b.outlet_id] || '') || a.month.localeCompare(b.month))
    .forEach((r: any) =>
      rows.push([...(multi ? [names[r.outlet_id] || ''] : []), r.month.slice(0, 7), r.revenue_vnd, r.expense_vnd, r.profit_vnd, r.bottles, r.has_historical ? 'Có' : ''])
    );
  return rows;
}

/** File "Theo ngày" của một tháng (YYYY-MM): doanh thu, chi phí, lợi nhuận từng ngày. */
export async function exportDaily(outletId: string, month: string) {
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('v_daily_pnl').select('*').eq('outlet_id', outletId).gte('business_date', from).lt('business_date', to).order('business_date');
  if (error) throw error;
  const rows: (string | number | null)[][] = [['Ngày', 'Số đơn', 'Số chai bán', 'Doanh thu', 'Chi phí', 'Lợi nhuận']];
  (data || []).forEach((r: any) => rows.push([r.business_date, r.orders_count, r.bottles, r.revenue_vnd, r.expense_vnd, r.profit_vnd]));
  return rows;
}
