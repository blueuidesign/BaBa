import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LINES, useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { ddmm, timeHM, uuid, vnd, vnToday } from '../lib/format';
import { Bottle, Header, Icon, Loading, MoneyInput, Nav, confirmDialog, useToast } from '../components/ui';

const QUICK = [500000, 200000, 100000, 50000, 20000, 10000];
type Step = 1 | 2 | 3 | 4;
type Saved = { id: string; waste: number; left: number; diff: number | null; at: string };

/**
 * Ghi cuối ngày (bản 17/11, thiết kế Z06–Z11). Không bắt buộc và không khóa ngày.
 * 4 bước: CHAI HỦY → CHAI TỒN → Kiểm tiền (tùy chọn) → Xác nhận rồi mới lưu.
 * Chai hủy trừ nguyên liệu, bao bì trong kho; chai tồn chỉ để thống kê (ngày mai bán mới trừ).
 * Ngày đã ghi thì hiện bản đã lưu, có Hoàn tác.
 */
export default function DayEnd() {
  const { outlet, catalog, bump, canManage } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const today = vnToday();
  const [sp, setSp] = useSearchParams();
  // Nhân viên chỉ ghi và sửa trong ngày; chủ cơ sở mở được mọi ngày (DB cũng chặn như vậy)
  const q = sp.get('ngay') || '';
  const date = canManage && /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= today ? q : today;
  const [editId, setEditId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [waste, setWaste] = useState<Record<string, number>>({});
  const [left, setLeft] = useState<Record<string, number>>({});
  const [rm, setRm] = useState(false); // chạm món để bớt 1
  const [typing, setTyping] = useState(false); // gõ thẳng số
  const [cash, setCash] = useState('');
  const [cashMode, setCashMode] = useState<'collected' | 'box' | null>(null);
  const [transfer, setTransfer] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [ver, setVer] = useState(0);

  const { data, loading } = useLoad(async (oid) => {
    const [ex, sold, pays, open] = await Promise.all([
      supabase.from('day_ends').select('id,created_at,left_total,waste_total,cash_counted_vnd,transfer_counted_vnd,cash_open_vnd,expected_cash_vnd,expected_transfer_vnd,money_note,day_end_lines(product_id,left_qty,waste_qty)')
        .eq('outlet_id', oid).eq('business_date', date).eq('status', 'active').maybeSingle(),
      supabase.from('v_sales_by_product').select('product_id,qty').eq('outlet_id', oid).eq('business_date', date),
      supabase.from('orders').select('total_vnd,payment_method').eq('outlet_id', oid).eq('business_date', date).eq('status', 'active').eq('is_gift', false),
      supabase.from('cash_opens').select('amount_vnd').eq('outlet_id', oid).eq('business_date', date).order('created_at', { ascending: false }).limit(1)
    ]);
    const ps = (pays.data || []) as any[];
    const sum = (m: string | null) => ps.filter((o) => (o.payment_method || null) === m).reduce((a, o) => a + o.total_vnd, 0);
    const soldMap = new Map<string, number>();
    ((sold.data || []) as any[]).forEach((r) => soldMap.set(r.product_id, (soldMap.get(r.product_id) || 0) + (r.qty || 0)));
    return {
      existing: (ex.data as any) || null, sold: soldMap,
      eCash: sum('cash'), eTransfer: sum('transfer'), unpaid: sum(null), nUnpaid: ps.filter((o) => !o.payment_method && o.total_vnd > 0).length,
      open: ((open.data || [])[0]?.amount_vnd as number | undefined) || 0
    };
  }, [ver, date]);

  if (!outlet) return null;
  const products = catalog?.products || [];
  const nameOf = (pid: string) => catalog?.allProducts.find((p) => p.id === pid)?.name || 'Món đã bỏ';
  const colorOf = (pid: string) => catalog?.allProducts.find((p) => p.id === pid)?.color || null;
  const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
  const nWaste = total(waste);
  const nLeft = total(left);
  const hasMoney = cash !== '' || transfer !== '';
  // Hai cách nhập tiền mặt như màn đối chiếu cũ: số thu được, hoặc tổng trong hộp (app trừ tiền đầu ngày).
  // DB luôn lưu TỔNG tiền mặt trong hộp, để hôm sau điền sẵn vào Tiền đầu ngày.
  const open = data?.open || 0;
  const mode = cashMode ?? (open > 0 ? 'box' : 'collected');
  const cashGot = cash === '' ? 0 : mode === 'box' ? Math.max(0, Number(cash) - open) : Number(cash) || 0;
  const cashBox = mode === 'box' ? Number(cash) || 0 : (Number(cash) || 0) + open;
  const got = cashGot + (Number(transfer) || 0);
  const expected = (data?.eCash || 0) + (data?.eTransfer || 0);
  // Tiền mặt trong hộp gồm cả tiền đầu ngày, nên trừ ra trước khi so với đơn
  const diff = hasMoney ? got - expected : null;
  const money = (v: number) => (v < 0 ? `− ${vnd(-v)}` : v > 0 ? `+ ${vnd(v)}` : vnd(0));

  async function quit() {
    if (editId) { if (await confirmDialog({ title: 'Bỏ sửa?', text: 'Số vừa đổi sẽ không được lưu, bản cũ giữ nguyên.', ok: 'Bỏ sửa', cancel: 'Sửa tiếp', danger: true })) reset(); return; }
    if (!nWaste && !nLeft && !hasMoney) return nav('/');
    if (await confirmDialog({ title: 'Thoát, không lưu?', text: 'Số chai hủy, chai tồn và tiền vừa nhập sẽ mất.', ok: 'Thoát', cancel: 'Ở lại', danger: true })) nav('/');
  }

  function reset() {
    setStep(1); setWaste({}); setLeft({}); setCash(''); setCashMode(null); setTransfer(''); setNote(''); setEditId(null); setErr(null); setRm(false); setTyping(false);
  }
  function go(d: string) {
    reset();
    setSaved(null);
    setSp(d === today ? {} : { ngay: d }, { replace: true });
  }
  const shift = (n: number) => {
    const t = new Date(date + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  // Chủ cơ sở lùi, tiến ngày để ghi hoặc sửa ngày cũ
  const dateNav = canManage && (
    <div className="row between card tight" style={{ padding: '6px 8px' }}>
      <button type="button" className="icon-btn" aria-label="Ngày trước" onClick={() => go(shift(-1))}><Icon name="chev" size={20} sw={2} style={{ transform: 'rotate(180deg)' }} /></button>
      <strong>{date === today ? `Hôm nay · ${ddmm(date)}` : `Ngày ${ddmm(date)}`}</strong>
      <button type="button" className="icon-btn" aria-label="Ngày sau" disabled={date >= today} style={date >= today ? { opacity: 0.3 } : undefined} onClick={() => go(shift(1))}><Icon name="chev" size={20} sw={2} /></button>
    </div>
  );
  // Sửa: nạp bản đã lưu vào form; lưu thì DB đảo bản cũ và ghi bản mới
  function startEdit(ex: any) {
    const w: Record<string, number> = {}; const l: Record<string, number> = {};
    ((ex.day_end_lines || []) as any[]).forEach((x) => { if (x.waste_qty > 0) w[x.product_id] = x.waste_qty; if (x.left_qty > 0) l[x.product_id] = x.left_qty; });
    setWaste(w); setLeft(l);
    setCash(ex.cash_counted_vnd != null ? String(ex.cash_counted_vnd) : '');
    setCashMode('box'); // số đã lưu là tổng trong hộp
    setTransfer(ex.transfer_counted_vnd != null ? String(ex.transfer_counted_vnd) : '');
    setNote(ex.money_note || '');
    setErr(null); setStep(1); setEditId(ex.id);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const ids = new Set([...Object.keys(waste), ...Object.keys(left)]);
    const { data: r, error } = await supabase.rpc(editId ? 'fn_edit_day_end' : 'fn_post_day_end', {
      ...(editId ? { p_id: editId } : {}),
      p: {
        outlet_id: outlet!.id, client_id: uuid(), business_date: date,
        lines: [...ids].map((pid) => ({ product_id: pid, waste_qty: waste[pid] || 0, left_qty: left[pid] || 0 })),
        ...(cash !== '' ? { cash_counted_vnd: cashBox } : {}), ...(transfer !== '' ? { transfer_counted_vnd: Number(transfer) || 0 } : {}),
        money_note: note
      }
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    setEditId(null);
    setSaved({ id: (r as any).id, waste: nWaste, left: nLeft, diff, at: new Date().toISOString() });
  }

  async function undo(id: string) {
    const ok = await confirmDialog({
      title: `Hoàn tác ghi cuối ngày ${ddmm(date)}?`,
      text: 'Số hủy, số tồn và phần kiểm tiền vừa lưu sẽ bị bỏ. Nguyên liệu đã trừ vì chai hủy được cộng lại vào kho. Sau đó có thể ghi cuối ngày lại từ đầu.',
      ok: 'Hoàn tác', cancel: 'Giữ nguyên', danger: true
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('fn_reverse_day_end', { p_id: id });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    setSaved(null);
    reset();
    setVer((v) => v + 1);
    toast.show('Đã hoàn tác ghi cuối ngày');
  }

  const stepsBar = (n: number) => (
    <div className="row" style={{ gap: 6 }} aria-hidden>
      {[1, 2, 3, 4].map((k) => <span key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: k <= n ? 'var(--brand)' : 'var(--border)' }} />)}
    </div>
  );
  const xBtn = <button type="button" className="icon-btn" aria-label="Thoát không lưu" onClick={quit}><Icon name="x" size={24} sw={2} /></button>;

  if (loading && !data) return <div className="screen"><Header title="Ghi cuối ngày" back="/" sub={outlet.name} /><Loading /><Nav /></div>;

  // Ngày này đã ghi: xem lại và hoàn tác
  const ex = data?.existing;
  if (ex && !saved && !editId) {
    const exDiff = ex.cash_counted_vnd == null && ex.transfer_counted_vnd == null ? null
      : (ex.cash_counted_vnd || 0) + (ex.transfer_counted_vnd || 0) - (ex.cash_counted_vnd != null ? ex.cash_open_vnd || 0 : 0) - (ex.expected_cash_vnd || 0) - (ex.expected_transfer_vnd || 0);
    const ls = (ex.day_end_lines || []) as any[];
    return (
      <div className="screen">
        <Header title="Ghi cuối ngày" back="/" sub={`${outlet.name} · ${ddmm(date)}`} />
        <main className="main">
          {dateNav}
          <div className="alert ok" role="status"><Icon name="check" size={20} sw={2} /><span>Đã ghi cuối ngày {ddmm(date)} lúc {timeHM(ex.created_at)}. Bấm Sửa để đổi số; bản cũ được giữ trong lịch sử.</span></div>
          <section className="card">
            <div className="row between"><span className="h2">Hủy</span><strong style={{ color: ex.waste_total ? 'var(--danger)' : undefined }}>{ex.waste_total} chai</strong></div>
            {ls.filter((l) => l.waste_qty > 0).map((l) => <div key={l.product_id} className="row between small"><span>{nameOf(l.product_id)}</span><span className="num">{l.waste_qty} chai</span></div>)}
            {ex.waste_total > 0 && <span className="xs muted">Đã trừ kho nguyên liệu và bao bì của {ex.waste_total} chai hủy.</span>}
          </section>
          <section className="card">
            <div className="row between"><span className="h2">Tồn sang ngày mai</span><strong>{ex.left_total} chai</strong></div>
            {ls.filter((l) => l.left_qty > 0).map((l) => <div key={l.product_id} className="row between small"><span>{nameOf(l.product_id)}</span><span className="num">{l.left_qty} chai</span></div>)}
          </section>
          <section className="card">
            <div className="h2">Kiểm tiền</div>
            {exDiff == null ? <span className="small muted">Không kiểm tiền.</span> : (
              <>
                <div className="row between small"><span>Thu được</span><span className="num">{vnd(Math.max(0, (ex.cash_counted_vnd || 0) - (ex.cash_counted_vnd != null ? ex.cash_open_vnd || 0 : 0)) + (ex.transfer_counted_vnd || 0))}</span></div>
                {ex.cash_counted_vnd != null && <div className="row between small"><span>Tổng tiền mặt trong hộp</span><span className="num">{vnd(ex.cash_counted_vnd)}</span></div>}
                <div className="row between small"><span>Lệch so với đơn</span><strong className="num" style={{ color: exDiff ? 'var(--danger)' : 'var(--ink-brand)' }}>{money(exDiff)}</strong></div>
                {ex.money_note && <span className="xs muted">Ghi chú: {ex.money_note}</span>}
              </>
            )}
          </section>
          {err && <span className="err">{err}</span>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn secondary" disabled={busy} style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => undo(ex.id)}>Hoàn tác</button>
            <button className="btn" disabled={busy} style={{ flex: 1 }} onClick={() => startEdit(ex)}>Sửa</button>
          </div>
        </main>
        <Nav />
        {toast.node}
      </div>
    );
  }

  // Bước 1 (CHAI HỦY) và bước 2 (CHAI TỒN): lưới ô món như màn Ghi đơn
  if (step === 1 || step === 2) {
    const isWaste = step === 1;
    const map = isWaste ? waste : left;
    const setMap = isWaste ? setWaste : setLeft;
    const tone = isWaste ? 'var(--danger)' : 'var(--brand)';
    const word = isWaste ? 'Hủy' : 'Tồn';
    const n = isWaste ? nWaste : nLeft;
    const put = (pid: string, v: number) => setMap((m) => {
      const next = { ...m };
      const x = Math.max(0, Math.min(999, Math.floor(v) || 0));
      if (x <= 0) delete next[pid];
      else next[pid] = x;
      return next;
    });
    return (
      <div className="screen">
        <Header title={isWaste ? 'CHAI HỦY' : 'CHAI TỒN'} sub={`Ghi cuối ngày · bước ${step}/4 · ${ddmm(date)}`} back={() => (isWaste ? quit() : setStep(1))} right={xBtn} />
        <main className="main with-bar">
          {isWaste && !editId && dateNav}
          {editId && <div className="alert warn small" role="status"><Icon name="warn" size={18} sw={2} /><span>Đang sửa bản ghi cuối ngày {ddmm(date)}. Lưu xong, số cũ được thay bằng số mới.</span></div>}
          {stepsBar(step)}
          <div className="row" style={{ gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: isWaste ? 'var(--danger-bg)' : 'var(--bg-brand-soft)' }}>
            <span style={{ width: 40, height: 40, borderRadius: 20, background: tone, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={isWaste ? 'trash' : 'bottle'} size={20} sw={2} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <strong style={{ fontSize: 18, color: isWaste ? 'var(--danger)' : 'var(--ink-brand)' }}>{isWaste ? 'CHAI HỦY' : 'CHAI TỒN'}</strong>
              <span className="small">{isWaste ? 'Chai phải đổ bỏ hôm nay' : 'Chai còn bán được vào ngày mai'}</span>
            </span>
          </div>
          {!catalog ? <Loading /> : LINES.map((line) => {
            const items = products.filter((p) => p.line === line.id);
            if (!items.length) return null;
            return (
              <section key={line.id} className="line-group">
                <h2 className="h2">{line.name}</h2>
                <div className="tiles">
                  {items.map((p) => {
                    const v = map[p.id] || 0;
                    return (
                      <div key={p.id} className={`tile ${v ? 'on' : ''} ${rm && !v ? 'dim' : ''}`} style={v ? { borderColor: tone } : undefined}>
                        <button type="button" className="tile-hit" aria-label={`${p.name}, ${word.toLowerCase()} ${v} chai`} disabled={rm && !v}
                          onClick={() => { if (!typing) put(p.id, v + (rm ? -1 : 1)); }}>
                          {v > 0 && <span className="count" style={{ background: tone, whiteSpace: 'nowrap' }}>{word} {v}</span>}
                          <Bottle color={p.color} size={40} />
                          <span className="name">{p.short_name}</span>
                          {!typing && <span className="meta">bán {data?.sold.get(p.id) || 0}</span>}
                        </button>
                        {typing && (
                          <span className="qty">
                            <button type="button" aria-label={`Bớt một ${p.short_name}`} disabled={v === 0} onClick={() => put(p.id, v - 1)}><Icon name="minus" size={14} sw={2.6} /></button>
                            <input inputMode="numeric" pattern="[0-9]*" aria-label={`Số chai ${word.toLowerCase()} ${p.short_name}`} value={v || ''} placeholder="0" maxLength={3}
                              onFocus={(e) => e.currentTarget.select()} onChange={(e) => put(p.id, Number(e.target.value.replace(/\D/g, '')))} />
                            <button type="button" aria-label={`Thêm một ${p.short_name}`} onClick={() => put(p.id, v + 1)}><Icon name="plus" size={14} sw={2.6} /></button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </main>
        <div className="bar" style={{ bottom: 0, paddingBottom: 'calc(12px + var(--safe-b))' }}>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className={`chip ${rm ? 'on' : ''}`} style={{ minHeight: 34, fontSize: 13, ...(rm ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : {}) }} disabled={!n && !rm}
              onClick={() => { setRm((x) => !x); setTyping(false); }}><Icon name="minus" size={15} /> Bớt</button>
            <button type="button" className={`chip ${typing ? 'on' : ''}`} style={{ minHeight: 34, fontSize: 13 }} onClick={() => { setTyping((x) => !x); setRm(false); }}><Icon name="plus" size={15} /> Nhập số</button>
          </div>
          <span className="xs muted">
            {rm ? 'Đang bớt: chạm món để bớt 1. Bấm lại nút Bớt để thôi.'
              : isWaste ? 'Chạm món để thêm 1 chai phải đổ bỏ. Không hủy chai nào thì bấm Tiếp theo.' : 'Chạm món để thêm 1 chai còn bán được vào ngày mai. Không còn chai nào thì bấm Tiếp theo.'}
          </span>
          <div className="bar-row">
            <div className="bar-total">
              <span className="label">{isWaste ? 'Chai hủy' : 'Chai tồn sang ngày mai'}</span>
              <span className="value" style={{ color: isWaste && n ? 'var(--danger)' : undefined }}>{n} chai</span>
            </div>
            <button className="btn lg" style={{ minWidth: 150 }} onClick={() => { setRm(false); setTyping(false); setStep(isWaste ? 2 : 3); }}>Tiếp theo <Icon name="chev" size={20} sw={2.4} /></button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 3)
    return (
      <div className="screen">
        <Header title="Kiểm tiền" sub={`Ghi cuối ngày · bước 3/4 · ${ddmm(date)}`} back={() => setStep(2)} right={xBtn} />
        <main className="main with-bar">
          {stepsBar(3)}
          <section className="card">
            <div className="h2">Kiểm tiền</div>
            <span className="small muted">Không bắt buộc. Để trống cả hai ô rồi bấm Tiếp theo nếu không kiểm.</span>
            <div className="seg" role="tablist" aria-label="Cách nhập tiền mặt">
              <button type="button" className={mode === 'collected' ? 'on' : ''} onClick={() => setCashMode('collected')}>Số tiền thu được</button>
              <button type="button" className={mode === 'box' ? 'on' : ''} onClick={() => setCashMode('box')}>Tổng tiền trong hộp</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="small strong">{mode === 'box' ? 'Tổng tiền mặt trong hộp' : 'Tiền mặt thu được hôm nay'}</span>
              <MoneyInput label={mode === 'box' ? 'Tổng tiền mặt trong hộp' : 'Tiền mặt thu được hôm nay'} value={cash} onChange={setCash} placeholder="Để trống nếu không đếm" />
              <span className="xs muted">
                {mode === 'box'
                  ? open > 0 ? `App trừ tiền đầu ngày ${vnd(open)} → thu được ${vnd(cashGot)}.` : 'Hôm nay chưa ghi tiền đầu ngày nên app không trừ gì. Nếu trong hộp có tiền lẻ sẵn, chọn "Số tiền thu được".'
                  : open > 0 ? `Không tính ${vnd(open)} tiền đầu ngày. Tổng trong hộp sẽ là ${vnd(cashBox)}.` : 'Đã trừ tiền lẻ có sẵn lúc mở bán.'}
              </span>
              <div className="chips wrap">
                <span className="xs muted strong" style={{ alignSelf: 'center' }}>Cộng nhanh</span>
                {QUICK.map((q) => <button type="button" key={q} className="chip action" style={{ minHeight: 34, fontSize: 13, padding: '0 10px' }} onClick={() => setCash(String(Number(cash || 0) + q))}>+{q / 1000}k</button>)}
                {cash && <button type="button" className="chip action" style={{ minHeight: 34, fontSize: 13, padding: '0 10px' }} onClick={() => setCash('')}>Xóa</button>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="small strong">Chuyển khoản nhận được</span>
              <MoneyInput label="Chuyển khoản nhận được" value={transfer} onChange={setTransfer} placeholder="Để trống nếu không kiểm" />
            </div>
            {hasMoney && (
              <div>
                <div className="row between small"><span>Thu được</span><span className="num">{vnd(got)}</span></div>
                <div className="row between small"><span>Theo đơn đã đánh dấu nhận tiền</span><span className="num">{vnd(expected)}</span></div>
                <div className="row between"><strong>Lệch</strong><strong className="num" style={{ color: diff ? 'var(--danger)' : 'var(--ink-brand)' }}>{money(diff || 0)}</strong></div>
              </div>
            )}
            <span className="xs muted">
              Theo đơn: tiền mặt {vnd(data?.eCash || 0)} · chuyển khoản {vnd(data?.eTransfer || 0)}.
              {data?.nUnpaid ? ` Còn ${data.nUnpaid} đơn ${vnd(data.unpaid)} chưa đánh dấu nhận tiền, chưa tính vào đây.` : ''}
            </span>
            {hasMoney && <label className="input-wrap"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú nếu lệch, vd: thối nhầm" aria-label="Ghi chú kiểm tiền" maxLength={120} /></label>}
          </section>
        </main>
        <div className="bar" style={{ bottom: 0, paddingBottom: 'calc(12px + var(--safe-b))' }}>
          <button className="btn lg block" onClick={() => setStep(4)}>Tiếp theo <Icon name="chev" size={20} sw={2.4} /></button>
        </div>
      </div>
    );

  const list = (m: Record<string, number>, danger: boolean) =>
    Object.entries(m).map(([pid, q]) => (
      <div key={pid} className="row" style={{ gap: 10, minHeight: 30 }}>
        <Bottle color={colorOf(pid)} size={22} />
        <span className="grow">{nameOf(pid)}</span>
        <strong className="num" style={{ color: danger ? 'var(--danger)' : undefined }}>{q} chai</strong>
      </div>
    ));
  const editBtn = (s: Step) => <button type="button" className="small strong" style={{ border: 0, background: 'transparent', padding: '4px 0 4px 8px', color: 'var(--ink-brand)', cursor: 'pointer' }} onClick={() => setStep(s)}>Sửa</button>;
  return (
    <div className="screen">
      <Header title="Xác nhận" sub={`Ghi cuối ngày · bước 4/4 · ${ddmm(date)}`} back={() => setStep(3)} right={xBtn} />
      <main className="main with-bar">
        {stepsBar(4)}
        <section className="card">
          <div className="row"><span className="h2 grow">Hủy</span><strong style={{ color: nWaste ? 'var(--danger)' : undefined }}>{nWaste} chai</strong>{editBtn(1)}</div>
          {list(waste, true)}
          <span className="xs muted">{nWaste ? `Lưu xong, kho trừ nguyên liệu và bao bì của ${nWaste} chai này theo công thức.` : 'Không hủy chai nào.'}</span>
        </section>
        <section className="card">
          <div className="row"><span className="h2 grow">Tồn sang ngày mai</span><strong>{nLeft} chai</strong>{editBtn(2)}</div>
          {list(left, false)}
          {!nLeft && <span className="xs muted">Không còn chai nào.</span>}
        </section>
        <section className="card">
          <div className="row"><span className="h2 grow">Kiểm tiền</span>{editBtn(3)}</div>
          {diff == null ? <span className="small muted">Không kiểm tiền.</span> : (
            <>
              <div className="row between small"><span>Thu được</span><span className="num">{vnd(got)}</span></div>
              {cash !== '' && <div className="row between small"><span>Tổng tiền mặt trong hộp</span><span className="num">{vnd(cashBox)}</span></div>}
              <div className="row between small"><span>Lệch so với đơn</span><strong className="num" style={{ color: diff ? 'var(--danger)' : 'var(--ink-brand)' }}>{money(diff)}</strong></div>
            </>
          )}
        {cash !== '' && <span className="xs muted">Tổng tiền mặt trong hộp sẽ được điền sẵn vào Tiền đầu ngày của hôm sau, bạn bấm Lưu thì mới ghi.</span>}
        </section>
      </main>
      <div className="bar" style={{ bottom: 0, paddingBottom: 'calc(12px + var(--safe-b))' }}>
        {err && <span className="err">{err}</span>}
        <button className="btn lg block" disabled={busy} onClick={save}><Icon name="check" size={20} sw={2.2} /> {busy ? 'Đang lưu…' : editId ? 'Lưu bản sửa' : 'Lưu cuối ngày'}</button>
      </div>

      {saved && (
        <>
          <div className="pop-back" />
          <div className="pop" role="status" aria-live="polite">
            <span className="pop-ok"><Icon name="check" size={34} sw={2.6} /></span>
            <strong style={{ fontSize: 18 }}>Đã lưu cuối ngày {ddmm(date)}</strong>
            <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', background: 'var(--bg-200)', borderRadius: 'var(--radius-md)' }}>
              <div className="row between small"><span className="muted">Hủy{saved.waste ? ' · đã trừ kho' : ''}</span><strong style={{ color: saved.waste ? 'var(--danger)' : undefined }}>{saved.waste} chai</strong></div>
              <div className="row between small"><span className="muted">Tồn sang ngày mai</span><strong>{saved.left} chai</strong></div>
              <div className="row between small"><span className="muted">Kiểm tiền</span><strong className="num" style={{ color: saved.diff ? 'var(--danger)' : undefined }}>{saved.diff == null ? 'không kiểm' : `lệch ${money(saved.diff)}`}</strong></div>
            </div>
            {err && <span className="err">{err}</span>}
            <div className="row" style={{ alignSelf: 'stretch', gap: 8, marginTop: 8 }}>
              <button className="btn secondary" style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={busy} onClick={() => undo(saved.id)}>Hoàn tác</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => nav('/')}>Đóng</button>
            </div>
          </div>
        </>
      )}
      {toast.node}
    </div>
  );
}
