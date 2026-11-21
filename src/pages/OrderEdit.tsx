import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { ddmm, timeHM, vnd, vnToday, weekdayLabel } from '../lib/format';
import { Header, Icon, Loading, Nav, SugarLess, useToast } from '../components/ui';
import { DEFAULT_DISC, allocate, discError, discFromOrder, discLabel, discPayload, discTotal, lineLabel, unitsOf, type Disc } from '../lib/discount';
import DiscountPicker from '../components/DiscountPicker';
import MoveDateSheet from '../components/MoveDateSheet';
import BuffetSheet, { BUFFET_PRICE, buffetSummary, type BuffetPick } from '../components/BuffetSheet';

type Line = { pid: string; container: 'chai' | 'coc'; qty: number; less: boolean; custom?: BuffetPick };

/** Sửa đơn đã ghi (chỉ chủ cơ sở, admin). Lưu = đảo đơn cũ + ghi đơn mới qua fn_edit_order; có ghi vào lịch sử. */
export default function OrderEdit() {
  const { id } = useParams();
  const { outlet, catalog, canManage, bump } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const from = new URLSearchParams(useLocation().search).get('from') === 'home' ? '?from=home' : '';
  const { data: o, loading } = useLoad(async () => {
    const { data } = await supabase.from('orders')
      .select('id,seq_in_day,business_date,placed_at,status,total_vnd,discount_vnd,discount_reason,discount_kind,discount_value,is_gift,payment_method,customer_name,order_lines(id,qty,product_id,container,sugar,unit_price_vnd,discount_qty,discount_unit_vnd,order_line_items(ingredient_id,qty))')
      .eq('id', id).maybeSingle();
    return (data as any) || null;
  }, [id]);
  // Nhân viên sửa được đơn trong 7 ngày gần nhất (0064); chủ cơ sở không giới hạn
  const canFix = canManage || (!!o && o.business_date >= vnToday(-6));
  const [lines, setLines] = useState<Line[]>([]);
  // 'old' = đơn đang giảm một số tiền theo cách cũ (trước 16/11): giữ nguyên số đó cho tới khi chọn lại
  const [disc, setDisc] = useState<Disc | 'old'>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  // Bảng chọn Buffet: idx = dòng đang sửa, -1 = thêm mới
  const [bf, setBf] = useState<{ pick: BuffetPick; idx: number } | null>(null);
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
    setLines(o.order_lines.map((l: any) => {
      const container = l.container === 'coc' ? 'coc' : 'chai';
      const items = l.order_line_items || [];
      const custom: BuffetPick | undefined = items.length
        ? { key: l.id, container, less: l.sugar === 'less', price: l.unit_price_vnd, items: Object.fromEntries(items.map((i: any) => [i.ingredient_id, Number(i.qty)])) }
        : undefined;
      return { pid: l.product_id, container, qty: l.qty, less: l.sugar === 'less', custom };
    }));
    setDisc(discFromOrder(o, o.order_lines));
    setDiscWhy(o.discount_reason || '');
    setPay(o.is_gift ? 'gift' : o.payment_method || null);
    setCust(o.customer_name || '');
  }, [o]);

  if (!outlet) return null;
  const prod = (pid: string) => catalog?.allProducts.find((p) => p.id === pid);
  const back = `/bao-cao/don/${id}${from}`;
  /** Giá một phần: Buffet theo giá đã chọn của dòng, món thường theo bảng giá. */
  const lp = (l: Line) => (l.custom ? l.custom.price : prod(l.pid)?.price || 0);
  const kept = lines.filter((l) => l.qty > 0);
  const isGift = pay === 'gift';
  const gross = isGift ? 0 : kept.reduce((s, l) => s + l.qty * lp(l), 0);
  const parts = kept.reduce((s, l) => s + l.qty, 0);
  const dSel: Disc = isGift || disc === 'old' ? null : disc;
  const dLines = lines.map((l) => ({ price: lp(l), qty: l.qty }));
  const ks = allocate(dLines, dSel);
  const us = unitsOf(dLines, dSel);
  const discErr = discError(dLines, dSel);
  const oldDisc = !isGift && disc === 'old' ? o?.discount_vnd || 0 : 0;
  const discN = dSel ? (discErr ? 0 : discTotal(dLines, dSel)) : oldDisc;
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
    if (prod(addPid)?.is_custom) {
      setBf({ pick: { key: crypto.randomUUID(), container: c, less: addLess, price: BUFFET_PRICE, items: {} }, idx: -1 });
      setAddPid('');
      return;
    }
    setLines((ls) => (ls.some((l) => l.pid === addPid && l.container === c && l.less === addLess)
      ? ls.map((l) => (l.pid === addPid && l.container === c && l.less === addLess ? { ...l, qty: l.qty + 1 } : l))
      : [...ls, { pid: addPid, container: c, qty: 1, less: addLess }]));
    setAddPid('');
  }
  async function save() {
    setErr(null);
    if (!kept.length) return setErr('Đơn phải còn ít nhất một món. Muốn bỏ cả đơn thì quay lại và bấm Hủy đơn.');
    if (discErr) return setErr(discErr);
    if (discN > gross) return setErr(`Giảm ${vnd(discN)} lớn hơn tiền đơn ${vnd(gross)}. Sửa lại số giảm giá.`);
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_edit_order', {
      p_order: id,
      p: { lines: kept.map((l) => ({ product_id: l.pid, qty: l.qty, container: l.container, ...(l.less ? { sugar: 'less' } : {}),
        ...(l.custom ? { price: l.custom.price, custom: Object.entries(l.custom.items).filter(([, q]) => q > 0).map(([ingredient_id, qty]) => ({ ingredient_id, qty })) } : {}) })),
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
        ) : !canFix ? (
          <section className="card"><strong>Đơn đã quá 7 ngày</strong><span className="small muted">Nhân viên chỉ sửa được đơn trong 7 ngày gần nhất. Nhờ chủ cơ sở sửa giúp.</span></section>
        ) : (
          <>
            <p className="small muted">
              Đơn lúc {timeHM(o.placed_at)}, {o.customer_name || 'khách lẻ'}, đang là {vnd(o.total_vnd)}. Khi lưu, đơn cũ được đánh dấu đã sửa và một đơn mới thay thế, cùng giờ bán. Giá tính theo bảng giá của ngày bán.
            </p>
            <section className="card">
              <div className="row" style={{ gap: 10 }}>
                <span className="muted" style={{ display: 'flex' }}><Icon name="calendar" size={20} /></span>
                <span className="grow">
                  <span className="xs strong muted" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '.04em' }}>Ngày bán</span>
                  <span className="strong">{weekdayLabel(o.business_date)} · {timeHM(o.placed_at)}</span>
                </span>
                {canManage && <button type="button" className="chip" style={{ minHeight: 40 }} onClick={() => setMoveOpen(true)}>Đổi ngày</button>}
              </div>
              {canManage && <span className="xs muted">Đổi ngày thì lưu ngay, không cần bấm Lưu sửa đổi. Muốn vừa đổi món vừa đổi ngày: lưu sửa món trước.</span>}
            </section>
            <section className="card tight">
              <div className="h2" style={{ padding: '12px 0 2px' }}>Món</div>
              {lines.map((l, i) => (
                <div key={l.custom?.key || l.pid + l.container + (l.less ? 'l' : '')} className="list-row" style={{ minHeight: 52, gap: 8, opacity: l.qty ? 1 : 0.45 }}>
                  <span className="grow" role={l.custom ? 'button' : undefined} tabIndex={l.custom ? 0 : undefined} style={{ cursor: l.custom ? 'pointer' : undefined }}
                    onClick={l.custom ? () => setBf({ pick: l.custom!, idx: i }) : undefined}>
                    <span className="strong">{prod(l.pid)?.name || 'Món đã bỏ'}{l.container === 'coc' ? ' · cốc giấy' : ''}{l.less && <span className="less-tag" style={{ marginLeft: 6 }}>ít đường</span>}</span>
                    {l.custom && <span className="xs muted" style={{ display: 'block' }}>{buffetSummary(l.custom.items, (id) => catalog?.ingredientById[id])} · chạm để sửa</span>}
                    <span className="xs muted" style={{ display: 'block' }}>{l.qty ? `${vnd(lp(l))} mỗi phần` : 'Sẽ bỏ khỏi đơn'}</span>
                    {discN > 0 && ks[i] > 0 && us[i] > 0 && <span className="xs strong" style={{ display: 'block', color: 'var(--ink-brand)' }}>{lineLabel(dSel, ks[i], us[i])}</span>}
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
                <div className="row between">
                  <div className="h2">Giảm giá</div>
                  {disc ? (
                    <button type="button" className="small strong" style={{ border: 0, background: 'transparent', color: 'var(--danger)', cursor: 'pointer', minHeight: 36 }}
                      onClick={() => setDisc(null)}>Bỏ giảm giá</button>
                  ) : (
                    <button type="button" className="chip" style={{ minHeight: 36, fontSize: 13 }} onClick={() => setDisc(DEFAULT_DISC)}><Icon name="tag" size={15} /> Thêm giảm giá</button>
                  )}
                </div>
                {disc === 'old' && (
                  <div className="alert warn small">
                    Đơn này đang giảm {vnd(oldDisc)} theo cách cũ (một số tiền ở tổng đơn, chưa chia vào món). Không chọn gì thì giữ nguyên số đó.
                    <button type="button" className="chip" style={{ marginTop: 8, minHeight: 36 }} onClick={() => setDisc({ kind: 'order', amount: oldDisc })}>Chuyển sang giảm tổng đơn {vnd(oldDisc)}</button>
                  </div>
                )}
                {disc && disc !== 'old' && (
                  <DiscountPicker
                    rows={lines.map((l) => ({ key: l.custom?.key || l.pid + l.container + (l.less ? 'l' : ''), name: `${prod(l.pid)?.name || 'Món đã bỏ'}${l.container === 'coc' ? ' · cốc giấy' : ''}${l.less ? ' · ít đường' : ''}`,
                      price: lp(l), qty: l.qty }))}
                    disc={disc} setDisc={setDisc} />
                )}
                {discN > 0 && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div className="row between small"><span>Tạm tính</span><span className="num">{vnd(gross)}</span></div>
                      <div className="row between small" style={{ color: 'var(--ink-brand)' }}>
                        <span>{dSel ? discLabel(dSel, discParts, parts) : 'Giảm theo cách cũ'}</span><span className="num">− {vnd(discN)}</span>
                      </div>
                    </div>
                    <label className="input-wrap"><input value={discWhy} onChange={(e) => setDiscWhy(e.target.value)} placeholder="Lý do giảm (không bắt buộc)" aria-label="Lý do giảm giá" maxLength={80} /></label>
                  </>
                )}
                {!disc && <span className="xs muted">Đơn không giảm giá.</span>}
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
      {o && o.status === 'active' && canFix && (
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
      {bf && outlet && (
        <BuffetSheet outletId={outlet.id} value={bf.pick} onClose={() => setBf(null)}
          onSave={(b) => {
            setErr(null);
            setLines((ls) => (bf.idx < 0 ? [...ls, { pid: catalog?.products.find((p) => p.is_custom)?.id ?? '', container: b.container, qty: 1, less: b.less, custom: b }]
              : ls.map((l, k) => (k === bf.idx ? { ...l, container: b.container, less: b.less, custom: b } : l))));
            setBf(null);
          }}
          onDelete={bf.idx < 0 ? undefined : () => { setLines((ls) => ls.map((l, k) => (k === bf.idx ? { ...l, qty: 0 } : l))); setBf(null); }} />
      )}
      {moveOpen && o && (
        <MoveDateSheet outletId={outlet.id}
          orders={[{ id: o.id, seq: o.seq_in_day, date: o.business_date, time: timeHM(o.placed_at), customer: o.customer_name || 'Khách lẻ', total: o.total_vnd,
            cash: o.payment_method === 'cash', parts: o.order_lines.reduce((a: number, l: any) => a + l.qty, 0) }]}
          onClose={() => setMoveOpen(false)}
          onDone={(r) => {
            setMoveOpen(false);
            bump();
            const m = r.moved[0];
            toast.show(`Đã chuyển sang ${ddmm(r.business_date)}, số mới #${m.seq_in_day}`);
            nav(`/bao-cao/don/${m.id}${from}`, { replace: true });
          }} />
      )}
      <Nav />
    </div>
  );
}
