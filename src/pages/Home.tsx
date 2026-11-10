import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { fetchBottles, fetchDaySales, fetchStock, useLoad } from '../lib/data';
import { ddmm, timeHM, vnd, vnToday, weekdayLabel } from '../lib/format';
import { BellLink, Icon, Loading, Nav, Header } from '../components/ui';

function Task({ icon, title, sub, to, kind }: { icon: string; title: string; sub: string; to: string; kind?: string }) {
  return (
    <Link to={to} className="list-row">
      <span className={`ico-box ${kind || ''}`}>
        <Icon name={icon} size={20} />
      </span>
      <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="strong">{title}</span>
        <span className="small muted">{sub}</span>
      </span>
      <Icon name="chev" size={20} style={{ color: 'var(--ink-muted)' }} />
    </Link>
  );
}

export default function Home() {
  const { outlet, profile, catalog } = useApp();
  const today = vnToday();
  const yesterday = vnToday(-1);

  const { data, loading } = useLoad(async (oid) => {
    const [sales, bottles, stock, recent, closes, ydayOrders] = await Promise.all([
      fetchDaySales(oid, today),
      fetchBottles(oid, today),
      fetchStock(oid),
      supabase
        .from('orders')
        .select('id,seq_in_day,placed_at,total_vnd,is_gift,channel,order_lines(qty,product_id)')
        .eq('outlet_id', oid)
        .eq('business_date', today)
        .eq('status', 'active')
        .order('placed_at', { ascending: false })
        .limit(3),
      supabase.from('day_closes').select('business_date').eq('outlet_id', oid).eq('is_current', true).in('business_date', [today, yesterday]),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('outlet_id', oid).eq('business_date', yesterday).eq('status', 'active')
    ]);
    return { sales, bottles, stock, recent: recent.data || [], closed: new Set((closes.data || []).map((c: any) => c.business_date)), ydayCount: ydayOrders.count || 0 };
  });

  if (!outlet) return null;
  const nameOf = (pid: string) => catalog?.allProducts.find((p) => p.id === pid)?.short_name || '';
  const initial = (profile?.full_name || profile?.email || '?').trim()[0]?.toUpperCase();

  const header = (
    <Header
      title={outlet.name}
      sub={weekdayLabel(today)}
      right={
        <>
          <BellLink />
          <Link to="/tai-khoan" className="avatar" aria-label="Tài khoản">
            {initial}
          </Link>
        </>
      }
    />
  );

  if (loading && !data)
    return (
      <div className="screen">
        {header}
        <Loading />
        <Nav />
      </div>
    );
  if (!data) return null;

  const left = data.bottles.reduce((s, b) => s + b.left_qty, 0);
  const cooked = data.bottles.reduce((s, b) => s + b.cooked, 0);
  const carried = data.bottles.reduce((s, b) => s + b.carried, 0);
  const needs = data.stock.filter((s) => s.needs_order);
  const bySupplier = new Map<string, string[]>();
  needs.forEach((s) => bySupplier.set(s.supplier_name || 'Chưa gán nhà cung cấp', [...(bySupplier.get(s.supplier_name || 'Chưa gán nhà cung cấp') || []), s.name]));
  const expiring = data.stock.filter((s) => s.expiring);
  const hour = new Date(Date.now() + 7 * 3600000).getUTCHours();
  const fresh = cooked === 0 && data.sales.bottles === 0;

  const tasks: React.ReactElement[] = [];
  if (data.ydayCount > 0 && !data.closed.has(yesterday))
    tasks.push(<Task key="y" icon="scale" kind="warn" title={`Chưa đối chiếu ${ddmm(yesterday)}`} sub="Tồn qua đang lấy theo số sổ, chưa đếm" to={`/doi-chieu?ngay=${yesterday}`} />);
  [...bySupplier.entries()].forEach(([sup, items]) =>
    tasks.push(<Task key={sup} icon="truck" kind="warn" title={`Nên đặt: ${sup}`} sub={items.join(', ')} to="/kho" />)
  );
  expiring.forEach((s) => tasks.push(<Task key={s.ingredient_id} icon="warn" kind="warn" title={`${s.name} sắp hết hạn`} sub={`Hạn ${ddmm(s.nearest_expiry!)}`} to={s.kind === 'made' ? '/nau/me' : `/kho/${s.ingredient_id}`} />));
  if (data.sales.bottles > 0 && !data.closed.has(today))
    tasks.push(<Task key="c" icon="scale" title="Đối chiếu cuối ngày" sub="Đếm chai còn và tiền thu được" to="/doi-chieu" />);
  if (hour >= 15) tasks.push(<Task key="p" icon="blender" title="Kế hoạch nấu ngày mai" sub="Gợi ý theo 7 ngày gần nhất" to="/nau" />);

  return (
    <div className="screen">
      {header}
      <main className="main">
        {fresh ? (
          <section className="card" style={{ padding: 20 }}>
            <div className="empty" style={{ padding: '8px 0 4px' }}>
              <span className="circle">
                <Icon name="sprout" size={28} />
              </span>
              <strong>Ngày mới chưa có gì để ghi</strong>
              <span className="small muted">
                {carried > 0 ? `Hôm qua còn ${carried} chai đã chuyển sang hôm nay. ` : ''}Ghi mẻ nấu sáng nay để kho và số chai đúng trước khi bán.
              </span>
            </div>
            <Link to="/nau" className="btn block">
              <Icon name="blender" size={20} sw={2} /> Ghi mẻ nấu sáng nay
            </Link>
            {carried > 0 && (
              <Link to="/ban" className="btn secondary block">
                Bán chai tồn trước
              </Link>
            )}
          </section>
        ) : (
          <section className="card" style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16 }}>
              <div className="stat">
                <div className="l">Đã bán hôm nay</div>
                <div className="v">{data.sales.bottles} chai</div>
                <div className="small muted">
                  {vnd(data.sales.revenue_vnd)} · {data.sales.orders_count} đơn
                </div>
              </div>
              <span className="divider" />
              <div className="stat">
                <div className="l">Còn trên quầy</div>
                <div className="v">{left} chai</div>
                <div className="small muted">
                  nấu {cooked} · tồn qua {carried}
                </div>
              </div>
            </div>
            <Link to="/kho/chai" className="small strong" style={{ textDecoration: 'none' }}>
              Xem chai đang có theo món →
            </Link>
          </section>
        )}

        <Link to="/ban" className={`btn lg block ${fresh ? 'secondary' : ''}`}>
          <Icon name="cart" size={22} sw={2} /> Ghi đơn mới
        </Link>

        <section className="card tight">
          <div className="h2" style={{ padding: '12px 0 2px' }}>Việc hôm nay</div>
          {tasks.length ? (
            tasks
          ) : (
            <div className="list-row">
              <span className="ico-box">
                <Icon name="check" size={20} />
              </span>
              <span className="small muted">Kho đủ dùng, không có việc nào cần làm ngay.</span>
            </div>
          )}
        </section>

        {data.recent.length > 0 && (
          <section className="card tight">
            <div className="h2" style={{ padding: '12px 0 2px' }}>Đơn gần đây</div>
            {data.recent.map((o: any) => (
              <div key={o.id} className="list-row" style={{ minHeight: 44 }}>
                <span className="small muted num" style={{ width: 44 }}>{timeHM(o.placed_at)}</span>
                <span className="grow">
                  {o.order_lines.map((l: any) => `${l.qty} ${nameOf(l.product_id)}`).join(' · ')}
                  {o.is_gift ? ' · tặng' : o.channel === 'aggregate' ? ' · bổ sung' : ''}
                </span>
                <span className="strong num">{vnd(o.total_vnd)}</span>
              </div>
            ))}
          </section>
        )}
      </main>
      <Nav />
    </div>
  );
}
