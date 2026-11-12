import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { fetchStock, useLoad } from '../lib/data';
import { ddmm, num, qty as fq, unitLabel, vnToday } from '../lib/format';
import { Header, Icon, Loading, Nav, NumberField, useToast } from '../components/ui';

const REASON: Record<string, string> = {
  purchase: 'Nhập hàng', cook: 'Nấu', cook_packaging: 'Nấu (bao bì)', batch_in: 'Làm mẻ', batch_use: 'Làm mẻ',
  sale_packaging: 'Bán', count_adjust: 'Kiểm kê', waste: 'Hủy', reversal: 'Hoàn tác'
};

export default function StockItem() {
  const { id } = useParams();
  const { outlet, catalog, canManage, bump } = useApp();
  const toast = useToast();
  const [form, setForm] = useState<{ min: string; lead: string; supplier: string; notify: boolean }>({ min: '', lead: '', supplier: '', notify: true });
  const [newSup, setNewSup] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data } = useLoad(
    async (oid) => {
      const [stock, moves, sups] = await Promise.all([
        fetchStock(oid),
        supabase.from('stock_movements').select('qty_delta,reason,business_date,created_at').eq('outlet_id', oid).eq('ingredient_id', id!).gte('business_date', vnToday(-30)).order('created_at', { ascending: false }).limit(40),
        supabase.from('suppliers').select('id,name').eq('outlet_id', oid).order('name')
      ]);
      return { row: stock.find((s) => s.ingredient_id === id)!, moves: moves.data || [], sups: sups.data || [] };
    },
    [id]
  );

  useEffect(() => {
    if (data?.row) setForm({ min: String(Math.round(data.row.min_qty)), lead: data.row.lead_days == null ? '' : String(data.row.lead_days), supplier: data.row.supplier_id || '', notify: data.row.notify_email });
  }, [data]);

  if (!outlet) return null;
  if (!data || !catalog) return (<div className="screen"><Header title="Vật tư" back="/kho" /><Loading /><Nav /></div>);
  const s = data.row;
  if (!s) return (<div className="screen"><Header title="Vật tư" back="/kho" /><p className="center-load">Không tìm thấy vật tư.</p><Nav /></div>);
  // Chỉ món đang bán ở cơ sở này (bỏ món đã ngừng bán hoặc đang tắt) — T033
  const usedIn = catalog.products.filter((p) => p.recipe.some((r) => r.ingredient_id === s.ingredient_id));
  const lateRisk = s.kind === 'purchased' && s.days_of_cover != null && s.lead_days != null && s.days_of_cover < s.lead_days;

  // Gom biến động theo ngày + loại để dễ đọc
  const grouped = new Map<string, { date: string; reason: string; q: number }>();
  data.moves.forEach((m: any) => {
    const k = `${m.business_date}|${REASON[m.reason] || m.reason}`;
    const g = grouped.get(k) || { date: m.business_date, reason: REASON[m.reason] || m.reason, q: 0 };
    g.q += Number(m.qty_delta);
    grouped.set(k, g);
  });

  async function saveSettings() {
    setErr(null);
    const min = Number(form.min);
    if (!min || min <= 0) return setErr('Mức tối thiểu phải lớn hơn 0.');
    setBusy(true);
    let supplierId = form.supplier || null;
    if (form.supplier === '__new') {
      if (!newSup.trim()) {
        setBusy(false);
        return setErr('Nhập tên nhà cung cấp mới.');
      }
      const { data: sup, error } = await supabase.from('suppliers').insert({ outlet_id: outlet!.id, name: newSup.trim() }).select('id').single();
      if (error) {
        setBusy(false);
        return setErr(errorText(error));
      }
      supplierId = sup.id;
    }
    const { error } = await supabase.from('outlet_ingredient_settings').upsert(
      { outlet_id: outlet!.id, ingredient_id: s.ingredient_id, min_qty: min, lead_days: form.lead === '' ? null : Number(form.lead), supplier_id: supplierId, notify_email: form.notify },
      { onConflict: 'outlet_id,ingredient_id' }
    );
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    toast.show('Đã lưu cài đặt');
  }

  async function markOnOrder() {
    const until = vnToday(s.lead_days || 1);
    const { error } = await supabase.from('outlet_ingredient_settings').upsert(
      { outlet_id: outlet!.id, ingredient_id: s.ingredient_id, min_qty: s.min_qty, lead_days: s.lead_days, supplier_id: s.supplier_id, notify_email: s.notify_email, on_order_until: until },
      { onConflict: 'outlet_id,ingredient_id' }
    );
    if (error) return toast.show(errorText(error));
    bump();
    toast.show(`Đã ghi đang về, dự kiến ${ddmm(until)}`);
  }

  return (
    <div className="screen">
      <Header title={s.name} back="/kho" sub={`${s.kind === 'made' ? 'Tự làm' : 'Mua vào'} · đơn vị ${unitLabel(s.unit)}`} />
      <main className="main">
        <section className="card">
          <div className="grid3" style={{ textAlign: 'center' }}>
            <div className="kpi">
              <span className="l">Còn</span>
              <span className="v" style={{ color: s.qty_on_hand < s.min_qty ? 'var(--danger)' : undefined }}>{fq(s.qty_on_hand, s.unit)}</span>
            </div>
            <div className="kpi">
              <span className="l">Dùng/ngày</span>
              <span className="v">{s.use_days >= 3 ? `~${num(s.avg_daily_use)}` : '—'}</span>
            </div>
            <div className="kpi">
              <span className="l">Đủ dùng</span>
              <span className="v">{s.days_of_cover != null && s.use_days >= 3 ? `${num(s.days_of_cover, 1)} ngày` : '—'}</span>
            </div>
          </div>
          {s.use_days < 14 && s.use_days >= 3 && <span className="xs muted">Ước theo {s.use_days} ngày có dữ liệu.</span>}
          {lateRisk && (
            <div className="alert danger">
              <Icon name="truck" size={22} sw={2} />
              <span>
                Nhà cung cấp giao mất <strong>{s.lead_days} ngày</strong>, kho chỉ đủ <strong>{num(s.days_of_cover, 1)} ngày</strong>. Đặt hôm nay để không đứt hàng.
              </span>
            </div>
          )}
          {s.kind === 'made' ? (
            <Link to="/nau/me" className="btn block">
              Nấu mẻ mới
            </Link>
          ) : (
            <div className="grid2">
              <Link to={`/kho/nhap?vt=${s.ingredient_id}`} className="btn">
                Nhập hàng
              </Link>
              <button className="btn secondary" onClick={markOnOrder} disabled={s.on_order}>
                {s.on_order ? `Đang về ${ddmm(s.on_order_until!)}` : 'Đã đặt, đang về'}
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <div className="h2">Cài đặt nhắc đặt hàng</div>
          {!canManage && <span className="small muted">Chỉ chủ cơ sở sửa được phần này.</span>}
          <fieldset disabled={!canManage} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4, opacity: canManage ? 1 : 0.6 }}>
            <div className="list-row">
              <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="strong">Mức tối thiểu</span>
                <span className="xs muted">Dưới mức này thì báo “Cần đặt”</span>
              </span>
              <NumberField value={form.min} onChange={(v) => setForm((f) => ({ ...f, min: v }))} unit={unitLabel(s.unit)} label="Mức tối thiểu" />
            </div>
            {s.kind === 'purchased' && (
              <>
                <div className="list-row">
                  <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="strong">Số ngày giao hàng</span>
                    <span className="xs muted">Để trống nếu mua ngay được</span>
                  </span>
                  <NumberField value={form.lead} onChange={(v) => setForm((f) => ({ ...f, lead: v }))} unit="ngày" label="Số ngày giao hàng" />
                </div>
                <label className="list-row">
                  <span className="grow strong">Nhà cung cấp</span>
                  <select className="input sm" style={{ width: 170 }} value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}>
                    <option value="">Chưa gán</option>
                    {data.sups.map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                    <option value="__new">+ Nhà cung cấp mới…</option>
                  </select>
                </label>
                {form.supplier === '__new' && <input className="input sm" placeholder="Tên nhà cung cấp" value={newSup} onChange={(e) => setNewSup(e.target.value)} />}
                <label className="list-row" style={{ cursor: 'pointer' }}>
                  <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="strong">Nhắc qua email</span>
                    <span className="xs muted">Gửi 6:00 sáng khi cần đặt</span>
                  </span>
                  <input type="checkbox" checked={form.notify} onChange={(e) => setForm((f) => ({ ...f, notify: e.target.checked }))} style={{ width: 22, height: 22 }} />
                </label>
              </>
            )}
            {err && <span className="err">{err}</span>}
            <button className="btn secondary block" onClick={saveSettings} disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu cài đặt'}
            </button>
          </fieldset>
        </section>

        <section className="card">
          <div className="h2">Bảo quản và công thức</div>
          {s.storage_note && <p className="small">{s.storage_note}</p>}
          <p className="xs muted">
            {usedIn.length
              ? `Dùng trong: ${usedIn.map((p) => `${p.short_name} ${num(p.recipe.find((r) => r.ingredient_id === s.ingredient_id)!.qty, 2)} ${unitLabel(s.unit)}`).join(' · ')} (mỗi chai)`
              : s.grp === 'packaging'
                ? 'Mỗi chai dùng một cái, trừ lúc ghi nấu.'
                : 'Dùng cho mẻ bán thành phẩm.'}
          </p>
        </section>

        <section className="card tight">
          <div className="h2" style={{ padding: '12px 0 2px' }}>Biến động 30 ngày</div>
          {grouped.size === 0 && <p className="small muted" style={{ padding: '10px 0' }}>Chưa có biến động.</p>}
          {[...grouped.values()].map((g, i) => (
            <div key={i} className="list-row" style={{ minHeight: 40 }}>
              <span className="small muted num" style={{ width: 44 }}>{ddmm(g.date)}</span>
              <span className="grow small">{g.reason}</span>
              <strong className="num small" style={{ color: g.q > 0 ? 'var(--ok)' : undefined }}>
                {g.q > 0 ? '+ ' : '− '}
                {fq(Math.abs(g.q), s.unit)}
              </strong>
            </div>
          ))}
        </section>
      </main>
      <Nav />
      {toast.node}
    </div>
  );
}
