import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { fetchBottles, useLoad } from '../lib/data';
import { removeFromQueue } from '../lib/queue';
import { timeHM, vnd } from '../lib/format';
import { Header, Icon, Nav, useToast } from '../components/ui';

export default function OrderSaved() {
  const { state } = useLocation() as { state: any };
  const { catalog, bump } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data: bottles } = useLoad((oid) => fetchBottles(oid));

  if (!state) return <Navigate to="/ban" replace />;
  const { queued, result, total, bottles: n, lines, clientId } = state;
  const orderId: string | undefined = result?.id;

  async function undo() {
    setErr(null);
    if (queued) {
      removeFromQueue(clientId);
      bump();
      nav('/ban', { replace: true });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('fn_reverse_order', { p_order: orderId, p_reason: 'Hoàn tác ngay sau khi lưu' });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    nav('/ban', { replace: true });
  }

  async function gift() {
    setErr(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_mark_gift', { p_order: orderId });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    toast.show('Đã chuyển thành đơn tặng');
    nav('/ban/da-luu', { replace: true, state: { ...state, result: data, total: 0, gift: true } });
  }

  const leftOf = (pid: string) => bottles?.find((b) => b.product_id === pid)?.left_qty;
  const totalLeft = bottles?.reduce((s, b) => s + b.left_qty, 0);

  return (
    <div className="screen">
      <Header title={state.gift ? 'Đã ghi đơn tặng' : 'Đã lưu đơn'} />
      <main className="main with-bar">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '18px 0 4px', textAlign: 'center' }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: queued ? 'var(--warn-bg)' : 'var(--bg-brand-soft)', color: queued ? 'var(--warn)' : 'var(--ink-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={queued ? 'wifi' : 'check'} size={30} sw={2.2} />
          </span>
          <span className="small muted">{queued ? 'Đã lưu trên máy, chờ gửi' : `Đơn ${result?.seq_in_day} · ${timeHM(new Date().toISOString())}`}</span>
          <span style={{ fontSize: 32, lineHeight: '38px', fontWeight: 700 }} className="num">
            {vnd(state.gift ? 0 : total)}
          </span>
          <span className="small muted">{n} chai{state.gift ? ' · tặng' : ''}</span>
          {!state.gift && state.discount > 0 && (
            <span className="small muted num">
              Tạm tính {vnd(state.gross)} · giảm {vnd(state.discount)}{state.discountReason ? ` (${state.discountReason})` : ''}
            </span>
          )}
        </div>

        <section className="card">
          {lines.map((l: any) => (
            <div key={l.product_id} className="list-row" style={{ minHeight: 44 }}>
              <span className="dot-color" style={{ background: l.color }} />
              <span className="grow strong">
                {l.qty} × {l.name}
              </span>
              <span className="num strong">{vnd(state.gift ? 0 : l.qty * l.price)}</span>
            </div>
          ))}
          {err && <span className="err">{err}</span>}
          <div className="chips wrap">
            <button className="chip" disabled={busy} onClick={undo}>
              <Icon name="undo" size={16} sw={2.2} /> Hoàn tác đơn này
            </button>
            {!queued && !state.gift && (
              <button className="chip" disabled={busy} onClick={gift}>
                <Icon name="gift" size={16} /> Đánh dấu tặng
              </button>
            )}
          </div>
        </section>

        {bottles && (
          <section className="card">
            <div className="h2">Còn trên quầy sau đơn này</div>
            {lines.map((l: any) => {
              const left = leftOf(l.product_id);
              return (
                <div key={l.product_id} className="row between small">
                  <span>{catalog?.allProducts.find((p) => p.id === l.product_id)?.name || l.name}</span>
                  <span className="strong num">{left == null ? '—' : left <= 0 ? `${left} chai · hết` : `${left} chai`}</span>
                </div>
              );
            })}
            <div className="row between small">
              <span>Tổng còn trên quầy</span>
              <span className="strong num">{totalLeft} chai</span>
            </div>
            <p className="xs muted">Nguyên liệu và bao bì đã trừ từ lúc ghi nấu, nên bán không trừ kho.</p>
          </section>
        )}
      </main>
      <div className="bar">
        <Link to="/ban" replace className="btn lg block">
          <Icon name="plus" size={22} sw={2.2} /> Thêm đơn mới
        </Link>
      </div>
      <Nav />
      {toast.node}
    </div>
  );
}
