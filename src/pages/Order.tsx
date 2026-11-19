import { useEffect, useMemo, useRef, useState } from 'react';
import { LINES, useApp } from '../lib/app';
import { fetchBottles, fetchCustomers, fetchDaySales, useLoad } from '../lib/data';
import { callOrQueue, enqueue, type QueuedCall } from '../lib/queue';
import { errorText } from '../lib/supabase';
import { ddmm, timeHM, uuid, vnd, vnToday } from '../lib/format';
import { Bottle, Cup, Header, Icon, Loading, Nav, SugarLess, confirmDialog } from '../components/ui';
import { DEFAULT_DISC, allocate, discError, discLabel, discPayload, discTotal, lineLabel, unitsOf, type Disc } from '../lib/discount';
import DiscountPicker from '../components/DiscountPicker';


export default function Order() {
  const { outlet, catalog, queue, bump } = useApp();
  // Số chai và số cốc giấy của từng món, giữ riêng để một món có thể có cả hai
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cups, setCups] = useState<Record<string, number>>({});
  // Phần ít đường (20 ml syrup) giữ riêng: chai ít đường và cốc ít đường
  const [countsL, setCountsL] = useState<Record<string, number>>({});
  const [cupsL, setCupsL] = useState<Record<string, number>>({});
  const [cupMode, setCupMode] = useState(false);
  const [sugarMode, setSugarMode] = useState(false); // bật: chạm món là thêm phần ít đường
  const [bulkMode, setBulkMode] = useState(false); // bán nhiều: mỗi món có ô nhập số và nút cộng trừ
  const [rmMode, setRmMode] = useState(false); // chế độ bớt món: chạm ô món để bớt 1
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stuck, setStuck] = useState<QueuedCall | null>(null);
  const [discount, setDiscount] = useState<Disc>(null);
  const [reason, setReason] = useState('');
  const [discOpen, setDiscOpen] = useState(false);
  // Ghi đơn hai bước: 'pick' chọn món → 'review' rà soát, nhận tiền, tên khách → lưu
  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [pay, setPay] = useState<'cash' | 'transfer' | 'gift' | null>(null);
  const [cust, setCust] = useState('');
  const [saved, setSaved] = useState<null | { seq?: number; at: string; parts: string; total: number; queued: boolean; cust: string; pay: string | null; disc: number; discText: string }>(null);
  const today = vnToday();

  const { data } = useLoad(async (oid) => {
    const [bottles, sales, customers] = await Promise.all([fetchBottles(oid, today), fetchDaySales(oid, today), fetchCustomers(oid).catch(() => [])]);
    return { bottles, sales, customers };
  });

  // Popup "đã lưu đơn" tự đóng sau 5 giây
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(null), 5000);
    return () => window.clearTimeout(t);
  }, [saved]);

  // Số chai còn = số sổ trừ các đơn đang chờ gửi trên máy này
  const leftOf = useMemo(() => {
    const m = new Map<string, number>();
    (data?.bottles || []).forEach((b) => m.set(b.product_id, b.left_qty));
    queue
      .filter((q) => q.fn === 'fn_post_order' && q.outletId === outlet?.id && !q.rejected)
      .forEach((q) => (q.payload.lines || []).forEach((l: any) => m.set(l.product_id, (m.get(l.product_id) || 0) - l.qty)));
    return m;
  }, [data, queue, outlet]);

  if (!outlet) return null;
  // Tạm thời (Tùng 12/11): chưa dùng chức năng Nấu nên không chặn khi hết chai và không hiện số chai còn.
  // Bật lại bằng cách đổi SHOW_BOTTLES thành true.
  const SHOW_BOTTLES = false;
  const allowNegative = !SHOW_BOTTLES || !!outlet.settings?.allow_negative_bottles;
  const products = catalog?.products || [];
  const nOf = (m: Record<string, number>, pid: string) => m[pid] || 0;
  const allOf = (pid: string) => nOf(counts, pid) + nOf(countsL, pid) + nOf(cups, pid) + nOf(cupsL, pid);
  const picked = products.filter((p) => allOf(p.id) > 0);
  const nChai = picked.reduce((s, p) => s + nOf(counts, p.id) + nOf(countsL, p.id), 0);
  const nCoc = picked.reduce((s, p) => s + nOf(cups, p.id) + nOf(cupsL, p.id), 0);
  const nLess = picked.reduce((s, p) => s + nOf(countsL, p.id) + nOf(cupsL, p.id), 0);
  const bottles = nChai + nCoc;
  const partsLabel = [nChai ? `${nChai} chai` : '', nCoc ? `${nCoc} cốc giấy` : '', nLess ? `${nLess} ít đường` : ''].filter(Boolean).join(' · ');
  const gross = picked.reduce((s, p) => s + allOf(p.id) * p.price, 0);
  // Mỗi món tách thành dòng theo bao bì (chai, cốc) và ghi chú đường (bình thường, ít đường)
  const rows = picked.flatMap((p) =>
    ([[counts, 'chai', false], [countsL, 'chai', true], [cups, 'coc', false], [cupsL, 'coc', true]] as [Record<string, number>, 'chai' | 'coc', boolean][])
      .filter(([m]) => m[p.id] > 0)
      .map(([m, container, less]) => ({ p, qty: m[p.id], container, less, key: `${p.id}-${container}-${less ? 'l' : 'n'}` }))
  );
  const rowName = (r: { p: { name: string }; container: string }) => `${r.p.name}${r.container === 'coc' ? ' · cốc giấy' : ''}`;
  /** Ô đang ghi theo hai nút ở góc phải: cốc giấy và ít đường. */
  const setterOf = (cup: boolean, less: boolean) => (cup ? (less ? setCupsL : setCups) : less ? setCountsL : setCounts);
  const mapOf = (cup: boolean, less: boolean) => (cup ? (less ? cupsL : cups) : less ? countsL : counts);
  const isGift = pay === 'gift';
  // Giảm giá (5%, 10%, theo tiền mỗi phần hoặc tổng đơn): số phần được giảm và tiền giảm mỗi phần của từng dòng, cùng thứ tự với rows
  const dLines = rows.map((r) => ({ price: r.p.price, qty: r.qty }));
  const dSel = isGift ? null : discount;
  const ks = allocate(dLines, dSel);
  const us = unitsOf(dLines, dSel);
  const discErr = discError(dLines, dSel);
  const disc = discErr ? 0 : discTotal(dLines, dSel);
  const discParts = ks.reduce((a, b) => a + b, 0);
  const discText = discLabel(dSel, discParts, bottles);
  const total = isGift ? 0 : Math.max(0, gross - disc);
  // Gợi ý khách: chưa gõ thì hiện khách mua gần đây; đang gõ thì lọc theo chữ đã gõ, tên bắt đầu bằng chữ đó xếp trước
  const custKey = cust.trim().toLowerCase();
  const custList = data?.customers || [];
  const custHits = !custKey
    ? custList.slice(0, 6)
    : custList.filter((c) => c.name.toLowerCase().includes(custKey) && c.name.toLowerCase() !== custKey)
        .sort((a, b) => Number(b.name.toLowerCase().startsWith(custKey)) - Number(a.name.toLowerCase().startsWith(custKey))).slice(0, 5);

  function inc(pid: string) {
    setErr(null);
    setterOf(cupMode, sugarMode)((c) => ({ ...c, [pid]: (c[pid] || 0) + 1 }));
  }
  /** Bớt 1 ở món này: ưu tiên đúng loại đang bật ở hai nút góc phải; loại đó không có thì bớt loại nào đang có. */
  function dec(pid: string) {
    const n = allOf(pid);
    if (!n) return;
    const order: [boolean, boolean][] = [[cupMode, sugarMode], [cupMode, !sugarMode], [!cupMode, sugarMode], [!cupMode, !sugarMode]];
    const [cup, less] = order.find(([c, l]) => nOf(mapOf(c, l), pid) > 0)!;
    setterOf(cup, less)((c) => {
      const v = (c[pid] || 0) - 1;
      const next = { ...c };
      if (v <= 0) delete next[pid];
      else next[pid] = v;
      return next;
    });
    if (n <= 1 && bottles <= 1) setRmMode(false); // đơn hết món thì tự thoát
  }

  /** Đặt thẳng số lượng (ô nhập ở chế độ Bán nhiều) cho đúng loại đang bật: chai hay cốc, bình thường hay ít đường. */
  function setQty(pid: string, n: number) {
    setErr(null);
    const v = Math.max(0, Math.min(999, Math.floor(n) || 0));
    setterOf(cupMode, sugarMode)((c) => {
      const next = { ...c };
      if (v <= 0) delete next[pid];
      else next[pid] = v;
      return next;
    });
  }
  const clearItems = () => { setCounts({}); setCups({}); setCountsL({}); setCupsL({}); };

  // Giữ ngón tay trên món 0,5 giây thì số tự chạy (bớt nếu đang bật Bớt món); nhả tay hoặc kéo đi là dừng.
  const hold = useRef<{ t?: number; i?: number; x: number; y: number; fired: boolean }>({ x: 0, y: 0, fired: false });
  const tick = useRef<(pid: string) => void>(() => {});
  tick.current = (pid) => (rmMode ? dec(pid) : inc(pid));
  function holdStop() {
    window.clearTimeout(hold.current.t);
    window.clearInterval(hold.current.i);
    hold.current.t = hold.current.i = undefined;
  }
  function holdStart(pid: string, e: React.PointerEvent) {
    holdStop();
    hold.current.fired = false;
    hold.current.x = e.clientX;
    hold.current.y = e.clientY;
    hold.current.t = window.setTimeout(() => {
      hold.current.fired = true;
      const t0 = Date.now();
      const run = (ms: number) => {
        hold.current.i = window.setInterval(() => {
          tick.current(pid);
          if (ms > 60 && Date.now() - t0 > 2000) { window.clearInterval(hold.current.i); run(50); } // sau 2 giây chạy nhanh hơn
        }, ms);
      };
      tick.current(pid);
      run(120);
    }, 500);
  }
  function holdMove(e: React.PointerEvent) {
    if (Math.abs(e.clientX - hold.current.x) > 10 || Math.abs(e.clientY - hold.current.y) > 10) holdStop();
  }
  useEffect(() => holdStop, []);

  function buildCall(): QueuedCall {
    const lines = rows.map((r) => ({ product_id: r.p.id, qty: r.qty, container: r.container, ...(r.less ? { sugar: 'less' } : {}) }));
    const id = uuid();
    return {
      id,
      fn: 'fn_post_order',
      outletId: outlet!.id,
      createdAt: new Date().toISOString(),
      summary: rows.map((r) => `${r.qty} ${r.p.short_name}${r.container === 'coc' ? ' (cốc)' : ''}${r.less ? ' (ít đường)' : ''}`).join(' · '),
      payload: {
        outlet_id: outlet!.id, client_id: id, business_date: today, placed_at: new Date().toISOString(), lines,
        ...(isGift ? { is_gift: true, note: 'Tặng' } : pay ? { payment_method: pay } : {}),
        ...(cust.trim() ? { customer_name: cust.trim() } : {}),
        ...(disc > 0 && !isGift ? discPayload(discount, bottles, reason) : {})
      }
    };
  }

  function reset() {
    clearItems();
    setSugarMode(false);
    setRmMode(false);
    setBulkMode(false);
    setCupMode(false); // lưu xong tự về chai để không ghi nhầm cốc cho đơn sau
    setDiscount(null);
    setReason('');
    setPay(null);
    setCust('');
    setErr(null);
    setStep('pick');
  }

  /** Lưu xong: về ngay lưới món để ghi đơn kế tiếp, hiện popup báo đơn vừa lưu. */
  function done(call: QueuedCall, result: any, queued: boolean) {
    setSaved({
      seq: result?.seq_in_day, at: call.payload.placed_at, parts: partsLabel, total: result?.total_vnd ?? total, queued,
      cust: call.payload.customer_name || '', pay: call.payload.is_gift ? 'gift' : call.payload.payment_method || null,
      disc: result?.discount_vnd ?? disc, discText
    });
    reset();
    bump();
  }

  async function cancelOrder() {
    if (await confirmDialog({ title: 'Bỏ đơn đang ghi?', text: `Đơn ${partsLabel}, ${vnd(total)} chưa được lưu. Bỏ thì các món đã chọn sẽ mất.`, ok: 'Bỏ đơn', cancel: 'Ghi tiếp', danger: true })) reset();
  }

  async function save(call = buildCall()) {
    if (busy || !bottles) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await callOrQueue(call);
      done(call, r.data, !!r.queued);
    } catch (e: any) {
      if (e?.timeout) setStuck(call);
      else setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const stuckSheet = stuck && (
    <>
      <div className="sheet-back" onClick={() => setStuck(null)} />
      <div className="sheet" role="alertdialog" aria-labelledby="stuck-t">
        <span className="ico-box danger" style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--danger-bg)' }}>
          <Icon name="warn" size={26} sw={2} />
        </span>
        <h2 id="stuck-t" style={{ fontSize: 18 }}>Chưa lưu được đơn</h2>
        <p className="small muted">
          Máy chủ không trả lời sau 10 giây. Đơn {partsLabel} · {vnd(total)} vẫn giữ trên máy này. Thử lại ngay, hoặc để app tự gửi khi mạng ổn.
        </p>
        <button className="btn lg block" onClick={() => { const c = stuck; setStuck(null); save(c); }}>Thử lại</button>
        <button className="btn secondary block" onClick={() => { const c = stuck; enqueue(c); setStuck(null); done(c, null, true); }}>Giữ lại, gửi sau</button>
        <button className="btn quiet block" style={{ color: 'var(--danger)' }}
          onClick={async () => {
            if (await confirmDialog({ title: 'Bỏ đơn này?', text: 'Đơn sẽ không được ghi và không gửi lên máy chủ.', ok: 'Bỏ đơn', cancel: 'Giữ lại', danger: true })) { setStuck(null); reset(); }
          }}>
          Bỏ đơn này
        </button>
      </div>
    </>
  );

  const discSheet = discOpen && bottles > 0 && (
    <>
      <div className="sheet-back" onClick={() => setDiscOpen(false)} />
      {/* Chiều cao cố định (cao tối đa) để sheet không nhảy khi đổi lựa chọn; phần giữa cuộn, nút chính ghim dưới */}
      <div className="sheet sheet-fixed" role="dialog" aria-labelledby="disc-t">
        <div className="row between" style={{ minHeight: 32 }}>
          <h2 id="disc-t" style={{ fontSize: 18 }}>Giảm giá</h2>
          {discount && (
            <button type="button" className="small strong" style={{ border: 0, background: 'transparent', padding: '6px 0 6px 12px', cursor: 'pointer', color: 'var(--danger)' }}
              onClick={() => { setDiscount(null); setReason(''); setDiscOpen(false); }}>
              Bỏ giảm giá
            </button>
          )}
        </div>
        <div className="sheet-scroll">
        <p className="small muted" style={{ margin: 0 }}>Đơn {partsLabel} · tạm tính {vnd(gross)}.</p>
        <DiscountPicker
          rows={rows.map((r) => ({ key: r.key, name: `${rowName(r)}${r.less ? ' · ít đường' : ''}`, price: r.p.price, qty: r.qty,
            icon: r.container === 'coc' ? <Cup color={r.p.color} size={24} /> : <Bottle color={r.p.color} size={24} /> }))}
          disc={discount} setDisc={setDiscount} />
        {discount && (
          <label className="input-wrap">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (không bắt buộc), vd: khách quen" aria-label="Lý do giảm giá" maxLength={80} />
          </label>
        )}
        </div>
        <button className="btn lg block" disabled={!!discErr} onClick={() => setDiscOpen(false)}>
          {disc > 0 ? `Giảm ${vnd(disc)} · thu ${vnd(total)}` : discErr ? 'Giảm giá' : 'Xong'}
        </button>
      </div>
    </>
  );

  if (step === 'review' && bottles > 0) {
    const PAYS: [typeof pay, string][] = [['cash', 'Tiền mặt'], ['transfer', 'C.khoản'], ['gift', 'Tặng']];
    return (
      <div className="screen">
        <Header title="Rà soát đơn" sub={`${outlet.name} · chưa lưu`} back={() => { setErr(null); setStep('pick'); }}
          right={<button type="button" className="icon-btn" aria-label="Hủy đơn đang ghi" onClick={cancelOrder}><Icon name="x" size={24} sw={2} /></button>} />
        <main className="main with-bar" style={{ paddingBottom: 110 }}>
          <section className="card" style={{ gap: 8 }}>
            <div className="row between" style={{ alignItems: 'baseline' }}>
              <span className="strong muted">{partsLabel}</span>
              <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>{vnd(total)}</span>
            </div>
            {disc > 0 && !isGift && (
              <div className="row between xs num">
                <span className="muted">Tạm tính {vnd(gross)}</span>
                <span className="strong" style={{ color: 'var(--ink-brand)' }}>{discText} · − {vnd(disc)}</span>
              </div>
            )}
            <div style={{ height: 1, background: 'var(--border)' }} />
            {rows.map((r, i) => (
              <div key={r.key}>
                <div className="row" style={{ gap: 10, minHeight: 32 }}>
                  {r.container === 'coc' ? <Cup color={r.p.color} size={24} /> : <Bottle color={r.p.color} size={24} />}
                  <span className="grow strong">{r.qty} × {rowName(r)}{r.less && <span className="less-tag" style={{ marginLeft: 6 }}>ít đường</span>}</span>
                  <span className="num strong">{vnd(isGift ? 0 : r.qty * r.p.price)}</span>
                </div>
                {disc > 0 && ks[i] > 0 && us[i] > 0 && (
                  <div className="row between xs strong num" style={{ paddingLeft: 34, color: 'var(--ink-brand)' }}>
                    <span>{lineLabel(dSel, ks[i], us[i])}</span>
                    <span>− {vnd(ks[i] * us[i])}</span>
                  </div>
                )}
              </div>
            ))}
            {disc > 0 && !isGift && (
              <button type="button" className="chip on" style={{ alignSelf: 'flex-start', minHeight: 34, fontSize: 13 }} onClick={() => setDiscOpen(true)}>
                <Icon name="tag" size={15} /> {discText} · sửa
              </button>
            )}
          </section>

          <section className="card">
            <div className="h2">Nhận tiền</div>
            <div className="seg3" role="radiogroup" aria-label="Nhận tiền">
              {PAYS.map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={pay === k} className={`${pay === k ? 'on' : ''} ${k === 'gift' ? 'gift' : ''}`} onClick={() => setPay(pay === k ? null : k)}>
                  {pay === k && <Icon name="check" size={16} sw={2.6} />}{l}
                </button>
              ))}
            </div>
            <span className="xs muted">
              {isGift ? 'Đơn tặng: không tính tiền, vẫn trừ hàng.' : pay ? 'Bấm lại lần nữa để bỏ chọn.' : 'Chưa chọn thì đơn lưu là chưa nhận tiền, đánh dấu sau ở màn Hóa đơn.'}
            </span>
          </section>

          <section className="card">
            <div className="h2">Khách hàng</div>
            <label className="input-wrap">
              <Icon name="user" size={20} style={{ color: 'var(--ink-muted)' }} />
              <input value={cust} onChange={(e) => setCust(e.target.value)} placeholder="Gõ tên, hoặc để trống nếu là khách lẻ" aria-label="Tên khách hàng" maxLength={60} autoComplete="off" enterKeyHint="done" />
              {cust && <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Xóa tên khách" onClick={() => setCust('')}><Icon name="x" size={18} sw={2} /></button>}
            </label>
            {custHits.length > 0 && !custKey && (
              <>
                <span className="xs strong muted">Khách quen gần đây</span>
                <div className="chips wrap">
                  {custHits.map((c) => <button key={c.name} type="button" className="chip" style={{ minHeight: 36, fontSize: 14 }} onClick={() => setCust(c.name)}>{c.name}</button>)}
                </div>
              </>
            )}
            {custHits.length > 0 && custKey && (
              <div className="suggest-list" role="listbox" aria-label="Khách có sẵn">
                {custHits.map((c) => (
                  <button key={c.name} type="button" role="option" aria-selected={false} onClick={() => setCust(c.name)}>
                    <span className="strong">{c.name}</span>
                    <span className="xs muted">Mua {c.count} lần, gần nhất {c.last === today ? 'hôm nay' : ddmm(c.last)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
        <div className="bar" style={{ bottom: 0, paddingBottom: 'calc(12px + var(--safe-b))' }}>
          {err && <span className="err">{err}</span>}
          <button className="btn lg block" disabled={busy} onClick={() => save()}>
            <Icon name="check" size={20} sw={2.2} /> {busy ? 'Đang lưu…' : `Lưu đơn · ${vnd(total)}`}
          </button>
        </div>
        {discSheet}
        {stuckSheet}
      </div>
    );
  }

  return (
    <div className="screen">
      <Header title="Ghi đơn" sub={outlet.name} right={
          <span className="row" style={{ gap: 8 }}>
            <button type="button" role="switch" aria-checked={cupMode} aria-label="Ghi bằng cốc giấy" className={`cup-btn ${cupMode ? 'on' : ''}`} onClick={() => setCupMode((v) => !v)}>
              <Cup color={cupMode ? '#fff' : '#C9A27A'} size={28} />
            </button>
            <button type="button" role="switch" aria-checked={sugarMode} aria-label="Ghi ít đường" className={`cup-btn sugar-btn ${sugarMode ? 'on' : ''}`} onClick={() => setSugarMode((v) => !v)}>
              <SugarLess on={sugarMode} size={28} />
            </button>
          </span>
        } />
      <main className="main with-bar">
        {!catalog ? (
          <Loading />
        ) : (
          LINES.map((line) => {
            const items = products.filter((p) => p.line === line.id);
            if (!items.length) return null;
            return (
              <section key={line.id} className="line-group">
                <h2 className="h2">{line.name}</h2>
                <div className="tiles">
                  {items.map((p) => {
                    const nb = nOf(counts, p.id) + nOf(countsL, p.id);
                    const nc = nOf(cups, p.id) + nOf(cupsL, p.id);
                    const nl = nOf(countsL, p.id) + nOf(cupsL, p.id);
                    const n = nb + nc;
                    const left = (leftOf.get(p.id) ?? 0) - n;
                    const out = !allowNegative && left + n <= 0 && n === 0;
                    const off = rmMode ? n === 0 : out || (!allowNegative && left < 0);
                    const cur = nOf(mapOf(cupMode, sugarMode), p.id); // số đang sửa ở ô nhập
                    return (
                      <div key={p.id} className={`tile ${n ? 'on' : ''} ${nc && !nb ? 'cup' : ''} ${rmMode ? (n ? 'rm' : 'dim') : ''} ${off ? 'off' : ''}`}>
                        <button
                          type="button"
                          className="tile-hit"
                          aria-pressed={n > 0}
                          aria-label={`${p.name}, ${vnd(p.price)}${SHOW_BOTTLES ? `, còn ${left}` : ''}${nb ? `, ${nb} chai` : ''}${nc ? `, ${nc} cốc giấy` : ''}${nl ? `, ${nl} ít đường` : ''}${rmMode && n ? ', chạm để bớt 1' : ''}`}
                          disabled={off}
                          onPointerDown={(e) => holdStart(p.id, e)}
                          onPointerMove={holdMove}
                          onPointerUp={holdStop}
                          onPointerLeave={holdStop}
                          onPointerCancel={holdStop}
                          onContextMenu={(e) => e.preventDefault()}
                          onClick={() => {
                            if (hold.current.fired) { hold.current.fired = false; return; } // vừa giữ để chạy số thì không cộng thêm lần chạm
                            if (rmMode) dec(p.id);
                            else if (allowNegative || left > 0) inc(p.id);
                            else setErr(`${p.short_name} đã hết chai trên quầy.`);
                          }}
                        >
                          {rmMode && n > 0 && <span className="rm-mark"><Icon name="minus" size={16} sw={3} /></span>}
                          {n > 0 ? <span className={`count ${nc && !nb ? 'cup' : ''}`}>{n}</span> : out ? <span className="out">Hết</span> : null}
                          {nb > 0 && nc > 0 ? (
                            <span className="split">
                              <span><Bottle color={p.color} size={20} /> × {nb}</span>
                              <span><Cup color={p.color} size={20} /> × {nc}</span>
                            </span>
                          ) : nc > 0 ? (
                            <Cup color={p.color} size={40} />
                          ) : (
                            <Bottle color={p.color} size={40} />
                          )}
                          <span className="name">{p.short_name}</span>
                          {!bulkMode && (
                            nl > 0 ? <span className="less-tag">{nl} ít đường</span> : (
                            <span className="meta">
                              {vnd(p.price)}{SHOW_BOTTLES ? ` · còn ${left}` : ''}
                            </span>)
                          )}
                        </button>
                        {bulkMode && (
                          <span className="qty">
                            <button type="button" aria-label={`Bớt một ${p.short_name}`} disabled={cur === 0} onClick={() => setQty(p.id, cur - 1)}><Icon name="minus" size={14} sw={2.6} /></button>
                            <input
                              inputMode="numeric"
                              pattern="[0-9]*"
                              aria-label={`Số ${cupMode ? 'cốc giấy' : 'chai'}${sugarMode ? ' ít đường' : ''} ${p.short_name}`}
                              value={cur || ''}
                              placeholder="0"
                              maxLength={3}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setQty(p.id, Number(e.target.value.replace(/\D/g, '')))}
                            />
                            <button type="button" aria-label={`Thêm một ${p.short_name}`} onClick={() => setQty(p.id, cur + 1)}><Icon name="plus" size={14} sw={2.6} /></button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </main>

      <div className="bar">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {bottles > 0 && (disc > 0 ? (
              <button type="button" className="chip on" style={{ minHeight: 34, fontSize: 13 }} onClick={() => setDiscOpen(true)} aria-label={`Đang giảm ${vnd(disc)}, bấm để sửa`}>
                <Icon name="tag" size={15} /> {discText} · {vnd(disc)}
              </button>
            ) : (
              <button type="button" className="chip" style={{ minHeight: 34, fontSize: 13 }} onClick={() => { if (!discount) setDiscount(DEFAULT_DISC); setDiscOpen(true); }}>
                <Icon name="tag" size={15} /> Giảm giá
              </button>
            ))}
            {bottles > 0 && <button type="button" role="switch" aria-checked={rmMode} className={`chip ${rmMode ? 'rm-on' : ''}`} style={{ minHeight: 34, fontSize: 13 }} onClick={() => { setRmMode((v) => !v); setBulkMode(false); }}>
              <Icon name="minus" size={15} sw={2.4} /> Bớt món
            </button>}
            {!rmMode && (
              <button type="button" role="switch" aria-checked={bulkMode} className={`chip ${bulkMode ? 'bulk-on' : ''}`} style={{ minHeight: 34, fontSize: 13 }} onClick={() => setBulkMode((v) => !v)}>
                <Icon name="plus" size={15} sw={2.4} /> Bán nhiều
              </button>
            )}
            {rmMode ? (
              <button type="button" className="chip" style={{ minHeight: 34, fontSize: 13, marginLeft: 'auto', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => { clearItems(); setDiscount(null); setReason(''); setRmMode(false); setErr(null); }}>
                <Icon name="trash" size={15} /> Xóa hết
              </button>
            ) : (
              disc > 0 && <span className="small muted num" style={{ marginLeft: 'auto' }}>Tạm tính <s>{vnd(gross)}</s></span>
            )}
        </div>
        {rmMode && <span className="xs strong" style={{ color: 'var(--danger)' }}>Đang bớt món: chạm vào món để bớt 1, giữ để bớt nhanh. Bấm lại nút Bớt món để thôi.</span>}
        {bulkMode && !rmMode && <span className="xs strong" style={{ color: 'var(--brand)' }}>Đang bán nhiều: gõ số {cupMode ? 'cốc' : 'chai'} vào ô, hoặc bấm cộng trừ. Bấm lại nút Bán nhiều để thôi.</span>}
        {sugarMode && !rmMode && <span className="xs strong" style={{ color: 'var(--sugar)' }}>Đang ghi Ít đường: chạm món là thêm 1 phần ít đường. Bấm lại nút thìa đường để về đường bình thường.</span>}
        {err && <span className="err">{err}</span>}
        <div className="bar-row">
          <div className="bar-total">
            <span className="label">{bottles ? `${partsLabel} · ${disc > 0 ? 'thu' : 'trong đơn'}` : 'Chưa chọn món'}</span>
            <span className="value">{vnd(total)}</span>
          </div>
          <button className="btn lg" style={{ minWidth: 150 }} disabled={!bottles} onClick={() => { setErr(null); setRmMode(false); setBulkMode(false); setStep('review'); }}>
            Tiếp theo <Icon name="chev" size={20} sw={2.4} />
          </button>
        </div>
      </div>
      <Nav />

      {discSheet}

      {stuckSheet}

      {saved && (
        <>
          <div className="pop-back" onClick={() => setSaved(null)} />
          <div className="pop" role="status" aria-live="polite">
            <span className="pop-ok"><Icon name="check" size={34} sw={2.6} /></span>
            <strong style={{ fontSize: 18 }}>{saved.queued ? 'Đã lưu trên máy' : `Đã lưu đơn số ${saved.seq ?? ''}`}</strong>
            <span className="small muted" style={{ textAlign: 'center' }}>
              {timeHM(saved.at)}{saved.cust ? ` · ${saved.cust}` : ''}{saved.pay === 'cash' ? ' · tiền mặt' : saved.pay === 'transfer' ? ' · chuyển khoản' : saved.pay === 'gift' ? ' · đơn tặng' : ' · chưa nhận tiền'}
              {saved.queued ? '. Đang mất mạng, app sẽ tự gửi khi có mạng.' : ''}
            </span>
            <span className="strong">{saved.parts}</span>
            <span className="num" style={{ fontSize: 30, fontWeight: 700, lineHeight: '36px' }}>{vnd(saved.total)}</span>
            {saved.disc > 0 && <span className="small strong num" style={{ color: 'var(--ink-brand)' }}>Đã {saved.discText.charAt(0).toLowerCase() + saved.discText.slice(1)} · − {vnd(saved.disc)}</span>}
            <button className="btn secondary block" style={{ marginTop: 8 }} onClick={() => setSaved(null)}>Đóng</button>
            <span className="xs muted">Tự đóng sau 5 giây</span>
            <div className="pop-timer"><div /></div>
          </div>
        </>
      )}
    </div>
  );
}
