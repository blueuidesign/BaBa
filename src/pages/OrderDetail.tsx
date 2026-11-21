import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { timeHM, vnd, vnToday } from '../lib/format';
import { pctOf, savedLabel } from '../lib/discount';
import { Header, Icon, Loading, Nav, confirmDialog, reasonDialog, useToast } from '../components/ui';

/** Chi tiết một đơn (mở từ Các đơn trong ngày): món, tiền, khách, cách nhận tiền; hủy đơn bằng bản ghi đảo. */
export default function OrderDetail() {
  const { id } = useParams();
  const { outlet, catalog, bump, canManage } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ver, setVer] = useState(0);
  const { data: o, loading } = useLoad(
    async () => {
      const { data } = await supabase.from('orders')
        .select('id,outlet_id,seq_in_day,business_date,placed_at,status,total_vnd,discount_vnd,discount_reason,discount_kind,discount_value,is_gift,payment_method,customer_name,note,source,channel,order_lines(qty,product_id,container,sugar,unit_price_vnd,discount_qty,discount_unit_vnd,line_total_vnd)')
        .eq('id', id).maybeSingle();
      return (data as any) || null;
    },
    [id, ver]
  );
  if (!outlet) return null;
  // Mở từ Trang chủ thì quay lại Trang chủ; mở từ Báo cáo thì về danh sách đơn của ngày đó
  const fromHome = new URLSearchParams(useLocation().search).get('from') === 'home';
  const back = fromHome ? '/' : o ? `/bao-cao/don?d=${o.business_date}` : '/bao-cao/don';
  const name = (pid: string) => catalog?.allProducts.find((p) => p.id === pid)?.name || 'Món đã bỏ';
  const d = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

  /** Đánh dấu giống màn Hóa đơn: Đơn tặng, Nhận t.mặt, Nhận c.khoản. Đã đánh dấu thì chỉ đổi qua Sửa đơn. */
  async function markPay(m: 'cash' | 'transfer' | 'gift') {
    if (busy || o.payment_method || o.is_gift) return;
    setErr(null);
    if (m === 'gift' && !(await confirmDialog({ title: 'Đánh dấu đơn tặng?', text: `Đơn ${vnd(o.total_vnd)} sẽ tính 0 đ, hàng vẫn trừ, số đơn giữ nguyên. Sau khi đánh dấu, muốn đổi lại phải vào Sửa đơn.`, ok: 'Đơn tặng', cancel: 'Thôi' }))) return;
    setBusy(true);
    const { error } = m === 'gift'
      ? await supabase.rpc('fn_set_order_gift', { p_order: o.id, p_gift: true })
      : await supabase.rpc('fn_set_order_info', { p_order: o.id, p_payment: m });
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
  // Nhân viên sửa, hủy được đơn trong 7 ngày gần nhất (0064); chủ cơ sở không giới hạn
  const canFix = canManage || (!!o && o.business_date >= vnToday(-6));
  const discText = o && o.discount_vnd > 0 ? savedLabel(o, o.order_lines) : '';
  const lineDisc = (l: any) => o?.discount_kind === 'order' ? `Phần chia giảm tổng đơn · ${l.discount_qty} phần × ${vnd(l.discount_unit_vnd)}`
    : o?.discount_kind === 'per_part' ? `Giảm · ${l.discount_qty} phần × ${vnd(l.discount_unit_vnd)}`
    : `Giảm ${pctOf(l.unit_price_vnd, l.discount_unit_vnd)}% · ${l.discount_qty} phần × ${vnd(l.discount_unit_vnd)}`;

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
                    <span className="strong">{l.qty} × {name(l.product_id)}{l.container === 'coc' ? ' · cốc giấy' : ''}{l.sugar === 'less' && <span className="less-tag" style={{ marginLeft: 6 }}>ít đường</span>}</span>
                    <span className="xs muted" style={{ display: 'block' }}>{vnd(l.unit_price_vnd)} mỗi phần</span>
                    {l.discount_qty > 0 && <span className="xs strong" style={{ display: 'block', color: 'var(--ink-brand)' }}>{lineDisc(l)}</span>}
                  </span>
                  <span className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span className="strong" style={{ display: 'block' }}>{vnd(l.qty * l.unit_price_vnd)}</span>
                    {l.discount_qty > 0 && <span className="xs strong" style={{ color: 'var(--ink-brand)' }}>− {vnd(l.discount_qty * l.discount_unit_vnd)}</span>}
                  </span>
                </div>
              ))}
              {o.discount_vnd > 0 && (
                <>
                  <div className="row between small" style={{ padding: '8px 0 0' }}><span>Tạm tính</span><span className="num">{vnd(subtotal)}</span></div>
                  <div className="row between small"><span>{discText || 'Giảm giá'}{o.discount_reason ? ` (${o.discount_reason})` : ''}</span><span className="num">− {vnd(o.discount_vnd)}</span></div>
                </>
              )}
              <div className="row between" style={{ padding: '10px 0 12px' }}><span className="strong">Tổng tiền</span><span className="num strong">{vnd(o.total_vnd)}</span></div>
            </section>

            {active && (
              <section className="card">
                <div className="h2">Nhận tiền</div>
                <div className="seg3 seg3-gift" role="group" aria-label="Đánh dấu nhận tiền">
                  {([['gift', 'Đơn tặng'], ['cash', 'Nhận t.mặt'], ['transfer', 'Nhận c.khoản']] as ['cash' | 'transfer' | 'gift', string][]).map(([k, l]) => {
                    const on = o.is_gift ? 'gift' : o.payment_method;
                    return (
                      <button key={k} type="button" aria-pressed={on === k} className={on === k ? 'on' : ''} disabled={busy || (!!on && on !== k)}
                        aria-disabled={!!on} style={on === k ? { cursor: 'default' } : undefined} onClick={() => markPay(k)}>
                        {on === k && <Icon name="check" size={15} sw={2.6} />}{l}
                      </button>
                    );
                  })}
                </div>
                <span className="xs muted">
                  {o.is_gift || o.payment_method
                    ? `Đã đánh dấu. Muốn đổi thì ${canFix ? 'bấm Sửa đơn bên dưới.' : 'nhờ chủ cơ sở sửa đơn.'}`
                    : 'Chưa đánh dấu. Bấm một lần là ghi; sau đó muốn đổi phải vào Sửa đơn.'}
                </span>
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
            {active && canFix && (
              <div className="grid2">
                <Link to={`/bao-cao/don/${o.id}/sua${fromHome ? '?from=home' : ''}`} className="btn secondary" style={{ textDecoration: 'none' }}>
                  <Icon name="history" size={18} sw={2} /> Sửa đơn
                </Link>
                <button className="btn secondary" disabled={busy} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={cancel}>
                  <Icon name="trash" size={18} sw={2} /> Hủy đơn…
                </button>
              </div>
            )}
            {active && (
              <p className="xs muted">
                {canManage ? 'Sửa và hủy được khi ngày đó chưa chốt. Mỗi lần sửa, hủy đều ghi vào Lịch sử sửa, hủy đơn trong Tài khoản.' : canFix ? 'Bạn sửa, hủy được đơn trong 7 ngày gần nhất. Mỗi lần sửa, hủy đều được ghi lại để chủ cơ sở xem.' : 'Đơn đã quá 7 ngày, chỉ chủ cơ sở sửa hoặc hủy được. Cách nhận tiền thì bạn vẫn đánh dấu được.'}
              </p>
            )}
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
