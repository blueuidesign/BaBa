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
    const [sales, stock, recent, closes, cashOpen] = await Promise.all([
      fetchDaySales(oid, today),
      fetchStock(oid),
      supabase
        .from('orders')
        .select('id,seq_in_day,placed_at,total_vnd,is_gift,channel,order_lines(qty,product_id,container)')
        .eq('outlet_id', oid)
        .eq('business_date', today)
        .eq('status', 'active')
        .order('placed_at', { ascending: false })
        .limit(5),
      supabase.from('day_ends').select('id').eq('outlet_id', oid).eq('business_date', today).eq('status', 'active').limit(1),
      supabase.from('cash_opens').select('amount_vnd').eq('outlet_id', oid).eq('business_date', today).order('created_at', { ascending: false }).limit(1)
    ]);
    // Gợi ý tiền đầu ngày: số tiền mặt đếm được trong hộp ở lần ghi cuối ngày gần nhất
    let cashHint: { amount: number; date: string } | null = null;
    if (!(cashOpen.data || []).length) {
      const { data: last } = await supabase.from('day_ends').select('business_date,cash_counted_vnd')
        .eq('outlet_id', oid).eq('status', 'active').lt('business_date', today).not('cash_counted_vnd', 'is', null).order('business_date', { ascending: false }).limit(1);
      if (last?.[0]) cashHint = { amount: last[0].cash_counted_vnd || 0, date: last[0].business_date };
    }
    return {
      cashHint,
      sales, stock, recent: recent.data || [],
      ended: (closes.data || []).length > 0,
      cashOpen: (cashOpen.data || [])[0]?.amount_vnd as number | undefined
    };
  });

  if (!outlet) return null;
  const nameOf = (pid: string) => catalog?.allProducts.find((p) => p.id === pid)?.short_name || '';

  const header = (
    <Header
      title={outlet.name}
      sub={weekdayLabel(today)}
      right={<BellLink />}
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

  const needs = data.stock.filter((s) => s.needs_order);
  const supplierCount = new Set(needs.map((s) => s.supplier_id || 'none')).size;
  const expiring = data.stock.filter((s) => s.expiring);
  const hour = new Date(Date.now() + 7 * 3600000).getUTCHours();
  const fresh = data.sales.bottles === 0 && !data.sales.gift_orders_count;

  const tasks: React.ReactElement[] = [];
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
  if (data.sales.bottles > 0 && !data.ended)
    tasks.push(<Task key="c" icon="scale" title="Ghi cuối ngày" sub="Chai hủy, chai tồn, kiểm tiền. Không ghi cũng không sao." to="/cuoi-ngay" />);

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
              <strong>Hôm nay chưa có đơn nào</strong>
              <span className="small muted">Bán chai đầu tiên thì ghi đơn. Kho tự trừ nguyên liệu và bao bì theo từng đơn.</span>
            </div>
            <Link to="/ban" className="btn block">
              <Icon name="plus" size={20} sw={2} /> Ghi đơn
            </Link>
          </section>
        ) : (
          <section className="card" style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16 }}>
              <div className="stat">
                <div className="l">Đã bán hôm nay</div>
                <div className="v">{data.sales.bottles} chai</div>
                <div className="small muted">
                  {data.sales.orders_count + (data.sales.gift_orders_count || 0)} đơn
                  {data.sales.gift_orders_count ? ` · ${data.sales.gift_orders_count} tặng` : ''}
                </div>
              </div>
              <span className="divider" />
              <div className="stat">
                <div className="l">Doanh thu</div>
                <div className="v">{vnd(data.sales.revenue_vnd)}</div>
                <div className="small muted">{data.ended ? 'Đã ghi cuối ngày' : 'Chưa ghi cuối ngày'}</div>
              </div>
            </div>
          </section>
        )}

        {!data.ended && (
          <button
            className="list-row card tight"
            style={{ border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => {
              setCashIn(data.cashOpen != null ? String(data.cashOpen) : data.cashHint && data.cashHint.amount > 0 ? String(data.cashHint.amount) : '');
              setCashErr(null);
              setCashSheet(true);
            }}
          >
            <span className="ico-box"><Icon name="coin" size={20} /></span>
            <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="strong">Tiền đầu ngày</span>
              <span className="small muted">{data.cashOpen != null ? `${vnd(data.cashOpen)} trong hộp lúc mở bán` : data.cashHint && data.cashHint.amount > 0 ? `Chưa lưu. Ngày ${ddmm(data.cashHint.date)} đếm được ${vnd(data.cashHint.amount)}, bấm để kiểm lại và lưu.` : 'Chưa nhập. Nhập để cuối ngày app tự trừ ra.'}</span>
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
            <div className="row between" style={{ padding: '12px 0 2px' }}>
              <span className="h2">Đơn gần đây</span>
              <Link to="/hoa-don" className="small strong" style={{ color: 'var(--ink-brand)', textDecoration: 'none', minHeight: 32, display: 'inline-flex', alignItems: 'center' }}>Tất cả</Link>
            </div>
            {data.recent.map((o: any) => (
              <Link key={o.id} to={`/bao-cao/don/${o.id}?from=home`} className="list-row" style={{ minHeight: 48, textDecoration: 'none', color: 'inherit' }}
                aria-label={`Đơn lúc ${timeHM(o.placed_at)}, ${vnd(o.total_vnd)}. Mở chi tiết`}>
                <span className="small muted num" style={{ width: 44 }}>{timeHM(o.placed_at)}</span>
                <span className="grow">
                  {/* gộp dòng cùng món, cùng bao bì (dòng ít đường tách riêng trong sổ) */}
                  {[...o.order_lines.reduce((m: Map<string, any>, l: any) => {
                    const k = `${l.product_id}-${l.container}`;
                    return m.set(k, { ...l, qty: (m.get(k)?.qty || 0) + l.qty });
                  }, new Map<string, any>()).values()].map((l: any) => `${l.qty} ${nameOf(l.product_id)}${l.container === 'coc' ? ' (cốc)' : ''}`).join(' · ')}
                  {o.is_gift ? ' · tặng' : o.channel === 'aggregate' ? ' · bổ sung' : ''}
                </span>
                <span className="strong num">{vnd(o.total_vnd)}</span>
                <Icon name="chev" size={18} style={{ color: 'var(--ink-muted)' }} />
              </Link>
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
            {data.cashOpen == null && data.cashHint && data.cashHint.amount > 0 && (
              <div className="alert warn small" role="note">
                <Icon name="warn" size={18} sw={2} />
                <span>Điền sẵn {vnd(data.cashHint.amount)}: đây là tổng tiền mặt đếm được lúc ghi cuối ngày {ddmm(data.cashHint.date)}. Số này chưa được lưu. Đếm lại, sửa nếu khác, rồi bấm Lưu để ghi tiền đầu ngày.</span>
              </div>
            )}
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
