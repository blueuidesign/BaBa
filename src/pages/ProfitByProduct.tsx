import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useLoad } from '../lib/data';
import { fetchProfit, pct } from '../lib/profit';
import { num, vnd, vnToday, weekdayLabel } from '../lib/format';
import { Header, Icon, Loading, Nav } from '../components/ui';

/** Lãi gộp từng món trong một ngày: giá bán, chi phí gồm những gì, lãi gộp. Mở từ thẻ Lãi gộp của báo cáo ngày. */
export default function ProfitByProduct() {
  const { outlet, catalog, canManage } = useApp();
  const [sp] = useSearchParams();
  const d = sp.get('d') || vnToday();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { data, error } = useLoad((oid) => fetchProfit(oid, d, d), [d]);
  if (!outlet) return null;
  const product = (pid: string) => catalog?.allProducts.find((p) => p.id === pid);
  const gross = data ? data.revenue - data.cogs : 0;

  return (
    <div className="screen">
      <Header title="Lãi gộp từng món" sub={`${weekdayLabel(d)} · ${outlet.name}`} back="/bao-cao" />
      <main className="main">
        {!canManage ? (
          <p className="small muted">Chỉ chủ cơ sở xem được báo cáo lãi.</p>
        ) : error ? (
          <p className="err">{error}</p>
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <section className="card">
              <span className="h2">Cả ngày</span>
              <div className="pl-line"><span>Doanh thu</span><span>{vnd(data.revenue)}</span></div>
              <div className="pl-line"><span>Giá vốn {data.parts} chai</span><span>− {vnd(data.cogs)}</span></div>
              <div className="pl-total">
                <span>Lãi gộp<small>{pct(gross, data.revenue)}% doanh thu{data.parts ? ` · ${vnd(Math.round(gross / data.parts))} mỗi chai` : ''}</small></span>
                <span style={{ color: gross < 0 ? 'var(--danger)' : 'var(--ink-brand)' }}>{vnd(gross)}</span>
              </div>
            </section>
            {data.by_product.length === 0 && <p className="small muted">Ngày này chưa có đơn.</p>}
            {data.by_product.map((r) => {
              const k = `${r.product_id}:${r.container}`;
              const p = product(r.product_id);
              const price = r.qty ? Math.round(r.revenue / r.qty) : 0;
              const cost = r.detail?.total ?? null;
              const g = cost == null ? null : price - cost;
              const on = !!open[k];
              const cup = r.container === 'coc';
              return (
                <section key={k} className="card">
                  <button type="button" className="row" aria-expanded={on} disabled={cost == null} onClick={() => setOpen((o) => ({ ...o, [k]: !on }))}
                    style={{ gap: 8, width: '100%', padding: 0, border: 0, background: 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: cost == null ? 'default' : 'pointer' }}>
                    <span className="dot-color" style={{ background: p?.color || '#ddd' }} />
                    <span className="grow strong">{p?.name || 'Món đã bỏ'}{cup ? ' · cốc' : ''}</span>
                    <span className="muted small">{r.qty} {cup ? 'cốc' : 'chai'}</span>
                    {cost != null && <Icon name="chev" size={18} sw={2} style={{ color: 'var(--ink-muted)', transform: `rotate(${on ? -90 : 90}deg)` }} />}
                  </button>
                  <div className="pl-line"><span>Giá bán một {cup ? 'cốc' : 'chai'}</span><span>{vnd(price)}</span></div>
                  {cost == null ? (
                    <p className="xs" style={{ color: 'var(--warn)', margin: 0 }}>
                      {r.detail?.reason === 'no_recipe' ? 'Món này chưa có công thức nên chưa tính được chi phí.' : 'Thiếu đơn giá chuẩn của một nguyên liệu nên chưa tính được chi phí.'}
                    </p>
                  ) : (
                    <>
                      <div className="pl-line"><span>Chi phí một {cup ? 'cốc' : 'chai'}</span><span>− {vnd(cost)}</span></div>
                      {on && (
                        <>
                          {(r.detail!.items || []).map((it) => (
                            <div key={it.ingredient_id} className="pl-line sub"><span>{it.name} {num(Number(it.qty), 1)} {it.unit}</span><span>{vnd(Number(it.cost))}</span></div>
                          ))}
                          {Number(r.detail!.syrup) > 0 && <div className="pl-line sub"><span>Syrup {num(Number(r.detail!.syrup_ml))} ml</span><span>{vnd(r.detail!.syrup)}</span></div>}
                          <div className="pl-line sub">
                            <span>Bao bì {cup ? 'cốc' : 'chai'}: {(r.detail!.packaging_breakdown || []).map((b) => b.name.toLowerCase()).join(', ')}</span>
                            <span>{vnd(r.detail!.packaging)}</span>
                          </div>
                        </>
                      )}
                      <div className="pl-total">
                        <span>Lãi gộp một {cup ? 'cốc' : 'chai'}<small>{pct(g!, price)}% giá bán</small></span>
                        <span style={{ color: g! < 0 ? 'var(--danger)' : 'var(--ink-brand)' }}>{g! < 0 ? `− ${vnd(-g!)}` : vnd(g!)}</span>
                      </div>
                      <div className="pl-line"><span>Lãi gộp {r.qty} {cup ? 'cốc' : 'chai'} trong ngày</span><span style={{ color: 'var(--ink-brand)' }}>{vnd(r.revenue - (r.cogs || 0))}</span></div>
                    </>
                  )}
                </section>
              );
            })}
            <p className="xs muted">Xếp theo lãi gộp trong ngày. Bấm vào một thẻ để mở hoặc thu gọn chi phí từng thứ. Chi phí một chai tính theo công thức và đơn giá chuẩn hiện tại; giá bán là giá trung bình của các chai đã bán.</p>
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
