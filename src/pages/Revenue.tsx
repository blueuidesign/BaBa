import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { csvDownload, exportDaily, exportMonthly, exportOrders, monthLabel } from '../lib/reports';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { ddmm, num, vnd, vndShort, vnToday } from '../lib/format';
import { BellLink, Header, Icon, Loading, Nav } from '../components/ui';

type Range = 'today' | 'month' | 'prev';

function rangeOf(r: Range): [string, string, string, string] {
  const today = vnToday();
  const [y, m] = today.split('-').map(Number);
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pp = prevM === 1 ? [prevY - 1, 12] : [prevY, prevM - 1];
  if (r === 'today') return [today, vnToday(1), vnToday(-1), today];
  if (r === 'month') return [first(y, m), first(nextY, nextM), first(prevY, prevM), first(y, m)];
  return [first(prevY, prevM), first(y, m), first(pp[0], pp[1]), first(prevY, prevM)];
}

export default function Revenue() {
  const { outlet, catalog, canManage, isAdmin } = useApp();
  const [csvMonth, setCsvMonth] = useState(vnToday().slice(0, 7));
  const [csvBusy, setCsvBusy] = useState(false);
  const [range, setRange] = useState<Range>('today');
  const [picked, setPicked] = useState<string | null>(null);
  const [from, to, pFrom, pTo] = rangeOf(range);

  const { data } = useLoad(
    async (oid) => {
      const monthFrom = range === 'today' ? from.slice(0, 7) + '-01' : from;
      const [days, prods, prev, closes, pnlDay, pnlMonth, months] = await Promise.all([
        supabase.from('v_daily_sales').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to).order('business_date'),
        supabase.from('v_sales_by_product').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to),
        supabase.from('v_daily_sales').select('revenue_vnd').eq('outlet_id', oid).gte('business_date', pFrom).lt('business_date', pTo),
        supabase.from('day_closes').select('business_date,waste_total,gift_total,day_close_lines(cooked_qty,carried_qty)').eq('outlet_id', oid).eq('is_current', true).gte('business_date', from).lt('business_date', to),
        canManage ? supabase.from('v_daily_pnl').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to) : Promise.resolve({ data: [] as any[] }),
        canManage && range !== 'today' ? supabase.from('v_monthly_pnl').select('*').eq('outlet_id', oid).eq('month', monthFrom).maybeSingle() : Promise.resolve({ data: null as any }),
        canManage ? supabase.from('v_monthly_pnl').select('*').eq('outlet_id', oid).order('month', { ascending: false }).limit(12) : Promise.resolve({ data: [] as any[] })
      ]);
      const dayPnl = (pnlDay.data || []) as any[];
      const pnl = range === 'today' || !pnlMonth.data
        ? {
            revenue_vnd: dayPnl.reduce((s, r) => s + r.revenue_vnd, 0),
            expense_vnd: dayPnl.reduce((s, r) => s + r.expense_vnd, 0),
            profit_vnd: dayPnl.reduce((s, r) => s + r.profit_vnd, 0),
            historical_revenue_vnd: 0,
            has_historical: false
          }
        : (pnlMonth.data as any);
      return {
        days: days.data || [], prods: prods.data || [], prevRev: (prev.data || []).reduce((s: number, r: any) => s + r.revenue_vnd, 0),
        closes: closes.data || [], pnl, months: (months.data || []) as any[]
      };
    },
    [range]
  );

  const view = useMemo(() => {
    if (!data) return null;
    const days = picked ? data.days.filter((d: any) => d.business_date === picked) : data.days;
    const prods = picked ? data.prods.filter((d: any) => d.business_date === picked) : data.prods;
    const revenue = days.reduce((s: number, d: any) => s + d.revenue_vnd, 0);
    const bottles = days.reduce((s: number, d: any) => s + d.bottles, 0);
    const gift = days.reduce((s: number, d: any) => s + d.gift_bottles, 0) + data.closes.reduce((s: number, c: any) => s + (picked && c.business_date !== picked ? 0 : c.gift_total), 0);
    const closes = data.closes.filter((c: any) => !picked || c.business_date === picked);
    const waste = closes.reduce((s: number, c: any) => s + c.waste_total, 0);
    // Tỉ lệ hủy = chai hủy ÷ (chai nấu + chai tồn qua) của các ngày đã chốt
    const madeAvail = closes.reduce((s: number, c: any) => s + (c.day_close_lines || []).reduce((t: number, l: any) => t + l.cooked_qty + l.carried_qty, 0), 0);
    const catchup = days.reduce((s: number, d: any) => s + d.catchup_bottles, 0);
    const byProduct = new Map<string, { qty: number; rev: number }>();
    prods.forEach((r: any) => {
      const x = byProduct.get(r.product_id) || { qty: 0, rev: 0 };
      x.qty += r.qty;
      x.rev += r.revenue_vnd;
      byProduct.set(r.product_id, x);
    });
    const ranked = [...byProduct.entries()].sort((a, b) => b[1].rev - a[1].rev);
    return { revenue, bottles, gift, waste, madeAvail, catchup, ranked, nDays: days.length };
  }, [data, picked]);

  if (!outlet) return null;
  const staffLimited = !canManage;
  const product = (pid: string) => catalog?.allProducts.find((p) => p.id === pid);

  // Biểu đồ: mọi ngày trong khoảng
  const allDays: string[] = [];
  if (range !== 'today') {
    for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) < to; d.setUTCDate(d.getUTCDate() + 1)) allDays.push(d.toISOString().slice(0, 10));
  }
  const byDay = new Map((data?.days || []).map((d: any) => [d.business_date, d]));
  const maxB = Math.max(1, ...((data?.days || []) as any[]).map((d) => d.bottles));
  const delta = data && data.prevRev ? Math.round(((view!.revenue - data.prevRev) / data.prevRev) * 100) : null;

  async function runCsv(kind: 'orders' | 'monthly' | 'daily') {
    setCsvBusy(true);
    try {
      const name = outlet!.name;
      if (kind === 'orders') csvDownload(await exportOrders(outlet!.id, from, to, product), `Don-hang_${name}_${from}.csv`);
      if (kind === 'monthly') csvDownload(await exportMonthly([outlet!.id], { [outlet!.id]: name }), `Theo-thang_${name}.csv`);
      if (kind === 'daily') csvDownload(await exportDaily(outlet!.id, csvMonth), `Theo-ngay_${name}_${csvMonth}.csv`);
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div className="screen">
      <Header title="Báo cáo" sub={outlet.name} right={<BellLink />} />
      <main className="main">
        <div className="chips">
          {(
            [
              ['today', 'Hôm nay'],
              ['month', `Tháng ${Number(vnToday().slice(5, 7))}`],
              ['prev', 'Tháng trước']
            ] as [Range, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              className={`chip ${range === k ? 'on' : ''}`}
              disabled={staffLimited && k !== 'today'}
              style={staffLimited && k !== 'today' ? { opacity: 0.45 } : undefined}
              onClick={() => {
                setRange(k);
                setPicked(null);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {staffLimited && <p className="xs muted">Các kỳ khác chỉ chủ cơ sở xem được.</p>}
        {!view ? (
          <Loading />
        ) : (
          <>
            <div className="grid2">
              <section className="card" style={{ gap: 2 }}>
                <span className="small strong muted">{picked ? `Doanh thu ${ddmm(picked)}` : 'Doanh thu'}</span>
                <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{vndShort(view.revenue)}</span>
                <span className="xs muted">{delta == null || picked ? ' ' : `${delta >= 0 ? '+' : ''}${delta}% so với kỳ trước`}</span>
              </section>
              <section className="card" style={{ gap: 2 }}>
                <span className="small strong muted">Chai đã bán</span>
                <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{num(view.bottles)}</span>
                <span className="xs muted">{range === 'today' || picked ? `${view.gift} tặng` : `TB ${num(view.bottles / Math.max(1, view.nDays), 1)} chai/ngày · ${view.nDays} ngày`}</span>
              </section>
            </div>

            {canManage && !picked && (
              <section className="card">
                <div className="row between">
                  <span className="h2">Lợi nhuận {range === 'today' ? 'hôm nay' : monthLabel(from)}</span>
                  <Link to="/chi-phi" className="small strong" style={{ textDecoration: 'none' }}>Chi phí →</Link>
                </div>
                <div className="grid3" style={{ textAlign: 'center' }}>
                  <div className="kpi"><span className="l">Doanh thu</span><span className="v num" style={{ fontSize: 18 }}>{vndShort(data!.pnl.revenue_vnd)}</span></div>
                  <div className="kpi"><span className="l">Chi phí</span><span className="v num" style={{ fontSize: 18 }}>{vndShort(data!.pnl.expense_vnd)}</span></div>
                  <div className="kpi">
                    <span className="l">Lợi nhuận</span>
                    <span className="v num" style={{ fontSize: 18, color: data!.pnl.profit_vnd < 0 ? 'var(--danger)' : undefined }}>{vndShort(data!.pnl.profit_vnd)}</span>
                  </div>
                </div>
                {data!.pnl.has_historical && <p className="xs muted">Có số liệu nhập tay cho tháng này (từ sổ cũ).</p>}
                {range === 'today' && <p className="xs muted">Chi phí hôm nay gồm các khoản ghi trong ngày và tiền nhập hàng.</p>}
              </section>
            )}

            {range !== 'today' && (
              <section className="card">
                <div className="row between">
                  <span className="h2">Chai theo ngày</span>
                  <span className="xs muted">{picked ? <button className="btn quiet" style={{ minHeight: 24 }} onClick={() => setPicked(null)}>Cả kỳ</button> : 'Bấm cột để xem ngày'}</span>
                </div>
                {data!.days.length === 0 ? (
                  <p className="small muted">Chưa có đơn trong khoảng này.</p>
                ) : (
                  <div className="bars" style={{ gridTemplateColumns: `repeat(${allDays.length}, minmax(0, 1fr))` }} role="img" aria-label="Biểu đồ số chai bán theo ngày">
                    {allDays.map((d) => {
                      const b = (byDay.get(d) as any)?.bottles || 0;
                      return (
                        <button key={d} className={picked === d ? 'on' : ''} aria-label={`${ddmm(d)}: ${b} chai`} onClick={() => setPicked(d)}>
                          <span style={{ height: `${(b / maxB) * 100}%`, minHeight: b ? 2 : 0 }} />
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="row between xs muted">
                  <span>{ddmm(from)}</span>
                  {picked && <span>{ddmm(picked)}: {(byDay.get(picked) as any)?.bottles || 0} chai · {vnd((byDay.get(picked) as any)?.revenue_vnd || 0)}</span>}
                  <span>{ddmm(allDays[allDays.length - 1] || from)}</span>
                </div>
              </section>
            )}

            <section className="card">
              <div className="h2">Theo món</div>
              {view.ranked.length === 0 && <p className="small muted">Chưa có đơn trong khoảng này.</p>}
              {view.ranked.map(([pid, x]) => {
                const p = product(pid);
                const top = view.ranked[0][1].rev || 1;
                return (
                  <div key={pid} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="row small">
                      <span className="dot-color" style={{ background: p?.color || '#ddd' }} />
                      <span className="grow strong">{p?.name}</span>
                      <span className="muted">{x.qty} chai</span>
                      <strong className="num" style={{ minWidth: 84, textAlign: 'right' }}>{vndShort(x.rev)}</strong>
                    </div>
                    <span className="progress"><span style={{ width: `${(x.rev / top) * 100}%` }} /></span>
                  </div>
                );
              })}
            </section>

            <section className="card">
              <div className="h2">Tặng, hủy, bổ sung</div>
              <div className="row between small"><span>Chai tặng, dùng thử</span><span className="num strong">{view.gift} chai</span></div>
              <div className="row between small"><span>Chai hủy (từ các ngày đã chốt)</span><span className="num strong">{view.waste} chai{view.madeAvail ? ` · ${num((view.waste / view.madeAvail) * 100, 1)}%` : ''}</span></div>
              <p className="xs muted">Tỉ lệ hủy = chai hủy ÷ (chai nấu + chai tồn qua) của các ngày đã chốt.</p>
              <div className="row between small"><span>Đơn bổ sung cuối ngày</span><span className="num strong">{view.catchup} chai</span></div>
            </section>

            {canManage && data!.months.length > 0 && (
              <section className="card tight">
                <div className="row between" style={{ padding: '12px 0 4px' }}>
                  <span className="h2">Theo tháng</span>
                  <Link to="/thang-cu" className="small strong" style={{ textDecoration: 'none' }}>Nhập tháng cũ →</Link>
                </div>
                <div className="list-row xs muted" style={{ minHeight: 32 }}>
                  <span style={{ width: 64 }}>Tháng</span>
                  <span className="grow" style={{ textAlign: 'right' }}>Doanh thu</span>
                  <span style={{ width: 84, textAlign: 'right' }}>Chi phí</span>
                  <span style={{ width: 84, textAlign: 'right' }}>Lợi nhuận</span>
                </div>
                {data!.months.map((m: any) => (
                  <div key={m.month} className="list-row small" style={{ minHeight: 40 }}>
                    <span style={{ width: 64 }} className="strong">{monthLabel(m.month, true)}</span>
                    <span className="grow num" style={{ textAlign: 'right' }}>{vndShort(m.revenue_vnd)}</span>
                    <span className="num" style={{ width: 84, textAlign: 'right' }}>{vndShort(m.expense_vnd)}</span>
                    <strong className="num" style={{ width: 84, textAlign: 'right', color: m.profit_vnd < 0 ? 'var(--danger)' : undefined }}>{vndShort(m.profit_vnd)}</strong>
                  </div>
                ))}
              </section>
            )}

            {canManage && data!.months.length === 0 && (
              <Link to="/thang-cu" className="list-row card tight" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="ico-box"><Icon name="history" size={20} /></span>
                <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="strong">Nhập doanh thu, chi phí tháng cũ</span>
                  <span className="small muted">Chuyển số từ sổ cũ để thống kê đủ các tháng</span>
                </span>
                <Icon name="chev" size={20} style={{ color: 'var(--ink-muted)' }} />
              </Link>
            )}

            {canManage && (
              <section className="card">
                <div className="h2">Xuất file Excel (CSV)</div>
                <p className="xs muted">Không gồm đơn đã hoàn tác. Mở bằng Excel hoặc Google Sheets.</p>
                <button className="btn secondary block" disabled={csvBusy} onClick={() => runCsv('orders')}>
                  Đơn hàng · {range === 'today' ? 'hôm nay' : monthLabel(from)}
                </button>
                <button className="btn secondary block" disabled={csvBusy} onClick={() => runCsv('monthly')}>
                  Theo tháng · doanh thu, chi phí, lợi nhuận
                </button>
                <div className="row" style={{ gap: 8 }}>
                  <label className="input-wrap" style={{ width: 150 }}>
                    <input type="month" value={csvMonth} max={vnToday().slice(0, 7)} onChange={(e) => setCsvMonth(e.target.value)} aria-label="Tháng xuất theo ngày" style={{ textAlign: 'left', fontSize: 15 }} />
                  </label>
                  <button className="btn secondary grow" disabled={csvBusy || !csvMonth} onClick={() => runCsv('daily')}>
                    Theo ngày
                  </button>
                </div>
              </section>
            )}

            {isAdmin && (
              <Link to="/quan-tri" className="btn secondary block">
                Báo cáo tất cả cơ sở
              </Link>
            )}
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
