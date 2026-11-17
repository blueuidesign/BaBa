import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { fetchStock, useLoad } from '../lib/data';
import { num, qty as fq, unitLabel, uuid, weekdayLabel } from '../lib/format';
import { Header, Icon, Loading, Nav, Stepper } from '../components/ui';

export default function Ingredients() {
  const [params, setParams] = useSearchParams();
  const planId = params.get('plan');
  const view = params.get('xem') === 'mon' ? 'mon' : 'tong';
  const { outlet, catalog, bump } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState<'plan' | 'edit'>('plan');
  const [actual, setActual] = useState<Record<string, number>>({});
  const [haveIt, setHaveIt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data } = useLoad(async (oid) => {
    const [plan, stock] = await Promise.all([
      supabase.from('cook_plans').select('id,plan_date,kind,status,cook_plan_lines(product_id,planned_qty)').eq('id', planId!).single(),
      fetchStock(oid)
    ]);
    if (plan.error) throw plan.error;
    return { plan: plan.data as any, stock };
  }, [planId]);

  const planned = useMemo(() => {
    const m: Record<string, number> = {};
    (data?.plan?.cook_plan_lines || []).forEach((l: any) => (m[l.product_id] = l.planned_qty));
    return m;
  }, [data]);
  useEffect(() => setActual(planned), [planned]);

  const used = mode === 'plan' ? planned : actual;
  const products = (catalog?.allProducts || []).filter((p) => used[p.id] > 0 || planned[p.id] > 0);
  const totalBottles = Object.values(used).reduce((s, v) => s + (v || 0), 0);

  // Nguyên liệu cần = Σ (số chai × định lượng) + bao bì trừ lúc nấu
  const need = useMemo(() => {
    const m = new Map<string, number>();
    if (!catalog) return m;
    catalog.allProducts.forEach((p) => {
      const q = used[p.id] || 0;
      if (!q) return;
      p.recipe.forEach((r) => m.set(r.ingredient_id, (m.get(r.ingredient_id) || 0) + r.qty * q));
      catalog.packaging.filter((r) => r.consume_at === 'cook' && r.product_kind === p.kind).forEach((r) => m.set(r.ingredient_id, (m.get(r.ingredient_id) || 0) + r.qty_per_unit * q));
    });
    return m;
  }, [catalog, used]);

  if (!planId) return <Navigate to="/nau" replace />;
  if (!outlet) return null;
  const stockOf = (iid: string) => data?.stock.find((s) => s.ingredient_id === iid)?.qty_on_hand ?? 0;
  const rows = [...need.entries()]
    .map(([iid, q]) => ({ ing: catalog!.ingredientById[iid], q, have: stockOf(iid) }))
    .filter((r) => r.ing)
    .sort((a, b) => a.ing.sort_order - b.ing.sort_order);
  const short = rows.filter((r) => r.have < r.q);
  const shortProducts = products.filter((p) => p.recipe.some((r) => short.some((s) => s.ing.id === r.ingredient_id)));
  const blocked = short.length > 0 && !haveIt;

  async function record() {
    setErr(null);
    setBusy(true);
    const lines = Object.entries(used)
      .filter(([, q]) => q > 0)
      .map(([product_id, qty]) => ({ product_id, qty }));
    const { error } = await supabase.rpc('fn_post_cook_run', {
      p: { outlet_id: outlet!.id, client_id: uuid(), business_date: data!.plan.plan_date, plan_id: planId, lines }
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    try {
      localStorage.removeItem(`kho-baba-cook-draft:${outlet!.id}:${data!.plan.plan_date}:${data!.plan.kind}`);
    } catch {
      /* bỏ qua */
    }
    bump();
    nav('/nau', { replace: true });
  }

  const tab = (v: string, label: string) => (
    <button
      className={`chip ${view === v ? 'on' : ''}`}
      onClick={() => {
        params.set('xem', v);
        setParams(params, { replace: true });
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="screen">
      <Header title="Nguyên liệu cần" back="/nau" sub={data ? `Bước 2/2 · ${totalBottles} chai · ${products.filter((p) => used[p.id]).length} món` : ''} />
      <main className="main with-bar">
        <div className="chips">
          {tab('tong', 'Tổng tất cả')}
          {tab('mon', 'Theo từng món')}
        </div>
        {!data || !catalog ? (
          <Loading />
        ) : (
          <>
            {short.length > 0 && (
              <div className="alert warn" role="status">
                <Icon name="warn" size={22} sw={2} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <strong>Kho thiếu {short.length} vật tư</strong>
                  <span>
                    {short.map((s) => `${s.ing.name} thiếu ${fq(s.q - s.have, s.ing.unit)}`).join('; ')}. Ảnh hưởng: {shortProducts.map((p) => p.short_name).join(', ') || 'bao bì'}.{' '}
                    Chỉ để biết trước khi nấu; <Link to="/kho/nhap">nhập hàng</Link> nếu vừa mua thêm.
                  </span>
                </div>
              </div>
            )}

            {view === 'tong' ? (
              <section className="card tight">
                <div className="h2" style={{ padding: '12px 0 2px' }}>Theo công thức chuẩn BaBa</div>
                {rows.map((r) => (
                  <div key={r.ing.id} className="list-row">
                    <span className="grow strong">{r.ing.name}</span>
                    <span className="strong num">{fq(r.q, r.ing.unit)}</span>
                    {r.have < r.q ? (
                      <span className="badge danger">{r.have <= 0 ? 'Hết' : `Thiếu ${num(r.q - r.have, 1)}`}</span>
                    ) : r.have < r.q * 1.2 ? (
                      <span className="badge warn">Sát mức</span>
                    ) : (
                      <span className="xs muted num">còn {fq(r.have, r.ing.unit)}</span>
                    )}
                  </div>
                ))}
              </section>
            ) : (
              <>
                <p className="small muted">Mở một món để thấy lượng cân cho đúng số chai sẽ nấu.</p>
                {products
                  .filter((p) => used[p.id] > 0)
                  .map((p, i) => {
                    const n = used[p.id];
                    const jars = Math.max(1, Math.round(n / p.yield_per_jar));
                    return (
                      <details key={p.id} open={i < 2} className="card" style={{ padding: 0, gap: 0 }}>
                        <summary className="row" style={{ minHeight: 56, padding: '8px 14px' }}>
                          <span className="dot-color" style={{ background: p.color || '#ddd' }} />
                          <span className="grow strong">{p.name}</span>
                          <span className="strong num">{n} chai</span>
                          <Icon name="chev" size={20} style={{ color: 'var(--ink-muted)' }} />
                        </summary>
                        <div style={{ padding: '0 14px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'var(--bg-200)', borderRadius: 'var(--radius-md)' }}>
                            {p.recipe.map((r) => {
                              const ing = catalog.ingredientById[r.ingredient_id];
                              return (
                                <div key={r.ingredient_id} className="row between small">
                                  <span>{ing?.name}</span>
                                  <span className="num">
                                    <span className="muted">
                                      {num(r.qty, 2)} {unitLabel(ing?.unit || '')} × {n} ={' '}
                                    </span>
                                    <strong>{fq(r.qty * n, ing?.unit || '')}</strong>
                                  </span>
                                </div>
                              );
                            })}
                            <span className="xs muted">
                              Khoảng {jars} cối xay · mỗi cối ~{num(p.yield_per_jar)} chai · thêm nước cho đủ 330 ml/chai
                            </span>
                          </div>
                        </div>
                      </details>
                    );
                  })}
              </>
            )}

          </>
        )}
      </main>
      <div className="bar">
        <Link to="/tai-khoan" className="btn lg block" style={{ textDecoration: 'none' }}>Xong</Link>
      </div>
      <Nav />
    </div>
  );
}
