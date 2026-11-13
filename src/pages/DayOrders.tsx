import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { addDays } from '../lib/period';
import { timeHM, vnd, vnToday, weekdayLabel } from '../lib/format';
import { Header, Icon, Loading, Nav } from '../components/ui';

/** Các đơn trong một ngày (mở từ Báo cáo): giờ, khách, số phần, cách nhận tiền; bấm một đơn để xem từng món. */
export default function DayOrders() {
  const { outlet, catalog, canManage } = useApp();
  const [sp, setSp] = useSearchParams();
  const today = vnToday();
  const q = sp.get('d') || today;
  // Nhân viên chỉ xem được hôm nay, giống tab Ngày của Báo cáo
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= today && (canManage || q === today) ? q : today;
  const [open, setOpen] = useState<string | null>(null);
  const { data: orders } = useLoad(
    async (oid) => {
      const { data } = await supabase.from('orders')
        .select('id,seq_in_day,placed_at,total_vnd,discount_vnd,is_gift,payment_method,customer_name,note,source,channel,order_lines(qty,product_id,unit_price_vnd)')
        .eq('outlet_id', oid).eq('business_date', day).eq('status', 'active').order('placed_at', { ascending: false });
      return (data || []) as any[];
    },
    [day]
  );
  if (!outlet) return null;
  const name = (pid: string) => catalog?.allProducts.find((p) => p.id === pid)?.name || 'Món đã bỏ';
  const go = (d: string) => { setOpen(null); setSp({ d }, { replace: true }); };
  const total = (orders || []).reduce((a, o) => a + o.total_vnd, 0);
  const parts = (orders || []).reduce((a, o) => a + o.order_lines.reduce((x: number, l: any) => x + l.qty, 0), 0);
  const dmy = `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

  return (
    <div className="screen">
      <Header title="Các đơn trong ngày" sub={outlet.name} back="/bao-cao" />
      <main className="main">
        <div className="row between">
          <button className="icon-btn" aria-label="Ngày trước" disabled={!canManage} style={!canManage ? { opacity: 0.3 } : undefined} onClick={() => go(addDays(day, -1))}>
            <Icon name="back" size={20} sw={2} />
          </button>
          <span className="strong">{day === today ? 'Hôm nay' : weekdayLabel(day).split(',')[0]} · {dmy}</span>
          <button className="icon-btn" aria-label="Ngày sau" disabled={day >= today} style={day >= today ? { opacity: 0.3 } : undefined} onClick={() => go(addDays(day, 1))}>
            <Icon name="chev" size={20} sw={2} />
          </button>
        </div>
        {!orders ? (
          <Loading />
        ) : (
          <>
            <section className="card" style={{ gap: 2 }}>
              <span className="small strong muted">{orders.length} đơn · {parts} phần</span>
              <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{vnd(total)}</span>
            </section>
            <section className="card tight">
              {orders.length === 0 && <p className="small muted" style={{ padding: '12px 0' }}>Ngày này chưa có đơn nào.</p>}
              {orders.map((o: any, i: number) => {
                const isOpen = open === o.id;
                const n = o.order_lines.reduce((a: number, l: any) => a + l.qty, 0);
                const payL = o.payment_method === 'cash' ? 'Tiền mặt' : o.payment_method === 'transfer' ? 'Chuyển khoản' : 'Chưa ghi cách nhận tiền';
                return (
                  <div key={o.id} style={{ borderBottom: i < orders.length - 1 ? '1px solid var(--border)' : 0 }}>
                    <button type="button" className="list-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : o.id)}
                      style={{ border: 0, background: 'transparent', width: '100%', textAlign: 'left', minHeight: 56, padding: '6px 0', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                      <span className="small muted num" style={{ width: 44, flexShrink: 0 }}>{timeHM(o.placed_at)}</span>
                      <span className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span className="strong">{o.customer_name || 'Khách lẻ'}</span>
                        <span className="xs muted">{n} phần · {o.is_gift ? 'tặng' : payL}{o.channel === 'aggregate' ? ' · đơn bổ sung' : ''}</span>
                      </span>
                      <span className="strong num">{vnd(o.total_vnd)}</span>
                      <Icon name="chev" size={16} style={{ color: 'var(--ink-muted)', transform: isOpen ? 'rotate(90deg)' : undefined }} />
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 0 12px 44px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {o.order_lines.map((l: any, k: number) => (
                          <div key={k} className="row between small">
                            <span>{l.qty} × {name(l.product_id)}</span>
                            <span className="num muted">{vnd(l.qty * l.unit_price_vnd)}</span>
                          </div>
                        ))}
                        {o.discount_vnd > 0 && <div className="row between small"><span>Giảm giá</span><span className="num muted">− {vnd(o.discount_vnd)}</span></div>}
                        <span className="xs muted">Đơn số {o.seq_in_day} · {payL}{o.source === 'import' ? ' · nhập từ Knote' : ''}</span>
                        {o.note && <span className="xs muted">{o.note}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
