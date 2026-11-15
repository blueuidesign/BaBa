import { useEffect, useMemo, useRef, useState } from 'react';
import { LINES, useApp } from '../lib/app';
import { fetchBottles, fetchCustomers, fetchDaySales, useLoad } from '../lib/data';
import { callOrQueue, enqueue, type QueuedCall } from '../lib/queue';
import { errorText } from '../lib/supabase';
import { ddmm, timeHM, uuid, vnd, vnToday } from '../lib/format';
import { BellLink, Bottle, Cup, Header, Icon, Loading, MoneyInput, Nav, confirmDialog } from '../components/ui';

type Discount = { kind: 'pct'; value: number } | { kind: 'amt'; value: number } | null;
const PCTS = [5, 10];
/** Giảm theo % làm tròn tới nghìn đồng. */
const discountOf = (d: Discount, total: number) =>
  !d ? 0 : d.kind === 'pct' ? Math.round((total * d.value) / 100 / 1000) * 1000 : d.value;

export default function Order() {
  const { outlet, catalog, queue, bump } = useApp();
  // Số chai và số cốc giấy của từng món, giữ riêng để một món có thể có cả hai
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cups, setCups] = useState<Record<string, number>>({});
  const [cupMode, setCupMode] = useState(false);
  const [bulkMode, setBulkMode] = useState(false); // bán nhiều: mỗi món có ô nhập số và nút cộng trừ
  const [rmMode, setRmMode] = useState(false); // chế độ bớt món: chạm ô món để bớt 1
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stuck, setStuck] = useState<QueuedCall | null>(null);
  const [discount, setDiscount] = useState<Discount>(null);
  const [reason, setReason] = useState('');
  const [discOpen, setDiscOpen] = useState(false);
  const [draftAmt, setDraftAmt] = useState('');
  // Ghi đơn hai bước: 'pick' chọn món → 'review' rà soát, nhận tiền, tên khách → lưu
  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [pay, setPay] = useState<'cash' | 'transfer' | 'gift' | null>(null);
  const [cust, setCust] = useState('');
  const [saved, setSaved] = useState<null | { seq?: number; at: string; parts: string; total: number; queued: boolean; cust: string; pay: string | null }>(null);
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
  const picked = products.filter((p) => counts[p.id] || cups[p.id]);
  const nChai = picked.reduce((s, p) => s + (counts[p.id] || 0), 0);
  const nCoc = picked.reduce((s, p) => s + (cups[p.id] || 0), 0);
  const bottles = nChai + nCoc;
  const partsLabel = [nChai ? `${nChai} chai` : '', nCoc ? `${nCoc} cốc giấy` : ''].filter(Boolean).join(' · ');
  const gross = picked.reduce((s, p) => s + ((counts[p.id] || 0) + (cups[p.id] || 0)) * p.price, 0);
  // Mỗi món tách thành dòng chai và dòng cốc
  const rows = picked.flatMap((p) => [
    ...(counts[p.id] ? [{ p, qty: counts[p.id], container: 'chai' as const }] : []),
    ...(cups[p.id] ? [{ p, qty: cups[p.id], container: 'coc' as const }] : [])
  ]);
  const disc = discountOf(discount, gross);
  const discTooBig = disc > gross && gross > 0;
  const isGift = pay === 'gift';
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
    (cupMode ? setCups : setCounts)((c) => ({ ...c, [pid]: (c[pid] || 0) + 1 }));
  }
  /** Bớt 1 ở món này. Món có cả chai và cốc thì bớt theo nút cốc giấy; chỉ có một loại thì bớt đúng loại đó. */
  function dec(pid: string) {
    const nb = counts[pid] || 0;
    const nc = cups[pid] || 0;
    if (!nb && !nc) return;
    const cup = nb && nc ? cupMode : nc > 0;
    (cup ? setCups : setCounts)((c) => {
      const n = (c[pid] || 0) - 1;
      const next = { ...c };
      if (n <= 0) delete next[pid];
      else next[pid] = n;
      return next;
    });
    if (nb + nc <= 1 && bottles <= 1) setRmMode(false); // đơn hết món thì tự thoát
  }

  /** Đặt thẳng số lượng (ô nhập ở chế độ Bán nhiều). Sửa số cốc khi nút cốc giấy đang bật, không thì sửa số chai. */
  function setQty(pid: string, n: number) {
    setErr(null);
    const v = Math.max(0, Math.min(999, Math.floor(n) || 0));
    (cupMode ? setCups : setCounts)((c) => {
      const next = { ...c };
      if (v <= 0) delete next[pid];
      else next[pid] = v;
      return next;
    });
  }

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
    const lines = rows.map((r) => ({ product_id: r.p.id, qty: r.qty, container: r.container }));
    const id = uuid();
    return {
      id,
      fn: 'fn_post_order',
      outletId: outlet!.id,
      createdAt: new Date().toISOString(),
      summary: rows.map((r) => `${r.qty} ${r.p.short_name}${r.container === 'coc' ? ' (cốc)' : ''}`).join(' · '),
      payload: {
        outlet_id: outlet!.id, client_id: id, business_date: today, placed_at: new Date().toISOString(), lines,
        ...(isGift ? { is_gift: true, note: 'Tặng' } : pay ? { payment_method: pay } : {}),
        ...(cust.trim() ? { customer_name: cust.trim() } : {}),
        ...(disc > 0 && !isGift ? { discount_vnd: disc, discount_reason: reason.trim() || (discount?.kind === 'pct' ? `Giảm ${discount.value}%` : null) } : {})
      }
    };
  }

  function reset() {
    setCounts({});
    setCups({});
    setRmMode(false);
    setBulkMode(false);
    setCupMode(false); // lưu xong tự về chai để không ghi nhầm cốc cho đơn sau
    setDiscount(null);
    setDraftAmt('');
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
      cust: call.payload.customer_name || '', pay: call.payload.is_gift ? 'gift' : call.payload.payment_method || null
    });
    reset();
    bump();
  }

  async function cancelOrder() {
    if (await confirmDialog({ title: 'Bỏ đơn đang ghi?', text: `Đơn ${partsLabel}, ${vnd(total)} chưa được lưu. Bỏ thì các món đã chọn sẽ mất.`, ok: 'Bỏ đơn', cancel: 'Ghi tiếp', danger: true })) reset();
  }

  async function save(call = buildCall()) {
    if (busy || !bottles || discTooBig) return;
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
            {disc > 0 && !isGift && <span className="xs muted num">Tạm tính {vnd(gross)} · giảm {vnd(disc)}</span>}
            <div style={{ height: 1, background: 'var(--border)' }} />
            {rows.map((r) => (
              <div key={r.p.id + r.container} className="row" style={{ gap: 10, minHeight: 32 }}>
                {r.container === 'coc' ? <Cup color={r.p.color} size={24} /> : <Bottle color={r.p.color} size={24} />}
                <span className="grow strong">{r.qty} × {r.p.name}{r.container === 'coc' ? ' · cốc giấy' : ''}</span>
                <span className="num strong">{vnd(isGift ? 0 : r.qty * r.p.price)}</span>
              </div>
            ))}
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
        {stuckSheet}
      </div>
    );
  }

  return (
    <div className="screen">
      <Header title="Ghi đơn" sub={`${outlet.name} · ${data?.sales.orders_count ?? 0} đơn · ${data?.sales.bottles ?? 0} chai hôm nay`} right={
          <span className="row" style={{ gap: 8 }}>
            <button type="button" role="switch" aria-checked={cupMode} aria-label="Ghi bằng cốc giấy" className={`cup-btn ${cupMode ? 'on' : ''}`} onClick={() => setCupMode((v) => !v)}>
              <Cup color={cupMode ? '#fff' : '#C9A27A'} size={28} />
            </button>
            <BellLink />
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
                    const nb = counts[p.id] || 0;
                    const nc = cups[p.id] || 0;
                    const n = nb + nc;
                    const left = (leftOf.get(p.id) ?? 0) - n;
                    const out = !allowNegative && left + n <= 0 && n === 0;
                    const off = rmMode ? n === 0 : out || (!allowNegative && left < 0);
                    const cur = cupMode ? nc : nb; // số đang sửa ở ô nhập
                    return (
                      <div key={p.id} className={`tile ${n ? 'on' : ''} ${nc && !nb ? 'cup' : ''} ${rmMode ? (n ? 'rm' : 'dim') : ''} ${off ? 'off' : ''}`}>
                        <button
                          type="button"
                          className="tile-hit"
                          aria-pressed={n > 0}
                          aria-label={`${p.name}, ${vnd(p.price)}${SHOW_BOTTLES ? `, còn ${left}` : ''}${nb ? `, ${nb} chai` : ''}${nc ? `, ${nc} cốc giấy` : ''}${rmMode && n ? ', chạm để bớt 1' : ''}`}
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
                            <span className="meta">
                              {vnd(p.price)}{SHOW_BOTTLES ? ` · còn ${left}` : ''}
                            </span>
                          )}
                        </button>
                        {bulkMode && (
                          <span className="qty">
                            <button type="button" aria-label={`Bớt một ${p.short_name}`} disabled={cur === 0} onClick={() => setQty(p.id, cur - 1)}><Icon name="minus" size={14} sw={2.6} /></button>
                            <input
                              inputMode="numeric"
                              pattern="[0-9]*"
                              aria-label={`Số ${cupMode ? 'cốc giấy' : 'chai'} ${p.short_name}`}
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
                <Icon name="tag" size={15} /> Giảm {discount?.kind === 'pct' ? `${discount.value}% · ` : ''}{vnd(disc)}
              </button>
            ) : (
              <button type="button" className="chip" style={{ minHeight: 34, fontSize: 13 }} onClick={() => { setDraftAmt(''); setDiscOpen(true); }}>
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
                onClick={() => { setCounts({}); setCups({}); setDiscount(null); setDraftAmt(''); setReason(''); setRmMode(false); setErr(null); }}>
                <Icon name="trash" size={15} /> Xóa hết
              </button>
            ) : (
              disc > 0 && <span className="small muted num" style={{ marginLeft: 'auto' }}>Tạm tính <s>{vnd(gross)}</s></span>
            )}
        </div>
        {rmMode && <span className="xs strong" style={{ color: 'var(--danger)' }}>Đang bớt món: chạm vào món để bớt 1, giữ để bớt nhanh. Bấm lại nút Bớt món để thôi.</span>}
        {bulkMode && !rmMode && <span className="xs strong" style={{ color: 'var(--brand)' }}>Đang bán nhiều: gõ số {cupMode ? 'cốc' : 'chai'} vào ô, hoặc bấm cộng trừ. Bấm lại nút Bán nhiều để thôi.</span>}
        {discTooBig && <span className="err">Giảm {vnd(disc)} lớn hơn tiền đơn {vnd(gross)}. Bấm vào ô giảm giá để sửa.</span>}
        {err && <span className="err">{err}</span>}
        <div className="bar-row">
          <div className="bar-total">
            <span className="label">{bottles ? `${partsLabel} · ${disc > 0 ? 'thu' : 'trong đơn'}` : 'Chưa chọn món'}</span>
            <span className="value">{vnd(total)}</span>
          </div>
          <button className="btn lg" style={{ minWidth: 150 }} disabled={!bottles || discTooBig} onClick={() => { setErr(null); setRmMode(false); setBulkMode(false); setStep('review'); }}>
            Tiếp theo <Icon name="chev" size={20} sw={2.4} />
          </button>
        </div>
      </div>
      <Nav />

      {discOpen && (
        <>
          <div className="sheet-back" onClick={() => setDiscOpen(false)} />
          <div className="sheet" role="dialog" aria-labelledby="disc-t">
            <h2 id="disc-t" style={{ fontSize: 18 }}>Giảm giá cho đơn này</h2>
            <p className="small muted">Đơn {partsLabel} · tạm tính {vnd(gross)}. Giá từng món giữ nguyên, app trừ ở tổng đơn.</p>
            <div className="chips wrap">
              {PCTS.map((v) => (
                <button key={v} type="button" className={`chip ${discount?.kind === 'pct' && discount.value === v ? 'on' : ''}`}
                  onClick={() => { setDiscount({ kind: 'pct', value: v }); setDraftAmt(''); }}>
                  {v}% · {vnd(discountOf({ kind: 'pct', value: v }, gross))}
                </button>
              ))}
            </div>
            <span className="small strong">Hoặc nhập số tiền giảm</span>
            <MoneyInput label="Số tiền giảm" value={draftAmt} placeholder="Ví dụ 5.000"
              onChange={(v) => { setDraftAmt(v); setDiscount(v ? { kind: 'amt', value: Number(v) } : null); }} />
            {discTooBig && <span className="err">Giảm không được lớn hơn tiền đơn {vnd(gross)}.</span>}
            <label className="input-wrap">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (không bắt buộc), vd: khách quen" aria-label="Lý do giảm giá" maxLength={80} />
            </label>
            <button className="btn lg block" disabled={discTooBig} onClick={() => setDiscOpen(false)}>
              {disc > 0 ? `Giảm ${vnd(disc)} · thu ${vnd(total)}` : 'Xong'}
            </button>
            {discount && (
              <button className="btn quiet block" onClick={() => { setDiscount(null); setDraftAmt(''); setReason(''); setDiscOpen(false); }}>
                Bỏ giảm giá
              </button>
            )}
          </div>
        </>
      )}

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
            <button className="btn secondary block" style={{ marginTop: 8 }} onClick={() => setSaved(null)}>Đóng</button>
            <span className="xs muted">Tự đóng sau 5 giây</span>
            <div className="pop-timer"><div /></div>
          </div>
        </>
      )}
    </div>
  );
}
