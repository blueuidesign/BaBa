import { useMemo, useState } from 'react';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { ddmm, num, vnd, vndShort, vnToday } from '../lib/format';
import { BellLink, Header, Loading, Nav } from '../components/ui';

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

function toCsv(rows: any[][]) {
  return '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export default function Revenue() {
  const { outlet, catalog, canManage } = useApp();
  const [range, setRange] = useState<Range>('today');
  const [picked, setPicked] = useState<string | null>(null);
  const [from, to, pFrom, pTo] = rangeOf(range);

  const { data } = useLoad(
    async (oid) => {
      const [days, prods, prev, closes] = await Promise.all([
        supabase.from('v_daily_sales').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to).order('business_date'),
        supabase.from('v_sales_by_product').select('*').eq('outlet_id', oid).gte('business_date', from).lt('business_date', to),
        supabase.from('v_daily_sales').select('revenue_vnd').eq('outlet_id', oid).gte('business_date', pFrom).lt('business_date', pTo),
        supabase.from('day_closes').select('business_date,waste_total,gift_total').eq('outlet_id', oid).eq('is_current', true).gte('business_date', from).lt('business_date', to)
      ]);
      return { days: days.data || [], prods: prods.data || [], prevRev: (prev.data || []).reduce((s: number, r: any) => s + r.revenue_vnd, 0), closes: closes.data || [] };
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
    const waste = data.closes.reduce((s: number, c: any) => s + (picked && c.business_date !== picked ? 0 : c.waste_total), 0);
    const catchup = days.reduce((s: number, d: any) => s + d.catchup_bottles, 0);
    const byProduct = new Map<string, { qty: number; rev: number }>();
    prods.forEach((r: any) => {
      const x = byProduct.get(r.product_id) || { qty: 0, rev: 0 };
      x.qty += r.qty;
      x.rev += r.revenue_vnd;
      byProduct.set(r.product_id, x);
    });
    const ranked = [...byProduct.entries()].sort((a, b) => b[1].rev - a[1].rev);
    return { revenue, bottles, gift, waste, catchup, ranked, nDays: days.length };
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

  async function exportCsv() {
    const { data: orders } = await supabase
      .from('orders')
      .select('business_date,seq_in_day,placed_at,status,is_gift,channel,total_vnd,order_lines(product_id,qty,unit_price_vnd,line_total_vnd)')
      .eq('outlet_id', outlet!.id)
      .gte('business_date', from)
      .lt('business_date', to)
      .order('placed_at');
    const rows: any[][] = [['Ngày', 'Đơn', 'Giờ', 'Trạng thái', 'Tặng', 'Kênh', 'Món', 'Số chai', 'Đơn giá', 'Thành tiền']];
    (orders || []).forEach((o: any) =>
      (o.order_lines.length ? o.order_lines : [{}]).forEach((l: any) =>
        rows.push([o.business_date, o.seq_in_day, new Date(o.placed_at).toLocaleTimeString('vi-VN'), o.status, o.is_gift ? 'có' : '', o.channel, product(l.product_id)?.name || '', l.qty ?? '', l.unit_price_vnd ?? '', l.line_total_vnd ?? ''])
      )
    );
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kho-baba-${outlet!.name}-${from}.csv`;
    a.click();
  }

  return (
    <div className="screen">
      <Header title="Doanh thu" sub={outlet.name} right={<BellLink />} />
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
              <section className="card" style={{ background: 'var(--bg-brand)', color: 'var(--ink-on-brand)', gap: 2 }}>
                <span className="small strong" style={{ opacity: 0.85 }}>{picked ? `Doanh thu ${ddmm(picked)}` : 'Doanh thu'}</span>
                <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{vndShort(view.revenue)}</span>
                <span className="xs" style={{ color: 'var(--baba-mint-tint)' }}>{delta == null || picked ? ' ' : `${delta >= 0 ? '+' : ''}${delta}% so với kỳ trước`}</span>
              </section>
              <section className="card" style={{ gap: 2 }}>
                <span className="small strong muted">Chai đã bán</span>
                <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{num(view.bottles)}</span>
                <span className="xs muted">{range === 'today' || picked ? `${view.gift} tặng` : `TB ${num(view.bottles / Math.max(1, view.nDays), 1)} chai/ngày · ${view.nDays} ngày`}</span>
              </section>
            </div>

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
              <div className="row between small"><span>Chai hủy (từ các ngày đã chốt)</span><span className="num strong">{view.waste} chai{view.bottles ? ` · ${num((view.waste / (view.bottles + view.waste)) * 100, 1)}%` : ''}</span></div>
              <div className="row between small"><span>Đơn bổ sung cuối ngày</span><span className="num strong">{view.catchup} chai</span></div>
            </section>

            {canManage && (
              <button className="btn secondary block" onClick={exportCsv}>
                Xuất Excel (CSV) {range === 'today' ? 'hôm nay' : 'cả kỳ'}
              </button>
            )}
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
