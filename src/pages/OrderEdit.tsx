import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { timeHM, vnd } from '../lib/format';
import { Header, Icon, Loading, Nav, SugarLess, useToast } from '../components/ui';
import { PCTS, allocate, discPayload, discTotal, pctOf, unitDisc, type Disc, type Pct } from '../lib/discount';

type Line = { pid: string; container: 'chai' | 'coc'; qty: number; less: boolean };

/** Sửa đơn đã ghi (chỉ chủ cơ sở, admin). Lưu = đảo đơn cũ + ghi đơn mới qua fn_edit_order; có ghi vào lịch sử. */
export default function OrderEdit() {
  const { id } = useParams();
  const { outlet, catalog, canManage, bump } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const from = new URLSearchParams(useLocation().search).get('from') === 'home' ? '?from=home' : '';
  const { data: o, loading } = useLoad(async () => {
    const { data } = await supabase.from('orders')
      .select('id,seq_in_day,business_date,placed_at,status,total_vnd,discount_vnd,discount_reason,is_gift,payment_method,customer_name,order_lines(qty,product_id,container,sugar,unit_price_vnd,discount_qty,discount_unit_vnd)')
      .eq('id', id).maybeSingle();
    return (data as any) || null;
  }, [id]);
  const [lines, setLines] = useState<Line[]>([]);
  // 'old' = đơn đang giảm một số tiền theo cách cũ (trước 16/11): giữ nguyên số đó cho tới khi chọn lại
  const [dMode, setDMode] = useState<'none' | 'all' | 'some' | 'old'>('none');
  const [dN, setDN] = useState(1);
  const [dPct, setDPct] = useState<Pct>(10);
  const [addLess, setAddLess] = useState(false);
  const [discWhy, setDiscWhy] = useState('');
  const [why, setWhy] = useState('');
  const [pay, setPay] = useState<'cash' | 'transfer' | 'gift' | null>(null);
  const [cust, setCust] = useState('');
  const [addPid, setAddPid] = useState('');
  const [addCup, setAddCup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!o) return;
    setLines(o.order_lines.map((l: any) => ({ pid: l.product_id, container: l.container === 'coc' ? 'coc' : 'chai', qty: l.qty, less: l.sugar === 'less' })));
    const dl = o.order_lines.find((l: any) => l.discount_qty > 0);
    if (dl) setDPct(pctOf(dl.unit_price_vnd, dl.discount_unit_vnd));
    const dq = o.order_lines.reduce((a: number, l: any) => a + (l.discount_qty || 0), 0);
    const all = o.order_lines.reduce((a: number, l: any) => a + l.qty, 0);
    setDMode(!o.discount_vnd ? 'none' : !dq ? 'old' : dq >= all ? 'all' : 'some');
    setDN(dq && dq < all ? dq : 1);
    setDiscWhy(o.discount_reason || '');
    setPay(o.is_gift ? 'gift' : o.payment_method || null);
    setCust(o.customer_name || '');
  }, [o]);

  if (!outlet) return null;
  const prod = (pid: string) => catalog?.allProducts.find((p) => p.id === pid);
  const back = `/bao-cao/don/${id}${from}`;
  const kept = lines.filter((l) => l.qty > 0);
  const isGift = pay === 'gift';
  const gross = isGift ? 0 : kept.reduce((s, l) => s + l.qty * (prod(l.pid)?.price || 0), 0);
  const parts = kept.reduce((s, l) => s + l.qty, 0);
  const someN = Math.max(1, Math.min(dN, parts));
  const dSel: Disc = isGift || dMode === 'none' || dMode === 'old' ? null : { pct: dPct, parts: dMode === 'all' ? null : someN };
  const dLines = lines.map((l) => ({ price: prod(l.pid)?.price || 0, qty: l.qty }));
  const ks = allocate(dLines, dSel);
  const oldDisc = !isGift && dMode === 'old' ? o?.discount_vnd || 0 : 0;
  const discN = dSel ? discTotal(dLines, ks, dPct) : oldDisc;
  const discParts = ks.reduce((a, b) => a + b, 0);
  const total = gross - discN;

  function step(i: number, d: number) {
    setErr(null);
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, qty: Math.max(0, Math.min(999, l.qty + d)) } : l)));
  }
  function add() {
    if (!addPid) return;
    const c = addCup ? 'coc' : 'chai';
    setErr(null);
    setLines((ls) => (ls.some((l) => l.pid === addPid && l.container === c && l.less === addLess)
      ? ls.map((l) => (l.pid === addPid && l.container === c && l.less === addLess ? { ...l, qty: l.qty + 1 } : l))
      : [...ls, { pid: addPid, container: c, qty: 1, less: addLess }]));
    setAddPid('');
  }
  async function save() {
    setErr(null);
    if (!kept.length) return setErr('Đơn phải còn ít nhất một món. Muốn bỏ cả đơn thì quay lại và bấm Hủy đơn.');
    if (discN > gross) return setErr(`Giảm ${vnd(discN)} lớn hơn tiền đơn ${vnd(gross)}. Sửa lại số giảm giá.`);
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_edit_order', {
      p_order: id,
      p: { lines: kept.map((l) => ({ product_id: l.pid, qty: l.qty, container: l.container, ...(l.less ? { sugar: 'less' } : {}) })),
           ...(dSel ? { discount_vnd: 0, ...discPayload(dSel, parts, discWhy) } : { discount_vnd: discN, discount_reason: discN > 0 ? discWhy.trim() || null : null }),
           is_gift: isGift, payment_method: isGift ? '' : pay || '', customer_name: cust.trim() },
      p_reason: why.trim() || null
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    toast.show('Đã sửa đơn');
    nav(`/bao-cao/don/${(data as any).id}${from}`, { replace: true });
  }

  return (
    <div className="screen">
      <Header title={o ? `Sửa đơn số ${o.seq_in_day}` : 'Sửa đơn'} sub={outlet.name} back={back} />
      <main className="main with-bar">
        {loading && !o ? (
          <Loading />
        ) : !o || o.status !== 'active' ? (
          <section className="card"><strong>Đơn này không sửa được</strong><span className="small muted">Đơn đã hủy hoặc không còn. Quay lại danh sách đơn.</span></section>
        ) : !canManage ? (
          <section className="card"><strong>Chỉ chủ cơ sở sửa được đơn</strong><span className="small muted">Nhờ chủ cơ sở sửa giúp. Bạn vẫn đánh dấu được cách nhận tiền ở màn chi tiết đơn.</span></section>
        ) : (
          <>
            <p className="small muted">
              Đơn lúc {timeHM(o.placed_at)}, {o.customer_name || 'khách lẻ'}, đang là {vnd(o.total_vnd)}. Khi lưu, đơn cũ được đánh dấu đã sửa và một đơn mới thay thế, cùng giờ bán. Giá tính theo bảng giá của ngày bán.
            </p>
            <section className="card tight">
              <div className="h2" style={{ padding: '12px 0 2px' }}>Món</div>
              {lines.map((l, i) => (
                <div key={l.pid + l.container + (l.less ? 'l' : '')} className="list-row" style={{ minHeight: 52, gap: 8, opacity: l.qty ? 1 : 0.45 }}>
                  <span className="grow">
                    <span className="strong">{prod(l.pid)?.name || 'Món đã bỏ'}{l.container === 'coc' ? ' · cốc giấy' : ''}{l.less && <span className="less-tag" style={{ marginLeft: 6 }}>ít đường</span>}</span>
                    <span className="xs muted" style={{ display: 'block' }}>{l.qty ? `${vnd(prod(l.pid)?.price || 0)} mỗi phần` : 'Sẽ bỏ khỏi đơn'}</span>
                    {ks[i] > 0 && <span className="xs strong" style={{ display: 'block', color: 'var(--ink-brand)' }}>Giảm {dPct}% · {ks[i]} phần × {vnd(unitDisc(prod(l.pid)?.price || 0, dPct))}</span>}
                  </span>
                  <button type="button" className="icon-btn" aria-label="Bớt một" disabled={l.qty === 0} onClick={() => step(i, -1)}><Icon name="minus" size={18} sw={2.4} /></button>
                  <span className="num strong" style={{ minWidth: 28, textAlign: 'center' }}>{l.qty}</span>
                  <button type="button" className="icon-btn" aria-label="Thêm một" onClick={() => step(i, 1)}><Icon name="plus" size={18} sw={2.4} /></button>
                </div>
              ))}
              <div className="list-row" style={{ gap: 8, paddingBottom: 12 }}>
                <select className="input grow" aria-label="Thêm món vào đơn" value={addPid} style={{ minWidth: 0, fontSize: 15, minHeight: 44 }} onChange={(e) => setAddPid(e.target.value)}>
                  <option value="">Thêm món…</option>
                  {(catalog?.products || []).map((p) => <option key={p.id} value={p.id}>{p.short_name || p.name} · {vnd(p.price)}</option>)}
                </select>
                <button type="button" role="switch" aria-checked={addCup} className={`chip ${addCup ? 'cup' : ''}`} style={{ minHeight: 44 }} onClick={() => setAddCup((v) => !v)}>{addCup ? 'Cốc' : 'Chai'}</button>
                <button type="button" role="switch" aria-checked={addLess} aria-label="Ít đường" className={`cup-btn sugar-btn ${addLess ? 'on' : ''}`} onClick={() => setAddLess((v) => !v)}><SugarLess on={addLess} size={26} /></button>
                <button type="button" className="btn secondary" style={{ minHeight: 44 }} disabled={!addPid} onClick={add}>Thêm</button>
              </div>
            </section>

            <section className="card">
              <div className="h2">Nhận tiền</div>
              <div className="seg3" role="radiogroup" aria-label="Nhận tiền">
                {([['cash', 'Tiền mặt'], ['transfer', 'C.khoản'], ['gift', 'Tặng']] as ['cash' | 'transfer' | 'gift', string][]).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={pay === k} className={pay === k ? 'on' : ''} onClick={() => setPay(pay === k ? null : k)}>
                    {pay === k && <Icon name="check" size={16} sw={2.6} />}{l}
                  </button>
                ))}
              </div>
              <span className="xs muted">{isGift ? 'Đơn tặng: tính 0 đ, hàng vẫn trừ.' : pay ? 'Bấm lại lần nữa để bỏ đánh dấu.' : 'Đang để chưa nhận tiền.'}</span>
            </section>

            <section className="card">
              <div className="h2">Khách hàng</div>
              <label className="input-wrap"><input value={cust} onChange={(ev) => setCust(ev.target.value)} placeholder="Để trống nếu là khách lẻ" aria-label="Tên khách hàng" maxLength={60} autoComplete="off" /></label>
            </section>

            {!isGift && (
              <section className="card">
                <div className="h2">Giảm giá</div>
                {dMode === 'old' && (
                  <div className="alert warn small">
                    Đơn này đang giảm {vnd(oldDisc)} theo cách cũ (một số tiền ở tổng đơn). Không chọn gì thì giữ nguyên số đó. Chọn một nút bên dưới thì app tính lại theo 5% hoặc 10%.
                  </div>
                )}
                <div className="seg3" role="radiogroup" aria-label="Giảm giá">
                  {([['none', 'Không giảm'], ['all', 'Cả đơn'], ['some', 'Một số']] as ['none' | 'all' | 'some', string][]).map(([k, l]) => (
                    <button key={k} type="button" role="radio" aria-checked={dMode === k} className={dMode === k ? 'on' : ''} style={{ fontSize: 14 }} onClick={() => setDMode(k)}>
                      {dMode === k && <Icon name="check" size={16} sw={2.6} />}{l}
                    </button>
                  ))}
                </div>
                {(dMode === 'all' || dMode === 'some') && (
                  <div className="seg3" role="radiogroup" aria-label="Mức giảm">
                    {PCTS.map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={dPct === v} className={dPct === v ? 'on' : ''} style={{ minHeight: 44 }} onClick={() => setDPct(v)}>Giảm {v}%</button>
                    ))}
                  </div>
                )}
                {dMode === 'some' && (
                  <div className="row" style={{ gap: 12 }}>
                    <span className="grow">
                      <span className="strong" style={{ display: 'block' }}>Số phần được giảm</span>
                      <span className="xs muted">Đơn có {parts} phần · giảm phần giá cao nhất trước</span>
                    </span>
                    <span className="stepper">
                      <button type="button" aria-label="Bớt một phần" disabled={someN <= 1} onClick={() => setDN(someN - 1)}><Icon name="minus" size={20} sw={2.4} /></button>
                      <span className="val" aria-live="polite">{someN}</span>
                      <button type="button" className="plus" aria-label="Thêm một phần" disabled={someN >= parts} onClick={() => setDN(someN + 1)}><Icon name="plus" size={20} sw={2.4} /></button>
                    </span>
                  </div>
                )}
                {discN > 0 && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div className="row between small"><span>Tạm tính</span><span className="num">{vnd(gross)}</span></div>
                      <div className="row between small" style={{ color: 'var(--ink-brand)' }}>
                        <span>{dSel ? `Giảm ${dPct}% cho ${discParts} phần` : 'Giảm theo cách cũ'}</span><span className="num">− {vnd(discN)}</span>
                      </div>
                    </div>
                    <label className="input-wrap"><input value={discWhy} onChange={(e) => setDiscWhy(e.target.value)} placeholder="Lý do giảm (không bắt buộc)" aria-label="Lý do giảm giá" maxLength={80} /></label>
                  </>
                )}
                {dSel && <span className="xs muted">Đổi số lượng món ở trên thì app tự chọn lại phần được giảm.</span>}
              </section>
            )}

            <section className="card">
              <div className="h2">Lý do sửa</div>
              <label className="input-wrap"><input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Ví dụ: ghi nhầm món, khách đổi thêm 1 chai" aria-label="Lý do sửa đơn" maxLength={120} /></label>
              <span className="xs muted">Không bắt buộc. Lý do, người sửa và đơn trước khi sửa được ghi vào Lịch sử sửa, hủy đơn.</span>
            </section>
          </>
        )}
      </main>
      {o && o.status === 'active' && canManage && (
        <div className="bar">
          {err && <span className="err">{err}</span>}
          <div className="row" style={{ gap: 12 }}>
            <div className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="xs strong muted">{parts} phần · trước khi sửa {vnd(o.total_vnd)}</span>
              <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{vnd(total)}</span>
            </div>
            <button className="btn lg" style={{ minWidth: 150 }} disabled={busy || !kept.length} onClick={save}>
              <Icon name="check" size={20} sw={2.2} /> Lưu sửa đổi
            </button>
          </div>
        </div>
      )}
      <Nav />
    </div>
  );
}
