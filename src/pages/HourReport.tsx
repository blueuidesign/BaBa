import { Fragment, useMemo, useState } from 'react';
import { useApp } from '../lib/app';
import { useLoad } from '../lib/data';
import { supabase } from '../lib/supabase';
import { addDays } from '../lib/period';
import { ddmm, num, vnToday, weekdayLabel } from '../lib/format';
import { BellLink, Header, Loading, Nav } from '../components/ui';
import { ReportTabs } from '../components/ReportTabs';

type Span = '4w' | 'month' | 'all';
const DN = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const SLOTS: [string, number, number][] = [['5–7 giờ', 5, 7], ['7–9 giờ', 7, 9], ['9–11 giờ', 9, 11], ['11–13 giờ', 11, 13], ['13–17 giờ', 13, 17], ['17–19 giờ', 17, 19], ['19–22 giờ', 19, 22]];
const BIG = 10;
// Giờ Việt Nam của một mốc thời gian
const vnHour = (ts: string) => (new Date(ts).getUTCHours() + 7) % 24;
const dow = (d: string) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Bán theo giờ và theo thứ: khách mua lúc nào, để biết nấu bao nhiêu và đứng bán giờ nào. */
export default function HourReport() {
  const { outlet, canManage } = useApp();
  const [span, setSpan] = useState<Span>('month');
  const [noBig, setNoBig] = useState(false);
  const today = vnToday();
  const from = span === '4w' ? addDays(today, -27) : span === 'month' ? today.slice(0, 7) + '-01' : '2000-01-01';

  const { data } = useLoad(
    async (oid) => {
      const rows: any[] = [];
      for (let off = 0; ; off += 1000) {
        const { data: got } = await supabase.from('orders').select('id,business_date,placed_at,customer_name,order_lines(qty)')
          .eq('outlet_id', oid).eq('status', 'active').gte('business_date', from).lte('business_date', today).order('business_date').order('id').range(off, off + 999);
        rows.push(...(got || []));
        if (!got || got.length < 1000) break;
      }
      return rows.map((o) => ({ d: o.business_date as string, h: vnHour(o.placed_at), name: (o.customer_name as string) || '', qty: (o.order_lines || []).reduce((s: number, l: any) => s + l.qty, 0) as number }));
    },
    [from]
  );

  const v = useMemo(() => {
    if (!data) return null;
    const all = data.filter((o) => o.qty > 0);
    const big = all.filter((o) => o.qty >= BIG).sort((a, b) => b.qty - a.qty);
    const rows = noBig ? all.filter((o) => o.qty < BIG) : all;
    const total = rows.reduce((s, o) => s + o.qty, 0);
    const days = new Set(rows.map((o) => o.d));
    const byDow = DN.map((_, i) => {
      const ds = new Set(rows.filter((o) => dow(o.d) === i).map((o) => o.d));
      const q = rows.filter((o) => dow(o.d) === i).reduce((s, o) => s + o.qty, 0);
      return { n: ds.size, avg: ds.size ? q / ds.size : 0 };
    });
    const grid = SLOTS.map(([, a, b]) => DN.map((_, i) => rows.filter((o) => dow(o.d) === i && o.h >= a && o.h < b).reduce((s, o) => s + o.qty, 0)));
    const slotTot = grid.map((r) => r.reduce((s, x) => s + x, 0));
    const top = slotTot.indexOf(Math.max(...slotTot));
    const before10 = rows.filter((o) => o.h < 10).reduce((s, o) => s + o.qty, 0);
    const first = rows.length ? rows[0].d : null;
    return { total, nDays: days.size, byDow, grid, slotTot, top, before10, big, bigQty: big.reduce((s, o) => s + o.qty, 0), allQty: all.reduce((s, o) => s + o.qty, 0), first, mx: Math.max(1, ...grid.flat()), mxAvg: Math.max(1, ...byDow.map((x) => x.avg)) };
  }, [data, noBig]);

  if (!outlet) return null;
  return (
    <div className="screen">
      <Header title="Báo cáo" sub={outlet.name} right={<BellLink />} />
      <main className="main">
        <ReportTabs active="hours" staffLimited={!canManage} />
        <div className="chips">
          {([['4w', '4 tuần'], ['month', 'Tháng này'], ['all', 'Tất cả']] as [Span, string][]).map(([k, l]) => (
            <button key={k} className={`chip ${span === k ? 'on' : ''}`} onClick={() => setSpan(k)}>{l}</button>
          ))}
        </div>
        {!v ? (
          <Loading />
        ) : v.total === 0 ? (
          <p className="small muted">Chưa có đơn trong khoảng này.</p>
        ) : (
          <>
            <section className="card">
              <span className="h2">{v.first ? `${ddmm(v.first)} – ${ddmm(today)}` : ''} · {v.nDays} ngày · {num(v.total)} chai</span>
              <div className="pl-line"><span>Đông nhất</span><span>{SLOTS[v.top][0]} · {num(v.slotTot[v.top])} chai ({Math.round((v.slotTot[v.top] / v.total) * 100)}%)</span></div>
              <div className="pl-line"><span>Bán trước 10 giờ</span><span>{Math.round((v.before10 / v.total) * 100)}% số chai</span></div>
            </section>
            <section className="card">
              <span className="h2">Trung bình mỗi ngày theo thứ</span>
              <div className="vbars" role="img" aria-label="Số chai trung bình mỗi ngày theo thứ">
                {v.byDow.map((x, i) => (
                  <span key={i}>{x.n ? num(x.avg, 1) : ''}<i style={{ height: `${(x.avg / v.mxAvg) * 80}%` }} /></span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, textAlign: 'center' }} className="xs strong muted">
                {DN.map((n) => <span key={n}>{n}</span>)}
              </div>
              <p className="xs muted">Số ngày có bán của từng thứ: {v.byDow.map((x, i) => `${DN[i]} ${x.n}`).join(' · ')}. Thứ nào mới có 1–2 ngày thì chưa nên kết luận.</p>
            </section>
            <section className="card">
              <div className="row between" style={{ gap: 8 }}>
                <span className="h2">Số chai theo khung giờ</span>
                <span className="row small muted" style={{ gap: 6 }}>Bỏ đơn lớn<button type="button" className={`switch ${noBig ? 'on' : ''}`} role="switch" aria-checked={noBig} aria-label="Bỏ đơn lớn" onClick={() => setNoBig((x) => !x)} /></span>
              </div>
              <div className="heat">
                <span />
                {DN.map((n) => <span key={n} className="hh">{n}</span>)}
                {SLOTS.map(([lb], r) => (
                  <Fragment key={r}>
                    <span className="hl">{lb}</span>
                    {v.grid[r].map((q, c) => {
                      const o = q ? 0.12 + (0.88 * q) / v.mx : 0;
                      return <span key={`${r}-${c}`} className="cell" style={q ? { background: `rgba(41,98,65,${o.toFixed(2)})`, color: o > 0.55 ? '#fff' : 'var(--ink)' } : undefined}>{q || ''}</span>;
                    })}
                  </Fragment>
                ))}
              </div>
              <p className="xs muted">Ô càng đậm bán càng nhiều. Số là tổng chai trong kỳ, tính theo giờ ghi đơn. Đơn ghi bù cuối ngày sẽ rơi vào giờ ghi, không phải giờ bán.</p>
            </section>
            {v.big.length > 0 && (
              <section className="card">
                <span className="h2">Đơn lớn (từ {BIG} chai) · {v.big.length} đơn · {num(v.bigQty)} chai · {Math.round((v.bigQty / v.allQty) * 100)}%</span>
                {v.big.slice(0, 5).map((o, i) => (
                  <div key={i} className="pl-line"><span>{weekdayLabel(o.d)} · {String(o.h).padStart(2, '0')} giờ{o.name ? ` · ${o.name}` : ''}</span><span>{o.qty} chai</span></div>
                ))}
                <p className="xs muted">Đơn lớn thường là đặt trước, không phải khách tới mua lúc đó. Bật "Bỏ đơn lớn" để xem riêng khách mua lẻ.</p>
              </section>
            )}
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
