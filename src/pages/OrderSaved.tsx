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
  // Cách nhận tiền và tên khách: ghi thêm sau khi đơn đã lưu (fn_set_order_info), không bắt buộc
  const [pay, setPay] = useState<'cash' | 'transfer' | null>(state?.result?.payment_method || null);
  const [cust, setCust] = useState<string>(state?.result?.customer_name || '');
  const [custSaved, setCustSaved] = useState<string>(state?.result?.customer_name || '');
  const [custFocus, setCustFocus] = useState(false);
  const { data: knownCust } = useLoad(async (oid) => {
    const { data } = await supabase.from('orders').select('customer_name').eq('outlet_id', oid).not('customer_name', 'is', null).order('placed_at', { ascending: false }).limit(400);
    const seen = new Set<string>();
    return ((data || []) as any[]).map((r) => (r.customer_name as string).trim()).filter((n) => n && n.toLowerCase() !== 'khách lẻ' && !seen.has(n.toLowerCase()) && (seen.add(n.toLowerCase()), true));
  });

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

  async function markPay(m: 'cash' | 'transfer') {
    const next = pay === m ? null : m;
    const prev = pay;
    setPay(next);
    setErr(null);
    const { error } = await supabase.rpc('fn_set_order_info', { p_order: orderId, p_payment: next || '' });
    if (error) { setPay(prev); return setErr(errorText(error)); }
    bump();
  }
  async function saveCust(name: string) {
    const v = name.trim();
    if (v === custSaved) return;
    setErr(null);
    const { error } = await supabase.rpc('fn_set_order_info', { p_order: orderId, p_customer: v });
    if (error) return setErr(errorText(error));
    setCustSaved(v);
    bump();
  }
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  const sug = custFocus ? (knownCust || []).filter((n) => fold(n).includes(fold(cust.trim())) && fold(n) !== fold(cust.trim())).slice(0, 5) : [];

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
          <span className="small muted">{state.partsLabel || `${n} chai`}{state.gift ? ' · tặng' : ''}</span>
          {!state.gift && state.discount > 0 && (
            <span className="small muted num">
              Tạm tính {vnd(state.gross)} · giảm {vnd(state.discount)}{state.discountReason ? ` (${state.discountReason})` : ''}
            </span>
          )}
        </div>

        <section className="card">
          {lines.map((l: any) => (
            <div key={l.product_id + (l.container || '')} className="list-row" style={{ minHeight: 44 }}>
              <span className="dot-color" style={{ background: l.color }} />
              <span className="grow strong">
                {l.qty} × {l.name}{l.container === 'coc' ? ' · cốc giấy' : ''}
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

        {!queued && orderId && (
          <section className="card">
            {!state.gift && (
              <>
                <div className="h2">Đã nhận tiền</div>
                <div className="grid2">
                  <button type="button" className={`btn ${pay === 'cash' ? '' : 'secondary'}`} aria-pressed={pay === 'cash'} onClick={() => markPay('cash')}>
                    {pay === 'cash' && <Icon name="check" size={18} sw={2.2} />} Tiền mặt
                  </button>
                  <button type="button" className={`btn ${pay === 'transfer' ? '' : 'secondary'}`} aria-pressed={pay === 'transfer'} onClick={() => markPay('transfer')}>
                    {pay === 'transfer' && <Icon name="check" size={18} sw={2.2} />} C.khoản
                  </button>
                </div>
                <span className="xs muted">{pay ? 'Bấm lại lần nữa để bỏ đánh dấu.' : 'Chưa đánh dấu. Có thể bỏ qua nếu chưa nhận tiền.'}</span>
              </>
            )}
            <label className="field">
              <span className="label small strong">Khách hàng <span className="muted" style={{ fontWeight: 400 }}>· không bắt buộc</span></span>
              <span className="input-wrap">
                <input value={cust} maxLength={60} placeholder="Gõ tên khách, vd: chú chủ nhà" aria-label="Tên khách hàng" style={{ textAlign: 'left', fontSize: 16 }}
                  onChange={(e) => setCust(e.target.value)} onFocus={() => setCustFocus(true)}
                  onBlur={() => setTimeout(() => { setCustFocus(false); saveCust(cust); }, 150)} />
              </span>
            </label>
            {sug.length > 0 && (
              <div className="chips wrap" role="listbox" aria-label="Khách đã có">
                {sug.map((n) => (
                  <button key={n} type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => { setCust(n); setCustFocus(false); saveCust(n); }}>{n}</button>
                ))}
              </div>
            )}
            {custSaved && custSaved === cust.trim() && <span className="xs muted">Đã ghi khách: {custSaved}</span>}
          </section>
        )}
        {queued && <p className="xs muted">Đơn đang chờ gửi vì mất mạng nên chưa ghi được cách nhận tiền và tên khách.</p>}

        {/* Tạm ẩn số chai còn (Tùng 12/11: chưa dùng Nấu) */}
        {false && bottles && (
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
