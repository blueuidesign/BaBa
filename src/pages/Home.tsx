import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { errorText, supabase } from '../lib/supabase';
import { fetchBottles, fetchDaySales, fetchStock, useLoad } from '../lib/data';
import { ddmm, timeHM, uuid, vnd, vnToday, weekdayLabel } from '../lib/format';
import { BellLink, Icon, Loading, MoneyInput, Nav, Header } from '../components/ui';

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
  const { outlet, profile, catalog, bump } = useApp();
  const [cashSheet, setCashSheet] = useState(false);
  const [cashIn, setCashIn] = useState('');
  const [cashErr, setCashErr] = useState<string | null>(null);
  const today = vnToday();
  const yesterday = vnToday(-1);

  const { data, loading } = useLoad(async (oid) => {
    const [sales, bottles, stock, recent, closes, ydayOrders, cashOpen] = await Promise.all([
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
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('outlet_id', oid).eq('business_date', yesterday).eq('status', 'active'),
      supabase.from('cash_opens').select('amount_vnd').eq('outlet_id', oid).eq('business_date', today).order('created_at', { ascending: false }).limit(1)
    ]);
    return {
      sales, bottles, stock, recent: recent.data || [],
      closed: new Set((closes.data || []).map((c: any) => c.business_date)), ydayCount: ydayOrders.count || 0,
      cashOpen: (cashOpen.data || [])[0]?.amount_vnd as number | undefined
    };
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
  const supplierCount = new Set(needs.map((s) => s.supplier_id || 'none')).size;
  const expiring = data.stock.filter((s) => s.expiring);
  const hour = new Date(Date.now() + 7 * 3600000).getUTCHours();
  const fresh = cooked === 0 && data.sales.bottles === 0;

  const tasks: React.ReactElement[] = [];
  if (data.ydayCount > 0 && !data.closed.has(yesterday))
    tasks.push(<Task key="y" icon="scale" kind="warn" title={`Chưa đối chiếu ${ddmm(yesterday)}`} sub="Tồn qua đang lấy theo số sổ, chưa đếm" to={`/doi-chieu?ngay=${yesterday}`} />);
  if (needs.length)
    tasks.push(
      <Task
        key="need"
        icon="truck"
        kind="warn"
        title={`Nên đặt ${needs.length} vật tư${supplierCount > 1 ? ` · ${supplierCount} nhà cung cấp` : ''}`}
        sub={needs.slice(0, 4).map((s) => s.name).join(', ') + (needs.length > 4 ? '…' : '')}
        to="/kho?loc=can-dat"
      />
    );
  expiring.forEach((s) => tasks.push(<Task key={s.ingredient_id} icon="warn" kind="warn" title={`${s.name} sắp hết hạn`} sub={`Hạn ${ddmm(s.nearest_expiry!)}`} to={s.kind === 'made' ? '/nau/me' : `/kho/${s.ingredient_id}`} />));
  if (data.sales.bottles > 0 && !data.closed.has(today))
    tasks.push(<Task key="c" icon="scale" title="Đối chiếu cuối ngày" sub="Đếm chai còn và tiền thu được" to="/doi-chieu" />);
  if (hour >= 15) tasks.push(<Task key="p" icon="blender" title="Kế hoạch nấu ngày mai" sub="Gợi ý theo 7 ngày gần nhất" to="/nau?tab=mai" />);

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
                  {vnd(data.sales.revenue_vnd)} · {data.sales.orders_count + (data.sales.gift_orders_count || 0)} đơn
                  {data.sales.gift_orders_count ? ` · ${data.sales.gift_orders_count} tặng` : ''}
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

        <Link to="/nau" className="list-row card">
          <span className="ico-box"><Icon name="blender" size={22} /></span>
          <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="strong">Nấu</span>
            <span className="small muted">Kế hoạch nấu, ghi mẻ đã nấu, mẻ syrup</span>
          </span>
          <Icon name="chev" size={20} style={{ color: 'var(--ink-muted)' }} />
        </Link>

        {!data.closed.has(today) && (
          <button
            className="list-row card tight"
            style={{ border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => {
              setCashIn(data.cashOpen != null ? String(data.cashOpen) : '');
              setCashErr(null);
              setCashSheet(true);
            }}
          >
            <span className="ico-box"><Icon name="coin" size={20} /></span>
            <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="strong">Tiền đầu ngày</span>
              <span className="small muted">{data.cashOpen != null ? `${vnd(data.cashOpen)} trong hộp lúc mở bán` : 'Chưa nhập. Nhập để cuối ngày app tự trừ ra.'}</span>
            </span>
            <span className="small strong" style={{ color: 'var(--ink-brand)' }}>{data.cashOpen != null ? 'Sửa' : 'Nhập'}</span>
          </button>
        )}

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
      {cashSheet && (
        <>
          <div className="sheet-back" onClick={() => setCashSheet(false)} />
          <div className="sheet" role="dialog" aria-label="Tiền đầu ngày">
            <strong style={{ fontSize: 17 }}>Tiền đầu ngày</strong>
            <span className="small muted">Số tiền có sẵn trong hộp trước khi bán (tiền lẻ để thối). Cuối ngày bạn có thể đếm cả hộp, app tự trừ số này.</span>
            <MoneyInput value={cashIn} onChange={setCashIn} label="Tiền đầu ngày" big />
            {cashErr && <span className="err">{cashErr}</span>}
            <button
              className="btn lg block"
              disabled={cashIn === ''}
              onClick={async () => {
                const { error } = await supabase.rpc('fn_set_cash_open', { p: { outlet_id: outlet.id, client_id: uuid(), amount_vnd: Number(cashIn) } });
                if (error) return setCashErr(errorText(error));
                setCashSheet(false);
                bump();
              }}
            >
              Lưu tiền đầu ngày
            </button>
          </div>
        </>
      )}
    </div>
  );
}
