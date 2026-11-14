import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LINES, useApp } from '../lib/app';
import { fetchBottles, fetchDaySales, useLoad } from '../lib/data';
import { callOrQueue, enqueue, type QueuedCall } from '../lib/queue';
import { errorText } from '../lib/supabase';
import { uuid, vnd, vnToday } from '../lib/format';
import { BellLink, Bottle, Cup, Header, Icon, Loading, MoneyInput, Nav, confirmDialog } from '../components/ui';

type Discount = { kind: 'pct'; value: number } | { kind: 'amt'; value: number } | null;
const PCTS = [5, 10];
/** Giảm theo % làm tròn tới nghìn đồng. */
const discountOf = (d: Discount, total: number) =>
  !d ? 0 : d.kind === 'pct' ? Math.round((total * d.value) / 100 / 1000) * 1000 : d.value;

export default function Order() {
  const { outlet, catalog, queue, bump } = useApp();
  const nav = useNavigate();
  // Số chai và số cốc giấy của từng món, giữ riêng để một món có thể có cả hai
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cups, setCups] = useState<Record<string, number>>({});
  const [cupMode, setCupMode] = useState(false);
  const [rmMode, setRmMode] = useState(false); // chế độ bớt món: chạm ô món để bớt 1
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stuck, setStuck] = useState<QueuedCall | null>(null);
  const [discount, setDiscount] = useState<Discount>(null);
  const [reason, setReason] = useState('');
  const [discOpen, setDiscOpen] = useState(false);
  const [draftAmt, setDraftAmt] = useState('');
  const today = vnToday();

  const { data } = useLoad(async (oid) => {
    const [bottles, sales] = await Promise.all([fetchBottles(oid, today), fetchDaySales(oid, today)]);
    return { bottles, sales };
  });

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
  const total = Math.max(0, gross - disc);

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
        ...(disc > 0 ? { discount_vnd: disc, discount_reason: reason.trim() || (discount?.kind === 'pct' ? `Giảm ${discount.value}%` : null) } : {})
      }
    };
  }

  function done(call: QueuedCall, result: any, queued: boolean) {
    setCounts({});
    setCups({});
    setRmMode(false);
    setCupMode(false); // lưu xong tự về chai để không ghi nhầm cốc cho đơn sau
    setDiscount(null);
    setReason('');
    bump();
    nav('/ban/da-luu', {
      state: {
        queued,
        clientId: call.id,
        result,
        total,
        gross,
        discount: disc,
        discountReason: call.payload.discount_reason || null,
        bottles,
        partsLabel,
        lines: rows.map((r) => ({ product_id: r.p.id, name: r.p.name, color: r.p.color, qty: r.qty, price: r.p.price, container: r.container }))
      }
    });
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
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`tile ${n ? 'on' : ''} ${nc && !nb ? 'cup' : ''} ${rmMode ? (n ? 'rm' : 'dim') : ''}`}
                        aria-pressed={n > 0}
                        aria-label={`${p.name}, ${vnd(p.price)}${SHOW_BOTTLES ? `, còn ${left}` : ''}${nb ? `, ${nb} chai` : ''}${nc ? `, ${nc} cốc giấy` : ''}${rmMode && n ? ', chạm để bớt 1' : ''}`}
                        disabled={rmMode ? n === 0 : out || (!allowNegative && left < 0)}
                        onClick={() => rmMode ? dec(p.id) : (allowNegative || left > 0 ? inc(p.id) : setErr(`${p.short_name} đã hết chai trên quầy.`))}
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
                        <span className="meta">
                          {vnd(p.price)}{SHOW_BOTTLES ? ` · còn ${left}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </main>

      <div className="bar">
        {bottles > 0 && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {disc > 0 ? (
              <button type="button" className="chip on" style={{ minHeight: 34, fontSize: 13 }} onClick={() => setDiscOpen(true)} aria-label={`Đang giảm ${vnd(disc)}, bấm để sửa`}>
                <Icon name="tag" size={15} /> Giảm {discount?.kind === 'pct' ? `${discount.value}% · ` : ''}{vnd(disc)}
              </button>
            ) : (
              <button type="button" className="chip" style={{ minHeight: 34, fontSize: 13 }} onClick={() => { setDraftAmt(''); setDiscOpen(true); }}>
                <Icon name="tag" size={15} /> Giảm giá
              </button>
            )}
            <button type="button" role="switch" aria-checked={rmMode} className={`chip ${rmMode ? 'rm-on' : ''}`} style={{ minHeight: 34, fontSize: 13 }} onClick={() => setRmMode((v) => !v)}>
              <Icon name="minus" size={15} sw={2.4} /> Bớt món
            </button>
            {disc > 0 && <span className="small muted num" style={{ marginLeft: 'auto' }}>Tạm tính <s>{vnd(gross)}</s></span>}
          </div>
        )}
        {rmMode && <span className="xs strong" style={{ color: 'var(--danger)' }}>Đang bớt món: chạm vào món để bớt 1. Bấm lại nút Bớt món để thôi.</span>}
        {discTooBig && <span className="err">Giảm {vnd(disc)} lớn hơn tiền đơn {vnd(gross)}. Bấm vào ô giảm giá để sửa.</span>}
        {err && <span className="err">{err}</span>}
        <div className="bar-row">
          <div className="bar-total">
            <span className="label">{bottles ? `${partsLabel} · ${disc > 0 ? 'thu' : 'trong đơn'}` : 'Chưa chọn món'}</span>
            <span className="value">{vnd(total)}</span>
          </div>
          <button className="btn lg" style={{ minWidth: 150 }} disabled={!bottles || busy || discTooBig} onClick={() => save()}>
            <Icon name="check" size={20} sw={2.2} /> {busy ? 'Đang lưu…' : 'Lưu đơn'}
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

      {stuck && (
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
            <button
              className="btn lg block"
              onClick={() => {
                const c = stuck;
                setStuck(null);
                save(c);
              }}
            >
              Thử lại
            </button>
            <button
              className="btn secondary block"
              onClick={() => {
                const c = stuck;
                enqueue(c);
                setStuck(null);
                done(c, null, true);
              }}
            >
              Giữ lại, gửi sau
            </button>
            <button
              className="btn quiet block"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                if (await confirmDialog({ title: 'Bỏ đơn này?', text: 'Đơn sẽ không được ghi và không gửi lên máy chủ.', ok: 'Bỏ đơn', cancel: 'Giữ lại', danger: true })) {
                  setStuck(null);
                  setCounts({});
                  setCups({});
                }
              }}
            >
              Bỏ đơn này
            </button>
          </div>
        </>
      )}
    </div>
  );
}
