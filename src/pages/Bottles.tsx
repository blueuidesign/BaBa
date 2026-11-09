import { useApp } from '../lib/app';
import { fetchBottles, isDayClosed, useLoad } from '../lib/data';
import { ddmm, vnToday, weekdayLabel } from '../lib/format';
import { Header, Loading, Nav } from '../components/ui';

export default function Bottles() {
  const { outlet, catalog } = useApp();
  const today = vnToday();
  const { data } = useLoad(async (oid) => {
    const [rows, ydayClosed] = await Promise.all([fetchBottles(oid, today), isDayClosed(oid, vnToday(-1))]);
    return { rows, ydayClosed };
  });
  if (!outlet) return null;
  const rows = (data?.rows || []).filter((r) => r.carried || r.cooked || r.sold);
  const product = (pid: string) => catalog?.allProducts.find((p) => p.id === pid);
  const sum = (k: 'carried' | 'cooked' | 'sold' | 'left_qty') => rows.reduce((s, r) => s + r[k], 0);
  const carriedRows = rows.filter((r) => r.carried > 0);

  return (
    <div className="screen">
      <Header title="Chai đang có" back sub={`${weekdayLabel(today)} · cập nhật theo từng đơn`} />
      <main className="main">
        {!data || !catalog ? (
          <Loading />
        ) : (
          <>
            <section className="card">
              <div className="grid3" style={{ textAlign: 'center' }}>
                <div className="kpi"><span className="l">Nấu + tồn qua</span><span className="v">{sum('cooked') + sum('carried')}</span></div>
                <div className="kpi"><span className="l">Đã bán</span><span className="v">{sum('sold')}</span></div>
                <div className="kpi"><span className="l">Còn lại</span><span className="v">{sum('left_qty')}</span></div>
              </div>
              <p className="xs muted">Số còn là theo sổ. Cuối ngày đếm thật ở bước đối chiếu; chênh lệch sẽ hiện ở đó.</p>
            </section>
            {rows.length === 0 ? (
              <p className="small muted" style={{ textAlign: 'center', padding: 24 }}>Hôm nay chưa nấu và chưa có chai tồn.</p>
            ) : (
              <section className="card tight">
                {rows.map((r) => {
                  const p = product(r.product_id);
                  const total = r.carried + r.cooked;
                  return (
                    <div key={r.product_id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div className="row">
                        <span className="dot-color" style={{ background: p?.color || '#ddd' }} />
                        <span className="grow strong">{p?.name}</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: r.left_qty <= 0 ? 'var(--danger)' : undefined }} className="num">
                          {r.left_qty} <span className="xs muted">còn</span>
                        </span>
                      </div>
                      <span className="progress"><span style={{ width: `${total ? Math.max(0, (r.left_qty / total) * 100) : 0}%` }} /></span>
                      <span className="xs muted num">
                        Nấu {r.cooked}
                        {r.carried ? ` + tồn qua ${r.carried}` : ''} · đã bán {r.sold}
                      </span>
                    </div>
                  );
                })}
              </section>
            )}
            {carriedRows.length > 0 && (
              <section className="card">
                <div className="h2">Tồn qua đêm</div>
                <p className="small">Chai còn từ hôm qua, để lạnh 0–4 °C. Nên bán trước trong hôm nay.{!data.ydayClosed && ` Hôm qua (${ddmm(vnToday(-1))}) chưa chốt nên số này theo sổ, chưa đếm.`}</p>
                {carriedRows.map((r) => (
                  <div key={r.product_id} className="row between small">
                    <span>
                      {product(r.product_id)?.short_name} · {r.carried} chai
                    </span>
                    <span className="badge warn">Bán trong hôm nay</span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
