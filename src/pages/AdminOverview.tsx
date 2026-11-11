import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { csvDownload, exportMonthly, lastMonths, monthLabel } from '../lib/reports';
import { vndShort, vnToday } from '../lib/format';
import { Header, Icon, Loading, Nav } from '../components/ui';

/** Admin: doanh thu, chi phí, lợi nhuận của mọi cơ sở trong một tháng; danh sách chủ cơ sở. */
export default function AdminOverview() {
  const { isAdmin, outlets, selectOutlet } = useApp();
  const thisMonth = vnToday().slice(0, 7) + '-01';
  const [month, setMonth] = useState(thisMonth);
  const [busy, setBusy] = useState(false);

  const { data, loading } = useLoad(
    async () => {
      const [pnl, members] = await Promise.all([
        supabase.from('v_monthly_pnl').select('*').eq('month', month),
        supabase.rpc('fn_list_members', { p_outlet: null })
      ]);
      if (pnl.error) throw pnl.error;
      return { pnl: (pnl.data || []) as any[], owners: ((members.data || []) as any[]).filter((m) => m.role === 'owner') };
    },
    [month]
  );

  if (!isAdmin) return <Navigate to="/tai-khoan" replace />;
  const names = Object.fromEntries(outlets.map((o) => [o.id, o.name]));
  const rows = outlets.map((o) => ({ o, r: data?.pnl.find((p) => p.outlet_id === o.id) }));
  const sum = (k: string) => rows.reduce((s, x) => s + (x.r?.[k] || 0), 0);

  async function exportAll() {
    setBusy(true);
    try {
      csvDownload(await exportMonthly(outlets.map((o) => o.id), names), `Tat-ca-co-so_theo-thang_${vnToday()}.csv`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <Header title="Quản trị" back="/tai-khoan" sub={`${outlets.length} cơ sở`} />
      <main className="main">
        <div className="chips">
          {lastMonths(6, thisMonth).map((m) => (
            <button key={m} className={`chip ${month === m ? 'on' : ''}`} onClick={() => setMonth(m)}>
              {m === thisMonth ? 'Tháng này' : monthLabel(m, true)}
            </button>
          ))}
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <section className="card">
              <div className="h2">Toàn hệ thống · {monthLabel(month)}</div>
              <div className="grid3" style={{ textAlign: 'center' }}>
                <div className="kpi"><span className="l">Doanh thu</span><span className="v num" style={{ fontSize: 18 }}>{vndShort(sum('revenue_vnd'))}</span></div>
                <div className="kpi"><span className="l">Chi phí</span><span className="v num" style={{ fontSize: 18 }}>{vndShort(sum('expense_vnd'))}</span></div>
                <div className="kpi"><span className="l">Lợi nhuận</span><span className="v num" style={{ fontSize: 18 }}>{vndShort(sum('profit_vnd'))}</span></div>
              </div>
            </section>
            <section className="card tight">
              <div className="list-row xs muted" style={{ minHeight: 32 }}>
                <span className="grow">Cơ sở</span>
                <span style={{ width: 76, textAlign: 'right' }}>Doanh thu</span>
                <span style={{ width: 76, textAlign: 'right' }}>Chi phí</span>
                <span style={{ width: 76, textAlign: 'right' }}>Lợi nhuận</span>
              </div>
              {rows
                .sort((a, b) => (b.r?.revenue_vnd || 0) - (a.r?.revenue_vnd || 0))
                .map(({ o, r }) => (
                  <Link key={o.id} to="/bao-cao" onClick={() => selectOutlet(o.id)} className="list-row small" style={{ minHeight: 44 }}>
                    <span className="grow strong" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</span>
                    <span className="num" style={{ width: 76, textAlign: 'right' }}>{vndShort(r?.revenue_vnd || 0)}</span>
                    <span className="num" style={{ width: 76, textAlign: 'right' }}>{vndShort(r?.expense_vnd || 0)}</span>
                    <strong className="num" style={{ width: 76, textAlign: 'right', color: (r?.profit_vnd || 0) < 0 ? 'var(--danger)' : undefined }}>{vndShort(r?.profit_vnd || 0)}</strong>
                  </Link>
                ))}
            </section>
            <button className="btn secondary block" disabled={busy} onClick={exportAll}>
              Xuất CSV tất cả cơ sở, theo tháng
            </button>

            <section className="card tight">
              <div className="row between" style={{ padding: '12px 0 2px' }}>
                <span className="h2">Chủ cơ sở · {new Set(data!.owners.map((m) => m.email)).size}</span>
                <Link to="/nhan-vien" className="small strong" style={{ textDecoration: 'none' }}>Thêm, gỡ →</Link>
              </div>
              {data!.owners.length === 0 && <p className="small muted" style={{ padding: '4px 0 12px' }}>Chưa gán chủ cơ sở nào.</p>}
              {data!.owners.map((m) => (
                <div key={m.membership_id} className="list-row small" style={{ minHeight: 44 }}>
                  <span className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span className="strong">{m.full_name || m.email}</span>
                    <span className="xs muted">{m.email}{m.status === 'invited' ? ' · chưa đăng nhập' : ''}</span>
                  </span>
                  <span className="muted">{m.outlet_name}</span>
                </div>
              ))}
            </section>
            <Link to="/co-so" className="btn secondary block">
              <Icon name="plus" size={20} sw={2.2} /> Tạo cơ sở mới
            </Link>
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
