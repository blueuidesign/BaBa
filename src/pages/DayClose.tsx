import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { fetchBottles, fetchDaySales, isDayClosed, useLoad } from '../lib/data';
import { ddmm, vnd, vnToday, weekdayLabel } from '../lib/format';
import { Empty, Header, Icon, Loading, Nav, Stepper } from '../components/ui';

const QUICK = [500000, 200000, 100000, 50000, 20000, 10000];

export default function DayClose() {
  const [params] = useSearchParams();
  const date = params.get('ngay') || vnToday();
  const { outlet, catalog, queue, bump } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [gift, setGift] = useState(0);
  const [waste, setWaste] = useState(0);
  const [cash, setCash] = useState('');
  const [transfer, setTransfer] = useState('');
  const [reason, setReason] = useState('');
  const [reclose, setReclose] = useState('');
  const [syrup, setSyrup] = useState('');
  const [catchup, setCatchup] = useState(true);
  const [preview, setPreview] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data } = useLoad(async (oid) => {
    const [bottles, sales, closed] = await Promise.all([fetchBottles(oid, date), fetchDaySales(oid, date), isDayClosed(oid, date)]);
    return { bottles: bottles.filter((b) => b.carried || b.cooked || b.sold), sales, closed };
  }, [date]);

  useEffect(() => {
    if (!data) return;
    const m: Record<string, number> = {};
    data.bottles.forEach((b) => (m[b.product_id] = Math.max(0, b.carried + b.cooked - b.sold)));
    setLeft(m);
  }, [data]);

  if (!outlet) return null;
  const pending = queue.filter((q) => !q.rejected && q.outletId === outlet.id).length;
  const product = (pid: string) => catalog?.allProducts.find((p) => p.id === pid);
  const payload = () => ({
    outlet_id: outlet.id,
    business_date: date,
    lines: Object.entries(left).map(([product_id, counted_left]) => ({ product_id, counted_left })),
    gift_total: gift,
    waste_total: waste,
    cash_vnd: Number(cash || 0),
    transfer_vnd: Number(transfer || 0),
    money_diff_reason: reason || null,
    reclose_reason: reclose || null,
    syrup_measured_ml: syrup === '' ? null : Number(syrup),
    create_catchup_order: catchup
  });

  async function toResult() {
    setErr(null);
    const expected = data?.sales.revenue_vnd || 0;
    const got = Number(cash || 0) + Number(transfer || 0);
    if (expected > 0 && Math.abs(got - expected) / expected > 0.2 && !confirm('Tiền thu lệch hơn 20% so với tổng đơn. Bạn có chắc đã đếm hết?')) return;
    setBusy(true);
    const { data: pv, error } = await supabase.rpc('fn_close_day', { p: payload(), p_commit: false });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setPreview(pv);
    setStep(3);
  }

  async function commit() {
    setErr(null);
    if (pending > 0) return setErr(`Còn ${pending} đơn chưa gửi lên máy chủ. Cần có mạng để đồng bộ trước khi chốt ngày.`);
    if (data?.closed && !reclose.trim()) return setErr('Ngày này đã chốt. Chốt lại cần ghi lý do.');
    setBusy(true);
    const { error } = await supabase.rpc('fn_close_day', { p: payload(), p_commit: true });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    nav('/', { replace: true });
  }

  const sub = `${weekdayLabel(date)} · ${data?.sales.orders_count ?? 0} đơn, ${data?.sales.bottles ?? 0} chai đã ghi`;

  if (!data || !catalog)
    return (
      <div className="screen">
        <Header title="Đối chiếu cuối ngày" back="/" />
        <Loading />
        <Nav />
      </div>
    );

  if (step === 1) {
    return (
      <div className="screen">
        <Header title="Đối chiếu cuối ngày" back="/" sub={`Bước 1/2 · đếm chai · ${sub}`} />
        <main className="main with-bar">
          {data.closed && (
            <div className="alert info">
              <Icon name="check" size={20} sw={2} />
              <span>Ngày {ddmm(date)} đã chốt. Làm lại sẽ tạo bản chốt mới thay bản cũ (bản cũ vẫn giữ trong Lịch sử).</span>
            </div>
          )}
          {data.bottles.length === 0 ? (
            <Empty icon="scale" title="Không có gì để đối chiếu" text="Hôm nay chưa nấu, chưa bán và không có chai tồn. Vẫn có thể chốt ngày trống để giữ chuỗi ngày." />
          ) : (
            <>
              <p className="small">Đếm chai còn trên quầy. Bước sau là đếm tiền. App so cả hai với các đơn đã ghi để tìm chỗ lệch.</p>
              <section className="card tight">
                <div className="h2" style={{ padding: '12px 0 2px' }}>1 · Chai còn lại trên quầy</div>
                {data.bottles.map((b) => {
                  const p = product(b.product_id);
                  const max = b.carried + b.cooked;
                  const over = (left[b.product_id] ?? 0) > max;
                  return (
                    <div key={b.product_id} className="list-row">
                      <span className="dot-color" style={{ background: p?.color || '#ddd' }} />
                      <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="strong">{p?.name}</span>
                        <span className="xs muted" style={{ color: over ? 'var(--danger)' : undefined }}>
                          {over ? 'Nhiều hơn số có thể có, có thể quên ghi nấu' : `Nấu ${b.cooked}${b.carried ? ` + tồn ${b.carried}` : ''} · đơn ghi ${b.sold}`}
                        </span>
                      </span>
                      <Stepper value={left[b.product_id] ?? 0} onChange={(v) => setLeft((m) => ({ ...m, [b.product_id]: v }))} label={`chai ${p?.short_name} còn`} editable />
                    </div>
                  );
                })}
                <p className="xs muted" style={{ padding: '6px 0 12px' }}>Chai còn chuyển thành tồn của ngày mai (bán trong ngày hoặc để lạnh 0–4 °C).</p>
              </section>
              <section className="card tight">
                <div className="h2" style={{ padding: '12px 0 2px' }}>2 · Chai không bán</div>
                <div className="list-row">
                  <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="strong">Tặng, dùng thử</span>
                    <span className="xs muted">Chỉ chai chưa ghi thành đơn tặng</span>
                  </span>
                  <Stepper value={gift} onChange={setGift} label="chai tặng" />
                </div>
                <div className="list-row">
                  <span className="grow strong">Hỏng, đổ, hết hạn</span>
                  <Stepper value={waste} onChange={setWaste} label="chai hủy" />
                </div>
              </section>
            </>
          )}
        </main>
        <div className="bar">
          <button className="btn lg block" onClick={() => setStep(2)}>
            Tiếp: đếm tiền <Icon name="chev" size={22} sw={2.2} />
          </button>
        </div>
        <Nav />
      </div>
    );
  }

  if (step === 2) {
    const got = Number(cash || 0) + Number(transfer || 0);
    return (
      <div className="screen">
        <header className="header">
          <button className="icon-btn" style={{ marginLeft: -8 }} aria-label="Quay lại" onClick={() => setStep(1)}>
            <Icon name="back" size={24} sw={2} />
          </button>
          <div className="titles">
            <h1>Đối chiếu cuối ngày</h1>
            <span className="sub">Bước 2/2 · đếm tiền · theo đơn {vnd(data.sales.revenue_vnd)}</span>
          </div>
        </header>
        <main className="main with-bar">
          <p className="small">Đếm tiền mặt trong hộp và xem tổng tiền vào trong app ngân hàng, rồi nhập hai con số.</p>
          <section className="card">
            <label className="field">
              <span className="label">Tiền mặt đếm được</span>
              <span className="input-wrap" style={{ minHeight: 56 }}>
                <input inputMode="numeric" style={{ fontSize: 24, fontWeight: 700 }} value={cash ? Number(cash).toLocaleString('vi-VN') : ''} onChange={(e) => setCash(e.target.value.replace(/\D/g, ''))} aria-label="Tiền mặt đếm được" />
                <span className="u">đ</span>
              </span>
              <span className="xs muted">Đếm trong hộp tiền, trừ tiền lẻ đầu ca</span>
            </label>
            <div className="chips wrap">
              <span className="xs muted strong" style={{ alignSelf: 'center' }}>Cộng nhanh</span>
              {QUICK.map((q) => (
                <button key={q} className="chip" style={{ minHeight: 34, fontSize: 13, padding: '0 10px' }} onClick={() => setCash(String(Number(cash || 0) + q))}>
                  +{q / 1000}k
                </button>
              ))}
              {cash && (
                <button className="chip" style={{ minHeight: 34, fontSize: 13, padding: '0 10px' }} onClick={() => setCash('')}>
                  Xóa
                </button>
              )}
            </div>
            <label className="field">
              <span className="label">Chuyển khoản nhận được</span>
              <span className="input-wrap" style={{ minHeight: 56 }}>
                <input inputMode="numeric" style={{ fontSize: 24, fontWeight: 700 }} value={transfer ? Number(transfer).toLocaleString('vi-VN') : ''} onChange={(e) => setTransfer(e.target.value.replace(/\D/g, ''))} aria-label="Chuyển khoản nhận được" />
                <span className="u">đ</span>
              </span>
              <span className="xs muted">Tổng tiền vào trong ngày theo app ngân hàng; để trống nếu không nhận chuyển khoản</span>
            </label>
            <div className="row between strong">
              <span>Tổng thu thực tế</span>
              <span className="num">{vnd(got)}</span>
            </div>
            <div className="row between small muted">
              <span>Theo {data.sales.orders_count} đơn đã ghi</span>
              <span className="num">{vnd(data.sales.revenue_vnd)}</span>
            </div>
          </section>
        </main>
        <div className="bar">
          {err && <span className="err">{err}</span>}
          <button className="btn lg block" disabled={busy} onClick={toResult}>
            <Icon name="scale" size={22} sw={2} /> {busy ? 'Đang tính…' : 'Xem kết quả đối chiếu'}
          </button>
        </div>
        <Nav />
      </div>
    );
  }

  // Bước 3: kết quả
  const pv = preview;
  const unknown = pv.diff_bottles as number;
  const catchQty = (pv.catchup_preview || []).reduce((s: number, x: any) => s + x.qty, 0);
  const catchValue = (pv.catchup_preview || []).reduce((s: number, x: any) => s + x.qty * (product(x.product_id)?.price || 0), 0);
  const moneyAfter = pv.diff_money_vnd - (catchup ? catchValue : 0);
  const color = unknown === 0 ? 'var(--ok)' : Math.abs(unknown) <= 2 ? 'var(--warn)' : 'var(--danger)';
  const avgPrice = pv.bottles_by_orders ? pv.revenue_by_orders_vnd / Math.max(1, pv.bottles_by_orders - (data.sales.gift_bottles || 0)) : 20000;

  return (
    <div className="screen">
      <header className="header">
        <button className="icon-btn" style={{ marginLeft: -8 }} aria-label="Quay lại" onClick={() => setStep(2)}>
          <Icon name="back" size={24} sw={2} />
        </button>
        <div className="titles">
          <h1>Kết quả đối chiếu</h1>
          <span className="sub">{weekdayLabel(date)}</span>
        </div>
      </header>
      <main className="main with-bar">
        <section className="card">
          <div className="h2">Theo số chai</div>
          <div className="grid2">
            <div className="kpi"><span className="l">Ra khỏi quầy</span><span className="v">{pv.bottles_out} chai</span></div>
            <div className="kpi"><span className="l">Đơn đã ghi</span><span className="v">{pv.bottles_by_orders} chai</span></div>
          </div>
          <div className="row between small"><span>Ra khỏi quầy</span><span className="num">{pv.bottles_out}</span></div>
          <div className="row between small"><span>− Tặng, dùng thử</span><span className="num">{pv.gift_total}</span></div>
          <div className="row between small"><span>− Hỏng, đổ</span><span className="num">{pv.waste_total}</span></div>
          <div className="row between small"><span>− Đơn đã ghi</span><span className="num">{pv.bottles_by_orders}</span></div>
          <span style={{ height: 1, background: 'var(--border)' }} />
          <div className="row between strong" style={{ color }}>
            <span>Chưa rõ</span>
            <span className="num">{unknown} chai</span>
          </div>
          {unknown === 0 ? (
            <div className="alert ok"><Icon name="check" size={20} sw={2} /><span>Số chai khớp. Không có đơn nào bị quên.</span></div>
          ) : unknown > 0 ? (
            <>
              <div className="alert warn">
                <Icon name="warn" size={20} sw={2} />
                <span>{unknown} chai ra khỏi quầy mà không có đơn. Thường là đơn quên ghi lúc đông khách.</span>
              </div>
              {catchQty > 0 && (
                <label className="row small" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={catchup} onChange={(e) => setCatchup(e.target.checked)} style={{ width: 22, height: 22 }} />
                  <span>
                    Ghi {catchQty} chai này thành <strong>đơn bổ sung cuối ngày</strong> theo giá niêm yết ({vnd(catchValue)}) để doanh thu không hụt.
                  </span>
                </label>
              )}
            </>
          ) : (
            <div className="alert danger"><Icon name="warn" size={20} sw={2} /><span>Đếm được nhiều chai hơn sổ. Có thể quên ghi mẻ nấu, hoặc ghi trùng đơn.</span></div>
          )}
        </section>

        <section className="card">
          <div className="h2">Theo tiền</div>
          <div className="grid2">
            <div className="kpi"><span className="l">Thu thực tế</span><span className="v">{vnd(pv.cash_vnd + pv.transfer_vnd)}</span><span className="xs muted">mặt {vnd(pv.cash_vnd)} + CK {vnd(pv.transfer_vnd)}</span></div>
            <div className="kpi"><span className="l">Theo đơn</span><span className="v">{vnd(pv.revenue_by_orders_vnd + (catchup ? catchValue : 0))}</span><span className="xs muted">{catchup && catchValue ? 'gồm đơn bổ sung' : `${data.sales.orders_count} đơn`}</span></div>
          </div>
          <div className="row between strong" style={{ color: moneyAfter === 0 ? 'var(--ok)' : 'var(--warn)' }}>
            <span>Thực tế − theo đơn</span>
            <span className="num">{moneyAfter > 0 ? '+' : ''}{vnd(moneyAfter)}</span>
          </div>
          {moneyAfter !== 0 && (
            <>
              <div className="row between small muted"><span>Tương đương</span><span className="num">≈ {Math.round(Math.abs(moneyAfter) / avgPrice)} chai</span></div>
              <div className="alert warn">
                <Icon name="warn" size={20} sw={2} />
                <span>Tiền thu {moneyAfter < 0 ? 'hụt' : 'dư'} <strong>{vnd(Math.abs(moneyAfter))}</strong> so với đơn. Thường do: thối nhầm tiền thừa, khách chuyển khoản thiếu, hoặc chai tặng vẫn ghi thành đơn bán.</span>
              </div>
              <label className="field">
                <span className="label">Lý do (nếu biết)</span>
                <input className="input sm" placeholder="Ví dụ: thối nhầm 20k cho khách lúc 9h" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            </>
          )}
        </section>

        <section className="card">
          <div className="h2">Kho syrup (tùy chọn)</div>
          <div className="row">
            <span className="grow small">Đo bình syrup thực tế</span>
            <span className="input-wrap" style={{ width: 130 }}>
              <input inputMode="numeric" value={syrup} onChange={(e) => setSyrup(e.target.value.replace(/\D/g, ''))} aria-label="Syrup đo được" />
              <span className="u">ml</span>
            </span>
          </div>
          <p className="xs muted">Bản 1 chưa trừ syrup theo mức ngọt từng đơn; số đo này đặt lại kho syrup cho đúng.</p>
        </section>

        {data.closed && (
          <label className="field">
            <span className="label">Lý do chốt lại</span>
            <input className="input sm" value={reclose} onChange={(e) => setReclose(e.target.value)} placeholder="Ví dụ: đếm sót 2 chai trong thùng đá" />
          </label>
        )}
      </main>
      <div className="bar">
        {err && <span className="err">{err}</span>}
        <button className="btn lg block" disabled={busy} onClick={commit}>
          <Icon name="check" size={22} sw={2.2} /> {busy ? 'Đang chốt…' : `Chốt ngày ${ddmm(date)}`}
        </button>
        <span className="xs muted" style={{ textAlign: 'center' }}>Chênh lệch được lưu thành bản ghi riêng, đơn không bị sửa.</span>
      </div>
      <Nav />
    </div>
  );
}
