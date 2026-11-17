import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';

type Row = { name: string; orders: number; parts: number; ever: number };
const keyOf = (s: string | null) => String(s || '').trim().toLowerCase();
const isWalkIn = (k: string) => !k || k === 'khách lẻ';

/** Lấy hết đơn theo trang 1.000 dòng (giới hạn mặc định của API), tối đa 10 trang. */
async function fetchAll(build: (from: number, to: number) => any) {
  const out: any[] = [];
  for (let p = 0; p < 10; p++) {
    const { data } = await build(p * 1000, p * 1000 + 999);
    out.push(...((data || []) as any[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Khách mua nhiều đơn nhất (Tùng 17/11). Khách nhận theo tên ghi trên đơn, không phân biệt hoa thường.
 * Không tính "Khách lẻ", đơn không tên và đơn tặng.
 * - Kỳ là một ngày: liệt kê khách mua trong ngày, xếp theo tổng số đơn từ trước đến giờ.
 * - Kỳ là tuần, tháng, khoảng ngày: xếp theo số đơn trong kỳ.
 */
export default function TopCustomers({ from, to }: { from: string; to: string }) {
  const [all, setAll] = useState(false);
  const single = new Date(from + 'T00:00:00Z').getTime() + 86400000 === new Date(to + 'T00:00:00Z').getTime();
  const { data } = useLoad(async (oid) => {
    const inPeriod = await fetchAll((a, b) => supabase.from('orders').select('customer_name,order_lines(qty)')
      .eq('outlet_id', oid).eq('status', 'active').eq('is_gift', false).gte('business_date', from).lt('business_date', to).order('placed_at').range(a, b));
    const m = new Map<string, Row>();
    let walkOrders = 0, walkParts = 0;
    for (const o of inPeriod) {
      const k = keyOf(o.customer_name);
      const parts = ((o.order_lines || []) as any[]).reduce((s, l) => s + (l.qty || 0), 0);
      if (isWalkIn(k)) { walkOrders++; walkParts += parts; continue; }
      const r = m.get(k) || { name: String(o.customer_name).trim(), orders: 0, parts: 0, ever: 0 };
      r.orders++; r.parts += parts;
      m.set(k, r);
    }
    if (single && m.size) {
      // Tổng số đơn từ trước đến giờ của các khách có mua trong ngày
      const ever = await fetchAll((a, b) => supabase.from('orders').select('customer_name')
        .eq('outlet_id', oid).eq('status', 'active').eq('is_gift', false).not('customer_name', 'is', null).lt('business_date', to).order('placed_at').range(a, b));
      for (const o of ever) { const r = m.get(keyOf(o.customer_name)); if (r) r.ever++; }
    }
    const rows = [...m.values()].sort((x, y) => (single ? y.ever - x.ever : 0) || y.orders - x.orders || y.parts - x.parts || x.name.localeCompare(y.name, 'vi'));
    return { rows, walkOrders, walkParts };
  }, [from, to]);

  if (!data) return null;
  const rows = all ? data.rows : data.rows.slice(0, 10);
  const cols = single ? '1fr 44px 44px 64px' : '1fr 56px 56px';
  const cell = { textAlign: 'right' as const };
  return (
    <section className="card">
      <div className="h2">Khách mua nhiều đơn nhất</div>
      {data.rows.length === 0 ? (
        <span className="small muted">Kỳ này chưa có đơn nào ghi tên khách. Ghi tên khách lúc lưu đơn thì bảng này mới có số.</span>
      ) : (
        <div role="table" aria-label="Khách mua nhiều đơn nhất" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <div role="row" className="xs muted strong" style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
            <span role="columnheader">Khách</span>
            <span role="columnheader" style={cell}>Đơn</span>
            <span role="columnheader" style={cell}>Phần</span>
            {single && <span role="columnheader" style={cell}>Tổng đơn</span>}
          </div>
          {rows.map((r) => (
            <div role="row" key={r.name} className="small" style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span role="cell" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <strong role="cell" style={cell}>{r.orders}</strong>
              <span role="cell" style={cell}>{r.parts}</span>
              {single && <span role="cell" className="muted" style={cell}>{r.ever}</span>}
            </div>
          ))}
        </div>
      )}
      {data.rows.length > 10 && (
        <button type="button" className="small strong" style={{ border: 0, background: 'transparent', padding: '4px 0', color: 'var(--ink-brand)', cursor: 'pointer', textAlign: 'left' }} onClick={() => setAll((v) => !v)}>
          {all ? 'Thu gọn' : `Xem cả ${data.rows.length} khách`}
        </button>
      )}
      <p className="xs muted">
        {single ? 'Khách mua trong ngày, xếp theo tổng số đơn từ trước đến giờ (cột Tổng đơn).' : 'Xếp theo số đơn trong kỳ.'} Tính theo tên ghi trên đơn; không tính đơn tặng.
        {data.walkOrders > 0 ? ` Khách lẻ, không ghi tên: ${data.walkOrders} đơn, ${data.walkParts} phần.` : ''}
      </p>
    </section>
  );
}
