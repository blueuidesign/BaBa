import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { addDays, rangeOf } from '../lib/period';
import { timeHM, vnd, vnToday, weekdayLabel } from '../lib/format';
import { Empty, Header, Icon, Loading, Nav, confirmDialog, useToast } from '../components/ui';

const PAGE = 40;
type Range = 'today' | 'yesterday' | 'month' | 'all' | 'day';
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * Hóa đơn: mọi đơn đã ghi của cơ sở, lọc theo Hôm nay, Hôm qua, Tháng này, Tất cả.
 * Mỗi đơn một thẻ: nửa trên bấm để mở chi tiết; nửa dưới đánh dấu Đơn tặng, Nhận t.mặt, Nhận c.khoản.
 * Chỉ đơn chưa đánh dấu mới bấm được; đã đánh dấu thì ô đó nền xanh, muốn đổi phải vào Sửa đơn.
 * Mở từ Trang chủ (nút Tất cả ở Đơn gần đây) và từ Báo cáo (?d=ngày).
 */
export default function Invoices() {
  const { outlet, catalog, canManage, bump, dataVersion } = useApp();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const today = vnToday();
  const yesterday = addDays(today, -1);
  const d = sp.get('d');
  const pinned = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < yesterday && canManage ? d : null; // ngày cụ thể mở từ Báo cáo
  const q = sp.get('loc');
  // Nhân viên: Ngày · Tuần (không xem Tháng, Tùng 17/11 08:44), bấm lùi xem các kỳ trước (Tùng 17/11). Chủ cơ sở giữ Hôm nay, Hôm qua, Tháng này, Tất cả.
  const sk = sp.get('ky');
  const sRange: 'day' | 'week' = sk === 'week' ? sk : 'day';
  const dOff = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? Math.round((Date.parse(d) - Date.parse(today)) / 86400000) : 0;
  const sOff = Math.min(0, Number(sp.get('off')) || (sk ? 0 : dOff));
  const sBase = rangeOf(sRange, sOff, today);
  const range: Range = !canManage ? 'day' : pinned ? 'day' : d === yesterday || q === 'hom-qua' ? 'yesterday' : q === 'thang' ? 'month' : q === 'tat-ca' ? 'all' : 'today';
  const from = !canManage ? sBase[0] : range === 'today' ? today : range === 'yesterday' ? yesterday : range === 'day' ? pinned! : range === 'month' ? today.slice(0, 8) + '01' : null;
  const to = !canManage ? (addDays(sBase[1], -1) < today ? addDays(sBase[1], -1) : today) : range === 'yesterday' ? yesterday : range === 'day' ? pinned! : today;

  const [rows, setRows] = useState<any[] | null>(null);
  const [more, setMore] = useState(false);
  const [days, setDays] = useState<Record<string, { orders: number; parts: number; revenue: number }>>({});
  const [unpaid, setUnpaid] = useState<{ n: number; vnd: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; text: string } | null>(null);

  async function load(offset: number) {
    if (!outlet) return;
    let qy = supabase.from('orders')
      .select('id,seq_in_day,business_date,placed_at,total_vnd,discount_vnd,is_gift,payment_method,customer_name,channel,order_lines(qty,product_id,container,discount_qty,discount_unit_vnd)')
      .eq('outlet_id', outlet.id).eq('status', 'active').lte('business_date', to)
      .order('business_date', { ascending: false }).order('placed_at', { ascending: false }).range(offset, offset + PAGE - 1);
    if (from) qy = qy.gte('business_date', from);
    const { data } = await qy;
    const got = (data || []) as any[];
    setRows((r) => (offset === 0 ? got : [...(r || []), ...got]));
    setMore(got.length === PAGE);
    if (offset === 0) {
      let dq = supabase.from('v_daily_sales').select('business_date,orders_count,bottles,revenue_vnd').eq('outlet_id', outlet.id).lte('business_date', to);
      if (from) dq = dq.gte('business_date', from);
      const { data: ds } = await dq;
      setDays(Object.fromEntries(((ds || []) as any[]).map((x) => [x.business_date, { orders: x.orders_count, parts: x.bottles, revenue: x.revenue_vnd }])));
      // Chưa nhận: đơn chưa đánh dấu nhận tiền và không phải đơn tặng, trong cùng khoảng ngày
      let n = 0, v = 0;
      for (let off = 0; ; off += 1000) {
        let uq = supabase.from('orders').select('total_vnd').eq('outlet_id', outlet.id).eq('status', 'active').eq('is_gift', false)
          .is('payment_method', null).gt('total_vnd', 0).lte('business_date', to).order('id').range(off, off + 999);
        if (from) uq = uq.gte('business_date', from);
        const { data: us } = await uq;
        const got2 = (us || []) as any[];
        n += got2.length;
        v += got2.reduce((a, x) => a + x.total_vnd, 0);
        if (got2.length < 1000) break;
      }
      setUnpaid({ n, vnd: v });
    }
  }
  useEffect(() => {
    setRows(null);
    setErr(null);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet?.id, range, pinned, dataVersion, from, to]);

  if (!outlet) return null;
  const name = (pid: string) => catalog?.allProducts.find((x) => x.id === pid)?.name || 'Món đã bỏ';
  const pick = (r: Range) => setSp(r === 'today' ? {} : { loc: r === 'yesterday' ? 'hom-qua' : r === 'month' ? 'thang' : 'tat-ca' }, { replace: true });
  const sum = Object.values(days).reduce((a, x) => ({ orders: a.orders + x.orders, parts: a.parts + x.parts, revenue: a.revenue + x.revenue }), { orders: 0, parts: 0, revenue: 0 });

  /** Đánh dấu cho đơn CHƯA đánh dấu. Đơn đã đánh dấu thì muốn đổi phải vào Sửa đơn (chủ cơ sở). */
  async function mark(o: any, k: 'cash' | 'transfer' | 'gift') {
    if (busyId || o.payment_method || o.is_gift) return;
    setErr(null);
    if (k === 'gift' && !(await confirmDialog({ title: 'Đánh dấu đơn tặng?', text: `Đơn ${vnd(o.total_vnd)} sẽ tính 0 đ, hàng vẫn trừ, số đơn giữ nguyên. Sau khi đánh dấu, muốn đổi lại phải vào Sửa đơn.`, ok: 'Đơn tặng', cancel: 'Thôi' }))) return;
    setBusyId(o.id);
    const { error } = k === 'gift'
      ? await supabase.rpc('fn_set_order_gift', { p_order: o.id, p_gift: true })
      : await supabase.rpc('fn_set_order_info', { p_order: o.id, p_payment: k });
    setBusyId(null);
    if (error) return setErr({ id: o.id, text: errorText(error) });
    toast.show('Đã đánh dấu');
    bump();
  }

  let lastDay = '';
  return (
    <div className="screen">
      <Header title="Hóa đơn" sub={outlet.name} back />
      <main className="main">
        {!canManage && (
          <>
            <div className="chips fit4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {([['day', 'Ngày'], ['week', 'Tuần']] as ['day' | 'week', string][]).map(([k, l]) => (
                <button key={k} type="button" className={`chip ${sRange === k ? 'on' : ''}`} aria-pressed={sRange === k} onClick={() => setSp(k === 'day' ? {} : { ky: k }, { replace: true })}>{l}</button>
              ))}
            </div>
            <div className="row between" style={{ marginTop: -6 }}>
              <button className="icon-btn" aria-label="Kỳ trước" onClick={() => setSp({ ky: sRange, off: String(sOff - 1) }, { replace: true })}><Icon name="back" size={20} sw={2} /></button>
              <span className="strong">{sBase[4]}</span>
              <button className="icon-btn" aria-label="Kỳ sau" disabled={sOff >= 0} style={sOff >= 0 ? { opacity: 0.3 } : undefined} onClick={() => setSp({ ky: sRange, off: String(sOff + 1) }, { replace: true })}><Icon name="chev" size={20} sw={2} /></button>
            </div>
          </>
        )}
        {canManage && <div className="chips">
          {pinned && <button type="button" className="chip on" aria-pressed>{dmy(pinned)}</button>}
          {([['today', 'Hôm nay'], ['yesterday', 'Hôm qua'], ['month', 'Tháng này'], ['all', 'Tất cả']] as [Range, string][])
            .map(([k, l]) => <button key={k} type="button" className={`chip ${range === k ? 'on' : ''}`} aria-pressed={range === k} onClick={() => pick(k)}>{l}</button>)}
        </div>}
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon="cart" title={(canManage ? range === 'today' : sRange === 'day' && sOff === 0) ? 'Hôm nay chưa có đơn nào' : 'Không có đơn nào trong khoảng này'} text="Đơn ghi ở màn Bán sẽ hiện ở đây.">
            <Link to="/ban" className="btn">Ghi đơn</Link>
          </Empty>
        ) : (
          <>
            <section className="card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <span className="small strong muted">{sum.orders} đơn · {sum.parts} phần</span>
                <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{vnd(sum.revenue)}</span>
              </div>
              {unpaid && <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />}
              {unpaid && (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 2, flex: 1, minWidth: 0 }}>
                  <span className="small strong muted">{unpaid.n > 0 ? `Chưa nhận · ${unpaid.n} đơn` : 'Chưa nhận'}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: unpaid.vnd > 0 ? 'var(--warn)' : 'var(--ink-muted)' }} className="num">{vnd(unpaid.vnd)}</span>
                </div>
              )}
            </section>
            {rows.map((o: any) => {
              const head = o.business_date !== lastDay;
              lastDay = o.business_date;
              const dd = days[o.business_date];
              const busy = busyId === o.id;
              const on = o.is_gift ? 'gift' : o.payment_method;
              return (
                <div key={o.id} style={{ display: 'contents' }}>
                  {head && range !== 'today' && range !== 'yesterday' && range !== 'day' && (
                    <div className="row between small strong" style={{ padding: '4px 4px 0' }}>
                      <span>{o.business_date === today ? 'Hôm nay' : weekdayLabel(o.business_date).split(',')[0]}, {dmy(o.business_date)}</span>
                      {dd && <span className="num" style={{ color: 'var(--ink-brand)' }}>{dd.orders} đơn · {vnd(dd.revenue)}</span>}
                    </div>
                  )}
                  <article className="inv">
                    <Link to={`/bao-cao/don/${o.id}`} className="inv-top" aria-label={`Đơn số ${o.seq_in_day} lúc ${timeHM(o.placed_at)}, ${vnd(o.total_vnd)}. Mở chi tiết`}>
                      <span className="row between">
                        <span className="small muted num">{timeHM(o.placed_at)} · đơn số {o.seq_in_day}{o.channel === 'aggregate' ? ' · bổ sung' : ''}</span>
                        <Icon name="chev" size={18} style={{ color: 'var(--ink-muted)' }} />
                      </span>
                      <span className="strong" style={{ fontSize: 16 }}>{o.customer_name || 'Khách lẻ'}</span>
                      {o.order_lines.map((l: any, i: number) => (
                        <span key={i} style={{ display: 'contents' }}>
                          <span className="ln"><span>{name(l.product_id)}{l.container === 'coc' ? ' · cốc giấy' : ''}</span><span className="num">× {l.qty}</span></span>
                          {l.discount_qty > 0 && (
                            <span className="line-disc" style={{ marginTop: -4 }}><span>Giảm 10% · {l.discount_qty} phần × {vnd(l.discount_unit_vnd)}</span><span>− {vnd(l.discount_qty * l.discount_unit_vnd)}</span></span>
                          )}
                        </span>
                      ))}
                      <span className="row" style={{ justifyContent: 'flex-end', gap: 8, alignItems: 'baseline' }}>
                        {o.discount_vnd > 0 && <span className="xs muted num">đã giảm {vnd(o.discount_vnd)}</span>}
                        <span className="small muted">Tổng cộng</span>
                        <span className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-brand)' }}>{vnd(o.total_vnd)}</span>
                      </span>
                    </Link>
                    <div className="inv-bot">
                      <div className="seg3" role="group" aria-label="Đánh dấu nhận tiền">
                        {([['gift', 'Đơn tặng'], ['cash', 'Nhận t.mặt'], ['transfer', 'Nhận c.khoản']] as ['cash' | 'transfer' | 'gift', string][]).map(([k, l]) => (
                          <button key={k} type="button" aria-pressed={on === k} className={on === k ? 'on' : ''} disabled={busy || (!!on && on !== k)}
                            aria-disabled={!!on} style={on === k ? { cursor: 'default' } : undefined} onClick={() => mark(o, k)}>
                            {on === k && <Icon name="check" size={15} sw={2.6} />}{l}
                          </button>
                        ))}
                      </div>
                      {err && err.id === o.id && <span className="err" style={{ display: 'block', marginTop: 8 }}>{err.text}</span>}
                    </div>
                  </article>
                </div>
              );
            })}
            {more && <button className="btn secondary block" onClick={() => load(rows.length)}>Xem thêm</button>}
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
