import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { GROUP_COLOR, monthLabel } from '../lib/reports';
import { addDays, addMonths, rangeOf, type Range } from '../lib/period';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { ddmm, num, vnd, vndShort, vnToday } from '../lib/format';
import { BellLink, DateRange, Header, Icon, Loading, Nav } from '../components/ui';

type Mode = 'revenue' | 'bottles';

type Day = { key: string; revenue: number; sold: number; gift: number; waste: number };

const BAR_H = 116;

export default function Revenue() {
  const { outlet, catalog, canManage, isAdmin } = useApp();
  const thisMonth = vnToday().slice(0, 7) + '-01';
  const [range, setRange] = useState<Range>('day');
  const [off, setOff] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('revenue');
  // Toàn bộ: lọc từ ngày đến ngày (cả hai đầu đều tính)
  const [cust, setCust] = useState<{ f: string; t: string } | null>(null);

  // Tháng đầu tiên có số liệu (kể cả số nhập tay tháng cũ) để làm khung cho tab Tất cả
  const { data: span } = useLoad(async (oid) => {
    const [pnl, sales, last] = await Promise.all([
      canManage ? supabase.from('v_monthly_pnl').select('month').eq('outlet_id', oid).order('month').limit(1) : Promise.resolve({ data: [] as any[] }),
      supabase.from('v_daily_sales').select('business_date').eq('outlet_id', oid).order('business_date').limit(1),
      supabase.from('v_daily_sales').select('business_date').eq('outlet_id', oid).order('business_date', { ascending: false }).limit(1)
    ]);
    const a = (pnl.data || [])[0]?.month as string | undefined;
    const b = (sales.data || [])[0]?.business_date as string | undefined;
    const cands = [a, b && `${b.slice(0, 7)}-01`].filter(Boolean) as string[];
    const firstDates = [a, b].filter(Boolean) as string[];
    return {
      month: cands.length ? cands.sort()[0] : thisMonth,
      first: firstDates.length ? firstDates.sort()[0] : vnToday(),
      last: ((last.data || [])[0]?.business_date as string | undefined) || vnToday()
    };
  });
  const firstMonth = span?.month;
  // Ngày đầu và ngày cuối có dữ liệu: giá trị điền sẵn của ô Từ ngày – Đến ngày
  const dataFirst = span?.first || vnToday();
  const dataLast = span?.last || vnToday();
  const base = rangeOf(range, off, firstMonth || thisMonth);
  const custOn = range === 'all' && !!cust && cust.f <= cust.t;
  const from = custOn ? cust!.f : base[0];
  const to = custOn ? addDays(cust!.t, 1) : base[1];
  const [pFrom, pTo, rangeLabel] = [base[2], base[3], custOn ? `${ddmm(cust!.f)} – ${ddmm(cust!.t)}` : base[4]];
  const custDays = custOn ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) : 0;

  const { data } = useLoad(
    async (oid) => {
      const [days, prods, prev, closes, pnlQ, extra, pays] = await Promise.all([
        supabase.from('v_daily_sales').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to).order('business_date'),
        supabase.from('v_sales_by_product').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to),
        pFrom ? supabase.from('v_daily_sales').select('revenue_vnd').eq('outlet_id', oid).gte('business_date', pFrom).lt('business_date', pTo!) : Promise.resolve({ data: [] as any[] }),
        supabase.from('day_closes').select('business_date,waste_total,gift_total,day_close_lines(cooked_qty,carried_qty)').eq('outlet_id', oid).eq('is_current', true).gte('business_date', from).lt('business_date', to),
        // Lãi lỗ theo nhóm chi phí (view 0022). Toàn bộ: lấy từ ngày đầu
        canManage ? supabase.from('v_daily_pnl_groups').select('*').eq('outlet_id', oid).gte('business_date', range === 'all' && !custOn ? '2000-01-01' : from).lt('business_date', to) : Promise.resolve({ data: [] as any[] }),
        // Đơn có giảm giá hoặc nhập từ Knote trong kỳ
        supabase.from('orders').select('discount_vnd,source').eq('outlet_id', oid).eq('status', 'active').gte('business_date', from).lt('business_date', to).or('discount_vnd.gt.0,source.eq.import'),
        supabase.from('v_daily_payments').select('business_date,payment_method,revenue_vnd,orders_count').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to)
      ]);
      const rows = (pnlQ.data || []) as any[];
      const sum = (k: string) => rows.reduce((s: number, r: any) => s + (r[k] || 0), 0);
      const pnl = {
        revenue: sum('revenue_vnd'), nguyen_lieu: sum('nguyen_lieu'), vat_tu: sum('vat_tu'), van_hanh: sum('van_hanh'), dau_tu: sum('dau_tu'),
        has_historical: rows.some((r: any) => r.has_historical)
      };
      const ex = (extra.data || []) as any[];
      return {
        days: (days.data || []) as any[], prods: (prods.data || []) as any[], prevRev: (prev.data || []).reduce((s: number, r: any) => s + r.revenue_vnd, 0),
        closes: (closes.data || []) as any[], pnl, pnlRows: rows, pays: (pays.data || []) as any[],
        discount: ex.reduce((s, o) => s + (o.discount_vnd || 0), 0), knoteOrders: ex.filter((o) => o.source === 'import').length
      };
    },
    [range, from, to]
  );

  // Ngày mở ở màn Các đơn trong ngày: tab Ngày, hoặc ngày đang bấm chọn trên biểu đồ; không thì ngày cuối có dữ liệu
  const listDay = range === 'day' ? from : picked && !(range === 'all' && (!custOn || custDays > 62)) ? picked : dataLast;

  // Gom theo ngày (tháng) hoặc theo tháng (tab Tất cả): đã bán, tặng, hủy, doanh thu
  const byMonth = range === 'all' && (!custOn || custDays > 62);
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
    // Toàn bộ: doanh thu tháng lấy từ lãi lỗ theo ngày để gồm cả số nhập tay tháng cũ
    if (byMonth && data?.pnlRows.length) {
      const mrev = new Map<string, number>();
      data.pnlRows.forEach((p: any) => mrev.set(keyOf(p.business_date), (mrev.get(keyOf(p.business_date)) || 0) + p.revenue_vnd));
      mrev.forEach((v, k) => (get(k).revenue = v));
    }
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
    const pay = { cash: 0, transfer: 0, unknown: 0, nCash: 0, nTransfer: 0, nUnknown: 0 };
    data.pays.filter((r) => inPick(r.business_date)).forEach((r) => {
      if (r.payment_method === 'cash') { pay.cash += r.revenue_vnd; pay.nCash += r.orders_count; }
      else if (r.payment_method === 'transfer') { pay.transfer += r.revenue_vnd; pay.nTransfer += r.orders_count; }
      else { pay.unknown += r.revenue_vnd; pay.nUnknown += r.orders_count; }
    });
    return { revenue, sold, gift, waste, total: sold + gift + waste, madeAvail, catchup, ranked, nSalesDays: salesDays.length, pay };
  }, [data, series, picked, byMonth]);

  if (!outlet) return null;
  const staffLimited = !canManage;
  const product = (pid: string) => catalog?.allProducts.find((p) => p.id === pid);

  // Trục ngang: mọi ngày trong tháng, hoặc mọi tháng trong khoảng đã chọn
  const slots: string[] = [];
  if (range !== 'day') {
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
  const periodLabel = range === 'all' && !custOn ? 'toàn bộ' : rangeLabel.toLowerCase();
  const P = data?.pnl;
  const opCost = P ? P.nguyen_lieu + P.vat_tu + P.van_hanh : 0;
  const profit = P ? P.revenue - opCost : 0;
  const after = P ? profit - P.dau_tu : 0;
  const payback = P && P.dau_tu > 0 ? Math.max(0, profit / P.dau_tu) : null;
  const neg = (v: number) => (v < 0 ? 'var(--danger)' : 'var(--ink-brand)');
  const money = (v: number) => (v < 0 ? `− ${vnd(-v)}` : vnd(v));

  return (
    <div className="screen">
      <Header title="Báo cáo" sub={outlet.name} right={<BellLink />} />
      <main className="main">
        {/* 4 chip chia đều một dòng, không phải cuộn ngang */}
        <div className="chips fit4">
          {(
            [
              ['day', 'Ngày'],
              ['week', 'Tuần'],
              ['month', 'Tháng'],
              ['all', 'Toàn bộ']
            ] as [Range, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              className={`chip ${range === k ? 'on' : ''}`}
              disabled={staffLimited && k !== 'day'}
              style={staffLimited && k !== 'day' ? { opacity: 0.45 } : undefined}
              onClick={() => {
                setRange(k);
                setCust(null);
                setOff(0);
                setPicked(null);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {staffLimited && <p className="xs muted">Các kỳ khác chỉ chủ cơ sở xem được.</p>}
        {range === 'all' && !staffLimited && (
          <>
            <DateRange from={custOn ? cust!.f : dataFirst} to={custOn ? cust!.t : dataLast} max={vnToday()} onChange={(f, t) => { setPicked(null); setCust({ f, t }); }} />
            {custOn && (
              <button className="btn quiet sm" style={{ alignSelf: 'flex-start', marginTop: -6 }} onClick={() => { setCust(null); setPicked(null); }}>Đặt lại: xem toàn bộ</button>
            )}
          </>
        )}
        {range !== 'all' && (
          <div className="row between" style={{ marginTop: -6 }}>
            <button className="icon-btn" aria-label="Kỳ trước" disabled={staffLimited} onClick={() => { setOff(off - 1); setPicked(null); }}>
              <Icon name="back" size={20} sw={2} />
            </button>
            <span className="strong">{rangeLabel}</span>
            <button className="icon-btn" aria-label="Kỳ sau" disabled={off >= 0} style={off >= 0 ? { opacity: 0.3 } : undefined} onClick={() => { setOff(off + 1); setPicked(null); }}>
              <Icon name="chev" size={20} sw={2} />
            </button>
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

            {canManage && !picked && P && (
              <section className="card">
                <div className="row between">
                  <span className="h2">Lãi lỗ {periodLabel}</span>
                  <Link to="/chi-phi" className="small strong" style={{ textDecoration: 'none' }}>Chi phí →</Link>
                </div>
                {/* Mỗi số một dòng, ghi đủ tiền: số dài cỡ nào cũng không bị cắt */}
                <div className="row between small"><span>Doanh thu</span><span className="num strong">{vnd(P.revenue)}</span></div>
                <div className="row between small"><span>Chi phí vận hành</span><span className="num strong">− {vnd(opCost)}</span></div>
                {(
                  [
                    ['Nguyên liệu', P.nguyen_lieu, GROUP_COLOR.nguyen_lieu],
                    ['Vật tư tiêu hao', P.vat_tu, GROUP_COLOR.vat_tu],
                    ['Vận hành', P.van_hanh, GROUP_COLOR.van_hanh]
                  ] as [string, number, string][]
                ).map(([l, v, c]) => (
                  <div key={l} className="row between xs muted" style={{ paddingLeft: 14 }}>
                    <span className="row" style={{ gap: 6 }}><span className="sw" style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}</span>
                    <span className="num">{vnd(v)}</span>
                  </div>
                ))}
                <div className="row between" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <span className="strong">{range === 'all' ? 'Lãi lỗ trước đầu tư' : 'Lãi lỗ'}</span>
                  <span className="num" style={{ fontSize: 20, fontWeight: 700, color: neg(profit) }}>{money(profit)}</span>
                </div>
                {range === 'all' ? (
                  <>
                    <div className="row between small">
                      <span className="row" style={{ gap: 6 }}><span className="sw" style={{ width: 8, height: 8, borderRadius: 2, background: GROUP_COLOR.dau_tu }} />Đầu tư thiết bị</span>
                      <span className="num strong">− {vnd(P.dau_tu)}</span>
                    </div>
                    <div className="row between" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <span className="strong">Lãi lỗ sau đầu tư</span>
                      <span className="num" style={{ fontSize: 20, fontWeight: 700, color: neg(after) }}>{money(after)}</span>
                    </div>
                    {payback != null && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'var(--bg-200)', borderRadius: 'var(--radius-md)' }}>
                        <div className="row between small"><span>Đã thu hồi vốn thiết bị</span><strong className="num">{num(payback * 100, 0)}%</strong></div>
                        <span className="progress"><span style={{ width: `${Math.min(100, payback * 100)}%`, background: GROUP_COLOR.dau_tu }} /></span>
                        <span className="xs muted">Lãi trước đầu tư {vnd(Math.max(0, profit))} ÷ đầu tư {vnd(P.dau_tu)}. Đạt 100% là đã lấy lại đủ tiền mua thiết bị.</span>
                      </div>
                    )}
                  </>
                ) : (
                  P.dau_tu > 0 && <p className="xs muted">Kỳ này có thêm {vnd(P.dau_tu)} đầu tư thiết bị, không trừ vào lãi kỳ. Xem ở Toàn bộ.</p>
                )}
                {P.has_historical && <p className="xs muted">Có số liệu nhập tay từ sổ cũ.</p>}
                {data!.knoteOrders > 0 && <p className="xs muted">Gồm {data!.knoteOrders} đơn chép từ Knote (trước khi dùng app).</p>}
                {range === 'all' && (
                  <Link to="/thang-cu" className="small strong" style={{ textDecoration: 'none' }}>Nhập doanh thu, chi phí tháng cũ →</Link>
                )}
              </section>
            )}

            {range !== 'day' && (
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
                  // Vẽ bằng SVG: cột dựng bằng <button> + flex không hiện trên Safari iPhone
                  <svg className="bars-svg" viewBox={`0 0 ${slots.length * 10} ${BAR_H + 4}`} preserveAspectRatio="none" width="100%" height={BAR_H + 4} role="img" aria-label={mode === 'revenue' ? 'Biểu đồ doanh thu' : 'Biểu đồ số chai: bán, tặng, hủy'}>
                    {slots.map((s, i) => {
                      const r = series.get(s);
                      const h = (v: number) => (v > 0 ? Math.max(2, Math.round((v / maxV) * BAR_H)) : 0);
                      const on = picked === s;
                      const parts: [number, string][] = r && mode === 'bottles'
                        ? [[h(r.sold), 'var(--brand)'], [h(r.gift), 'var(--gift)'], [h(r.waste), 'var(--danger)']]
                        : [[h(val(r)), 'var(--brand)']];
                      let y = BAR_H + 4;
                      return (
                        <g key={s} onClick={() => setPicked(on ? null : s)} style={{ cursor: 'pointer' }}>
                          <rect x={i * 10} y={0} width={10} height={BAR_H + 4} fill="transparent" />
                          {parts.map(([ph, col], k) => {
                            if (!ph) return null;
                            y -= ph;
                            return <rect key={k} x={i * 10 + 1.5} y={y} width={7} height={ph} fill={col} opacity={on ? 1 : k === 0 ? 0.55 : 0.8} />;
                          })}
                        </g>
                      );
                    })}
                  </svg>
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
              {!picked && data!.discount > 0 && (
                <p className="xs muted">Tiền theo món tính theo giá niêm yết. Kỳ này có giảm giá {vnd(data!.discount)} ở cấp đơn, đã trừ trong doanh thu.</p>
              )}
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

            <section className="card">
              <div className="h2">Tiền mặt và chuyển khoản</div>
              <div className="row between small"><span>Tiền mặt <span className="muted">· {view.pay.nCash} đơn</span></span><span className="num strong">{vnd(view.pay.cash)}</span></div>
              <div className="row between small"><span>Chuyển khoản <span className="muted">· {view.pay.nTransfer} đơn</span></span><span className="num strong">{vnd(view.pay.transfer)}</span></div>
              {view.pay.nUnknown > 0 && (
                <div className="row between small"><span>Chưa ghi cách nhận tiền <span className="muted">· {view.pay.nUnknown} đơn</span></span><span className="num strong">{vnd(view.pay.unknown)}</span></div>
              )}
              <p className="xs muted">Tính theo đơn đã đánh dấu sau khi lưu. Đơn tặng không tính.</p>
            </section>

            <Link to={`/bao-cao/don?d=${listDay}`} className="list-row card tight" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="ico-box"><Icon name="cart" size={20} /></span>
              <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="strong">Các đơn ngày {ddmm(listDay)}</span>
                <span className="small muted">Từng đơn: giờ, khách, món, cách nhận tiền</span>
              </span>
              <Icon name="chev" size={20} style={{ color: 'var(--ink-muted)' }} />
            </Link>

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
