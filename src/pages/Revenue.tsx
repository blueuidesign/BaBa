import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { monthLabel } from '../lib/reports';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { ddmm, num, vnd, vndShort, vnToday } from '../lib/format';
import { BellLink, Header, Icon, Loading, Nav } from '../components/ui';

type Range = 'today' | 'month' | 'prev' | 'all';
type Mode = 'revenue' | 'bottles';

const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-01`;
/** '2026-11-01' + n tháng */
function addMonths(m: string, n: number) {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** [từ, tới (không gồm), kỳ trước từ, kỳ trước tới] */
function rangeOf(r: Range, allFrom: string, allTo: string): [string, string, string | null, string | null] {
  const today = vnToday();
  const thisMonth = today.slice(0, 7) + '-01';
  if (r === 'today') return [today, vnToday(1), vnToday(-1), today];
  if (r === 'month') return [thisMonth, addMonths(thisMonth, 1), addMonths(thisMonth, -1), thisMonth];
  if (r === 'prev') return [addMonths(thisMonth, -1), thisMonth, addMonths(thisMonth, -2), addMonths(thisMonth, -1)];
  return [allFrom, addMonths(allTo, 1), null, null];
}

type Day = { key: string; revenue: number; sold: number; gift: number; waste: number };

export default function Revenue() {
  const { outlet, catalog, canManage, isAdmin } = useApp();
  const thisMonth = vnToday().slice(0, 7) + '-01';
  const [range, setRange] = useState<Range>('today');
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('revenue');
  const [allFrom, setAllFrom] = useState<string | null>(null);
  const [allTo, setAllTo] = useState(thisMonth);

  // Tháng đầu tiên có số liệu (kể cả số nhập tay tháng cũ) để làm khung cho tab Tất cả
  const { data: firstMonth } = useLoad(async (oid) => {
    const [pnl, sales] = await Promise.all([
      canManage ? supabase.from('v_monthly_pnl').select('month').eq('outlet_id', oid).order('month').limit(1) : Promise.resolve({ data: [] as any[] }),
      supabase.from('v_daily_sales').select('business_date').eq('outlet_id', oid).order('business_date').limit(1)
    ]);
    const a = (pnl.data || [])[0]?.month as string | undefined;
    const b = ((sales.data || [])[0]?.business_date as string | undefined)?.slice(0, 7);
    const cands = [a, b && `${b}-01`].filter(Boolean) as string[];
    return cands.length ? cands.sort()[0] : thisMonth;
  });
  const monthsAvail: string[] = [];
  for (let m = firstMonth || thisMonth; m <= thisMonth; m = addMonths(m, 1)) monthsAvail.push(m);
  const aFrom = allFrom || firstMonth || thisMonth;
  const [from, to, pFrom, pTo] = rangeOf(range, aFrom, allTo < aFrom ? aFrom : allTo);

  const { data } = useLoad(
    async (oid) => {
      const monthly = range === 'month' || range === 'prev' || range === 'all';
      const [days, prods, prev, closes, pnlDay, pnlMonths] = await Promise.all([
        supabase.from('v_daily_sales').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to).order('business_date'),
        supabase.from('v_sales_by_product').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to),
        pFrom ? supabase.from('v_daily_sales').select('revenue_vnd').eq('outlet_id', oid).gte('business_date', pFrom).lt('business_date', pTo!) : Promise.resolve({ data: [] as any[] }),
        supabase.from('day_closes').select('business_date,waste_total,gift_total,day_close_lines(cooked_qty,carried_qty)').eq('outlet_id', oid).eq('is_current', true).gte('business_date', from).lt('business_date', to),
        canManage && range === 'today' ? supabase.from('v_daily_pnl').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to) : Promise.resolve({ data: [] as any[] }),
        canManage && monthly ? supabase.from('v_monthly_pnl').select('*').eq('outlet_id', oid).gte('month', from).lt('month', to).order('month') : Promise.resolve({ data: [] as any[] })
      ]);
      const src = (range === 'today' ? pnlDay.data : pnlMonths.data) || [];
      const pnl = {
        revenue_vnd: src.reduce((s: number, r: any) => s + r.revenue_vnd, 0),
        expense_vnd: src.reduce((s: number, r: any) => s + r.expense_vnd, 0),
        profit_vnd: src.reduce((s: number, r: any) => s + r.profit_vnd, 0),
        has_historical: src.some((r: any) => r.has_historical)
      };
      return {
        days: (days.data || []) as any[], prods: (prods.data || []) as any[], prevRev: (prev.data || []).reduce((s: number, r: any) => s + r.revenue_vnd, 0),
        closes: (closes.data || []) as any[], pnl, pnlMonths: (pnlMonths.data || []) as any[]
      };
    },
    [range, from, to]
  );

  // Gom theo ngày (tháng) hoặc theo tháng (tab Tất cả): đã bán, tặng, hủy, doanh thu
  const byMonth = range === 'all';
  const series = useMemo(() => {
    const keyOf = (d: string) => (byMonth ? d.slice(0, 7) + '-01' : d);
    const m = new Map<string, Day>();
    const get = (k: string) => m.get(k) || (m.set(k, { key: k, revenue: 0, sold: 0, gift: 0, waste: 0 }), m.get(k)!);
    (data?.days || []).forEach((d) => {
      const x = get(keyOf(d.business_date));
      x.revenue += d.revenue_vnd;
      x.sold += d.bottles - d.gift_bottles;
      x.gift += d.gift_bottles;
    });
    (data?.closes || []).forEach((c) => {
      const x = get(keyOf(c.business_date));
      x.gift += c.gift_total;
      x.waste += c.waste_total;
    });
    // Tab Tất cả: doanh thu tháng lấy từ báo cáo tháng để gồm cả số nhập tay tháng cũ
    if (byMonth) (data?.pnlMonths || []).forEach((p) => (get(p.month).revenue = p.revenue_vnd));
    return m;
  }, [data, byMonth]);

  const view = useMemo(() => {
    if (!data) return null;
    const rows = [...series.values()].filter((r) => !picked || r.key === picked);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const sold = rows.reduce((s, r) => s + r.sold, 0);
    const gift = rows.reduce((s, r) => s + r.gift, 0);
    const waste = rows.reduce((s, r) => s + r.waste, 0);
    const inPick = (d: string) => !picked || (byMonth ? d.slice(0, 7) + '-01' === picked : d === picked);
    const closes = data.closes.filter((c) => inPick(c.business_date));
    // Tỉ lệ hủy = chai hủy ÷ (chai nấu + chai tồn qua) của các ngày đã chốt
    const madeAvail = closes.reduce((s: number, c: any) => s + (c.day_close_lines || []).reduce((t: number, l: any) => t + l.cooked_qty + l.carried_qty, 0), 0);
    const salesDays = data.days.filter((d) => inPick(d.business_date));
    const catchup = salesDays.reduce((s, d) => s + d.catchup_bottles, 0);
    const byProduct = new Map<string, { qty: number; rev: number }>();
    data.prods.filter((r) => inPick(r.business_date)).forEach((r) => {
      const x = byProduct.get(r.product_id) || { qty: 0, rev: 0 };
      x.qty += r.qty;
      x.rev += r.revenue_vnd;
      byProduct.set(r.product_id, x);
    });
    const ranked = [...byProduct.entries()].sort((a, b) => b[1].rev - a[1].rev);
    return { revenue, sold, gift, waste, total: sold + gift + waste, madeAvail, catchup, ranked, nSalesDays: salesDays.length };
  }, [data, series, picked, byMonth]);

  if (!outlet) return null;
  const staffLimited = !canManage;
  const product = (pid: string) => catalog?.allProducts.find((p) => p.id === pid);

  // Trục ngang: mọi ngày trong tháng, hoặc mọi tháng trong khoảng đã chọn
  const slots: string[] = [];
  if (range !== 'today') {
    if (byMonth) for (let m = from; m < to; m = addMonths(m, 1)) slots.push(m);
    else for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) < to; d.setUTCDate(d.getUTCDate() + 1)) slots.push(d.toISOString().slice(0, 10));
  }
  const val = (r?: Day) => (!r ? 0 : mode === 'revenue' ? r.revenue : r.sold + r.gift + r.waste);
  const maxV = Math.max(1, ...slots.map((s) => val(series.get(s))));
  const label = (k: string) => (byMonth ? monthLabel(k, true) : ddmm(k));
  const delta = data && data.prevRev && !picked && range !== 'all' ? Math.round(((view!.revenue - data.prevRev) / data.prevRev) * 100) : null;
  const activeSlots = slots.filter((s) => {
    const r = series.get(s);
    return r && (r.revenue || r.sold || r.gift || r.waste);
  }).length;
  // Trung bình chai chỉ tính các ngày/tháng có bán (tháng nhập tay từ sổ cũ chỉ có tiền, không có chai)
  const soldSlots = slots.filter((s) => (series.get(s)?.sold || 0) > 0).length;
  const revSlots = slots.filter((s) => (series.get(s)?.revenue || 0) > 0).length;
  const avgSold = soldSlots ? slots.reduce((s, k) => s + (series.get(k)?.sold || 0), 0) / soldSlots : 0;
  const avgRev = revSlots ? slots.reduce((s, k) => s + (series.get(k)?.revenue || 0), 0) / revSlots : 0;
  const unit = byMonth ? 'tháng' : 'ngày';
  const pickedRow = picked ? series.get(picked) : undefined;
  const periodLabel = range === 'today' ? 'hôm nay' : range === 'all' ? `${monthLabel(from, true)} → ${monthLabel(addMonths(to, -1), true)}` : monthLabel(from);

  return (
    <div className="screen">
      <Header title="Báo cáo" sub={outlet.name} right={<BellLink />} />
      <main className="main">
        <div className="chips">
          {(
            [
              ['today', 'Hôm nay'],
              ['month', `Tháng ${Number(vnToday().slice(5, 7))}`],
              ['prev', 'Tháng trước'],
              ['all', 'Tất cả']
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

        {range === 'all' && (
          <div className="row" style={{ gap: 8 }}>
            <label className="field grow">
              <span className="xs muted">Từ tháng</span>
              <select className="input sm" value={aFrom} onChange={(e) => { setAllFrom(e.target.value); setPicked(null); }}>
                {monthsAvail.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
            <label className="field grow">
              <span className="xs muted">Đến tháng</span>
              <select className="input sm" value={allTo < aFrom ? aFrom : allTo} onChange={(e) => { setAllTo(e.target.value); setPicked(null); }}>
                {monthsAvail.filter((m) => m >= aFrom).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
          </div>
        )}

        {!view ? (
          <Loading />
        ) : (
          <>
            <div className="grid2">
              <section className="card" style={{ gap: 2 }}>
                <span className="small strong muted">{picked ? `Doanh thu ${label(picked)}` : 'Doanh thu'}</span>
                <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{vndShort(view.revenue)}</span>
                <span className="xs muted">{delta == null ? ' ' : `${delta >= 0 ? '+' : ''}${delta}% so với kỳ trước`}</span>
              </section>
              <section className="card" style={{ gap: 2 }}>
                <span className="small strong muted">{picked ? `Tổng số chai ${label(picked)}` : 'Tổng số chai'}</span>
                <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{num(view.total)}</span>
                <span className="xs muted">{view.sold} bán · {view.gift} tặng · {view.waste} hủy</span>
              </section>
            </div>

            {canManage && !picked && (
              <section className="card">
                <div className="row between">
                  <span className="h2">Lợi nhuận {periodLabel}</span>
                  <Link to="/chi-phi" className="small strong" style={{ textDecoration: 'none' }}>Chi phí →</Link>
                </div>
                {/* Mỗi số một dòng, ghi đủ tiền: số dài cỡ nào cũng không bị cắt */}
                <div className="row between small"><span>Doanh thu</span><span className="num strong">{vnd(data!.pnl.revenue_vnd)}</span></div>
                <div className="row between small"><span>Chi phí</span><span className="num strong">− {vnd(data!.pnl.expense_vnd)}</span></div>
                <div className="row between" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <span className="strong">Lợi nhuận</span>
                  <span className="num" style={{ fontSize: 20, fontWeight: 700, color: data!.pnl.profit_vnd < 0 ? 'var(--danger)' : 'var(--ink-brand)' }}>{vnd(data!.pnl.profit_vnd)}</span>
                </div>
                {data!.pnl.has_historical && <p className="xs muted">Có số liệu nhập tay từ sổ cũ.</p>}
                {range === 'today' && <p className="xs muted">Chi phí hôm nay gồm các khoản ghi trong ngày và tiền nhập hàng.</p>}
                {range === 'all' && (
                  <Link to="/thang-cu" className="small strong" style={{ textDecoration: 'none' }}>Nhập doanh thu, chi phí tháng cũ →</Link>
                )}
              </section>
            )}

            {range !== 'today' && (
              <section className="card">
                <div className="row between" style={{ gap: 8 }}>
                  <span className="h2">{byMonth ? 'Theo tháng' : 'Theo ngày'}</span>
                  <div className="seg sm" role="tablist" aria-label="Chế độ biểu đồ">
                    <button className={mode === 'revenue' ? 'on' : ''} onClick={() => setMode('revenue')}>Doanh thu</button>
                    <button className={mode === 'bottles' ? 'on' : ''} onClick={() => setMode('bottles')}>Số chai</button>
                  </div>
                </div>
                {activeSlots === 0 ? (
                  <p className="small muted">Chưa có số liệu trong khoảng này.</p>
                ) : (
                  <div className="bars" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }} role="img" aria-label={mode === 'revenue' ? 'Biểu đồ doanh thu' : 'Biểu đồ số chai: bán, tặng, hủy'}>
                    {slots.map((s) => {
                      const r = series.get(s);
                      const h = (v: number) => `${(v / maxV) * 100}%`;
                      const desc = r ? (mode === 'revenue' ? vnd(r.revenue) : `${r.sold} bán, ${r.gift} tặng, ${r.waste} hủy`) : 'không có';
                      return (
                        <button key={s} className={picked === s ? 'on' : ''} aria-label={`${label(s)}: ${desc}`} onClick={() => setPicked(picked === s ? null : s)}>
                          {r && mode === 'bottles' ? (
                            <>
                              {r.waste > 0 && <span className="waste" style={{ height: h(r.waste) }} />}
                              {r.gift > 0 && <span className="gift" style={{ height: h(r.gift) }} />}
                              {r.sold > 0 && <span style={{ height: h(r.sold) }} />}
                            </>
                          ) : (
                            <span style={{ height: h(val(r)), minHeight: val(r) ? 2 : 0 }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="row between xs muted">
                  <span>{label(slots[0] || from)}</span>
                  {pickedRow && (
                    <button className="strong" style={{ color: 'var(--ink)', border: 0, background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer' }} onClick={() => setPicked(null)} aria-label="Bỏ chọn, xem cả kỳ">
                      {label(picked!)}: {mode === 'revenue' ? vnd(pickedRow.revenue) : `${pickedRow.sold} bán · ${pickedRow.gift} tặng · ${pickedRow.waste} hủy`} ✕
                    </button>
                  )}
                  <span>{label(slots[slots.length - 1] || from)}</span>
                </div>
                {mode === 'bottles' && (
                  <div className="row xs muted" style={{ gap: 12 }}>
                    <span className="row" style={{ gap: 4 }}><span className="sw" style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--brand)' }} />Đã bán</span>
                    <span className="row" style={{ gap: 4 }}><span className="sw" style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gift)' }} />Tặng</span>
                    <span className="row" style={{ gap: 4 }}><span className="sw" style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--danger)' }} />Hủy</span>
                  </div>
                )}
                {activeSlots > 0 && (
                  <p className="small" style={{ margin: 0 }}>
                    Trung bình bán <strong>{num(avgSold, 1)} chai/{unit}</strong> ({soldSlots} {unit} có bán) · {vndShort(Math.round(avgRev))}/{unit}.
                  </p>
                )}
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

            {canManage && (
              <Link to="/bao-cao/xuat" className="list-row card tight" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="ico-box"><Icon name="box" size={20} /></span>
                <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="strong">Xuất file Excel (CSV)</span>
                  <span className="small muted">Đơn hàng, theo ngày, theo tháng</span>
                </span>
                <Icon name="chev" size={20} style={{ color: 'var(--ink-muted)' }} />
              </Link>
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
