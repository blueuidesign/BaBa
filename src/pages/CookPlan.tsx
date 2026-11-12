import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LINES, useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { ddmm, vnToday, weekdayLabel } from '../lib/format';
import { BellLink, Header, Icon, Loading, Nav, Stepper, useToast } from '../components/ui';

export default function CookPlan() {
  const { outlet, catalog, bump } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [kind, setKind] = useState<'next_day' | 'extra_today'>(() => (new Date(Date.now() + 7 * 3600000).getUTCHours() < 12 ? 'extra_today' : 'next_day'));
  const planDate = kind === 'next_day' ? vnToday(1) : vnToday();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, reload } = useLoad(
    async (oid) => {
      const from = vnToday(-7);
      const [sales, plan, recent] = await Promise.all([
        supabase.from('v_sales_by_product').select('product_id,qty,business_date').eq('outlet_id', oid).gte('business_date', from).lt('business_date', vnToday()),
        supabase.from('cook_plans').select('id,status,cook_plan_lines(product_id,planned_qty)').eq('outlet_id', oid).eq('plan_date', planDate).eq('kind', kind).maybeSingle(),
        supabase
          .from('cook_runs')
          .select('id,created_at,business_date,cook_run_lines(qty)')
          .eq('outlet_id', oid)
          .eq('status', 'active')
          .gte('created_at', new Date(Date.now() - 10 * 60000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
      ]);
      const days = new Set((sales.data || []).map((r: any) => r.business_date)).size;
      const avg: Record<string, number> = {};
      (sales.data || []).forEach((r: any) => (avg[r.product_id] = (avg[r.product_id] || 0) + r.qty));
      Object.keys(avg).forEach((k) => (avg[k] = Math.ceil(avg[k] / Math.max(days, 1))));
      const last = (recent.data || [])[0] as any;
      let canUndo = false;
      if (last) {
        const { data: ok } = await supabase.rpc('fn_cook_run_reversible', { p_run: last.id });
        canUndo = !!ok;
      }
      return { avg, days, plan: plan.data as any, recent: last, canUndo };
    },
    [kind]
  );

  // Nháp lưu trên máy theo (cơ sở, ngày, loại) để khóa màn hình hay đổi tab không mất số
  const draftKey = outlet ? `kho-baba-cook-draft:${outlet.id}:${planDate}:${kind}` : '';
  const [loadedKey, setLoadedKey] = useState('');

  // Mở lại: ưu tiên nháp trên máy, rồi kế hoạch đã lưu; không có thì để 0
  useEffect(() => {
    if (!data || !catalog || !draftKey) return;
    let q: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) q = JSON.parse(raw);
    } catch {
      q = {};
    }
    // Kế hoạch đã ghi nấu (status 'cooked') thì về 0, tránh bấm ghi nấu lần nữa thành nấu trùng (T052).
    // Hoàn tác mẻ nấu đưa kế hoạch về 'draft', nên lần nào hoàn tác cũng hiện lại đúng số của kế hoạch.
    if (!Object.keys(q).length && data.plan?.status === 'draft' && data.plan?.cook_plan_lines?.length)
      data.plan.cook_plan_lines.forEach((l: any) => (q[l.product_id] = l.planned_qty));
    setQty(q);
    setLoadedKey(draftKey);
    // chạy lại khi đổi ngày/loại, hoặc khi kế hoạch đổi trạng thái (ghi nấu, hoàn tác);
    // không chạy lại khi dữ liệu nền làm mới, để không xóa số đang nhập
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data, !!catalog, draftKey, data?.plan?.id, data?.plan?.status, data?.recent?.id, data?.recent?.status]);

  useEffect(() => {
    if (!draftKey || loadedKey !== draftKey) return;
    try {
      if (Object.values(qty).some((v) => v > 0)) localStorage.setItem(draftKey, JSON.stringify(qty));
      else localStorage.removeItem(draftKey);
    } catch {
      /* bộ nhớ máy đầy: bỏ qua */
    }
  }, [qty, draftKey, loadedKey]);

  if (!outlet) return null;
  const products = catalog?.products || [];
  const total = products.reduce((s, p) => s + (qty[p.id] || 0), 0);
  const count = products.filter((p) => qty[p.id]).length;

  async function savePlan(): Promise<string | null> {
    setErr(null);
    setBusy(true);
    try {
      const { data: plan, error } = await supabase
        .from('cook_plans')
        .upsert({ outlet_id: outlet!.id, plan_date: planDate, kind, status: 'draft' }, { onConflict: 'outlet_id,plan_date,kind' })
        .select('id')
        .single();
      if (error) throw error;
      await supabase.from('cook_plan_lines').delete().eq('plan_id', plan.id);
      const lines = products.filter((p) => qty[p.id] > 0).map((p) => ({ plan_id: plan.id, product_id: p.id, planned_qty: qty[p.id] }));
      if (lines.length) {
        const { error: e2 } = await supabase.from('cook_plan_lines').insert(lines);
        if (e2) throw e2;
      }
      return plan.id;
    } catch (e) {
      setErr(errorText(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function undoRecent() {
    const { error } = await supabase.rpc('fn_reverse_cook_run', { p_run: data!.recent.id, p_reason: 'Ghi nhầm' });
    if (error) return toast.show(errorText(error));
    toast.show('Đã hoàn tác mẻ nấu');
    bump();
    reload();
  }

  const recentBottles = data?.recent?.cook_run_lines?.reduce((s: number, l: any) => s + l.qty, 0);

  return (
    <div className="screen">
      <Header title="Kế hoạch nấu" sub={`${weekdayLabel(planDate)} · ${outlet.name}`} right={<BellLink />} />
      <main className="main with-bar">
        {data?.recent && (
          <div className="alert ok" role="status">
            <Icon name="check" size={20} sw={2} />
            <span className="grow">
              Đã ghi nấu {recentBottles} chai cho ngày {ddmm(data.recent.business_date)}. {data.canUndo ? 'Ghi nhầm thì hoàn tác trong 10 phút.' : 'Đã bán một phần số chai này nên không hoàn tác được; sửa bằng đếm chai cuối ngày.'}
            </span>
            {data.canUndo && (
              <button className="btn quiet" style={{ minHeight: 32 }} onClick={undoRecent}>
                Hoàn tác
              </button>
            )}
          </div>
        )}
        <div className="chips">
          <button className={`chip ${kind === 'extra_today' ? 'on' : ''}`} onClick={() => setKind('extra_today')}>
            Nấu cho hôm nay
          </button>
          <button className={`chip ${kind === 'next_day' ? 'on' : ''}`} onClick={() => setKind('next_day')}>
            Nấu cho ngày mai
          </button>
          <Link className="chip" to="/nau/me">
            Mẻ syrup
          </Link>
        </div>
        {!catalog || !data ? (
          <Loading />
        ) : (
          <section className="card tight">
            {LINES.map((line) => {
              const items = products.filter((p) => p.line === line.id);
              if (!items.length) return null;
              return (
                <div key={line.id}>
                  <div className="h2" style={{ padding: '12px 0 2px' }}>{line.name}</div>
                  {items.map((p) => (
                    <div key={p.id} className="list-row">
                      <span className="dot-color" style={{ background: p.color || '#ddd' }} />
                      <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="strong">{p.name}</span>
                        <span className="xs muted">
                          {data.days ? `TB ${data.days} ngày: ${data.avg[p.id] || 0} chai` : 'Chưa có số bán để tham khảo'}
                          {!p.recipe.length && ' · Chưa có công thức, kho chỉ trừ bao bì'}
                        </span>
                      </span>
                      <Stepper value={qty[p.id] || 0} onChange={(v) => setQty((q) => ({ ...q, [p.id]: v }))} label={`chai ${p.short_name}`} editable />
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        )}
        <p className="xs muted">Số trung bình lấy từ các ngày gần nhất của cơ sở này để bạn tham khảo. Kế hoạch chỉ để tính nguyên liệu, chưa trừ kho. Số đang nhập được giữ trên máy cho tới khi ghi nấu.</p>
      </main>
      <div className="bar">
        {err && <span className="err">{err}</span>}
        <div className="bar-row">
          <div className="bar-total">
            <span className="label">Tổng kế hoạch</span>
            <span className="value">
              {total} chai · {count} món
            </span>
          </div>
          <button
            className="btn lg"
            disabled={!total || busy}
            onClick={async () => {
              const id = await savePlan();
              if (id) nav(`/nau/nguyen-lieu?plan=${id}`);
            }}
          >
            Xem nguyên liệu <Icon name="chev" size={20} sw={2.2} />
          </button>
        </div>
      </div>
      <Nav />
      {toast.node}
    </div>
  );
}
