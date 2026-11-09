import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LINES, useApp } from '../lib/app';
import { fetchBottles, fetchDaySales, useLoad } from '../lib/data';
import { callOrQueue, enqueue, type QueuedCall } from '../lib/queue';
import { errorText } from '../lib/supabase';
import { uuid, vnd, vnToday } from '../lib/format';
import { BellLink, Bottle, Header, Icon, Loading, Nav } from '../components/ui';

export default function Order() {
  const { outlet, catalog, queue, bump } = useApp();
  const nav = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stuck, setStuck] = useState<QueuedCall | null>(null);
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
  const allowNegative = !!outlet.settings?.allow_negative_bottles;
  const products = catalog?.products || [];
  const picked = products.filter((p) => counts[p.id]);
  const bottles = picked.reduce((s, p) => s + counts[p.id], 0);
  const total = picked.reduce((s, p) => s + counts[p.id] * p.price, 0);

  function inc(pid: string) {
    setErr(null);
    setCounts((c) => ({ ...c, [pid]: (c[pid] || 0) + 1 }));
  }
  function dec(pid: string) {
    setCounts((c) => {
      const n = (c[pid] || 0) - 1;
      const next = { ...c };
      if (n <= 0) delete next[pid];
      else next[pid] = n;
      return next;
    });
  }

  function buildCall(): QueuedCall {
    const lines = picked.map((p) => ({ product_id: p.id, qty: counts[p.id] }));
    const id = uuid();
    return {
      id,
      fn: 'fn_post_order',
      outletId: outlet!.id,
      createdAt: new Date().toISOString(),
      summary: picked.map((p) => `${counts[p.id]} ${p.short_name}`).join(' · '),
      payload: { outlet_id: outlet!.id, client_id: id, business_date: today, placed_at: new Date().toISOString(), lines }
    };
  }

  function done(call: QueuedCall, result: any, queued: boolean) {
    setCounts({});
    bump();
    nav('/ban/da-luu', {
      state: {
        queued,
        clientId: call.id,
        result,
        total,
        bottles,
        lines: picked.map((p) => ({ product_id: p.id, name: p.name, color: p.color, qty: counts[p.id], price: p.price }))
      }
    });
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

  return (
    <div className="screen">
      <Header title="Ghi đơn" sub={`${outlet.name} · ${data?.sales.orders_count ?? 0} đơn · ${data?.sales.bottles ?? 0} chai hôm nay`} right={<BellLink />} />
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
                    const n = counts[p.id] || 0;
                    const left = (leftOf.get(p.id) ?? 0) - n;
                    const out = !allowNegative && left + n <= 0 && n === 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`tile ${n ? 'on' : ''}`}
                        aria-pressed={n > 0}
                        aria-label={`${p.name}, ${vnd(p.price)}, còn ${left}${n ? `, đã chọn ${n}` : ''}`}
                        disabled={out || (!allowNegative && left < 0)}
                        onClick={() => (allowNegative || left > 0 ? inc(p.id) : setErr(`${p.short_name} đã hết chai trên quầy.`))}
                      >
                        {n > 0 ? <span className="count">{n}</span> : out ? <span className="out">Hết</span> : null}
                        <Bottle color={p.color} size={40} />
                        <span className="name">{p.short_name}</span>
                        <span className="meta">
                          {vnd(p.price)} · còn {left}
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
        {picked.length > 0 && (
          <div className="chips wrap">
            {picked.map((p) => (
              <button key={p.id} type="button" className="chip" style={{ minHeight: 34, fontSize: 13, paddingRight: 10 }} aria-label={`Bớt một ${p.short_name}`} onClick={() => dec(p.id)}>
                {p.short_name} <strong>×{counts[p.id]}</strong>
                <Icon name="minus" size={14} sw={2.4} />
              </button>
            ))}
          </div>
        )}
        {err && <span className="err">{err}</span>}
        <div className="bar-row">
          <div className="bar-total">
            <span className="label">{bottles ? `${bottles} chai trong đơn` : 'Chưa chọn món'}</span>
            <span className="value">{vnd(total)}</span>
          </div>
          <button className="btn lg" style={{ minWidth: 150 }} disabled={!bottles || busy} onClick={() => save()}>
            <Icon name="check" size={20} sw={2.2} /> {busy ? 'Đang lưu…' : 'Lưu đơn'}
          </button>
        </div>
      </div>
      <Nav />

      {stuck && (
        <>
          <div className="sheet-back" onClick={() => setStuck(null)} />
          <div className="sheet" role="alertdialog" aria-labelledby="stuck-t">
            <span className="ico-box danger" style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--danger-bg)' }}>
              <Icon name="warn" size={26} sw={2} />
            </span>
            <h2 id="stuck-t" style={{ fontSize: 18 }}>Chưa lưu được đơn</h2>
            <p className="small muted">
              Máy chủ không trả lời sau 10 giây. Đơn {bottles} chai · {vnd(total)} vẫn giữ trên máy này. Thử lại ngay, hoặc để app tự gửi khi mạng ổn.
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
              onClick={() => {
                if (confirm('Bỏ đơn này? Đơn sẽ không được ghi.')) {
                  setStuck(null);
                  setCounts({});
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
