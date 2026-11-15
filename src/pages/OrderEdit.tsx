import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { timeHM, vnd } from '../lib/format';
import { Header, Icon, Loading, MoneyInput, Nav, useToast } from '../components/ui';

type Line = { pid: string; container: 'chai' | 'coc'; qty: number };

/** Sửa đơn đã ghi (chỉ chủ cơ sở, admin). Lưu = đảo đơn cũ + ghi đơn mới qua fn_edit_order; có ghi vào lịch sử. */
export default function OrderEdit() {
  const { id } = useParams();
  const { outlet, catalog, canManage, bump } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const from = new URLSearchParams(useLocation().search).get('from') === 'home' ? '?from=home' : '';
  const { data: o, loading } = useLoad(async () => {
    const { data } = await supabase.from('orders')
      .select('id,seq_in_day,business_date,placed_at,status,total_vnd,discount_vnd,discount_reason,is_gift,customer_name,order_lines(qty,product_id,container)')
      .eq('id', id).maybeSingle();
    return (data as any) || null;
  }, [id]);
  const [lines, setLines] = useState<Line[]>([]);
  const [disc, setDisc] = useState('');
  const [discWhy, setDiscWhy] = useState('');
  const [why, setWhy] = useState('');
  const [addPid, setAddPid] = useState('');
  const [addCup, setAddCup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!o) return;
    setLines(o.order_lines.map((l: any) => ({ pid: l.product_id, container: l.container === 'coc' ? 'coc' : 'chai', qty: l.qty })));
    setDisc(o.discount_vnd ? String(o.discount_vnd) : '');
    setDiscWhy(o.discount_reason || '');
  }, [o]);

  if (!outlet) return null;
  const prod = (pid: string) => catalog?.allProducts.find((p) => p.id === pid);
  const back = `/bao-cao/don/${id}${from}`;
  const kept = lines.filter((l) => l.qty > 0);
  const gross = o?.is_gift ? 0 : kept.reduce((s, l) => s + l.qty * (prod(l.pid)?.price || 0), 0);
  const discN = o?.is_gift ? 0 : Number(disc) || 0;
  const total = gross - discN;
  const parts = kept.reduce((s, l) => s + l.qty, 0);

  function step(i: number, d: number) {
    setErr(null);
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, qty: Math.max(0, Math.min(999, l.qty + d)) } : l)));
  }
  function add() {
    if (!addPid) return;
    const c = addCup ? 'coc' : 'chai';
    setErr(null);
    setLines((ls) => (ls.some((l) => l.pid === addPid && l.container === c)
      ? ls.map((l) => (l.pid === addPid && l.container === c ? { ...l, qty: l.qty + 1 } : l))
      : [...ls, { pid: addPid, container: c, qty: 1 }]));
    setAddPid('');
  }
  async function save() {
    setErr(null);
    if (!kept.length) return setErr('Đơn phải còn ít nhất một món. Muốn bỏ cả đơn thì quay lại và bấm Hủy đơn.');
    if (discN > gross) return setErr(`Giảm ${vnd(discN)} lớn hơn tiền đơn ${vnd(gross)}. Sửa lại số giảm giá.`);
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_edit_order', {
      p_order: id,
      p: { lines: kept.map((l) => ({ product_id: l.pid, qty: l.qty, container: l.container })), discount_vnd: discN, discount_reason: discN > 0 ? discWhy.trim() || null : null },
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
              Đơn lúc {timeHM(o.placed_at)}, {o.customer_name || 'khách lẻ'}, đang là {vnd(o.total_vnd)}. Khi lưu, đơn cũ được đánh dấu đã sửa và một đơn mới thay thế, cùng giờ bán, cùng khách, cùng cách nhận tiền. Giá tính theo bảng giá của ngày bán.
            </p>
            <section className="card tight">
              <div className="h2" style={{ padding: '12px 0 2px' }}>Món</div>
              {lines.map((l, i) => (
                <div key={l.pid + l.container} className="list-row" style={{ minHeight: 52, gap: 8, opacity: l.qty ? 1 : 0.45 }}>
                  <span className="grow">
                    <span className="strong">{prod(l.pid)?.name || 'Món đã bỏ'}{l.container === 'coc' ? ' · cốc giấy' : ''}</span>
                    <span className="xs muted" style={{ display: 'block' }}>{l.qty ? `${vnd(prod(l.pid)?.price || 0)} mỗi phần` : 'Sẽ bỏ khỏi đơn'}</span>
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
                <button type="button" className="btn secondary" style={{ minHeight: 44 }} disabled={!addPid} onClick={add}>Thêm</button>
              </div>
            </section>

            {!o.is_gift && (
              <section className="card">
                <div className="h2">Giảm giá</div>
                <MoneyInput value={disc} onChange={setDisc} label="Số tiền giảm" placeholder="0" />
                {discN > 0 && (
                  <label className="input-wrap"><input value={discWhy} onChange={(e) => setDiscWhy(e.target.value)} placeholder="Lý do giảm (không bắt buộc)" aria-label="Lý do giảm giá" maxLength={80} /></label>
                )}
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
