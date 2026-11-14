import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { timeHM, vnd } from '../lib/format';
import { Header, Icon, Loading, Nav, reasonDialog, useToast } from '../components/ui';

/** Chi tiết một đơn (mở từ Các đơn trong ngày): món, tiền, khách, cách nhận tiền; hủy đơn bằng bản ghi đảo. */
export default function OrderDetail() {
  const { id } = useParams();
  const { outlet, catalog, bump } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ver, setVer] = useState(0);
  const { data: o, loading } = useLoad(
    async () => {
      const { data } = await supabase.from('orders')
        .select('id,outlet_id,seq_in_day,business_date,placed_at,status,total_vnd,discount_vnd,discount_reason,is_gift,payment_method,customer_name,note,source,channel,order_lines(qty,product_id,container,unit_price_vnd,line_total_vnd)')
        .eq('id', id).maybeSingle();
      return (data as any) || null;
    },
    [id, ver]
  );
  if (!outlet) return null;
  const back = o ? `/bao-cao/don?d=${o.business_date}` : '/bao-cao/don';
  const name = (pid: string) => catalog?.allProducts.find((p) => p.id === pid)?.name || 'Món đã bỏ';
  const d = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

  async function markPay(m: 'cash' | 'transfer') {
    setErr(null);
    setBusy(true);
    const { error } = await supabase.rpc('fn_set_order_info', { p_order: o.id, p_payment: o.payment_method === m ? '' : m });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    setVer((v) => v + 1);
  }

  async function cancel() {
    setErr(null);
    const why = await reasonDialog({
      title: `Hủy đơn số ${o.seq_in_day}?`,
      text: `Đơn ${vnd(o.total_vnd)} sẽ không còn tính vào doanh thu ngày ${d(o.business_date)}. Đơn không bị xóa: vẫn xem được trong Lịch sử kèm lý do hủy.`,
      ok: 'Hủy đơn',
      reason: { label: 'Lý do hủy', placeholder: 'Ví dụ: ghi nhầm món, khách đổi ý', required: true }
    });
    if (!why) return;
    setBusy(true);
    const { error } = await supabase.rpc('fn_reverse_order', { p_order: o.id, p_reason: why });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    toast.show(`Đã hủy đơn số ${o.seq_in_day}`);
    nav(back, { replace: true });
  }

  const subtotal = o ? o.order_lines.reduce((a: number, l: any) => a + l.qty * l.unit_price_vnd, 0) : 0;
  const parts = o ? o.order_lines.reduce((a: number, l: any) => a + l.qty, 0) : 0;
  const active = o?.status === 'active';

  return (
    <div className="screen">
      <Header title={o ? `Đơn số ${o.seq_in_day}` : 'Chi tiết đơn'} sub={outlet.name} back={back} />
      <main className="main">
        {loading && !o ? (
          <Loading />
        ) : !o ? (
          <section className="card">
            <strong>Không tìm thấy đơn này</strong>
            <span className="small muted">Đơn có thể thuộc cơ sở khác, hoặc đường dẫn đã cũ. Quay lại danh sách đơn để chọn lại.</span>
          </section>
        ) : (
          <>
            <section className="card" style={{ gap: 2 }}>
              <span className="small strong muted">{timeHM(o.placed_at)} · {d(o.business_date)} · {parts} phần</span>
              <span style={{ fontSize: 28, fontWeight: 700, textDecoration: active ? undefined : 'line-through' }} className="num">{vnd(o.total_vnd)}</span>
              <span className="small">
                {o.customer_name || 'Khách lẻ'}
                {o.is_gift ? ' · đơn tặng' : ''}{o.channel === 'aggregate' ? ' · đơn bổ sung cuối ngày' : ''}{o.source === 'import' ? ' · nhập từ Knote' : ''}
              </span>
              {!active && <span className="small strong" style={{ color: 'var(--danger)' }}>Đơn này đã hủy</span>}
            </section>

            <section className="card tight">
              <div className="h2" style={{ padding: '12px 0 2px' }}>Món</div>
              {o.order_lines.map((l: any, i: number) => (
                <div key={i} className="list-row" style={{ minHeight: 44 }}>
                  <span className="grow">
                    <span className="strong">{l.qty} × {name(l.product_id)}{l.container === 'coc' ? ' · cốc giấy' : ''}</span>
                    <span className="xs muted" style={{ display: 'block' }}>{vnd(l.unit_price_vnd)} mỗi phần</span>
                  </span>
                  <span className="num strong">{vnd(l.qty * l.unit_price_vnd)}</span>
                </div>
              ))}
              {o.discount_vnd > 0 && (
                <>
                  <div className="row between small" style={{ padding: '8px 0 0' }}><span>Tạm tính</span><span className="num">{vnd(subtotal)}</span></div>
                  <div className="row between small"><span>Giảm giá{o.discount_reason ? ` (${o.discount_reason})` : ''}</span><span className="num">− {vnd(o.discount_vnd)}</span></div>
                </>
              )}
              <div className="row between" style={{ padding: '10px 0 12px' }}><span className="strong">Tổng tiền</span><span className="num strong">{vnd(o.total_vnd)}</span></div>
            </section>

            {active && !o.is_gift && (
              <section className="card">
                <div className="h2">Đã nhận tiền</div>
                <div className="grid2">
                  <button type="button" className={`btn ${o.payment_method === 'cash' ? '' : 'secondary'}`} aria-pressed={o.payment_method === 'cash'} disabled={busy} onClick={() => markPay('cash')}>
                    {o.payment_method === 'cash' && <Icon name="check" size={18} sw={2.2} />} Tiền mặt
                  </button>
                  <button type="button" className={`btn ${o.payment_method === 'transfer' ? '' : 'secondary'}`} aria-pressed={o.payment_method === 'transfer'} disabled={busy} onClick={() => markPay('transfer')}>
                    {o.payment_method === 'transfer' && <Icon name="check" size={18} sw={2.2} />} C.khoản
                  </button>
                </div>
                <span className="xs muted">{o.payment_method ? 'Bấm lại lần nữa để bỏ đánh dấu.' : 'Chưa đánh dấu cách nhận tiền.'}</span>
              </section>
            )}
            {!active && o.payment_method && <p className="small muted">Cách nhận tiền đã ghi: {o.payment_method === 'cash' ? 'tiền mặt' : 'chuyển khoản'}.</p>}

            {o.note && (
              <section className="card">
                <div className="h2">Ghi chú</div>
                <span className="small">{o.note}</span>
              </section>
            )}

            {err && <span className="err">{err}</span>}
            {active && (
              <button className="btn secondary block" disabled={busy} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={cancel}>
                <Icon name="trash" size={18} sw={2} /> Hủy đơn này…
              </button>
            )}
            {active && <p className="xs muted">Hủy được khi ngày đó chưa chốt. Chỉ người ghi đơn hoặc chủ cơ sở hủy được.</p>}
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
