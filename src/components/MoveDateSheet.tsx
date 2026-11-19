import { useState } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { ddmm, vnd, vnToday } from '../lib/format';
import { Icon } from './ui';

export type MoveOrder = { id: string; seq: number; date: string; time: string; customer: string; total: number; cash: boolean; parts: number };
export type MoveResult = { business_date: string; moved: { from_id: string; id: string; seq_in_day: number; from_seq: number; from_date: string }[] };

/** Đổi ngày bán cho một hoặc nhiều đơn (thiết kế X07, X10; migration 0063 fn_move_orders).
 *  Chỉ chủ cơ sở, quản trị. Trong 7 ngày gần nhất, không sang ngày sau hôm nay. Làm nguyên khối. */
export default function MoveDateSheet({ outletId, orders, onClose, onDone }: {
  outletId: string; orders: MoveOrder[]; onClose: () => void; onDone: (r: MoveResult) => void;
}) {
  const today = vnToday();
  const minDay = vnToday(-6);
  const srcDates = [...new Set(orders.map((o) => o.date))].sort();
  const single = srcDates.length === 1 ? srcDates[0] : null;
  const quick = [vnToday(-2), vnToday(-1), today];
  const [to, setTo] = useState<string | null>(quick.find((d) => !srcDates.includes(d) && d > (single || '')) ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Ngày cũ đã ghi cuối ngày và đếm tiền: báo trước là sẽ lệch
  const { data: counted } = useLoad(async () => {
    const { data } = await supabase.from('day_ends').select('business_date,cash_counted_vnd,transfer_counted_vnd')
      .eq('outlet_id', outletId).eq('status', 'active').in('business_date', srcDates);
    return ((data as any[]) || []).filter((d) => d.cash_counted_vnd != null || d.transfer_counted_vnd != null).map((d) => d.business_date as string);
  }, [outletId, srcDates.join()]);

  const total = orders.reduce((s, o) => s + o.total, 0);
  const cash = orders.reduce((s, o) => s + (o.cash ? o.total : 0), 0);
  const parts = orders.reduce((s, o) => s + o.parts, 0);
  const tooOld = orders.filter((o) => o.date < minDay);
  const label = (d: string) => (d === today ? 'Hôm nay' : d === vnToday(-1) ? 'Hôm qua' : d === vnToday(-2) ? 'Hôm kia' : ddmm(d));
  const n = orders.length;

  async function go() {
    if (!to) return;
    setErr(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_move_orders', { p_orders: orders.map((o) => o.id), p_date: to });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onDone(data as MoveResult);
  }

  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet sheet-fixed" role="dialog" aria-labelledby="move-t">
        <div className="row between" style={{ minHeight: 32 }}>
          <h2 id="move-t" style={{ fontSize: 18 }}>{n > 1 ? `Đổi ngày bán cho ${n} đơn` : 'Đổi ngày bán'}</h2>
          <button type="button" className="icon-btn" aria-label="Đóng" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
        <div className="sheet-scroll">
          {n === 1 ? (
            <p className="small muted" style={{ margin: 0 }}>
              Đơn #{orders[0].seq} · {vnd(orders[0].total)} · đang ở ngày {ddmm(orders[0].date)}. Chọn ngày bán đúng, trong 7 ngày gần nhất ({ddmm(minDay)} đến {ddmm(today)}).
            </p>
          ) : (
            <>
              <div className="disc-list">
                {orders.map((o) => (
                  <div key={o.id} className="row between small">
                    <span className="strong">#{o.seq} · {o.time} · {o.customer}{srcDates.length > 1 ? ` · ${ddmm(o.date)}` : ''}</span>
                    <span className="num" style={{ whiteSpace: 'nowrap' }}>{vnd(o.total)}</span>
                  </div>
                ))}
              </div>
              <p className="xs muted" style={{ margin: 0 }}>Chọn ngày bán đúng, trong 7 ngày gần nhất ({ddmm(minDay)} đến {ddmm(today)}).</p>
            </>
          )}

          {tooOld.length > 0 && (
            <div className="alert warn small">Đơn #{tooOld.map((o) => o.seq).join(', #')} đã quá 7 ngày nên không chuyển được. Bỏ chọn các đơn đó rồi thử lại.</div>
          )}

          <div className="seg3" role="radiogroup" aria-label="Ngày mới">
            {quick.map((d) => {
              const here = single === d;
              return (
                <button key={d} type="button" role="radio" aria-checked={to === d} className={to === d ? 'on' : ''} disabled={here}
                  style={{ flexDirection: 'column', gap: 2, minHeight: 60 }} onClick={() => setTo(d)}>
                  <span>{label(d)}</span>
                  <span className="xs" style={{ fontWeight: 500, opacity: 0.85 }}>{ddmm(d)}{here ? ' · đang ở' : ''}</span>
                </button>
              );
            })}
          </div>
          <label className="input-wrap" style={{ gap: 8 }}>
            <Icon name="calendar" size={18} />
            <span className="small strong muted" style={{ whiteSpace: 'nowrap' }}>Ngày khác</span>
            <input type="date" aria-label="Chọn ngày khác" min={minDay} max={today} value={to && !quick.includes(to) ? to : ''}
              onChange={(e) => e.target.value && setTo(e.target.value)} />
          </label>

          {to && (
            <div className="card" style={{ background: '#F4F1EA', boxShadow: 'none', gap: 6 }}>
              <span className="strong small">Sau khi chuyển</span>
              {srcDates.map((d) => {
                const os = orders.filter((o) => o.date === d);
                const t = os.reduce((s, o) => s + o.total, 0);
                const c = os.reduce((s, o) => s + (o.cash ? o.total : 0), 0);
                const p = os.reduce((s, o) => s + o.parts, 0);
                return (
                  <span key={d} className="small">
                    <b>{ddmm(d)}</b>: bớt {os.length > 1 ? `${os.length} đơn, ` : ''}{vnd(t)}{c ? ` (tiền mặt ${vnd(c)})` : ''}. Kho cộng lại {p} phần.
                  </span>
                );
              })}
              <span className="small">
                <b>{ddmm(to)}</b>: thêm {n > 1 ? `${n} đơn, ` : ''}{vnd(total)} và trừ kho {parts} phần. {n > 1 ? 'Các đơn đánh số tiếp theo thứ tự giờ bán.' : 'Đơn mang số mới của ngày này.'} Giữ nguyên giờ bán.
              </span>
            </div>
          )}

          {(counted || []).length > 0 && cash > 0 && (
            <p role="note" className="alert warn small" style={{ margin: 0 }}>
              Ngày {(counted || []).map(ddmm).join(', ')} đã ghi cuối ngày và đếm tiền. Sau khi chuyển, tiền cần có của ngày đó sẽ bớt nên báo lệch so với số đã đếm. Nếu cần, mở Ghi cuối ngày của ngày đó để ghi lại.
            </p>
          )}
          {err && <span className="err">{err}</span>}
        </div>
        <button className="btn lg block" disabled={!to || busy || tooOld.length > 0} onClick={go}>
          {busy ? 'Đang chuyển…' : to ? `Chuyển ${n > 1 ? `${n} đơn ` : ''}sang ${ddmm(to)}` : 'Chọn ngày mới'}
        </button>
        <button className="btn secondary block" onClick={onClose}>Thôi</button>
      </div>
    </>
  );
}
